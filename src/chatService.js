const {
  PERSONA_CONFIG,
  MODES,
  DOMAIN_OPTIONS,
  generateSecSmeResponse,
} = require("./secSmeEngine");
const { config } = require("./config");
const {
  callOpenAiCompatible,
  extractJsonObject,
  normalizeStructuredOutput,
} = require("./llmClient");

const MAX_USER_INPUT = 8_000;
const MAX_HISTORY_ITEMS = 14;
const MAX_HISTORY_MESSAGE_LENGTH = 1_600;

function normalizeDomain(value) {
  if (!value) {
    return "";
  }
  const normalized = String(value).trim().toLowerCase();
  const matched = DOMAIN_OPTIONS.find(
    (domain) => domain.toLowerCase() === normalized,
  );
  if (matched) {
    return matched;
  }
  if (normalized === "supplychain") {
    return "Supply Chain";
  }
  return "";
}

function normalizePersona(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (PERSONA_CONFIG[normalized]) {
    return normalized;
  }
  return "ARCHITECT";
}

function normalizeMode(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (MODES.includes(normalized)) {
    return normalized;
  }
  return "";
}

function truncateText(value, limit) {
  const text = String(value || "").trim();
  if (text.length <= limit) {
    return text;
  }
  return `${text.slice(0, limit)}...`;
}

function normalizeHistory(history) {
  if (!Array.isArray(history)) {
    return [];
  }

  return history
    .slice(-MAX_HISTORY_ITEMS)
    .map((message) => {
      const role = String(message?.role || "").toLowerCase();
      const content = truncateText(message?.content, MAX_HISTORY_MESSAGE_LENGTH);
      if (!content) {
        return null;
      }
      if (role === "assistant" || role === "system") {
        return { role: "assistant", content };
      }
      return { role: "user", content };
    })
    .filter(Boolean);
}

function validateChatRequest(body) {
  const errors = [];
  if (!body || typeof body !== "object") {
    return ["Request body must be a JSON object."];
  }

  const message = String(body.message || "").trim();
  if (!message) {
    errors.push("message is required.");
  }
  if (message.length > MAX_USER_INPUT) {
    errors.push(`message must be ${MAX_USER_INPUT} characters or fewer.`);
  }

  if (body.persona) {
    const persona = String(body.persona).trim().toUpperCase();
    if (!PERSONA_CONFIG[persona]) {
      errors.push(
        `persona must be one of: ${Object.keys(PERSONA_CONFIG).join(", ")}.`,
      );
    }
  }

  if (body.mode) {
    const mode = String(body.mode).trim().toUpperCase();
    if (!MODES.includes(mode)) {
      errors.push("mode must be one of TEACH, HUNT, or WORK.");
    }
  }

  if (body.domain && !normalizeDomain(body.domain)) {
    errors.push(
      "domain must be one of Endpoint, Cloud, Network, Identity, or Supply Chain.",
    );
  }

  if (body.history && !Array.isArray(body.history)) {
    errors.push("history must be an array when provided.");
  }

  return errors;
}

function formatStructuredText(result) {
  const telemetryLines = (result.telemetry || []).map((item) => `  - ${item}`);
  const assumptionsLines = (result.assumptions || []).map((item) => `- ${item}`);
  const lines = [
    `[PERSONA]: ${result.persona || "ARCHITECT"}`,
    `[MODE]: ${result.mode || "TEACH"}`,
    `[SUBJECT AREA]: ${result.domain || "Endpoint"} | ${
      result.strategicObjective || "Security control hardening"
    }`,
    "",
    "1. Adversary Mapping (MITRE)",
    `- Technique: ${result.technique?.name || "Technique"} (${
      result.technique?.id || "T0000"
    })`,
    `- Context: ${result.technique?.context || "Context not provided."}`,
    "",
    "2. Technical Execution (The How-To)",
    `- Tool Choice: ${result.toolChoice || "Sigma / KQL / Atomic Red Team"}`,
    "- Telemetry Requirements:",
    ...(telemetryLines.length ? telemetryLines : ["  - Telemetry not provided."]),
    "- Command:",
    "```bash",
    `# ${result.commandDescription || "Execution command"}`,
    result.command || "# command unavailable",
    "```",
    "- Query:",
    `\`\`\`${result.queryLanguage || "kql"}`,
    "// Detection logic purpose",
    result.query || "// query unavailable",
    "```",
    "",
    "3. Strategic Prevention (Higher Hierarchy)",
    `- Architectural Fix: ${
      result.architecturalFix || "Architectural fix not provided."
    }`,
    `- D3FEND Mapping: ${result.d3fendMapping || "Mapping not provided."}`,
    "",
    "4. Validation (Proof)",
    `- Test Command: ${result.validation?.testCommand || "N/A"}`,
    `- Success Criteria: ${result.validation?.successCriteria || "N/A"}`,
    `- Failure Signal: ${result.validation?.failureSignal || "N/A"}`,
  ];

  if (assumptionsLines.length) {
    lines.push("", "Assumptions:", ...assumptionsLines);
  }

  return lines.join("\n");
}

