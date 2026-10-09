import { RuleBuilder, targetLabel } from "./builder";
import { json, object } from "./safe";
import { ipv4 } from "../rules/engine";
export function parseXray(text: string, b: RuleBuilder) {
  const data = object(json(text));
  if (!data) throw new Error("Xray 配置必须为 JSON 对象");
  const routing = object(data.routing !== undefined ? data.routing : data);
  if (!routing) throw new Error("routing 必须为对象");
  const root = data.routing !== undefined ? "$.routing" : "$";
  if (data.routing !== undefined)
    for (const key of Object.keys(data))
      if (key !== "routing") b.ignored("$." + key);
  const strategy = routing.domainStrategy ?? "AsIs";
  if (!["AsIs", "IPIfNonMatch", "IPOnDemand"].includes(String(strategy)))
    b.issue(
      root + ".domainStrategy",
      "domain-strategy",
      "error",
      "未知 domainStrategy",
    );
  else if (strategy !== "AsIs")
    b.issue(
      root + ".domainStrategy",
      "dns-strategy",
      "warning",
      "Chrome PAC 不执行 Xray DNS 路由策略；仅可转换域名规则，IP 规则将标记不兼容",
    );
  for (const key of Object.keys(routing))
    if (!["rules", "domainStrategy"].includes(key)) b.ignored(root + "." + key);
  // Only explicitly tagged freedom/blackhole outbounds have an unambiguous browser action.
  const builtins = new Map<string, string | null>();
  const duplicates = new Set<string>();
  if (Array.isArray(data.outbounds))
    for (const entry of data.outbounds) {
      const outbound = object(entry);
      if (outbound && targetLabel(outbound.tag)) {
        if (builtins.has(outbound.tag)) duplicates.add(outbound.tag);
        builtins.set(
          outbound.tag,
          Object.keys(outbound).some(
            (key) => !["tag", "protocol", "settings"].includes(key),
          ) ||
            (outbound.settings !== undefined &&
              (!object(outbound.settings) ||
                Object.keys(object(outbound.settings)!).length > 0))
            ? null
            : outbound.protocol === "freedom"
              ? "DIRECT"
              : outbound.protocol === "blackhole"
                ? "REJECT"
                : null,
        );
      }
    }
  if (!Array.isArray(routing.rules))
    throw new Error("routing.rules 必须为数组");
  routing.rules.forEach((entry, index) => {
    const p = root + ".rules[" + index + "]";
    const rule = object(entry);
    if (!rule || !targetLabel(rule.outboundTag)) {
      b.issue(
        p,
        "outbound-tag",
        "unsupported",
        "规则需有 outboundTag；balancerTag 不支持",
      );
      b.report.droppedRules++;
      return;
    }
    const keys = Object.keys(rule);
    const extra = keys.filter(
      (k) => !["type", "domain", "ip", "outboundTag"].includes(k),
    );
    if (rule.type !== undefined && rule.type !== "field") extra.push("type");
    if (extra.length) {
      for (const key of extra)
        b.issue(
          p + "." + key,
          "compound-condition",
          "unsupported",
          "多条件 AND、来源、端口、协议或负载均衡条件无法准确转换；整条规则跳过",
        );
      b.report.droppedRules++;
      return;
    }
    if (rule.domain !== undefined && rule.ip !== undefined) {
      b.issue(
        p,
        "compound-condition",
        "unsupported",
        "domain 与 ip 同时存在的 AND 规则无法准确转换；整条跳过",
      );
      b.report.droppedRules++;
      return;
    }
    const tag = rule.outboundTag;
    if (duplicates.has(tag)) {
      b.issue(
        p + ".outboundTag",
        "duplicate-outbound",
        "error",
        "引用的 outbound 标签重复",
      );
      return;
    }
    const hasMapping =
      !!b.context.options.mappings &&
      Object.hasOwn(b.context.options.mappings, tag);
    const builtin = builtins.get(tag);
    const isBuiltin = builtin === "DIRECT" || builtin === "REJECT";
    if (!isBuiltin) b.strictTargets.add(tag);
    const target = hasMapping ? tag : isBuiltin ? builtin : tag;
    const add = (type: string, value: string, path: string, literal = false) =>
      b.add(type, value, target, path, literal, isBuiltin && !hasMapping);
    if (rule.domain !== undefined) {
      if (!Array.isArray(rule.domain) || !rule.domain.length) {
        b.issue(
          p + ".domain",
          "domain-array",
          "error",
          "domain 必须为非空数组",
        );
        return;
      }
      rule.domain.forEach((value, i) => {
        const path = p + ".domain[" + i + "]";
        if (typeof value !== "string") {
          b.issue(path, "domain-value", "error", "域名条目必须为字符串");
          return;
        }
        if (value.startsWith("full:")) add("DOMAIN", value.slice(5), path);
        else if (value.startsWith("domain:"))
          add("DOMAIN-SUFFIX", value.slice(7), path);
        else if (value.startsWith("keyword:"))
          add("DOMAIN-KEYWORD", value.slice(8), path);
        else if (value.includes(":")) {
          b.issue(
            path,
            "domain-kind",
            "unsupported",
            "regexp、geosite 与外部资源域名规则不兼容",
          );
          b.report.droppedRules++;
        } else add("DOMAIN-KEYWORD", value, path);
      });
      return;
    }
    if (rule.ip !== undefined) {
      if (!Array.isArray(rule.ip) || !rule.ip.length) {
        b.issue(p + ".ip", "ip-array", "error", "ip 必须为非空数组");
        return;
      }
      if (strategy !== "AsIs") {
        b.issue(
          p + ".ip",
          "dns-ip",
          "unsupported",
          "此 IP 规则依赖源 DNS 策略，不能准确转换",
        );
        b.report.droppedRules++;
        return;
      }
      rule.ip.forEach((value, i) => {
        const path = p + ".ip[" + i + "]";
        if (typeof value !== "string") {
          b.issue(path, "ip-value", "error", "IP 条目必须为字符串");
          return;
        }
        if (value.includes(":")) {
          b.issue(
            path,
            "ip-kind",
            "unsupported",
            "IPv6、geoip 或外部 IP 资源不支持",
          );
          b.report.droppedRules++;
          return;
        }
        add(
          "IP-CIDR",
          ipv4(value) !== null ? value + "/32" : value,
          path,
          true,
        );
      });
      return;
    }
    add("MATCH", "", p);
  });
}
