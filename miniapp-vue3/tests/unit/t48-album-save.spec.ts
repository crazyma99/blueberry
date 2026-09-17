// G2 🟡①：相册保存端口测试（下沉自 aiTryOnResult 内联 ~90 行）——授权三态、下载成败、保存成败、容器 fail-closed。
import { beforeEach, describe, expect, it } from "vitest";
import { createAlbumSaver } from "../../src/platform/uni/album-save";

beforeEach(() => {
  delete (globalThis as { uni?: unknown }).uni;
});

describe("platform/uni/album-save（G2 🟡① 相册管线）", () => {
  it("⭐容器缺 API → fail-closed：授权 false、下载/保存 reject（**不假装成功**）", async () => {
    const s = createAlbumSaver();
    await expect(s.ensureAuth()).resolves.toBe(false);
    await expect(s.downloadToTempFile("https://x/a.png")).rejects.toThrow("downloadFile unavailable");
    await expect(s.saveImageToPhotosAlbum("/tmp/a.png")).rejects.toThrow("saveImageToPhotosAlbum unavailable");
  });

  it("授权成功 → true；请求 scope 为 scope.writePhotosAlbum", async () => {
    const seen: Array<Record<string, unknown>> = [];
    (globalThis as { uni?: unknown }).uni = {
      authorize: (o: Record<string, unknown>) => {
        seen.push(o);
        (o.success as () => void)();
      },
    };
    await expect(createAlbumSaver().ensureAuth()).resolves.toBe(true);
    expect(seen[0].scope).toBe("scope.writePhotosAlbum");
  });

  it("授权被拒 + 弹窗取消 → false；弹窗确认且 openSetting 已授权 → true；openSetting 未授权 → false", async () => {
    const denyUni = (modalConfirm: boolean, settingGranted: boolean) => {
      (globalThis as { uni?: unknown }).uni = {
        authorize: (o: Record<string, unknown>) => (o.fail as () => void)(),
        showModal: (o: Record<string, unknown>) => {
          const seen = o as { title?: string; content?: string; confirmText?: string; success: (r: unknown) => void };
          expect(seen.title).toBe("提示");
          expect(seen.content).toBe("需要您授权保存图片到相册");
          expect(seen.confirmText).toBe("去设置");
          seen.success({ confirm: modalConfirm });
        },
        openSetting: (o: Record<string, unknown>) => {
          (o.success as (r: unknown) => void)({ authSetting: { "scope.writePhotosAlbum": settingGranted } });
        },
      };
    };
    denyUni(false, true);
    await expect(createAlbumSaver().ensureAuth()).resolves.toBe(false); // 取消弹窗
    denyUni(true, true);
    await expect(createAlbumSaver().ensureAuth()).resolves.toBe(true); // 去设置并已授权
    denyUni(true, false);
    await expect(createAlbumSaver().ensureAuth()).resolves.toBe(false); // 设置页仍未授权
  });

  it("下载：200+tempFilePath → 路径；非 200 → reject；fail → reject", async () => {
    const mk = (res: unknown, mode: "ok" | "fail") => {
      (globalThis as { uni?: unknown }).uni = {
        downloadFile: (o: Record<string, unknown>) => {
          if (mode === "ok") (o.success as (r: unknown) => void)(res);
          else (o.fail as (e: unknown) => void)(new Error("net"));
        },
      };
    };
    mk({ statusCode: 200, tempFilePath: "/tmp/x.png" }, "ok");
    await expect(createAlbumSaver().downloadToTempFile("u")).resolves.toBe("/tmp/x.png");
    mk({ statusCode: 404 }, "ok");
    await expect(createAlbumSaver().downloadToTempFile("u")).rejects.toThrow("下载失败");
    mk(null, "fail");
    await expect(createAlbumSaver().downloadToTempFile("u")).rejects.toThrow("net");
  });

  it("保存：成功 resolve；失败 reject；saveFromUrl 组合下载＋保存（filePath 来自下载结果）", async () => {
    const saved: string[] = [];
    (globalThis as { uni?: unknown }).uni = {
      downloadFile: (o: Record<string, unknown>) => (o.success as (r: unknown) => void)({ statusCode: 200, tempFilePath: "/tmp/sig.png" }),
      saveImageToPhotosAlbum: (o: Record<string, unknown>) => {
        saved.push(String(o.filePath));
        (o.success as () => void)();
      },
    };
    const s = createAlbumSaver();
    await expect(s.saveFromUrl("https://x/sig")).resolves.toBeUndefined();
    expect(saved).toEqual(["/tmp/sig.png"]);

    (globalThis as { uni?: unknown }).uni = {
      saveImageToPhotosAlbum: (o: Record<string, unknown>) => (o.fail as (e: unknown) => void)(new Error("save denied")),
    };
    await expect(createAlbumSaver().saveImageToPhotosAlbum("/tmp/a.png")).rejects.toThrow("save denied");
  });
});
