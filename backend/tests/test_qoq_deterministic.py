from backend.agents.agent_06_delta import (
    _deterministic_language_drift,
    _deterministic_topic_fallback,
    _risk_keyword_diff,
)


def test_deterministic_language_drift_counts_hedging_and_certainty():
    current = "We are confident and will execute. We may expand supply."
    prior = "We could be uncertain and may face pressure."

    drift = _deterministic_language_drift(current, prior)

    assert drift.certainty_drift > 0
    assert drift.hedging_drift < 0


def test_risk_keyword_diff_finds_new_current_risks():
    current = "Demand slowdown and margin pressure are potential headwinds."
    prior = "Demand is stable."

    risks = _risk_keyword_diff(current, prior)

    assert "slowdown" in risks
    assert "margin" in risks
    assert "pressure" in risks


def test_topic_fallback_returns_new_and_fading_phrases():
    current = "sovereign ai demand sovereign ai demand margin expansion"
    prior = "supply constraint pressure supply constraint pressure"

    rows = _deterministic_topic_fallback(current, prior)
    statuses = {r.novelty_status for r in rows}

    assert "new" in statuses
    assert "de_emphasized" in statuses
