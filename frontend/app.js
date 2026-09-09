"use strict";

const STORAGE_KEY = "recordfinder.peerEndpoint";

const didInput = document.getElementById("didInput");
const statusEl = document.getElementById("status");
const resultEl = document.getElementById("result");

const peerToggle = document.getElementById("peerToggle");
const peerPanel = document.getElementById("peerPanel");
const peerInput = document.getElementById("peerInput");
const peerSaveBtn = document.getElementById("peerSaveBtn");
const peerResetBtn = document.getElementById("peerResetBtn");
const peerCurrent = document.getElementById("peerCurrent");

let defaultPeerEndpoint = "";
let allowClientPeerOverride = true;

function getStoredPeer() {
  return localStorage.getItem(STORAGE_KEY) || "";
}

function setStoredPeer(value) {
  if (value) localStorage.setItem(STORAGE_KEY, value);
  else localStorage.removeItem(STORAGE_KEY);
}

function refreshPeerCurrentLabel() {
  const active = getStoredPeer() || defaultPeerEndpoint;
  peerCurrent.textContent = `Aktiv: ${active}`;
}

async function loadConfig() {
  try {
    const res = await fetch("api/config");
    const cfg = await res.json();
    defaultPeerEndpoint = cfg.defaultPeerEndpoint || "";
    allowClientPeerOverride = Boolean(cfg.allowClientPeerOverride);
  } catch (err) {
    // Faellt auf ein leeres Standardfeld zurueck; der Server validiert ohnehin.
  }
  peerInput.placeholder = defaultPeerEndpoint || "peer0.example.org:7051";
  peerInput.value = getStoredPeer();
  peerInput.disabled = !allowClientPeerOverride;
  peerSaveBtn.disabled = !allowClientPeerOverride;
  refreshPeerCurrentLabel();
}

peerToggle.addEventListener("click", () => {
  const isHidden = peerPanel.classList.toggle("hidden");
  peerToggle.setAttribute("aria-expanded", String(!isHidden));
});

peerSaveBtn.addEventListener("click", () => {
  const value = peerInput.value.trim();
  if (value && !/^[a-zA-Z0-9.-]+:[0-9]{2,5}$/.test(value)) {
    statusEl.textContent = "Ungueltige Peer-Adresse. Format: host:port (z. B. peer0.example.org:7051)";
    return;
  }
  setStoredPeer(value);
  refreshPeerCurrentLabel();
  statusEl.textContent = value
    ? `Peer-Adresse gespeichert: ${value}`
    : "Peer-Adresse zurueckgesetzt auf Server-Standard.";
});

peerResetBtn.addEventListener("click", () => {
  setStoredPeer("");
  peerInput.value = "";
  refreshPeerCurrentLabel();
  statusEl.textContent = "Peer-Adresse zurueckgesetzt auf Server-Standard.";
});

