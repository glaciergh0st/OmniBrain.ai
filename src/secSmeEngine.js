const PERSONA_CONFIG = {
  ARCHITECT: {
    label: "Tier-3 Security Architect & Detection Engineer",
    focus: "Telemetry gaps, SIEM/EDR analytics, and Sigma engineering",
  },
  OFFENSIVE: {
    label: "Principal Red Teamer / Pentester",
    focus: "Evasion tradecraft, weaponization paths, and exploit execution chains",
  },
  FORENSICS: {
    label: "DFIR Lead",
    focus: "Artifact recovery, timeline reconstruction, and memory-informed incident response",
  },
  STRATEGIST: {
    label: "GRC & CISO",
    focus: "Business risk reduction, D3FEND-aligned controls, and policy-as-code",
  },
};

const MODES = ["TEACH", "HUNT", "WORK"];

const DOMAIN_KEYWORDS = {
  Endpoint: [
    "endpoint",
    "windows",
    "linux",
    "powershell",
    "registry",
    "sysmon",
    "edr",
    "process",
    "ransomware",
    "dll",
  ],
  Cloud: [
    "cloud",
    "aws",
    "azure",
    "gcp",
    "cloudtrail",
    "s3",
    "iam",
    "role",
    "container",
    "kubernetes",
  ],
  Network: [
    "network",
    "dns",
    "firewall",
    "proxy",
    "zeek",
    "suricata",
    "netflow",
    "c2",
    "egress",
    "packet",
  ],
  Identity: [
    "identity",
    "credential",
    "password",
    "mfa",
    "sso",
    "oauth",
    "kerberos",
    "active directory",
    "entra",
    "okta",
  ],
  "Supply Chain": [
    "supply chain",
    "pipeline",
    "ci/cd",
    "artifact",
    "dependency",
    "package",
    "sbom",
    "github actions",
    "build system",
    "provenance",
  ],
};

const DOMAIN_TELEMETRY = {
  Endpoint: [
    "Sysmon (Event IDs 1, 3, 7, 8, 10, 11, 13)",
    "Windows Security logs (4624, 4688, 4698, 4720, 4732)",
    "EDR process lineage and script telemetry",
    "PowerShell ScriptBlock logs (4104)",
  ],
  Cloud: [
    "AWS CloudTrail management + data events",
    "Azure Activity + Entra sign-in logs",
    "GCP Audit Logs (Admin Activity + Data Access)",
    "Cloud workload runtime telemetry (EKS/AKS/GKE)",
  ],
  Network: [
    "DNS query/response logs",
    "Proxy URL logs with user attribution",
    "NetFlow/IPFIX with internal-host mapping",
    "Zeek conn/http/dns and IDS alerts",
  ],
  Identity: [
    "Identity provider sign-in logs",
    "Conditional access / MFA events",
    "Directory object changes and group memberships",
    "Privileged session and token issuance logs",
  ],
  "Supply Chain": [
    "CI/CD execution logs and workflow provenance",
    "Artifact repository audit logs",
    "Dependency lockfile and SBOM delta telemetry",
    "Container registry pull/push event streams",
  ],
};

const DOMAIN_OBJECTIVES = {
  Endpoint: [
    "Application allow-listing",
    "Credential theft resistance",
    "Script execution governance",
    "Ransomware blast-radius reduction",
  ],
  Cloud: [
    "Least privilege IAM",
    "Cross-account abuse prevention",
    "Storage exfiltration controls",
    "Cloud control-plane integrity",
  ],
  Network: [
    "Egress filtering",
    "C2 channel disruption",
    "Lateral movement segmentation",
    "DNS abuse mitigation",
  ],
  Identity: [
    "Strong authentication enforcement",
    "Privilege lifecycle hardening",
    "Session/token abuse prevention",
    "Credential replay resistance",
  ],
  "Supply Chain": [
    "Pipeline trust hardening",
    "Dependency integrity assurance",
    "Build provenance verification",
    "Artifact tamper detection",
  ],
};

