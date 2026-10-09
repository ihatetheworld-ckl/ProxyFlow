import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Config, SubscriptionState } from "../../src/utils/types";
import { defaults, loadConfig } from "../../src/storage/config";
import { validateConfig } from "../../src/utils/validate";
import { subscriptionUrl } from "../../src/subscriptions/url";
import { limitedFetch } from "../../src/network/limitedFetch";
import {
  stageUpdate,
  candidateConfig,
  discard,
  scheduledUpdates,
  syncSchedule,
  ALARM,
  fingerprint,
} from "../../src/subscriptions/service";
const config = (): Config => ({
  ...defaults(),
  proxies: [
    { id: "a", name: "A", host: "127.0.0.1", port: 8123, protocol: "http" },
  ],
  selectedId: "a",
  defaultId: "a",
  mode: "smart",
  subscriptions: [
    {
      id: "sub",
      name: "Rules",
      url: "https://rules.example/list?token=secret-query",
      format: "native",
      intervalHours: 0,
      defaultTarget: "PROXY",
      mappings: {},
    },
  ],
});
let data: Record<string, unknown>;
let fetcher: ReturnType<typeof vi.fn>;
beforeEach(() => {
  data = {};
  fetcher = vi
    .fn()
    .mockImplementation(
      async () => new Response("DOMAIN,example.com,DIRECT\nMATCH,PROXY"),
    );
  vi.stubGlobal("fetch", fetcher);
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: vi.fn().mockImplementation(async (key: string) => ({
          [key]: structuredClone(data[key]),
        })),
        set: vi.fn().mockImplementation(async (value: object) => {
          Object.assign(data, structuredClone(value));
        }),
      },
    },
    permissions: { contains: vi.fn().mockResolvedValue(true) },
    alarms: {
      get: vi.fn().mockResolvedValue(undefined),
      create: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn().mockResolvedValue(true),
    },
  });
});
describe("订阅地址和配置校验", () => {
  it.each([
    "http://rules.example/list",
    "https://u:p@rules.example/list",
    "https://rules.example/list#fragment",
    "https://127.0.0.1/list",
    "https://10.1.2.3/list",
    "https://192.168.1.1/list",
    "https://100.64.1.1/list",
    "https://[::1]/list",
    "https://api.local/list",
    "https://localhost/list",
  ])("拒绝不合适的订阅地址 %s", (url) =>
    expect(() => subscriptionUrl(url)).toThrow(),
  );
  it("允许 HTTPS 域名和公开 IPv4，限制伪造订阅 ID 与悬空出口", () => {
    expect(subscriptionUrl("https://rules.example:8443/list").hostname).toBe(
      "rules.example",
    );
    expect(subscriptionUrl("https://8.8.8.8/list").protocol).toBe("https:");
    const c = config();
    validateConfig(c);
    c.subscriptions![0].id = "__proto__";
    expect(() => validateConfig(c)).toThrow();
    c.subscriptions![0].id = "sub";
    c.subscriptions![0].mappings = { Home: "PROXY:missing" };
    expect(() => validateConfig(c)).toThrow();
  });
  it("旧 schema 1 设置只补新默认值，保留旧路由", async () => {
    const c = config();
    delete c.subscriptions;
    delete c.blocking;
    delete c.webRtc;
    data.config = c;
    const loaded = await loadConfig();
    expect(loaded.rules).toEqual(c.rules);
    expect(loaded.selectedId).toBe("a");
    expect(loaded.webRtc).toBe("browser");
    expect(loaded.blocking?.enabled).toBe(false);
    expect(loaded.subscriptions).toEqual([]);
  });
});
describe("有限响应下载", () => {
  it("不带 cookies、不跟随重定向、无 referrer，流式响应成功", async () => {
    expect(
      await limitedFetch("https://rules.example/list", 256 * 1024),
    ).toContain("MATCH");
    expect(fetcher.mock.calls[0][1]).toMatchObject({
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer",
      cache: "no-store",
    });
  });
  it("Content-Length 超限在正文读取前拒绝", async () => {
    fetcher.mockResolvedValue(
      new Response("x", { headers: { "Content-Length": "300000" } }),
    );
    await expect(
      limitedFetch("https://rules.example/list", 256 * 1024),
    ).rejects.toThrow(/256/);
  });
  it("缺失 Content-Length 仍按实际流字节限制并取消读取", async () => {
    const cancel = vi.fn();
    fetcher.mockResolvedValue(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array(20));
          },
          cancel,
        }),
      ),
    );
    await expect(
      limitedFetch("https://rules.example/list", 10),
    ).rejects.toThrow();
    expect(cancel).toHaveBeenCalled();
  });
  it("HTTP 错误、HTML、非 UTF8 拒绝", async () => {
    for (const response of [
      new Response("x", { status: 403 }),
      new Response("<html>", { headers: { "Content-Type": "text/html" } }),
      new Response(new Uint8Array([255])),
    ]) {
      fetcher.mockResolvedValue(response);
      await expect(
        limitedFetch("https://rules.example/list", 256 * 1024),
      ).rejects.toThrow();
    }
  });
  it("网络错误不回显 URL 查询凭据", async () => {
    fetcher.mockRejectedValue(new Error("token=private-secret"));
    await expect(
      limitedFetch("https://rules.example/list", 256 * 1024),
    ).rejects.toThrow("订阅请求失败");
  });
});
describe("候选更新生命周期", () => {
  it("下载仅生成候选，不改变活动规则；选择后返回候选配置", async () => {
    const c = config();
    const prior = structuredClone(c);
    const states = await stageUpdate(c, "sub");
    const pending = states.sub.pending!;
    expect(pending.report.rules).toHaveLength(2);
    expect(c).toEqual(prior);
    expect(JSON.stringify(states)).not.toContain("secret-query");
    const next = await candidateConfig(c, "sub", pending.token, false);
    expect(next.rules[0].value).toBe("example.com");
    expect(next.proxies).toEqual(c.proxies);
    expect(next.mode).toBe("smart");
    await discard("sub");
    expect(
      (data.subscriptionStates as Record<string, SubscriptionState>).sub
        .pending,
    ).toBeUndefined();
  });
  it("权限撤销时不发网络请求，记录具体失败", async () => {
    chrome.permissions.contains = vi.fn().mockResolvedValue(false);
    const all = await stageUpdate(config(), "sub");
    expect(all.sub.error).toContain("权限");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("网络更新失败保留之前候选和成功时间", async () => {
    const c = config();
    const first = (await stageUpdate(c, "sub")).sub;
    fetcher.mockRejectedValue(new Error("token=private"));
    const after = (await stageUpdate(c, "sub")).sub;
    expect(after.pending?.token).toBe(first.pending?.token);
    expect(after.lastSuccessAt).toBe(first.lastSuccessAt);
    expect(after.error).toContain("订阅请求失败");
    expect(after.error).not.toContain("private");
  });
  it("错误转换保留旧候选，保存失败报告供映射修复", async () => {
    const c = config();
    const first = (await stageUpdate(c, "sub")).sub.pending;
    fetcher.mockImplementation(async () => new Response("MATCH,UnmappedHome"));
    const all = await stageUpdate(c, "sub");
    expect(all.sub.pending?.token).toBe(first?.token);
    expect(all.sub.failureReport?.targets).toContain("UnmappedHome");
    expect(all.sub.error).toContain("转换");
  });
  it("修改配置版本、订阅内容或候选 token 后不能应用旧候选", async () => {
    const c = config();
    const pending = (await stageUpdate(c, "sub")).sub.pending!;
    await expect(
      candidateConfig({ ...c, revision: 1 }, "sub", pending.token, false),
    ).rejects.toThrow(/变化/);
    const changed = structuredClone(c);
    changed.subscriptions![0].url = "https://other.example/list";
    await expect(
      candidateConfig(changed, "sub", pending.token, false),
    ).rejects.toThrow(/变化/);
    await expect(
      candidateConfig(c, "sub", "wrong-token", false),
    ).rejects.toThrow(/候选/);
  });
  it("不兼容部分需要主动确认后才可应用", async () => {
    fetcher.mockImplementation(
      async () => new Response("GEOIP,CN,DIRECT\nMATCH,PROXY"),
    );
    const c = config();
    const pending = (await stageUpdate(c, "sub")).sub.pending!;
    await expect(
      candidateConfig(c, "sub", pending.token, false),
    ).rejects.toThrow(/确认/);
    expect(
      (await candidateConfig(c, "sub", pending.token, true)).rules,
    ).toHaveLength(1);
  });
  it("候选指纹忽略 JSON 对象属性次序", async () => {
    const sub = config().subscriptions![0];
    const reverse = Object.fromEntries(
      Object.entries(sub).reverse(),
    ) as typeof sub;
    expect(await fingerprint(sub)).toBe(await fingerprint(reverse));
  });
  it("候选缓存总量超限时不覆盖之前缓存", async () => {
    data.subscriptionStates = { old: { error: "x".repeat(1024 * 1024 - 400) } };
    const all = await stageUpdate(config(), "sub");
    expect(all.sub.pending).toBeUndefined();
    expect(all.sub.error).toContain("缓存");
    expect(
      new TextEncoder().encode(JSON.stringify(all)).length,
    ).toBeLessThanOrEqual(1024 * 1024);
  });
});
describe("订阅调度", () => {
  it("只有启用周期时建立 alarm；清理已删除订阅缓存", async () => {
    const c = config();
    data.subscriptionStates = { deleted: { error: "old" } };
    await syncSchedule(c);
    expect(chrome.alarms.clear).toHaveBeenCalledWith(ALARM);
    expect(data.subscriptionStates).toEqual({});
    c.subscriptions![0].intervalHours = 6;
    await syncSchedule(c);
    expect(chrome.alarms.create).toHaveBeenCalledWith(ALARM, {
      periodInMinutes: 15,
      delayInMinutes: 15,
    });
  });
  it("单次调度最多处理三个到期订阅，不处理手动或尚未到期者", async () => {
    const c = config();
    const sub = c.subscriptions![0];
    c.subscriptions = Array.from({ length: 4 }, (_, i) => ({
      ...sub,
      id: "s" + i,
      intervalHours: 6,
    }));
    c.subscriptions.push({ ...sub, id: "manual", intervalHours: 0 });
    chrome.permissions.contains = vi.fn().mockResolvedValue(false);
    await scheduledUpdates(c);
    let states = data.subscriptionStates as Record<string, SubscriptionState>;
    expect(Object.keys(states)).toHaveLength(3);
    expect(states.manual).toBeUndefined();
    await scheduledUpdates(c);
    states = data.subscriptionStates as Record<string, SubscriptionState>;
    expect(Object.keys(states)).toHaveLength(4);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
