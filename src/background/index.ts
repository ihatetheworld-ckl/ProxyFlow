import { defaults, loadConfig, storeConfig } from "../storage/config";
import { applyConfig, controlLevel } from "../proxy/controller";
import { runDiagnostics } from "../diagnostics/report";
import {
  states,
  stageUpdate,
  candidateConfig,
  discard,
  syncSchedule,
  scheduledUpdates,
  ALARM,
} from "../subscriptions/service";
import { webRtcState } from "../security/webRtc";
import { validateConfig } from "../utils/validate";
import type { Config, Status } from "../utils/types";
import { downloadConfiguration } from "../network/configDownload";
import { installationInfo, checkExtensionUpdate } from "../updates/service";
let queue: Promise<unknown> = Promise.resolve();
async function status(error?: string) {
  await chrome.storage.local.set({
    status: {
      level: await controlLevel(),
      error,
      updatedAt: Date.now(),
    } satisfies Status,
  });
  await chrome.action.setBadgeText({ text: error ? "!" : "" });
  await chrome.action.setBadgeBackgroundColor({ color: "#dc2626" });
}
function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const task = queue.then(fn);
  queue = task.catch(() => {});
  return task;
}
async function commit(input: unknown, c: Config) {
  validateConfig(input);
  if (input.revision !== c.revision)
    throw new Error("配置已在其他页面更改，请刷新后重试");
  const saved: Config = { ...input, revision: c.revision + 1 };
  await applyConfig(saved);
  try {
    await storeConfig(saved);
  } catch (error) {
    try {
      await applyConfig(c);
    } catch {
      throw new Error(
        "配置持久化失败，且旧配置恢复失败；请检查实际代理、拦截和 WebRTC 状态",
      );
    }
    throw error;
  }
  let warning: string | undefined;
  try {
    await syncSchedule(saved);
  } catch {
    warning = "配置已保存，但订阅调度未能同步，请重新保存或重启 Chrome";
  }
  try {
    await status(warning);
  } catch {
    warning =
      warning ?? "配置已保存，但状态提示未能更新，请检查实际 Chrome 设置";
  }
  let level = "unknown";
  try {
    level = await controlLevel();
  } catch {
    warning = warning ?? "配置已保存，但控制权状态无法读取，请运行网络诊断";
  }
  return {
    config: saved,
    status: { level, error: warning },
    security: await webRtcState(),
  };
}
chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (
    sender.id !== chrome.runtime.id ||
    !sender.url?.startsWith(chrome.runtime.getURL(""))
  )
    return false;
  const readonly = ["FETCH_CONFIG", "UPDATE_INFO", "UPDATE_CHECK"].includes(
    message.type,
  );
  const task = readonly
    ? (async () => {
        if (message.type === "FETCH_CONFIG")
          return { download: await downloadConfiguration(message.url) };
        if (message.type === "UPDATE_INFO")
          return { installation: await installationInfo() };
        return { extensionUpdate: await checkExtensionUpdate() };
      })()
    : enqueue(async () => {
        const c = await loadConfig();
        if (message.type === "GET") {
          const data = await chrome.storage.local.get("status");
          return {
            config: c,
            status: { ...data.status, level: await controlLevel() },
            updates: await states(),
            security: await webRtcState(),
          };
        }

        if (message.type === "SAVE") return await commit(message.config, c);
        if (message.type === "SUB_UPDATE")
          return { updates: await stageUpdate(c, message.id) };
        if (message.type === "SUB_DISCARD") {
          await discard(message.id);
          return { updates: await states() };
        }
        if (message.type === "SUB_APPLY") {
          const next = await candidateConfig(
            c,
            message.id,
            message.token,
            message.acknowledge === true,
          );
          const result = await commit(next, c);
          await discard(message.id);
          return { ...result, updates: await states() };
        }
        if (message.type === "TEST") {
          const diagnostics = await runDiagnostics(c, message.url);
          return { diagnostics, result: diagnostics.summary };
        }
        throw new Error("未知请求");
      });
  task.then(reply).catch(async (error: unknown) => {
    try {
      if (!readonly)
        await status("操作失败，请检查配置、代理控制权或 Chrome API 限制");
    } catch {
      // A storage failure must not prevent the UI from receiving the error.
    } finally {
      reply({ error: error instanceof Error ? error.message : "操作失败" });
    }
  });
  return true;
});
chrome.proxy.onProxyError.addListener((details) => {
  const code = /^(net::)?ERR_[A-Z_]+$/.test(details.error)
    ? details.error
    : "PROXY_ERROR";
  void chrome.storage.local
    .set({ proxyError: { code, fatal: details.fatal, at: Date.now() } })
    .catch(() => {});
  void status(
    details.fatal
      ? "Chrome 报告严重代理错误；未自动回退直连，请检查代理。"
      : "Chrome 报告代理错误，请检查代理与目标网站。",
  ).catch(() => {});
});
chrome.proxy.settings.onChange.addListener(() => {
  void controlLevel()
    .then((level) =>
      status(
        level === "controlled_by_this_extension"
          ? undefined
          : "代理控制权已变化，配置可能未生效",
      ),
    )
    .catch(() => {});
});
chrome.runtime.onInstalled.addListener((details) => {
  void enqueue(async () => {
    if (details.reason === "install") {
      await storeConfig(defaults());
      await chrome.runtime.openOptionsPage();
    }
    await applyConfig(await loadConfig());
    await syncSchedule(await loadConfig());
    await status();
  }).catch(() => status("初始化配置未能应用").catch(() => {}));
});
chrome.runtime.onStartup.addListener(() => {
  void enqueue(async () => {
    await applyConfig(await loadConfig());
    await syncSchedule(await loadConfig());
    await status();
  }).catch(() => status("启动时代理配置未能应用").catch(() => {}));
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM)
    void enqueue(async () => {
      await scheduledUpdates(await loadConfig());
    }).catch(() => {});
});
chrome.permissions.onRemoved.addListener(() => {
  void status("权限已撤销，请检查订阅授权、诊断权限和 WebRTC 策略").catch(
    () => {},
  );
});
