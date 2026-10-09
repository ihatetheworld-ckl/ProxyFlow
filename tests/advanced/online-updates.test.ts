import { beforeEach, describe, expect, it, vi } from "vitest";
import { downloadConfiguration } from "../../src/network/configDownload";
import {
  installationInfo,
  checkExtensionUpdate,
} from "../../src/updates/service";
let fetcher: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetcher = vi.fn().mockResolvedValue(new Response("MATCH,DIRECT"));
  vi.stubGlobal("fetch", fetcher);
  vi.stubGlobal("chrome", {
    permissions: { contains: vi.fn().mockResolvedValue(true) },
    storage: { local: { set: vi.fn() } },
    runtime: {
      id: "abcdefghijklmnopabcdefghijklmnop",
      getManifest: vi.fn().mockReturnValue({
        version: "1.0.0",
        update_url: "https://clients2.google.com/service/update2/crx",
      }),
      requestUpdateCheck: vi.fn().mockResolvedValue({ status: "no_update" }),
    },
    management: {
      getSelf: vi.fn().mockResolvedValue({ installType: "normal" }),
    },
  });
});
describe("在线配置下载", () => {
  it.each([
    null,
    "http://rules.example/list",
    "https://127.0.0.1/list",
    "https://u:p@rules.example/list",
  ])("后台拒绝无效地址 %s，尚未发起请求", async (url) => {
    await expect(downloadConfiguration(url)).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("下载正文仅返回页面，不持久化原文或 URL 令牌", async () => {
    const result = await downloadConfiguration(
      " https://rules.example:8443/list?token=secret ",
    );
    expect(result).toEqual({
      text: "MATCH,DIRECT",
      bytes: 12,
      host: "rules.example",
    });
    expect(chrome.permissions.contains).toHaveBeenCalledWith({
      origins: ["https://rules.example/*"],
    });
    expect(fetcher.mock.calls[0][1]).toMatchObject({
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer",
    });
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });
  it("来源权限撤销时不下载", async () => {
    chrome.permissions.contains = vi.fn().mockResolvedValue(false);
    await expect(
      downloadConfiguration("https://rules.example/list"),
    ).rejects.toThrow(/权限/);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("下载错误使用配置术语且不回显敏感异常", async () => {
    fetcher.mockRejectedValue(new Error("token=secret"));
    await expect(
      downloadConfiguration("https://rules.example/list"),
    ).rejects.toThrow("配置请求失败");
    fetcher.mockResolvedValue(
      new Response("<html>", { headers: { "content-type": "text/html" } }),
    );
    await expect(
      downloadConfiguration("https://rules.example/list"),
    ).rejects.toThrow(/原始内容链接/);
  });
});
describe("Chrome 更新渠道", () => {
  it("从商店正常安装时可检查，仅读取自身信息而不枚举扩展", async () => {
    expect(await installationInfo()).toMatchObject({
      version: "1.0.0",
      channel: "store",
      canCheck: true,
      storeUrl: expect.stringContaining(chrome.runtime.id),
    });
    expect(chrome.runtime.requestUpdateCheck).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("已解压目录即使有 update_url 仍不自动更新", async () => {
    chrome.management.getSelf = vi
      .fn()
      .mockResolvedValue({ installType: "development" });
    expect(await installationInfo()).toMatchObject({
      channel: "development",
      canCheck: false,
    });
    expect((await checkExtensionUpdate()).status).toBe("unsupported");
    expect(chrome.runtime.requestUpdateCheck).not.toHaveBeenCalled();
  });
  it("管理员部署可请求 Chrome 按策略检查，未配置更新源的其他渠道不可检查", async () => {
    chrome.management.getSelf = vi
      .fn()
      .mockResolvedValue({ installType: "admin" });
    expect((await installationInfo()).channel).toBe("managed");
    chrome.management.getSelf = vi
      .fn()
      .mockResolvedValue({ installType: "sideload" });
    chrome.runtime.getManifest = vi.fn().mockReturnValue({ version: "1.0.0" });
    expect((await installationInfo()).canCheck).toBe(false);
  });
  it("无法确认渠道时保守禁用检查，不猜测是商店版本", async () => {
    chrome.management.getSelf = vi.fn().mockRejectedValue(new Error("API"));
    expect(await installationInfo()).toMatchObject({
      channel: "unknown",
      canCheck: false,
    });
  });
  it.each(["no_update", "throttled", "update_available"])(
    "正确解释 Chrome 状态 %s",
    async (status) => {
      chrome.runtime.requestUpdateCheck = vi
        .fn()
        .mockResolvedValue({ status, version: "1.0.1" });
      const result = await checkExtensionUpdate();
      expect(result.status).toBe(status);
      if (status === "update_available") expect(result.version).toBe("1.0.1");
      expect(fetcher).not.toHaveBeenCalled();
    },
  );
  it("Chrome 检查异常与未知状态不冒充更新成功", async () => {
    chrome.runtime.requestUpdateCheck = vi
      .fn()
      .mockRejectedValue(new Error("secret"));
    expect((await checkExtensionUpdate()).status).toBe("error");
    chrome.runtime.requestUpdateCheck = vi
      .fn()
      .mockResolvedValue({ status: "unknown" });
    expect((await checkExtensionUpdate()).status).toBe("error");
  });
});
