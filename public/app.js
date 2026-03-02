const settingsForm = document.getElementById("settingsForm");
const personaSelect = document.getElementById("personaSelect");
const modeSelect = document.getElementById("modeSelect");
const modelSelect = document.getElementById("modelSelect");
const domainSelect = document.getElementById("domainSelect");
const objectiveInput = document.getElementById("objectiveInput");
const contextToggle = document.getElementById("contextToggle");
const teamPersonaGrid = document.getElementById("teamPersonaGrid");
const templateButtons = document.getElementById("templateButtons");
const chatForm = document.getElementById("chatForm");
const messageInput = document.getElementById("messageInput");
const sendButton = document.getElementById("sendButton");
const newChatButton = document.getElementById("newChatButton");
const copyLastButton = document.getElementById("copyLastButton");
const downloadLastButton = document.getElementById("downloadLastButton");
const loadPromptButton = document.getElementById("loadPromptButton");
const statusMessage = document.getElementById("statusMessage");
const providerInfo = document.getElementById("providerInfo");
const runtimeBadge = document.getElementById("runtimeBadge");
const chatThread = document.getElementById("chatThread");
const roleCoverageList = document.getElementById("roleCoverageList");
const phaseList = document.getElementById("phaseList");
const backlogList = document.getElementById("backlogList");
const kpiList = document.getElementById("kpiList");
const riskList = document.getElementById("riskList");
const jsonOutput = document.getElementById("jsonOutput");
const promptOutput = document.getElementById("promptOutput");
const promptDetails = document.getElementById("promptDetails");

const SETTINGS_KEY = "sec-sme-chat-settings-v3";
const CHAT_KEY = "sec-sme-chat-history-v3";
const MAX_SAVED_MESSAGES = 30;
const MAX_CONTEXT_MESSAGES = 12;
const PERSONAS = ["ARCHITECT", "OFFENSIVE", "FORENSICS", "STRATEGIST"];

const TEMPLATE_LIBRARY = {
  hunt: {
    mode: "HUNT",
    model: "deepseek-chat",
    domain: "Endpoint",
    objective: "Detection engineering uplift",
    message:
      "Build a hunt mission for suspicious script execution and credential access. I need ATT&CK mapping, telemetry requirements, queries, controls, and validation proof.",
  },
  cloud: {
    mode: "WORK",
    model: "deepseek-chat",
    domain: "Cloud",
    objective: "Least privilege IAM",
    message:
      "Create a cloud hardening mission for stolen session token abuse across AWS and Entra. Provide phased implementation for a small team.",
  },
  ir: {
    mode: "WORK",
    model: "deepseek-chat",
    domain: "Identity",
    objective: "Incident containment acceleration",
    message:
      "Guide an incident response workflow for suspicious valid-account abuse with containment actions, forensic artifacts, and executive update outputs.",
  },
  board: {
    mode: "TEACH",
    model: "deepseek-reasoner",
    domain: "",
    objective: "Business risk reduction",
    message:
      "Give me a board-ready security initiative plan that maps technical controls to measurable business outcomes and staffing constraints.",
  },
};

let conversation = [];
let latestAssistantText = "";
let latestStructuredResponse = null;
let isRequestInFlight = false;

function setStatus(message, type = "") {
  statusMessage.textContent = message;
  statusMessage.classList.remove("ok", "error");
  if (type) {
    statusMessage.classList.add(type);
  }
}

function setRuntimeBadge(text, className = "") {
  runtimeBadge.textContent = text;
  runtimeBadge.classList.remove("badge-ok", "badge-warn", "badge-error");
  if (className) {
    runtimeBadge.classList.add(className);
  }
}

async function apiRequest(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const errorText = Array.isArray(payload.errors)
      ? payload.errors.join(" ")
      : payload.error || `Request failed with status ${response.status}.`;
    throw new Error(errorText);
  }
  return payload;
}

function getSelectedTeamPersonas() {
  const selected = Array.from(
    teamPersonaGrid.querySelectorAll(".persona-tile.active[data-persona]"),
  )
    .map((element) => element.getAttribute("data-persona"))
    .filter(Boolean);
  return selected.length ? selected : [personaSelect.value || "ARCHITECT"];
}

