// 图片预加载适配（旧端 imageLoader.uts:9-18 `preloadImage` 语义移植）：结果页「进度 100% / 骨架图期间并行预热缩略图」。
// 纪律：容器安全 —— uni／getImageInfo 缺失（测试环境、异常容器）一律 resolve(false)，**不抛、不阻断业务**；
// 与旧端同口径：无论成功或失败都 resolve（成功 true／失败 false），供 Promise.all 不被单张失败打断。
export function preloadImage(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      if (url === "" || typeof uni === "undefined" || typeof uni.getImageInfo !== "function") {
        resolve(false);
        return;
      }
      uni.getImageInfo({
        src: url,
        success: () => resolve(true),
        fail: () => resolve(false),
      });
    } catch {
      resolve(false);
    }
  });
}

/** 批量预加载（旧端 imageLoader.uts:22-27 `preloadImages` 语义）：任一失败不影响整体；超时即返回不阻塞 */
export async function preloadImages(urls: string[], timeout = 5000): Promise<void> {
  if (urls.length === 0) return;
  const preloadPromise = Promise.all(urls.map((u) => preloadImage(u)));
  const timeoutPromise = new Promise<void>((resolve) => setTimeout(resolve, timeout));
  await Promise.race([preloadPromise, timeoutPromise]);
}
