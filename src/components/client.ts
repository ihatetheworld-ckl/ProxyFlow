import type { ApiResult, Config } from "../utils/types";
export async function api(
  type: string,
  config?: Config,
  url?: string,
): Promise<ApiResult> {
  if (!globalThis.chrome?.runtime?.id)
    throw new Error("请构建并在 Chrome 加载扩展后使用");
  const result: ApiResult = await chrome.runtime.sendMessage({
    type,
    config,
    url,
  });
  if (result.error) throw new Error(result.error);
  return result;
}
export function download(name: string, text: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: "text/plain;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function request(
  message: Record<string, unknown>,
): Promise<ApiResult> {
  const result: ApiResult = await chrome.runtime.sendMessage(message);
  if (result.error) throw new Error(result.error);
  return result;
}
