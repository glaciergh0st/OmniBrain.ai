const test = require("node:test");
const assert = require("node:assert/strict");
const { app } = require("../src/server");

let server;
let baseUrl;

test.before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, "127.0.0.1", () => {
      const address = server.address();
      baseUrl = `http://127.0.0.1:${address.port}`;
      resolve();
    });
  });
});

test.after(async () => {
  if (!server) {
    return;
  }
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
});

test("GET /api/health returns service health", async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.status, "ok");
  assert.equal(payload.service, "sec-sme-webapp");
});

test("GET /api/config returns persona/mode/domain lists", async () => {
  const response = await fetch(`${baseUrl}/api/config`);
  assert.equal(response.status, 200);
  const payload = await response.json();

  assert.ok(Array.isArray(payload.personas));
  assert.ok(payload.personas.some((persona) => persona.id === "ARCHITECT"));
  assert.deepEqual(payload.modes, ["TEACH", "HUNT", "WORK"]);
  assert.ok(payload.domains.includes("Endpoint"));
  assert.ok(Array.isArray(payload.llmModels));
  assert.ok(payload.llmModels.includes("deepseek-chat"));
  assert.equal(typeof payload.defaultModel, "string");
});

test("GET /api/runtime returns runtime configuration status", async () => {
  const response = await fetch(`${baseUrl}/api/runtime`);
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.service, "sec-sme-webapp");
  assert.equal(typeof payload.llm.configured, "boolean");
  assert.equal(typeof payload.rateLimit.maxRequests, "number");
  assert.ok(Array.isArray(payload.llm.availableModels));
  assert.ok(payload.llm.availableModels.includes("deepseek-chat"));
});

test("POST /api/chat handles arbitrary user input", async () => {
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      persona: "ARCHITECT",
      teamPersonas: ["ARCHITECT", "FORENSICS", "STRATEGIST"],
      mode: "HUNT",
      model: "deepseek-reasoner",
      message:
        "Create a hunt plan for suspicious OAuth token abuse and include ATT&CK, telemetry, command, query, and validation proof.",
    }),
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.match(payload.responseText, /\[PERSONA\]:/);
  assert.ok(["llm", "fallback-engine"].includes(payload.provider));
  assert.equal(typeof payload.fallbackUsed, "boolean");
  assert.ok(Array.isArray(payload.teamPersonas));
  assert.ok(payload.teamPersonas.length >= 1);
  assert.ok(Array.isArray(payload.roleCoverage));
  assert.ok(Array.isArray(payload.executionPhases));
  assert.ok(Array.isArray(payload.priorityBacklog));
  assert.equal(typeof payload.model, "string");
});

test("POST /api/chat validates required message", async () => {
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      persona: "ARCHITECT",
      mode: "HUNT",
      message: "",
    }),
  });

  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.ok(payload.errors.some((error) => error.includes("message")));
});

test("POST /api/chat validates team personas", async () => {
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      persona: "ARCHITECT",
      teamPersonas: ["ARCHITECT", "INVALID_PERSONA"],
      message: "build mission plan",
    }),
  });

  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.ok(payload.errors.some((error) => error.includes("teamPersonas")));
});

test("POST /api/chat validates unknown model name", async () => {
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      persona: "ARCHITECT",
      model: "unknown-model",
      message: "Build a mission plan.",
    }),
  });

  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.ok(payload.errors.some((error) => error.includes("model")));
});

test("POST /api/respond returns formatted SEC SME response", async () => {
  const response = await fetch(`${baseUrl}/api/respond`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      persona: "ARCHITECT",
      mode: "HUNT",
      domain: "Endpoint",
      userQuery:
        "Hunt for suspicious PowerShell encoded commands and map to ATT&CK.",
    }),
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.match(payload.responseText, /\[PERSONA\]: ARCHITECT/);
  assert.match(payload.responseText, /Adversary Mapping/);
  assert.equal(payload.technique.id, "T1059.001");
});

test("POST /api/respond validates required fields", async () => {
  const response = await fetch(`${baseUrl}/api/respond`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      persona: "ARCHITECT",
      mode: "HUNT",
      domain: "Endpoint",
      userQuery: "",
    }),
  });

  assert.equal(response.status, 400);
  const payload = await response.json();
  assert.equal(payload.ok, false);
  assert.ok(Array.isArray(payload.errors));
  assert.ok(payload.errors.some((error) => error.includes("userQuery")));
});

test("GET /preview.html serves instant preview website", async () => {
  const response = await fetch(`${baseUrl}/preview.html`);
  assert.equal(response.status, 200);
  const body = await response.text();
  assert.match(body, /SEC SME Preview Website/);
  assert.match(body, /Quick Demo Scenarios/);
});

test("GET / serves clean production UI", async () => {
  const response = await fetch(`${baseUrl}/`);
  assert.equal(response.status, 200);
  const body = await response.text();
  assert.match(body, /SEC SME Copilot/);
  assert.match(body, /Production-ready AI security architecture assistant/);
});