function setSelectedTeamPersonas(personas) {
  const personaSet = new Set(
    (Array.isArray(personas) ? personas : [])
      .map((item) => String(item || "").toUpperCase())
      .filter((item) => PERSONAS.includes(item)),
  );
  if (!personaSet.size) {
    personaSet.add(personaSelect.value || "ARCHITECT");
  }

  teamPersonaGrid.querySelectorAll(".persona-tile[data-persona]").forEach((tile) => {
    const persona = tile.getAttribute("data-persona");
    tile.classList.toggle("active", personaSet.has(persona));
  });
}

function syncLeadPersonaIntoTeam() {
  const lead = String(personaSelect.value || "ARCHITECT").toUpperCase();
  const selected = new Set(getSelectedTeamPersonas());
  selected.add(lead);
  setSelectedTeamPersonas(Array.from(selected));
}

function getSettingsFromForm() {
  return {
    persona: String(personaSelect.value || "ARCHITECT"),
    teamPersonas: getSelectedTeamPersonas(),
    mode: String(modeSelect.value || ""),
    model: String(modelSelect.value || ""),
    domain: String(domainSelect.value || ""),
    strategicObjective: String(objectiveInput.value || "").trim(),
    useContext: Boolean(contextToggle.checked),
  };
}

function persistSettings() {
  const settings = getSettingsFromForm();
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function restoreSettings() {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      syncLeadPersonaIntoTeam();
      return;
    }
    const parsed = JSON.parse(raw);
    personaSelect.value = parsed.persona || "ARCHITECT";
    modeSelect.value = parsed.mode || "";
    modelSelect.value = parsed.model || modelSelect.value || "deepseek-chat";
    domainSelect.value = parsed.domain || "";
    objectiveInput.value = parsed.strategicObjective || "";
    contextToggle.checked = parsed.useContext !== false;
    setSelectedTeamPersonas(parsed.teamPersonas);
    syncLeadPersonaIntoTeam();
  } catch (_error) {
    syncLeadPersonaIntoTeam();
  }
}

function persistConversation() {
  const trimmed = conversation.slice(-MAX_SAVED_MESSAGES);
  window.localStorage.setItem(CHAT_KEY, JSON.stringify(trimmed));
}

function restoreConversation() {
  try {
    const raw = window.localStorage.getItem(CHAT_KEY);
    if (!raw) {
      return;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return;
    }
    conversation = parsed
      .map((item) => ({
        role: item.role === "assistant" ? "assistant" : "user",
        content: String(item.content || "").trim(),
        timestamp: item.timestamp || new Date().toISOString(),
      }))
      .filter((item) => item.content);
  } catch (_error) {
    conversation = [];
  }
}

function formatTime(isoValue) {
  return new Date(isoValue).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildMessageNode(message, index) {
  const article = document.createElement("article");
  article.className = `message ${message.role}`;

  const header = document.createElement("div");
  header.className = "message-header";

  const title = document.createElement("strong");
  title.textContent = message.role === "assistant" ? "SEC SME Copilot" : "You";
  header.appendChild(title);

  const meta = document.createElement("span");
  meta.className = "message-meta";
  meta.textContent = formatTime(message.timestamp);
  header.appendChild(meta);

  if (message.role === "assistant") {
    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.className = "message-copy";
    copyButton.textContent = "Copy";
    copyButton.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(message.content);
        setStatus("Assistant message copied.", "ok");
      } catch (_error) {
        setStatus("Clipboard copy failed.", "error");
      }
    });
    header.appendChild(copyButton);
  }

  const body = document.createElement("pre");
  body.className = "message-body";
  body.textContent = message.content;

  article.appendChild(header);
  article.appendChild(body);
  article.setAttribute("data-message-index", String(index));
  return article;
}

