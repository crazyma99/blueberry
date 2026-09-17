// 相册保存平台端口（G2 复核 🟡①：把结果页内联的 ~90 行 wx 管线下沉到 platform 层，页面只表达业务意图）。
// 语义与旧端逐字保持一致（旧 aiTryOnResult :792-822 授权 / 下载 / 保存），**fail-closed**：
// 容器缺 API（测试/非微信运行时）一律「未授权/失败」，**绝不假装保存成功**（也不因此扣费）。
export interface AlbumSaverPort {
  /** 保存前申请相册写入授权：已授权→true；拒绝过→引导「去设置」；最终未授权→false（调用方据此**不扣费**） */
  ensureAuth(): Promise<boolean>;
  /** 用服务端签名 URL 下载到临时文件（超时/非 200 一律 reject，调用方需重新走扣费接口换取新 URL） */
  downloadToTempFile(url: string): Promise<string>;
  /** 写入系统相册 */
  saveImageToPhotosAlbum(filePath: string): Promise<void>;
  /** 组合：下载并保存（保证 hideLoading 由调用方 finally 处理） */
  saveFromUrl(url: string): Promise<void>;
}

interface UniLike {
  authorize?: (o: Record<string, unknown>) => void;
  showModal?: (o: Record<string, unknown>) => void;
  openSetting?: (o: Record<string, unknown>) => void;
  downloadFile?: (o: Record<string, unknown>) => void;
  saveImageToPhotosAlbum?: (o: Record<string, unknown>) => void;
}

function uniApi(): UniLike | undefined {
  return (globalThis as { uni?: UniLike }).uni;
}

export function createAlbumSaver(): AlbumSaverPort {
  async function ensureAuth(): Promise<boolean> {
    const uni = uniApi();
    // 容器缺 authorize（非微信运行时/测试）：fail-closed —— 不扣费、不假装保存成功
    if (uni?.authorize == null) return false;
    const granted = await new Promise<boolean>((resolve) => {
      uni.authorize?.({
        scope: "scope.writePhotosAlbum",
        success: () => resolve(true),
        fail: () => resolve(false),
      });
    });
    if (granted) return true;
    return await new Promise<boolean>((resolve) => {
      const api = uniApi();
      if (api?.showModal == null) {
        resolve(false);
        return;
      }
      api.showModal({
        title: "提示",
        content: "需要您授权保存图片到相册",
        confirmText: "去设置",
        success: (modalRes: unknown) => {
          const confirmed = (modalRes as { confirm?: boolean } | null)?.confirm === true;
          if (!confirmed) {
            resolve(false);
            return;
          }
          if (api.openSetting == null) {
            resolve(false);
            return;
          }
          api.openSetting({
            success: (settingRes: unknown) => {
              const authSetting = (settingRes as { authSetting?: Record<string, unknown> } | null)?.authSetting ?? {};
              resolve(authSetting["scope.writePhotosAlbum"] === true);
            },
            fail: () => resolve(false),
          });
        },
      });
    });
  }

  function downloadToTempFile(url: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const uni = uniApi();
      if (uni?.downloadFile == null) {
        reject(new Error("downloadFile unavailable"));
        return;
      }
      uni.downloadFile({
        url,
        success: (res: unknown) => {
          const r = res as { statusCode?: number; tempFilePath?: string } | null;
          if (r != null && r.statusCode === 200 && r.tempFilePath != null) resolve(r.tempFilePath);
          else reject(new Error("下载失败"));
        },
        fail: (err: unknown) => reject(err),
      });
    });
  }

  function saveImageToPhotosAlbum(filePath: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const uni = uniApi();
      if (uni?.saveImageToPhotosAlbum == null) {
        reject(new Error("saveImageToPhotosAlbum unavailable"));
        return;
      }
      uni.saveImageToPhotosAlbum({
        filePath,
        success: () => resolve(),
        fail: (err: unknown) => reject(err),
      });
    });
  }

  async function saveFromUrl(url: string): Promise<void> {
    const tempFilePath = await downloadToTempFile(url);
    await saveImageToPhotosAlbum(tempFilePath);
  }

  return { ensureAuth, downloadToTempFile, saveImageToPhotosAlbum, saveFromUrl };
}
