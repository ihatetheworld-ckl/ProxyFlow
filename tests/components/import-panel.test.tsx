// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { ImportPanel } from "../../src/components/ImportPanel";
import { defaults } from "../../src/storage/config";
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
  ],
  selectedId: "a",
  defaultId: "a",
});
afterEach(cleanup);
function source(text: string) {
  fireEvent.change(screen.getByLabelText("配置文本"), {
    target: { value: text },
  });
}
function analyze() {
  fireEvent.click(screen.getByRole("button", { name: "解析并预览" }));
}
const apply = () =>
  screen.getByRole("button", {
    name: "用预览规则替换全部现有规则",
  }) as HTMLButtonElement;
describe("配置导入交互", () => {
  it("只预览不保存，点击应用后才保存正确规则", async () => {
    const save = vi.fn().mockResolvedValue(true);
    render(<ImportPanel config={config()} busy={false} save={save} />);
    source("DOMAIN,a.com,DIRECT\nMATCH,PROXY");
    analyze();
    expect(save).not.toHaveBeenCalled();
    expect(apply().disabled).toBe(false);
    fireEvent.click(apply());
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(
      save.mock.calls[0][0].rules.map((r: { type: string }) => r.type),
    ).toEqual(["DOMAIN", "MATCH"]);
  });
  it("部分导入需要主动接受语义变化；任何错误仍禁止保存", () => {
    const save = vi.fn();
    render(<ImportPanel config={config()} busy={false} save={save} />);
    source("GEOIP,CN,DIRECT\nMATCH,PROXY");
    analyze();
    expect(apply().disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(apply().disabled).toBe(false);
    source("DOMAIN,https://bad.com,DIRECT\nGEOIP,CN,DIRECT\nMATCH,PROXY");
    analyze();
    fireEvent.click(screen.getByRole("checkbox"));
    expect(apply().disabled).toBe(true);
    fireEvent.click(apply());
    expect(save).not.toHaveBeenCalled();
  });
  it("修改源文本后不能应用之前的预览", () => {
    render(<ImportPanel config={config()} busy={false} save={vi.fn()} />);
    source("MATCH,PROXY");
    analyze();
    expect(apply().disabled).toBe(false);
    source("MATCH,DIRECT");
    expect(
      screen.queryByRole("button", { name: "用预览规则替换全部现有规则" }),
    ).toBeNull();
  });
  it("源策略组映射后必须重新预览，再保存映射出口", async () => {
    const save = vi.fn().mockResolvedValue(true);
    render(<ImportPanel config={config()} busy={false} save={save} />);
    source(
      "proxy-groups:\n  - name: Home\n    type: url-test\nrules:\n  - MATCH,Home",
    );
    analyze();
    expect(apply().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("映射 Home"), {
      target: { value: "PROXY:a" },
    });
    expect(
      screen.queryByRole("button", { name: "用预览规则替换全部现有规则" }),
    ).toBeNull();
    analyze();
    expect(apply().disabled).toBe(false);
    fireEvent.click(apply());
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0][0].rules[0].proxyId).toBe("a");
  });
  it("配置版本变化后必须重新解析，防止应用过期预览", () => {
    const c = config();
    const save = vi.fn();
    const view = render(<ImportPanel config={c} busy={false} save={save} />);
    source("MATCH,PROXY");
    analyze();
    view.rerender(
      <ImportPanel config={{ ...c, revision: 1 }} busy={false} save={save} />,
    );
    expect(apply().disabled).toBe(true);
    expect(screen.getByRole("alert").textContent).toContain("配置已更改");
    analyze();
    expect(apply().disabled).toBe(false);
  });
  it("busy 状态禁止源修改和重复应用", () => {
    const c = config();
    const save = vi.fn();
    const view = render(<ImportPanel config={c} busy={false} save={save} />);
    source("MATCH,PROXY");
    analyze();
    view.rerender(<ImportPanel config={c} busy={true} save={save} />);
    expect(apply().disabled).toBe(true);
    expect(
      (screen.getByLabelText("配置文本") as HTMLTextAreaElement).disabled,
    ).toBe(true);
  });
});
