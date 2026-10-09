export async function limitedFetch(
  url: string,
  limit: number,
): Promise<string> {
  const controller = AbortSignal.timeout(12000);
  let response: Response;
  try {
    response = await fetch(url, {
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer",
      signal: controller,
    });
  } catch {
    throw new Error("订阅请求失败：网络、TLS、重定向或超时，未切换直连");
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw new Error("订阅服务器返回 HTTP " + response.status);
  }
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > limit) {
    await response.body?.cancel().catch(() => {});
    throw new Error("订阅内容超过 256 KiB");
  }
  if (
    response.headers.get("content-type")?.toLowerCase().includes("text/html")
  ) {
    await response.body?.cancel().catch(() => {});
    throw new Error("订阅返回 HTML 页面，无法作为配置解析");
  }
  if (!response.body) throw new Error("订阅没有响应正文");
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0,
    text = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error("订阅内容超过 256 KiB");
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } catch (error) {
    await reader.cancel().catch(() => {});
    if (size > limit) throw error;
    throw new Error("订阅正文读取失败或不是有效 UTF-8");
  } finally {
    reader.releaseLock();
  }
}
