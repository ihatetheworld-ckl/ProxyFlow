import { RuleBuilder } from "./builder";
import { object, yaml } from "./safe";
export type RuleSetBehavior = "classical" | "domain" | "ipcidr";
export function expandRuleSet(
  b: RuleBuilder,
  text: string,
  behavior: RuleSetBehavior,
  target: string,
  path: string,
) {
  let rows: unknown[];
  if (/^\s*payload\s*:/m.test(text)) {
    const data = object(yaml(text));
    if (!data || !Array.isArray(data.payload))
      throw new Error("规则集 YAML 必须包含 payload 数组");
    for (const key of Object.keys(data))
      if (key !== "payload") b.ignored(path + "." + key);
    rows = data.payload;
  } else
    rows = text
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith("#") && !s.startsWith("//"));
  expandRows(b, rows, behavior, target, path);
}
export function expandRows(
  b: RuleBuilder,
  rows: unknown[],
  behavior: RuleSetBehavior,
  target: string,
  path: string,
) {
  rows.forEach((row, index) => {
    const p = path + "[" + index + "]";
    if (typeof row !== "string") {
      b.issue(p, "ruleset-entry", "error", "规则集条目必须为字符串");
      return;
    }
    const line = row.trim();
    if (behavior === "classical") {
      const parts = line.split(",").map((s) => s.trim());
      const type = parts[0].toUpperCase();
      // Classical providers carry match conditions, not independent policies.
      if (parts.length === 2 && type !== "MATCH") {
        b.add(type, parts[1], target, p);
      } else if (
        parts.length === 3 &&
        parts[2] === "no-resolve" &&
        type === "IP-CIDR"
      ) {
        b.add(type, parts[1], target, p, true);
      } else {
        b.issue(
          p,
          "ruleset-entry",
          "unsupported",
          "classical 规则集只支持类型与匹配值；不接受策略、MATCH 或复杂选项",
        );
        b.report.droppedRules++;
      }
    } else if (behavior === "ipcidr") b.add("IP-CIDR", line, target, p, true);
    else {
      if (line.startsWith("+."))
        b.add("DOMAIN-SUFFIX", line.slice(2), target, p);
      else if (line.startsWith("."))
        b.add("DOMAIN-SUFFIX", line.slice(1), target, p);
      else if (line.includes("*")) {
        b.issue(
          p,
          "domain-wildcard",
          "unsupported",
          "域名通配符不能准确转换；使用 +.example.com 或完整域名",
        );
        b.report.droppedRules++;
      } else b.add("DOMAIN", line, target, p);
    }
  });
}
