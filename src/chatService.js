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
const MAX_TEAM_PERSONAS = 4;

const ROLE_LIBRARY = {
  ARCHITECT: {
    responsibilities: [
      "Design detection architecture with telemetry coverage mapping.",
      "Define SIEM/EDR analytics and alert quality guardrails.",
      "Close data-source gaps and enforce detection SLAs.",
    ],
    deliverables: [
      "Telemetry gap matrix",
      "Detection content backlog",
      "Coverage scorecard (ATT&CK-aligned)",
    ],
  },
  OFFENSIVE: {
    responsibilities: [
      "Model adversary paths and emulate realistic attack chains.",
      "Stress-test controls with evasion-informed scenarios.",
      "Prioritize exploitability and blast-radius reduction.",
    ],
    deliverables: [
      "Adversary emulation plan",
      "High-risk abuse path report",
      "Purple-team replay scripts",
    ],
  },
  FORENSICS: {
    responsibilities: [
      "Define artifact acquisition and retention standards.",
      "Build timeline reconstruction and evidence triage workflows.",
      "Validate containment and recovery with post-incident proof.",
    ],
    deliverables: [
      "Artifact triage checklist",
      "Incident timeline template",
      "Post-mortem evidence package",
    ],
  },
  STRATEGIST: {
    responsibilities: [
      "Translate technical findings into business risk outcomes.",
      "Map controls to D3FEND, policy, and governance obligations.",
      "Coordinate phased implementation under staffing constraints.",
    ],
    deliverables: [
      "Risk register and owner map",
      "Control policy updates",
      "Executive implementation brief",
    ],
  },
};

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

function normalizeTeamPersonas(value, leadPersona) {
  const normalizedSet = new Set();
  if (Array.isArray(value)) {
    value.forEach((item) => {
      const persona = String(item || "").trim().toUpperCase();
      if (PERSONA_CONFIG[persona]) {
        normalizedSet.add(persona);
      }
    });
  }

  if (!normalizedSet.size) {
    normalizedSet.add(leadPersona);
  }
  if (!normalizedSet.has(leadPersona)) {
    normalizedSet.add(leadPersona);
  }

  const ordered = [leadPersona, ...Array.from(normalizedSet).filter((p) => p !== leadPersona)];
  return ordered.slice(0, MAX_TEAM_PERSONAS);
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

  if (body.teamPersonas !== undefined) {
    if (!Array.isArray(body.teamPersonas)) {
      errors.push("teamPersonas must be an array when provided.");
    } else {
      if (!body.teamPersonas.length) {
        errors.push("teamPersonas cannot be empty when provided.");
      }
      if (body.teamPersonas.length > MAX_TEAM_PERSONAS) {
        errors.push(`teamPersonas can include at most ${MAX_TEAM_PERSONAS} personas.`);
      }
      body.teamPersonas.forEach((item) => {
        const persona = String(item || "").trim().toUpperCase();
        if (!PERSONA_CONFIG[persona]) {
          errors.push(
            `teamPersonas entries must be one of: ${Object.keys(PERSONA_CONFIG).join(", ")}.`,
          );
        }
      });
    }
  }

  if (body.mode) {
    const mode = String(body.mode).trim().toUpperCase();
    if (!MODES.includes(mode)) {
      errors.push("mode must be one of TEACH, HUNT, or WORK.");
    }
  }

  if (body.model !== undefined) {
    const model = String(body.model || "").trim();
    if (!model) {
      errors.push("model cannot be empty when provided.");
    } else if (
      Array.isArray(config.llm.allowedModels) &&
      config.llm.allowedModels.length &&
      !config.llm.allowedModels.includes(model)
    ) {
      errors.push(
        `model must be one of: ${config.llm.allowedModels.join(", ")}.`,
      );
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

function uniqueStrings(values) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((item) => String(item || "").trim())
        .filter(Boolean),
    ),
  );
}

function normalizedPercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  if (numeric < 0) {
    return 0;
  }
  if (numeric > 100) {
    return 100;
  }
  return Math.round(numeric);
}

