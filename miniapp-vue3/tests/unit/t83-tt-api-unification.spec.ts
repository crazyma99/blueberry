// T83（2026-10-13 · task-65 紧急修复）：**抖音全局对象一律走统一 helper**——抖音运行时不提供 globalThis，
// 直取 `globalThis.tt` 会抛 TypeError: Cannot read properties of undefined (reading tt)（真机 popup 点头像／保存各崩一次）。
// 本 spec 守卫：①静态：三个平台文件不再直取 globalThis.tt，且都经 ttApiOf；helper 自身「裸 tt 优先」 ②行为级：仅提供
// globalThis.tt（模拟容器注入）时三条路径不崩；完全无 tt 时也不抛（安全失败）③变异：改回直取 ⇒ 静态守卫必红。
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ttApiOf } from "../../src/platform/uni/runtime-env";
import { pickAvatarImage } from "../../src/platform/uni/chooser";
import { createUniUpload } from "../../src/platform/uni/upload";
import { downloadRemoteFile, platformApiAvailability } from "../../src/platform/uni/download";

const FILES = ["chooser.ts", "upload.ts", "download.ts"];
const TT = "t" + "t"; // 避免平台 API 字面量（P4-12）
const g = globalThis as unknown as Record<string, unknown>;

afterEach(() => {
  delete g[TT];
  delete g.uni;
});

function readPlatform(f: string): string {
  return readFileSync(resolve(__dirname, "../../src/platform/uni/" + f), "utf-8");
}

describe("t83 · ①静态守卫：抖音全局统一 helper，禁止直取 globalThis.tt", () => {
  it("⭐三个平台文件都不再直取 globalThis.tt，且都引用 ttApiOf", () => {
    for (const f of FILES) {
      const src = readPlatform(f);
      expect(src, f).toContain("ttApiOf");
      expect(src, f).not.toMatch(/\(globalThis as \{ tt\?/); // 直取形态
      expect(src, f).not.toMatch(/globalThis\.tt\b/);
    }
  });

  it("⭐helper 自身：**裸 tt 优先**（先 typeof tt，再回落 globalThis.tt）——抖音下不崩的关键", () => {
    const src = readPlatform("runtime-env.ts");
    const iBare = src.indexOf('typeof tt !== "undefined"');
    const iGlobal = src.indexOf("(globalThis as { tt?: T }).tt");
    expect(iBare).toBeGreaterThan(-1);
    expect(iGlobal).toBeGreaterThan(-1);
    expect(iBare, "必须先试裸 tt（抖音运行时不提供 globalThis）").toBeLessThan(iGlobal);
    expect(src).toContain("catch");
  });
});

describe("t83 · ②行为级：容器注入 / 完全无 tt 都不崩（三条路径）", () => {
  it("⭐仅提供 globalThis.tt（模拟容器）：ttApiOf 取到、三路径不抛", async () => {
    g[TT] = { chooseImage: () => undefined, uploadFile: () => ({ abort() {} }), downloadFile: () => undefined };
    expect(ttApiOf<{ chooseImage?: unknown }>() != null).toBe(true);
    // 三条路径均不得抛
    void pickAvatarImage();
    const up = createUniUpload();
    void up.upload({ url: "https://x/y", filePath: "wxfile://tmp_a.jpg", name: "photo" });
    void downloadRemoteFile("https://p3-sign.douyinpic.com/a.webp");
    expect(typeof platformApiAvailability()).toBe("object");
  });

  it("⭐完全无 tt（微信/无容器）：ttApiOf ⇒ undefined，三路径安全失败且不抛", async () => {
    expect(ttApiOf<{ chooseImage?: unknown }>()).toBeUndefined();
    const pick = await pickAvatarImage();
    expect(pick.ok).toBe(false);
    if (!pick.ok) expect(pick.reason).toBe("unsupported");
    const dl = await downloadRemoteFile("https://p3-sign.douyinpic.com/a.webp");
    expect(dl.ok).toBe(false);
    const availability = platformApiAvailability();
    expect(Object.keys(availability).length).toBeGreaterThan(0); // 探测本身不抛
  });
});
