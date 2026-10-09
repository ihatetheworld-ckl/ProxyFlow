import type { Rule } from "../utils/types";
export type ImportFormat =
  "auto" | "native" | "shadowrocket" | "clash" | "xray" | "domains";
export type Target = "DIRECT" | "PROXY" | "REJECT" | `PROXY:${string}`;
export interface RuleAttachment {
  name: string;
  text: string;
}
export interface ImportOptions {
  format: ImportFormat;
  mappings?: Record<string, Target>;
  attachments?: RuleAttachment[];
  defaultTarget?: Target;
}
export interface ImportIssue {
  path: string;
  code: string;
  severity: "error" | "unsupported" | "warning" | "info";
  message: string;
  acknowledge?: boolean;
}
export interface ConversionReport {
  format: Exclude<ImportFormat, "auto">;
  rules: Rule[];
  issues: ImportIssue[];
  targets: string[];
  inputRules: number;
  droppedRules: number;
  sourcePaths: string[];
}
export interface ImportContext {
  config: import("../utils/types").Config;
  options: ImportOptions;
}
export function canApplyReport(
  report: ConversionReport,
  acknowledge = false,
): boolean {
  return (
    report.rules.length > 0 &&
    !report.issues.some((i) => i.severity === "error") &&
    (acknowledge ||
      !report.issues.some((i) => i.severity === "unsupported" || i.acknowledge))
  );
}
