// 大图预览适配（商家端图片网格点图看大图 · issue #14 UX P0）。
// 平台 API 只许落在 src/platform/**（SPEC §二①）：商家页面经本适配器预览，不直调 uni.previewImage。
// `uni.previewImage` 自带「长按弹出菜单（发送给朋友/保存图片/收藏）」，满足「长按保存」，无需另申请相册权限（保存由微信菜单处理）。
// 通用适配器（名称不含业务词）：urls 为**已处理好的最终 URL 列表**（调用方负责 CDN 域/预览宽度）；current 为当前项下标。
// 容器安全：空列表 / 无 uni / 无 previewImage ⇒ 返回 false，不抛；预览被用户关闭属正常；fail 回调返回 false 由调用方给文案。
export interface ImagePreviewPort {
  /** 打开大图预览；返回是否**成功发起**（容器不支持/参数非法 ⇒ false）。`index` 越界会被收敛到 [0, urls.length-1] */
  preview(urls: readonly string[], index: number): Promise<boolean>;
}

export function createUniImagePreview(): ImagePreviewPort {
  return {
    preview(urls: readonly string[], index: number): Promise<boolean> {
      return new Promise((resolve) => {
        const list = urls.filter((u) => typeof u === "string" && u.trim() !== "");
        const api = (typeof globalThis === "undefined" ? undefined : (globalThis as { uni?: { previewImage?: (o: Record<string, unknown>) => void } }).uni) ?? (typeof uni !== "undefined" ? (uni as unknown as { previewImage?: (o: Record<string, unknown>) => void }) : undefined);
        if (list.length === 0 || typeof api?.previewImage !== "function") {
          resolve(false);
          return;
        }
        // 下标按「过滤空串之前」的位置给；过滤后需把 current 对到同一张图
        const want = urls[Math.min(Math.max(0, Math.trunc(Number.isFinite(index) ? index : 0)), urls.length - 1)];
        const cur = list.includes(want) ? want : list[0];
        try {
          api.previewImage({
            urls: list,
            current: cur,
            success: () => resolve(true),
            fail: () => resolve(false),
          });
        } catch {
          resolve(false);
        }
      });
    },
  };
}
