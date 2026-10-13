// T81（2026-10-13 · task-61）：弹窗展示必须**预览优先**（否则刚选完头像弹窗占位）。
// 真机三步定位：①选/上传后弹窗不展示 ②保存后「我的」正常 ③重开弹窗又有 ⇒ 根因＝弹窗展示只走「落库值通道」，
// 刚选到的**本地临时路径**被白名单判空 ⇒ 占位（上一轮「预览≠落库值」只做了一半：把预览也清了）。
// 本 spec 守卫：①优先级＝**预览（原样，不套白名单）> 落库值（白名单）> 占位** ②**读侧兜底不得回退**：
// 已落库脏值（wxfile://…／http://tmp/…）仍必须占位 ③三页接线：选中即写预览、成功/失败/关闭清预览。
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import {
  AVATAR_PLACEHOLDER,
  resolveAvatarDisplay,
  sanitizeAvatarUrl,
} from "../../src/domain/avatar-url";
import ProfilePopup from "../../src/components/ProfilePopup/ProfilePopup.vue";

const LOCAL = "wxfile://tmp_0123456789abcdef.jpg";
const TMP_HTTP = "http://tmp/40RmwKVUPTmq6b4fa7b3186161f101e093239a264d77.jpeg";
const CDN = "https://www.lanmei66.cloud/aiface/staging/6/uploads/ddf3a559-1.jpg";
const PAGES = ["pages/mine/index.vue", "pages/aiTryOn/index.vue", "pages/aiRecommend/index.vue"];

function mountPopup(props: Record<string, unknown>) {
  return mount(ProfilePopup, {
    props,
    global: { stubs: { BasePopup: { template: "<div><slot /></div>" } } },
  });
}

describe("t81 · ①展示优先级：预览（原样）> 落库值（白名单）> 占位", () => {
  it("⭐刚选到的本地路径走**预览**入参 ⇒ 原样渲染（不再被判脏占位）", () => {
    expect(resolveAvatarDisplay({ preview: LOCAL, persisted: "" })).toBe(LOCAL);
    expect(resolveAvatarDisplay({ preview: TMP_HTTP, persisted: CDN })).toBe(TMP_HTTP); // 预览优先
  });

  it("⭐无预览时才看落库值；落库值是脏值 ⇒ **必须占位**（读侧兜底不得回退）", () => {
    expect(resolveAvatarDisplay({ persisted: CDN })).toBe(CDN);
    expect(resolveAvatarDisplay({ persisted: LOCAL })).toBe(AVATAR_PLACEHOLDER);
    expect(resolveAvatarDisplay({ persisted: TMP_HTTP })).toBe(AVATAR_PLACEHOLDER);
    expect(resolveAvatarDisplay({ persisted: "" })).toBe(AVATAR_PLACEHOLDER);
    expect(resolveAvatarDisplay({ preview: "   ", persisted: CDN })).toBe(CDN); // 空白预览视为无
  });

  it("⭐组件级：预览入参驱动 <image src>（预览优先、脏落库值占位）", () => {
    const w1 = mountPopup({ avatarUrl: "", previewAvatar: LOCAL, nickname: "n" });
    expect(w1.find("image.avatar-img").attributes("src")).toBe(LOCAL);
    const w2 = mountPopup({ avatarUrl: LOCAL, previewAvatar: "", nickname: "n" });
    expect(w2.find("image.avatar-img").attributes("src")).toBe(AVATAR_PLACEHOLDER);
    const w3 = mountPopup({ avatarUrl: CDN, previewAvatar: "", nickname: "n" });
    expect(w3.find("image.avatar-img").attributes("src")).toBe(CDN);
  });

  it("契约：sanitizeAvatarUrl 未放宽（脏值仍为空）", () => {
    expect(sanitizeAvatarUrl(LOCAL)).toBe("");
    expect(sanitizeAvatarUrl(TMP_HTTP)).toBe("");
  });
});

describe("t81 · ③三页接线：选中写预览、成功/失败/关闭清预览", () => {
  it("⭐三页都传 :preview-avatar，且选中即写预览", () => {
    for (const p of PAGES) {
      const src = readFileSync(resolve(__dirname, "../../src/" + p), "utf-8");
      expect(src, p).toContain(':preview-avatar="profilePreviewAvatar"');
      expect(src, p).toMatch(/profilePreviewAvatar\.value = (String\(url\)|url)/); // 选中写预览
      expect(src, p).toContain("profilePreviewAvatar.value = \"\""); // 清预览（成功/失败/关闭三处至少一处）
    }
  });

  it("⭐失败分支必须在 toast 之前清预览（回退「上一张有效头像」）", () => {
    for (const p of PAGES) {
      const src = readFileSync(resolve(__dirname, "../../src/" + p), "utf-8");
      const iClear = src.indexOf("profilePreviewAvatar.value = \"\"", src.indexOf("if (!resolved"));
      const iToast = src.indexOf("toast(resolved", src.indexOf("if (!resolved"));
      expect(iClear, p).toBeGreaterThan(-1);
      expect(iToast, p).toBeGreaterThan(-1);
      expect(iClear, p).toBeLessThan(iToast);
    }
  });
});
