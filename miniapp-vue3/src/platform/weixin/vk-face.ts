// T8 S3b-2：微信 VisionKit 静态图人脸检测（旧端 utils/vkFace.uts 99 行忠实移植）。
// 用途：上传质量拦截（photoCheck）与后续分享封面复用。返回全部人脸 anchor（`type===3` 过滤，其余跳过）；
// 不可用/超时/未检出一律 []（**不抛**）。抖音端不注册 AI 页，故本模块仅微信运行时生效（无 wx → 空结果）。
// 实现说明：`wx` 不声明为全局类型，统一经 globalThis 收窄访问（容器安全，见 platform/weixin/capabilities.ts 同口径）。

interface VkAnchor {
  type?: unknown;
  /** 人脸框左上角（归一化 0-1；旧端 faceShareCard 用它算人脸中心裁剪窗） */
  origin?: { x?: unknown; y?: unknown };
  size?: { width?: unknown; height?: unknown };
}
interface VkSession {
  on?: (event: string, cb: (payload: unknown) => void) => void;
  start?: (cb: (err: unknown) => void) => void;
  detectFace?: (options: Record<string, unknown>) => void;
  destroy?: () => void;
}
interface WxVkLike {
  canIUse?: (schema: string) => boolean;
  isVKSupport?: (version: string) => boolean;
  createVKSession?: (options: Record<string, unknown>) => VkSession | null;
}

function wxVk(): WxVkLike | undefined {
  return (globalThis as { wx?: WxVkLike }).wx;
}

/** VK 可用性：canIUse('createVKSession') 且（若存在）isVKSupport('v1') */
export function vkAvailable(): boolean {
  const wx = wxVk();
  if (wx == null) return false;
  let ok = typeof wx.canIUse === "function" ? wx.canIUse("createVKSession") === true : false;
  if (ok && typeof wx.isVKSupport === "function") {
    try {
      ok = wx.isVKSupport("v1") === true;
    } catch {
      ok = false;
    }
  }
  return ok;
}

/** 检测全部人脸；静态图模式一次 detectFace 触发一次 anchors 即结（含 0 张）；超时/异常 → [] */
export function detectFaces(
  frameBuffer: ArrayBuffer,
  width: number,
  height: number,
  timeoutMs = 8000,
): Promise<VkAnchor[]> {
  return new Promise<VkAnchor[]>((resolve) => {
    try {
      const wx = wxVk();
      if (wx == null || !vkAvailable() || typeof wx.createVKSession !== "function") {
        resolve([]);
        return;
      }
      const session = wx.createVKSession({ track: { face: { mode: 2 } }, version: "v1" });
      if (session == null) {
        resolve([]);
        return;
      }
      let settled = false;
      const finish = (faces: VkAnchor[]) => {
        if (settled) return;
        settled = true;
        resolve(faces);
      };
      const handleAnchors = (anchors: unknown) => {
        if (anchors == null || !Array.isArray(anchors)) return;
        const faces: VkAnchor[] = [];
        for (const a of anchors as VkAnchor[]) {
          if (a == null) continue;
          if (a.type != null && a.type !== 3) continue; // 仅人脸 anchor
          faces.push(a);
        }
        finish(faces); // 静态图：一次 detectFace → 一次 updateAnchors
      };
      try {
        session.on?.("updateAnchors", handleAnchors);
      } catch {
        // 忽略：个别基础库无该事件
      }
      try {
        session.on?.("addAnchors", handleAnchors);
      } catch {
        // 同上
      }
      setTimeout(() => {
        if (!settled) {
          try {
            session.destroy?.();
          } catch {
            // 静默
          }
          finish([]);
        }
      }, timeoutMs);
      session.start?.((err: unknown) => {
        if (err != null) {
          finish([]);
          return;
        }
        try {
          session.detectFace?.({ frameBuffer, width, height, scoreThreshold: 0.8, sourceType: 1, modelModel: 1 });
        } catch {
          finish([]);
        }
      });
    } catch {
      resolve([]);
    }
  });
}

/** 面积最大的人脸 anchor；无 → null */
export async function detectLargestFace(
  frameBuffer: ArrayBuffer,
  width: number,
  height: number,
  timeoutMs = 8000,
): Promise<VkAnchor | null> {
  const faces = await detectFaces(frameBuffer, width, height, timeoutMs);
  let best: VkAnchor | null = null;
  let bestArea = 0;
  for (const a of faces) {
    const sw = typeof a?.size?.width === "number" ? (a.size.width as number) : 0;
    const sh = typeof a?.size?.height === "number" ? (a.size.height as number) : 0;
    const area = sw * sh;
    if (area > bestArea) {
      bestArea = area;
      best = a;
    }
  }
  return best;
}
