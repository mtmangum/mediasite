import "./theme";
import {
  element,
  errorMessage,
  type ApiResponse,
  type Connection,
} from "./shared";

type InputId = "baseUrl" | "username" | "password" | "apiKey" | "path";
type ButtonId =
  "send" | "save" | "clearHistory" | "copy" | "format" | "download";
function $(id: InputId): HTMLInputElement;
function $(id: ButtonId): HTMLButtonElement;
function $(id: "method"): HTMLSelectElement;
function $(id: "body"): HTMLTextAreaElement;
function $(id: string): HTMLElement;
function $(id: string): HTMLElement {
  return element(id);
}
const presets = [
  ["API home", "/Home"],
  ["Schema / metadata", "/$metadata"],
  ["Presentations", "/Presentations?$top=5&$select=Id,Title,Status,Duration"],
  ["Folders", "/Folders?$top=5&$select=Id,Name,ParentFolderId"],
  [
    "Recent presentations",
    "/Presentations?$top=30&$filter=Status eq 'Viewable'&$orderby=CreationDate desc&$select=full",
  ],
  [
    "Search “lecture”",
    "/Presentations?$top=5&$filter=substringof('lecture',Title)&$select=Id,Title",
  ],
  ["User profiles", "/UserProfiles?$top=5"],
];
let history: { method: string; path: string; status: number }[] = [];
let response: ApiResponse | null = null;
let pretty = true,
  busy = false;
for (const [label, path] of presets) {
  const b = document.createElement("button");
  b.className = "preset";
  b.textContent = label + " ↗";
  b.onclick = () => {
    if (busy) return;
    $("method").value = "GET";
    $("path").value = path;
    toggleBody();
    document
      .querySelectorAll(".preset")
      .forEach((el) => el.classList.remove("selected"));
    b.classList.add("selected");
    send();
  };
  $("presets").append(b);
}
function toggleBody() {
  $("bodyField").hidden = ["GET", "DELETE"].includes($("method").value);
}
$("method").onchange = toggleBody;
function renderHistory() {
  $("history").replaceChildren();
  if (!history.length) {
    $("history").textContent = "No requests yet.";
    return;
  }
  for (const item of history) {
    const b = document.createElement("button");
    b.textContent = `${item.method} ${item.path} · ${item.status}`;
    b.onclick = () => {
      $("method").value = item.method;
      $("path").value = item.path;
      toggleBody();
    };
    $("history").append(b);
  }
}
$("clearHistory").onclick = () => {
  history = [];
  renderHistory();
};
renderHistory();
async function loadConfig(post = false) {
  $("save").disabled = true;
  try {
    const opts = post
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            baseUrl: $("baseUrl").value.trim(),
            username: $("username").value.trim(),
            password: $("password").value,
            apiKey: $("apiKey").value,
          }),
        }
      : {};
    const res = await fetch("/config", opts);
    const c: Connection & { error?: string } = await res.json();
    if (!res.ok) throw Error(c.error || res.statusText);
    $("baseUrl").value = c.baseUrl;
    $("username").value = c.username;
    $("password").value = "";
    $("apiKey").value = "";
    $("password").placeholder = c.hasPassword
      ? "Saved · leave blank to keep"
      : "Not configured";
    $("apiKey").placeholder = c.hasApiKey
      ? "Saved · leave blank to keep"
      : "Not configured";
    $("cfgStatus").textContent = c.hasApiKey
      ? c.username && c.hasPassword
        ? "Key + login configured"
        : "API key configured"
      : "Anonymous";
    if (post) {
      $("configMessage").className = "ok";
      $("configMessage").textContent = "Connection settings applied.";
    }
  } catch (e) {
    $("configMessage").className = "bad";
    $("configMessage").textContent = errorMessage(e);
  } finally {
    $("save").disabled = false;
  }
}
$("save").onclick = () => loadConfig(true);
function showResponse() {
  if (!response) return;
  let value = response.body;
  if (pretty) {
    try {
      value = JSON.stringify(JSON.parse(value), null, 2);
    } catch {}
  }
  $("out").textContent = value || "(empty body)";
  $("format").textContent = pretty ? "Raw" : "Formatted";
}
async function send() {
  if (busy) return;
  const method = $("method").value,
    path = $("path").value.trim(),
    hasBody = !["GET", "DELETE"].includes(method),
    body = hasBody ? $("body").value : undefined;
  $("requestError").textContent = "";
  if (!path) {
    $("requestError").textContent = "Enter an endpoint path.";
    return;
  }
  if (body) {
    try {
      JSON.parse(body);
    } catch {
      $("requestError").textContent = "The request body must be valid JSON.";
      return;
    }
  }
  busy = true;
  $("send").disabled = true;
  $("send").textContent = "Sending…";
  $("meta").className = "muted";
  $("meta").textContent = "Waiting for Mediasite…";
  response = null;
  (["copy", "download", "format"] as const).forEach(
    (id) => ($(id).disabled = true),
  );
  $("out").hidden = true;
  $("empty").hidden = true;
  try {
    const res = await fetch("/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method, path, body: body || undefined }),
    });
    const r: ApiResponse & { error?: string } = await res.json();
    if (!res.ok || r.error) throw Error(r.error || res.statusText);
    response = r;
    pretty = true;
    $("meta").className = r.status >= 200 && r.status < 300 ? "ok" : "bad";
    $("meta").textContent =
      `${r.status} ${r.statusText} · ${r.ms} ms · ${r.contentType || "No content type"} · ${r.url}`;
    $("out").hidden = false;
    showResponse();
    (["copy", "download", "format"] as const).forEach(
      (id) => ($(id).disabled = false),
    );
    history.unshift({ method, path, status: r.status });
    history = history.slice(0, 8);
    renderHistory();
  } catch (e) {
    $("meta").className = "bad";
    $("meta").textContent = "Request failed: " + errorMessage(e);
    $("empty").hidden = false;
  } finally {
    busy = false;
    $("send").disabled = false;
    $("send").textContent = "Send request ↗";
  }
}
$("send").onclick = send;
$("path").onkeydown = (e) => {
  if (e.key === "Enter") send();
};
$("body").onkeydown = (e) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    send();
  }
};
$("format").onclick = () => {
  pretty = !pretty;
  showResponse();
};
$("copy").onclick = async () => {
  try {
    await navigator.clipboard.writeText($("out").textContent || "");
    $("copy").textContent = "Copied";
    setTimeout(() => ($("copy").textContent = "Copy response"), 1500);
  } catch {
    $("requestError").textContent =
      "Copy unavailable. Select and copy the response text.";
  }
};
$("download").onclick = () => {
  if (!response) return;
  const blob = new Blob([response.body], {
      type: response.contentType || "text/plain",
    }),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download =
    "mediasite-response." +
    (response.contentType.includes("json")
      ? "json"
      : response.contentType.includes("xml")
        ? "xml"
        : "txt");
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
loadConfig();
