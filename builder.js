// iOS Push Notification Payload Builder — browser-only, no API.
// Builds APNs payload JSON and exports cURL commands for testing.

const STORAGE_KEY = "push_payload_v1";

let state = {
  // Identification
  bundleId: "",
  deviceToken: "",
  environment: "sandbox",

  // Alert
  alertEnabled: true,
  title: "",
  subtitle: "",
  body: "",
  launchImage: "",
  titleLocKey: "",
  locKey: "",

  // Badge
  badgeEnabled: false,
  badge: 1,

  // Sound
  soundEnabled: false,
  soundType: "default",  // "default" | "custom" | "critical"
  soundName: "",
  criticalVolume: 1.0,

  // APNs flags
  contentAvailable: false,
  mutableContent: false,

  // Grouping & Category
  category: "",
  threadId: "",
  targetContentId: "",
  relevanceScore: "",
  interruptionLevel: "active",  // active | passive | time-sensitive | critical

  // Custom keys
  customKeys: [],  // { id, key, value, type }
};

function save() {
  // Pull form values into state before saving
  collectFormValues();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) state = { ...state, ...JSON.parse(raw) };
  } catch (e) {}
}

function collectFormValues() {
  const g = id => document.getElementById(id);
  if (!g("bundleId")) return;

  state.bundleId = g("bundleId").value.trim();
  state.deviceToken = g("deviceToken").value.trim();
  state.environment = g("environment").value;

  state.alertEnabled = g("alertEnabled").checked;
  state.title = g("title").value;
  state.subtitle = g("subtitle").value;
  state.body = g("body").value;
  state.launchImage = g("launchImage").value;
  state.titleLocKey = g("titleLocKey").value;
  state.locKey = g("locKey").value;

  state.badgeEnabled = g("badgeEnabled").checked;
  state.badge = parseInt(g("badge").value) || 0;

  state.soundEnabled = g("soundEnabled").checked;
  state.soundType = g("soundType").value;
  state.soundName = g("soundName")?.value || "";
  state.criticalVolume = parseFloat(g("criticalVolume")?.value) || 1.0;

  state.contentAvailable = g("contentAvailable").checked;
  state.mutableContent = g("mutableContent").checked;

  state.category = g("category").value;
  state.threadId = g("threadId").value;
  state.targetContentId = g("targetContentId").value;
  state.relevanceScore = g("relevanceScore").value;
  state.interruptionLevel = g("interruptionLevel").value;
}

function buildPayload() {
  collectFormValues();

  const aps = {};

  // Alert
  if (state.alertEnabled) {
    const alert = {};
    if (state.title) alert.title = state.title;
    if (state.subtitle) alert.subtitle = state.subtitle;
    if (state.body) alert.body = state.body;
    if (state.launchImage) alert["launch-image"] = state.launchImage;
    if (state.titleLocKey) alert["title-loc-key"] = state.titleLocKey;
    if (state.locKey) alert["loc-key"] = state.locKey;
    if (Object.keys(alert).length > 0) aps.alert = alert;
    else aps.alert = "";
  }

  // Badge
  if (state.badgeEnabled) aps.badge = state.badge;

  // Sound
  if (state.soundEnabled) {
    if (state.soundType === "default") {
      aps.sound = "default";
    } else if (state.soundType === "custom") {
      aps.sound = state.soundName || "default";
    } else if (state.soundType === "critical") {
      aps.sound = {
        critical: 1,
        name: state.soundName || "default",
        volume: state.criticalVolume,
      };
    }
  }

  // Flags
  if (state.contentAvailable) aps["content-available"] = 1;
  if (state.mutableContent) aps["mutable-content"] = 1;

  // Grouping / Category
  if (state.category) aps.category = state.category;
  if (state.threadId) aps["thread-id"] = state.threadId;
  if (state.targetContentId) aps["target-content-id"] = state.targetContentId;
  if (state.relevanceScore !== "") aps["relevance-score"] = parseFloat(state.relevanceScore) || 0;
  if (state.interruptionLevel && state.interruptionLevel !== "active") {
    aps["interruption-level"] = state.interruptionLevel;
  }

  const payload = { aps };

  // Custom keys
  state.customKeys.forEach(k => {
    if (!k.key) return;
    let val = k.value;
    if (k.type === "number") val = parseFloat(val) || 0;
    else if (k.type === "boolean") val = val === "true";
    else if (k.type === "json") { try { val = JSON.parse(val); } catch (e) {} }
    payload[k.key] = val;
  });

  return payload;
}

