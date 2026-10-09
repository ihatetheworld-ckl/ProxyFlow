import { useState } from "react";
import type { Config, WebRtcState } from "../utils/types";
export function SecurityPanel({
  config,
  busy,
  save,
  security,
}: {
  config: Config;
  busy: boolean;
  save: (c: Config) => Promise<boolean>;
  security?: WebRtcState;
}) {
  const [domains, setDomains] = useState(
    (config.blocking?.domains ?? []).join("\n"),
  );
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  async function rtc(restrict: boolean) {
    setError("");
    setWorking(true);
    try {
      if (
        restrict &&
        !(await chrome.permissions.request({ permissions: ["privacy"] }))
      )
        throw new Error("WebRTC 控制需要 privacy 权限");
      await save({ ...config, webRtc: restrict ? "restrict" : "browser" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "设置失败");
    } finally {
      setWorking(false);
    }
  }
  return (
    <>
      <section className="panel">
        <h2>广告域名拦截</h2>
        <p>
          默认关闭；开启后在三种代理模式中使用 DNR
          阻止域名及子域名请求，优先于路由规则中的
          DIRECT/PROXY。内置列表很小，不代表完整广告拦截。
        </p>
        <label className="acknowledge">
          <input
            type="checkbox"
            checked={config.blocking?.enabled ?? false}
            disabled={busy || working}
            onChange={(e) =>
              void save({
                ...config,
                blocking: {
                  enabled: e.target.checked,
                  domains: config.blocking?.domains ?? [],
                },
              })
            }
          />
          <span>开启广告域名拦截</span>
        </label>
        <label>
          拦截域名（每行一个，最多 500 个）
          <textarea
            aria-label="广告拦截域名"
            rows={7}
            value={domains}
            disabled={busy}
            onChange={(e) => setDomains(e.target.value)}
          />
        </label>
        <button
          disabled={busy || working}
          onClick={() =>
            void save({
              ...config,
              blocking: {
                enabled: config.blocking?.enabled ?? false,
                domains: [
                  ...new Set(
                    domains
                      .split(/\r?\n/)
                      .map((s) => s.trim())
                      .filter(Boolean),
                  ),
                ],
              },
            })
          }
        >
          保存域名列表
        </button>
        <p className="footnote">
          不支持 EasyList/Adblock
          语法、页面元素隐藏或请求计数。不读取浏览历史，也不监听请求日志。若网站功能受影响，可关闭或移除对应域名。
        </p>
      </section>
      <section className="panel">
        <h2>WebRTC 风险控制</h2>
        <label className="acknowledge">
          <input
            type="checkbox"
            checked={config.webRtc === "restrict"}
            disabled={busy || working}
            onChange={(e) => void rtc(e.target.checked)}
          />
          <span>限制 WebRTC 非代理 UDP（disable_non_proxied_udp）</span>
        </label>
        <p>
          可能影响语音、视频通话和点对点连接；不能保证全部 IP
          泄漏被阻止。关闭时仅释放 ProxyFlow 自己的策略覆盖，恢复由 Chrome
          或其他策略决定。
        </p>
        <p className="footnote">
          实际策略：{security?.value ?? "未授权或不可读取"}；控制权：
          {security?.level ?? "未知"}。{security?.error}
        </p>
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        <button
          disabled={busy || working}
          onClick={async () => {
            await rtc(false);
          }}
        >
          释放 ProxyFlow 的 WebRTC 策略
        </button>
      </section>
    </>
  );
}
