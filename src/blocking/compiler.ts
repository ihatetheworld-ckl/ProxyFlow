import type { Config } from "../utils/types";
const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export function isAdBlocked(c: Config, host: string): boolean {
  host = host.toLowerCase().replace(/\.$/, "");
  return (
    !!c.blocking?.enabled &&
    c.blocking.domains.some((d) => host === d || host.endsWith("." + d))
  );
}
export function compileAds(c: Config): chrome.declarativeNetRequest.Rule[] {
  if (!c.blocking?.enabled) return [];
  return c.blocking.domains.map((domain, i) => ({
    id: 10000 + i,
    priority: 10000,
    action: { type: chrome.declarativeNetRequest.RuleActionType.BLOCK },
    condition: {
      regexFilter:
        "^https?://([^/.:]+\\.)*" + escape(domain) + "\\.?(:[0-9]+)?/",
      isUrlFilterCaseSensitive: false,
      resourceTypes: Object.values(chrome.declarativeNetRequest.ResourceType),
    },
  }));
}