function renderConversation() {
  chatThread.innerHTML = "";
  if (!conversation.length) {
    const empty = document.createElement("div");
    empty.className = "message system";
    empty.innerHTML =
      "<p><strong>Mission ready.</strong> Ask for detection engineering, incident response, cloud hardening, or executive strategy. This copilot will allocate responsibilities across SME personas for small teams.</p>";
    chatThread.appendChild(empty);
    return;
  }

  conversation.forEach((message, index) => {
    chatThread.appendChild(buildMessageNode(message, index));
  });
  chatThread.scrollTop = chatThread.scrollHeight;
}

function appendMessage(role, content) {
  const message = {
    role,
    content: String(content || "").trim(),
    timestamp: new Date().toISOString(),
  };
  if (!message.content) {
    return;
  }
  conversation.push(message);
  conversation = conversation.slice(-MAX_SAVED_MESSAGES);
  persistConversation();
  renderConversation();
}

function renderList(container, items, emptyText) {
  container.innerHTML = "";
  const values = Array.isArray(items) ? items : [];
  if (!values.length) {
    const li = document.createElement("li");
    li.textContent = emptyText;
    container.appendChild(li);
    return;
  }
  values.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    container.appendChild(li);
  });
}

function renderRoleCoverage(roleCoverage) {
  roleCoverageList.innerHTML = "";
  const roles = Array.isArray(roleCoverage) ? roleCoverage : [];
  if (!roles.length) {
    const empty = document.createElement("p");
    empty.className = "hint";
    empty.textContent = "Role coverage appears after first response.";
    roleCoverageList.appendChild(empty);
    return;
  }

  roles.forEach((role) => {
    const card = document.createElement("article");
    card.className = "role-card";

    const header = document.createElement("div");
    header.className = "role-card-header";
    const title = document.createElement("strong");
    title.textContent = role.persona || "PERSONA";
    const allocation = document.createElement("span");
    allocation.className = "role-allocation";
    allocation.textContent = `${role.timeAllocationPct || 0}%`;
    header.appendChild(title);
    header.appendChild(allocation);

    const responsibilities = document.createElement("ul");
    responsibilities.className = "mini-list";
    (role.responsibilities || []).forEach((item) => {
      const li = document.createElement("li");
      li.textContent = item;
      responsibilities.appendChild(li);
    });

    card.appendChild(header);
    card.appendChild(responsibilities);
    roleCoverageList.appendChild(card);
  });
}

function renderExecutionPhases(phases) {
  phaseList.innerHTML = "";
  const values = Array.isArray(phases) ? phases : [];
  if (!values.length) {
    const li = document.createElement("li");
    li.textContent = "Execution phases appear after first response.";
    phaseList.appendChild(li);
    return;
  }

  values.forEach((phase) => {
    const li = document.createElement("li");
    li.className = "phase-item";

    const heading = document.createElement("strong");
    heading.textContent = `${phase.phase || "Phase"} - ${phase.objective || ""}`;
    li.appendChild(heading);

    const tasks = document.createElement("ul");
    tasks.className = "mini-list";
    (phase.tasks || []).forEach((task) => {
      const taskItem = document.createElement("li");
      taskItem.textContent = task;
      tasks.appendChild(taskItem);
    });
    li.appendChild(tasks);
    phaseList.appendChild(li);
  });
}

function renderBoard(result) {
  renderRoleCoverage(result.roleCoverage);
  renderExecutionPhases(result.executionPhases);
  renderList(backlogList, result.priorityBacklog, "Backlog unavailable.");
  renderList(kpiList, result.kpis, "KPI list unavailable.");

  const riskItems = Array.isArray(result.riskRegister)
    ? result.riskRegister.map((item) => {
        const owner = item.owner ? ` [${item.owner}]` : "";
        return `${item.risk}${owner} -> ${item.mitigation}`;
      })
    : [];
  renderList(riskList, riskItems, "Risk register unavailable.");
}

function clearBoard() {
  renderRoleCoverage([]);
  renderExecutionPhases([]);
  renderList(backlogList, [], "Backlog unavailable.");
  renderList(kpiList, [], "KPI list unavailable.");
  renderList(riskList, [], "Risk register unavailable.");
}

