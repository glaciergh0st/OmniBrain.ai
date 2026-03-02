const path = require("node:path");
const dotenv = require("dotenv");

dotenv.config({ quiet: true });

function parseBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }
  return String(value).trim().toLowerCase() === "true";
}

function parseNumber(value, defaultValue) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return defaultValue;
  }
  return parsed;
}

function parseString(value, defaultValue) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return defaultValue;
  }
  return normalized;
}

function parseStringList(value, defaultValues = []) {
  const raw = String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (!raw.length) {
    return defaultValues;
  }
  return Array.from(new Set(raw));
}

const baseUrl = parseString(
  process.env.LLM_BASE_URL,
  "https://api.deepseek.com/v1",
);
const llmApiKey = parseString(
  process.env.LLM_API_KEY || process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY,
  "",
);
const allowedModels = parseStringList(process.env.LLM_ALLOWED_MODELS, [
  "deepseek-chat",
  "deepseek-reasoner",
]);
const defaultModel = parseString(
  process.env.LLM_MODEL,
  allowedModels[0] || "deepseek-chat",
);
const resolvedModel = allowedModels.includes(defaultModel)
  ? defaultModel
  : allowedModels[0] || "deepseek-chat";

const config = {
  app: {
    name: "sec-sme-webapp",
    env: parseString(process.env.NODE_ENV, "development"),
    port: parseNumber(process.env.PORT, 3000),
    trustProxy: parseBoolean(process.env.TRUST_PROXY, true),
    publicDir: path.resolve(__dirname, "..", "public"),
    promptPath: path.resolve(__dirname, "..", "SEC_SME_SYSTEM_PROMPT.md"),
  },
  api: {
    bodyLimit: parseString(process.env.BODY_LIMIT, "1mb"),
    rateLimitWindowMs: parseNumber(process.env.RATE_LIMIT_WINDOW_MS, 60_000),
    rateLimitMaxRequests: parseNumber(process.env.RATE_LIMIT_MAX_REQUESTS, 120),
  },
  llm: {
    provider: parseString(process.env.LLM_PROVIDER, "deepseek"),
    baseUrl: baseUrl.replace(/\/$/, ""),
    apiKey: llmApiKey,
    model: resolvedModel,
    allowedModels,
    timeoutMs: parseNumber(process.env.LLM_TIMEOUT_MS, 45_000),
    temperature: parseNumber(process.env.LLM_TEMPERATURE, 0.25),
    maxOutputTokens: parseNumber(process.env.LLM_MAX_OUTPUT_TOKENS, 1800),
    requireConfigured: parseBoolean(process.env.REQUIRE_LLM, false),
    enabled: Boolean(llmApiKey),
  },
};

function getRuntimeInfo() {
  return {
    service: config.app.name,
    env: config.app.env,
    llm: {
      provider: config.llm.provider,
      configured: config.llm.enabled,
      model: config.llm.model,
      availableModels: config.llm.allowedModels,
      baseUrl: config.llm.baseUrl,
      requireConfigured: config.llm.requireConfigured,
      timeoutMs: config.llm.timeoutMs,
    },
    rateLimit: {
      windowMs: config.api.rateLimitWindowMs,
      maxRequests: config.api.rateLimitMaxRequests,
    },
  };
}

module.exports = {
  config,
  getRuntimeInfo,
};
