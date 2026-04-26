"""Refinitiv StreetEvents XML transcript parser.

Pure-Python parser — no LLM calls. Handles the XML structure described in
the TranscriptsDatafeedGuide, extracting metadata, splitting presentation
from Q&A, and mapping speaker roles.
"""

import re
import xml.etree.ElementTree as ET
from datetime import datetime
from typing import Optional

from backend.schemas.transcript import (
    TranscriptData,
    TranscriptMetadata,
    Utterance,
)

_SECTION_SEP = "=" * 50  # at least 50 '='
_SPEAKER_SEP = "-" * 50  # at least 50 '-'

_CEO_KEYWORDS = {"ceo", "chief executive", "chairman", "president"}
_CFO_KEYWORDS = {"cfo", "chief financial", "finance", "treasurer"}


def _parse_date_string(raw: str) -> str:
    """Convert Refinitiv date strings to ISO 8601.

    Handles formats like:
      'Thursday, October 30, 2025 at 10:45:22am GMT'
      '27-Oct-05 3:30pm GMT'
    """
    raw = raw.strip()
    for fmt in (
        "%A, %B %d, %Y at %I:%M:%S%p %Z",
        "%A, %B %d, %Y at %I:%M:%S%p",
        "%d-%b-%y %I:%M%p %Z",
        "%d-%b-%y %I:%M%p",
    ):
        try:
            dt = datetime.strptime(raw, fmt)
            return dt.isoformat()
        except ValueError:
            continue
    return raw


def _extract_year(raw: str) -> Optional[int]:
    m = re.search(r"\b(\d{4})\b", raw)
    if m:
        return int(m.group(1))
    m = re.search(r"\b(\d{2})\b", raw)
    if m:
        yr = int(m.group(1))
        return 2000 + yr if yr < 70 else 1900 + yr
    return None


def _classify_role(name: str, title: str) -> str:
    lower_name = name.lower()
    lower_title = title.lower()

    if lower_name.strip() == "operator" or lower_title.strip() == "operator":
        return "Operator"
    if "analyst" in lower_title:
        return "Analyst"
    if any(kw in lower_title for kw in _CFO_KEYWORDS):
        return "CFO"
    if any(kw in lower_title for kw in _CEO_KEYWORDS):
        return "CEO"
    if any(kw in lower_name for kw in _CFO_KEYWORDS):
        return "CFO"
    if any(kw in lower_name for kw in _CEO_KEYWORDS):
        return "CEO"
    return "Unknown"


def _parse_section_utterances(
    text: str, section: str
) -> list[Utterance]:
    """Parse a presentation or QA text block into Utterance objects."""
    utterances: list[Utterance] = []
    lines = text.split("\n")

    current_speaker = ""
    current_title = ""
    current_text_lines: list[str] = []
    utterance_index = 0
    in_utterance = False

    i = 0
    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        if re.match(r"^-{10,}$", stripped):
            if in_utterance and current_text_lines:
                body = " ".join(current_text_lines).strip()
                if body:
                    role = _classify_role(current_speaker, current_title)
                    utterances.append(
                        Utterance(
                            index=utterance_index,
                            speaker_name=current_speaker.strip(),
                            speaker_role=role,
                            section=section,
                            text=body,
                        )
                    )
                    utterance_index += 1
                current_text_lines = []

            i += 1
            if i >= len(lines):
                break

            speaker_line = lines[i].strip()
            if not speaker_line:
                i += 1
                continue

            # Check for speaker header with [N] index marker
            idx_match = re.search(r"\[(\d+)\]\s*$", speaker_line)
            if idx_match:
                speaker_part = speaker_line[: idx_match.start()].strip()
            else:
                speaker_part = speaker_line

            if "," in speaker_part:
                parts = speaker_part.split(",", 1)
                current_speaker = parts[0].strip()
                current_title = parts[1].strip() if len(parts) > 1 else ""
            else:
                current_speaker = speaker_part
                current_title = ""

            # Skip the next separator line
            i += 1
            if i < len(lines) and re.match(r"^-{10,}$", lines[i].strip()):
                i += 1

            in_utterance = True
            current_text_lines = []
            continue

        if in_utterance:
            if stripped:
                current_text_lines.append(stripped)

        i += 1

    if in_utterance and current_text_lines:
        body = " ".join(current_text_lines).strip()
        if body:
            role = _classify_role(current_speaker, current_title)
            utterances.append(
                Utterance(
                    index=utterance_index,
                    speaker_name=current_speaker.strip(),
                    speaker_role=role,
                    section=section,
                    text=body,
                )
            )

    return utterances


