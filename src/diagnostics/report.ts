import { canonical } from "../utils/stable";
import type { Config, DiagnosticReport } from "../utils/types";
import { proxyValue } from "../proxy/controller";
import { compileDnr } from "../rules/dnr";
import { route } from "../rules/engine";
import { isAdBlocked } from "../blocking/compiler";
import { webRtcState } from "../security/webRtc";
import { websitePattern } from "../network/permission";
export function proxyMatches(
  c: Config,
  value: chrome.proxy.ProxyConfig | undefined,
): boolean {
  const expected = proxyValue(c);
  if (value?.mode !== expected.mode) return false;
  if (expected.mode === "pac_script")
    return (
      value.pacScript?.data === expected.pacScript?.data &&
      value.pacScript?.mandatory === true
    );
  if (expected.mode === "fixed_servers") {
    const normalize = (rules: chrome.proxy.ProxyRules | undefined) => ({
      ...rules,
      bypassList: [...(rules?.bypassList ?? [])].sort(),
    });
    return (
      canonical(normalize(value.rules)) === canonical(normalize(expected.rules))
    );
  }
  return true;
}
export function dnrMatches(
  expected: chrome.declarativeNetRequest.Rule[],
  actual: chrome.declarativeNetRequest.Rule[],
): boolean {
  if (expected.length !== actual.length) return false;
  const condition = (r: chrome.declarativeNetRequest.Rule) => ({
    ...r.condition,
    isUrlFilterCaseSensitive: r.condition.isUrlFilterCaseSensitive ?? false,
    resourceTypes: [...(r.condition.resourceTypes ?? [])].sort(),
  });
  return expected.every((e) => {
    const a = actual.find((r) => r.id === e.id);
    return (
      !!a &&
      (a.priority ?? 1) === (e.priority ?? 1) &&
      canonical(a.action) === canonical(e.action) &&
      canonical(condition(a)) === canonical(condition(e))
    );
  });
}
export async function runDiagnostics(
  c: Config,
  input: string,
): Promise<DiagnosticReport> {
  const report: DiagnosticReport = { code: "NOT_RUN", summary: "", checks: [] };
  let url: URL;
  try {
    url = new URL(input);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      throw new Error();
  } catch {
    return {
      ...report,
      code: "INVALID_URL",
      summary: "仅支持无凭据 HTTP/HTTPS 测试地址",
    };
  }
  const setting = await chrome.proxy.settings.get({ incognito: false });
  const controlled = setting.levelOfControl === "controlled_by_this_extension";
  report.checks.push({
    name: "代理控制权",
    status: controlled ? "ok" : "error",
    detail: setting.levelOfControl,
  });
  const matched = proxyMatches(c, setting.value);
  report.checks.push({
    name: "实际代理配置",
    status: matched ? "ok" : "error",
    detail: matched
      ? "Chrome 配置与本地预期一致"
      : "模式、PAC 或固定代理与本地配置不一致",
  });
  const actual = await chrome.declarativeNetRequest.getDynamicRules();
  const filters = dnrMatches(compileDnr(c), actual);
  report.checks.push({
    name: "实际请求拦截规则",
    status: filters ? "ok" : "error",
    detail: filters
      ? "Chrome DNR 与本地预期一致"
      : "Chrome DNR 与本地配置不一致",
  });
  const rtc = await webRtcState();
  report.checks.push({
    name: "WebRTC 策略",
    status: rtc.value === "disable_non_proxied_udp" ? "ok" : "warning",
    detail:
      rtc.value === "disable_non_proxied_udp"
        ? "已限制非代理 UDP；仍不能保证全部 IP 不泄漏"
        : (rtc.error ?? "未观察到非代理 UDP 限制，WebRTC 可能绕过代理"),
  });
  report.checks.push({
    name: "DNS / QUIC / 特殊流量",
    status: "warning",
    detail:
      "PAC 不进行 DNS 地址匹配；Chrome 内部服务、QUIC、回环地址和既有连接存在浏览器控制边界",
  });
  if (!controlled)
    return {
      ...report,
      code: "CONTROL_CONFLICT",
      summary: "代理权限冲突或尚未应用配置：" + setting.levelOfControl,
    };
  if (!matched || !filters)
    return {
      ...report,
      code: "CONFIG_DRIFT",
      summary: "实际 Chrome 设置与本地配置不同，请重新应用配置后再测试",
    };
  if (c.webRtc === "restrict" && rtc.value !== "disable_non_proxied_udp")
    return {
      ...report,
      code: "SECURITY_DRIFT",
      summary: "期望的 WebRTC 策略未生效，请检查 privacy 权限和控制权后再测试",
    };
  const target = route(c, url.hostname);
  const exit =
    target === "DIRECT"
      ? "直连"
      : (c.proxies.find((p) => p.id === target)?.name ?? target);
  report.checks.push({ name: "规则预计出口", status: "info", detail: exit });
  if (isAdBlocked(c, url.hostname))
    return {
      ...report,
      code: "AD_BLOCKED",
      summary: "广告域名拦截规则阻止此目标；请更换测试网站或关闭广告拦截",
    };
  if (target === "REJECT")
    return {
      ...report,
      code: "RULE_REJECTED",
      summary: "规则拒绝此目标，请选择其他网站",
    };
  if (!(await chrome.permissions.contains({ origins: [websitePattern(url)] })))
    return {
      ...report,
      code: "HOST_PERMISSION",
      summary: "未授予此网站的测试访问权限",
    };
  const started = Date.now();
  try {
    const response = await fetch(url.href, {
      cache: "no-store",
      credentials: "omit",
      redirect: "error",
      referrerPolicy: "no-referrer",
      signal: AbortSignal.timeout(12000),
    });
    await response.body?.cancel();
    return {
      ...report,
      code: response.ok ? "HTTP_OK" : "HTTP_ERROR",
      httpStatus: response.status,
      elapsedMs: Date.now() - started,
      summary: `路由：${exit}；HTTP ${response.status}；${Date.now() - started} ms。${response.ok ? "目标响应成功" : "目标返回 HTTP 错误"}。本次响应不能独立证明代理出口 IP。`,
    };
  } catch (error) {
    const recent = (await chrome.storage.local.get("proxyError")).proxyError as
      { at: number; code: string } | undefined;
    if (recent && recent.at >= started && target !== "DIRECT")
      return {
        ...report,
        code: "PROXY_ERROR_OBSERVED",
        elapsedMs: Date.now() - started,
        summary:
          "请求失败，Chrome 同时报告代理错误 " +
          recent.code +
          "。事件不能保证与此请求一一对应，请结合代理日志核验；未自动回退直连。",
      };
    const timeout =
      error !== null &&
      typeof error === "object" &&
      "name" in error &&
      ["TimeoutError", "AbortError"].includes(String(error.name));
    return {
      ...report,
      code: timeout ? "TIMEOUT" : "NETWORK_ERROR",
      elapsedMs: Date.now() - started,
      summary: timeout
        ? "请求超时；不能确定代理或目标哪一方失效，未切换直连。"
        : "请求失败：代理不可用、目标不可达、TLS/DNS 或重定向错误，扩展 API 无法可靠区分；请结合代理日志与其他目标测试，未自动回退直连。",
    };
  }
}
