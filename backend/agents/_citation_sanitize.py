"""Shared citation-sanitization helpers for LLM agent outputs.

The Gemini-class models we use sometimes drop `utterance_index` and `quote`
from `EvidenceCitation`-shaped dicts, or they put the quoted text into a
synonym key like `text`, `snippet`, or `excerpt`. A single missing field is
enough to nuke a whole agent's Pydantic validation, so every agent that
produces citations runs its raw LLM payload through `sanitize_citation`
before hitting `model_validate`.

The recovery strategy is, in order:

  1. Pull the quote out of any known synonym key.
  2. Pull the utterance index out of any known synonym key.
  3. If the index is still missing, locate the quote inside the parsed
     transcript utterances by case-insensitive substring match (speaker-
     aware so we never grab a quote from the wrong speaker's mouth).
  4. If both quote and index recovery fail, return ``None`` — the caller
     should drop the citation and emit a `pipeline_warning` so the missing
     evidence is surfaced in the Methodology drawer's caveats.
"""

from __future__ import annotations

import re
from typing import Any, Iterable, Optional

UtteranceLookup = list[tuple[int, str, str]]  # (index, speaker_name, normalized_text)

_QUOTE_KEYS = ("quote", "text", "snippet", "excerpt", "passage", "evidence")
_INDEX_KEYS = ("utterance_index", "index", "utterance_id", "uttr_index", "id")


def _normalize_text(s: str) -> str:
    return re.sub(r"\s+", " ", s or "").strip().lower()


def build_utterance_lookup(utterances: Iterable[dict[str, Any]]) -> UtteranceLookup:
    """Pre-tokenize transcript utterances for downstream `_best_match_index` calls."""
    out: UtteranceLookup = []
    for u in utterances:
        try:
            out.append((int(u["index"]), str(u.get("speaker_name", "")), _normalize_text(u.get("text", ""))))
        except Exception:
            continue
    return out


def _best_match_index(quote: str, speaker: str, lookup: UtteranceLookup) -> Optional[int]:
    """Find the first utterance whose normalized text contains a long-enough
    sub-string of the quote (and prefer matches whose speaker_name overlaps
    the citation's `speaker`)."""
    q = _normalize_text(quote)
    if not q or len(q) < 12:
        return None

    pivot = q[: min(len(q), 80)]
    speaker_norm = (speaker or "").strip().lower()

    speaker_first = sorted(
        lookup,
        key=lambda row: 0 if speaker_norm and speaker_norm in row[1].lower() else 1,
    )

    for idx, _spk, txt in speaker_first:
        if pivot in txt:
            return idx

    if len(q) >= 30:
        snippet = q[:30]
        for idx, _spk, txt in speaker_first:
            if snippet in txt:
                return idx
    return None


def sanitize_citation(
    raw: Any,
    lookup: UtteranceLookup,
    section_hint: str = "Presentation",
) -> Optional[dict[str, Any]]:
    """Patch a single citation dict to satisfy the `EvidenceCitation` schema.

    Returns ``None`` when the dict cannot be salvaged — caller should drop
    the citation and add a `pipeline_warning`.
    """
    if not isinstance(raw, dict):
        return None

    speaker = str(raw.get("speaker") or raw.get("speaker_name") or "").strip() or "Unknown"

    quote: Optional[str] = None
    for key in _QUOTE_KEYS:
        v = raw.get(key)
        if isinstance(v, str) and v.strip():
            quote = v.strip()
            break
    if not quote:
        return None

    section = str(raw.get("section") or section_hint or "Presentation").strip() or "Presentation"

    utterance_index: Optional[int] = None
    for key in _INDEX_KEYS:
        v = raw.get(key)
        if isinstance(v, int):
            utterance_index = v
            break
        if isinstance(v, str) and v.lstrip("-").isdigit():
            utterance_index = int(v)
            break

    if utterance_index is None:
        utterance_index = _best_match_index(quote, speaker, lookup)

    if utterance_index is None:
        return None

    return {
        "speaker": speaker[:120],
        "section": section[:80],
        "utterance_index": max(0, utterance_index),
        "quote": quote[:600],
    }


def sanitize_citation_list(
    items: Any,
    lookup: UtteranceLookup,
    section_hint: str = "Presentation",
) -> tuple[list[dict[str, Any]], int]:
    """Batch helper. Returns (sanitized, dropped_count)."""
    if not isinstance(items, list):
        return [], 0
    cleaned: list[dict[str, Any]] = []
    dropped = 0
    for raw in items:
        out = sanitize_citation(raw, lookup, section_hint)
        if out is None:
            dropped += 1
        else:
            cleaned.append(out)
    return cleaned, dropped
