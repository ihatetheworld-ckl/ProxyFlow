import type { ExtensionUpdate, InstallationInfo } from "../utils/types";
export const PROJECT_URL = "https://github.com/ihatetheworld-ckl/ProxyFlow";
export async function installationInfo(): Promise<InstallationInfo> {
  const manifest = chrome.runtime.getManifest();
  const base: InstallationInfo = {
    version: manifest.version,
    channel: "unknown",
    canCheck: false,
  };
  try {
    // getSelf is exempt from the broad management permission; never enumerate other extensions.
    const self = await chrome.management.getSelf();
    if (self.installType === "development")
      return { ...base, channel: "development" };
    const store =
      manifest.update_url === "https://clients2.google.com/service/update2/crx";
    if (self.installType === "normal" && store)
      return {
        ...base,
        channel: "store",
        canCheck: true,
        storeUrl:
          "https://chromewebstore.google.com/detail/" + chrome.runtime.id,
      };
    if (self.installType === "admin")
      return { ...base, channel: "managed", canCheck: true };
    return { ...base, channel: "other", canCheck: !!manifest.update_url };
  } catch {
    return base;
  }
}
export async function checkExtensionUpdate(): Promise<ExtensionUpdate> {
  const installed = await installationInfo();
  if (!installed.canCheck)
    return {
      status: "unsupported",
      message:
        "当前安装渠道不支持在线更新。已解压版本需更新本地目录；从 Chrome Web Store 安装后才由 Chrome 自动更新。",
    };
  try {
    const result = await chrome.runtime.requestUpdateCheck();
    if (result.status === "update_available")
      return {
        status: "update_available",
        version: result.version,
        message:
          "Chrome 检测到可用更新，将在适当时机安装；可关闭扩展页面等待，配置保存在本地。",
      };
    if (result.status === "throttled")
      return {
        status: "throttled",
        message:
          "Chrome 限制了本次检查频率，请稍后再试；自动更新仍由 Chrome 调度。",
      };
    if (result.status === "no_update")
      return {
        status: "no_update",
        message:
          "Chrome 当前未发现更新。这不代表 GitHub 或尚未审核的商店版本已安装。",
      };
    return {
      status: "error",
      message: "Chrome 返回未知更新状态，请稍后再试。",
    };
  } catch {
    return {
      status: "error",
      message: "Chrome 更新检查失败，请检查网络、安装渠道或企业策略。",
    };
  }
}