const TECHNIQUES = [
  {
    id: "T1059.001",
    name: "PowerShell",
    domain: "Endpoint",
    keywords: ["powershell", "script", "encodedcommand", "execution policy"],
    context:
      "Adversaries execute malicious PowerShell to stage payloads, disable controls, or run post-exploitation logic.",
    telemetry: [
      "PowerShell ScriptBlock logs (Event ID 4104)",
      "Process creation telemetry for powershell.exe/pwsh.exe",
      "Command-line capture with parent-child process lineage",
    ],
    commandDescription:
      "Run Atomic test coverage for PowerShell execution detection validation",
    command:
      'pwsh -NoProfile -Command "Invoke-AtomicTest T1059.001 -TestNumbers 1 -GetPrereqs -ExecutionLogPath ./atomic-T1059.001.log"',
    queries: {
      kql: [
        "DeviceProcessEvents",
        '| where FileName in~ ("powershell.exe", "pwsh.exe")',
        '| where ProcessCommandLine has_any ("-enc", "IEX", "DownloadString", "Bypass")',
        "| project Timestamp, DeviceName, AccountName, FileName, ProcessCommandLine, InitiatingProcessFileName",
      ].join("\n"),
      spl: [
        'index=edr sourcetype=processes (process_name="powershell.exe" OR process_name="pwsh.exe")',
        'process_command_line IN ("*-enc*", "*IEX*", "*DownloadString*", "*Bypass*")',
        "| table _time, host, user, process_name, process_command_line, parent_process_name",
      ].join("\n"),
      eql: [
        "process where process.name in (\"powershell.exe\", \"pwsh.exe\")",
        "and process.command_line regex \"(?i)(-enc|iex|downloadstring|bypass)\"",
      ].join("\n"),
      sql: [
        "SELECT ts, host, user_name, process_name, cmdline, parent_process",
        "FROM process_events",
        "WHERE process_name IN ('powershell.exe', 'pwsh.exe')",
        "  AND regexp_like(lower(cmdline), '(-enc|iex|downloadstring|bypass)');",
      ].join("\n"),
    },
    architecturalFix:
      "Enforce constrained PowerShell language mode, signed-script execution policy, and endpoint application control allow-lists.",
    d3fend: "D3-EXF (Execution Prevention) + D3-PSA (Process Spawn Analysis)",
    testCommand:
      'pwsh -NoProfile -Command "Invoke-AtomicTest T1059.001 -TestNumbers 1"',
    successCriteria:
      "Test execution triggers high-fidelity alert with complete command-line and parent process lineage.",
    failureSignal:
      "No alert or missing ScriptBlock/process lineage indicates telemetry or detection gap.",
  },
  {
    id: "T1003",
    name: "OS Credential Dumping",
    domain: "Identity",
    keywords: ["credential dump", "lsass", "mimikatz", "sam", "secretsdump"],
    context:
      "Adversaries dump credentials from LSASS or local stores to escalate privileges and move laterally.",
    telemetry: [
      "Access events to LSASS process memory",
      "EDR detections for suspicious handle requests",
      "Security events for privileged token usage",
    ],
    commandDescription:
      "Exercise credential-dumping emulation to validate defensive controls",
    command:
      'pwsh -NoProfile -Command "Invoke-AtomicTest T1003 -TestNumbers 1 -GetPrereqs -ExecutionLogPath ./atomic-T1003.log"',
    queries: {
      kql: [
        "DeviceProcessEvents",
        '| where FileName in~ ("procdump.exe", "rundll32.exe", "comsvcs.dll", "mimikatz.exe")',
        '| where ProcessCommandLine has_any ("lsass", "sekurlsa", "MiniDump", "logonpasswords")',
        "| project Timestamp, DeviceName, AccountName, FileName, ProcessCommandLine",
      ].join("\n"),
      spl: [
        'index=edr sourcetype=processes process_command_line="*lsass*"',
        '(process_command_line="*MiniDump*" OR process_command_line="*sekurlsa*" OR process_name="procdump.exe")',
        "| table _time, host, user, process_name, process_command_line, parent_process_name",
      ].join("\n"),
      eql: [
        "process where process.command_line regex \"(?i)(lsass|minidump|sekurlsa|logonpasswords)\"",
      ].join("\n"),
      sql: [
        "SELECT ts, host, user_name, process_name, cmdline",
        "FROM process_events",
        "WHERE regexp_like(lower(cmdline), '(lsass|minidump|sekurlsa|logonpasswords)');",
      ].join("\n"),
    },
    architecturalFix:
      "Enable credential guard / LSASS protection, remove unnecessary admin rights, and isolate privileged accounts with PAWs.",
    d3fend:
      "D3-PPM (Process Memory Protection) + D3-IAM (Identity Access Management)",
    testCommand:
      'pwsh -NoProfile -Command "Invoke-AtomicTest T1003 -TestNumbers 1"',
    successCriteria:
      "Credential-dumping behavior is blocked or immediately alerted with actionable context.",
    failureSignal:
      "LSASS access succeeds without alerting or control intervention.",
  },
  {
    id: "T1071.001",
    name: "Application Layer Protocol: Web Protocols",
    domain: "Network",
    keywords: ["c2", "beacon", "http", "https", "egress", "domain fronting"],
    context:
      "Adversaries establish C2 over HTTP/S to blend with normal traffic and evade perimeter controls.",
    telemetry: [
      "Proxy logs with URI and user-agent",
      "DNS telemetry tied to endpoint identity",
      "TLS metadata and JA3/JA4 fingerprints",
    ],
    commandDescription:
      "Run Caldera operation profile to emulate HTTP/S C2 patterns",
    command:
      "docker run --rm --name caldera-opmitre mitre/caldera:latest --insecure --build",
    queries: {
      kql: [
        "CommonSecurityLog",
        "| where DeviceAction == \"Allow\"",
        '| where RequestURL has_any ("cdn", "api", "update")',
        "| summarize Connections=count(), DistinctDestinations=dcount(DestinationHostName) by SourceIP, UserAgent, bin(TimeGenerated, 15m)",
        "| where Connections > 50 and DistinctDestinations > 10",
      ].join("\n"),
      spl: [
        "index=proxy sourcetype=web",
        "| bin _time span=15m",
        "| stats count as connections dc(dest_host) as distinct_dest by _time, src_ip, user_agent",
        "| where connections > 50 AND distinct_dest > 10",
      ].join("\n"),
      eql: [
        "network where network.protocol == \"http\"",
        "and event.action == \"connection_allowed\"",
        "and network.direction == \"outgoing\"",
      ].join("\n"),
      sql: [
        "SELECT window_start, src_ip, user_agent, COUNT(*) AS connections,",
        "       COUNT(DISTINCT dest_host) AS distinct_dest",
        "FROM proxy_logs",
        "GROUP BY TUMBLE(ts, INTERVAL '15' MINUTE), src_ip, user_agent",
        "HAVING COUNT(*) > 50 AND COUNT(DISTINCT dest_host) > 10;",
      ].join("\n"),
    },
    architecturalFix:
      "Enforce explicit proxy egress, deny direct outbound internet from workloads, and segment high-trust assets behind constrained egress profiles.",
    d3fend:
      "D3-NTA (Network Traffic Analysis) + D3-EAL (Egress Filtering / Access Limiting)",
    testCommand:
      "Invoke-AtomicTest T1071.001 -TestNumbers 1",
    successCriteria:
      "Abnormal beaconing pattern is surfaced by analytic and blocked by egress policy for protected segments.",
    failureSignal:
      "Repeated outbound callbacks persist without triageable detections or policy enforcement.",
  },
  {
    id: "T1078",
    name: "Valid Accounts",
    domain: "Cloud",
    keywords: ["valid accounts", "stolen keys", "assumerole", "console login", "iam user"],
    context:
      "Adversaries use stolen credentials or session tokens to operate as legitimate users in cloud control planes.",
    telemetry: [
      "CloudTrail sign-in and AssumeRole events",
      "MFA challenge outcomes",
      "Geolocation and impossible-travel signals",
    ],
    commandDescription:
      "Run Prowler IAM and access-hardening checks to baseline control posture",
    command:
      "prowler aws -g iam --output-formats json --output-directory ./prowler-output",
    queries: {
      kql: [
        "CloudTrail",
        '| where EventName in ("ConsoleLogin", "AssumeRole", "GetSessionToken", "CreateAccessKey")',
        "| summarize Attempts=count(), DistinctIPs=dcount(SourceIpAddress) by UserIdentityArn, EventName, bin(TimeGenerated, 30m)",
        "| where Attempts > 5 or DistinctIPs > 2",
      ].join("\n"),
      spl: [
        'index=cloudtrail eventName IN ("ConsoleLogin","AssumeRole","GetSessionToken","CreateAccessKey")',
        "| bin _time span=30m",
        "| stats count as attempts dc(sourceIPAddress) as distinct_ips by _time, userIdentity.arn, eventName",
        "| where attempts > 5 OR distinct_ips > 2",
      ].join("\n"),
      eql: [
        "authentication where event.dataset == \"cloud\"",
        "and event.action in (\"ConsoleLogin\", \"AssumeRole\", \"GetSessionToken\", \"CreateAccessKey\")",
      ].join("\n"),
      sql: [
        "SELECT window_start, user_arn, event_name, COUNT(*) AS attempts,",
        "       COUNT(DISTINCT source_ip) AS distinct_ips",
        "FROM cloudtrail_events",
        "WHERE event_name IN ('ConsoleLogin','AssumeRole','GetSessionToken','CreateAccessKey')",
        "GROUP BY TUMBLE(ts, INTERVAL '30' MINUTE), user_arn, event_name",
        "HAVING COUNT(*) > 5 OR COUNT(DISTINCT source_ip) > 2;",
      ].join("\n"),
    },
    architecturalFix:
      "Require phishing-resistant MFA, enforce just-in-time role elevation, and remove long-lived access keys via centralized identity federation.",
    d3fend:
      "D3-MFA (Multi-factor Authentication) + D3-UAP (User Account Permissions)",
    testCommand:
      "python3 -m pacu --module iam__enum_permissions --session sec-sme-lab",
    successCriteria:
      "Abnormal account use is rapidly detected and restricted by conditional access and role governance.",
    failureSignal:
      "Credential reuse from novel IP/geo proceeds undetected or unchallenged.",
  },
  {
    id: "T1195",
    name: "Supply Chain Compromise",
    domain: "Supply Chain",
    keywords: ["dependency confusion", "pipeline", "supply chain", "artifact tamper", "build compromise"],
    context:
      "Adversaries compromise build systems or dependencies to insert malicious code into trusted release pipelines.",
    telemetry: [
      "CI workflow execution logs and approvals",
      "Package signature verification outcomes",
      "Artifact hash and provenance attestations",
    ],
    commandDescription:
      "Run dependency integrity and infrastructure-as-code checks for pipeline trust",
    command:
      "steampipe query \"select repository, name, version, vulnerable from github_repository_dependency where vulnerable = true;\"",
    queries: {
      kql: [
        "PipelineAuditLogs",
        '| where Action in ("workflow_dispatch", "package_publish", "token_create", "secrets_access")',
        "| summarize Events=count(), Actors=dcount(Actor) by Repo, Action, bin(TimeGenerated, 1h)",
        "| where Events > 3 and Actors > 1",
      ].join("\n"),
      spl: [
        'index=cicd action IN ("workflow_dispatch","package_publish","token_create","secrets_access")',
        "| bin _time span=1h",
        "| stats count as events dc(actor) as actors by _time, repo, action",
        "| where events > 3 AND actors > 1",
      ].join("\n"),
      eql: [
        "any where event.category == \"configuration\"",
        "and event.action in (\"workflow_dispatch\", \"package_publish\", \"token_create\", \"secrets_access\")",
      ].join("\n"),
      sql: [
        "SELECT window_start, repo, action, COUNT(*) AS events, COUNT(DISTINCT actor) AS actors",
        "FROM pipeline_audit_logs",
        "WHERE action IN ('workflow_dispatch','package_publish','token_create','secrets_access')",
        "GROUP BY TUMBLE(ts, INTERVAL '1' HOUR), repo, action",
        "HAVING COUNT(*) > 3 AND COUNT(DISTINCT actor) > 1;",
      ].join("\n"),
    },
    architecturalFix:
      "Enforce signed commits/tags, provenance attestations (SLSA), and immutable build environments with OIDC-based short-lived credentials.",
    d3fend:
      "D3-SCA (Software Composition Analysis) + D3-BPM (Build Process Monitoring)",
    testCommand:
      "caldera --operation supply-chain-emulation --adversary custom_t1195",
    successCriteria:
      "Unauthorized package/pipeline actions are blocked and produce high-confidence detections with actor traceability.",
    failureSignal:
      "Suspicious publish or token actions occur without control-plane containment.",
  },
];