def _get_text(element: Optional[ET.Element]) -> Optional[str]:
    if element is None:
        return None
    text = (element.text or "").strip()
    return text if text else None


def parse_transcript(xml_content: str, is_prior_quarter: bool = False) -> TranscriptData:
    """Parse a Refinitiv StreetEvents XML transcript into TranscriptData."""
    root = ET.fromstring(xml_content)

    event_id = root.get("Id", "")
    last_update_raw = root.get("lastUpdate", "")
    event_type_id = root.get("eventTypeId", "")

    story = root.find("EventStory")
    if story is None:
        raise ValueError("No EventStory element found in XML")

    action = story.get("action", "")
    if action == "delete":
        raise ValueError(
            f"Transcript action is 'delete' (Event {event_id}). "
            "Cannot process deleted transcripts."
        )

    expiration_date_raw = story.get("expirationDate", "")

    body_el = story.find("Body")
    body_text = body_el.text if body_el is not None else ""

    company_name = _get_text(root.find("companyName")) or ""
    company_ticker = (_get_text(root.find("companyTicker")) or "").strip()
    start_date = _get_text(root.find("startDate")) or ""
    cusip = _get_text(root.find("CUSIP"))
    isin = _get_text(root.find("ISIN"))

    ric_el = root.find("Ric")
    ric = _get_text(ric_el) if ric_el is not None else None

    last_update_year = _extract_year(last_update_raw)
    expiration_year = _extract_year(expiration_date_raw)
    same_year_check = (
        last_update_year == expiration_year
        if last_update_year and expiration_year
        else False
    )

    event_date = _parse_date_string(expiration_date_raw) if expiration_date_raw else _parse_date_string(start_date)

    # Split body into presentation and Q&A sections
    qa_split_pattern = re.compile(
        r"={10,}\s*\n\s*Questions\s+and\s+Answers\s*\n\s*-{10,}",
        re.IGNORECASE,
    )
    qa_match = qa_split_pattern.search(body_text)

    if qa_match:
        presentation_raw = body_text[: qa_match.start()]
        qa_raw = body_text[qa_match.end() :]
    else:
        presentation_raw = body_text
        qa_raw = ""

    # Strip header sections (Corporate Participants, Conference Call Participants)
    # from the presentation block — find the actual "Presentation" section
    pres_section_match = re.search(
        r"={10,}\s*\n\s*Presentation\s*\n\s*-{10,}",
        presentation_raw,
        re.IGNORECASE,
    )
    if pres_section_match:
        presentation_raw = presentation_raw[pres_section_match.end() :]

    presentation_utterances = _parse_section_utterances(presentation_raw, "Presentation")
    qa_utterances = _parse_section_utterances(qa_raw, "QA")

    # Re-index utterances globally
    all_utterances: list[Utterance] = []
    for idx, u in enumerate(presentation_utterances + qa_utterances):
        all_utterances.append(u.model_copy(update={"index": idx}))

    presentation_text = " ".join(u.text for u in all_utterances if u.section == "Presentation")
    qa_text = " ".join(u.text for u in all_utterances if u.section == "QA")

    metadata = TranscriptMetadata(
        event_id=event_id,
        company_name=company_name,
        company_ticker=company_ticker,
        ric=ric,
        cusip=cusip,
        isin=isin,
        event_type_id=event_type_id,
        event_date=event_date,
        last_update=_parse_date_string(last_update_raw),
        expiration_date=_parse_date_string(expiration_date_raw),
        same_year_check=same_year_check,
    )

    return TranscriptData(
        metadata=metadata,
        utterances=all_utterances,
        presentation_text=presentation_text,
        qa_text=qa_text,
        is_prior_quarter=is_prior_quarter,
    )
