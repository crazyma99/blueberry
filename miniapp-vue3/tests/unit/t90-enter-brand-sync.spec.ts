// T90（2026-10-19 · task-71 扫码切换商户 P0）：**统一编排** syncBrandFromEnterOptions 的行为锁。
// 结构（Lead 要求）：**App 级 onShow 统一消费进入参数**（任何落地页热启动都生效）＋ 页面级 onShow 按上下文刷新
// （index.vue / priceHomePage 既有品牌基线检测负责骨架重现与重载）⇒ 两处共用本函数，避免双份逻辑。
// 三个变异靶点：①去掉 onShow 参数消费 ②去掉 bumpScope ③去掉「相同/无参数 ⇒ 零动作」防抖。
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { syncBrandFromEnterOptions } from "../../src/application/enter-brand-sync";
import { isBrandCodeShape } from "../../src/domain/brand-code";
import { __resetEnterBrandConsumption } from "../../src/application/enter-brand-sync";

const root = resolve(__dirname, "../..");

function harness(opts: { stored: string; enter?: { scene: string; queryBrandId: string } }) {
  let stored = opts.stored;
  const calls: string[] = [];
  const deps = {
    readEnterOptions: () => opts.enter ?? { scene: "", queryBrandId: "" },
    loadBrandId: () => (stored === "" ? null : stored),
    saveBrandId: (id: string) => {
      calls.push("save:" + id);
      // 与生产同口径：**形态即准入**（isBrandCodeShape，允许大写/数字/下划线），不按名单拦
      if (isBrandCodeShape(id)) stored = id;
    },
    bumpScope: () => calls.push("bump"),
    onChanged: (b: string) => calls.push("changed:" + b),
  };
  return { deps, calls, current: () => stored, setStored: (v: string) => void (stored = v) };
}

describe("t90 · ⑤⭐粘滞进参不得覆盖「用户手选品牌」（2026-10-19 task-74 必修1）", () => {
  it("⭐扫 A 消费一次 → 品牌馆手选 B → 回前台（容器仍返回 scene=A）⇒ 保持 B、不 bumpScope、不重载", () => {
    __resetEnterBrandConsumption();
    const h = harness({ stored: "lanmei", enter: { scene: "brand-a", queryBrandId: "" } });
    expect(syncBrandFromEnterOptions(h.deps).changed).toBe(true); // 扫 A 生效
    h.setStored("brand-b"); // 模拟品牌馆手选 B（brandHub:126）
    h.calls.length = 0;
    const r = syncBrandFromEnterOptions(h.deps); // 回前台：**同一份粘滞进参**
    expect(r.changed).toBe(false); // 幂等：不再消费同一摘要
    expect(r.brandId).toBe("brand-b");
    expect(h.current(), "手选 B 不得被打回 A").toBe("brand-b");
    expect(h.calls, "不得 bumpScope/不得触发重载回调").toEqual([]);
  });

  it("⭐进参真变化（A→C）⇒ 正常切换；且变化后新摘要只消费一次", () => {
    __resetEnterBrandConsumption();
    const h = harness({ stored: "lanmei", enter: { scene: "brand-a", queryBrandId: "" } });
    void syncBrandFromEnterOptions(h.deps);
    h.calls.length = 0;
    h.deps.readEnterOptions = () => ({ scene: "brand-c", queryBrandId: "" });
    const r = syncBrandFromEnterOptions(h.deps);
    expect(r).toEqual({ changed: true, brandId: "brand-c", source: "scene" });
    expect(h.current()).toBe("brand-c");
    h.calls.length = 0;
    expect(syncBrandFromEnterOptions(h.deps).changed).toBe(false); // 同摘要第二次 ⇒ 零动作
    expect(h.calls).toEqual([]);
  });

  it("⭐无进参（普通回前台）不受幂等影响：仍零动作、无需摘要", () => {
    __resetEnterBrandConsumption();
    const h = harness({ stored: "lanmei" });
    expect(syncBrandFromEnterOptions(h.deps)).toEqual({ changed: false, brandId: "lanmei", source: "stored" });
    expect(h.calls).toEqual([]);
  });
});