const TOOL_CHOICES = {
  Endpoint: "Sigma + KQL + Atomic Red Team",
  Cloud: "Prowler + Steampipe + Cloud Custodian",
  Network: "MITRE Navigator + Sigma + Splunk/KQL",
  Identity: "Sigma + KQL + DeTT&CT",
  "Supply Chain": "Steampipe + Prowler + MITRE D3FEND",
};

const LEARNING_SETUP = {
  Endpoint: {
    install: "Install-Module Invoke-AtomicRedTeam -Scope CurrentUser",
    execute:
      "Invoke-AtomicTest T1059.001 -TestNumbers 1 -ExecutionLogPath ./atomic-learning.log",
    observation:
      "You should observe process + command-line telemetry and a matching SIEM analytic event with ATT&CK tag T1059.001.",
  },
  Cloud: {
    install: "pip3 install prowler",
    execute:
      "prowler aws -g iam --output-formats json --output-directory ./prowler-learning",
    observation:
      "Output should include failed/pass checks with service, region, and remediation metadata for IAM misconfigurations.",
  },
  Network: {
    install: "docker pull mitre/caldera:latest",
    execute: "docker run --rm -p 8888:8888 mitre/caldera:latest --insecure",
    observation:
      "You should observe simulated beaconing patterns and corresponding proxy/DNS spikes in hunt queries.",
  },
  Identity: {
    install: "pip3 install dettect",
    execute:
      "dettect detect --datasource --input my-datasource.yaml --output mapping.html",
    observation:
      "Coverage output should show which identity ATT&CK techniques have sufficient telemetry and where gaps remain.",
  },
  "Supply Chain": {
    install: "brew install turbot/tap/steampipe || sudo snap install steampipe",
    execute:
      "steampipe query \"select name, version, vulnerable from github_repository_dependency where vulnerable = true;\"",
    observation:
      "Result set should enumerate vulnerable dependencies with repository context for immediate triage.",
  },
};

