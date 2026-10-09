import type { Config, Rule } from "../utils/types";
export function ipv4(host: string): number | null {
  const parts = host.split(".");
  if (
    parts.length !== 4 ||
    parts.some(
      (p) =>
        !/^\d{1,3}$/.test(p) ||
        (p.length > 1 && p[0] === "0") ||
        Number(p) > 255,
    )
  )
    return null;
  return parts.reduce((n, p) => n * 256 + Number(p), 0) >>> 0;
}
export function inCidr(host: string, cidr: string): boolean {
  const [base, bits] = cidr.split("/");
  const ip = ipv4(host),
    network = ipv4(base);
  const n = Number(bits);
  if (
    ip === null ||
    network === null ||
    !/^\d+$/.test(bits ?? "") ||
    n < 0 ||
    n > 32
  )
    return false;
  const mask = n === 0 ? 0 : (0xffffffff << (32 - n)) >>> 0;
  return (ip & mask) === (network & mask);
}
export function matches(rule: Rule, host: string): boolean {
  host = host.toLowerCase().replace(/\.$/, "");
  const value = rule.value.toLowerCase();
  switch (rule.type) {
    case "DOMAIN":
      return host === value;
    case "DOMAIN-SUFFIX":
      return host === value || host.endsWith("." + value);
    case "DOMAIN-KEYWORD":
      return host.includes(value);
    case "IP-CIDR":
      return inCidr(host, value);
    case "MATCH":
      return true;
  }
}
export function route(config: Config, host: string): string {
  if (config.mode === "direct") return "DIRECT";
  if (config.mode === "global") return config.selectedId;
  const rule = config.rules.find((r) => matches(r, host));
  return !rule
    ? "REJECT"
    : rule.action === "PROXY"
      ? rule.proxyId || config.selectedId
      : rule.action;
}
