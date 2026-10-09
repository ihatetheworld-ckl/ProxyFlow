import type { Config, Rule } from "../utils/types";
import { validateConfig } from "../utils/validate";
import type {
  ConversionReport,
  ImportContext,
  ImportIssue,
  Target,
} from "./model";
export class RuleBuilder {
  readonly report: ConversionReport;
  readonly targets = new Set<string>();
  readonly strictTargets = new Set<string>();
  constructor(
    readonly context: ImportContext,
    format: ConversionReport["format"],
  ) {
    this.report = {
      format,
      rules: [],
      issues: [],
      targets: [],
      inputRules: 0,
      droppedRules: 0,
      sourcePaths: [],
    };
  }
  issue(
    path: string,
    code: string,
    severity: ImportIssue["severity"],
    message: string,
    acknowledge = false,
  ) {
    if (this.report.issues.length >= 2000) {
      this.report.issues[1999] = {
        path: "$",
        code: "report-limit",
        severity: "error",
        message: "兼容性报告条目超过限制",
      };
      return;
    }
    this.report.issues.push({
      path,
      code,
      severity,
      message,
      ...(acknowledge ? { acknowledge: true } : {}),
    });
  }
  ignored(path: string) {
    this.issue(
      path,
      "ignored-field",
      "info",
      "此字段未导入或执行；仅提取分流规则",
    );
  }
  target(
    raw: string,
    path: string,
    literal = false,
  ): Pick<Rule, "action" | "proxyId"> | null {
    if (
      typeof raw !== "string" ||
      !raw ||
      raw.length > 200 ||
      [...raw].some((char) => char.charCodeAt(0) < 32)
    ) {
      this.issue(
        path,
        "invalid-target",
        "error",
        "出口标签无效或超过 200 字符",
      );
      return null;
    }
    const mapping = this.context.options.mappings;
    const hasMapping = !!mapping && Object.hasOwn(mapping, raw);
    if (!literal && this.strictTargets.has(raw) && !hasMapping) {
      this.targets.add(raw);
      this.issue(
        path,
        "unmapped-target",
        "unsupported",
        "此源出口标签必须显式映射，不会根据名称推断",
      );
      return null;
    }
    if (
      !literal &&
      (hasMapping ||
        this.strictTargets.has(raw) ||
        !["DIRECT", "PROXY", "REJECT"].includes(raw))
    )
      this.targets.add(raw);
    const value = !literal && hasMapping ? mapping![raw] : raw;
    if (["DIRECT", "PROXY", "REJECT"].includes(value))
      return { action: value as Rule["action"] };
    if (value.startsWith("PROXY:")) {
      const id = value.slice(6);
      if (this.context.config.proxies.some((p) => p.id === id))
        return { action: "PROXY", proxyId: id };
      this.issue(path, "missing-proxy", "error", "所映射的代理出口不存在");
      return null;
    }
    this.targets.add(raw);
    this.issue(
      path,
      "unmapped-target",
      "unsupported",
      "出口标签未映射，请选择已有代理、DIRECT 或 REJECT",
    );
    return null;
  }
  add(
    type: string,
    value: string,
    target: string,
    path: string,
    ipLiteral = false,
    literalTarget = false,
  ) {
    this.report.inputRules++;
    if (this.report.inputRules > 2000)
      throw new Error("输入规则最多 2000 条（展开后）");
    const supported = [
      "DOMAIN",
      "DOMAIN-SUFFIX",
      "DOMAIN-KEYWORD",
      "IP-CIDR",
      "MATCH",
    ];
    if (!supported.includes(type)) {
      this.issue(
        path,
        "rule-type",
        "unsupported",
        "此规则类型不支持 PAC/DNR 转换",
      );
      this.report.droppedRules++;
      return;
    }
    const exit = this.target(target, path, literalTarget);
    if (!exit) {
      this.report.droppedRules++;
      return;
    }
    const rule: Rule = {
      id: crypto.randomUUID(),
      type: type as Rule["type"],
      value,
      ...exit,
    };
    try {
      validateConfig({ ...this.context.config, rules: [rule] });
    } catch {
      this.issue(
        path,
        "invalid-rule",
        "error",
        "规则值无效（需小写 ASCII 域名、合法 IPv4 CIDR 或有效出口）",
      );
      this.report.droppedRules++;
      return;
    }
    if (type === "IP-CIDR")
      this.issue(
        path,
        "literal-ip",
        "warning",
        ipLiteral
          ? "CIDR 仅匹配 URL 的 IPv4 字面地址，不执行或复用 DNS 解析"
          : "源规则可依赖 DNS 地址；转换后仅匹配 URL IPv4 字面地址，语义会变化",
        true,
      );
    this.report.rules.push(rule);
    this.report.sourcePaths.push(path);
  }
  csv(line: string, path: string, override?: string) {
    const parts = line.split(",").map((s) => s.trim());
    let type = parts[0].toUpperCase();
    if (type === "FINAL") type = "MATCH";
    const match = type === "MATCH";
    const expected = match ? 2 : 3;
    const options = parts.slice(expected);
    if (
      parts.length < expected ||
      options.some((x) => x !== "no-resolve") ||
      (options.length && type !== "IP-CIDR")
    ) {
      this.report.inputRules++;
      this.report.droppedRules++;
      this.issue(
        path,
        "rule-options",
        "unsupported",
        "规则字段或附加选项不兼容",
      );
      return;
    }
    this.add(
      type,
      match ? "" : parts[1],
      override ?? parts[match ? 1 : 2],
      path,
      options.includes("no-resolve"),
    );
  }
  finish(): ConversionReport {
    this.report.targets = [...this.targets];
    if (this.report.rules.length > 500)
      this.issue("$", "rule-limit", "error", "转换后最多 500 条规则");
    else if (this.report.rules.length) {
      try {
        validateConfig({
          ...this.context.config,
          rules: this.report.rules,
        } satisfies Config);
      } catch {
        this.issue(
          "$",
          "combined-validation",
          "error",
          "转换后规则组合无效：不支持 REJECT 与 IP-CIDR 混合排序",
        );
      }
    }
    if (!this.report.rules.length)
      this.issue("$", "no-rules", "error", "没有可应用的规则");
    else if (!this.report.rules.some((r) => r.type === "MATCH"))
      this.issue(
        "$",
        "no-match",
        "warning",
        "源配置没有可转换的最终规则；未匹配请求会被 PAC 后备拒绝，不会自动直连",
      );
    return this.report;
  }
}
export function targetLabel(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 200;
}
export function mappedTarget(
  mappings: Record<string, Target> | undefined,
  label: string,
): Target | undefined {
  return mappings && Object.hasOwn(mappings, label)
    ? mappings[label]
    : undefined;
}
