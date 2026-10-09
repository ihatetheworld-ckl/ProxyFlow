import { describe, it, expect, vi, beforeEach } from "vitest";
import vm from "node:vm";
import { defaults, loadConfig, storeConfig } from "../src/storage/config";
import { matches, route, inCidr } from "../src/rules/engine";
import { compilePac, directive } from "../src/proxy/pac";
import { applyConfig, proxyValue } from "../src/proxy/controller";
import { compileDnr, ruleRegex } from "../src/rules/dnr";
import { parseRules, exportRules } from "../src/parsers/native";
import { validateConfig, validHost } from "../src/utils/validate";
import { diagnose } from "../src/diagnostics/check";
import type { Config, Rule } from "../src/utils/types";
const config = (): Config => ({
  ...defaults(),
  mode: "smart",
  proxies: [
    { id: "a", name: "A", host: "127.0.0.1", port: 8123, protocol: "socks5" },
    {
      id: "b",
      name: "B",
      host: "proxy.example",
      port: 9443,
      protocol: "https",
    },
  ],
  selectedId: "a",
  defaultId: "b",
});
const r = (
  type: Rule["type"],
  value: string,
  action: Rule["action"] = "PROXY",
): Rule => ({ id: "r", type, value, action });
let settingsGet: ReturnType<typeof vi.fn>,
  settingsSet: ReturnType<typeof vi.fn>,
  update: ReturnType<typeof vi.fn>;
