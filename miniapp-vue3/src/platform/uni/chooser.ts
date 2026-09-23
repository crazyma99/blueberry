// T8 S3 选图适配（旧端 aiTryOn:437-453 `uni.chooseImage`）。
// 参数逐字：count 1／sizeType ['compressed']／sourceType ['album','camera']。
// 容器安全：无 uni.chooseImage（测试/异常容器）或用户取消 → 返回 null，不抛。
export interface PickedPhoto {
  path: string;
  /** 文件字节数；容器未提供时为 0（大小上限判定由调用方处理） */
  size: number;
}

export interface PhotoChooserPort {
  choose(): Promise<PickedPhoto | null>;
}

interface UniChooseRes {
  tempFilePaths?: string[];
  tempFiles?: Array<{ size?: number }>;
}

/** 取容器 API：**优先 `globalThis.uni`（测试桩/H5），再回落裸 `uni`**（mp 产物由编译器改写）。
 *  2026-09-23 统一口径（同 `album-save.uniApi()`）：此前 chooser/upload/feedback 只认裸 `uni`，
 *  在「先有桩、后无裸标识符」或编译器改写差异的环境下会静默降级（选图/上传直接判为容器不支持）。 */
function uniApi<T>(): T | undefined {
  const injected = (globalThis as { uni?: T }).uni;
  if (injected != null) return injected;
  return typeof uni !== "undefined" ? (uni as unknown as T) : undefined;
}

export function createUniPhotoChooser(): PhotoChooserPort {
  return {
    choose(): Promise<PickedPhoto | null> {
      return new Promise((resolve) => {
        const u = uniApi<{ chooseImage?: (o: Record<string, unknown>) => void }>();
        if (typeof u?.chooseImage !== "function") {
          resolve(null);
          return;
        }
        try {
          // 窄化调用：@dcloudio/types 对 chooseImage 的 options/回调签名更严（与容器实参不一致），
          // 且各端 res 形态不完全相同 ⇒ 与 transport/upload 适配同口径，按 Record 收窄后自行解析。
          const api = u as unknown as {
            chooseImage: (options: Record<string, unknown>) => void;
          };
          api.chooseImage({
            count: 1,
            sizeType: ["compressed"],
            sourceType: ["album", "camera"],
            success: (res: UniChooseRes) => {
              const path = Array.isArray(res?.tempFilePaths) ? res.tempFilePaths[0] : undefined;
              if (typeof path !== "string" || path === "") {
                resolve(null);
                return;
              }
              const rawSize = Array.isArray(res?.tempFiles) ? res.tempFiles[0]?.size : undefined;
              resolve({ path, size: typeof rawSize === "number" ? rawSize : 0 });
            },
            fail: () => resolve(null), // 用户取消/容器失败一律 null（调用方静默）
          });
        } catch {
          resolve(null);
        }
      });
    },
  };
}
