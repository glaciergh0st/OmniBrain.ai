const previewGrid = document.getElementById("previewGrid");
const quickForm = document.getElementById("quickForm");
const quickPersona = document.getElementById("quickPersona");
const quickMode = document.getElementById("quickMode");
const quickDomain = document.getElementById("quickDomain");
const quickQuery = document.getElementById("quickQuery");
const clearQuickButton = document.getElementById("clearQuickButton");
const copyPreviewButton = document.getElementById("copyPreviewButton");
const downloadPreviewButton = document.getElementById("downloadPreviewButton");
const previewStatus = document.getElementById("previewStatus");
const previewOutput = document.getElementById("previewOutput");
const previewJson = document.getElementById("previewJson");

let latestText = "";

const demos = [
  {
    title: "Endpoint PowerShell Hunt",
    persona: "ARCHITECT",
    mode: "HUNT",
    domain: "Endpoint",
    userQuery:
      "Hunt for suspicious PowerShell encoded commands on Windows endpoints. Map to ATT&CK and provide KQL plus a validation test.",
  },
  {
    title: "Cloud Valid Accounts Abuse",
    persona: "STRATEGIST",
    mode: "TEACH",
    domain: "Cloud",
    userQuery:
      "Teach how to detect and reduce risk for suspicious AssumeRole and ConsoleLogin patterns in AWS with architectural prevention.",
  },
  {
    title: "Network C2 Beaconing",
    persona: "FORENSICS",
    mode: "WORK",
    domain: "Network",
    userQuery:
      "Provide a scenario to investigate possible HTTP/S beaconing and include telemetry, detection query, and proof steps.",
  },
  {
    title: "Supply Chain Integrity",
    persona: "OFFENSIVE",
    mode: "HUNT",
    domain: "Supply Chain",
    userQuery:
      "Hunt for suspicious CI workflow dispatch and package publish behavior indicating supply chain compromise.",
  },
];

function setStatus(message, type = "") {
  previewStatus.textContent = message;
  previewStatus.classList.remove("ok", "error");
  if (type) {
    previewStatus.classList.add(type);
  }
}

function prettyJson(value) {
  return JSON.stringify(value, null, 2);
}

async function callRespond(payload) {
  const response = await fetch("/api/respond", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const text = Array.isArray(data.errors)
      ? data.errors.join(" ")
      : data.error || `Request failed: ${response.status}`;
    throw new Error(text);
  }
  return data;
}

function renderResult(result) {
  latestText = result.responseText || "";
  previewOutput.textContent = latestText || "No output returned.";
  previewJson.textContent = prettyJson(result);
  copyPreviewButton.disabled = !latestText;
  downloadPreviewButton.disabled = !latestText;
}

async function runPayload(payload, sourceLabel) {
  setStatus(`Running ${sourceLabel} demo...`);
  try {
    const result = await callRespond(payload);
    renderResult(result);
    setStatus(`${sourceLabel} demo complete.`, "ok");
  } catch (error) {
    setStatus(error.message, "error");
  }
}

function createCard(demo) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "preview-card";

  const title = document.createElement("strong");
  title.textContent = demo.title;
  button.appendChild(title);

  const meta = document.createElement("span");
  meta.className = "meta";
  meta.textContent = `${demo.persona} | ${demo.mode} | ${demo.domain}`;
  button.appendChild(meta);

  const desc = document.createElement("span");
  desc.textContent = demo.userQuery;
  button.appendChild(desc);

  button.addEventListener("click", () => {
    quickPersona.value = demo.persona;
    quickMode.value = demo.mode;
    quickDomain.value = demo.domain;
    quickQuery.value = demo.userQuery;
    runPayload(demo, demo.title);
  });

  return button;
}

function renderCards() {
  previewGrid.innerHTML = "";
  demos.forEach((demo) => {
    previewGrid.appendChild(createCard(demo));
  });
}

quickForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = {
    persona: quickPersona.value,
    mode: quickMode.value,
    domain: quickDomain.value || undefined,
    userQuery: quickQuery.value.trim(),
  };

  if (!payload.userQuery) {
    setStatus("Enter a scenario before running quick test.", "error");
    quickQuery.focus();
    return;
  }

  await runPayload(payload, "Quick test");
});

clearQuickButton.addEventListener("click", () => {
  quickForm.reset();
  quickPersona.value = "ARCHITECT";
  quickMode.value = "TEACH";
  quickDomain.value = "";
  quickQuery.value = "";
  latestText = "";
  previewOutput.textContent = "";
  previewJson.textContent = "";
  copyPreviewButton.disabled = true;
  downloadPreviewButton.disabled = true;
  setStatus("Preview form and output cleared.", "ok");
});

copyPreviewButton.addEventListener("click", async () => {
  if (!latestText) {
    return;
  }
  try {
    await navigator.clipboard.writeText(latestText);
    setStatus("Output copied to clipboard.", "ok");
  } catch (_error) {
    setStatus("Clipboard access failed in this browser context.", "error");
  }
});

downloadPreviewButton.addEventListener("click", () => {
  if (!latestText) {
    return;
  }
  const blob = new Blob([latestText], { type: "text/markdown" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  link.download = `sec-sme-preview-${stamp}.md`;
  link.click();
  URL.revokeObjectURL(link.href);
  setStatus("Output downloaded.", "ok");
});

function bootstrap() {
  renderCards();
  setStatus("Click any demo card to preview immediately.", "ok");
}

bootstrap();