function renderPreview() {
  const payload = buildPayload();
  const json = JSON.stringify(payload, null, 2);
  document.getElementById("payloadOutput").textContent = json;

  // Bytes
  const bytes = new TextEncoder().encode(json).length;
  const limit = 4096;
  const pct = Math.min((bytes / limit) * 100, 100);
  document.getElementById("sizeBar").style.width = pct + "%";
  document.getElementById("sizeBar").style.background = bytes > limit ? "var(--err)" : bytes > 3500 ? "var(--warn)" : "var(--ok)";
  document.getElementById("sizeLabel").textContent = `${bytes} / ${limit} bytes`;
  document.getElementById("sizeLabel").style.color = bytes > limit ? "var(--err)" : bytes > 3500 ? "var(--warn)" : "var(--muted)";

  // Push type
  let pushType = "alert";
  if (state.contentAvailable && !state.alertEnabled && !state.badgeEnabled && !state.soundEnabled) pushType = "background";
  else if (state.interruptionLevel === "time-sensitive") pushType = "alert";
  document.getElementById("pushTypeTag").textContent = `apns-push-type: ${pushType}`;

  renderCurl(payload, pushType);
}

function renderCurl(payload, pushType) {
  const host = state.environment === "sandbox"
    ? "api.sandbox.push.apple.com"
    : "api.push.apple.com";
  const token = state.deviceToken || "<DEVICE_TOKEN>";
  const bundleId = state.bundleId || "<BUNDLE_ID>";
  const json = JSON.stringify(payload);

  const curl = [
    `curl -v \\`,
    `  --http2 \\`,
    `  -H "apns-topic: ${bundleId}" \\`,
    `  -H "apns-push-type: ${pushType}" \\`,
    `  -H "apns-priority: ${state.contentAvailable && !state.alertEnabled ? "5" : "10"}" \\`,
    `  -H "authorization: bearer <JWT_TOKEN>" \\`,
    `  -d '${json.replace(/'/g, "'\\''")}' \\`,
    `  "https://${host}/3/device/${token}"`,
  ].join("\n");

  document.getElementById("curlOutput").textContent = curl;
}

function copyPayload() {
  const text = document.getElementById("payloadOutput").textContent;
  navigator.clipboard.writeText(text).then(() => flashBtn("copyPayloadBtn", "Copied!"));
}

function copyCurl() {
  const text = document.getElementById("curlOutput").textContent;
  navigator.clipboard.writeText(text).then(() => flashBtn("copyCurlBtn", "Copied!"));
}

function flashBtn(id, msg) {
  const btn = document.getElementById(id);
  const orig = btn.textContent;
  btn.textContent = msg;
  setTimeout(() => { btn.textContent = orig; }, 1500);
}

// ── Custom keys ───────────────────────────────────────────────────────────────

function addCustomKey() {
  const k = { id: Date.now().toString(36), key: "", value: "", type: "string" };
  state.customKeys.push(k);
  renderCustomKeys();
}

function removeCustomKey(id) {
  state.customKeys = state.customKeys.filter(k => k.id !== id);
  renderCustomKeys();
  renderPreview();
}

function updateCustomKey(id, field, value) {
  const k = state.customKeys.find(k => k.id === id);
  if (k) k[field] = value;
  renderPreview();
}

