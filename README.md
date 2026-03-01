# SEC SME Web App

A fully functional web application for generating structured cybersecurity guidance using the **SEC SME Framework**.

The app supports persona-adaptive output, ATT&CK mapping, telemetry requirements, command/query generation, D3FEND-aligned prevention, and validation steps.

---

## Features

- Web UI with:
  - Persona selection: `ARCHITECT`, `OFFENSIVE`, `FORENSICS`, `STRATEGIST`
  - Interaction mode: `TEACH`, `HUNT`, `WORK`, or auto-infer
  - Domain selection: `Endpoint`, `Cloud`, `Network`, `Identity`, `Supply Chain`, or auto-infer
  - Optional strategic objective override
  - Recent scenario history (local storage)
  - Copy and download generated responses
  - In-app system prompt viewer
- API with:
  - Health endpoint
  - Config endpoint (personas/modes/domains)
  - System prompt retrieval endpoint
  - Response generation endpoint with input validation
- Automated tests for core API behavior.

---

## Project Structure

```text
.
├── public/
│   ├── app.js
│   ├── index.html
│   ├── preview.html
│   ├── preview.js
│   └── styles.css
├── src/
│   ├── secSmeEngine.js
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

## Run Locally

Install dependencies:

```bash
npm install
```

Start in development mode:

```bash
npm run dev
```

Start in production mode:

```bash
npm start
```

Default URL:

```text
http://localhost:3000
```

Instant preview website:

```text
http://localhost:3000/preview.html
```

---

## Test

Run automated tests:

```bash
npm test
```

---

## API Endpoints

### `GET /api/health`

Returns service status and uptime.

### `GET /api/config`

Returns supported personas, modes, and domain options.

### `GET /api/system-prompt`

Returns the current SEC SME system prompt text.

### `POST /api/respond`

Generates schema-compliant SEC SME output.

Example request:

```json
{
  "persona": "ARCHITECT",
  "mode": "HUNT",
  "domain": "Endpoint",
  "strategicObjective": "Script execution governance",
  "userQuery": "Hunt for suspicious PowerShell encoded commands and map to ATT&CK."
}
```

Example response fields:

- `responseText` (formatted response for direct copy/paste)
- `technique` (MITRE ATT&CK ID + name + context)
- `telemetry`
- `command`, `query`, `queryLanguage`
- `architecturalFix`, `d3fendMapping`
- `validation` block

---

## Notes

- If `mode` or `domain` are omitted, the app infers them from user intent and keywords.
- The learning rule is automatically applied for teaching-oriented requests.
- This app provides deterministic response generation and does not require external model keys.
