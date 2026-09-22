// 2026-09-21 主人：「AI试衣列表的 Grid 与相册列表 Grid 样式不一致，要求保持统一（以相册列表 Grid 为标准）；
// 且卡片样式也要以相册列表的卡片为标准做样式对齐」——
// 本 spec 把这条**统一口径**变成可执行断言：三页（相册列表＝标准 / AI 试衣记录 / 我的收藏）的网格·卡片·骨架
// **逐值钉死**（任一页单改或两侧一起改都会红），并锁住两处 CR 必修项（状态层不吞点击、内容容器无横向重复内边距）。
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const albumPage = readFileSync(resolve(root, "src/pages/demoDetail/index.vue"), "utf-8"); // 标准页（相册列表）
const aiPage = readFileSync(resolve(root, "src/pages/aiTryOnHistory/index.vue"), "utf-8"); // 对齐页（AI 试衣记录）
const favPage = readFileSync(resolve(root, "src/pages/favorites/index.vue"), "utf-8"); // 同族第三页（我的收藏）

function styleBlock(src: string): string {
  return src.slice(src.indexOf("<style"), src.lastIndexOf("</style>")).replace(/\/\*[\s\S]*?\*\//g, "");
}

/** 抽出「选择器 → 规范化声明串」（`; ` 分隔、空白归一） */
function rules(src: string, selectors: string[]): Record<string, string> {
  const style = styleBlock(src);
  const out: Record<string, string> = {};
  for (const sel of selectors) {
    const re = new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\{([^}]*)\\}");
    const m = style.match(re);
    if (m != null) {
      out[sel] = m[1]
        .split(";")
        .map((d) => d.trim().replace(/\s+/g, " "))
        .filter((d) => d !== "")
        .join("; ");
    }
  }
  return out;
}

