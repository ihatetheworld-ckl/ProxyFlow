import { useState } from "react";
import type { DiagnosticReport } from "../utils/types";
import { websitePattern } from "../network/permission";
import { request } from "./client";
export function DiagnosticsPanel() {
  const [url, setUrl] = useState("https://example.com/");
  const [result, setResult] = useState<DiagnosticReport>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function test() {
    setBusy(true);
    setError("");
    try {
      const address = new URL(url);
      if (
        !["http:", "https:"].includes(address.protocol) ||
        address.username ||
        address.password
      )
        throw new Error("仅支持无凭据 HTTP/HTTPS 地址");
      if (
        !(await chrome.permissions.request({
          origins: [websitePattern(address)],
        }))
      )
        throw new Error("此目标的访问权限未授予");
      const data = await request({ type: "TEST", url });
      setResult(data.diagnostics);
    } catch (e) {
      setError(e instanceof Error ? e.message : "诊断失败");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <h2>网络与实际配置诊断</h2>
      <p>
        先选择待测模式及代理，再测试外部网站。检查实际 Chrome 代理、DNR 和
        WebRTC 状态；不会临时切换网络模式。
      </p>
      <label>
        测试网址
        <input
          disabled={busy}
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setResult(undefined);
          }}
        />
      </label>
      <button className="primary" disabled={busy} onClick={() => void test()}>
        {busy ? "正在诊断…" : "授权此网站并测试"}
      </button>
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      {result && (
        <>
          <div className="diagnostic-result" role="status">
            <b>{result.code}</b>
            <p>{result.summary}</p>
          </div>
          <div className="diagnostic-checks">
            {result.checks.map((check, i) => (
              <article className="import-issue" key={i}>
                <b>
                  {check.status === "ok"
                    ? "正常"
                    : check.status === "error"
                      ? "错误"
                      : check.status === "warning"
                        ? "注意"
                        : "说明"}
                </b>
                <div>
                  <strong>{check.name}</strong>
                  <p>{check.detail}</p>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
      <p className="footnote">
        可识别权限冲突、实际配置不同、规则/广告阻止、HTTP 状态及超时。Chrome
        代理错误事件可提供辅助证据，但无法保证与某次请求一一对应。通用网络错误无法可靠区分代理、DNS、TLS
        与目标不可达。成功响应也不能独立证明出口 IP；DNS、QUIC、WebRTC
        与特殊浏览器流量仍需实测。
      </p>
    </section>
  );
}
