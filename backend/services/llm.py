"""Provider-agnostic LLM service with per-agent model selection.

Uses LangChain's BaseChatModel as the unified interface, supporting both
Anthropic Claude and Google Gemini. Each agent can specify its preferred
provider/model in its prompt YAML file.
"""

import logging
from functools import lru_cache
from typing import Optional

from langchain_core.messages import SystemMessage, HumanMessage

from backend.settings import settings

logger = logging.getLogger(__name__)

DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-6"
DEFAULT_GOOGLE_MODEL = "gemini-3-flash-preview"


@lru_cache(maxsize=16)
def get_llm(provider: str, model: str):
    """Factory function returning the correct LangChain chat model."""
    if provider == "anthropic":
        from langchain_anthropic import ChatAnthropic

        return ChatAnthropic(
            model=model,
            anthropic_api_key=settings.anthropic_api_key,
            max_tokens=8192,
        )
    elif provider == "google":
        from langchain_google_genai import ChatGoogleGenerativeAI

        return ChatGoogleGenerativeAI(
            model=model,
            google_api_key=settings.google_api_key,
        )
    else:
        raise ValueError(f"Unknown LLM provider: {provider}")


def _resolve_provider_model(
    provider: Optional[str] = None, model: Optional[str] = None
) -> tuple[str, str]:
    """Resolve provider and model, falling back to settings defaults."""
    p = provider or settings.llm_default_provider or "anthropic"
    if not model:
        if p == "google":
            m = settings.llm_default_model or DEFAULT_GOOGLE_MODEL
        else:
            m = settings.llm_default_model or DEFAULT_ANTHROPIC_MODEL
    else:
        m = model
    return p, m


async def call_llm(
    system: str,
    user: str,
    provider: Optional[str] = None,
    model: Optional[str] = None,
) -> str:
    """Invoke an LLM with system + user messages and return the text response."""
    p, m = _resolve_provider_model(provider, model)
    llm = get_llm(p, m)

    messages = [SystemMessage(content=system), HumanMessage(content=user)]

    logger.info("Calling %s/%s (system=%d chars, user=%d chars)", p, m, len(system), len(user))
    response = await llm.ainvoke(messages)
    content = response.content
    if isinstance(content, list):
        content = "\n".join(
            block.get("text", "") if isinstance(block, dict) else str(block)
            for block in content
        )
    return content