function buildLeanTeamArtifacts({
  leadPersona,
  teamPersonas,
  domain,
  mode,
  strategicObjective,
  techniqueId,
}) {
  const personas = teamPersonas.length ? teamPersonas : [leadPersona];
  const primaryAllocation = personas.length === 1 ? 100 : 40;
  const remaining = personas.length > 1 ? Math.floor(60 / (personas.length - 1)) : 0;

  const roleCoverage = personas.map((persona, index) => {
    const roleSpec = ROLE_LIBRARY[persona] || ROLE_LIBRARY.ARCHITECT;
    const allocation =
      personas.length === 1 ? 100 : index === 0 ? primaryAllocation : remaining;
    return {
      persona,
      responsibilities: roleSpec.responsibilities,
      timeAllocationPct: normalizedPercent(allocation),
      deliverables: roleSpec.deliverables,
    };
  });

  const executionPhases = [
    {
      phase: "Phase 1 - Scope and Baseline",
      objective: `Establish baseline for ${domain || "target"} controls and telemetry.`,
      tasks: [
        `Define mission scope and crown-jewel assets for ${strategicObjective || "security hardening"}.`,
        "Inventory available telemetry and identify collection blind spots.",
        "Confirm ATT&CK-relevant hypotheses and triage criteria.",
      ],
      outputs: ["Mission charter", "Telemetry baseline", "Hypothesis list"],
    },
    {
      phase: "Phase 2 - Detection and Emulation",
      objective: "Deploy analytics and emulate adversary behavior.",
      tasks: [
        "Implement high-fidelity queries and correlation rules in SIEM/EDR.",
        `Emulate technique ${techniqueId || "mapped ATT&CK behavior"} using safe test methods.`,
        "Capture false-positive patterns and tune thresholds by environment.",
      ],
      outputs: ["Detection pack", "Emulation results", "Tuning decisions"],
    },
    {
      phase: "Phase 3 - Prevention by Design",
      objective: "Reduce exploitability through architectural controls.",
      tasks: [
        "Apply least-privilege, segmentation, and policy-as-code controls.",
        "Map mitigations to D3FEND and owner assignments.",
        "Document operational runbooks for incident responders.",
      ],
      outputs: ["Control design updates", "Owner matrix", "Runbook revisions"],
    },
    {
      phase: "Phase 4 - Validation and Governance",
      objective: `Operationalize ${mode || "TEACH"} outcomes with measurable proof.`,
      tasks: [
        "Execute validation tests and verify detection-to-response timelines.",
        "Track KPI trends and residual risk acceptance decisions.",
        "Schedule recurring control reviews and quarterly replay exercises.",
      ],
      outputs: ["Validation report", "KPI dashboard", "Residual risk log"],
    },
  ];

  const priorityBacklog = [
    "Complete telemetry gap closure for critical assets.",
    "Harden privileged identity paths and short-lived credentials.",
    "Automate attack-simulation validation in CI/security workflows.",
    "Define escalation playbooks with staffing-aware owner coverage.",
    "Instrument outcome KPIs and monthly control health checks.",
  ];

  const kpis = [
    "Mean time to detect (MTTD) for mapped ATT&CK behaviors",
    "Mean time to contain (MTTC) for high-severity scenarios",
    "Detection precision for priority analytics",
    "Coverage ratio across required telemetry sources",
    "Control validation pass rate per sprint",
  ];

  const riskRegister = [
    {
      risk: "Telemetry blind spots hide early-stage adversary activity.",
      impact: "Delayed detection and larger blast radius.",
      mitigation: "Prioritize data-source onboarding and enforce logging standards.",
      owner: "ARCHITECT",
    },
    {
      risk: "Overloaded small team leads to inconsistent execution.",
      impact: "Missed detections and runbook drift.",
      mitigation: "Use phased backlog with explicit ownership and SLA thresholds.",
      owner: "STRATEGIST",
    },
    {
      risk: "Controls tuned for prevention may disrupt business workflows.",
      impact: "Operational friction and rollback pressure.",
      mitigation: "Stage policy rollout with canary scope and exception governance.",
      owner: "ARCHITECT",
    },
    {
      risk: "Validation cadence degrades over time.",
      impact: "Security posture decays despite initial success.",
      mitigation: "Automate recurring tests and report KPI variance monthly.",
      owner: "FORENSICS",
    },
  ];

  return {
    roleCoverage,
    executionPhases,
    priorityBacklog,
    kpis,
    riskRegister,
  };
}

