import { prepareWebRtc } from "../security/webRtc";
import type { Config } from "../utils/types";
import { validateConfig } from "../utils/validate";
import { compilePac } from "./pac";
import { compileDnr } from "../rules/dnr";
export async function controlLevel(): Promise<string> {
  return (await chrome.proxy.settings.get({ incognito: false })).levelOfControl;
}
export function proxyValue(c: Config): chrome.proxy.ProxyConfig {
  if (c.mode === "direct") return { mode: "direct" };
  if (c.mode === "smart")
    return {
      mode: "pac_script",
      pacScript: { data: compilePac(c), mandatory: true },
    };
  const p = c.proxies.find((p) => p.id === c.selectedId)!;
  return {
    mode: "fixed_servers",
    rules: {
      singleProxy: { scheme: p.protocol, host: p.host, port: p.port },
      bypassList: ["<-loopback>"],
    },
  };
}
export async function applyConfig(c: Config) {
  validateConfig(c);
  const level = await controlLevel();
  if (
    ![
      "controllable_by_this_extension",
      "controlled_by_this_extension",
    ].includes(level)
  )
    throw new Error("代理权限冲突：" + level);
  const rules = compileDnr(c);
  for (const r of rules) {
    const result = await chrome.declarativeNetRequest.isRegexSupported({
      regex: r.condition.regexFilter!,
    });
    if (!result.isSupported)
      throw new Error("Chrome 不支持规则正则：" + result.reason);
  }
  const privacy = await prepareWebRtc(c);
  const old = await chrome.declarativeNetRequest.getDynamicRules();
  // Chrome has no atomic transaction spanning proxy + DNR. Preserve previous rules on failure.
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: old.map((r) => r.id),
    addRules: rules,
  });
  try {
    await privacy.apply();
    await chrome.proxy.settings.set({ value: proxyValue(c), scope: "regular" });
  } catch (error) {
    const restored = await Promise.allSettled([
      privacy.rollback(),
      chrome.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: rules.map((r) => r.id),
        addRules: old,
      }),
    ]);
    if (restored.some((r) => r.status === "rejected"))
      throw new Error(
        "配置应用失败，部分恢复操作失败；请检查实际代理、拦截和 WebRTC 状态",
      );
    throw error;
  }
}
