/** Pure validation for the demand Chinese refresh; no database or provider side effects. */
export function isSafeChinese(value: string | null | undefined): boolean {
  const text = value?.trim() ?? "";
  return text.length > 0 && /[\u3400-\u9fff]/.test(text) && !/[A-Za-z]/.test(text);
}

export function needsChineseRefresh(value: string | null | undefined): boolean {
  const text = value?.trim() ?? "";
  return !isSafeChinese(text);
}

const ALLOWED_TERMS = new Set("Windows Computer Use Claude Code Codex ChatGPT Chrome MCP GitHub OpenAI Gemini Qwen Snowflake Hacker News Agent Browser Remote Desktop Android iOS macOS Linux CLI API URL HTTP RPC GPU GB MB OOM Xcode PowerShell Benchmark SOTA GPT SWE Pro".split(" "));

/** Chinese copy may retain exact product/technical names, but not English prose. */
export function isNaturalChinese(value: string | null | undefined): boolean {
  const text = value?.trim() ?? "";
  if (!/[\u3400-\u9fff]/.test(text)) return false;
  const words = text.match(/[A-Za-z][A-Za-z0-9.-]*/g) ?? [];
  return words.every((word) => ALLOWED_TERMS.has(word) || /^\d/.test(word));
}
