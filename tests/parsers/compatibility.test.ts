import { describe, it, expect, vi } from "vitest";
import vm from "node:vm";
import { convertConfig, detectFormat, canApplyReport } from "../../src/parsers";
import { defaults } from "../../src/storage/config";
import { compilePac } from "../../src/proxy/pac";
import type { Config } from "../../src/utils/types";
const config = (): Config => ({
  ...defaults(),
  mode: "smart",
  proxies: [
    {
      id: "a",
      name: "Local A",
      host: "127.0.0.1",
      port: 8123,
      protocol: "http",
    },
    {
      id: "b",
      name: "Remote B",
      host: "proxy.example",
      port: 9443,
      protocol: "socks5",
    },
  ],
  selectedId: "a",
  defaultId: "a",
});
const convert = (
  text: string,
  format: "clash" | "shadowrocket" | "xray" | "native" | "domains" = "clash",
) => convertConfig(text, config(), { format });
const codes = (report: ReturnType<typeof convert>) =>
  report.issues.map((i) => i.code);
const xray = (rules: unknown[], rest: object = {}) =>
  JSON.stringify({ routing: { domainStrategy: "AsIs", rules }, ...rest });
const runPac = (c: Config, host: string) => {
  const ctx = vm.createContext({});
  vm.runInContext(compilePac(c), ctx);
  return ctx.FindProxyForURL("https://" + host + "/", host);
};
describe("格式识别与原生规则", () => {
  it.each([
    ["[General]\n[Rule]\nFINAL,PROXY", "shadowrocket"],
    ["rules: []", "clash"],
    ['{"routing":{"rules":[]}}', "xray"],
    ["DOMAIN,a.com,DIRECT", "native"],
    ["# example\na.com", "domains"],
  ])("识别 %s", (source, format) => expect(detectFormat(source)).toBe(format));
  it("BOM、空行和注释处理", () => {
    const r = convert(
      "\uFEFF# comment\n\nDOMAIN,a.com,DIRECT\nMATCH,PROXY",
      "native",
    );
    expect(r.rules.map((r) => r.type)).toEqual(["DOMAIN", "MATCH"]);
    expect(canApplyReport(r)).toBe(true);
  });
  it("缺少默认规则不补入直连，PAC 未匹配拒绝", () => {
    const r = convert("example.com\nexample.org", "domains");
    expect(codes(r)).toContain("no-match");
    expect(r.rules.every((r) => r.type === "DOMAIN-SUFFIX")).toBe(true);
    expect(runPac({ ...config(), rules: r.rules }, "other.net")).toBe(
      "PROXY 127.0.0.1:9",
    );
  });
  it("不执行 PAC 或误转 GFWList", () => {
    const r = convert(
      '||example.com^\n@@||safe.com^\nfunction FindProxyForURL(url,host){return "DIRECT";}',
      "domains",
    );
    expect(r.rules).toEqual([]);
    expect(canApplyReport(r, true)).toBe(false);
  });
});
describe("Shadowrocket CONF", () => {
  it("提取 Rule、有序转换 FINAL、保留源行位置，忽略客户端设置", () => {
    const r = convert(
      "[General]\ndns-server = 1.1.1.1\n[Proxy]\nSecretNode = vless, private.example, 443, password=supersecret\n[Rule]\nDOMAIN,exact.com,DIRECT\nDOMAIN-SUFFIX,example.org,PROXY\nFINAL,PROXY",
      "shadowrocket",
    );
    expect(r.rules.map((r) => r.type)).toEqual([
      "DOMAIN",
      "DOMAIN-SUFFIX",
      "MATCH",
    ]);
    expect(r.sourcePaths).toEqual(["line:6", "line:7", "line:8"]);
    expect(JSON.stringify(r)).not.toContain("supersecret");
    expect(codes(r)).toContain("ignored-field");
    expect(canApplyReport(r)).toBe(true);
  });
  it("支持手动映射未知出口，不运行策略组", () => {
    const text = "[Rule]\nDOMAIN,a.com,HomeGroup\nFINAL,DIRECT";
    const first = convert(text, "shadowrocket");
    expect(first.targets).toContain("HomeGroup");
    expect(canApplyReport(first)).toBe(false);
    const mapped = convertConfig(text, config(), {
      format: "shadowrocket",
      mappings: { HomeGroup: "PROXY:b" },
    });
    expect(mapped.rules[0].proxyId).toBe("b");
    expect(canApplyReport(mapped)).toBe(true);
  });
  it("规则集只通过匹配的本地附件展开", () => {
    const text =
      "[Rule]\nRULE-SET,https://rules.example/list,PROXY\nFINAL,DIRECT";
    expect(codes(convert(text, "shadowrocket"))).toContain("remote-ruleset");
    const r = convertConfig(text, config(), {
      format: "shadowrocket",
      attachments: [
        {
          name: "https://rules.example/list",
          text: "DOMAIN,a.com\nDOMAIN-SUFFIX,b.com",
        },
      ],
    });
    expect(r.rules.map((r) => r.type)).toEqual([
      "DOMAIN",
      "DOMAIN-SUFFIX",
      "MATCH",
    ]);
    expect(canApplyReport(r)).toBe(true);
  });
  it("不兼容规则与高级字段明确报告；部分应用需确认", () => {
    const r = convert(
      "[URL Rewrite]\nhttps://private.example secret\n[Rule]\nURL-REGEX,^https://,PROXY\nFINAL,DIRECT",
      "shadowrocket",
    );
    expect(codes(r)).toContain("rule-type");
    expect(r.rules).toHaveLength(1);
    expect(canApplyReport(r)).toBe(false);
    expect(canApplyReport(r, true)).toBe(true);
    expect(JSON.stringify(r)).not.toContain("private.example");
  });
  it("附加复杂规则选项不静默删掉", () => {
    const r = convert(
      "[Rule]\nDOMAIN,a.com,DIRECT,extended-matching\nFINAL,PROXY",
      "shadowrocket",
    );
    expect(codes(r)).toContain("rule-options");
    expect(r.rules).toHaveLength(1);
  });
});
describe("Clash / Mihomo YAML", () => {
  it("有序规则、组出口映射、元数据报告不包含节点凭据", () => {
    const text =
      "proxies:\n  - name: NodeA\n    type: vless\n    server: private.example\n    uuid: secret-uuid\nproxy-groups:\n  - name: Home\n    type: url-test\n    proxies: [NodeA]\nrules:\n  - DOMAIN,exact.com,DIRECT\n  - DOMAIN-SUFFIX,example.org,Home\n  - MATCH,Home";
    const r = convertConfig(text, config(), {
      format: "clash",
      mappings: { Home: "PROXY:b" },
    });
    expect(r.rules.map((r) => r.proxyId ?? r.action)).toEqual([
      "DIRECT",
      "b",
      "b",
    ]);
    expect(codes(r)).toContain("manual-policy");
    expect(JSON.stringify(r)).not.toContain("secret-uuid");
    expect(JSON.stringify(r)).not.toContain("private.example");
    expect(canApplyReport(r)).toBe(true);
  });
  it("名为 PROXY 的源策略组也需要显式映射", () => {
    const r = convert(
      "proxy-groups:\n  - name: PROXY\n    type: select\nrules:\n  - MATCH,PROXY",
    );
    expect(r.targets).toEqual(["PROXY"]);
    expect(r.rules).toHaveLength(0);
    expect(canApplyReport(r, true)).toBe(false);
  });
  it("直接节点引用也必须映射为已配置的标准代理入口", () => {
    const r = convert(
      "proxies:\n  - name: DIRECT\n    type: trojan\nrules:\n  - MATCH,DIRECT",
    );
    expect(codes(r)).toContain("unmapped-target");
    expect(r.rules).toEqual([]);
  });
  it("inline domain provider 支持精确域名和 +. 后缀，保持展开位置", () => {
    const r = convert(
      'rule-providers:\n  local:\n    type: inline\n    behavior: domain\n    payload: ["exact.com", "+.example.org"]\nrules:\n  - DOMAIN,first.com,DIRECT\n  - RULE-SET,local,PROXY\n  - MATCH,DIRECT',
    );
    expect(r.rules.map((r) => r.type)).toEqual([
      "DOMAIN",
      "DOMAIN",
      "DOMAIN-SUFFIX",
      "MATCH",
    ]);
    expect(r.rules.map((r) => r.value)).toEqual([
      "first.com",
      "exact.com",
      "example.org",
      "",
    ]);
    expect(canApplyReport(r)).toBe(true);
  });
  it("http/file providers 展开本地 YAML payload，绝不发起网络请求", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const text =
      "rule-providers:\n  local:\n    type: http\n    behavior: classical\n    url: https://private.example/?token=secret\nrules:\n  - RULE-SET,local,PROXY\n  - MATCH,DIRECT";
    const r = convertConfig(text, config(), {
      format: "clash",
      attachments: [
        {
          name: "local",
          text: "payload:\n  - DOMAIN,a.com\n  - DOMAIN-SUFFIX,b.com",
        },
      ],
    });
    expect(r.rules).toHaveLength(3);
    expect(fetch).not.toHaveBeenCalled();
    expect(JSON.stringify(r)).not.toContain("token=secret");
    vi.unstubAllGlobals();
  });
  it("未提供附件、未知 provider、复杂 options 均报告不兼容", () => {
    const r = convert(
      "rule-providers:\n  p:\n    type: http\n    behavior: domain\nrules:\n  - RULE-SET,p,PROXY\n  - RULE-SET,missing,PROXY\n  - RULE-SET,p,PROXY,no-resolve\n  - MATCH,DIRECT",
    );
    expect(codes(r)).toEqual(
      expect.arrayContaining([
        "missing-attachment",
        "missing-provider",
        "provider-options",
      ]),
    );
    expect(canApplyReport(r)).toBe(false);
  });
  it("通配符 * 不当作普通后缀；嵌套 RULE-SET 不递归执行", () => {
    const r = convert(
      'rule-providers:\n  p:\n    type: inline\n    behavior: domain\n    payload: ["*.example.com"]\n  c:\n    type: inline\n    behavior: classical\n    payload: ["RULE-SET,c"]\nrules:\n  - RULE-SET,p,PROXY\n  - RULE-SET,c,PROXY\n  - MATCH,DIRECT',
    );
    expect(codes(r)).toContain("domain-wildcard");
    expect(codes(r)).toContain("rule-type");
    expect(r.rules).toHaveLength(1);
  });
  it("IPv4 no-resolve 可转换，但仅字面 IP 语义需确认", () => {
    const r = convert(
      "rules:\n  - IP-CIDR,10.0.0.0/8,DIRECT,no-resolve\n  - MATCH,PROXY",
    );
    expect(r.rules[0].type).toBe("IP-CIDR");
    expect(canApplyReport(r)).toBe(false);
    expect(canApplyReport(r, true)).toBe(true);
    expect(runPac({ ...config(), rules: r.rules }, "10.1.2.3")).toBe("DIRECT");
    expect(runPac({ ...config(), rules: r.rules }, "host.local")).toBe(
      "PROXY 127.0.0.1:8123",
    );
  });
  it("REJECT 与 CIDR 组合不兼容，确认也不可应用", () => {
    const r = convert(
      "rules:\n  - IP-CIDR,10.0.0.0/8,DIRECT,no-resolve\n  - DOMAIN,bad.com,REJECT\n  - MATCH,PROXY",
    );
    expect(codes(r)).toContain("combined-validation");
    expect(canApplyReport(r, true)).toBe(false);
  });
});
describe("v2rayNG / Xray JSON", () => {
  it("full/domain/keyword/普通字符串转换并保留 OR 次序与出口", () => {
    const r = convertConfig(
      xray(
        [
          {
            type: "field",
            domain: [
              "full:exact.com",
              "domain:example.org",
              "keyword:cdn",
              "search",
            ],
            outboundTag: "proxy",
          },
          { type: "field", outboundTag: "direct" },
        ],
        {
          outbounds: [
            { tag: "direct", protocol: "freedom" },
            {
              tag: "proxy",
              protocol: "vless",
              settings: { token: "private-token" },
            },
          ],
        },
      ),
      config(),
      { format: "xray", mappings: { proxy: "PROXY:b" } },
    );
    expect(r.rules.map((r) => r.type)).toEqual([
      "DOMAIN",
      "DOMAIN-SUFFIX",
      "DOMAIN-KEYWORD",
      "DOMAIN-KEYWORD",
      "MATCH",
    ]);
    expect(r.rules[0].proxyId).toBe("b");
    expect(r.rules.at(-1)?.action).toBe("DIRECT");
    expect(canApplyReport(r)).toBe(true);
    expect(JSON.stringify(r)).not.toContain("private-token");
    expect(runPac({ ...config(), rules: r.rules }, "a.example.org")).toBe(
      "SOCKS5 proxy.example:9443",
    );
  });
  it("规则集合单独导出 JSON 也可转换，但标签需映射", () => {
    const r = convertConfig(
      JSON.stringify({
        rules: [{ domain: ["domain:example.org"], outboundTag: "custom" }],
      }),
      config(),
      { format: "xray", mappings: { custom: "PROXY" } },
    );
    expect(canApplyReport(r)).toBe(true);
  });
  it("名称 DIRECT 不能掩盖真实 VLESS 节点，不猜出口语义", () => {
    const r = convert(
      xray([{ outboundTag: "DIRECT" }], {
        outbounds: [{ tag: "DIRECT", protocol: "vless" }],
      }),
      "xray",
    );
    expect(r.rules).toEqual([]);
    expect(codes(r)).toContain("unmapped-target");
  });
  it("freedom/blackhole 可映射基础动作，额外 settings 需手动映射", () => {
    const r = convert(
      xray(
        [
          { domain: ["full:bad.com"], outboundTag: "deny" },
          { outboundTag: "direct" },
        ],
        {
          outbounds: [
            { tag: "deny", protocol: "blackhole" },
            { tag: "direct", protocol: "freedom" },
          ],
        },
      ),
      "xray",
    );
    expect(r.rules.map((r) => r.action)).toEqual(["REJECT", "DIRECT"]);
    expect(canApplyReport(r)).toBe(true);
    const advanced = convert(
      xray([{ outboundTag: "direct" }], {
        outbounds: [
          {
            tag: "direct",
            protocol: "freedom",
            settings: { redirect: "other.example:80" },
          },
        ],
      }),
      "xray",
    );
    expect(codes(advanced)).toContain("unmapped-target");
  });
  it.each([
    { domain: ["full:a.com"], port: "443" },
    { domain: ["full:a.com"], ip: ["10.0.0.0/8"] },
    { domain: ["full:a.com"], network: "tcp" },
    { domain: ["full:a.com"], inboundTag: ["socks"] },
  ])("AND 条件 %j 必须整条跳过", (condition) => {
    const r = convertConfig(
      xray([{ ...condition, outboundTag: "proxy" }, { outboundTag: "proxy" }]),
      config(),
      { format: "xray", mappings: { proxy: "PROXY" } },
    );
    expect(r.rules).toHaveLength(1);
    expect(r.rules[0].type).toBe("MATCH");
    expect(codes(r)).toContain("compound-condition");
    expect(canApplyReport(r)).toBe(false);
  });
  it("不把 balancerTag 误转固定代理", () => {
    const r = convert(
      xray([{ domain: ["full:a.com"], balancerTag: "balance" }]),
      "xray",
    );
    expect(codes(r)).toContain("outbound-tag");
    expect(r.rules).toEqual([]);
  });
  it("AsIs 下 IPv4 literal /32 和 CIDR；IPv6/geosite/regexp 不兼容", () => {
    const r = convertConfig(
      xray([
        {
          ip: ["1.1.1.1", "10.0.0.0/8", "::1", "geoip:cn"],
          outboundTag: "proxy",
        },
        { domain: ["geosite:cn", "regexp:.*"], outboundTag: "proxy" },
      ]),
      config(),
      { format: "xray", mappings: { proxy: "PROXY" } },
    );
    expect(r.rules.map((r) => r.value)).toEqual(["1.1.1.1/32", "10.0.0.0/8"]);
    expect(codes(r)).toContain("ip-kind");
    expect(codes(r)).toContain("domain-kind");
    expect(canApplyReport(r)).toBe(false);
  });
  it.each(["IPOnDemand", "IPIfNonMatch"])(
    "%s 不能转换源 DNS IP 规则",
    (strategy) => {
      const r = convertConfig(
        JSON.stringify({
          routing: {
            domainStrategy: strategy,
            rules: [
              { ip: ["10.0.0.0/8"], outboundTag: "proxy" },
              { domain: ["full:a.com"], outboundTag: "proxy" },
            ],
          },
        }),
        config(),
        { format: "xray", mappings: { proxy: "PROXY" } },
      );
      expect(r.rules).toHaveLength(1);
      expect(r.rules[0].type).toBe("DOMAIN");
      expect(codes(r)).toContain("dns-ip");
      expect(codes(r)).toContain("dns-strategy");
    },
  );
  it("重复 outbound 标签和未知 domainStrategy 是错误，不允许部分应用", () => {
    const text = xray([{ outboundTag: "p" }], {
      outbounds: [
        { tag: "p", protocol: "freedom" },
        { tag: "p", protocol: "vless" },
      ],
    });
    const r = convert(text, "xray");
    expect(codes(r)).toContain("duplicate-outbound");
    expect(canApplyReport(r, true)).toBe(false);
    const unknown = convert(
      JSON.stringify({
        domainStrategy: "unknown",
        rules: [{ outboundTag: "PROXY" }],
      }),
      "xray",
    );
    expect(codes(unknown)).toContain("domain-strategy");
  });
});
describe("输入与报告安全", () => {
  it.each([
    "rules: [",
    "rules: []\nrules: []",
    "rules: &a [*a]",
    'rules: !!js/function "function(){}"',
    "rules: []\n__proto__: {polluted: yes}",
  ])("拒绝不安全 YAML：%s", (text) => {
    const r = convert(text);
    expect(codes(r)).toContain("parse-error");
    expect(canApplyReport(r, true)).toBe(false);
    expect(({} as { polluted?: unknown }).polluted).toBeUndefined();
  });
  it("JSON 原型键、过深对象拒绝且不回显原始数据", () => {
    const unsafe = convert(
      '{"routing":{"rules":[]},"__proto__":{"x":"secret-password"}}',
      "xray",
    );
    expect(codes(unsafe)).toContain("parse-error");
    expect(JSON.stringify(unsafe)).not.toContain("secret-password");
    let deep: unknown = { rules: [] };
    for (let i = 0; i < 40; i++) deep = { nested: deep };
    expect(codes(convert(JSON.stringify(deep), "xray"))).toContain(
      "parse-error",
    );
  });
  it("每文件字节上限包括自动识别，附件总计和数量也有限制", () => {
    const large = "x".repeat(256 * 1024 + 1);
    expect(codes(convertConfig(large, config(), { format: "auto" }))).toContain(
      "parse-error",
    );
    const r = convertConfig("rules: []", config(), {
      format: "clash",
      attachments: Array.from({ length: 17 }, (_, i) => ({
        name: String(i),
        text: "",
      })),
    });
    expect(codes(r)).toContain("parse-error");
    const aggregate = convertConfig("rules: []", config(), {
      format: "clash",
      attachments: Array.from({ length: 5 }, (_, i) => ({
        name: String(i),
        text: "x".repeat(220000),
      })),
    });
    expect(codes(aggregate)).toContain("parse-error");
  });
  it("附件名称重复、无效映射与错误域名阻止导入", () => {
    const duplicates = convertConfig("MATCH,PROXY", config(), {
      format: "native",
      attachments: [
        { name: "x", text: "" },
        { name: "x", text: "" },
      ],
    });
    expect(codes(duplicates)).toContain("parse-error");
    const missing = convertConfig(
      "DOMAIN,a.com,group\nMATCH,DIRECT",
      config(),
      { format: "native", mappings: { group: "PROXY:missing" } },
    );
    expect(codes(missing)).toContain("missing-proxy");
    expect(canApplyReport(missing, true)).toBe(false);
    const bad = convert(
      "rules:\n  - DOMAIN,https://evil.com/path,DIRECT\n  - MATCH,PROXY",
    );
    expect(codes(bad)).toContain("invalid-rule");
  });
  it("展开后规则数量上限，不能导入超过 500 条", () => {
    const text =
      "rules:\n" +
      Array.from(
        { length: 501 },
        (_, i) => "  - DOMAIN,h" + i + ".com,DIRECT",
      ).join("\n");
    const r = convert(text);
    expect(codes(r)).toContain("rule-limit");
    expect(canApplyReport(r, true)).toBe(false);
  });
  it("拒绝有歧义的前导零 IPv4，避免浏览器八进制规范化导致错误转换", () => {
    const r = convert(
      "rules:\n  - IP-CIDR,010.0.0.0/8,DIRECT,no-resolve\n  - MATCH,PROXY",
    );
    expect(codes(r)).toContain("invalid-rule");
    expect(canApplyReport(r, true)).toBe(false);
  });
});
