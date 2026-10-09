import type { Rule } from "../utils/types";
export interface ImportReport {
  rules: Rule[];
  unsupported: string[];
  errors: string[];
}
export const MAX_IMPORT_BYTES = 256 * 1024;
export function parseRules(text: string): ImportReport {
  if (new TextEncoder().encode(text).length > MAX_IMPORT_BYTES)
    throw new Error("文件超过 256 KiB");
  const report: ImportReport = { rules: [], unsupported: [], errors: [] };
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (!line || line.startsWith("#")) return;
    const parts = line.split(",").map((s) => s.trim());
    const type = parts[0];
    const match = type === "MATCH";
    if (
      ![
        "DOMAIN",
        "DOMAIN-SUFFIX",
        "DOMAIN-KEYWORD",
        "IP-CIDR",
        "MATCH",
      ].includes(type)
    ) {
      report.unsupported.push(
        `第 ${index + 1} 行：不支持 ${type.slice(0, 60)}`,
      );
      return;
    }
    if (parts.length !== (match ? 2 : 3)) {
      report.errors.push(`第 ${index + 1} 行：字段数量错误`);
      return;
    }
    const target = parts[match ? 1 : 2];
    let action: Rule["action"];
    let proxyId: string | undefined;
    if (["DIRECT", "PROXY", "REJECT"].includes(target))
      action = target as Rule["action"];
    else if (target.startsWith("PROXY:") && target.length > 6) {
      action = "PROXY";
      proxyId = target.slice(6);
    } else {
      report.unsupported.push(`第 ${index + 1} 行：未知出口或策略组`);
      return;
    }
    report.rules.push({
      id: crypto.randomUUID(),
      type: type as Rule["type"],
      value: match ? "" : parts[1],
      action,
      ...(proxyId ? { proxyId } : {}),
    });
  });
  if (report.rules.length > 500) throw new Error("最多 500 条规则");
  return report;
}
export function exportRules(rules: Rule[]): string {
  return rules
    .map((r) =>
      [
        r.type,
        ...(r.type === "MATCH" ? [] : [r.value]),
        r.action === "PROXY" && r.proxyId ? "PROXY:" + r.proxyId : r.action,
      ].join(","),
    )
    .join("\n");
}