describe("t90 · ①扫码/卡片参数变化 ⇒ 写上下文 + bumpScope + onChanged（热启动修复核心）", () => {
  it("⭐扫 A 后再扫 B（记忆=A、本次=B）⇒ 切到 B 并 bumpScope；来源＝scene", () => {
    const h = harness({ stored: "lanmei", enter: { scene: "chayu", queryBrandId: "" } });
    const r = syncBrandFromEnterOptions(h.deps);
    expect(r).toEqual({ changed: true, brandId: "chayu", source: "scene" });
    expect(h.calls).toEqual(["save:chayu", "bump", "changed:chayu"]);
    expect(h.current()).toBe("chayu");
  });

  it("⭐分享卡片 ?brandId= 热启动同覆盖（无 scene 时走 query 分支）", () => {
    const h = harness({ stored: "lanmei", enter: { scene: "", queryBrandId: "huahua" } });
    const r = syncBrandFromEnterOptions(h.deps);
    expect(r).toEqual({ changed: true, brandId: "huahua", source: "query" });
    expect(h.calls).toEqual(["save:huahua", "bump", "changed:huahua"]);
  });
});

describe("t90 · ②防抖：相同 / 无参数 一律零动作（不得每次回前台都重载）", () => {
  it("⭐再扫同一个商户 ⇒ 不写、不 bump、不回调", () => {
    const h = harness({ stored: "lanmei", enter: { scene: "lanmei", queryBrandId: "" } });
    const r = syncBrandFromEnterOptions(h.deps);
    expect(r.changed).toBe(false);
    expect(h.calls).toEqual([]);
  });

  it("⭐无任何进入参数（普通回前台）⇒ 零动作，即使有记忆值", () => {
    const h = harness({ stored: "lanmei" });
    const r = syncBrandFromEnterOptions(h.deps);
    expect(r).toEqual({ changed: false, brandId: "lanmei", source: "stored" });
    expect(h.calls).toEqual([]);
  });

  it("⭐无参数且无记忆 ⇒ source=none、零动作（不写空值）", () => {
    const h = harness({ stored: "" });
    const r = syncBrandFromEnterOptions(h.deps);
    expect(r).toEqual({ changed: false, brandId: "", source: "none" });
    expect(h.calls).toEqual([]);
  });
});

import { describe as d2 } from "vitest";

d2("t90 · ④App 级接线（Lead 要求：App onShow 统一消费，任何落地页热启动都生效）", () => {
  it("⭐App.vue onShow 内调用 syncBrandOnAppShow()（内部走编排器 + 平台读取 + 版本化存储）", () => {
    const app = readFileSync(resolve(root, "src/App.vue"), "utf-8");
    const onShow = app.slice(app.indexOf("onShow(() =>"), app.indexOf("onHide(() =>"));
    expect(onShow).toContain("syncBrandOnAppShow()");
    expect(app).toContain("syncBrandFromEnterOptions(");
    expect(app).toContain("readEnterOptions");
    expect(app).toContain("versioned.loadBrandId()");
    expect(app).toContain("versioned.saveBrandId(");
    // 逻辑层（<script>）零条件编译；<style> 内的 #ifdef 是仓内既有允许范式（字体 @font-face 端差异，已登记）
    const script = app.slice(0, app.indexOf("</script>"));
    expect(script).not.toMatch(/#(ifdef|ifndef)/);
  });
});

describe("t90 · ③脏值/白名单：非法编码被剔除 ⇒ 保持原品牌且不 bumpScope（不误重载）", () => {
  it("⭐scene 形态非法（被 saveBrandId 拒）⇒ 上下文不变、零 bump；⭐纯数字形态合法⇒切换（后端回落兜底）", () => {
    const h = harness({ stored: "lanmei", enter: { scene: "lan mei", queryBrandId: "" } }); // 含空格＝形态非法
    const r = syncBrandFromEnterOptions(h.deps);
    expect(r.changed).toBe(false);
    expect(r.brandId).toBe("lanmei");
    expect(h.calls).toEqual(["save:lan mei"]); // 尝试写入但被拒绝 ⇒ 无 bump、无 changed
    // 纯数字（历史数字脏值形态）在新口径下**形态合法 ⇒ 接受并切换**，由后端回落兜底
    const d = harness({ stored: "lanmei", enter: { scene: "74", queryBrandId: "" } });
    expect(syncBrandFromEnterOptions(d.deps)).toEqual({ changed: true, brandId: "74", source: "scene" });
    expect(h.current()).toBe("lanmei");
  });
});