const DEFAULT_DOMAIN = "Endpoint";
const DEFAULT_PERSONA = "ARCHITECT";
const DEFAULT_MODE = "TEACH";

function toNormalizedText(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizeDomain(value) {
  if (!value) {
    return null;
  }
  const direct = Object.keys(DOMAIN_KEYWORDS).find(
    (domain) => domain.toLowerCase() === String(value).trim().toLowerCase(),
  );
  if (direct) {
    return direct;
  }
  if (String(value).trim().toLowerCase() === "supplychain") {
    return "Supply Chain";
  }
  return null;
}

function inferDomain(userQuery) {
  const input = toNormalizedText(userQuery);
  let bestDomain = DEFAULT_DOMAIN;
  let bestScore = -1;

  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    const score = keywords.reduce(
      (sum, keyword) => sum + (input.includes(keyword) ? 1 : 0),
      0,
    );
    if (score > bestScore) {
      bestScore = score;
      bestDomain = domain;
    }
  }

  return bestDomain;
}

function inferMode(userMode, userQuery) {
  const normalizedMode = toNormalizedText(userMode).toUpperCase();
  if (MODES.includes(normalizedMode)) {
    return normalizedMode;
  }

  const query = toNormalizedText(userQuery);
  if (/(hunt|hunt for|triage|detect in logs|search logs)/i.test(query)) {
    return "HUNT";
  }
  if (/(scenario|exercise|hands-on|lab|work mode|solve)/i.test(query)) {
    return "WORK";
  }
  return DEFAULT_MODE;
}