function ensureTeamArtifacts(result, defaults) {
  const base = result && typeof result === "object" ? result : {};
  const teamPersonas = uniqueStrings(
    (base.teamPersonas || []).map((item) => String(item || "").toUpperCase()),
  ).filter((persona) => PERSONA_CONFIG[persona]);

  const effectiveTeam = teamPersonas.length ? teamPersonas : defaults.teamPersonas;
  const seed = buildLeanTeamArtifacts({
    leadPersona: defaults.persona,
    teamPersonas: effectiveTeam,
    domain: base.domain || defaults.domain,
    mode: base.mode || defaults.mode,
    strategicObjective: base.strategicObjective || defaults.strategicObjective,
    techniqueId: base.technique?.id || defaults.techniqueId,
  });

  return {
    ...base,
    teamPersonas: effectiveTeam,
    roleCoverage: Array.isArray(base.roleCoverage) && base.roleCoverage.length
      ? base.roleCoverage
      : seed.roleCoverage,
    executionPhases:
      Array.isArray(base.executionPhases) && base.executionPhases.length
        ? base.executionPhases
        : seed.executionPhases,
    priorityBacklog:
      Array.isArray(base.priorityBacklog) && base.priorityBacklog.length
        ? base.priorityBacklog
        : seed.priorityBacklog,
    kpis: Array.isArray(base.kpis) && base.kpis.length ? base.kpis : seed.kpis,
    riskRegister:
      Array.isArray(base.riskRegister) && base.riskRegister.length
        ? base.riskRegister
        : seed.riskRegister,
  };
}

function formatStructuredText(result) {
  const telemetryLines = (result.telemetry || []).map((item) => `  - ${item}`);
  const assumptionsLines = (result.assumptions || []).map((item) => `- ${item}`);
  const teamLines = (result.teamPersonas || []).map((item) => `- ${item}`);
  const roleLines = (result.roleCoverage || []).flatMap((item) => [
    `- ${item.persona} (${item.timeAllocationPct || 0}%):`,
    ...(item.responsibilities || []).map((line) => `  - ${line}`),
    ...(item.deliverables || []).map((line) => `  - Deliverable: ${line}`),
  ]);
  const phaseLines = (result.executionPhases || []).flatMap((phase, index) => [
    `${index + 1}. ${phase.phase} - ${phase.objective}`,
    ...(phase.tasks || []).map((task) => `   - Task: ${task}`),
    ...(phase.outputs || []).map((output) => `   - Output: ${output}`),
  ]);
  const backlogLines = (result.priorityBacklog || []).map((item) => `- ${item}`);
  const kpiLines = (result.kpis || []).map((item) => `- ${item}`);
  const riskLines = (result.riskRegister || []).map(
    (item) =>
      `- Risk: ${item.risk} | Impact: ${item.impact} | Mitigation: ${item.mitigation} | Owner: ${
        item.owner || "Unassigned"
      }`,
  );

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
    "",
    "5. Lean Team Coverage (Small-Team Copilot Model)",
    "- Team Personas:",
    ...(teamLines.length ? teamLines : ["- ARCHITECT"]),
    "- Role Allocation:",
    ...(roleLines.length ? roleLines : ["- Role coverage not provided."]),
    "",
    "6. Execution Roadmap",
    ...(phaseLines.length ? phaseLines : ["1. Execution phases not provided."]),
    "",
    "7. Program Control Board",
    "- Priority Backlog:",
    ...(backlogLines.length ? backlogLines : ["- Backlog unavailable"]),
    "- KPI Targets:",
    ...(kpiLines.length ? kpiLines : ["- KPI list unavailable"]),
    "- Risk Register:",
    ...(riskLines.length ? riskLines : ["- Risk register unavailable"]),
  ];

  if (assumptionsLines.length) {
    lines.push("", "Assumptions:", ...assumptionsLines);
  }

  return lines.join("\n");
}

