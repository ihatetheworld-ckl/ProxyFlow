import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  Check,
  Globe2,
  Layers3,
  Network,
  Plus,
  Radio,
  Settings2,
  ShieldCheck,
  Trash2,
  Zap,
} from "lucide-react";
import type {
  Config,
  Mode,
  ProxyServer,
  Rule,
  Status,
  SubscriptionState,
  WebRtcState,
} from "../utils/types";
import { api, download } from "./client";
import { validateConfig } from "../utils/validate";
import { exportRules } from "../parsers/native";
import { ImportPanel } from "./ImportPanel";
import { SubscriptionPanel } from "./SubscriptionPanel";
import { SecurityPanel } from "./SecurityPanel";
import { DiagnosticsPanel } from "./DiagnosticsPanel";
import { UpdatePanel } from "./UpdatePanel";
import { BackupPanel } from "./BackupPanel";
import "./style.css";
const modes: {
  id: Mode;
  name: string;
  description: string;
  icon: typeof Globe2;
}[] = [
  {
    id: "smart",
    name: "智能分流",
    description: "根据规则选择出口",
    icon: Layers3,
  },
  {
    id: "global",
    name: "全局代理",
    description: "使用当前代理服务器",
    icon: Globe2,
  },
  {
    id: "direct",
    name: "全局直连",
    description: "直接连接目标网站",
    icon: Zap,
  },
];
const tabs = [
  "代理服务器",
  "智能分流规则",
  "配置文件导入",
  "订阅与规则更新",
  "隐私和安全",
  "网络诊断",
  "关于 ProxyFlow",
];
export function App({ popup = false }: { popup?: boolean }) {
  const [c, setC] = useState<Config>();
  const [status, setStatus] = useState<Status>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState(0);
  const [editing, setEditing] = useState<ProxyServer>();
  const [rule, setRule] = useState<Rule>({
    id: "",
    type: "DOMAIN-SUFFIX",
    value: "",
    action: "PROXY",
  });
  const [updates, setUpdates] = useState<Record<string, SubscriptionState>>({});
  const [security, setSecurity] = useState<WebRtcState>();
  async function refresh() {
    try {
      const r = await api("GET");
      setC(r.config);
      setStatus(r.status);
      setUpdates(r.updates ?? {});
      setSecurity(r.security);
    } catch (e) {
      setError(String(e));
    }
  }
  useEffect(() => {
    void refresh();
    const listener = () => {
      void refresh();
    };
    if (globalThis.chrome?.storage)
      chrome.storage.onChanged.addListener(listener);
    return () => {
      if (globalThis.chrome?.storage)
        chrome.storage.onChanged.removeListener(listener);
    };
  }, []);
  useEffect(() => {
    if (c) document.documentElement.dataset.theme = c.theme;
  }, [c?.theme]);
  async function save(next: Config) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      validateConfig(next);
      const r = await api("SAVE", next);
      setC(r.config);
      setStatus(r.status);
      if (r.updates) setUpdates(r.updates);
      setSecurity(r.security);
      setNotice("配置已应用");
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  const active = c?.proxies.find((p) => p.id === c.selectedId);
  const controlled = status?.level === "controlled_by_this_extension";
  if (!c)
    return (
      <main className="loading">
        <Network />
        <h1>ProxyFlow</h1>
        <p>{error || "正在读取本地配置…"}</p>
        <button onClick={() => void refresh()}>重新加载</button>
      </main>
    );
  const shell = (
    <>
      <header className="topbar">
        <div className="brand">
          <span className="brand-icon">
            <Network size={23} />
          </span>
          <div>
            <b>ProxyFlow</b>
            <small>你的浏览器，你的连接</small>
          </div>
        </div>
        <span className="version">v{chrome.runtime.getManifest().version}</span>
      </header>
      <div className="status-line">
        <span
          className={
            "dot " + (controlled && !status?.error ? "green" : "amber")
          }
        />
        <span>
          {status?.error
            ? "配置或网络需要检查"
            : controlled
              ? "配置已应用 · 连通性未验证"
              : "代理控制权待检查"}
        </span>
        <span className="local">
          <ShieldCheck size={14} /> 本地优先
        </span>
      </div>
      {error && (
        <div role="alert" className="alert error">
          {error}
        </div>
      )}
      {status?.error && (
        <div role="alert" className="alert error">
          {status.error}
        </div>
      )}
      {notice && (
        <div role="status" className="alert success">
          <Check size={15} />
          {notice}
        </div>
      )}
    </>
  );
  const modeCards = (
    <div className="mode-grid">
      {modes.map((m) => (
        <button
          disabled={busy || (!c.proxies.length && m.id !== "direct")}
          className={"mode-card " + (c.mode === m.id ? "selected" : "")}
          key={m.id}
          onClick={() => void save({ ...c, mode: m.id })}
        >
          <m.icon size={21} />
          <strong>{m.name}</strong>
          {!popup && <small>{m.description}</small>}
        </button>
      ))}
    </div>
  );
  if (popup)
    return (
      <main className="popup">
        {shell}
        <section className="connection-card">
          <span className="eyebrow">当前出口</span>
          <h2>{active?.name ?? "尚未配置代理"}</h2>
          <p>
            {active
              ? `${active.protocol.toUpperCase()} · ${active.host}:${active.port}`
              : "首次使用请添加自己的代理入口"}
          </p>
          <select
            aria-label="当前代理"
            disabled={busy || !active}
            value={c.selectedId}
            onChange={(e) => void save({ ...c, selectedId: e.target.value })}
          >
            {c.proxies.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </section>
        {modeCards}
        <p className="footnote">
          代理路由不自动回退直连。智能规则中的 DIRECT
          仍会直连；浏览器内部流量存在限制。
        </p>
        <button
          className="full settings"
          onClick={() => void chrome.runtime.openOptionsPage()}
        >
          <Settings2 size={17} />
          打开设置
          <ArrowUpRight size={16} />
        </button>
      </main>
    );
  async function submitProxy(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const p: ProxyServer = {
      id: editing?.id ?? crypto.randomUUID(),
      name: String(data.get("name")).trim(),
      host: String(data.get("host")).trim(),
      port: Number(data.get("port")),
      protocol: String(data.get("protocol")) as ProxyServer["protocol"],
    };
    const next = {
      ...c!,
      proxies: editing
        ? c!.proxies.map((x) => (x.id === p.id ? p : x))
        : [...c!.proxies, p],
      selectedId: c!.selectedId || p.id,
      defaultId: c!.defaultId || p.id,
    };
    if (await save(next)) {
      setEditing(undefined);
      form.reset();
    }
  }
  async function deleteProxy(id: string) {
    if (c!.rules.some((r) => r.proxyId === id)) {
      setError("此代理被规则引用，请先更改相关规则出口");
      return;
    }
    const proxies = c!.proxies.filter((p) => p.id !== id);
    const fallback =
      proxies.find((p) => p.id === c!.defaultId)?.id ?? proxies[0]?.id ?? "";
    await save({
      ...c!,
      proxies,
      selectedId: c!.selectedId === id ? fallback : c!.selectedId,
      defaultId: c!.defaultId === id ? fallback : c!.defaultId,
      mode: proxies.length ? c!.mode : "direct",
    });
  }
  return (
    <div className="options-layout">
      <aside>
        <div className="brand">
          <span className="brand-icon">
            <Network />
          </span>
          <b>ProxyFlow</b>
        </div>
        <p className="nav-label">工作空间</p>
        <nav>
          {tabs.map((t, i) => (
            <button
              className={tab === i ? "nav-active" : ""}
              key={t}
              onClick={() => setTab(i)}
            >
              <span className="nav-number">0{i + 1}</span>
              {t}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <ShieldCheck size={18} />
          <span>
            本地存储 · 无需账号
            <br />
            <small>开源 / Manifest V3</small>
          </span>
        </div>
      </aside>
      <main className="options">
        {shell}
        <div className="page-title">
          <div>
            <span className="eyebrow">连接控制台</span>
            <h1>{tabs[tab]}</h1>
            <p>独立管理 Chrome 的网络连接。</p>
          </div>
          <label className="theme-label">
            主题
            <select
              aria-label="主题"
              value={c.theme}
              disabled={busy}
              onChange={(e) =>
                void save({ ...c, theme: e.target.value as Config["theme"] })
              }
            >
              <option value="system">跟随系统</option>
              <option value="light">浅色</option>
              <option value="dark">深色</option>
            </select>
          </label>
        </div>
        {tab === 0 && (
          <>
            {!c.proxies.length && (
              <section className="welcome">
                <Radio />
                <div>
                  <h2>从你的第一个代理开始</h2>
                  <p>
                    先运行支持标准代理入口的客户端，再输入地址、任意有效端口和协议。保存后选择全局代理，再进入网络诊断测试。
                  </p>
                </div>
              </section>
            )}
            <section className="panel">
              <h2>运行模式</h2>
              {modeCards}
            </section>
            <div className="two-col">
              <section className="panel">
                <div className="section-title">
                  <h2>代理服务器</h2>
                  <span>{c.proxies.length} 个配置</span>
                </div>
                {!c.proxies.length && (
                  <p className="empty">添加入口后，即可切换代理模式。</p>
                )}
                {c.proxies.map((p) => (
                  <article
                    className={
                      "server " + (p.id === c.selectedId ? "active-server" : "")
                    }
                    key={p.id}
                  >
                    <div className="server-symbol">
                      <Globe2 size={20} />
                    </div>
                    <div className="server-info">
                      <strong>{p.name}</strong>
                      <small>
                        {p.protocol.toUpperCase()} · {p.host}:{p.port}
                      </small>
                      <small>
                        {p.id === c.defaultId ? "默认代理" : ""}
                        {p.id === c.selectedId ? " · 当前选择" : ""}
                      </small>
                    </div>
                    <div className="server-actions">
                      <button
                        disabled={busy}
                        onClick={() => void save({ ...c, selectedId: p.id })}
                      >
                        使用
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => void save({ ...c, defaultId: p.id })}
                      >
                        设默认
                      </button>
                      <button disabled={busy} onClick={() => setEditing(p)}>
                        编辑
                      </button>
                      <button
                        aria-label={"删除 " + p.name}
                        disabled={busy}
                        onClick={() => void deleteProxy(p.id)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </article>
                ))}
              </section>
              <section className="panel">
                <h2>{editing ? "编辑代理" : "添加代理"}</h2>
                <form
                  key={editing?.id ?? "new"}
                  onSubmit={(e) => void submitProxy(e)}
                >
                  <label>
                    配置名称
                    <input
                      name="name"
                      required
                      maxLength={80}
                      defaultValue={editing?.name}
                      placeholder="Home Proxy"
                    />
                  </label>
                  <label>
                    协议
                    <select
                      name="protocol"
                      defaultValue={editing?.protocol ?? "http"}
                    >
                      {["http", "https", "socks4", "socks5"].map((p) => (
                        <option key={p} value={p}>
                          {p.toUpperCase()}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="form-row">
                    <label>
                      服务器地址
                      <input
                        name="host"
                        required
                        defaultValue={editing?.host}
                        placeholder="例如 127.0.0.1"
                      />
                    </label>
                    <label>
                      端口
                      <input
                        name="port"
                        type="number"
                        min={1}
                        max={65535}
                        required
                        defaultValue={editing?.port}
                        placeholder="由客户端提供"
                      />
                    </label>
                  </div>
                  <p className="footnote">
                    填写代理入口协议，HTTPS 表示使用 TLS
                    连接代理服务器。无需填写 VLESS 等节点协议。本版本
                    不支持账号密码认证。
                  </p>
                  <button className="primary" disabled={busy}>
                    <Plus size={16} />
                    {editing ? "保存更改" : "添加并应用配置"}
                  </button>
                  {editing && (
                    <button type="button" onClick={() => setEditing(undefined)}>
                      取消编辑
                    </button>
                  )}
                </form>
                <button
                  disabled={!c.proxies.length || busy}
                  onClick={() => setTab(5)}
                >
                  下一步：进入网络诊断
                </button>
                <p className="footnote">
                  测试代理前，请在运行模式中选择全局代理。
                </p>
              </section>
            </div>
          </>
        )}
        {tab === 1 && (
          <section className="panel">
            <div className="section-title">
              <h2>有序规则</h2>
              <button
                onClick={() =>
                  download("proxyflow-rules.txt", exportRules(c.rules))
                }
              >
                导出规则
              </button>
            </div>
            <p className="footnote">
              从上到下，首次匹配生效；未匹配请求阻止代理连接，不直连。IP-CIDR
              仅匹配 IPv4 字面地址，不触发 DNS。当前代理是 PROXY 默认出口。
            </p>
            <div className="rule-list">
              {c.rules.map((r, i) => (
                <div className="rule-row" key={r.id}>
                  <span className="rule-index">{i + 1}</span>
                  <div>
                    <b>{r.type}</b>
                    <small>{r.value || "所有剩余请求"}</small>
                  </div>
                  <span
                    className={"tag " + (r.action === "DIRECT" ? "muted" : "")}
                  >
                    {r.action === "PROXY"
                      ? (c.proxies.find((p) => p.id === r.proxyId)?.name ??
                        "当前代理")
                      : r.action}
                  </span>
                  <button
                    disabled={busy || i === 0}
                    aria-label="上移规则"
                    onClick={() => {
                      const rules = [...c.rules];
                      [rules[i - 1], rules[i]] = [rules[i], rules[i - 1]];
                      void save({ ...c, rules });
                    }}
                  >
                    ↑
                  </button>
                  <button
                    disabled={busy || i === c.rules.length - 1}
                    aria-label="下移规则"
                    onClick={() => {
                      const rules = [...c.rules];
                      [rules[i + 1], rules[i]] = [rules[i], rules[i + 1]];
                      void save({ ...c, rules });
                    }}
                  >
                    ↓
                  </button>
                  <button
                    aria-label="删除规则"
                    disabled={busy}
                    onClick={() =>
                      void save({
                        ...c,
                        rules: c.rules.filter((x) => x.id !== r.id),
                      })
                    }
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
            <h3>新增规则</h3>
            <div className="rule-form">
              <select
                aria-label="规则类型"
                value={rule.type}
                onChange={(e) =>
                  setRule({
                    ...rule,
                    type: e.target.value as Rule["type"],
                    value: "",
                  })
                }
              >
                {[
                  "DOMAIN",
                  "DOMAIN-SUFFIX",
                  "DOMAIN-KEYWORD",
                  "IP-CIDR",
                  "MATCH",
                ].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
              <input
                aria-label="匹配值"
                disabled={rule.type === "MATCH"}
                placeholder="example.com"
                value={rule.value}
                onChange={(e) => setRule({ ...rule, value: e.target.value })}
              />
              <select
                aria-label="规则出口"
                value={
                  rule.action === "PROXY"
                    ? (rule.proxyId ?? "PROXY")
                    : rule.action
                }
                onChange={(e) => {
                  const target = e.target.value;
                  setRule({
                    ...rule,
                    action: ["DIRECT", "REJECT"].includes(target)
                      ? (target as Rule["action"])
                      : "PROXY",
                    proxyId: ["DIRECT", "REJECT", "PROXY"].includes(target)
                      ? undefined
                      : target,
                  });
                }}
              >
                <option>PROXY</option>
                <option>DIRECT</option>
                <option>REJECT</option>
                {c.proxies.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <button
                disabled={busy}
                className="primary"
                onClick={() => {
                  const rules = [...c.rules];
                  const match = rules.findIndex((r) => r.type === "MATCH");
                  rules.splice(match < 0 ? rules.length : match, 0, {
                    ...rule,
                    id: crypto.randomUUID(),
                  });
                  void save({ ...c, rules });
                }}
              >
                添加
              </button>
            </div>
            <p className="footnote">
              新规则插入首个 MATCH
              前。编辑规则可删除后重新添加，或使用文本导入替换。REJECT 使用 DNR
              阻止 HTTP/HTTPS 请求；本版本不支持与 IP-CIDR 混合排序。
            </p>
          </section>
        )}
        {tab === 2 && <ImportPanel config={c} busy={busy} save={save} />}
        {tab === 3 && (
          <SubscriptionPanel
            config={c}
            updates={updates}
            busy={busy}
            save={save}
            reload={refresh}
          />
        )}
        {tab === 4 && (
          <>
            <SecurityPanel
              config={c}
              busy={busy}
              save={save}
              security={security}
            />
            <BackupPanel config={c} busy={busy} save={save} />
            <section className="panel prose">
              <h2>连接边界与隐私</h2>
              <p>
                配置仅保存在
                chrome.storage.local。无需账号、不收集浏览历史、不上传配置。代理和你选择的测试网站仍可看到相应网络请求。
              </p>
              <h3>故障保护</h3>
              <p>
                PAC 代理出口不追加 DIRECT；PAC 使用
                mandatory。全局代理使用单一固定出口。代理错误不会自动切换直连。显式
                DIRECT 规则仍会直连，禁用或卸载扩展也会解除控制。
              </p>
              <h3>DNS / WebRTC / QUIC</h3>
              <p>
                Chrome 决定 DNS 解析位置，SOCKS4
                不提供远端域名解析保证；本扩展不以 DNS 查询匹配 CIDR。WebRTC UDP
                可能绕过代理，可在上方限制非代理
                UDP，但这不能保证全部流量受控。QUIC、Chrome
                内部服务、既有连接、回环地址和其他特殊请求存在浏览器层限制。不能承诺完全防止
                IP 泄漏。
              </p>
              <h3>权限</h3>
              <p>
                proxy 用于浏览器代理控制；storage
                用于本地配置；declarativeNetRequest 用于 REJECT
                与可选广告域名拦截。alarms 用于用户开启的订阅下载调度；可选
                privacy 权限用于 WebRTC
                策略。网站访问权仅在授权诊断、在线导入或订阅时按站点申请，不默认授予全部网站。
              </p>
              <button
                disabled={busy}
                onClick={async () => {
                  const permissions = await chrome.permissions.getAll();
                  if (permissions.origins?.length)
                    await chrome.permissions.remove({
                      origins: permissions.origins,
                    });
                  setNotice("已撤销全部站点权限（包含订阅）");
                }}
              >
                撤销全部站点权限（包含订阅）
              </button>
              <p>
                不管理无痕窗口专用代理，不修改操作系统代理或网络配置。代理认证和自动故障切换尚未实现。
              </p>
            </section>
          </>
        )}
        {tab === 5 && <DiagnosticsPanel />}
        {tab === 6 && (
          <>
            <section className="panel prose">
              <h2>ProxyFlow {chrome.runtime.getManifest().version}</h2>
              <p>
                面向 Chrome 的通用智能代理管理扩展，基于 Manifest
                V3、TypeScript、React 与官方 chrome.proxy API。
              </p>
              <p>
                使用标准 HTTP / HTTPS / SOCKS4 / SOCKS5
                入口，无需知道代理客户端内部使用的节点协议。
              </p>
              <h3>安装与分发</h3>
              <p>
                在线链接可直接下载配置进行规则预览；源节点协议不会在 Chrome
                中运行。 Chrome Web Store 安装可自动更新扩展；GitHub ZIP
                适合手动加载与源码开发。
              </p>
              <p>
                MIT License ·
                项目源码、隐私政策与验收记录公开。平台和客户端的实测范围以交付记录为准，不能保证所有流量受代理控制。
              </p>
            </section>
            <UpdatePanel />
          </>
        )}
        <footer>
          ProxyFlow · 连接由你掌控<span>所有配置保存在此浏览器</span>
        </footer>
      </main>
    </div>
  );
}
