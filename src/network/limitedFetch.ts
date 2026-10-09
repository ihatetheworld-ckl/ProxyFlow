export async function limitedFetch(
  url: string,
  limit: number,
  label: "订阅" | "配置" = "订阅",
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
    throw new Error(label + "请求失败：网络、TLS、重定向或超时，未切换直连");
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw new Error(label + "服务器返回 HTTP " + response.status);
  }
  const length = Number(response.headers.get("content-length"));
  if (Number.isFinite(length) && length > limit) {
    await response.body?.cancel().catch(() => {});
    throw new Error(label + "内容超过 " + limit / 1024 + " KiB");
  }
  if (
    response.headers.get("content-type")?.toLowerCase().includes("text/html")
  ) {
    await response.body?.cancel().catch(() => {});
    throw new Error(
      label + "返回 HTML 页面，无法作为配置解析；请使用文件原始内容链接",
    );
  }
  if (!response.body) throw new Error(label + "没有响应正文");
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0,
    text = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit)
        throw new Error(label + "内容超过 " + limit / 1024 + " KiB");
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return text;
  } catch (error) {
    await reader.cancel().catch(() => {});
    if (size > limit) throw error;
    throw new Error(label + "正文读取失败或不是有效 UTF-8");
  } finally {
    reader.releaseLock();
  }
}
