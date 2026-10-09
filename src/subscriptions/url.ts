import { ipv4 } from "../rules/engine";
import { validHost } from "../utils/host";
export function subscriptionUrl(input: string): URL {
  let u: URL;
  try {
    u = new URL(input);
  } catch {
    throw new Error("订阅地址无效");
  }
  if (
    input.length > 2048 ||
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    u.hash
  )
    throw new Error("订阅仅支持无用户名密码、无片段的 HTTPS URL");
  const host = u.hostname.toLowerCase();
  if (
    !validHost(host) ||
    !host.includes(".") ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.includes(":")
  )
    throw new Error(
      "订阅需要公开域名或公开 IPv4 地址，不支持本地或 IPv6 字面地址",
    );
  const ip = ipv4(host);
  if (ip !== null) {
    const a = ip >>> 24,
      b = (ip >>> 16) & 255;
    if (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 168 || b === 0)) ||
      (a === 198 && (b === 18 || b === 19))
    )
      throw new Error("不允许本地、私有或保留 IPv4 订阅地址");
  }
  return u;
}
