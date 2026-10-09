import type { ConversionReport, ImportFormat, Target } from "../parsers/model";
export type Protocol = "http" | "https" | "socks4" | "socks5";
export type Mode = "direct" | "global" | "smart";
export interface ProxyServer {
  id: string;
  name: string;
  host: string;
  port: number;
  protocol: Protocol;
}
export type RuleType =
  "DOMAIN" | "DOMAIN-SUFFIX" | "DOMAIN-KEYWORD" | "IP-CIDR" | "MATCH";
export interface Rule {
  id: string;
  type: RuleType;
  value: string;
  action: "DIRECT" | "PROXY" | "REJECT";
  proxyId?: string;
}
export interface Config {
  version: 1;
  revision: number;
  mode: Mode;
  proxies: ProxyServer[];
  selectedId: string;
  defaultId: string;
  rules: Rule[];
  theme: "system" | "light" | "dark";
  subscriptions?: Subscription[];
  blocking?: { enabled: boolean; domains: string[] };
  webRtc?: "browser" | "restrict";
}
export interface Status {
  level: string;
  error?: string;
  updatedAt?: number;
}
export interface ApiResult {
  config?: Config;
  status?: Status;
  error?: string;
  result?: string;
  updates?: Record<string, SubscriptionState>;
  diagnostics?: DiagnosticReport;
  security?: WebRtcState;
}
export interface ProxyPolicyGroup {
  id: string;
  members: string[];
  strategy: "manual" | "failover";
} // future, not active

export interface Subscription {
  id: string;
  name: string;
  url: string;
  format: ImportFormat;
  intervalHours: 0 | 6 | 24;
  defaultTarget: Target;
  mappings: Record<string, Target>;
}
export interface SubscriptionCandidate {
  token: string;
  report: ConversionReport;
  baseRevision: number;
  fingerprint: string;
  fetchedAt: number;
}
export interface SubscriptionState {
  failureReport?: ConversionReport;
  checkedAt?: number;
  lastSuccessAt?: number;
  error?: string;
  pending?: SubscriptionCandidate;
}
export interface WebRtcState {
  permission: boolean;
  value?:
    | "default"
    | "default_public_and_private_interfaces"
    | "default_public_interface_only"
    | "disable_non_proxied_udp";
  level?: string;
  error?: string;
}
export interface DiagnosticCheck {
  name: string;
  status: "ok" | "warning" | "error" | "info";
  detail: string;
}
export interface DiagnosticReport {
  code: string;
  summary: string;
  checks: DiagnosticCheck[];
  httpStatus?: number;
  elapsedMs?: number;
}
