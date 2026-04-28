"""Smoke test for the guidance citation sanitizer.

Reproduces the failure mode from the in-app error: the LLM emits citation
objects that drop `utterance_index` and `quote`, sometimes putting the
quoted text into `text` or `snippet` instead. The sanitizer should:
  - rename common synonyms to `quote`,
  - recover `utterance_index` by string-matching the quote to a real
    utterance,
  - drop the citation when neither side can be salvaged,
  - allow Pydantic validation to pass on the patched payload.
"""

from backend.agents.agent_05_guidance import _sanitize_guidance_payload
from backend.schemas.guidance import GuidanceCatalysts


UTTERANCES = [
    {
        "index": 12,
        "speaker_name": "David Zinsner",
        "speaker_role": "CFO",
        "section": "Presentation",
        "text": (
            "We continue to see strong demand from our server end markets, "
            "with hyperscaler customers extending visibility into 2027."
        ),
    },
    {
        "index": 18,
        "speaker_name": "David Zinsner",
        "speaker_role": "CFO",
        "section": "QA",
        "text": (
            "We have customers secured for the new packaging capacity through "
            "the second half of 2026."
        ),
    },
    {
        "index": 24,
        "speaker_name": "Lip-Bu Tan",
        "speaker_role": "CEO",
        "section": "QA",
        "text": "We expect 18A to ramp in the first half of 2027.",
    },
]


def main() -> None:
    payload = {
        "explicit_guidance": [],
        "implicit_signals": [
            {
                "topic": "Server demand",
                "claim_type": "fact",
                "evidence_citations": [
                    # Missing utterance_index and quote, has alt 'text' key:
                    {
                        "speaker": "David Zinsner",
                        "section": "Presentation",
                        "text": "strong demand from our server end markets",
                    },
                ],
            },
            {
                "topic": "Customer visibility",
                "claim_type": "inference",
                "evidence_citations": [
                    # Has neither utterance_index nor any quote synonym -> drop
                    {"speaker": "David Zinsner", "section": "QA"},
                ],
            },
        ],
        "catalysts": [
            {
                "description": "18A ramp in first half of 2027",
                "timeline": "1H 2027",
                "magnitude_est": "high",
                "confidence": 0.7,
                "claim_type": "fact",
                "evidence_citations": [
                    # snippet synonym + missing index -> recoverable
                    {
                        "speaker": "Lip-Bu Tan",
                        "section": "QA",
                        "snippet": "ramp in the first half of 2027",
                    },
                ],
                "invalidation_triggers": ["yield issues"],
                "expected_impact_magnitude": "high",
                "probability": 0.6,
            },
        ],
        "surprise_gap_score": 0.3,
        "surprise_gap_methodology": {
            "metric": "surprise_gap_score",
            "scale": "0-1",
            "inputs": ["analyst_questions", "answer_specificity"],
            "heuristic": "Heuristic gap between question depth and answer specificity.",
        },
    }

    cleaned, warnings = _sanitize_guidance_payload(payload, UTTERANCES)

    print(f"Sanitizer warnings: {len(warnings)}")
    for w in warnings:
        print(f"  - {w}")

    impl0_cits = cleaned["implicit_signals"][0]["evidence_citations"]
    impl1_cits = cleaned["implicit_signals"][1]["evidence_citations"]
    cat0_cits = cleaned["catalysts"][0]["evidence_citations"]

    assert len(impl0_cits) == 1, f"impl0 should retain 1 citation, got {len(impl0_cits)}"
    assert impl0_cits[0]["utterance_index"] == 12, impl0_cits
    assert impl0_cits[0]["quote"] == "strong demand from our server end markets"

    assert len(impl1_cits) == 0, f"impl1 should drop the empty citation, got {impl1_cits}"

    assert len(cat0_cits) == 1
    assert cat0_cits[0]["utterance_index"] == 24, cat0_cits
    assert cat0_cits[0]["quote"] == "ramp in the first half of 2027"

    parsed = GuidanceCatalysts.model_validate(cleaned)
    print(
        f"Validation OK | implicit_signals={len(parsed.implicit_signals)} | "
        f"catalysts={len(parsed.catalysts)}"
    )


if __name__ == "__main__":
    main()
