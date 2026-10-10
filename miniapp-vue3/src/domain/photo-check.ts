// T8 S3b 照片质量判定（纯领域规则，旧端 utils/photoCheck.uts 逐字移植的可测部分）。
//
// 【2026-10-09 主人拍板 · 方案A：端侧只保留「文件大小 + 模糊度」】
//   ⒜ **摘除端侧 VK 人脸检测三组规则**（未检出／多张／占比过小）。理由（主人 2026-10-09）：后端已做、
//     端侧价值不高、且端侧误拦率高（实测根因：VK 失败被折成「无人脸」、256px 输入检出率低、
//     端侧阈值比后端更严、两端算法不同源）。
//     ⚠️ **但「人脸裁决权交后端」目前只对试衣链路成立**（独立 CR 2026-10-09 实测）：后端质量门
//     `EvaluateUserPhoto`（`lanmei-backend-golang/internal/aiface/upload_gate.go`）全仓
//     **只在试衣建单 `POST /api/aiface/tasks` 被调用**（`internal/aiface/handler_wx.go` 的 `CreateTask`）；
//     `POST /api/aiface/recommend`（`routes.go`）**无任何质量门**。
//     ⇒ 本改动后**「AI 推荐」链路不再有任何端侧/服务端人脸过滤**。该影响面**待主人拍板**：
//     ① 后端为 `/recommend` 补同一个门（最符合「交后端」本意，需后端排期）；
//     ② 推荐链路保留「是否存在人脸」的宽松判断；
//     ③ 主人书面接受该行为变化，并在 `docs/migration/deviations.md` 登记 + 给观察口径。
//   ⒝ **摘除端侧独有的分辨率规则**——后端 4 条规则里没有它 ⇒ 端侧拦下后端会放行的照片，属结构性误拦。
//   ⒞ **文件大小上限（10MB）在页面层校验**（`PHOTO_SIZE_LIMIT_BYTES`），不在本模块。
//   ⚠️ **保留模糊＝主人例外决定，不是原则推论**：按 ⒝ 的同一逻辑（端侧独有 ⇒ 结构性误拦），模糊本也该交后端裁决，
//     但主人 2026-10-09 明确「前端只负责文件大小、模糊度的拦截」⇒ **保留**。后人**不得**依 ⒝ 顺手删掉模糊规则，
//     除非主人另行拍板。（后端 4 条规则只有 face_num=1／单轴线性比 ≥0.10／|yaw|,|pitch|,|roll| ≤30°，无模糊。）
//   ⚠️ **已知风险（如实登记，待标定）**：模糊检测跑在**压缩后**的图上（`COMPRESS_QUALITY_LADDER = [0.8,0.7,0.6,0.5]`、
//     长边 ≤1080px），重编码本身会拉低拉普拉斯方差 ⇒ 若 `PHOTO_BLUR_THRESHOLD` 当初不是按「压缩后」口径标定，
//     可能把清晰照片判为模糊。收紧/放宽阈值前**必须先用真机语料标定**（主人侧语料目录 `~/文档/face-quality-api/cases/`
//     是**其它机器**上的路径，别处不一定存在），勿凭感觉拍数字。
//
// 后端契约出处：`internal/aiface/upload_gate.go`（分支 `dev-dtw-AI链路(拦截图片提示优化)`，合并提交 `d444e98`，
//   **main 分支尚未合并**）；`configs/config-staging.yaml` 的 `aiface.tryon_filter.enabled=true`、比值 0.10、角度 30°。
//
// 失败策略 fail-open（旧端 :138-141）：检测环节自身异常一律放行（由平台层 catch 后返回 ok:true）。

export const PHOTO_BLUR_THRESHOLD = 100;

export interface PhotoCheckResult {
  ok: boolean;
  reason: string;
}

/** 降采样尺寸（旧端 :86-88）：最长边压到 ≤256px，最短 64px（小幅图不放大） */
export function downsampleSize(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(1, 256 / Math.max(width, height));
  return {
    width: Math.max(64, Math.round(width * scale)),
    height: Math.max(64, Math.round(height * scale)),
  };
}

/** RGBA → 灰度（旧端 :96-101 系数：0.299/0.587/0.114，ITU-R BT.601） */
export function toGrayscale(rgba: ArrayLike<number>, pixelCount: number): number[] {
  const gray: number[] = [];
  for (let i = 0; i < pixelCount; i++) {
    const r = rgba[i * 4] ?? 0;
    const g = rgba[i * 4 + 1] ?? 0;
    const b = rgba[i * 4 + 2] ?? 0;
    gray.push(0.299 * r + 0.587 * g + 0.114 * b);
  }
  return gray;
}

/** 灰度图拉普拉斯方差（旧端 :45-62 逐字）：方差小＝边缘弱＝模糊 */
export function laplacianVariance(gray: number[], w: number, h: number): number {
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lap = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - w] - gray[i + w];
      sum += lap;
      sumSq += lap * lap;
      n++;
    }
  }
  if (n === 0) return 0;
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

/**
 * 判定（2026-10-09 方案A 后**唯一**规则）：
 * - `variance == null`（未测/无 canvas）或**非有限值**（NaN/Infinity，防异常输入走成硬拦）→ 跳过，放行
 * - `variance < PHOTO_BLUR_THRESHOLD` → 模糊（硬拦，文案为端侧原话，弹层按此渲染）
 * - 其余 → 放行
 *
 * 已摘除（2026-10-09 主人拍板，人脸交后端、分辨率交页面层；影响面见文件头注 ⒜）：
 * - 宽高任一 < 480 → 分辨率过低
 * - `faceCount` 0／>1、`faceArea` < 0.02 → 人脸组三组规则
 */
export function evaluatePhotoCheck(input: { variance: number | null }): PhotoCheckResult {
  const variance = input.variance;
  // 防御（独立 CR R2）：非有限值视为「未测」⇒ 放行；不得因异常输入走成「模糊」硬拦
  if (variance == null || !Number.isFinite(variance)) {
    return { ok: true, reason: "" };
  }
  if (variance < PHOTO_BLUR_THRESHOLD) {
    return { ok: false, reason: "照片有点模糊，请重新拍摄清晰的照片" };
  }
  return { ok: true, reason: "" };
}