function renderCustomKeys() {
  const el = document.getElementById("customKeys");
  if (state.customKeys.length === 0) {
    el.innerHTML = `<div style="color:var(--muted);font-size:13px;padding:8px 0">No custom keys yet — click "Add Key" to add data beyond the standard aps dictionary.</div>`;
    return;
  }
  el.innerHTML = state.customKeys.map(k => `
    <div class="custom-key-row">
      <input type="text" placeholder="key_name" value="${esc(k.key)}" style="flex:1;min-width:100px"
        oninput="updateCustomKey('${k.id}','key',this.value)" spellcheck="false" />
      <input type="text" placeholder="value" value="${esc(k.value)}" style="flex:2;min-width:140px"
        oninput="updateCustomKey('${k.id}','value',this.value)" />
      <select onchange="updateCustomKey('${k.id}','type',this.value)">
        <option value="string" ${k.type==="string"?"selected":""}>String</option>
        <option value="number" ${k.type==="number"?"selected":""}>Number</option>
        <option value="boolean" ${k.type==="boolean"?"selected":""}>Boolean</option>
        <option value="json" ${k.type==="json"?"selected":""}>JSON</option>
      </select>
      <button class="remove-key-btn" onclick="removeCustomKey('${k.id}')">✕</button>
    </div>`).join("");
}

// ── Conditional visibility ────────────────────────────────────────────────────

function onSoundTypeChange() {
  const type = document.getElementById("soundType").value;
  document.getElementById("soundNameRow").style.display = type !== "default" ? "flex" : "none";
  document.getElementById("criticalVolumeRow").style.display = type === "critical" ? "flex" : "none";
  renderPreview();
}

function onAlertToggle() {
  const on = document.getElementById("alertEnabled").checked;
  document.getElementById("alertFields").style.display = on ? "grid" : "none";
  renderPreview();
}

function onBadgeToggle() {
  const on = document.getElementById("badgeEnabled").checked;
  document.getElementById("badgeField").style.display = on ? "block" : "none";
  renderPreview();
}

function onSoundToggle() {
  const on = document.getElementById("soundEnabled").checked;
  document.getElementById("soundFields").style.display = on ? "block" : "none";
  renderPreview();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function esc(s) {
  return String(s || "").replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

function id(s) { return document.getElementById(s); }

// ── Init ──────────────────────────────────────────────────────────────────────

function populateForm() {
  const s = state;
  const set = (elId, val) => { const el = id(elId); if (el) { if (el.type === "checkbox") el.checked = val; else el.value = val; } };

  set("bundleId", s.bundleId);
  set("deviceToken", s.deviceToken);
  set("environment", s.environment);
  set("alertEnabled", s.alertEnabled);
  set("title", s.title);
  set("subtitle", s.subtitle);
  set("body", s.body);
  set("launchImage", s.launchImage);
  set("titleLocKey", s.titleLocKey);
  set("locKey", s.locKey);
  set("badgeEnabled", s.badgeEnabled);
  set("badge", s.badge);
  set("soundEnabled", s.soundEnabled);
  set("soundType", s.soundType);
  set("soundName", s.soundName);
  set("criticalVolume", s.criticalVolume);
  set("contentAvailable", s.contentAvailable);
  set("mutableContent", s.mutableContent);
  set("category", s.category);
  set("threadId", s.threadId);
  set("targetContentId", s.targetContentId);
  set("relevanceScore", s.relevanceScore);
  set("interruptionLevel", s.interruptionLevel);

  // Apply visibility
  id("alertFields").style.display = s.alertEnabled ? "grid" : "none";
  id("badgeField").style.display = s.badgeEnabled ? "block" : "none";
  id("soundFields").style.display = s.soundEnabled ? "block" : "none";
  id("soundNameRow").style.display = s.soundType !== "default" ? "flex" : "none";
  id("criticalVolumeRow").style.display = s.soundType === "critical" ? "flex" : "none";

  renderCustomKeys();
}

document.addEventListener("DOMContentLoaded", () => {
  load();
  populateForm();

  // Wire all inputs to save + re-render
  document.querySelectorAll("input,select,textarea").forEach(el => {
    el.addEventListener("input", () => { save(); renderPreview(); });
    el.addEventListener("change", () => { save(); renderPreview(); });
  });

  renderPreview();
});
