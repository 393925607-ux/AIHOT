import assert from "node:assert/strict";
import { test } from "node:test";
import { publicText } from "../app/lib/public-text.ts";

test("Demand 中文摘要把内部的‘本人’术语改成读者能理解的‘用户’", () => {
  assert.equal(
    publicText("本人在安卓手机上反复遇到授权循环。", "备用文案"),
    "用户在安卓手机上反复遇到授权循环。",
  );
});

test("缺少中文摘要时继续使用中文 fallback，不回退英文原文", () => {
  assert.equal(publicText("The app cannot pair", "暂未生成中文问题摘要，请查看原文"), "暂未生成中文问题摘要，请查看原文");
});
