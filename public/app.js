const requestForm = document.getElementById("requestForm");
const personaSelect = document.getElementById("personaSelect");
const modeSelect = document.getElementById("modeSelect");
const domainSelect = document.getElementById("domainSelect");
const objectiveInput = document.getElementById("objectiveInput");
const queryInput = document.getElementById("queryInput");
const submitButton = document.getElementById("submitButton");
const sampleButton = document.getElementById("sampleButton");
const resetButton = document.getElementById("resetButton");
const loadPromptButton = document.getElementById("loadPromptButton");
const copyResponseButton = document.getElementById("copyResponseButton");
const downloadResponseButton = document.getElementById("downloadResponseButton");
const statusMessage = document.getElementById("statusMessage");
const responseOutput = document.getElementById("responseOutput");
const jsonOutput = document.getElementById("jsonOutput");
const promptOutput = document.getElementById("promptOutput");
const promptDetails = document.getElementById("promptDetails");
const historyList = document.getElementById("historyList");

const HISTORY_KEY = "sec-sme-recent-scenarios";
const MAX_HISTORY = 8;

let latestResponseText = "";
let historyItems = [];

const sampleScenario =
  "Need a [MODE:HUNT] plan for suspicious PowerShell activity on Windows endpoints. " +
  "Map to ATT&CK, provide Sigma/KQL style logic, and give an Atomic test for validation.";

function setStatus(message, type = "") {
  statusMessage.textContent = message;
  statusMessage.classList.remove("ok", "error");
  if (type) {
    statusMessage.classList.add(type);
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

function populateConfig(config) {
  if (Array.isArray(config.personas)) {
    const currentPersona = personaSelect.value || "ARCHITECT";
    personaSelect.innerHTML = "";
    config.personas.forEach((persona) => {
      const option = document.createElement("option");
      option.value = persona.id;
      option.textContent = `${persona.id} - ${persona.label}`;
      if (persona.id === currentPersona) {
        option.selected = true;
      }
      personaSelect.appendChild(option);
    });
  }

  if (Array.isArray(config.domains)) {
    const currentDomain = domainSelect.value;
    domainSelect.innerHTML = "";
    const autoOption = document.createElement("option");
    autoOption.value = "";
    autoOption.textContent = "Auto (infer from query)";
    domainSelect.appendChild(autoOption);

    config.domains.forEach((domain) => {
      const option = document.createElement("option");
      option.value = domain;
      option.textContent = domain;
      if (domain === currentDomain) {
        option.selected = true;
      }
      domainSelect.appendChild(option);
    });
  }
}

function readFormPayload() {
  return {
    persona: personaSelect.value,
    mode: modeSelect.value,
    domain: domainSelect.value,
    strategicObjective: objectiveInput.value.trim(),
    userQuery: queryInput.value.trim(),
  };
}

function prunePayload(payload) {
  const cleaned = {};
  Object.entries(payload).forEach(([key, value]) => {
    if (String(value || "").trim()) {
      cleaned[key] = String(value).trim();
    }
  });
  return cleaned;
}

function renderResponse(result) {
  latestResponseText = result.responseText || "";
  responseOutput.textContent =
    latestResponseText || "No response text returned by API.";
  jsonOutput.textContent = JSON.stringify(result, null, 2);
  copyResponseButton.disabled = !latestResponseText;
  downloadResponseButton.disabled = !latestResponseText;
}

function saveHistory() {
  window.localStorage.setItem(HISTORY_KEY, JSON.stringify(historyItems));
}

function loadHistory() {
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    historyItems = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(historyItems)) {
      historyItems = [];
    }
  } catch (_error) {
    historyItems = [];
  }
  renderHistory();
}

function renderHistory() {
  historyList.innerHTML = "";
  if (!historyItems.length) {
    const empty = document.createElement("li");
    empty.className = "history-item";
    empty.textContent = "No recent scenarios yet.";
    historyList.appendChild(empty);
    return;
  }

  historyItems.forEach((item, index) => {
    const li = document.createElement("li");
    li.className = "history-item";
    const button = document.createElement("button");
    button.type = "button";
    button.addEventListener("click", () => applyHistoryItem(index));
    const queryPreview =
      item.userQuery.length > 100
        ? `${item.userQuery.slice(0, 100)}...`
        : item.userQuery;
    button.textContent = queryPreview;

    const meta = document.createElement("span");
    meta.className = "meta";
    meta.textContent = `${item.persona} | ${item.mode || "AUTO"} | ${
      item.domain || "AUTO"
    } | ${new Date(item.timestamp).toLocaleString()}`;

    button.appendChild(meta);
    li.appendChild(button);
    historyList.appendChild(li);
  });
}

