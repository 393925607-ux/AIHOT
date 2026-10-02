/** Pure validation for the demand Chinese refresh; no database or provider side effects. */
export function isSafeChinese(value: string | null | undefined): boolean {
  const text = value?.trim() ?? "";
  return text.length > 0 && /[\u3400-\u9fff]/.test(text) && !/[A-Za-z]/.test(text);
}

export function needsChineseRefresh(value: string | null | undefined): boolean {
  const text = value?.trim() ?? "";
  return !isSafeChinese(text);
}
