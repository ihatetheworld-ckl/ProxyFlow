import { json, object } from "../parsers/safe";
import { validateConfig } from "../utils/validate";
import type { Config } from "../utils/types";
export const MAX_BACKUP_BYTES = 1024 * 1024;
function clean(c: Config): Config {
  return {
    version: 1,
    revision: c.revision,
    mode: c.mode,
    theme: c.theme,
    selectedId: c.selectedId,
    defaultId: c.defaultId,
    proxies: c.proxies.map((p) => ({
      id: p.id,
      name: p.name,
      host: p.host,
      port: p.port,
      protocol: p.protocol,
    })),
    rules: c.rules.map((r) => ({
      id: r.id,
      type: r.type,
      value: r.value,
      action: r.action,
      ...(r.proxyId ? { proxyId: r.proxyId } : {}),
    })),
    subscriptions: (c.subscriptions ?? []).map((s) => ({
      id: s.id,
      name: s.name,
      url: s.url,
      format: s.format,
      intervalHours: s.intervalHours,
      defaultTarget: s.defaultTarget,
      mappings: { ...s.mappings },
    })),
    blocking: c.blocking
      ? { enabled: c.blocking.enabled, domains: [...c.blocking.domains] }
      : undefined,
    webRtc: c.webRtc ?? "browser",
  };
}
export function exportBackup(c: Config): string {
  validateConfig(c);
  const text = JSON.stringify(
    { format: "proxyflow-backup", schema: 1, config: clean(c) },
    null,
    2,
  );
  if (new TextEncoder().encode(text).length > MAX_BACKUP_BYTES)
    throw new Error("配置备份超过 1 MiB");
  return text;
}
export function parseBackup(text: string, revision: number): Config {
  const value = object(json(text, MAX_BACKUP_BYTES));
  if (!value || value.format !== "proxyflow-backup" || value.schema !== 1)
    throw new Error("仅接受 ProxyFlow 配置备份，不是客户端节点配置");
  validateConfig(value.config);
  const config = { ...clean(value.config), revision };
  validateConfig(config);
  return config;
}
