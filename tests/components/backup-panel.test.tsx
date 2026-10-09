// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { BackupPanel } from "../../src/components/BackupPanel";
import { defaults } from "../../src/storage/config";
import { exportBackup } from "../../src/storage/backup";
const mocks = vi.hoisted(() => ({ download: vi.fn() }));
vi.mock("../../src/components/client", () => mocks);
beforeEach(() => {
  mocks.download.mockReset();
  vi.stubGlobal("chrome", {
    permissions: { request: vi.fn().mockResolvedValue(false) },
  });
});
afterEach(cleanup);
function load(text: string) {
  const bytes = new TextEncoder().encode(text);
  fireEvent.change(screen.getByLabelText("配置备份文件"), {
    target: {
      files: [{ size: bytes.length, arrayBuffer: async () => bytes.buffer }],
    },
  });
}
describe("备份恢复界面", () => {
  it("只有明确确认替换后才提交，拒绝自动恢复", async () => {
    const config = defaults(),
      save = vi.fn().mockResolvedValue(true);
    render(<BackupPanel config={config} busy={false} save={save} />);
    load(exportBackup({ ...config, theme: "dark", revision: 99 }));
    await screen.findByRole("status");
    const restore = screen.getByRole("button", {
      name: "确认恢复并应用配置",
    }) as HTMLButtonElement;
    expect(restore.disabled).toBe(true);
    expect(save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(restore);
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({ theme: "dark", revision: 0 }),
      ),
    );
    expect(chrome.permissions.request).not.toHaveBeenCalled();
  });
  it("配置版本变化后禁止恢复旧预览", async () => {
    const config = defaults(),
      save = vi.fn();
    const view = render(
      <BackupPanel config={config} busy={false} save={save} />,
    );
    load(exportBackup(config));
    await screen.findByRole("status");
    fireEvent.click(screen.getByRole("checkbox"));
    view.rerender(
      <BackupPanel
        config={{ ...config, revision: 1 }}
        busy={false}
        save={save}
      />,
    );
    expect(
      (
        screen.getByRole("button", {
          name: "确认恢复并应用配置",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(save).not.toHaveBeenCalled();
  });
  it("恢复 WebRTC 限制需独立授权，拒绝后原配置保留", async () => {
    const config = defaults(),
      save = vi.fn();
    render(<BackupPanel config={config} busy={false} save={save} />);
    load(exportBackup({ ...config, webRtc: "restrict" }));
    await screen.findByRole("status");
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "确认恢复并应用配置" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("privacy"),
    );
    expect(save).not.toHaveBeenCalled();
  });
});