function addToHistory(payload, responseText) {
  const newItem = {
    ...payload,
    responseText,
    timestamp: new Date().toISOString(),
  };
  historyItems.unshift(newItem);
  historyItems = historyItems.slice(0, MAX_HISTORY);
  saveHistory();
  renderHistory();
}

function applyHistoryItem(index) {
  const item = historyItems[index];
  if (!item) {
    return;
  }
  personaSelect.value = item.persona || "ARCHITECT";
  modeSelect.value = item.mode || "";
  domainSelect.value = item.domain || "";
  objectiveInput.value = item.strategicObjective || "";
  queryInput.value = item.userQuery || "";
  if (item.responseText) {
    responseOutput.textContent = item.responseText;
    latestResponseText = item.responseText;
    copyResponseButton.disabled = false;
    downloadResponseButton.disabled = false;
  }
  setStatus("Loaded scenario from history.", "ok");
}

async function handleSubmit(event) {
  event.preventDefault();

  const payload = prunePayload(readFormPayload());
  if (!payload.userQuery) {
    setStatus("Please provide a scenario or request.", "error");
    queryInput.focus();
    return;
  }

  submitButton.disabled = true;
  setStatus("Generating SEC SME response...");

  try {
    const result = await apiRequest("/api/respond", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    renderResponse(result);
    addToHistory(payload, result.responseText || "");
    setStatus("Response generated successfully.", "ok");
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    submitButton.disabled = false;
  }
}

function handleReset() {
  requestForm.reset();
  modeSelect.value = "";
  domainSelect.value = "";
  responseOutput.textContent = "";
  jsonOutput.textContent = "";
  latestResponseText = "";
  copyResponseButton.disabled = true;
  downloadResponseButton.disabled = true;
  setStatus("Form and outputs cleared.", "ok");
}

function handleSample() {
  queryInput.value = sampleScenario;
  personaSelect.value = "ARCHITECT";
  modeSelect.value = "HUNT";
  domainSelect.value = "Endpoint";
  objectiveInput.value = "Script execution governance";
  setStatus("Sample scenario loaded.", "ok");
}

async function handleLoadPrompt() {
  loadPromptButton.disabled = true;
  setStatus("Loading system prompt...");
  try {
    const result = await apiRequest("/api/system-prompt");
    promptOutput.textContent = result.prompt || "System prompt is empty.";
    promptDetails.open = true;
    setStatus("System prompt loaded.", "ok");
  } catch (error) {
    setStatus(error.message, "error");
  } finally {
    loadPromptButton.disabled = false;
  }
}

async function copyResponse() {
  if (!latestResponseText) {
    return;
  }
  try {
    await navigator.clipboard.writeText(latestResponseText);
    setStatus("Response copied to clipboard.", "ok");
  } catch (_error) {
    setStatus("Clipboard copy failed in this browser context.", "error");
  }
}

function downloadResponse() {
  if (!latestResponseText) {
    return;
  }
  const blob = new Blob([latestResponseText], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  link.href = url;
  link.download = `sec-sme-response-${stamp}.md`;
  link.click();
  URL.revokeObjectURL(url);
  setStatus("Response downloaded.", "ok");
}

async function bootstrap() {
  setStatus("Initializing application...");
  loadHistory();
  try {
    const config = await apiRequest("/api/config");
    populateConfig(config);
    setStatus("Ready.", "ok");
  } catch (error) {
    setStatus(`Config load failed: ${error.message}`, "error");
  }
}

requestForm.addEventListener("submit", handleSubmit);
sampleButton.addEventListener("click", handleSample);
resetButton.addEventListener("click", handleReset);
loadPromptButton.addEventListener("click", handleLoadPrompt);
copyResponseButton.addEventListener("click", copyResponse);
downloadResponseButton.addEventListener("click", downloadResponse);

bootstrap();
