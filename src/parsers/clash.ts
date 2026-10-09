import { RuleBuilder, mappedTarget, targetLabel } from "./builder";
import { object, yaml } from "./safe";
import { expandRows, expandRuleSet, type RuleSetBehavior } from "./ruleSets";
export function parseClash(text: string, b: RuleBuilder) {
  const data = object(yaml(text));
  if (!data) throw new Error("Clash 配置必须为 YAML 对象");
  for (const key of Object.keys(data))
    if (!["rules", "proxy-groups", "rule-providers"].includes(key))
      b.ignored("$." + key);
  if (data["proxy-groups"] !== undefined) {
    if (!Array.isArray(data["proxy-groups"]))
      throw new Error("proxy-groups 必须为数组");
    data["proxy-groups"].forEach((entry, index) => {
      const group = object(entry);
      const path = "$.proxy-groups[" + index + "]";
      if (!group || !targetLabel(group.name)) {
        b.issue(path, "group-shape", "error", "策略组名称无效");
        return;
      }
      b.strictTargets.add(group.name);
      b.issue(
        path,
        "manual-policy",
        "warning",
        "策略组的选择、测速、负载均衡与故障切换逻辑不执行；规则出口需显式映射",
      );
      for (const key of Object.keys(group))
        if (key !== "name") b.ignored(path + "." + key);
      if (mappedTarget(b.context.options.mappings, group.name))
        b.issue(
          path + ".name",
          "mapped-group",
          "info",
          "此组标签已映射到固定 Chrome 出口",
        );
    });
  }
  if (Array.isArray(data.proxies))
    for (const entry of data.proxies) {
      const proxy = object(entry);
      if (proxy && targetLabel(proxy.name)) b.strictTargets.add(proxy.name);
    }
  const providerData = data["rule-providers"];
  const providers = providerData === undefined ? {} : object(providerData);
  if (!providers) throw new Error("rule-providers 必须为对象");
  for (const [name, value] of Object.entries(providers)) {
    const provider = object(value);
    const p = "$.rule-providers." + name;
    if (!provider) {
      b.issue(p, "provider-shape", "error", "规则提供者必须为对象");
      continue;
    }
    for (const key of Object.keys(provider))
      if (!["type", "behavior", "payload"].includes(key))
        b.ignored(p + "." + key);
    if (provider.type !== "inline")
      b.issue(
        p + ".type",
        "local-provider",
        "info",
        "远程/文件规则集需手动提供同名本地附件；不下载或读取源路径",
      );
  }
  if (!Array.isArray(data.rules))
    throw new Error("Clash 配置必须包含 rules 数组");
  data.rules.forEach((row, index) => {
    const p = "$.rules[" + index + "]";
    if (typeof row !== "string") {
      b.issue(p, "rule-shape", "error", "规则必须为字符串");
      return;
    }
    const parts = row.split(",").map((s) => s.trim());
    if (parts[0].toUpperCase() !== "RULE-SET") {
      b.csv(row, p);
      return;
    }
    if (parts.length !== 3) {
      b.issue(
        p,
        "provider-options",
        "unsupported",
        "RULE-SET 附加选项无法转换",
      );
      b.report.droppedRules++;
      return;
    }
    const provider = object(providers[parts[1]]);
    if (!provider) {
      b.issue(
        p,
        "missing-provider",
        "unsupported",
        "RULE-SET 引用的提供者不存在",
      );
      b.report.droppedRules++;
      return;
    }
    const behavior = provider.behavior;
    if (!["classical", "domain", "ipcidr"].includes(String(behavior))) {
      b.issue(p, "provider-behavior", "unsupported", "规则集 behavior 不支持");
      b.report.droppedRules++;
      return;
    }
    if (provider.type === "inline" && Array.isArray(provider.payload)) {
      expandRows(
        b,
        provider.payload,
        behavior as RuleSetBehavior,
        parts[2],
        p + ".payload",
      );
      return;
    }
    if (provider.type === "inline") {
      b.issue(
        p,
        "provider-payload",
        "error",
        "inline 提供者必须包含 payload 数组",
      );
      return;
    }
    if (!["http", "file"].includes(String(provider.type))) {
      b.issue(p, "provider-type", "unsupported", "提供者 type 不支持");
      return;
    }
    const file = b.context.options.attachments?.find(
      (f) => f.name === parts[1],
    );
    if (!file) {
      b.issue(
        p,
        "missing-attachment",
        "unsupported",
        "请添加与提供者名称相同的本地规则集附件",
      );
      b.report.droppedRules++;
      return;
    }
    expandRuleSet(
      b,
      file.text,
      behavior as RuleSetBehavior,
      parts[2],
      p + ".attachment",
    );
  });
}
