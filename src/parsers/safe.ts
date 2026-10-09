import { parseDocument } from "yaml";
import { MAX_IMPORT_BYTES } from "./native";
import type { ImportOptions } from "./model";
export function boundedText(text: string): string {
  if (new TextEncoder().encode(text).length > MAX_IMPORT_BYTES)
    throw new Error("每个文件最多 256 KiB");
  return text.replace(/^\uFEFF/, "");
}
export function validateInputs(text: string, options: ImportOptions) {
  boundedText(text);
  const files = options.attachments ?? [];
  if (files.length > 16) throw new Error("最多 16 个规则集附件");
  const names = new Set<string>();
  let total = new TextEncoder().encode(text).length;
  for (const f of files) {
    if (!f.name || f.name.length > 200 || names.has(f.name))
      throw new Error("规则集附件名称无效或重复");
    names.add(f.name);
    boundedText(f.text);
    total += new TextEncoder().encode(f.text).length;
  }
  if (total > 1024 * 1024) throw new Error("配置与附件总计最多 1 MiB");
}
export function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
function structure(value: unknown, depth = 0, count = { n: 0 }): void {
  if (++count.n > 20000 || depth > 32)
    throw new Error("配置结构超过节点数量或深度限制");
  if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (
        key.length > 200 ||
        ["__proto__", "prototype", "constructor"].includes(key)
      )
        throw new Error("配置含禁止的对象键");
      structure(child, depth + 1, count);
    }
  }
}
export function json(text: string, maxBytes = MAX_IMPORT_BYTES): unknown {
  if (new TextEncoder().encode(text).length > maxBytes)
    throw new Error("JSON 超过体积限制");
  let value: unknown;
  try {
    value = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    throw new Error("JSON 语法错误");
  }
  structure(value);
  return value;
}
export function yaml(text: string): unknown {
  const doc = parseDocument(boundedText(text), {
    uniqueKeys: true,
    merge: false,
    strict: true,
  });
  if (doc.errors.length || doc.warnings.length)
    throw new Error("YAML 语法、重复键或标签不受支持");
  let value: unknown;
  try {
    value = doc.toJS({ maxAliasCount: 0 });
  } catch {
    throw new Error("不支持 YAML 别名或递归引用");
  }
  structure(value);
  return value;
}