/** 每条共享选择器在样式块中出现的次数（防「追加同名规则盖掉上一条」绕过） */
function ruleCount(src: string, sel: string): number {
  return (styleBlock(src).match(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\{", "g")) ?? []).length;
}

/** ⭐ 标准值（相册列表页当下真值，逐串钉死）：任一页偏移、或两侧一起改，都会红 */
const EXPECT: Record<string, string> = {
  ".album-grid": "padding: 24rpx 24rpx 0; display: flex; flex-direction: row; flex-wrap: wrap; gap: 16rpx",
  ".album-card":
    "width: calc((100% - 16rpx) / 2); box-sizing: border-box; border: 1rpx solid rgba(241, 205, 145, 0.3); border-radius: 14rpx",
  ".album-inner": "width: 100%; height: 460rpx; position: relative; border-radius: 13rpx; overflow: hidden",
  ".album-cover": "width: 100%; height: 100%",
  ".album-mask":
    "position: absolute; width: 100%; height: 100%; top: 0; left: 0; background: linear-gradient(180deg, rgba(0, 0, 0, 0) 55%, rgba(0, 0, 0, 0.45) 75%, rgba(0, 0, 0, 0.85) 100%)",
  ".album-desc": "position: absolute; left: 20rpx; right: 20rpx; bottom: 20rpx; display: flex; flex-direction: column",
  ".album-title":
    "font-size: 26rpx; font-weight: 400; color: #F1CD91; white-space: nowrap; overflow: hidden; text-overflow: ellipsis",
  ".sk-row": "display: flex; flex-direction: row; align-items: center",
  ".sk-grid": "flex-wrap: wrap; margin-top: 20rpx",
  ".sk-photo-item":
    "width: calc(50% - 16rpx); height: 482rpx; margin: 8rpx; border-radius: 8rpx; background: rgba(255, 255, 255, 0.08)",
};
const SHARED = Object.keys(EXPECT);

describe("媒体网格与卡片：AI 试衣记录 ≡ 相册列表（以相册列表为标准）", () => {
  it("⭐标准页（相册列表）自身等于钉死值（治「两侧一起改错」）", () => {
    expect(rules(albumPage, SHARED)).toEqual(EXPECT);
  });

  it("⭐对齐页（AI 试衣记录）同样等于钉死值 ⇒ 与标准逐值一致", () => {
    expect(rules(aiPage, SHARED)).toEqual(EXPECT);
  });

  it("共享选择器在各页「恰好出现一次」（防追加同名规则绕过）", () => {
    for (const sel of SHARED) {
      expect(ruleCount(albumPage, sel)).toBe(1);
      expect(ruleCount(aiPage, sel)).toBe(1);
    }
  });

  it("容器口径对齐：`.sk-wrap` 与标准同值、`.content` 无横向重复内边距（CR 🔴R2）", () => {
    expect(rules(albumPage, [".sk-wrap"])[".sk-wrap"]).toBe("padding: 32rpx");
    expect(rules(aiPage, [".sk-wrap"])[".sk-wrap"]).toBe("padding: 32rpx");
    // `.content`：AI 页与「我的收藏」同值（旧端 8rpx 是 362rpx 老数学的产物 ⇒ 换 calc 公式后必须归零）
    expect(rules(aiPage, [".content"])[".content"]).toBe("padding: 0 0 32rpx");
    expect(rules(favPage, [".content"])[".content"]).toBe("padding: 0 0 32rpx");
  });

  it("AI 记录页已无旧版卡片类名/旧值", () => {
    const style = styleBlock(aiPage);
    expect(style).not.toContain(".photolistContainer");
    expect(style).not.toContain(".photoItem");
    expect(style).not.toContain(".photoName");
    expect(aiPage).not.toContain('class="photoItem"');
    expect(aiPage).not.toContain('class="photolistContainer"');
  });

  it("AI 专属状态层：保留语义与品牌金配色，且**不吞点击**（CR 🔴R1 真机命中测试）", () => {
    expect(aiPage).toContain('class="status-overlay"');
    expect(aiPage).toContain("生成中");
    expect(aiPage).toContain("生成失败");
    const overlay = rules(aiPage, [".status-overlay"])[".status-overlay"];
    expect(overlay).toContain("border-radius: 13rpx"); // 随新卡内圈同心
    expect(overlay).toContain("pointer-events: none"); // 手势穿透到 `.album-mask`（点击面）
    expect(aiPage).toContain('class="album-mask" hover-class="press-dim" @click="handleItemClick(item)"');
    expect(styleBlock(aiPage)).toContain("border: 1rpx solid rgba(241, 205, 145, 0.3)");
    expect(styleBlock(aiPage)).toContain("color: #F1CD91");
  });

  it("次级行排版同族：AI 的 `.album-time` ≡ 相册的 `.like-row`/`.like-count` 口径（10rpx/24rpx/金）", () => {
    const t = rules(aiPage, [".album-time"])[".album-time"];
    expect(t).toContain("margin-top: 10rpx");
    expect(t).toContain("font-size: 24rpx");
    expect(t).toContain("color: #F1CD91");
    expect(rules(albumPage, [".like-row"])[".like-row"]).toContain("margin-top: 10rpx");
    expect(rules(albumPage, [".like-count"])[".like-count"]).toContain("font-size: 24rpx");
  });

  it("两页骨架屏同口径（sk-row sk-grid + 6 灰格）", () => {
    for (const src of [albumPage, aiPage]) {
      expect(src).toContain('class="sk-row sk-grid"');
      expect(src).toContain('v-for="i in 6"');
    }
  });
});

describe("我的收藏页：同族媒体网格亦对齐相册标准（仅类名为旧名）", () => {
  it("框架六条与标准逐值相同；标题含单行省略三件套", () => {
    const std = rules(albumPage, SHARED);
    const fav = rules(favPage, [".photolistContainer", ".photoItem-wrap", ".photoItem", ".photo", ".mask", ".desc"]);
    expect(fav[".photolistContainer"]).toEqual(std[".album-grid"]);
    expect(fav[".photoItem-wrap"]).toEqual(std[".album-card"]);
    expect(fav[".photoItem"]).toEqual(std[".album-inner"]);
    expect(fav[".photo"]).toEqual(std[".album-cover"]);
    expect(fav[".mask"]).toEqual(std[".album-mask"]);
    expect(fav[".desc"]).toEqual(std[".album-desc"]);
    const title = rules(favPage, [".photoName"])[".photoName"];
    expect(title).toContain("font-size: 26rpx");
    expect(title).toContain("font-weight: 400");
    expect(title).toContain("white-space: nowrap");
    expect(title).toContain("overflow: hidden");
    expect(title).toContain("text-overflow: ellipsis");
  });
});