beforeEach(() => {
  settingsGet = vi
    .fn()
    .mockResolvedValue({ levelOfControl: "controlled_by_this_extension" });
  settingsSet = vi.fn().mockResolvedValue(undefined);
  update = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("chrome", {
    proxy: { settings: { get: settingsGet, set: settingsSet } },
    storage: {
      local: {
        get: vi.fn().mockResolvedValue({}),
        set: vi.fn().mockResolvedValue(undefined),
      },
    },
    permissions: { contains: vi.fn().mockResolvedValue(true) },
    declarativeNetRequest: {
      RuleActionType: { BLOCK: "block", ALLOW: "allow" },
      ResourceType: {
        MAIN_FRAME: "main_frame",
        SUB_FRAME: "sub_frame",
        SCRIPT: "script",
        OTHER: "other",
      },
      getDynamicRules: vi.fn().mockResolvedValue([]),
      updateDynamicRules: update,
      isRegexSupported: vi.fn().mockResolvedValue({ isSupported: true }),
    },
  });
});
describe("规则匹配与 PAC", () => {
  it("严格域名边界、大小写及 trailing dot", () => {
    expect(matches(r("DOMAIN", "example.com"), "EXAMPLE.COM.")).toBe(true);
    expect(matches(r("DOMAIN-SUFFIX", "example.com"), "badexample.com")).toBe(
      false,
    );
    expect(matches(r("DOMAIN-SUFFIX", "example.com"), "www.example.com")).toBe(
      true,
    );
    expect(matches(r("DOMAIN-KEYWORD", "exam"), "example.org")).toBe(true);
  });
  it("CIDR 仅匹配 IPv4 字面量，包含 /0 与 /32", () => {
    expect(inCidr("10.1.2.3", "10.0.0.0/8")).toBe(true);
    expect(inCidr("example.com", "0.0.0.0/0")).toBe(false);
    expect(inCidr("8.8.8.8", "0.0.0.0/0")).toBe(true);
    expect(inCidr("8.8.8.9", "8.8.8.8/32")).toBe(false);
    expect(inCidr("999.1.1.1", "0.0.0.0/0")).toBe(false);
  });
  it("首次匹配并支持不同出口、无规则时阻止", () => {
    const c = config();
    c.rules = [{ ...r("DOMAIN", "example.com"), proxyId: "b" }, r("MATCH", "")];
    expect(route(c, "example.com")).toBe("b");
    c.rules = [];
    expect(route(c, "else.com")).toBe("REJECT");
  });
  it("实际执行生成的 PAC 并对照引擎", () => {
    const c = config();
    c.rules = [
      r("DOMAIN", "exact.com", "DIRECT"),
      { ...r("DOMAIN-SUFFIX", "example.com"), proxyId: "b", id: "b" },
      { ...r("DOMAIN-KEYWORD", "key"), id: "k" },
      { ...r("IP-CIDR", "10.0.0.0/8", "DIRECT"), id: "ip" },
      { ...r("MATCH", "", "REJECT"), id: "last" },
    ];
    const context = vm.createContext({});
    vm.runInContext(compilePac(c), context);
    for (const host of [
      "exact.com",
      "EXACT.COM.",
      "x.example.com",
      "key.org",
      "10.2.3.4",
      "never.org",
    ]) {
      const exit = route(c, host);
      const expected = ["DIRECT", "REJECT"].includes(exit)
        ? exit === "DIRECT"
          ? "DIRECT"
          : "PROXY 127.0.0.1:9"
        : directive(c.proxies.find((p) => p.id === exit)!);
      expect(context.FindProxyForURL("https://" + host + "/", host)).toBe(
        expected,
      );
    }
  });
  it("未指定 DIRECT fallback", () => {
    const c = config();
    c.rules = [r("MATCH", "")];
    const ctx = vm.createContext({});
    vm.runInContext(compilePac(c), ctx);
    expect(ctx.FindProxyForURL("https://a.com/", "a.com")).toBe(
      "SOCKS5 127.0.0.1:8123",
    );
    expect(compilePac(c)).not.toContain("; DIRECT");
  });
  it.each(["http", "https", "socks4", "socks5"] as const)(
    "生成协议 %s",
    (protocol) => {
      expect(directive({ ...config().proxies[0], protocol })).toMatch(
        /^(PROXY|HTTPS|SOCKS|SOCKS5) 127/,
      );
    },
  );
});
describe("配置校验与导入", () => {
  it("默认仅直连，端口无客户端绑定", () => {
    validateConfig(defaults());
    validateConfig(config());
    expect(validHost("::1")).toBe(true);
    expect(validHost("127.0.0.999")).toBe(false);
    expect(validHost("example.com/path")).toBe(false);
  });
  it.each([0, 65536, 1.5, NaN])("拒绝无效端口 %s", (port) => {
    const c = config();
    c.proxies[0].port = port;
    expect(() => validateConfig(c)).toThrow();
  });
  it("拒绝注入地址、悬空代理、重复 id、不兼容类型", () => {
    for (const mutate of [
      (c: Config) => {
        c.proxies[0].host = "x; DIRECT";
      },
      (c: Config) => {
        c.rules[0].proxyId = "missing";
      },
      (c: Config) => {
        c.proxies[1].id = "a";
      },
      (c: Config) => {
        c.rules[0].type = "GEOIP" as Rule["type"];
      },
    ]) {
      const c = config();
      mutate(c);
      expect(() => validateConfig(c)).toThrow();
    }
  });
  it("拒绝无法精确转换的 REJECT / CIDR 混合", () => {
    const c = config();
    c.rules = [
      r("IP-CIDR", "10.0.0.0/8"),
      { ...r("MATCH", "", "REJECT"), id: "2" },
    ];
    expect(() => validateConfig(c)).toThrow(/混合/);
  });
  it("文本往返指定出口与拒绝规则", () => {
    const rules = [
      { ...r("DOMAIN", "example.com"), proxyId: "b" },
      { ...r("MATCH", "", "REJECT"), id: "2" },
    ];
    const report = parseRules(exportRules(rules));
    expect(report.unsupported).toEqual([]);
    expect(report.errors).toEqual([]);
    expect(report.rules.map(({ id: _id, ...rest }) => rest)).toEqual(
      rules.map(({ id: _id, ...rest }) => rest),
    );
  });
  it("不兼容字段与错误行明确报告", () => {
    const report = parseRules(
      "GEOIP,CN,DIRECT\nDOMAIN,a.com,SomeGroup\nDOMAIN,a.com\nMATCH,PROXY",
    );
    expect(report.unsupported).toHaveLength(2);
    expect(report.errors).toHaveLength(1);
    expect(report.rules).toHaveLength(1);
  });
  it("拒绝超大导入", () =>
    expect(() => parseRules("x".repeat(256 * 1024 + 1))).toThrow());
});
describe("Chrome 控制与 DNR", () => {
  it("三种模式生成官方配置", () => {
    const c = config();
    expect(proxyValue(c)).toMatchObject({
      mode: "pac_script",
      pacScript: { mandatory: true },
    });
    c.mode = "global";
    expect(proxyValue(c)).toMatchObject({
      mode: "fixed_servers",
      rules: { singleProxy: { scheme: "socks5", port: 8123 } },
    });
    c.mode = "direct";
    expect(proxyValue(c)).toEqual({ mode: "direct" });
  });
  it("权限冲突时不修改代理", async () => {
    settingsGet.mockResolvedValue({
      levelOfControl: "controlled_by_other_extensions",
    });
    await expect(applyConfig(config())).rejects.toThrow(/冲突/);
    expect(settingsSet).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
  it("代理失败恢复旧 DNR，绝不设直连", async () => {
    settingsSet.mockRejectedValue(new Error("proxy failed"));
    await expect(applyConfig(config())).rejects.toThrow();
    expect(update).toHaveBeenCalledTimes(2);
    expect(settingsSet.mock.calls[0][0].value.mode).toBe("pac_script");
  });
  it("REJECT 与更高优先级 allow 保持顺序并覆盖主框架", () => {
    const c = config();
    c.rules = [
      r("DOMAIN", "safe.example", "DIRECT"),
      { ...r("DOMAIN-SUFFIX", "example", "REJECT"), id: "2" },
    ];
    const dnr = compileDnr(c);
    expect(dnr.map((r) => r.action.type)).toEqual(["allow", "block"]);
    expect(dnr[0].priority).toBeGreaterThan(dnr[1].priority!);
    expect(dnr[0].condition.resourceTypes).toContain("main_frame");
    expect(
      new RegExp(dnr[1].condition.regexFilter!).test("https://x.example/"),
    ).toBe(true);
    c.mode = "global";
    expect(compileDnr(c)).toEqual([]);
  });
  it("关键词不错误匹配端口或路径", () => {
    const regex = new RegExp(ruleRegex(r("DOMAIN-KEYWORD", "123")));
    expect(regex.test("https://example.com:123/")).toBe(false);
    expect(regex.test("https://example.com/123")).toBe(false);
    expect(regex.test("https://123.example/")).toBe(true);
  });
  it("Chrome 不支持的 regex 在写入前拒绝", async () => {
    chrome.declarativeNetRequest.isRegexSupported = vi
      .fn()
      .mockResolvedValue({ isSupported: false, reason: "syntaxError" });
    const c = config();
    c.rules = [r("DOMAIN", "a.com", "REJECT")];
    await expect(applyConfig(c)).rejects.toThrow(/正则/);
    expect(update).not.toHaveBeenCalled();
  });
  it("存储默认与保存", async () => {
    expect(await loadConfig()).toEqual(defaults());
    await storeConfig(config());
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ config: config() });
  });
});
describe("诊断边界", () => {
  it("识别控制权冲突", async () => {
    settingsGet.mockResolvedValue({ levelOfControl: "not_controllable" });
    expect(await diagnose(config(), "https://example.com/")).toContain(
      "权限冲突",
    );
  });
  it("不会误报端口可达为代理成功", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );
    expect(await diagnose(config(), "https://example.com/")).toContain(
      "无法可靠区分",
    );
  });
  it("直连测试明确标记并报告 HTTP 错误", async () => {
    const c = config();
    c.mode = "direct";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ status: 503, ok: false }),
    );
    const result = await diagnose(c, "https://example.com/");
    expect(result).toContain("直连");
    expect(result).toContain("503");
  });
  it("拒绝、未授权、凭据与非 HTTP URL", async () => {
    const c = config();
    c.rules = [r("MATCH", "", "REJECT")];
    expect(await diagnose(c, "https://example.com/")).toContain("规则拒绝");
    await expect(diagnose(c, "file:///a")).rejects.toThrow();
    await expect(
      diagnose(c, "https://user:pass@example.com/"),
    ).rejects.toThrow();
    chrome.permissions.contains = vi.fn().mockResolvedValue(false);
    expect(await diagnose(config(), "https://example.com/")).toContain(
      "未授予",
    );
  });
});