function buildSystemMessage(frameworkPrompt) {
  return [
    "You are a production SEC SME AI assistant.",
    "You must help small security teams cover multiple SME roles with clear ownership and phased execution.",
    "You must follow the SEC SME framework exactly and output strict JSON only.",
    "Do not include markdown fences or explanatory preambles.",
    "Return a JSON object with keys:",
    "{",
    '  "persona": "ARCHITECT|OFFENSIVE|FORENSICS|STRATEGIST",',
    '  "teamPersonas": ["ARCHITECT|OFFENSIVE|FORENSICS|STRATEGIST"],',
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
    '  "roleCoverage": [{ "persona": "ARCHITECT", "responsibilities": ["string"], "timeAllocationPct": 40, "deliverables": ["string"] }],',
    '  "executionPhases": [{ "phase": "string", "objective": "string", "tasks": ["string"], "outputs": ["string"] }],',
    '  "priorityBacklog": ["string"],',
    '  "kpis": ["string"],',
    '  "riskRegister": [{ "risk": "string", "impact": "string", "mitigation": "string", "owner": "ARCHITECT|OFFENSIVE|FORENSICS|STRATEGIST" }],',
    '  "assumptions": ["string"],',
    '  "responseText": "full formatted output using the mandatory schema"',
    "}",
    "The responseText must use the exact structure:",
    "[PERSONA], [MODE], [SUBJECT AREA], sections 1..7 in order.",
    "Preserve copy-pasteable command/query blocks.",
    "Focus on execution that allows a small team to operate as a full security SME function.",
    "",
    "SEC SME SYSTEM PROMPT:",
    frameworkPrompt,
  ].join("\n");
}

function buildUserMessage({
  persona,
  teamPersonas,
  model,
  mode,
  domain,
  strategicObjective,
  message,
}) {
  return [
    `Persona preference: ${persona || "auto"}`,
    `Team personas to cover: ${
      teamPersonas && teamPersonas.length ? teamPersonas.join(", ") : "auto"
    }`,
    `Model preference: ${model || config.llm.model}`,
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
  const teamPersonas = normalizeTeamPersonas(body.teamPersonas, persona);
  const model =
    typeof body.model === "string" && body.model.trim()
      ? body.model.trim()
      : config.llm.model;
  const mode = normalizeMode(body.mode);
  const domain = normalizeDomain(body.domain);
  const strategicObjective = truncateText(body.strategicObjective, 240);
  const history = normalizeHistory(body.history);

  if (!config.llm.enabled && config.llm.requireConfigured) {
    return {
      ok: false,
      statusCode: 503,
      errors: [
        "LLM provider is required but not configured. Set DEEPSEEK_API_KEY or LLM_API_KEY.",
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
            teamPersonas,
            model,
            mode,
            domain,
            strategicObjective,
            message,
          }),
        },
      ];

      const providerResponse = await callOpenAiCompatible({ messages, model });
      const json = extractJsonObject(providerResponse.text);

      if (!json) {
        throw new Error("Unable to parse model JSON response.");
      }

      const normalizedBase = normalizeStructuredOutput(json);
      const normalized = ensureTeamArtifacts(normalizedBase, {
        persona,
        teamPersonas,
        mode,
        domain,
        strategicObjective,
        techniqueId: "",
      });
      normalized.model = model;
      normalized.persona = normalized.persona || persona;
      normalized.mode = normalized.mode || mode || "TEACH";
      normalized.domain = normalized.domain || domain || "Endpoint";
      normalized.strategicObjective =
        normalized.strategicObjective ||
        strategicObjective ||
        "Security control hardening";
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
      ...ensureTeamArtifacts(
        {
          ...fallback.result,
          teamPersonas,
        },
        {
          persona,
          teamPersonas,
          mode: fallback.result.mode || mode || "TEACH",
          domain: fallback.result.domain || domain || "Endpoint",
          strategicObjective:
            fallback.result.strategicObjective ||
            strategicObjective ||
            "Security control hardening",
          techniqueId: fallback.result.technique?.id || "",
        },
      ),
      provider: "fallback-engine",
      model,
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