function esc(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

function isBlank(value) {
  return value === null || value === undefined || value === "";
}

function didUnknown(didDocument) {
  // Der Record-Endpoint liefert bei Fehlern ein {error}-Objekt statt eines
  // Records; dessen Felder duerfen die Karten nicht fuellen.
  return Boolean(didDocument.error || didDocument.status === "not-found-in-mock");
}

function recordFields(record) {
  return record && !record.error ? record : {};
}

function jsonBlock(value) {
  return `<pre>${esc(JSON.stringify(value, null, 2))}</pre>`;
}

function fmtValue(value) {
  return typeof value === "object" ? jsonBlock(value) : esc(value);
}

function renderTable(entries) {
  // Leere Felder werden weggelassen, damit unvollstaendige Dokumente kein
  // halbleeres Tabellengerueste erzeugen.
  const rows = entries.filter(([, value]) => !isBlank(value));
  if (!rows.length) return `<p class="muted">Keine Angaben vorhanden.</p>`;
  return `<table class="meta-table">${rows
    .map(([label, value]) => `<tr><td>${esc(label)}</td><td>${fmtValue(value)}</td></tr>`)
    .join("")}</table>`;
}

function renderJson(value) {
  if (isBlank(value)) return `<p class="muted">Keine Daten vorhanden.</p>`;
  return jsonBlock(value);
}

function accordion(title, subtitle, body) {
  return `<details class="card"><summary>${esc(title)} <span class="step-label">${esc(
    subtitle
  )}</span></summary>${body}</details>`;
}

function payloadNotice(record, didDocument) {
  if (record && record.status === 403)
    return "Kein Payload vorhanden – der Record ist nicht finalisiert (Draft) und daher nicht öffentlich lesbar.";
  if (record && record.error) return record.error;
  if (!didDocument.recordEndpoint)
    return "Kein Payload vorhanden – das DID-Dokument verweist auf keinen Record-Endpoint.";
  return "Kein Payload vorhanden (Draft).";
}

function renderPayloadCard(data) {
  const payload = recordFields(data.fullRecord).payload;
  const hasPayload =
    !isBlank(payload) && !(typeof payload === "object" && !Object.keys(payload).length);
  if (!hasPayload) {
    return `<div class="card payload empty">
      <h2>Payload</h2>
      <p class="muted">${esc(payloadNotice(data.fullRecord, data.didDocument))}</p>
    </div>`;
  }
  const body =
    typeof payload === "object" && !Array.isArray(payload)
      ? renderTable(Object.entries(payload))
      : jsonBlock(payload);
  return `<div class="card payload"><h2>Payload</h2>${body}</div>`;
}

function renderDetailsCard(data) {
  const rec = recordFields(data.fullRecord);
  const didDocument = data.didDocument;
  const badge = rec.state ? `<span class="badge ${esc(rec.state)}">${esc(rec.state)}</span>` : "";
  return `<div class="card">
    <h2>Record-Details ${badge}</h2>
    ${renderTable([
      ["DID", rec.did || didDocument.id || didDocument.did],
      ["recordType", rec.recordType],
      ["schemaVersion", rec.schemaVersion],
      ["state", rec.state],
      ["owner", rec.owner || didDocument.controller],
      ["snapshotHash", rec.snapshotHash || didDocument.currentVersion],
      ["created", rec.recordCreated || rec.created || didDocument.created],
      ["updated", didDocument.updated],
      ["finalized", rec.finalized],
    ])}
  </div>`;
}

function renderMetadata(data) {
  const rec = recordFields(data.fullRecord);
  const didDocument = data.didDocument;
  return accordion(
    "Technische Metadaten",
    "alle übrigen Felder",
    renderTable([
      ["@context", didDocument["@context"]],
      ["controller", didDocument.controller],
      ["currentVersion", didDocument.currentVersion],
      ["recordEndpoint", didDocument.recordEndpoint],
      ["verificationMethod", didDocument.verificationMethod],
      ["parents", rec.parents],
      ["payloadHash", rec.payloadHash],
      ["payloadFormat", rec.payloadFormat],
      ["signature", rec.signature],
      ["correctionReason", rec.correctionReason],
      ["resolverSource", data.resolverSource],
      ["mock", didDocument.mock],
    ])
  );
}

function renderTrail(data) {
  const chaincode = data.chaincodeResult;
  return `<h2>Auflösungsweg</h2>
    ${accordion(
      "1. inputDid",
      "Eingabe des Nutzers",
      renderTable([
        ["inputDid", data.inputDid],
        ["extractedNamespace", data.extractedNamespace],
        ["peerEndpointUsed", data.peerEndpointUsed],
      ])
    )}
    ${accordion(
      "2. Root-Resolver-Chaincode",
      "namespace-registry / ResolveNamespace",
      renderTable([
        ["namespace", chaincode.namespace],
        ["resolverEndpoint", chaincode.resolverEndpoint],
        ["registeredBy", chaincode.registeredBy],
        ["registeredAt", chaincode.registeredAt],
        ["txId", chaincode.txId],
        ["endorsedBy", chaincode.endorsedBy],
      ])
    )}
    ${accordion(
      "3. resolverEndpointCalled",
      "DID-Dokument abrufen",
      renderTable([
        ["resolverEndpointCalled", data.resolverEndpointCalled],
        ["resolverSource", data.resolverSource],
      ]) + `<p class="hint">Antwort (DID-Dokument):</p>${renderJson(data.didDocument)}`
    )}
    ${accordion(
      "4. recordEndpointCalled",
      "Record abrufen",
      renderTable([["recordEndpointCalled", data.recordEndpointCalled]]) +
        `<p class="hint">Antwort (Record):</p>${renderJson(data.fullRecord)}`
    )}`;
}

function renderResult(data) {
  const doc = data.didDocument;
  const head = didUnknown(doc)
    ? `<div class="card error">
        <h2>DID beim Resolver unbekannt</h2>
        <p>${esc(doc.message || doc.error)}</p>
      </div>`
    : renderPayloadCard(data) + renderDetailsCard(data);

  resultEl.innerHTML = head + renderMetadata(data) + renderTrail(data);
  resultEl.classList.remove("hidden");
}

async function resolveDid() {
  statusEl.textContent = "Suche über Blockchain …";
  resultEl.classList.add("hidden");
  try {
    const did = didInput.value.trim();
    const params = new URLSearchParams({ did });
    const peer = getStoredPeer();
    if (peer) params.set("peer", peer);

    const res = await fetch(`api/resolve?${params.toString()}`);
    const data = await res.json();
    if (!res.ok) {
      statusEl.textContent = `Fehler: ${data.error || "HTTP " + res.status}`;
      return;
    }
    const doc = data.didDocument || {};
    statusEl.textContent = `Namespace ${data.extractedNamespace} → ${data.resolverEndpointCalled}`;
    renderResult(data);
  } catch (err) {
    statusEl.textContent = "Fehler: " + err.message;
  }
}

document.getElementById("resolveBtn").addEventListener("click", resolveDid);
didInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") resolveDid();
});

loadConfig();