function inferPersona(userPersona) {
  const normalized = toNormalizedText(userPersona).toUpperCase();
  if (PERSONA_CONFIG[normalized]) {
    return normalized;
  }
  return DEFAULT_PERSONA;
}

function inferTechnique(domain, userQuery) {
  const input = toNormalizedText(userQuery);
  const candidates = TECHNIQUES.filter((technique) => technique.domain === domain);

  let bestMatch = candidates[0] || TECHNIQUES[0];
  let bestScore = -1;

  for (const technique of candidates) {
    const score = technique.keywords.reduce(
      (sum, keyword) => sum + (input.includes(keyword) ? 1 : 0),
      0,
    );
    if (score > bestScore) {
      bestScore = score;
      bestMatch = technique;
    }
  }

  return bestMatch;
}

function inferStrategicObjective(domain, technique, userObjective, userQuery) {
  if (String(userObjective || "").trim()) {
    return String(userObjective).trim();
  }

  const query = toNormalizedText(userQuery);
  if (query.includes("least privilege")) {
    return "Least privilege";
  }
  if (query.includes("egress")) {
    return "Egress filtering";
  }
  if (query.includes("mfa")) {
    return "Strong authentication enforcement";
  }
  if (query.includes("ransom")) {
    return "Ransomware blast-radius reduction";
  }

  const defaultObjectives = DOMAIN_OBJECTIVES[domain] || [];
  if (technique.id === "T1078") {
    return "Least privilege IAM";
  }
  if (technique.id === "T1195") {
    return "Pipeline trust hardening";
  }
  return defaultObjectives[0] || "Security control hardening";
}

