import { compileAds } from "../blocking/compiler";
import type { Config, Rule } from "../utils/types";
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export function ruleRegex(r: Rule): string {
  const v = escape(r.value);
  switch (r.type) {
    case "DOMAIN":
      return "^https?://" + v + "\\.?(:[0-9]+)?/";
    case "DOMAIN-SUFFIX":
      return "^https?://([^/.:]+\\.)*" + v + "\\.?(:[0-9]+)?/";
    case "DOMAIN-KEYWORD":
      return (
        "^https?://([^/:]*" +
        v +
        "[^/:]*|\\[[0-9a-f:]*" +
        v +
        "[0-9a-f:]*\\])(:[0-9]+)?/"
      );
    case "MATCH":
      return "^https?://";
    default:
      throw new Error("DNR 不支持此规则");
  }
}
export function compileDnr(c: Config): chrome.declarativeNetRequest.Rule[] {
  if (c.mode !== "smart" || !c.rules.some((r) => r.action === "REJECT"))
    return compileAds(c);
  const routing = c.rules.map((r, i): chrome.declarativeNetRequest.Rule => ({
    id: i + 1,
    priority: c.rules.length - i,
    action: {
      type:
        r.action === "REJECT"
          ? chrome.declarativeNetRequest.RuleActionType.BLOCK
          : chrome.declarativeNetRequest.RuleActionType.ALLOW,
    },
    condition: {
      regexFilter: ruleRegex(r),
      isUrlFilterCaseSensitive: false,
      resourceTypes: Object.values(chrome.declarativeNetRequest.ResourceType),
    },
  }));
  return [...routing, ...compileAds(c)];
}
