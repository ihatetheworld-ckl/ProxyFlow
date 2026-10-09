import { useState } from "react";
import { download } from "./client";
import { exportBackup, parseBackup, MAX_BACKUP_BYTES } from "../storage/backup";
import type { Config } from "../utils/types";
export function BackupPanel({
  config,
  busy,
  save,
}: {
  config: Config;
  busy: boolean;
  save: (c: Config) => Promise<boolean>;
}) {
  const [preview, setPreview] = useState<Config>();
  const [accepted, setAccepted] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const locked = busy || working;
  async function load(file: File) {
    setPreview(undefined);
    setAccepted(false);
    setError("");
    setWorking(true);
    try {
      if (file.size > MAX_BACKUP_BYTES) throw new Error("备份文件超过 1 MiB");
      const text = new TextDecoder("utf-8", { fatal: true }).decode(
        await file.arrayBuffer(),
      );
      setPreview(parseBackup(text, config.revision));
    } catch (e) {
      setError(e instanceof Error ? e.message : "备份读取失败");
    } finally {
      setWorking(false);
    }
  }
  async function restore() {
    if (!preview || !accepted || preview.revision !== config.revision || locked)
      return;
    setWorking(true);
    setError("");
    try {
      if (
        preview.webRtc === "restrict" &&
        !(await chrome.permissions.request({ permissions: ["privacy"] }))
      )
        throw new Error("恢复 WebRTC 限制需要 privacy 权限；未替换配置");
      if (await save(preview)) {
        setPreview(undefined);
        setAccepted(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "恢复失败");
    } finally {
      setWorking(false);
    }
  }
  return (
    <section className="panel prose">
      <h2>本地配置备份与迁移</h2>
      <p>
        商店版本和开发目录可能具有不同扩展 ID，Chrome
        不会自动迁移它们的本地数据。可在旧副本导出备份，再在新副本预览恢复。
      </p>
      <p className="footnote">
        备份包含代理地址、规则、订阅
        URL（可能含令牌）与安全设置，请妥善保管。权限、候选缓存、浏览记录与网络日志不包含在备份中；订阅站点需重新授权。
      </p>
      <button
        disabled={locked}
        onClick={() => {
          setError("");
          try {
            download("proxyflow-config-backup.json", exportBackup(config));
          } catch (e) {
            setError(e instanceof Error ? e.message : "备份导出失败");
          }
        }}
      >
        导出本地配置备份（含敏感地址）
      </button>
      <label className="file-label">
        读取 ProxyFlow 备份预览
        <input
          type="file"
          aria-label="配置备份文件"
          accept=".json"
          disabled={locked}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void load(file);
            e.target.value = "";
          }}
        />
      </label>
      {preview && (
        <>
          <p role="status">
            将恢复 {preview.proxies.length} 个代理、{preview.rules.length}{" "}
            条规则、{preview.subscriptions?.length ?? 0} 个订阅；模式：
            {preview.mode}，WebRTC：{preview.webRtc}。
          </p>
          <details>
            <summary>查看完整备份内容（含敏感配置）</summary>
            <pre>{JSON.stringify(preview, null, 2)}</pre>
          </details>
          {preview.revision !== config.revision && (
            <div className="alert error">
              浏览器配置已更改，请重新读取备份。
            </div>
          )}
          <label className="acknowledge">
            <input
              type="checkbox"
              aria-label="确认替换全部本地配置"
              disabled={locked}
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
            />
            <span>
              已检查备份，确认替换全部本地配置并应用其中的代理模式与规则。
            </span>
          </label>
          <button
            disabled={
              locked || !accepted || preview.revision !== config.revision
            }
            onClick={() => void restore()}
          >
            确认恢复并应用配置
          </button>
        </>
      )}
      {error && (
        <div role="alert" className="alert error">
          {error}
        </div>
      )}
    </section>
  );
}
