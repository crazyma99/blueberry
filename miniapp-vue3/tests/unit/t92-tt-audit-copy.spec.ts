// T92（2026-11-02 · task-75 抖音审核 P0/P1）：抖音侧隐藏「服务价格／套餐内容」整块 ＋ 文案改作品向；**微信严格原状**。
// 背景：抖音审核打回（相册详情含服务价格/套餐内容 ⇒ 判摄影类目；我们类目＝工具信息查询）。
// 实现＝构建期 profile 特征位（沿用 servicePromiseTitle/priceFallbackTitle 范式），逻辑层零 #ifdef；恢复＝改位一行＋重构建。
// 唯一可信验收仍有真机/提审一档；本 spec 锁「位取值」「页面接线」「布局收尾规则」「prod 产物 grep 由构建步骤复核」。
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { validateProfile } from "../../scripts/profile-schema.mjs";

const root = resolve(__dirname, "../..");
const rawA = JSON.parse(readFileSync(resolve(root, "tests/fixtures/profiles/A.json"), "utf-8"));
const tt = validateProfile(rawA, { platform: "mp-toutiao", environment: "trial" });
const wx = validateProfile(rawA, { platform: "mp-weixin", environment: "release" });

describe("t92 · ①profile 位：抖音隐藏/作品向；微信严格原状", () => {
  it("⭐抖音：showServicePrice=false；4 个文案位＝作品向；价格/套餐标签位＝空串（产物内不出现这两词）", () => {
    expect(tt.ok).toBe(true);
    const f = tt.profile.features;
    expect(f.showServicePrice).toBe(false);
    expect(f.copySeriesCategory).toBe("作品分类");
    expect(f.copyGalleryTitle).toBe("作品欣赏");
    expect(f.copyGalleryEmpty).toBe("暂无作品");
    expect(f.copySearchPlaceholder).toBe("搜索作品");
    expect(f.copyPriceLabel).toBe("");
    expect(f.copyPackageLabel).toBe("");
  });

  it("⭐微信：showServicePrice=true；文案与标签位＝**原文案**（逐字不变）", () => {
    expect(wx.ok).toBe(true);
    const f = wx.profile.features;
    expect(f.showServicePrice).toBe(true);
    expect(f.copySeriesCategory).toBe("套系与子系分类");
    expect(f.copyGalleryTitle).toBe("客片欣赏");
    expect(f.copyGalleryEmpty).toBe("暂无客片");
    expect(f.copySearchPlaceholder).toBe("搜索客片");
    expect(f.copyPriceLabel).toBe("服务价格：");
    expect(f.copyPackageLabel).toBe("套餐内容：");
  });
});

describe("t92 · ②页面接线：价格块（含骨架）受同一位控制；收藏在隐藏态右对齐；文案位已接入", () => {
  const tpd = readFileSync(resolve(root, "src/pages/targetPhotoDetail/index.vue"), "utf-8");
  const home = readFileSync(resolve(root, "src/pages/index/index.vue"), "utf-8");
  const demo = readFileSync(resolve(root, "src/pages/demoDetail/index.vue"), "utf-8");

  it("⭐价格/套餐块 **与骨架块** 都由 showServicePrice 控制（骨架同源，避免加载跳变）", () => {
    const hits = tpd.match(/v-if="PROFILE\.features\.showServicePrice"/g) ?? [];
    expect(hits.length, "real + skeleton 两处").toBe(2);
  });

  it("⭐隐藏态布局收尾：.collect 绑定 solo 类且该类 margin-left:auto（收藏仍右对齐、无空白块）", () => {
    expect(tpd).toContain(":class=\"{ collectSolo: !PROFILE.features.showServicePrice }\"");
    const css = tpd.slice(tpd.indexOf("<style"));
    expect(css).toContain(".collect--solo");
    expect(css).toMatch(/\.collect--solo\s*\{[\s\S]*?margin-left:\s*auto/);
  });

  it("⭐文案位接入（微信值来自 profile ⇒ 逐字回归；抖音值来自 profile ⇒ 作品向）", () => {
    expect(tpd).toContain("PROFILE.features.copyGalleryTitle");
    expect(home).toContain("PROFILE.features.copyGalleryTitle");
    expect(demo).toContain("PROFILE.features.copySeriesCategory");
    expect(demo).toContain("PROFILE.features.copyGalleryEmpty");
    expect(demo).toContain("PROFILE.features.copySearchPlaceholder");
    expect(tpd).toContain("PROFILE.features.copyPriceLabel");
    expect(tpd).toContain("PROFILE.features.copyPackageLabel");
  });

  it("⭐端侧源码不得再出现这五个词的字面量（注释也算；产物级扫描要求）", () => {
    const words = ["服务价格", "套餐内容", "套系与子系分类", "客片欣赏", "暂无客片"];
    const files = [
      "src/pages/targetPhotoDetail/index.vue",
      "src/pages/index/index.vue",
      "src/pages/demoDetail/index.vue",
      "src/composables/use-home.ts",
    ];
    for (const rel of files) {
      const src = readFileSync(resolve(root, rel), "utf-8");
      for (const w of words) expect(src, rel + " 含 " + w).not.toContain(w);
    }
  });
});
