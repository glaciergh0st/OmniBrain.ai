const { config } = require("./config");

function withTimeout(signal, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  if (signal) {
    signal.addEventListener("abort", () => controller.abort(), { once: true });
  }
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timeout),
  };
}

function normalizeBaseUrl(url) {
  return String(url || "").replace(/\/$/, "");
}

function parseContentFromChoice(choice) {
  const content = choice?.message?.content;
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((item) => item?.text || item?.content || "")
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

async function callOpenAiCompatible({ messages }) {
  if (!config.llm.enabled) {
    throw new Error("LLM is not configured.");
  }

  const endpoint = `${normalizeBaseUrl(config.llm.baseUrl)}/chat/completions`;
  const timeout = withTimeout(undefined, config.llm.timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      signal: timeout.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.llm.apiKey}`,
      },
      body: JSON.stringify({
        model: config.llm.model,
        messages,
        temperature: config.llm.temperature,
        max_tokens: config.llm.maxOutputTokens,
        response_format: { type: "json_object" },
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const providerMessage =
        payload?.error?.message ||
        payload?.message ||
        `Provider error (${response.status}).`;
      throw new Error(providerMessage);
    }

    const text = parseContentFromChoice(payload?.choices?.[0]);
    if (!text) {
      throw new Error("Provider returned an empty response.");
    }

    return {
      text,
      usage: payload.usage || null,
      model: payload.model || config.llm.model,
    };
  } finally {
    timeout.clear();
  }
}

function extractJsonObject(text) {
  if (!text) {
    return null;
  }

  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch (_error) {
    // Continue with fallback extraction.
  }

  const fenced = trimmed.match(/```json\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1]);
    } catch (_error) {
      // Continue with object boundary extraction.
    }
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const candidate = trimmed.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(candidate);
    } catch (_error) {
      return null;
    }
  }

  return null;
}

function clampArrayStrings(value, limit = 8) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, limit);
}

function normalizeStructuredOutput(rawObject) {
  const object = rawObject && typeof rawObject === "object" ? rawObject : {};
  const technique =
    object.technique && typeof object.technique === "object" ? object.technique : {};
  const validation =
    object.validation && typeof object.validation === "object"
      ? object.validation
      : {};

  return {
    persona: String(object.persona || "").trim(),
    mode: String(object.mode || "").trim(),
    domain: String(object.domain || "").trim(),
    strategicObjective: String(object.strategicObjective || "").trim(),
    technique: {
      id: String(technique.id || "").trim(),
      name: String(technique.name || "").trim(),
      context: String(technique.context || "").trim(),
    },
    toolChoice: String(object.toolChoice || "").trim(),
    telemetry: clampArrayStrings(object.telemetry, 10),
    commandDescription: String(object.commandDescription || "").trim(),
    command: String(object.command || "").trim(),
    queryLanguage: String(object.queryLanguage || "").trim(),
    query: String(object.query || "").trim(),
    architecturalFix: String(object.architecturalFix || "").trim(),
    d3fendMapping: String(object.d3fendMapping || "").trim(),
    validation: {
      testCommand: String(validation.testCommand || "").trim(),
      successCriteria: String(validation.successCriteria || "").trim(),
      failureSignal: String(validation.failureSignal || "").trim(),
    },
    assumptions: clampArrayStrings(object.assumptions, 8),
    responseText: String(object.responseText || "").trim(),
  };
}

module.exports = {
  callOpenAiCompatible,
  extractJsonObject,
  normalizeStructuredOutput,
};
