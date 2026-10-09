import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiResult, Config } from "../src/utils/types";
const mocks = vi.hoisted(() => ({
  load: vi.fn(),
  store: vi.fn(),
  apply: vi.fn(),
}));
vi.mock("../src/storage/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/storage/config")>();
  return { ...actual, loadConfig: mocks.load, storeConfig: mocks.store };
});
vi.mock("../src/proxy/controller", () => ({
  applyConfig: mocks.apply,
  controlLevel: vi.fn().mockResolvedValue("controlled_by_this_extension"),
}));
import { defaults } from "../src/storage/config";
let listener: (
  message: unknown,
  sender: chrome.runtime.MessageSender,
  reply: (result: ApiResult) => void,
) => boolean;
let current: Config;
let installed: (details: chrome.runtime.InstalledDetails) => void;
let alarmListener: (alarm: chrome.alarms.Alarm) => void;
let local: Record<string, unknown>;
beforeEach(async () => {
  vi.resetModules();
  mocks.load.mockReset();
  mocks.store.mockReset();
  mocks.apply.mockReset();
  current = defaults();
  local = {};
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("new.example")),
  );
  mocks.load.mockImplementation(async () => structuredClone(current));
  mocks.store.mockImplementation(async (c: Config) => {
    current = structuredClone(c);
  });
  mocks.apply.mockResolvedValue(undefined);
  const event = () => ({ addListener: vi.fn() });
  vi.stubGlobal("chrome", {
    runtime: {
      id: "test",
      getURL: (path: string) => "chrome-extension://test/" + path,
      onMessage: {
        addListener: (fn: typeof listener) => {
          listener = fn;
        },
      },
      onInstalled: {
        addListener: (fn: typeof installed) => {
          installed = fn;
        },
      },
      onStartup: event(),
    },
    alarms: {
      onAlarm: {
        addListener: (fn: typeof alarmListener) => {
          alarmListener = fn;
        },
      },
      get: vi.fn().mockResolvedValue(undefined),
      create: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn().mockResolvedValue(true),
    },
    permissions: {
      onRemoved: event(),
      contains: vi
        .fn()
        .mockImplementation(async (p: { origins?: string[] }) => !!p.origins),
    },
    proxy: { onProxyError: event(), settings: { onChange: event() } },
    action: {
      setBadgeText: vi.fn().mockResolvedValue(undefined),
      setBadgeBackgroundColor: vi.fn().mockResolvedValue(undefined),
    },
    storage: {
      local: {
        get: vi
          .fn()
          .mockImplementation(async (key: string) => ({ [key]: local[key] })),
        set: vi
          .fn()
          .mockImplementation(async (value: Record<string, unknown>) => {
            Object.assign(local, value);
          }),
      },
    },
  });
  await import("../src/background/index");
});
function send(config: Config): Promise<ApiResult> {
  return message({ type: "SAVE", config });
}
function message(command: Record<string, unknown>): Promise<ApiResult> {
  return new Promise((resolve) => {
    listener(
      command,
      { id: "test", url: "chrome-extension://test/options.html" },
      resolve,
    );
  });
}
describe("后台配置事务", () => {
  it("同时提交相同版本时只接受一次", async () => {
    const a = { ...current, theme: "dark" as const };
    const b = { ...current, theme: "light" as const };
    const [first, second] = await Promise.all([send(a), send(b)]);
    expect(first.config?.revision).toBe(1);
    expect(second.error).toContain("其他页面");
    expect(mocks.apply).toHaveBeenCalledTimes(1);
    expect(current.theme).toBe("dark");
  });
  it("代理应用失败时不保存配置", async () => {
    mocks.apply.mockRejectedValue(new Error("proxy failure"));
    const result = await send({ ...current, theme: "dark" });
    expect(result.error).toContain("proxy failure");
    expect(mocks.store).not.toHaveBeenCalled();
    expect(current.revision).toBe(0);
  });
  it("持久化失败时恢复先前代理配置", async () => {
    mocks.store.mockRejectedValue(new Error("storage failure"));
    const prior = structuredClone(current);
    const result = await send({ ...current, theme: "dark" });
    expect(result.error).toContain("storage failure");
    expect(mocks.apply).toHaveBeenCalledTimes(2);
    expect(mocks.apply.mock.calls[1][0]).toEqual(prior);
    expect(current).toEqual(prior);
  });
  it("拒绝来自非扩展页面的消息", () => {
    const reply = vi.fn();
    expect(
      listener(
        { type: "SAVE", config: current },
        { id: "test", url: "https://example.com" },
        reply,
      ),
    ).toBe(false);
    expect(mocks.apply).not.toHaveBeenCalled();
    expect(reply).not.toHaveBeenCalled();
  });
  it("配置已保存但徽标写入失败时返回已提交配置与状态警告", async () => {
    chrome.action.setBadgeText = vi
      .fn()
      .mockRejectedValue(new Error("badge failure"));
    const result = await send({ ...current, theme: "dark" });
    expect(result.error).toBeUndefined();
    expect(result.config?.revision).toBe(1);
    expect(result.status?.error).toContain("状态提示");
    expect(current.theme).toBe("dark");
  });
  it("持久化失败且旧代理恢复失败时明确报告部分状态风险", async () => {
    mocks.store.mockRejectedValue(new Error("storage failure"));
    mocks.apply
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("rollback failure"));
    const result = await send({ ...current, theme: "dark" });
    expect(result.error).toContain("旧配置恢复失败");
    expect(current.revision).toBe(0);
  });
  it("V0.1 升级到 V0.2 保留 version 1 配置、代理选择和规则", async () => {
    current = {
      ...defaults(),
      revision: 7,
      theme: "dark",
      mode: "smart",
      proxies: [
        {
          id: "saved-a",
          name: "Saved A",
          host: "127.0.0.1",
          port: 8123,
          protocol: "http",
        },
        {
          id: "saved-b",
          name: "Saved B",
          host: "proxy.example",
          port: 9443,
          protocol: "socks5",
        },
      ],
      selectedId: "saved-b",
      defaultId: "saved-a",
      rules: [
        {
          id: "existing",
          type: "MATCH",
          value: "",
          action: "PROXY",
          proxyId: "saved-a",
        },
      ],
    };
    const prior = structuredClone(current);
    installed({
      reason: "update" as chrome.runtime.OnInstalledReason,
      previousVersion: "0.1.0",
    });
    await vi.waitFor(() => expect(mocks.apply).toHaveBeenCalledWith(prior));
    expect(mocks.store).not.toHaveBeenCalled();
    expect(current).toEqual(prior);
  });
});

