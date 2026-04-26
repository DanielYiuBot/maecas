# Coding Agent Rules — MAECAS

## Non-negotiable conventions
- All Pydantic schemas are defined in backend/schemas/ — never inline in agents
- No agent imports lseg.data directly — all LSEG calls go through MarketDataService
- All prompt text lives in backend/prompts/*.yaml — never hardcoded in Python
- Use async/await throughout the backend — no blocking calls in agent nodes
- Every agent run() function must catch exceptions and return a partial schema,
  never raise to the pipeline

## Naming conventions
- Agent files: agent_0N_<name>.py (zero-padded, snake_case)
- Schema files: match the schema class name lowercased
- Tests: test_<module>.py mirroring the module being tested

## When in doubt
- Check the PRD schema definitions before adding any new field
- Run pytest after each agent implementation before moving to the next
- If LSEG returns unexpected data shape, return empty list / dict, log a warning,
  set lseg_available=False — do not raise
