import { canonical } from "../utils/stable";
import { websitePattern } from "../network/permission";
import type { Config, Subscription, SubscriptionState } from "../utils/types";
import { subscriptionUrl } from "./url";
import { limitedFetch } from "../network/limitedFetch";
import { MAX_IMPORT_BYTES } from "../parsers/native";
import { convertConfig, canApplyReport } from "../parsers";
export const ALARM = "proxyflow-subscriptions";
export async function states(): Promise<Record<string, SubscriptionState>> {
  return (
    (await chrome.storage.local.get("subscriptionStates")).subscriptionStates ??
    {}
  );
}
export async function fingerprint(sub: Subscription): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(canonical(sub)),
  );
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
export async function stageUpdate(
  c: Config,
  id: string,
): Promise<Record<string, SubscriptionState>> {
  const sub = c.subscriptions?.find((s) => s.id === id);
  if (!sub) throw new Error("订阅不存在");
  const all = await states();
  const previous = all[id] ?? {};
  let failureReport: import("../parsers/model").ConversionReport | undefined;
  try {
    const u = subscriptionUrl(sub.url);
    if (!(await chrome.permissions.contains({ origins: [websitePattern(u)] })))
      throw new Error("订阅站点权限未授予或已撤销");
    const text = await limitedFetch(u.href, MAX_IMPORT_BYTES);
    const report = convertConfig(text, c, {
      format: sub.format,
      defaultTarget: sub.defaultTarget,
      mappings: sub.mappings,
    });
    if (new TextEncoder().encode(JSON.stringify(report)).length <= 256 * 1024)
      failureReport = report;
    if (report.issues.some((i) => i.severity === "error"))
      throw new Error(
        "订阅转换存在错误，未生成新候选；请检查本地导入格式与出口映射",
      );
    const next = {
      ...previous,
      checkedAt: Date.now(),
      lastSuccessAt: Date.now(),
      error: undefined,
      failureReport: undefined,
      pending: {
        token: crypto.randomUUID(),
        report,
        baseRevision: c.revision,
        fingerprint: await fingerprint(sub),
        fetchedAt: Date.now(),
      },
    };
    if (
      new TextEncoder().encode(JSON.stringify(next.pending)).length >
      256 * 1024
    )
      throw new Error("转换报告过大，未保存候选");
    const merged = { ...all, [id]: next };
    if (new TextEncoder().encode(JSON.stringify(merged)).length > 1024 * 1024)
      throw new Error("订阅候选缓存超过 1 MiB，请清理或应用其他候选");
    all[id] = next;
  } catch (error) {
    all[id] = {
      ...previous,
      checkedAt: Date.now(),
      error: error instanceof Error ? error.message : "更新失败",
      failureReport,
    };
  }
  if (new TextEncoder().encode(JSON.stringify(all)).length > 1024 * 1024)
    delete all[id].failureReport;
  await chrome.storage.local.set({ subscriptionStates: all });
  return all;
}
export async function candidateConfig(
  c: Config,
  id: string,
  token: string,
  acknowledge: boolean,
): Promise<Config> {
  const sub = c.subscriptions?.find((s) => s.id === id);
  const pending = (await states())[id]?.pending;
  if (!sub || !pending || pending.token !== token)
    throw new Error("候选不存在或已被新的更新替换");
  if (
    pending.baseRevision !== c.revision ||
    pending.fingerprint !== (await fingerprint(sub))
  )
    throw new Error("配置或订阅已变化，请重新下载更新");
  if (!canApplyReport(pending.report, acknowledge))
    throw new Error("候选存在错误或需要确认不兼容与语义变化");
  return { ...c, rules: pending.report.rules };
}
export async function discard(id: string) {
  const all = await states();
  if (all[id]) delete all[id].pending;
  await chrome.storage.local.set({ subscriptionStates: all });
}
export async function syncSchedule(c: Config) {
  const all = await states();
  const ids = new Set(c.subscriptions?.map((s) => s.id));
  const clean = Object.fromEntries(
    Object.entries(all).filter(([id]) => ids.has(id)),
  );
  if (Object.keys(clean).length !== Object.keys(all).length)
    await chrome.storage.local.set({ subscriptionStates: clean });
  if (c.subscriptions?.some((s) => s.intervalHours > 0)) {
    if (!(await chrome.alarms.get(ALARM)))
      await chrome.alarms.create(ALARM, {
        periodInMinutes: 15,
        delayInMinutes: 15,
      });
  } else await chrome.alarms.clear(ALARM);
}
export async function scheduledUpdates(c: Config) {
  const all = await states();
  const due = (c.subscriptions ?? [])
    .filter(
      (s) =>
        s.intervalHours > 0 &&
        Date.now() - (all[s.id]?.checkedAt ?? 0) >= s.intervalHours * 3600000,
    )
    .sort((a, b) => (all[a.id]?.checkedAt ?? 0) - (all[b.id]?.checkedAt ?? 0));
  for (const sub of due.slice(0, 3)) await stageUpdate(c, sub.id);
}
