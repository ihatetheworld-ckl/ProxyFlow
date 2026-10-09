import { ipv4 } from "../rules/engine";
export function validHost(host: string): boolean {
  if (host.length > 253 || host !== host.trim()) return false;
  if (/^\d+[.\d]*$/.test(host)) return ipv4(host) !== null;
  if (host.includes(":")) {
    try {
      return new URL("http://[" + host + "]/").hostname.startsWith("[");
    } catch {
      return false;
    }
  }
  return host
    .split(".")
    .every((label) =>
      /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(label),
    );
}