function inferQueryLanguage(userQuery) {
  const input = toNormalizedText(userQuery);
  if (input.includes("splunk") || /\bspl\b/.test(input)) {
    return "spl";
  }
  if (input.includes("elastic") || input.includes("eql")) {
    return "eql";
  }
  if (input.includes("sql") || input.includes("steampipe")) {
    return "sql";
  }
  return "kql";
}

function inferToolChoice(domain, mode, persona) {
  if (mode === "WORK") {
    return "Atomic Red Team + Caldera + Sigma";
  }
  if (persona === "STRATEGIST") {
    return "MITRE D3FEND + ATT&CK Decider + Cloud Custodian";
  }
  return TOOL_CHOICES[domain] || "Sigma + MITRE Navigator";
}

function hasLearningIntent(userQuery, mode) {
  const input = toNormalizedText(userQuery);
  if (mode === "TEACH") {
    return true;
  }
  return /(learn|teach|how to use|getting started|installation|setup)/i.test(input);
}

function buildTelemetryList(domain, technique) {
  const baseline = DOMAIN_TELEMETRY[domain] || [];
  const techniqueSpecific = technique.telemetry || [];
  const merged = [...new Set([...baseline, ...techniqueSpecific])];
  return merged.slice(0, 5);
}

function formatOutput({
  persona,
  mode,
  domain,
  objective,
  technique,
  toolChoice,
  command,
  commandDescription,
  queryLanguage,
  query,
  telemetry,
  learning,
  assumptions,
}) {
  const lines = [
    `[PERSONA]: ${persona} - ${PERSONA_CONFIG[persona].label}`,
    `[MODE]: ${mode}`,
    `[SUBJECT AREA]: ${domain} | ${objective}`,
    "",
    "1. Adversary Mapping (MITRE)",
    `- Technique: ${technique.name} (${technique.id})`,
    `- Context: ${technique.context}`,
    "",
    "2. Technical Execution (The How-To)",
    `- Tool Choice: ${toolChoice}`,
    "- Telemetry Requirements:",
    ...telemetry.map((item) => `  - ${item}`),
    "- Command:",
    "```bash",
    `# ${commandDescription}`,
    command,
    "```",
    "- Query:",
    `\`\`\`${queryLanguage}`,
    "// Detection logic purpose",
    query,
    "```",
  ];

  if (learning) {
    lines.push(
      "- Learning Rule Applied:",
      "```bash",
      "# Installation / setup",
      learning.install,
      "",
      "# Technique-specific execution",
      learning.execute,
      "```",
      `- Observation: ${learning.observation}`,
    );
  }

  lines.push(
    "",
    "3. Strategic Prevention (Higher Hierarchy)",
    `- Architectural Fix: ${technique.architecturalFix}`,
    `- D3FEND Mapping: ${technique.d3fend}`,
    "",
    "4. Validation (Proof)",
    `- Test Command: ${technique.testCommand}`,
    `- Success Criteria: ${technique.successCriteria}`,
    `- Failure Signal: ${technique.failureSignal}`,
  );

  if (assumptions.length) {
    lines.push("", "Assumptions:", ...assumptions.map((item) => `- ${item}`));
  }

  return lines.join("\n");
}

