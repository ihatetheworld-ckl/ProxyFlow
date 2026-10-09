import { describe, expect, it } from "vitest";
import { defaults } from "../../src/storage/config";
import { exportBackup, parseBackup } from "../../src/storage/backup";
describe("配置迁移备份", () => {
  it("导出与恢复保存设置，使用目标浏览器当前 revision", () => {
    const config = {
      ...defaults(),
      revision: 42,
      subscriptions: [
        {
          id: "sub",
          name: "Feed",
          url: "https://rules.example/list?token=secret",
          format: "native" as const,
          intervalHours: 6 as const,
          defaultTarget: "DIRECT" as const,
          mappings: {},
        },
      ],
    };
    const restored = parseBackup(exportBackup(config), 3);
    expect(restored).toEqual({ ...config, revision: 3 });
    expect(restored.subscriptions?.[0].url).toContain("token=secret");
  });
  it("未知源字段与状态缓存不进入备份", () => {
    const config = {
      ...defaults(),
      untrustedNodes: { password: "hidden" },
      subscriptionStates: { pending: "secret" },
    };
    expect(exportBackup(config)).not.toContain("hidden");
    expect(exportBackup(config)).not.toContain("subscriptionStates");
    const document = JSON.parse(exportBackup(defaults()));
    document.config.extra = "hidden";
    expect(parseBackup(JSON.stringify(document), 0)).not.toHaveProperty(
      "extra",
    );
  });
  it("非法配置、节点客户端配置、超限与危险键都拒绝", () => {
    for (const text of [
      "{}",
      '{"proxies":[]}',
      "x".repeat(1024 * 1024 + 1),
      '{"__proto__":{}}',
    ])
      expect(() => parseBackup(text, 0)).toThrow();
    const document = JSON.parse(exportBackup(defaults()));
    document.config.mode = "global";
    expect(() => parseBackup(JSON.stringify(document), 0)).toThrow();
  });
});
