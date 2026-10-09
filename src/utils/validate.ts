import type { Config } from "./types";
import { ipv4 } from "../rules/engine";
import { validHost } from "./host";
import { subscriptionUrl } from "../subscriptions/url";
export { validHost } from "./host";
export function validateConfig(input: unknown): asserts input is Config {
  if (!input || typeof input !== "object") throw new Error("配置必须为对象");
  const c = input as Config;
  if (
    c.version !== 1 ||
    !Number.isSafeInteger(c.revision) ||
    c.revision < 0 ||
    !["direct", "global", "smart"].includes(c.mode) ||
    !["system", "light", "dark"].includes(c.theme)
  )
    throw new Error("配置版本或模式无效");
  if (
    !Array.isArray(c.proxies) ||
    c.proxies.length > 50 ||
    !Array.isArray(c.rules) ||
    c.rules.length > 500
  )
    throw new Error("最多 50 个代理、500 条规则");
  const ids = new Set<string>();
  for (const p of c.proxies) {
    if (
      !p ||
      typeof p.id !== "string" ||
      !p.id ||
      ids.has(p.id) ||
      typeof p.name !== "string" ||
      !p.name.trim() ||
      p.name.length > 80 ||
      typeof p.host !== "string" ||
      !validHost(p.host) ||
      !Number.isInteger(p.port) ||
      p.port < 1 ||
      p.port > 65535 ||
      !["http", "https", "socks4", "socks5"].includes(p.protocol)
    )
      throw new Error("代理名称、地址、端口或协议无效");
    ids.add(p.id);
  }
  if (
    typeof c.selectedId !== "string" ||
    typeof c.defaultId !== "string" ||
    (c.proxies.length > 0 &&
      (!ids.has(c.selectedId) || !ids.has(c.defaultId))) ||
    (!c.proxies.length && (c.selectedId || c.defaultId || c.mode !== "direct"))
  )
    throw new Error("请选择有效的当前和默认代理");
  const ruleIds = new Set<string>();
  for (const r of c.rules) {
    if (
      !r ||
      typeof r.id !== "string" ||
      !r.id ||
      ruleIds.has(r.id) ||
      typeof r.value !== "string" ||
      r.value.length > 253 ||
      ![
        "DOMAIN",
        "DOMAIN-SUFFIX",
        "DOMAIN-KEYWORD",
        "IP-CIDR",
        "MATCH",
      ].includes(r.type) ||
      !["DIRECT", "PROXY", "REJECT"].includes(r.action)
    )
      throw new Error("无效或不兼容规则");
    ruleIds.add(r.id);
    if (r.type === "MATCH" && r.value !== "")
      throw new Error("MATCH 不接受匹配值");
    if (
      ["DOMAIN", "DOMAIN-SUFFIX"].includes(r.type) &&
      (!validHost(r.value) ||
        r.value.includes(":") ||
        r.value !== r.value.toLowerCase() ||
        r.value.endsWith("."))
    )
      throw new Error("域名规则需小写 ASCII 域名（国际域名用 punycode）");
    if (r.type === "DOMAIN-KEYWORD" && !/^[a-z0-9.-]+$/.test(r.value))
      throw new Error("关键词仅接受小写 ASCII 域名字符");
    if (r.type === "IP-CIDR") {
      const [ip, bits, ...extra] = r.value.split("/");
      if (
        ipv4(ip) === null ||
        !/^\d+$/.test(bits ?? "") ||
        Number(bits) > 32 ||
        extra.length
      )
        throw new Error("仅支持 IPv4 CIDR 字面地址，不解析 DNS");
    }
    if (
      r.proxyId !== undefined &&
      (typeof r.proxyId !== "string" || !ids.has(r.proxyId))
    )
      throw new Error("规则引用的代理不存在");
  }
  if (
    c.rules.some((r) => r.action === "REJECT") &&
    c.rules.some((r) => r.type === "IP-CIDR")
  )
    throw new Error("当前版本不支持 REJECT 与 IP-CIDR 混合排序，请分开使用");
  if (c.webRtc !== undefined && !["browser", "restrict"].includes(c.webRtc))
    throw new Error("WebRTC 设置无效");
  if (c.blocking !== undefined) {
    if (
      typeof c.blocking.enabled !== "boolean" ||
      !Array.isArray(c.blocking.domains) ||
      c.blocking.domains.length > 500 ||
      new Set(c.blocking.domains).size !== c.blocking.domains.length ||
      c.blocking.domains.some(
        (d) =>
          typeof d !== "string" ||
          !validHost(d) ||
          d.includes(":") ||
          d !== d.toLowerCase() ||
          !d.includes(".") ||
          ipv4(d) !== null,
      )
    )
      throw new Error("广告域名列表无效：最多 500 个唯一小写 ASCII 域名");
  }
  if (c.subscriptions !== undefined) {
    if (!Array.isArray(c.subscriptions) || c.subscriptions.length > 20)
      throw new Error("最多 20 个订阅");
    const ids = new Set<string>();
    for (const sub of c.subscriptions) {
      if (
        !sub ||
        typeof sub.id !== "string" ||
        !sub.id ||
        sub.id.length > 80 ||
        !/^[a-zA-Z0-9_-]+$/.test(sub.id) ||
        ["__proto__", "prototype", "constructor"].includes(sub.id) ||
        ids.has(sub.id) ||
        typeof sub.name !== "string" ||
        !sub.name.trim() ||
        sub.name.length > 80 ||
        typeof sub.url !== "string" ||
        ![
          "auto",
          "native",
          "shadowrocket",
          "clash",
          "xray",
          "domains",
        ].includes(sub.format) ||
        ![0, 6, 24].includes(sub.intervalHours)
      )
        throw new Error("订阅名称、格式或周期无效");
      ids.add(sub.id);
      subscriptionUrl(sub.url);
      const validTarget = (target: unknown) =>
        typeof target === "string" &&
        (["PROXY", "DIRECT", "REJECT"].includes(target) ||
          (target.startsWith("PROXY:") &&
            c.proxies.some((p) => p.id === target.slice(6))));
      if (
        !validTarget(sub.defaultTarget) ||
        !sub.mappings ||
        typeof sub.mappings !== "object" ||
        Array.isArray(sub.mappings) ||
        Object.keys(sub.mappings).length > 100 ||
        Object.entries(sub.mappings).some(
          ([key, value]) => !key || key.length > 200 || !validTarget(value),
        )
      )
        throw new Error("订阅出口映射无效或引用了已删除的代理");
    }
  }
}
