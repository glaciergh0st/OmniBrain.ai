# SEC SME Copilot (Production-Ready Web App)

SEC SME Copilot is a full-stack cybersecurity assistant that applies the **SEC SME Framework** with persona-aware responses and a strict strategy-first structure.

It supports:

- real AI generation via an OpenAI-compatible provider (for broad, arbitrary user input),
- deterministic fallback mode when no model key is configured,
- clean chat UI,
- production hardening (security headers, rate limiting, runtime health/config visibility).

---

## Core Features

### 1) Production Chat Experience

- Clean chat-first UI at `/`
- Persona: `ARCHITECT`, `OFFENSIVE`, `FORENSICS`, `STRATEGIST`
- Mode: `TEACH`, `HUNT`, `WORK`, or auto
- Domain: `Endpoint`, `Cloud`, `Network`, `Identity`, `Supply Chain`, or auto
- Optional strategic objective override
- Context toggle (include/exclude conversation history)
- Copy/download latest assistant response
- Local chat persistence for session continuity

### 2) AI + Fallback Execution

- `POST /api/chat` uses live LLM when configured
- If LLM is unavailable and not required, app auto-falls back to deterministic SEC SME engine
- Output always follows schema-oriented SEC SME structure with:
  - ATT&CK mapping
  - telemetry requirements
  - command/query blocks
  - prevention hierarchy
  - validation criteria

### 3) Production API Hardening

- Security headers (CSP, frame deny, referrer policy, etc.)
- Rate limiting for `/api/*`
- Centralized runtime config endpoint
- Input validation for chat and response APIs

---

## Project Structure

```text
.
├── public/
│   ├── app.js
│   ├── index.html
│   ├── preview.html
│   ├── preview.js
│   ├── safari-preview.html
│   └── styles.css
├── src/
│   ├── chatService.js
│   ├── config.js
│   ├── llmClient.js
│   ├── secSmeEngine.js
│   ├── security.js
│   └── server.js
├── test/
│   └── server.test.js
├── SEC_SME_SYSTEM_PROMPT.md
└── package.json
```

---

## Requirements

- Node.js `>= 20` (tested on Node 22)
- npm `>= 10`

---

## Environment Variables

Create a `.env` file (or set environment variables in your platform):

```env
# App
PORT=3000
NODE_ENV=production
TRUST_PROXY=true

# LLM (OpenAI-compatible)
OPENAI_API_KEY=your_key_here
LLM_PROVIDER=openai-compatible
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4.1-mini
LLM_TIMEOUT_MS=45000
LLM_TEMPERATURE=0.25
LLM_MAX_OUTPUT_TOKENS=1800

# API safeguards
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=120

# Optional: if true, fail requests when LLM not configured
REQUIRE_LLM=false
```

---

## Run

Install dependencies:

```bash
npm install
```

Development:

```bash
npm run dev
```

Production:

```bash
npm start
```

URLs:

- Main app: `http://localhost:3000/`
- Quick demo page: `http://localhost:3000/preview.html`
- Static Safari preview: `http://localhost:3000/safari-preview.html`

---

## API Endpoints

### `GET /api/health`

Service health + uptime + model configuration status.

### `GET /api/runtime`

Runtime config summary (sanitized):

- environment
- llm provider/model/configured status
- rate limit settings

### `GET /api/config`

Returns supported personas, modes, and domains.

### `GET /api/system-prompt`

Returns `SEC_SME_SYSTEM_PROMPT.md` content.

### `POST /api/chat` (Primary)

Generates production SEC SME response for arbitrary input.

Example request:

```json
{
  "persona": "ARCHITECT",
  "mode": "HUNT",
  "domain": "Identity",
  "strategicObjective": "Session/token abuse prevention",
  "message": "Investigate suspicious OAuth refresh token abuse in Entra ID and provide KQL detection and validation.",
  "history": [
    { "role": "user", "content": "We saw abnormal auth spikes." },
    { "role": "assistant", "content": "Can you confirm provider and logs?" }
  ]
}
```

### `POST /api/respond` (Compatibility Endpoint)

Deterministic SEC SME generation endpoint kept for compatibility and fallback testing.

---

## Tests

Run:

```bash
npm test
```

Coverage includes:

- health/config/runtime endpoints
- production chat endpoint validation + response behavior
- compatibility response endpoint
- static page serving checks

---

## Deployment Notes

- Set `OPENAI_API_KEY` (or `LLM_API_KEY`) for live AI mode.
- For reverse proxies/load balancers, keep `TRUST_PROXY=true`.
- For strict production behavior, set `REQUIRE_LLM=true` so `/api/chat` fails closed when provider is unavailable.
