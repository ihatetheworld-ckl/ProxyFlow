import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaults } from "../../src/storage/config";
import type { Config } from "../../src/utils/types";
import { applyConfig, proxyValue } from "../../src/proxy/controller";
import { prepareWebRtc, webRtcState } from "../../src/security/webRtc";
import { compileDnr } from "../../src/rules/dnr";
import { compileAds, isAdBlocked } from "../../src/blocking/compiler";
import { runDiagnostics, dnrMatches } from "../../src/diagnostics/report";
import { validateConfig } from "../../src/utils/validate";
const config = (): Config => ({
  ...defaults(),
  mode: "global",
  proxies: [
    { id: "a", name: "A", host: "127.0.0.1", port: 8123, protocol: "http" },
  ],
  selectedId: "a",
  defaultId: "a",
});
let c: Config;
let privacyPermission: boolean;
let hostPermission: boolean;
let policy: string;
let policyLevel: string;
let data: Record<string, unknown>;
let fetcher: ReturnType<typeof vi.fn>;
beforeEach(() => {
  c = config();
  privacyPermission = false;
  hostPermission = true;
  policy = "default";
  policyLevel = "controllable_by_this_extension";
  data = {};
  fetcher = vi.fn().mockImplementation(async () => new Response("fixture"));
  vi.stubGlobal("fetch", fetcher);
  vi.stubGlobal("chrome", {
    permissions: {
      contains: vi
        .fn()
        .mockImplementation(async (p: { permissions?: string[] }) =>
          p.permissions ? privacyPermission : hostPermission,
        ),
    },
    storage: {
      local: {
        get: vi
          .fn()
          .mockImplementation(async (key: string) => ({ [key]: data[key] })),
      },
    },
    privacy: {
      network: {
        webRTCIPHandlingPolicy: {
          get: vi.fn().mockImplementation(async () => ({
            value: policy,
            levelOfControl: policyLevel,
          })),
          set: vi.fn().mockImplementation(async (args: { value: string }) => {
            policy = args.value;
            policyLevel = "controlled_by_this_extension";
          }),
          clear: vi.fn().mockImplementation(async () => {
            policy = "default";
            policyLevel = "controllable_by_this_extension";
          }),
        },
      },
    },
    proxy: {
      settings: {
        get: vi.fn().mockImplementation(async () => ({
          levelOfControl: "controlled_by_this_extension",
          value: proxyValue(c),
        })),
        set: vi.fn().mockResolvedValue(undefined),
      },
    },
    declarativeNetRequest: {
      RuleActionType: { BLOCK: "block", ALLOW: "allow" },
      ResourceType: {
        MAIN_FRAME: "main_frame",
        SCRIPT: "script",
        OTHER: "other",
      },
      getDynamicRules: vi.fn().mockImplementation(async () => compileDnr(c)),
      updateDynamicRules: vi.fn().mockResolvedValue(undefined),
      isRegexSupported: vi.fn().mockResolvedValue({ isSupported: true }),
    },
  });
});
describe("广告域名拦截", () => {
  it.each(["direct", "global", "smart"] as const)(
    "在 %s 模式下都可开启，默认不开启",
    (mode) => {
      c.mode = mode;
      expect(compileAds(c)).toEqual([]);
      c.blocking!.enabled = true;
      const rules = compileDnr(c);
      expect(rules).toHaveLength(3);
      expect(
        rules.every((r) => r.id >= 10000 && r.action.type === "block"),
      ).toBe(true);
      expect(rules[0].condition.resourceTypes).toContain("main_frame");
      expect(isAdBlocked(c, "x.doubleclick.net")).toBe(true);
      expect(isAdBlocked(c, "baddoubleclick.net")).toBe(false);
      expect(
        new RegExp(rules[0].condition.regexFilter!).test(
          "https://x.doubleclick.net/",
        ),
      ).toBe(true);
      expect(
        new RegExp(rules[0].condition.regexFilter!).test(
          "https://safe.example/doubleclick.net",
        ),
      ).toBe(false);
    },
  );
  it("广告优先级高于路由 allow，ID 不碰撞", () => {
    c.mode = "smart";
    c.blocking!.enabled = true;
    c.rules = [
      {
        id: "allow",
        type: "DOMAIN-SUFFIX",
        value: "doubleclick.net",
        action: "DIRECT",
      },
      { id: "last", type: "MATCH", value: "", action: "REJECT" },
    ];
    const rules = compileDnr(c);
    expect(new Set(rules.map((r) => r.id)).size).toBe(rules.length);
    expect(rules.find((r) => r.id === 10000)!.priority).toBeGreaterThan(
      rules.find((r) => r.id === 1)!.priority!,
    );
  });
  it("不接受 URL、IP、重复域名或 Adblock 语法", () => {
    for (const domains of [
      ["https://ads.example"],
      ["127.0.0.1"],
      ["a.com", "a.com"],
      ["||a.com^"],
    ]) {
      c.blocking = { enabled: true, domains };
      expect(() => validateConfig(c)).toThrow();
    }
  });
});
describe("WebRTC 控制与配置恢复", () => {
  it("没有 privacy 权限时不影响默认模式，但拒绝启用策略", async () => {
    expect(await webRtcState()).toEqual({ permission: false });
    const plan = await prepareWebRtc(c);
    await plan.apply();
    expect(
      chrome.privacy.network.webRTCIPHandlingPolicy.set,
    ).not.toHaveBeenCalled();
    c.webRtc = "restrict";
    await expect(applyConfig(c)).rejects.toThrow(/privacy/);
    expect(
      chrome.declarativeNetRequest.updateDynamicRules,
    ).not.toHaveBeenCalled();
  });
  it("权限读取失败也可返回明确状态", async () => {
    chrome.permissions.contains = vi
      .fn()
      .mockRejectedValue(new Error("permission API"));
    expect((await webRtcState()).error).toContain("privacy");
  });
  it("用户开启后设定 regular 策略，关闭只清自己的覆盖", async () => {
    privacyPermission = true;
    c.webRtc = "restrict";
    await applyConfig(c);
    expect(policy).toBe("disable_non_proxied_udp");
    expect(
      chrome.privacy.network.webRTCIPHandlingPolicy.set,
    ).toHaveBeenCalledWith({
      value: "disable_non_proxied_udp",
      scope: "regular",
    });
    c.webRtc = "browser";
    await applyConfig(c);
    expect(
      chrome.privacy.network.webRTCIPHandlingPolicy.clear,
    ).toHaveBeenCalledWith({ scope: "regular" });
  });
  it("不修改其他扩展控制的策略，启用冲突在写入前失败", async () => {
    privacyPermission = true;
    policyLevel = "controlled_by_other_extensions";
    await (await prepareWebRtc(c)).apply();
    expect(
      chrome.privacy.network.webRTCIPHandlingPolicy.clear,
    ).not.toHaveBeenCalled();
    c.webRtc = "restrict";
    await expect(applyConfig(c)).rejects.toThrow(/冲突/);
    expect(
      chrome.declarativeNetRequest.updateDynamicRules,
    ).not.toHaveBeenCalled();
  });
  it("代理写入失败时恢复旧 DNR 和已有 WebRTC 值", async () => {
    privacyPermission = true;
    policyLevel = "controlled_by_this_extension";
    policy = "default_public_interface_only";
    c.webRtc = "restrict";
    chrome.proxy.settings.set = vi
      .fn()
      .mockRejectedValue(new Error("proxy failure"));
    await expect(applyConfig(c)).rejects.toThrow(/proxy failure/);
    expect(policy).toBe("default_public_interface_only");
    expect(
      chrome.declarativeNetRequest.updateDynamicRules,
    ).toHaveBeenCalledTimes(2);
  });
  it("恢复过程中某项失败也继续尝试其他恢复，并明确报告", async () => {
    privacyPermission = true;
    c.webRtc = "restrict";
    chrome.proxy.settings.set = vi
      .fn()
      .mockRejectedValue(new Error("proxy failure"));
    chrome.privacy.network.webRTCIPHandlingPolicy.clear = vi
      .fn()
      .mockRejectedValue(new Error("clear failure"));
    await expect(applyConfig(c)).rejects.toThrow(/部分恢复/);
    expect(
      chrome.declarativeNetRequest.updateDynamicRules,
    ).toHaveBeenCalledTimes(2);
  });
});
describe("实际状态诊断", () => {
  it("代理控制权冲突时不请求测试网站", async () => {
    chrome.proxy.settings.get = vi.fn().mockResolvedValue({
      levelOfControl: "controlled_by_other_extensions",
      value: proxyValue(c),
    });
    expect((await runDiagnostics(c, "https://example.com/")).code).toBe(
      "CONTROL_CONFLICT",
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("实际代理配置漂移、实际 DNR 条件漂移分别阻止测试", async () => {
    chrome.proxy.settings.get = vi.fn().mockResolvedValue({
      levelOfControl: "controlled_by_this_extension",
      value: { mode: "direct" },
    });
    expect((await runDiagnostics(c, "https://example.com/")).code).toBe(
      "CONFIG_DRIFT",
    );
    chrome.proxy.settings.get = vi.fn().mockResolvedValue({
      levelOfControl: "controlled_by_this_extension",
      value: proxyValue(c),
    });
    c.blocking!.enabled = true;
    const actual = compileDnr(c);
    actual[0].condition.excludedRequestDomains = ["doubleclick.net"];
    expect(dnrMatches(compileDnr(c), actual)).toBe(false);
    chrome.declarativeNetRequest.getDynamicRules = vi
      .fn()
      .mockResolvedValue(actual);
    expect((await runDiagnostics(c, "https://example.com/")).code).toBe(
      "CONFIG_DRIFT",
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("期望的 WebRTC 策略没生效时明确报告，避免冒充保护已开启", async () => {
    c.webRtc = "restrict";
    expect((await runDiagnostics(c, "https://example.com/")).code).toBe(
      "SECURITY_DRIFT",
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("额外直连绕过项或备用出口均报告配置漂移，不发起测试请求", async () => {
    for (const rules of [
      { ...proxyValue(c).rules, bypassList: ["<-loopback>", "*.example.com"] },
      {
        ...proxyValue(c).rules,
        fallbackProxy: { scheme: "http", host: "other.example", port: 8080 },
      },
    ]) {
      chrome.proxy.settings.get = vi.fn().mockResolvedValue({
        levelOfControl: "controlled_by_this_extension",
        value: { mode: "fixed_servers", rules },
      });
      expect((await runDiagnostics(c, "https://example.com/")).code).toBe(
        "CONFIG_DRIFT",
      );
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("广告与 REJECT 阻止、缺少站点权限有不同诊断", async () => {
    c.blocking!.enabled = true;
    expect((await runDiagnostics(c, "https://doubleclick.net/")).code).toBe(
      "AD_BLOCKED",
    );
    c.blocking!.enabled = false;
    c.mode = "smart";
    c.rules = [{ id: "last", type: "MATCH", value: "", action: "REJECT" }];
    expect((await runDiagnostics(c, "https://example.com/")).code).toBe(
      "RULE_REJECTED",
    );
    c.mode = "global";
    hostPermission = false;
    expect((await runDiagnostics(c, "https://example.com/")).code).toBe(
      "HOST_PERMISSION",
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("HTTP 成功、目标 HTTP 错误与网络错误互相区分，包含安全边界", async () => {
    expect((await runDiagnostics(c, "https://example.com/")).code).toBe(
      "HTTP_OK",
    );
    fetcher.mockImplementation(async () => new Response("x", { status: 503 }));
    let report = await runDiagnostics(c, "https://example.com/");
    expect(report.code).toBe("HTTP_ERROR");
    expect(report.httpStatus).toBe(503);
    fetcher.mockRejectedValue(new TypeError("Failed to fetch private-url"));
    report = await runDiagnostics(c, "https://example.com/");
    expect(report.code).toBe("NETWORK_ERROR");
    expect(report.summary).not.toContain("private-url");
    expect(report.checks.some((c) => c.name.includes("DNS"))).toBe(true);
  });
  it("超时与新代理错误事件可单独标注，旧事件不当作本次原因", async () => {
    fetcher.mockRejectedValue(
      Object.assign(new Error("timeout"), { name: "TimeoutError" }),
    );
    expect((await runDiagnostics(c, "https://example.com/")).code).toBe(
      "TIMEOUT",
    );
    fetcher.mockImplementation(async () => {
      data.proxyError = { code: "ERR_PROXY_CONNECTION_FAILED", at: Date.now() };
      throw new TypeError("Failed");
    });
    expect((await runDiagnostics(c, "https://example.com/")).code).toBe(
      "PROXY_ERROR_OBSERVED",
    );
    data.proxyError = {
      code: "ERR_PROXY_CONNECTION_FAILED",
      at: Date.now() - 60000,
    };
    fetcher.mockRejectedValue(new TypeError("Failed"));
    expect((await runDiagnostics(c, "https://example.com/")).code).toBe(
      "NETWORK_ERROR",
    );
  });
  it("无效地址不发起网络请求", async () => {
    expect((await runDiagnostics(c, "file:///a")).code).toBe("INVALID_URL");
    expect((await runDiagnostics(c, "https://u:p@example.com/")).code).toBe(
      "INVALID_URL",
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
});
