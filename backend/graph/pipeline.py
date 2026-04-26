"""LangGraph pipeline definition.

Wires every agent into a DAG:

  parse → memory (prior theses)
  parse → sentiment_agent
  parse → financials_agent
  parse → guidance_agent
  parse → delta_agent
  [financials_agent, sentiment_agent] → lseg → market_ctx
  [market_ctx, financials_agent] → expectation
  [market_ctx, guidance_agent, delta_agent, expectation, memory] → alpha
  alpha → synthesize
"""

import logging

from langgraph.graph import StateGraph, START, END
from backend.graph.state import GraphState
from backend.agents import (
    agent_01_parser,
    agent_02_sentiment,
    agent_03_financials,
    agent_04_market,
    agent_05_guidance,
    agent_06_delta,
    agent_07_alpha,
    agent_08_orchestrator,
    agent_09_expectation,
    agent_10_memory,
)

logger = logging.getLogger(__name__)

NODES = [
    "parse", "memory", "sentiment_agent", "financials_agent", "lseg",
    "market_ctx", "guidance_agent", "delta_agent", "expectation",
    "alpha", "synthesize",
]


def build_graph() -> StateGraph:
    g = StateGraph(GraphState)

    g.add_node("parse", agent_01_parser.run)
    g.add_node("memory", agent_10_memory.run)
    g.add_node("sentiment_agent", agent_02_sentiment.run)
    g.add_node("financials_agent", agent_03_financials.run)
    g.add_node("lseg", agent_04_market.fetch_lseg)
    g.add_node("market_ctx", agent_04_market.run)
    g.add_node("guidance_agent", agent_05_guidance.run)
    g.add_node("delta_agent", agent_06_delta.run)
    g.add_node("expectation", agent_09_expectation.run)
    g.add_node("alpha", agent_07_alpha.run)
    g.add_node("synthesize", agent_08_orchestrator.run)

    g.add_edge(START, "parse")

    g.add_edge("parse", "memory")
    g.add_edge("parse", "sentiment_agent")
    g.add_edge("parse", "financials_agent")
    g.add_edge("parse", "guidance_agent")
    g.add_edge("parse", "delta_agent")

    g.add_edge(["financials_agent", "sentiment_agent"], "lseg")
    g.add_edge("lseg", "market_ctx")

    g.add_edge(["market_ctx", "financials_agent"], "expectation")

    g.add_edge(
        ["market_ctx", "guidance_agent", "delta_agent", "expectation", "memory"],
        "alpha",
    )

    g.add_edge("alpha", "synthesize")
    g.add_edge("synthesize", END)

    compiled = g.compile()
    logger.info("Pipeline graph built | nodes=%d (%s)", len(NODES), ", ".join(NODES))
    return compiled
