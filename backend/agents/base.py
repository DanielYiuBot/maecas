"""BaseAgent — shared infrastructure for LLM-based agents.

Subclasses define prompt_file and output_schema. Prompts are loaded
from YAML at runtime. Each YAML may specify provider/model for
per-agent LLM selection.
"""

import json
import logging
import time
from pathlib import Path
from typing import Optional

import yaml
from pydantic import BaseModel

from backend.services.llm import call_llm

logger = logging.getLogger(__name__)

PROMPTS_DIR = Path(__file__).parent.parent / "prompts"


class BaseAgent:
    prompt_file: str
    output_schema: type

    def load_prompt(self, **kwargs) -> tuple[str, str, Optional[str], Optional[str]]:
        """Load and format the prompt YAML.

        Returns (system, user, provider, model).
        """
        path = PROMPTS_DIR / self.prompt_file
        data = yaml.safe_load(path.read_text())
        system = data["system"].format(**kwargs)
        user = data["user"].format(**kwargs)
        provider = data.get("provider")
        model = data.get("model")

        var_sizes = {k: len(str(v)) for k, v in kwargs.items()}
        logger.info(
            "load_prompt | file=%s | provider=%s | model=%s | system_len=%d | user_len=%d | vars=%s",
            self.prompt_file, provider, model, len(system), len(user), var_sizes,
        )
        return system, user, provider, model

    async def call(
        self,
        system: str,
        user: str,
        provider: Optional[str] = None,
        model: Optional[str] = None,
    ) -> dict:
        logger.info(
            "LLM call START | prompt_file=%s | system_chars=%d | user_chars=%d",
            self.prompt_file, len(system), len(user),
        )
        t0 = time.perf_counter()
        raw = await call_llm(system=system, user=user, provider=provider, model=model)
        elapsed = time.perf_counter() - t0
        logger.info(
            "LLM call DONE | prompt_file=%s | response_chars=%d | elapsed=%.2fs",
            self.prompt_file, len(raw), elapsed,
        )

        clean = raw.strip()
        if clean.startswith("```"):
            first_newline = clean.index("\n") if "\n" in clean else 3
            clean = clean[first_newline + 1 :]
            if clean.endswith("```"):
                clean = clean[:-3]
            clean = clean.strip()
        try:
            result = json.loads(clean)
            logger.debug("JSON parse OK (json.loads) | prompt_file=%s", self.prompt_file)
            return result
        except json.JSONDecodeError:
            logger.info(
                "JSON parse fallback to raw_decode | prompt_file=%s | clean_len=%d",
                self.prompt_file, len(clean),
            )
            decoder = json.JSONDecoder()
            obj, _ = decoder.raw_decode(clean)
            return obj

    async def parse_output(self, data: dict):
        schema_name = getattr(self.output_schema, "__name__", str(self.output_schema))
        try:
            result = self.output_schema.model_validate(data)
            logger.info("Validation OK | schema=%s | prompt_file=%s", schema_name, self.prompt_file)
            return result
        except Exception:
            logger.error(
                "Validation FAILED | schema=%s | prompt_file=%s | keys=%s",
                schema_name, self.prompt_file, list(data.keys()),
                exc_info=True,
            )
            raise