describe("后台订阅应用边界", () => {
  beforeEach(() => {
    current.subscriptions = [
      {
        id: "feed",
        name: "Feed",
        url: "https://rules.example/list.txt",
        format: "domains",
        intervalHours: 6,
        defaultTarget: "DIRECT",
        mappings: {},
      },
    ];
  });
  it("下载不改变代理或活动规则，确认应用才提交一次并清理候选", async () => {
    const prior = structuredClone(current);
    const result = await message({ type: "SUB_UPDATE", id: "feed" });
    const pending = result.updates?.feed.pending;
    expect(pending).toBeDefined();
    expect(current).toEqual(prior);
    expect(mocks.apply).not.toHaveBeenCalled();
    expect(mocks.store).not.toHaveBeenCalled();
    const applied = await message({
      type: "SUB_APPLY",
      id: "feed",
      token: pending!.token,
    });
    expect(applied.error).toBeUndefined();
    expect(current.rules).toEqual(pending!.report.rules);
    expect(current.revision).toBe(1);
    expect(mocks.apply).toHaveBeenCalledTimes(1);
    expect(applied.updates?.feed.pending).toBeUndefined();
    expect(
      (await message({ type: "SUB_APPLY", id: "feed", token: pending!.token }))
        .error,
    ).toBeDefined();
    expect(mocks.apply).toHaveBeenCalledTimes(1);
  });
  it("配置改变后后台拒绝过期候选和错误 token，不调用代理 API", async () => {
    const result = await message({ type: "SUB_UPDATE", id: "feed" });
    const token = result.updates!.feed.pending!.token;
    expect(
      (await message({ type: "SUB_APPLY", id: "feed", token: "wrong" })).error,
    ).toContain("候选");
    current.revision += 1;
    expect(
      (await message({ type: "SUB_APPLY", id: "feed", token })).error,
    ).toContain("变化");
    expect(mocks.apply).not.toHaveBeenCalled();
    expect(mocks.store).not.toHaveBeenCalled();
  });
  it("定时任务只下载候选，不保存或应用活动配置", async () => {
    alarmListener({
      name: "proxyflow-subscriptions",
      scheduledTime: Date.now(),
    });
    await vi.waitFor(() => expect(local.subscriptionStates).toBeDefined());
    const result = await message({ type: "GET" });
    expect(result.updates?.feed.pending?.report.rules[0].value).toBe(
      "new.example",
    );
    expect(current.revision).toBe(0);
    expect(mocks.apply).not.toHaveBeenCalled();
    expect(mocks.store).not.toHaveBeenCalled();
  });
});

describe("后台在线配置边界", () => {
  it("仅下载配置，不持久化原文或改变代理", async () => {
    const result = await message({
      type: "FETCH_CONFIG",
      url: "https://rules.example/list",
    });
    expect(result.download?.text).toBe("new.example");
    expect(mocks.apply).not.toHaveBeenCalled();
    expect(mocks.store).not.toHaveBeenCalled();
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });
  it("下载失败不改全局代理状态，下载挂起也不阻塞模式保存", async () => {
    let resolveFetch: (r: Response) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveFetch = resolve;
          }),
      ),
    );
    const pending = message({
      type: "FETCH_CONFIG",
      url: "https://rules.example/list",
    });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    expect((await send({ ...current, theme: "dark" })).config?.revision).toBe(
      1,
    );
    resolveFetch(new Response("bad", { status: 503 }));
    const failed = await pending;
    expect(failed.error).toContain("HTTP 503");
    expect((local.status as { error?: string }).error).toBeUndefined();
    expect(mocks.apply).toHaveBeenCalledTimes(1);
  });
});
