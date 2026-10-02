import test from "node:test";
import assert from "node:assert/strict";
import { isSafeChinese, needsChineseRefresh } from "../scripts/demand-zh-safety.ts";

test("中文需求字段只接受没有英文字母的自然中文", () => {
  assert.equal(isSafeChinese("用户在桌面应用中无法继续任务。"), true);
  assert.equal(isSafeChinese("Windows 上无法读取文件"), false);
  assert.equal(needsChineseRefresh("Windows 上无法读取文件"), true);
  assert.equal(needsChineseRefresh("用户在桌面应用中无法继续任务。"), false);
});
