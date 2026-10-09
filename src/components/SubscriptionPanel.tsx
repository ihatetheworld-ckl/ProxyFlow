import { useState } from "react";
import { Download, RefreshCw, Trash2 } from "lucide-react";
import type { Config, Subscription, SubscriptionState } from "../utils/types";
import type { ImportFormat, Target } from "../parsers";
import { canApplyReport } from "../parsers";
import { subscriptionUrl } from "../subscriptions/url";
import { websitePattern } from "../network/permission";
import { request } from "./client";
export function SubscriptionPanel({
  config,
  updates,
  busy,
  save,
  reload,
}: {
  config: Config;
  updates: Record<string, SubscriptionState>;
  busy: boolean;
  save: (c: Config) => Promise<boolean>;
  reload: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<Subscription>();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [format, setFormat] = useState<ImportFormat>("auto");
  const [interval, setInterval] = useState<0 | 6 | 24>(0);
  const [target, setTarget] = useState<Target>("PROXY");
  const [mappings, setMappings] = useState("{}");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [accepted, setAccepted] = useState<Record<string, string>>({});
  const locked = busy || working;
  function clear() {
    setEditing(undefined);
    setName("");
    setUrl("");
    setFormat("auto");
    setInterval(0);
    setTarget("PROXY");
    setMappings("{}");
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setWorking(true);
    try {
      const address = subscriptionUrl(url.trim());
      let map: Record<string, Target>;
      try {
        map = JSON.parse(mappings);
      } catch {
        throw new Error("出口映射需要有效 JSON 对象");
      }
      const sub: Subscription = {
        id: editing?.id ?? crypto.randomUUID(),
        name: name.trim(),
        url: address.href,
        format,
        intervalHours: interval,
        defaultTarget: target,
        mappings: map,
      };
      if (
        interval > 0 &&
        !(await chrome.permissions.request({
          origins: [websitePattern(address)],
        }))
      )
        throw new Error("自动更新需要订阅站点授权");
      const list = config.subscriptions ?? [];
      if (
        await save({
          ...config,
          subscriptions: editing
            ? list.map((s) => (s.id === sub.id ? sub : s))
            : [...list, sub],
        })
      )
        clear();
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败");
    } finally {
      setWorking(false);
    }
  }
  async function action(type: string, sub: Subscription, token?: string) {
    setWorking(true);
    setError("");
    try {
      if (
        type === "SUB_UPDATE" &&
        !(await chrome.permissions.request({
          origins: [websitePattern(subscriptionUrl(sub.url))],
        }))
      )
        throw new Error("未授权订阅站点");
      await request({
        type,
        id: sub.id,
        token,
        acknowledge: token !== undefined && accepted[sub.id] === token,
      });
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "订阅操作失败");
    } finally {
      setWorking(false);
    }
  }
  const choices = (
    <>
      <option value="PROXY">当前代理</option>
      <option value="DIRECT">DIRECT</option>
      <option value="REJECT">REJECT</option>
      {config.proxies.map((p) => (
        <option key={p.id} value={"PROXY:" + p.id}>
          {p.name}
        </option>
      ))}
    </>
  );
  return (
    <>
      <section className="panel">
        <h2>{editing ? "编辑订阅" : "添加规则订阅"}</h2>
        <p>
          HTTPS
          下载仅生成待应用候选，不自动改写路由。应用候选会替换全部现有规则；多个订阅分别管理，不自动合并。
        </p>
        <form onSubmit={(e) => void submit(e)}>
          <div className="form-row">
            <label>
              订阅名称
              <input
                required
                maxLength={80}
                disabled={locked}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Rules"
              />
            </label>
            <label>
              HTTPS 地址
              <input
                required
                disabled={locked}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://rules.example/list.txt"
              />
            </label>
          </div>
          <div className="form-row">
            <label>
              配置格式
              <select
                disabled={locked}
                value={format}
                onChange={(e) => setFormat(e.target.value as ImportFormat)}
              >
                {[
                  "auto",
                  "native",
                  "domains",
                  "shadowrocket",
                  "clash",
                  "xray",
                ].map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
            </label>
            <label>
              下载周期
              <select
                disabled={locked}
                value={interval}
                onChange={(e) =>
                  setInterval(Number(e.target.value) as 0 | 6 | 24)
                }
              >
                <option value={0}>仅手动</option>
                <option value={6}>每 6 小时生成候选</option>
                <option value={24}>每 24 小时生成候选</option>
              </select>
            </label>
          </div>
          <label>
            纯域名列表出口
            <select
              disabled={locked}
              value={target}
              onChange={(e) => setTarget(e.target.value as Target)}
            >
              {choices}
            </select>
          </label>
          <label>
            源出口映射（JSON 对象）
            <textarea
              aria-label="订阅出口映射"
              rows={3}
              disabled={locked}
              value={mappings}
              onChange={(e) => setMappings(e.target.value)}
              placeholder={'{"Proxy":"PROXY"}'}
            />
          </label>
          <p className="footnote">
            可用 PROXY、DIRECT、REJECT 或
            PROXY:代理ID。源策略组不会运行，远程配置中的外部 rule-providers
            不会递归下载。URL 可能包含访问令牌，保存在本地，请勿公开分享。
          </p>
          <button className="primary" disabled={locked}>
            {editing ? "保存订阅" : "添加订阅"}
          </button>
          {editing && (
            <button type="button" onClick={clear} disabled={locked}>
              取消编辑
            </button>
          )}
        </form>
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
      </section>
      {(config.subscriptions ?? []).map((sub) => {
        const state = updates[sub.id];
        const pending = state?.pending;
        const ack = !!pending && accepted[sub.id] === pending.token;
        const stale = pending && pending.baseRevision !== config.revision;
        return (
          <section className="panel" key={sub.id}>
            <div className="section-title">
              <h2>{sub.name}</h2>
              <span>
                {sub.intervalHours ? sub.intervalHours + " 小时" : "手动"}
              </span>
            </div>
            <p className="footnote subscription-url">{sub.url}</p>
            <p className="footnote">
              最近检查：
              {state?.checkedAt
                ? new Date(state.checkedAt).toLocaleString()
                : "尚未更新"}
              ；最近成功生成候选：
              {state?.lastSuccessAt
                ? new Date(state.lastSuccessAt).toLocaleString()
                : "无"}
            </p>
            <div className="import-actions">
              <button
                disabled={locked}
                onClick={() => void action("SUB_UPDATE", sub)}
              >
                <RefreshCw size={15} />
                {working ? "正在处理…" : "授权并下载更新"}
              </button>
              <button
                disabled={locked}
                onClick={() => {
                  setEditing(sub);
                  setName(sub.name);
                  setUrl(sub.url);
                  setFormat(sub.format);
                  setInterval(sub.intervalHours);
                  setTarget(sub.defaultTarget);
                  setMappings(JSON.stringify(sub.mappings, null, 2));
                }}
              >
                编辑
              </button>
              <button
                aria-label={"删除订阅 " + sub.name}
                disabled={locked}
                onClick={() =>
                  void save({
                    ...config,
                    subscriptions: config.subscriptions?.filter(
                      (s) => s.id !== sub.id,
                    ),
                  })
                }
              >
                <Trash2 size={15} />
                删除
              </button>
            </div>
            {state?.error && (
              <div className="alert error" role="alert">
                {state.error}
                。已应用路由未更改；旧候选如有保留，也不会自动应用。
              </div>
            )}
            {state?.failureReport && (
              <details>
                <summary>最近转换失败报告</summary>
                <pre>{JSON.stringify(state.failureReport, null, 2)}</pre>
              </details>
            )}
            {pending && (
              <>
                <h3>待应用候选 · {pending.report.rules.length} 条</h3>
                <p className="footnote">
                  下载时间：{new Date(pending.fetchedAt).toLocaleString()}。
                  {stale
                    ? "本地配置已更改，请重新下载。"
                    : "仍需手动确认应用。"}
                </p>
                <details>
                  <summary>查看规则与兼容性报告</summary>
                  <div className="issue-list">
                    {pending.report.issues.map((issue, i) => (
                      <article className="import-issue" key={i}>
                        <b>{issue.severity}</b>
                        <div>
                          <code>{issue.path}</code>
                          <p>{issue.message}</p>
                        </div>
                      </article>
                    ))}
                  </div>
                  <div className="rule-list subscription-rules">
                    {pending.report.rules.map((rule, i) => (
                      <div className="rule-row" key={rule.id}>
                        <span>{i + 1}</span>
                        <div>
                          <b>{rule.type}</b>
                          <small>{rule.value || "所有剩余请求"}</small>
                        </div>
                        <span className="tag">
                          {rule.proxyId
                            ? config.proxies.find((p) => p.id === rule.proxyId)
                                ?.name
                            : rule.action}
                        </span>
                      </div>
                    ))}
                  </div>
                </details>
                {pending.report.issues.some(
                  (i) => i.severity === "unsupported" || i.acknowledge,
                ) && (
                  <label className="acknowledge">
                    <input
                      type="checkbox"
                      disabled={locked}
                      checked={ack}
                      onChange={(e) =>
                        setAccepted({
                          ...accepted,
                          [sub.id]: e.target.checked ? pending.token : "",
                        })
                      }
                    />
                    <span>
                      接受本候选中跳过的不兼容规则与已说明的语义变化；这可能改变流量路径。
                    </span>
                  </label>
                )}
                <div className="import-actions">
                  <button
                    className="primary"
                    disabled={
                      locked || !!stale || !canApplyReport(pending.report, ack)
                    }
                    onClick={() => void action("SUB_APPLY", sub, pending.token)}
                  >
                    <Download size={15} />
                    用候选替换全部规则
                  </button>
                  <button
                    disabled={locked}
                    onClick={() => void action("SUB_DISCARD", sub)}
                  >
                    丢弃候选
                  </button>
                </div>
              </>
            )}
          </section>
        );
      })}
      <p className="footnote">
        浏览器关闭、休眠和调度延迟会影响检查时间。每次调度最多处理 3
        个到期订阅；失败不改变路由、不回退直连。每文件 256 KiB，候选缓存总计 1
        MiB。域名 DNS 指向无法由扩展可靠验证；仅在信任来源后授权。
      </p>
    </>
  );
}
