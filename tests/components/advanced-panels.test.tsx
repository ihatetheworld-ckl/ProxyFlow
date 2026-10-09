// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { SecurityPanel } from "../../src/components/SecurityPanel";
import { SubscriptionPanel } from "../../src/components/SubscriptionPanel";
import { DiagnosticsPanel } from "../../src/components/DiagnosticsPanel";
import { defaults } from "../../src/storage/config";
import { convertConfig } from "../../src/parsers";
import type { Config, SubscriptionState } from "../../src/utils/types";
const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("../../src/components/client", () => ({ request: mocks.request }));
const config = (): Config => ({
  ...defaults(),
  mode: "smart",
  proxies: [
    { id: "a", name: "A", host: "127.0.0.1", port: 8123, protocol: "http" },
  ],
  selectedId: "a",
  defaultId: "a",
  subscriptions: [
    {
      id: "sub",
      name: "Rules",
      url: "https://rules.example/list",
      format: "native",
      intervalHours: 0,
      defaultTarget: "PROXY",
      mappings: {},
    },
  ],
});
beforeEach(() => {
  mocks.request.mockReset();
  mocks.request.mockResolvedValue({});
  vi.stubGlobal("chrome", {
    permissions: { request: vi.fn().mockResolvedValue(true) },
  });
});
afterEach(cleanup);
describe("安全面板交互", () => {
  it("开启 WebRTC 必须先申请 privacy 权限，拒绝后不保存设置", async () => {
    const save = vi.fn();
    chrome.permissions.request = vi.fn().mockResolvedValue(false);
    render(<SecurityPanel config={config()} busy={false} save={save} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /限制 WebRTC/ }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("privacy"),
    );
    expect(chrome.permissions.request).toHaveBeenCalledWith({
      permissions: ["privacy"],
    });
    expect(save).not.toHaveBeenCalled();
  });
  it("授权 WebRTC 后保存 restrict；关闭只请求释放设置", async () => {
    const save = vi.fn().mockResolvedValue(true);
    const c = config();
    const view = render(<SecurityPanel config={c} busy={false} save={save} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /限制 WebRTC/ }));
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({ webRtc: "restrict" }),
      ),
    );
    view.rerender(
      <SecurityPanel
        config={{ ...c, webRtc: "restrict" }}
        busy={false}
        save={save}
      />,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: /限制 WebRTC/ }));
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({ webRtc: "browser" }),
      ),
    );
    expect(chrome.permissions.request).toHaveBeenCalledTimes(1);
  });
  it("广告开关和列表分别保存，不请求浏览历史权限", () => {
    const save = vi.fn().mockResolvedValue(true);
    render(<SecurityPanel config={config()} busy={false} save={save} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "开启广告域名拦截" }));
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({
        blocking: expect.objectContaining({ enabled: true }),
      }),
    );
    fireEvent.change(screen.getByLabelText("广告拦截域名"), {
      target: { value: "ads.example\nads.example\ntracker.example" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存域名列表" }));
    expect(save.mock.calls.at(-1)![0].blocking.domains).toEqual([
      "ads.example",
      "tracker.example",
    ]);
    expect(chrome.permissions.request).not.toHaveBeenCalled();
  });
});
describe("订阅面板交互", () => {
  it("周期订阅保存前按站点授权，保存元数据不会下载或应用路由", async () => {
    const c = config();
    c.subscriptions = [];
    const save = vi.fn().mockResolvedValue(true);
    render(
      <SubscriptionPanel
        config={c}
        updates={{}}
        busy={false}
        save={save}
        reload={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText("订阅名称"), {
      target: { value: "My Rules" },
    });
    fireEvent.change(screen.getByLabelText("HTTPS 地址"), {
      target: { value: "https://rules.example:8443/list" },
    });
    fireEvent.change(screen.getByLabelText("下载周期"), {
      target: { value: "6" },
    });
    fireEvent.click(screen.getByRole("button", { name: "添加订阅" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(chrome.permissions.request).toHaveBeenCalledWith({
      origins: ["https://rules.example/*"],
    });
    expect(save.mock.calls[0][0].subscriptions[0].intervalHours).toBe(6);
    expect(mocks.request).not.toHaveBeenCalled();
    expect(save.mock.calls[0][0].rules).toEqual(c.rules);
  });
  it("手动更新先请求站点权限；拒绝不会调用后台下载", async () => {
    chrome.permissions.request = vi.fn().mockResolvedValue(false);
    render(
      <SubscriptionPanel
        config={config()}
        updates={{}}
        busy={false}
        save={vi.fn()}
        reload={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "授权并下载更新" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("未授权"),
    );
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it("错误出口映射 JSON 不保存或申请权限", async () => {
    const c = config();
    c.subscriptions = [];
    const save = vi.fn();
    render(
      <SubscriptionPanel
        config={c}
        updates={{}}
        busy={false}
        save={save}
        reload={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText("订阅名称"), {
      target: { value: "New" },
    });
    fireEvent.change(screen.getByLabelText("HTTPS 地址"), {
      target: { value: "https://rules.example/list" },
    });
    fireEvent.change(screen.getByLabelText("订阅出口映射"), {
      target: { value: "invalid" },
    });
    fireEvent.click(screen.getByRole("button", { name: "添加订阅" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("JSON"),
    );
    expect(save).not.toHaveBeenCalled();
    expect(chrome.permissions.request).not.toHaveBeenCalled();
  });
  it("确认绑定候选 token，替换候选后旧确认失效，过期候选不可应用", () => {
    const c = config();
    const state: SubscriptionState = {
      pending: {
        token: "first",
        report: convertConfig("GEOIP,CN,DIRECT\nMATCH,PROXY", c, {
          format: "native",
        }),
        baseRevision: 0,
        fingerprint: "test",
        fetchedAt: Date.now(),
      },
    };
    const view = render(
      <SubscriptionPanel
        config={c}
        updates={{ sub: state }}
        busy={false}
        save={vi.fn()}
        reload={vi.fn()}
      />,
    );
    const apply = () =>
      screen.getByRole("button", {
        name: "用候选替换全部规则",
      }) as HTMLButtonElement;
    expect(apply().disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(apply().disabled).toBe(false);
    view.rerender(
      <SubscriptionPanel
        config={c}
        updates={{
          sub: { ...state, pending: { ...state.pending!, token: "second" } },
        }}
        busy={false}
        save={vi.fn()}
        reload={vi.fn()}
      />,
    );
    expect(apply().disabled).toBe(true);
    view.rerender(
      <SubscriptionPanel
        config={{ ...c, revision: 1 }}
        updates={{ sub: state }}
        busy={false}
        save={vi.fn()}
        reload={vi.fn()}
      />,
    );
    expect(apply().disabled).toBe(true);
  });
});
describe("诊断页面", () => {
  it("授权目标后只发送 TEST 请求，展示结构化检查结果", async () => {
    mocks.request.mockResolvedValue({
      diagnostics: {
        code: "HTTP_OK",
        summary: "响应成功，不证明出口 IP",
        checks: [{ name: "实际代理配置", status: "ok", detail: "一致" }],
      },
    });
    render(<DiagnosticsPanel />);
    fireEvent.click(screen.getByRole("button", { name: "授权此网站并测试" }));
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain("HTTP_OK"),
    );
    expect(mocks.request).toHaveBeenCalledWith({
      type: "TEST",
      url: "https://example.com/",
    });
    expect(screen.getByText("实际代理配置")).toBeTruthy();
    expect(chrome.permissions.request).toHaveBeenCalledWith({
      origins: ["https://example.com/*"],
    });
  });
});
