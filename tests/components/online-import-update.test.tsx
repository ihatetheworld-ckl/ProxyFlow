// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { ImportPanel } from "../../src/components/ImportPanel";
import { UpdatePanel } from "../../src/components/UpdatePanel";
import { defaults } from "../../src/storage/config";
const mocks = vi.hoisted(() => ({ request: vi.fn(), download: vi.fn() }));
vi.mock("../../src/components/client", () => mocks);
beforeEach(() => {
  mocks.request.mockReset();
  mocks.request.mockResolvedValue({
    download: { text: "MATCH,DIRECT", bytes: 12, host: "rules.example" },
  });
  vi.stubGlobal("chrome", {
    permissions: { request: vi.fn().mockResolvedValue(true) },
  });
});
afterEach(cleanup);
function url(value = "https://rules.example:8443/list?token=secret") {
  fireEvent.change(screen.getByLabelText("在线配置链接"), {
    target: { value },
  });
}
const clickDownload = () =>
  fireEvent.click(screen.getByRole("button", { name: "授权并下载配置" }));
describe("一次性在线导入", () => {
  it("主动授权来源后只填入文本，预览和保存须另外确认", async () => {
    const save = vi.fn().mockResolvedValue(true);
    render(<ImportPanel config={defaults()} busy={false} save={save} />);
    url();
    clickDownload();
    await waitFor(() =>
      expect(
        (screen.getByLabelText("配置文本") as HTMLTextAreaElement).value,
      ).toBe("MATCH,DIRECT"),
    );
    expect(chrome.permissions.request).toHaveBeenCalledWith({
      origins: ["https://rules.example/*"],
    });
    expect(mocks.request).toHaveBeenCalledWith({
      type: "FETCH_CONFIG",
      url: "https://rules.example:8443/list?token=secret",
    });
    expect(save).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: "用预览规则替换全部现有规则" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "解析并预览" }));
    fireEvent.click(
      screen.getByRole("button", { name: "用预览规则替换全部现有规则" }),
    );
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  });
  it("拒绝授权不下载，不覆盖之前文本", async () => {
    chrome.permissions.request = vi.fn().mockResolvedValue(false);
    render(<ImportPanel config={defaults()} busy={false} save={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("配置文本"), {
      target: { value: "MATCH,REJECT" },
    });
    url();
    clickDownload();
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("未授权"),
    );
    expect(mocks.request).not.toHaveBeenCalled();
    expect(
      (screen.getByLabelText("配置文本") as HTMLTextAreaElement).value,
    ).toBe("MATCH,REJECT");
  });
  it("非 HTTPS 链接不申请权限", async () => {
    render(<ImportPanel config={defaults()} busy={false} save={vi.fn()} />);
    url("http://rules.example/list");
    clickDownload();
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("HTTPS"),
    );
    expect(chrome.permissions.request).not.toHaveBeenCalled();
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it("下载中禁止修改源和重复应用；下载失败保留旧文本", async () => {
    let reject: (e: Error) => void = () => {};
    mocks.request.mockImplementation(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail;
        }),
    );
    render(<ImportPanel config={defaults()} busy={false} save={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("配置文本"), {
      target: { value: "MATCH,DIRECT" },
    });
    fireEvent.click(screen.getByRole("button", { name: "解析并预览" }));
    url();
    clickDownload();
    await waitFor(() => expect(mocks.request).toHaveBeenCalled());
    expect(
      (screen.getByLabelText("配置文本") as HTMLTextAreaElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: "解析并预览" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    reject(new Error("配置请求失败"));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("配置请求失败"),
    );
    expect(
      (screen.getByLabelText("配置文本") as HTMLTextAreaElement).value,
    ).toBe("MATCH,DIRECT");
  });
});
describe("版本更新界面", () => {
  it("开发目录说明限制并禁用更新，不自动发起网络检查", async () => {
    mocks.request.mockResolvedValue({
      installation: {
        version: "1.0.0",
        channel: "development",
        canCheck: false,
      },
    });
    render(<UpdatePanel />);
    await screen.findByText(/此副本由已解压目录加载/);
    expect(
      (
        screen.getByRole("button", {
          name: "请求 Chrome 检查更新",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(mocks.request).toHaveBeenCalledTimes(1);
    expect(mocks.request).toHaveBeenCalledWith({ type: "UPDATE_INFO" });
  });
  it("商店渠道仅在点击时检查，显示限流而不宣称已更新", async () => {
    mocks.request
      .mockResolvedValueOnce({
        installation: { version: "1.0.0", channel: "store", canCheck: true },
      })
      .mockResolvedValueOnce({
        extensionUpdate: {
          status: "throttled",
          message: "Chrome 限制了检查频率",
        },
      });
    render(<UpdatePanel />);
    await screen.findByText(/Chrome Web Store 更新渠道/);
    fireEvent.click(
      screen.getByRole("button", { name: "请求 Chrome 检查更新" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain(
        "限制了检查频率",
      ),
    );
    expect(mocks.request).toHaveBeenLastCalledWith({ type: "UPDATE_CHECK" });
  });
});
