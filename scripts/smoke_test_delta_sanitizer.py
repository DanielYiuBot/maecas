"""Smoke test for the pairwise delta citation sanitizer.

Reproduces the failure mode from the in-app error: the LLM emits
PairwiseDelta.topic_deltas[].supporting_citations[] without
`utterance_index` or `quote`, sometimes substituting a `text` synonym.
The sanitizer should recover the index via transcript matching, drop
unsalvageable citations with a pipeline warning, and let Pydantic validate.
"""

from backend.agents.agent_06_delta import _sanitize_pairwise_payload
from backend.schemas.delta import PairwiseDelta


CURRENT_UTTERANCES = [
    {
        "index": 5,
        "speaker_name": "Jensen Huang",
        "speaker_role": "CEO",
        "section": "Presentation",
        "text": "We have engineers in place to scale up compute capacity through 2026.",
    },
    {
        "index": 11,
        "speaker_name": "Colette Kress",
        "speaker_role": "CFO",
        "section": "QA",
        "text": "Margins should stabilize over the long term as we shift mix.",
    },
    {
        "index": 17,
        "speaker_name": "Colette Kress",
        "speaker_role": "CFO",
        "section": "Presentation",
        "text": "Our non-GAAP results came in ahead of guidance.",
    },
]


def main() -> None:
    payload = {
        "prior_event_date": "2025-08-15",
        "topic_deltas": [
            {
                "topic": "Compute scaling",
                "novelty_status": "new",
                "sentiment_delta": 0.4,
                "supporting_citations": [
                    {
                        "speaker": "Jensen Huang",
                        "section": "Presentation",
                        "text": "engineers in place to scale up compute",
                    },
                ],
            },
            {
                "topic": "Long-term margins",
                "novelty_status": "repeated",
                "sentiment_delta": 0.1,
                "supporting_citations": [
                    {
                        "speaker": "Colette Kress",
                        "section": "QA",
                        "snippet": "stabilize over the long term",
                    },
                ],
            },
            {
                "topic": "Non-GAAP results",
                "novelty_status": "repeated",
                "sentiment_delta": 0.2,
                "supporting_citations": [
                    {"speaker": "Colette Kress", "section": "Presentation"},
                ],
            },
        ],
        "signal_novelty": [],
        "new_risk_keywords": [],
        "guidance_specificity_delta": 0,
        "language_drift": {
            "added_phrases": ["scale up compute"],
            "removed_phrases": [],
            "hedging_drift": 0.0,
            "certainty_drift": 0.0,
        },
        "confidence": 0.7,
    }

    cleaned, warnings = _sanitize_pairwise_payload(payload, CURRENT_UTTERANCES)

    print(f"Sanitizer warnings: {len(warnings)}")
    for w in warnings:
        print(f"  - {w}")

    topic_0 = cleaned["topic_deltas"][0]["supporting_citations"]
    topic_1 = cleaned["topic_deltas"][1]["supporting_citations"]
    topic_2 = cleaned["topic_deltas"][2]["supporting_citations"]

    assert len(topic_0) == 1 and topic_0[0]["utterance_index"] == 5, topic_0
    assert topic_0[0]["quote"] == "engineers in place to scale up compute"
    assert len(topic_1) == 1 and topic_1[0]["utterance_index"] == 11, topic_1
    assert topic_1[0]["quote"] == "stabilize over the long term"
    assert len(topic_2) == 0, f"unsalvageable stub should be dropped, got {topic_2}"

    parsed = PairwiseDelta.model_validate(cleaned)
    print(
        f"PairwiseDelta OK | topic_deltas={len(parsed.topic_deltas)} | "
        f"citations preserved={sum(len(t.supporting_citations) for t in parsed.topic_deltas)}"
    )


if __name__ == "__main__":
    main()
