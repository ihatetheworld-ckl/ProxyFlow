import type { Config, WebRtcState } from "../utils/types";
export async function webRtcState(): Promise<WebRtcState> {
  let permission = false;
  try {
    permission =
      !!chrome.permissions?.contains &&
      (await chrome.permissions.contains({ permissions: ["privacy"] }));
  } catch {
    return { permission: false, error: "无法读取 privacy 权限" };
  }
  if (!permission) return { permission: false };
  const setting = chrome.privacy?.network?.webRTCIPHandlingPolicy;
  if (!setting) return { permission, error: "Chrome WebRTC 策略 API 不可用" };
  try {
    const current = await setting.get({ incognito: false });
    return { permission, value: current.value, level: current.levelOfControl };
  } catch {
    return { permission, error: "无法读取 WebRTC 策略" };
  }
}
export async function prepareWebRtc(
  c: Config,
): Promise<{ apply: () => Promise<void>; rollback: () => Promise<void> }> {
  const restrict = c.webRtc === "restrict";
  const old = await webRtcState();
  const setting = chrome.privacy?.network?.webRTCIPHandlingPolicy;
  const noop = async () => {};
  if (!old.permission || !setting) {
    if (restrict)
      throw new Error("开启 WebRTC 控制需要 privacy 权限及 Chrome API");
    return { apply: noop, rollback: noop };
  }
  if (old.error) {
    if (restrict) throw new Error(old.error);
    return { apply: noop, rollback: noop };
  }
  if (
    restrict &&
    ![
      "controllable_by_this_extension",
      "controlled_by_this_extension",
    ].includes(old.level ?? "")
  )
    throw new Error("WebRTC 策略控制权冲突");
  const owned = old.level === "controlled_by_this_extension";
  if (owned && !old.value)
    throw new Error("无法确认原 WebRTC 策略，未执行设置");
  if (!restrict && !owned) return { apply: noop, rollback: noop };
  return {
    apply: async () => {
      if (restrict)
        await setting.set({
          value: "disable_non_proxied_udp",
          scope: "regular",
        });
      else await setting.clear({ scope: "regular" });
    },
    rollback: async () => {
      if (owned) await setting.set({ value: old.value!, scope: "regular" });
      else await setting.clear({ scope: "regular" });
    },
  };
}
