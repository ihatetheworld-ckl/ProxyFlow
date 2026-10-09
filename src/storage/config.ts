import type { Config } from "../utils/types";
export const defaults = (): Config => ({
  version: 1,
  revision: 0,
  mode: "direct",
  proxies: [],
  selectedId: "",
  defaultId: "",
  theme: "system",
  subscriptions: [],
  blocking: {
    enabled: false,
    domains: [
      "doubleclick.net",
      "googlesyndication.com",
      "adservice.google.com",
    ],
  },
  webRtc: "browser",
  rules: [
    { id: "cn", type: "DOMAIN-SUFFIX", value: "cn", action: "DIRECT" },
    {
      id: "baidu",
      type: "DOMAIN-SUFFIX",
      value: "baidu.com",
      action: "DIRECT",
    },
    { id: "qq", type: "DOMAIN-SUFFIX", value: "qq.com", action: "DIRECT" },
    { id: "fallback", type: "MATCH", value: "", action: "PROXY" },
  ],
});
export async function loadConfig(): Promise<Config> {
  const data = await chrome.storage.local.get("config");
  const c: Config = data.config ?? defaults();
  // Additive version-1 upgrade: retain every existing proxy, rule, mode and revision.
  return {
    ...c,
    subscriptions: c.subscriptions ?? [],
    blocking: c.blocking ?? defaults().blocking,
    webRtc: c.webRtc ?? "browser",
  };
}
export async function storeConfig(config: Config) {
  await chrome.storage.local.set({ config });
}