function validateRequest(body) {
  const errors = [];
  if (!body || typeof body !== "object") {
    return ["Request body must be a JSON object."];
  }

  if (!String(body.userQuery || "").trim()) {
    errors.push("userQuery is required.");
  }
  if (String(body.userQuery || "").length > 5000) {
    errors.push("userQuery must be 5000 characters or fewer.");
  }
  if (body.mode && !MODES.includes(String(body.mode).trim().toUpperCase())) {
    errors.push("mode must be one of TEACH, HUNT, or WORK.");
  }
  if (body.persona) {
    const persona = String(body.persona).trim().toUpperCase();
    if (!PERSONA_CONFIG[persona]) {
      errors.push(
        `persona must be one of: ${Object.keys(PERSONA_CONFIG).join(", ")}.`,
      );
    }
  }
  if (body.domain && !normalizeDomain(body.domain)) {
    errors.push(
      "domain must be one of Endpoint, Cloud, Network, Identity, or Supply Chain.",
    );
  }
  return errors;
}

function generateSecSmeResponse(body) {
  const errors = validateRequest(body);
  if (errors.length) {
    return { ok: false, errors };
  }

  const userQuery = String(body.userQuery || "").trim();
  const persona = inferPersona(body.persona);
  const mode = inferMode(body.mode, userQuery);
  const domain = normalizeDomain(body.domain) || inferDomain(userQuery);
  const technique = inferTechnique(domain, userQuery);
  const objective = inferStrategicObjective(
    domain,
    technique,
    body.strategicObjective,
    userQuery,
  );
  const queryLanguage = inferQueryLanguage(userQuery);
  const query = technique.queries[queryLanguage] || technique.queries.kql;
  const toolChoice = inferToolChoice(domain, mode, persona);
  const telemetry = buildTelemetryList(domain, technique);
  const learningIntent = hasLearningIntent(userQuery, mode);
  const learning = learningIntent ? LEARNING_SETUP[domain] : null;

  const assumptions = [];
  if (!body.mode) {
    assumptions.push(`Mode inferred as ${mode} from request intent.`);
  }
  if (!body.domain) {
    assumptions.push(`Domain inferred as ${domain} from keywords in user query.`);
  }

  const formatted = formatOutput({
    persona,
    mode,
    domain,
    objective,
    technique,
    toolChoice,
    command: technique.command,
    commandDescription: technique.commandDescription,
    queryLanguage,
    query,
    telemetry,
    learning,
    assumptions,
  });

  return {
    ok: true,
    result: {
      persona,
      mode,
      domain,
      strategicObjective: objective,
      technique: {
        id: technique.id,
        name: technique.name,
        context: technique.context,
      },
      telemetry,
      toolChoice,
      command: technique.command,
      commandDescription: technique.commandDescription,
      queryLanguage,
      query,
      architecturalFix: technique.architecturalFix,
      d3fendMapping: technique.d3fend,
      validation: {
        testCommand: technique.testCommand,
        successCriteria: technique.successCriteria,
        failureSignal: technique.failureSignal,
      },
      assumptions,
      responseText: formatted,
    },
  };
}

module.exports = {
  PERSONA_CONFIG,
  MODES,
  DOMAIN_OPTIONS: Object.keys(DOMAIN_KEYWORDS),
  generateSecSmeResponse,
  validateRequest,
};