function buildSystemMessage(frameworkPrompt) {
  return [
    "You are a production SEC SME AI assistant.",
    "You must follow the SEC SME framework exactly and output strict JSON only.",
    "Do not include markdown fences or explanatory preambles.",
    "Return a JSON object with keys:",
    "{",
    '  "persona": "ARCHITECT|OFFENSIVE|FORENSICS|STRATEGIST",',
    '  "mode": "TEACH|HUNT|WORK",',
    '  "domain": "Endpoint|Cloud|Network|Identity|Supply Chain",',
    '  "strategicObjective": "string",',
    '  "technique": { "id": "Txxxx", "name": "string", "context": "string" },',
    '  "toolChoice": "string",',
    '  "telemetry": ["string"],',
    '  "commandDescription": "string",',
    '  "command": "string",',
    '  "queryLanguage": "kql|spl|eql|sql|other",',
    '  "query": "string",',
    '  "architecturalFix": "string",',
    '  "d3fendMapping": "string",',
    '  "validation": { "testCommand": "string", "successCriteria": "string", "failureSignal": "string" },',
    '  "assumptions": ["string"],',
    '  "responseText": "full formatted output using the mandatory schema"',
    "}",
    "The responseText must use the exact structure:",
    "[PERSONA], [MODE], [SUBJECT AREA], sections 1..4 in order.",
    "Preserve copy-pasteable command/query blocks.",
    "",
    "SEC SME SYSTEM PROMPT:",
    frameworkPrompt,
  ].join("\n");
}

function buildUserMessage({
  persona,
  mode,
  domain,
  strategicObjective,
  message,
}) {
  return [
    `Persona preference: ${persona || "auto"}`,
    `Mode preference: ${mode || "auto"}`,
    `Domain preference: ${domain || "auto"}`,
    `Strategic objective override: ${strategicObjective || "none"}`,
    "",
    "User request:",
    message,
  ].join("\n");
}

function inferFallbackInput({ message, strategicObjective }) {
  if (strategicObjective) {
    return `${message}\n\nStrategic Objective: ${strategicObjective}`;
  }
  return message;
}

async function generateChatResponse(body, frameworkPrompt) {
  const errors = validateChatRequest(body);
  if (errors.length) {
    return { ok: false, statusCode: 400, errors };
  }

  const message = truncateText(body.message, MAX_USER_INPUT);
  const persona = normalizePersona(body.persona);
  const mode = normalizeMode(body.mode);
  const domain = normalizeDomain(body.domain);
  const strategicObjective = truncateText(body.strategicObjective, 240);
  const history = normalizeHistory(body.history);

  if (!config.llm.enabled && config.llm.requireConfigured) {
    return {
      ok: false,
      statusCode: 503,
      errors: [
        "LLM provider is required but not configured. Set OPENAI_API_KEY or LLM_API_KEY.",
      ],
    };
  }

  if (config.llm.enabled) {
    try {
      const messages = [
        { role: "system", content: buildSystemMessage(frameworkPrompt) },
        ...history,
        {
          role: "user",
          content: buildUserMessage({
            persona,
            mode,
            domain,
            strategicObjective,
            message,
          }),
        },
      ];

      const providerResponse = await callOpenAiCompatible({ messages });
      const json = extractJsonObject(providerResponse.text);

      if (!json) {
        throw new Error("Unable to parse model JSON response.");
      }

      const normalized = normalizeStructuredOutput(json);
      if (!normalized.responseText) {
        normalized.responseText = formatStructuredText(normalized);
      }

      return {
        ok: true,
        statusCode: 200,
        result: {
          ...normalized,
          provider: "llm",
          model: providerResponse.model || config.llm.model,
          usage: providerResponse.usage,
          fallbackUsed: false,
        },
      };
    } catch (error) {
      if (config.llm.requireConfigured) {
        return {
          ok: false,
          statusCode: 502,
          errors: [
            `LLM provider request failed: ${String(error.message || error)}`,
          ],
        };
      }
    }
  }

  const fallback = generateSecSmeResponse({
    persona,
    mode,
    domain,
    strategicObjective,
    userQuery: inferFallbackInput({ message, strategicObjective }),
  });

  if (!fallback.ok) {
    return { ok: false, statusCode: 400, errors: fallback.errors };
  }

  return {
    ok: true,
    statusCode: 200,
    result: {
      ...fallback.result,
      provider: "fallback-engine",
      model: null,
      usage: null,
      fallbackUsed: true,
      warnings: [
        "LLM provider is unavailable. Returned deterministic fallback output.",
      ],
    },
  };
}

module.exports = {
  generateChatResponse,
  validateChatRequest,
};
