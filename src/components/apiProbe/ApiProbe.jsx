import { useMemo, useState } from "react";
import "./ApiProbe.css";

function getNow() {
  return new Date().toLocaleTimeString();
}

function toFormBody(payloadText) {
  const params = new URLSearchParams();
  const lines = payloadText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (!key) continue;
    params.append(key, value);
  }
  return params;
}

export default function ApiProbe() {
  const [baseUrl, setBaseUrl] = useState("https://app.ytdown.to/vi14");
  const [cooldownPayload, setCooldownPayload] = useState("action=check");
  const [proxyPayload, setProxyPayload] = useState("action=check");
  const [checkPayload, setCheckPayload] = useState("action=check");
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);

  const normalizedBase = useMemo(() => baseUrl.trim().replace(/\/$/, ""), [baseUrl]);

  const pushLog = (text, kind = "info") => {
    setLogs((prev) => [
      {
        id: `${Date.now()}-${Math.random()}`,
        ts: getNow(),
        kind,
        text,
      },
      ...prev,
    ]);
  };

  const callEndpoint = async (path, payloadText, label) => {
    const url = `${normalizedBase}/${path}`;
    const body = toFormBody(payloadText);

    pushLog(`[${label}] -> POST ${url}`);
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          Accept: "application/json, text/plain, */*",
        },
        body: body.toString(),
      });

      const raw = await response.text();
      pushLog(
        `[${label}] <- ${response.status} ${response.statusText || ""}\n${raw.slice(0, 1000)}`,
        response.ok ? "success" : "error",
      );
      return { ok: response.ok, status: response.status, raw };
    } catch (err) {
      pushLog(
        `[${label}] XHR/fetch error: ${err?.message || "Unknown error"} (thường là CORS hoặc endpoint chặn origin)`,
        "error",
      );
      return { ok: false, status: 0, raw: "" };
    }
  };

  const runSingle = async (path, payload, label) => {
    setLoading(true);
    try {
      await callEndpoint(path, payload, label);
    } finally {
      setLoading(false);
    }
  };

  const runSequence = async () => {
    setLoading(true);
    try {
      await callEndpoint("cooldown.php", cooldownPayload, "cooldown #1");
      await callEndpoint("proxy.php", proxyPayload, "proxy");
      await callEndpoint("cooldown.php", checkPayload, "cooldown #2");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="probe-page">
      <h1 className="probe-title">Test API ngoai (ytdown)</h1>
      <p className="probe-subtitle">Muc dich: thu call 3 endpoint va xem response/CORS loi chi tiet</p>

      <div className="probe-card">
        <label className="probe-label">Base URL</label>
        <input
          className="probe-input"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="https://app.ytdown.to/vi14"
        />
      </div>

      <div className="probe-grid">
        <div className="probe-card">
          <div className="probe-row">
            <strong>1) cooldown.php</strong>
            <button
              className="probe-btn"
              disabled={loading}
              onClick={() => runSingle("cooldown.php", cooldownPayload, "cooldown #1")}
            >
              Test
            </button>
          </div>
          <textarea
            className="probe-textarea"
            value={cooldownPayload}
            onChange={(e) => setCooldownPayload(e.target.value)}
          />
        </div>

        <div className="probe-card">
          <div className="probe-row">
            <strong>2) proxy.php</strong>
            <button
              className="probe-btn"
              disabled={loading}
              onClick={() => runSingle("proxy.php", proxyPayload, "proxy")}
            >
              Test
            </button>
          </div>
          <textarea
            className="probe-textarea"
            value={proxyPayload}
            onChange={(e) => setProxyPayload(e.target.value)}
          />
        </div>

        <div className="probe-card">
          <div className="probe-row">
            <strong>3) cooldown.php (check)</strong>
            <button
              className="probe-btn"
              disabled={loading}
              onClick={() => runSingle("cooldown.php", checkPayload, "cooldown #2")}
            >
              Test
            </button>
          </div>
          <textarea
            className="probe-textarea"
            value={checkPayload}
            onChange={(e) => setCheckPayload(e.target.value)}
          />
        </div>
      </div>

      <div className="probe-card">
        <button className="probe-runall" disabled={loading} onClick={runSequence}>
          {loading ? "Dang test..." : "Run 3 API theo thu tu"}
        </button>
      </div>

      <div className="probe-card">
        <div className="probe-row">
          <strong>Logs</strong>
          <button className="probe-btn" onClick={() => setLogs([])}>
            Clear
          </button>
        </div>
        <div className="probe-logs">
          {logs.length === 0 ? (
            <p className="probe-empty">Chua co log.</p>
          ) : (
            logs.map((item) => (
              <pre key={item.id} className={`probe-log probe-${item.kind}`}>
                [{item.ts}] {item.text}
              </pre>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
