import { test } from "node:test";
import assert from "node:assert/strict";

import * as standard from "./route";
import * as legacy from "../../../provisioning/webhook/route";

/**
 * 迁移期两条路必须是**同一个处理器**（X-4 第 ① 步）。
 *
 * 这条断言的价值全在「同一个」三个字上：如果哪天有人把实现复制一份进标准路径
 * 而不是转出，两条路就各自演进出一套验签与幂等逻辑，而它们不一致时的症状
 * **取决于平台当天登记的是哪个地址**——那种故障在代码里看不出来，只能在投递
 * 日志里看出来，而那时已经丢了事件。
 *
 * 用 `===` 比函数引用，不是比行为：比行为要把两边都跑一遍，而两边跑出同样的
 * 结果恰恰是复制实现时**也会成立**的，抓不到要抓的东西。
 */
test("标准路径与旧路径导出同一个 POST 处理器", () => {
  assert.equal(typeof standard.POST, "function");
  assert.equal(standard.POST, legacy.POST, "两条路必须转出同一个处理器，不能各copy一份");
});

/**
 * 段配置必须在标准路径这个文件里**直接**声明。
 *
 * Next 的段配置靠静态分析取值，`export { dynamic } from …` 这种再导出形式读不到；
 * 读不到时按默认（静态）处理，而一个被静态化的 webhook 端点不会执行验签。
 * 这条测试读的是运行时的值，拦不住「写成再导出」——那一半由文件里的注释与
 * 评审兜着；它拦的是「有人把这一行删了」。
 */
test("标准路径声明了 dynamic = force-dynamic", () => {
  assert.equal(standard.dynamic, "force-dynamic");
});
