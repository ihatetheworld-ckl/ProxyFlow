import { RuleBuilder } from "./builder";
import { expandRuleSet } from "./ruleSets";
export function parseShadowrocket(text: string, b: RuleBuilder) {
  let section = "";
  text.split(/\r?\n/).forEach((raw, index) => {
    const line = raw.trim();
    if (
      !line ||
      line.startsWith("#") ||
      line.startsWith(";") ||
      line.startsWith("//")
    )
      return;
    const p = "line:" + String(index + 1);
    const heading = line.match(/^\[([^\]]+)\]$/);
    if (heading) {
      section = heading[1].toLowerCase();
      if (section !== "rule") b.ignored("[" + heading[1] + "]");
      return;
    }
    if (section !== "rule") {
      b.ignored(p);
      return;
    }
    const clean = line.replace(/\s+[;#].*$/, "");
    const parts = clean.split(",").map((s) => s.trim());
    if (parts[0].toUpperCase() === "RULE-SET") {
      if (parts.length !== 3) {
        b.issue(p, "ruleset-syntax", "error", "RULE-SET 需要引用和出口");
        return;
      }
      const attachment = b.context.options.attachments?.find(
        (f) => f.name === parts[1],
      );
      if (!attachment) {
        b.issue(
          p,
          "remote-ruleset",
          "unsupported",
          "规则集未提供本地附件；不会自动下载远程 URL",
        );
        b.report.droppedRules++;
        return;
      }
      expandRuleSet(
        b,
        attachment.text,
        "classical",
        parts[2],
        p + ".attachment",
      );
      return;
    }
    b.csv(clean, p);
  });
}