function renderStructuredResponse(result) {
  latestStructuredResponse = result;
  latestAssistantText = result?.responseText || "";
  jsonOutput.textContent = JSON.stringify(result, null, 2);
  renderBoard(result);
  copyLastButton.disabled = !latestAssistantText;
  downloadLastButton.disabled = !latestAssistantText;
}

function setLoadingState(loading) {
  isRequestInFlight = loading;
  sendButton.disabled = loading;
  messageInput.disabled = loading;
  sendButton.textContent = loading ? "Generating..." : "Send";
}

function buildChatPayload(userMessage) {
  const settings = getSettingsFromForm();
  const payload = {
    persona: settings.persona,
    teamPersonas: settings.teamPersonas,
    mode: settings.mode || undefined,
    model: settings.model || undefined,
    domain: settings.domain || undefined,
    strategicObjective: settings.strategicObjective || undefined,
    message: userMessage,
  };

  if (settings.useContext) {
    payload.history = conversation
      .slice(-MAX_CONTEXT_MESSAGES)
      .map((item) => ({
        role: item.role,
        content: item.content,
      }));
  }

  return payload;
}

async function handleChatSubmit(event) {
  event.preventDefault();
  if (isRequestInFlight) {
    return;
  }

  const message = String(messageInput.value || "").trim();
  if (!message) {
    setStatus("Enter a request before sending.", "error");
    messageInput.focus();
    return;
  }

  persistSettings();
  appendMessage("user", message);
  messageInput.value = "";
  setLoadingState(true);
  setStatus("Generating mission response...");

  const payload = buildChatPayload(message);

  try {
    const result = await apiRequest("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    appendMessage("assistant", result.responseText || "No response generated.");
    renderStructuredResponse(result);

    const providerLabel = result.fallbackUsed
      ? "Fallback engine"
      : `${result.provider || "llm"} (${result.model || "model"})`;
    providerInfo.textContent = `Provider: ${providerLabel} • Team roles: ${(
      result.teamPersonas || []
    ).join(", ")}`;

    setStatus(
      result.fallbackUsed
        ? "Generated in fallback mode. Configure API key for full AI reasoning."
        : "Generated with live AI provider.",
      result.fallbackUsed ? "error" : "ok",
    );
  } catch (error) {
    appendMessage(
      "assistant",
      `Generation failed: ${error.message}\n\nCheck provider configuration or retry.`,
    );
    setStatus(error.message, "error");
  } finally {
    setLoadingState(false);
    messageInput.focus();
  }
}

function newChat() {
  conversation = [];
  latestAssistantText = "";
  latestStructuredResponse = null;
  jsonOutput.textContent = "";
  copyLastButton.disabled = true;
  downloadLastButton.disabled = true;
  window.localStorage.removeItem(CHAT_KEY);
  renderConversation();
  clearBoard();
  setStatus("Started a new mission chat.", "ok");
}

async function copyLastResponse() {
  if (!latestAssistantText) {
    return;
  }
  try {
    await navigator.clipboard.writeText(latestAssistantText);
    setStatus("Copied last assistant response.", "ok");
  } catch (_error) {
    setStatus("Clipboard copy failed.", "error");
  }
}

function downloadLastResponse() {
  if (!latestAssistantText) {
    return;
  }
  const blob = new Blob([latestAssistantText], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  link.href = url;
  link.download = `sec-sme-mission-${stamp}.md`;
  link.click();
  URL.revokeObjectURL(url);
  setStatus("Downloaded last response.", "ok");
}

async function loadPrompt() {
  loadPromptButton.disabled = true;
  setStatus("Loading system prompt...");
  try {
    const result = await apiRequest("/api/system-prompt");
    promptOutput.textContent = result.prompt || "Prompt file is empty.";
    promptDetails.open = true;
    setStatus("System prompt loaded.", "ok");
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    loadPromptButton.disabled = false;
  }
}

async function loadRuntime() {
  try {
    const runtime = await apiRequest("/api/runtime");
    if (runtime.llm?.configured) {
      setRuntimeBadge(
        `AI Online · ${runtime.llm.model || "configured model"}`,
        "badge-ok",
      );
      providerInfo.textContent = `Provider: ${
        runtime.llm.provider || "llm"
      } (${runtime.llm.baseUrl})`;
    } else {
      setRuntimeBadge("AI Offline · Fallback mode", "badge-warn");
      providerInfo.textContent =
        "No API key configured. Deterministic fallback engine is active.";
    }
  } catch (_error) {
    setRuntimeBadge("Runtime unavailable", "badge-error");
  }
}

function populateConfig(config) {
  if (Array.isArray(config.personas)) {
    const current = personaSelect.value || "ARCHITECT";
    personaSelect.innerHTML = "";
    config.personas.forEach((persona) => {
      const option = document.createElement("option");
      option.value = persona.id;
      option.textContent = `${persona.id} - ${persona.label}`;
      option.selected = persona.id === current;
      personaSelect.appendChild(option);
    });
  }

  if (Array.isArray(config.domains)) {
    const current = domainSelect.value || "";
    domainSelect.innerHTML = "";
    const auto = document.createElement("option");
    auto.value = "";
    auto.textContent = "Auto infer";
    domainSelect.appendChild(auto);
    config.domains.forEach((domain) => {
      const option = document.createElement("option");
      option.value = domain;
      option.textContent = domain;
      option.selected = domain === current;
      domainSelect.appendChild(option);
    });
  }

  const models = Array.isArray(config.llmModels) ? config.llmModels : [];
  if (models.length) {
    const current = modelSelect.value || config.defaultModel || models[0];
    modelSelect.innerHTML = "";
    models.forEach((model) => {
      const option = document.createElement("option");
      option.value = model;
      option.textContent = model;
      option.selected = model === current;
      modelSelect.appendChild(option);
    });
  }
}

function handleInputKeydown(event) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    chatForm.requestSubmit();
  }
}

