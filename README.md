# MAECAS — Multi-Agent Earnings Call Analysis System

A local web application that ingests Refinitiv StreetEvents earnings call transcripts in XML format, runs them through an 8-agent LangGraph pipeline, enriches the analysis with live equity, consensus, and fundamentals data from the LSEG Data Library, and renders a structured investment analysis dashboard.

## Architecture

- **Backend:** FastAPI + LangGraph + SQLite
- **Frontend:** React 18 + Vite + TypeScript + Tailwind CSS + Recharts
- **LLMs:** Anthropic Claude + Google Gemini (per-agent configurable)
- **Market Data:** LSEG Data Library for Python (Platform or Desktop Session)

## Quick Start

### Backend

```bash
cd maecas/backend
python -m venv .venv
source .venv/bin/activate    # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# Copy and fill in secrets
cp ../.env.example ../.env

# Run the server
cd ..
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend

```bash
cd maecas/frontend
npm install
npm run dev
```

Open http://localhost:5173 in your browser.

### LSEG Market Data (optional)

The app supports two LSEG connection modes. Set `LSEG_SESSION_TYPE` in `.env`:

**Option A: Platform Session (recommended — no desktop app needed)**

Connect directly to the LSEG cloud with your API credentials:

```env
LSEG_SESSION_TYPE=platform
LSEG_APP_KEY=your-app-key
LSEG_MACHINE_ID=your-machine-id
LSEG_PASSWORD=your-password
```

Also update `lseg-data.config.json` with the same credentials.
Get these from the [LSEG Developer Portal](https://developers.lseg.com/).

**Option B: Desktop Session (requires LSEG Workspace running locally)**

```env
LSEG_SESSION_TYPE=desktop
LSEG_APP_KEY=your-app-key
```

**Option C: No LSEG at all**

If you don't have LSEG credentials, leave the defaults. The app works fully
without it — you just won't get price charts, consensus comparisons, or
beat/miss flags. All LLM-based analysis still runs.

## LLM Configuration

Each agent's prompt YAML file (`backend/prompts/agent_*.yaml`) can specify:

```yaml
provider: anthropic   # or "google"
model: claude-sonnet-4-6   # or "gemini-3-flash-preview"
```

Set API keys in `.env`:
```
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=AIza...
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/analysis/start` | Upload current XML (+ up to 3 prior XMLs), start pipeline |
| GET | `/api/analysis/{id}/stream` | SSE progress stream |
| GET | `/api/analysis/{id}/result` | Full analysis report |
| GET | `/api/analysis/history` | Past analyses |
| DELETE | `/api/analysis/{id}` | Delete analysis |
| GET | `/api/health` | Health check |

`POST /api/analysis/start` accepts multipart form data with `current_file`
and up to three repeated `prior_files` entries. Prior transcripts are used
for multi-quarter QoQ trend analysis and sentiment baselines.
