import type { Config } from "../utils/types";
import { RuleBuilder } from "./builder";
import { boundedText, validateInputs } from "./safe";
import type { ConversionReport, ImportFormat, ImportOptions } from "./model";
import { parseShadowrocket } from "./shadowrocket";
import { parseClash } from "./clash";
import { parseXray } from "./xray";
export function detectFormat(text: string): Exclude<ImportFormat, "auto"> {
  text = boundedText(text).trim();
  if (/^\[Rule\]/im.test(text)) return "shadowrocket";
  if (text.startsWith("{") || text.startsWith("[")) return "xray";
  if (/^(rules|rule-providers|proxy-groups)\s*:/m.test(text)) return "clash";
  if (
    text
      .split(/\r?\n/)
      .some((s) => s.trim() && !s.trim().startsWith("#") && s.includes(","))
  )
    return "native";
  return "domains";
}
export function convertConfig(
  text: string,
  config: Config,
  options: ImportOptions = { format: "auto" },
): ConversionReport {
  let format: Exclude<ImportFormat, "auto"> =
    options.format === "auto" ? "native" : options.format;
  let detectionError: unknown;
  try {
    if (options.format === "auto") format = detectFormat(text);
  } catch (error) {
    detectionError = error;
  }
  const b = new RuleBuilder({ config, options }, format);
  try {
    if (detectionError) throw detectionError;
    validateInputs(text, options);
    text = boundedText(text);
    if (format === "shadowrocket") parseShadowrocket(text, b);
    else if (format === "clash") parseClash(text, b);
    else if (format === "xray") parseXray(text, b);
    else if (format === "native") {
      text.split(/\r?\n/).forEach((raw, index) => {
        const line = raw.trim();
        if (!line || line.startsWith("#")) return;
        b.csv(line, "line:" + String(index + 1));
      });
    } else if (format === "domains") {
      text.split(/\r?\n/).forEach((raw, i) => {
        const line = raw.trim();
        if (!line || line.startsWith("#")) return;
        if (line.includes("FindProxyForURL") || /[|/@*]/.test(line)) {
          b.issue(
            "line:" + String(i + 1),
            "domain-format",
            "unsupported",
            "PAC、GFWList/Adblock 语法与通配符不支持；仅接受纯域名",
          );
          b.report.droppedRules++;
          return;
        }
        b.add(
          "DOMAIN-SUFFIX",
          line,
          options.defaultTarget ?? "PROXY",
          "line:" + String(i + 1),
        );
      });
    }
  } catch (error) {
    b.issue(
      "$",
      "parse-error",
      "error",
      error instanceof Error ? error.message : "解析失败",
    );
  }
  return b.finish();
}
export { canApplyReport } from "./model";
export type {
  ConversionReport,
  ImportFormat,
  ImportOptions,
  Target,
  RuleAttachment,
} from "./model";
