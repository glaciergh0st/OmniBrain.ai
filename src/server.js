const express = require("express");
const fs = require("node:fs/promises");
const path = require("node:path");
const {
  PERSONA_CONFIG,
  MODES,
  DOMAIN_OPTIONS,
  generateSecSmeResponse,
} = require("./secSmeEngine");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = path.resolve(__dirname, "..", "public");
const PROMPT_PATH = path.resolve(__dirname, "..", "SEC_SME_SYSTEM_PROMPT.md");

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));
app.use(express.static(PUBLIC_DIR));

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "sec-sme-webapp",
    timestamp: new Date().toISOString(),
    uptimeSec: Math.round(process.uptime()),
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

app.get("/api/system-prompt", async (_req, res, next) => {
  try {
    const prompt = await fs.readFile(PROMPT_PATH, "utf8");
    res.json({ prompt });
  } catch (error) {
    next(error);
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
    console.log(`SEC SME app listening on http://localhost:${PORT}`);
  });
}

module.exports = { app };
