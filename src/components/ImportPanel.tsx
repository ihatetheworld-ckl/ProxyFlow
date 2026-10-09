import { useState } from "react";
import { FileSearch, Upload, X } from "lucide-react";
import type { Config } from "../utils/types";
import {
  convertConfig,
  canApplyReport,
  type ConversionReport,
  type ImportFormat,
  type Target,
  type RuleAttachment,
} from "../parsers";
import { MAX_IMPORT_BYTES, exportRules } from "../parsers/native";
import { download } from "./client";
const formats: [ImportFormat, string][] = [
  ["auto", "自动识别"],
  ["native", "ProxyFlow 规则文本"],
  ["shadowrocket", "Shadowrocket CONF"],
  ["clash", "Clash / Mihomo YAML"],
  ["xray", "v2rayNG / Xray JSON"],
  ["domains", "纯文本域名列表"],
];
const severityNames = {
  error: "错误",
  unsupported: "不兼容",
  warning: "注意",
  info: "未执行 / 说明",
};
export function ImportPanel({
  config,
  busy,
  save,
}: {
  config: Config;
  busy: boolean;
  save: (next: Config) => Promise<boolean>;
}) {
  const [text, setText] = useState("");
  const [format, setFormat] = useState<ImportFormat>("auto");
  const [mappings, setMappings] = useState<Record<string, Target>>({});
  const [attachments, setAttachments] = useState<RuleAttachment[]>([]);
  const [defaultTarget, setDefaultTarget] = useState<Target>("PROXY");
  const [preview, setPreview] = useState<{
    report: ConversionReport;
    revision: number;
  }>();
  const [targets, setTargets] = useState<string[]>([]);
  const [acknowledge, setAcknowledge] = useState(false);
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  const stale = preview && preview.revision !== config.revision;
  function invalidate() {
    setPreview(undefined);
    setAcknowledge(false);
    setError("");
  }
  function source(value: string) {
    invalidate();
    setText(value);
    setMappings({});
    setTargets([]);
  }
  function analyze() {
    setError("");
    setAcknowledge(false);
    try {
      const report = convertConfig(text, config, {
        format,
        mappings,
        attachments,
        defaultTarget,
      });
      setPreview({ report, revision: config.revision });
      setTargets(report.targets);
    } catch {
      setError("无法解析配置，请检查格式和文件大小");
    }
  }
  async function loadFile(file: File) {
    try {
      if (file.size > MAX_IMPORT_BYTES) throw new Error("文件超过 256 KiB");
      source(await file.text());
      setFileName(file.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "读取文件失败");
    }
  }
  async function addAttachment(file: File) {
    try {
      if (file.size > MAX_IMPORT_BYTES) throw new Error("附件超过 256 KiB");
      if (attachments.length >= 16) throw new Error("最多 16 个附件");
      const value = await file.text();
      invalidate();
      setAttachments([...attachments, { name: file.name, text: value }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "附件读取失败");
    }
  }
  const report = preview?.report;
  const options = (
    <>
      <option value="PROXY">当前代理</option>
      <option value="DIRECT">DIRECT · 直连</option>
      <option value="REJECT">REJECT · 拒绝</option>
      {config.proxies.map((p) => (
        <option key={p.id} value={"PROXY:" + p.id}>
          {p.name}
        </option>
      ))}
    </>
  );
  return (
    <section className="panel import-panel">
      <h2>配置规则转换</h2>
      <p>
        只提取分流规则。源节点、策略组运行逻辑、DNS 和其他客户端设置均不会在
        Chrome 中执行；请使用现有代理入口并查看兼容性报告。
      </p>
      <div className="form-row">
        <label>
          源格式
          <select
            aria-label="导入格式"
            disabled={busy}
            value={format}
            onChange={(e) => {
              invalidate();
              setFormat(e.target.value as ImportFormat);
              setMappings({});
              setTargets([]);
            }}
          >
            {formats.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          域名列表出口
          <select
            aria-label="域名列表出口"
            disabled={busy}
            value={defaultTarget}
            onChange={(e) => {
              invalidate();
              setDefaultTarget(e.target.value as Target);
            }}
          >
            {options}
          </select>
        </label>
      </div>
      <label className="file-label">
        <Upload size={16} />
        选择本地配置文件
        <input
          aria-label="源配置文件"
          disabled={busy}
          type="file"
          accept=".conf,.yaml,.yml,.json,.txt,.csv"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void loadFile(f);
            e.target.value = "";
          }}
        />
      </label>
      <p className="footnote">
        {fileName ||
          "也可直接粘贴配置。每个文件最多 256 KiB，配置与附件总计最多 1 MiB。"}
      </p>
      <textarea
        aria-label="配置文本"
        rows={12}
        spellCheck={false}
        disabled={busy}
        value={text}
        onChange={(e) => {
          source(e.target.value);
          setFileName("");
        }}
      />
      <details className="attachment-details">
        <summary>本地规则集附件 · {attachments.length} 个</summary>
        <p className="footnote">
          Clash 附件标识须与 rule-providers 名称一致；Shadowrocket 附件标识须与
          RULE-SET 引用完全一致（可填写源 URL）。仅在本地读取，不请求该地址。
        </p>
        <label className="file-label">
          添加规则集
          <input
            aria-label="规则集附件"
            type="file"
            accept=".txt,.yaml,.yml,.list,.conf"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void addAttachment(f);
              e.target.value = "";
            }}
          />
        </label>
        {attachments.map((file, index) => (
          <div className="attachment-row" key={index}>
            <input
              aria-label={"附件标识 " + (index + 1)}
              disabled={busy}
              value={file.name}
              onChange={(e) => {
                invalidate();
                setAttachments(
                  attachments.map((f, i) =>
                    i === index ? { ...f, name: e.target.value } : f,
                  ),
                );
              }}
            />
            <small>{new TextEncoder().encode(file.text).length} B</small>
            <button
              disabled={busy}
              aria-label="删除附件"
              onClick={() => {
                invalidate();
                setAttachments(attachments.filter((_, i) => i !== index));
              }}
            >
              <X size={15} />
            </button>
          </div>
        ))}
      </details>
      {targets.length > 0 && (
        <div className="mapping-panel">
          <h3>源出口映射</h3>
          <p className="footnote">
            将源策略组或 outbound 标签固定映射为一个 Chrome
            出口；测速、负载均衡和自动故障切换不会执行。
          </p>
          {targets.map((label) => (
            <label key={label} className="mapping-row">
              <span>{label}</span>
              <select
                aria-label={"映射 " + label}
                disabled={busy}
                value={mappings[label] ?? ""}
                onChange={(e) => {
                  invalidate();
                  const next = { ...mappings };
                  if (e.target.value) next[label] = e.target.value as Target;
                  else delete next[label];
                  setMappings(next);
                }}
              >
                <option value="">请选择出口</option>
                {options}
              </select>
            </label>
          ))}
        </div>
      )}
      <div className="import-actions">
        <button disabled={busy || !text.trim()} onClick={analyze}>
          <FileSearch size={16} />
          解析并预览
        </button>
        {report && (
          <button
            onClick={() =>
              download(
                "proxyflow-import-report.json",
                JSON.stringify(report, null, 2),
              )
            }
          >
            导出兼容性报告
          </button>
        )}
      </div>
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      {report && (
        <>
          <div className="import-summary" role="status">
            <strong>{formats.find(([id]) => id === report.format)?.[1]}</strong>
            <span>可转换 {report.rules.length} 条</span>
            <span>跳过 {report.droppedRules} 条</span>
            <span>
              错误 {report.issues.filter((i) => i.severity === "error").length}{" "}
              项
            </span>
          </div>
          {stale && (
            <div className="alert error" role="alert">
              浏览器配置已更改，请重新解析后应用。
            </div>
          )}
          <div className="issue-list">
            {report.issues.map((issue, index) => (
              <article key={index} className={"import-issue " + issue.severity}>
                <b>{severityNames[issue.severity]}</b>
                <div>
                  <code>{issue.path}</code>
                  <p>{issue.message}</p>
                </div>
              </article>
            ))}
          </div>
          <details open className="preview-details">
            <summary>转换后的规则预览 · {report.rules.length} 条</summary>
            <div className="rule-list">
              {report.rules.map((rule, index) => (
                <div className="rule-row" key={rule.id}>
                  <span className="rule-index">{index + 1}</span>
                  <div>
                    <b>{rule.type}</b>
                    <small>{rule.value || "所有剩余请求"}</small>
                    <small>{report.sourcePaths[index]}</small>
                  </div>
                  <span className="tag">
                    {rule.action === "PROXY"
                      ? (config.proxies.find((p) => p.id === rule.proxyId)
                          ?.name ?? "当前代理")
                      : rule.action}
                  </span>
                </div>
              ))}
            </div>
          </details>
          {report.issues.some(
            (i) => i.severity === "unsupported" || i.acknowledge,
          ) && (
            <label className="acknowledge">
              <input
                type="checkbox"
                disabled={busy}
                checked={acknowledge}
                onChange={(e) => setAcknowledge(e.target.checked)}
              />
              <span>
                我已查看报告，接受跳过不兼容规则及已说明的语义变化；这可能改变网站的直连、代理或拒绝行为。
              </span>
            </label>
          )}
          <button
            className="primary"
            disabled={busy || !!stale || !canApplyReport(report, acknowledge)}
            onClick={async () => {
              if (
                !preview ||
                preview.revision !== config.revision ||
                !canApplyReport(preview.report, acknowledge)
              )
                return;
              if (await save({ ...config, rules: preview.report.rules }))
                setPreview(undefined);
            }}
          >
            用预览规则替换全部现有规则
          </button>
          <button
            disabled={!report.rules.length}
            onClick={() =>
              download(
                "proxyflow-converted-rules.txt",
                exportRules(report.rules),
              )
            }
          >
            导出转换规则
          </button>
        </>
      )}
      <p className="footnote">
        有错误时始终禁止应用；不兼容项或 IP
        字面量语义变化需确认后才能部分导入。无最终 MATCH 时不会补入
        DIRECT。PAC、GFWList/Adblock、高级策略、脚本、IPv6 CIDR 和 DNS
        规则不支持。
      </p>
    </section>
  );
}
