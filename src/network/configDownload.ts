import { subscriptionUrl } from "../subscriptions/url";
import { MAX_IMPORT_BYTES } from "../parsers/native";
import { limitedFetch } from "./limitedFetch";
import { websitePattern } from "./permission";
export function configurationUrl(input: unknown): URL {
  if (typeof input !== "string") throw new Error("在线配置地址无效");
  try {
    return subscriptionUrl(input.trim());
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? error.message.replaceAll("订阅", "在线配置")
        : "在线配置地址无效",
    );
  }
}
export async function downloadConfiguration(input: unknown) {
  const url = configurationUrl(input);
  if (!(await chrome.permissions.contains({ origins: [websitePattern(url)] })))
    throw new Error("在线配置站点权限未授予或已撤销");
  const text = await limitedFetch(url.href, MAX_IMPORT_BYTES, "配置");
  return {
    text,
    bytes: new TextEncoder().encode(text).length,
    host: url.hostname,
  };
}