function handleTeamPersonaClick(event) {
  const button = event.target.closest(".persona-tile[data-persona]");
  if (!button) {
    return;
  }

  const persona = button.getAttribute("data-persona");
  button.classList.toggle("active");

  const selected = getSelectedTeamPersonas();
  if (!selected.length) {
    button.classList.add("active");
  }

  if (!getSelectedTeamPersonas().includes(personaSelect.value)) {
    syncLeadPersonaIntoTeam();
  }
  persistSettings();
}

function applyTemplate(templateKey) {
  const template = TEMPLATE_LIBRARY[templateKey];
  if (!template) {
    return;
  }

  modeSelect.value = template.mode || "";
  if (template.model) {
    modelSelect.value = template.model;
  }
  domainSelect.value = template.domain || "";
  objectiveInput.value = template.objective || "";
  messageInput.value = template.message || "";
  messageInput.focus();
  persistSettings();
  setStatus(`Template "${templateKey}" loaded.`, "ok");
}

function handleTemplateClick(event) {
  const button = event.target.closest(".template-btn[data-template]");
  if (!button) {
    return;
  }
  applyTemplate(button.getAttribute("data-template"));
}

async function bootstrap() {
  setStatus("Initializing...");
  restoreConversation();
  renderConversation();
  clearBoard();

  try {
    const config = await apiRequest("/api/config");
    populateConfig(config);
    restoreSettings();
    await loadRuntime();
    setStatus("Ready.", "ok");
  } catch (error) {
    setStatus(`Startup failed: ${error.message}`, "error");
  }
}

chatForm.addEventListener("submit", handleChatSubmit);
newChatButton.addEventListener("click", newChat);
copyLastButton.addEventListener("click", copyLastResponse);
downloadLastButton.addEventListener("click", downloadLastResponse);
loadPromptButton.addEventListener("click", loadPrompt);
settingsForm.addEventListener("change", persistSettings);
personaSelect.addEventListener("change", () => {
  syncLeadPersonaIntoTeam();
  persistSettings();
});
teamPersonaGrid.addEventListener("click", handleTeamPersonaClick);
templateButtons.addEventListener("click", handleTemplateClick);
messageInput.addEventListener("keydown", handleInputKeydown);

bootstrap();
