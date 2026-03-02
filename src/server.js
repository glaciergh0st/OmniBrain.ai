const express = require("express");
const rateLimit = require("express-rate-limit");
const fs = require("node:fs/promises");
const path = require("node:path");
const { config, getRuntimeInfo } = require("./config");
const {
  PERSONA_CONFIG,
  MODES,
  DOMAIN_OPTIONS,
  generateSecSmeResponse,
} = require("./secSmeEngine");
const { generateChatResponse } = require("./chatService");
const { setSecurityHeaders } = require("./security");

const app = express();
const PORT = config.app.port;
const PUBLIC_DIR = config.app.publicDir;
const PROMPT_PATH = config.app.promptPath;

let cachedFrameworkPrompt = "";

async function getFrameworkPrompt() {
  if (cachedFrameworkPrompt) {
    return cachedFrameworkPrompt;
  }
  cachedFrameworkPrompt = await fs.readFile(PROMPT_PATH, "utf8");
  return cachedFrameworkPrompt;
}

const apiLimiter = rateLimit({
  windowMs: config.api.rateLimitWindowMs,
  max: config.api.rateLimitMaxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    ok: false,
    error: "Rate limit exceeded. Please retry shortly.",
  },
});

app.disable("x-powered-by");
if (config.app.trustProxy) {
  app.set("trust proxy", 1);
}
app.use(setSecurityHeaders);
app.use(express.json({ limit: config.api.bodyLimit }));
app.use(express.urlencoded({ extended: false }));
app.use(express.static(PUBLIC_DIR));
app.use("/api", apiLimiter);

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: config.app.name,
    timestamp: new Date().toISOString(),
    uptimeSec: Math.round(process.uptime()),
    llmConfigured: config.llm.enabled,
    model: config.llm.model,
  });
});

app.get("/api/config", (_req, res) => {
  res.json({
    personas: Object.entries(PERSONA_CONFIG).map(([id, config]) => ({
      id,
      ...config,
    })),
    modes: MODES,
    domains: DOMAIN_OPTIONS,
  });
});

app.get("/api/runtime", (_req, res) => {
  res.json(getRuntimeInfo());
});

app.get("/api/system-prompt", async (_req, res, next) => {
  try {
    const prompt = await getFrameworkPrompt();
    res.json({ prompt });
  } catch (error) {
    next(error);
  }
});

app.post("/api/chat", async (req, res, next) => {
  try {
    const frameworkPrompt = await getFrameworkPrompt();
    const response = await generateChatResponse(req.body, frameworkPrompt);
    if (!response.ok) {
      return res.status(response.statusCode || 400).json({
        ok: false,
        errors: response.errors,
      });
    }
    return res.json({
      ok: true,
      ...response.result,
    });
  } catch (error) {
    return next(error);
  }
});

app.post("/api/respond", (req, res) => {
  const response = generateSecSmeResponse(req.body);
  if (!response.ok) {
    return res.status(400).json({
      ok: false,
      errors: response.errors,
    });
  }
  return res.json({
    ok: true,
    ...response.result,
  });
});

app.get(/^\/(?!api\/).*/, (_req, res) => {
  return res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({
      ok: false,
      error: "API route not found.",
    });
  }
  return res.status(404).send("Not Found");
});

app.use((error, _req, res, _next) => {
  const statusCode = error.statusCode || 500;
  const message =
    statusCode === 500 ? "Unexpected server error." : String(error.message);
  res.status(statusCode).json({
    ok: false,
    error: message,
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(
      `SEC SME app listening on http://localhost:${PORT} (LLM: ${
        config.llm.enabled ? "configured" : "fallback mode"
      })`,
    );
  });
}

module.exports = { app };
