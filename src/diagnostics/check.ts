import type { Config } from "../utils/types";
import { route } from "../rules/engine";
import { controlLevel } from "../proxy/controller";
export async function diagnose(c: Config, input: string): Promise<string> {
  const url = new URL(input);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error("仅支持无凭据 HTTP/HTTPS 测试地址");
  const level = await controlLevel();
  if (level !== "controlled_by_this_extension")
    return "权限冲突或尚未应用配置：" + level;
  const target = route(c, url.hostname);
  if (target === "REJECT") return "规则拒绝此目标，请选择其他网站";
  if (!(await chrome.permissions.contains({ origins: [url.origin + "/*"] })))
    return "未授予此网站的临时测试访问权限";
  const start = Date.now();
  try {
    const response = await fetch(url.href, {
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      signal: AbortSignal.timeout(12000),
    });
    return `路由：${target === "DIRECT" ? "直连" : (c.proxies.find((p) => p.id === target)?.name ?? target)}；HTTP ${response.status}；${Date.now() - start} ms。${response.ok ? "目标响应成功" : "目标返回 HTTP 错误"}。请求结果不能独立证明出口 IP；Chrome 内部绕过、DNS、缓存或既有连接可能影响实际路径。`;
  } catch {
    return "请求失败：可能为代理不可用、目标不可达、TLS/DNS 错误、重定向或超时。扩展 API 无法可靠区分这些原因；请结合代理客户端日志与其他测试目标检查。没有执行端口探测，也未自动回退直连。";
  }
}
