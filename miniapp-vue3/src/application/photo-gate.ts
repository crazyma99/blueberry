// AI 试衣「上传照片质量拦截」（后端 `code=4002`）的**前端契约单一事实源**。
//
// 来源：后端契约 `lanmei-backend-golang` → `docs/api-tryon-photo-gate.md` v1.0（2026-09-23，分支
// `dev-dtw-AI链路(拦截图片提示优化)`＝`staging`，合并 `d444e98`）。要点：
//  · 仅 `POST /api/aiface/tasks`；HTTP 恒 200；业务码 `4002` = 质量拦截；`data.check_code` 只有下列 4 种；
//  · **拦截发生在扣次之前 ⇒ 不扣次数、不扣费**（前端不得出现「已退次」类文案/逻辑）；
//  · 后端 **fail-open**（判定服务异常/开关关闭则放行）⇒ 前端不得把「未拦截」当作「必合格」；
//  · 前端须对**未知码兜底**（主人 2026-09-23 指定兜底文案：「换一张照片试试吧」）。

/** 后端 `check_code` 枚举（契约锁死 4 种；未知一律折到 `"unknown"`） */
export type PhotoGateCheckCode = "no_face" | "multi_face" | "face_too_small" | "side_face";

/** 弹层文案与示例图：`rejectAsset` 为 `null` 表示**无对应反例图**（未知码只展示正例） */
export interface PhotoGateCopy {
  title: string;
  text: string;
  rejectAsset: string | null;
}

// 资产走**打包器引用**（`src/assets/**` 由 Vite/uni 按「谁 import 才打谁」处理）：
// 2026-09-23 自检发现——放在 `src/static/**` 会被**无差别拷贝到所有平台**（抖音包里白塞 157KB 死资源，因 AI 六页仅微信注册）。
import acceptNormalAsset from "../assets/quality-gate/accept_normal.jpg";
import rejectFaceTooSmallAsset from "../assets/quality-gate/reject_face_too_small.jpg";
import rejectMultiFaceAsset from "../assets/quality-gate/reject_multi_face.jpg";
import rejectNoFaceAsset from "../assets/quality-gate/reject_no_face.jpg";
import rejectSideFaceAsset from "../assets/quality-gate/reject_side_face.jpg";

/** ✓ 正例图（所有码共用；与反例并排构成「正反例对比」） */
export const PHOTO_GATE_ACCEPT_ASSET = acceptNormalAsset;

/** 4 码 + unknown 的文案/反例图（文案基线取自后端契约文档，`unknown` 按主人指定） */
export const PHOTO_GATE_COPY: Record<PhotoGateCheckCode | "unknown", PhotoGateCopy> = {
  no_face: {
    title: "未检测到清晰人脸",
    text: "未检测到人脸，请上传单人正面照，可参考示例图",
    rejectAsset: rejectNoFaceAsset,
  },
  multi_face: {
    title: "检测到多张人脸",
    text: "请上传单人照片，避免合照",
    rejectAsset: rejectMultiFaceAsset,
  },
  face_too_small: {
    title: "人脸太小",
    text: "请靠近一些或裁剪后上传",
    rejectAsset: rejectFaceTooSmallAsset,
  },
  side_face: {
    title: "请正对镜头",
    text: "侧脸会影响生成效果，请正对镜头再拍一张",
    rejectAsset: rejectSideFaceAsset,
  },
  unknown: {
    title: "照片未通过检测",
    text: "换一张照片试试吧", // ← 主人 2026-09-23 指定（未知码兜底）
    rejectAsset: null,
  },
};

/** 任意服务端返回值 → 已知识别码或 `"unknown"`（**永不抛**） */
export function resolvePhotoGateCode(raw: unknown): PhotoGateCheckCode | "unknown" {
  return raw === "no_face" || raw === "multi_face" || raw === "face_too_small" || raw === "side_face" ? raw : "unknown";
}

/** 从业务错误体（`data.check_code`）解析出识别码；结构异常一律 `"unknown"` */
export function readCheckCodeFromBusinessData(data: unknown): PhotoGateCheckCode | "unknown" {
  if (data != null && typeof data === "object" && "check_code" in data) {
    return resolvePhotoGateCode((data as { check_code?: unknown }).check_code);
  }
  return "unknown";
}

/** 解析文案/示例图（未知码 → 兜底文案 + 无反例图） */
export function resolvePhotoGateCopy(rawCode: unknown): PhotoGateCopy {
  return PHOTO_GATE_COPY[resolvePhotoGateCode(rawCode)];
}

/** 端侧（VK/分辨率/模糊）拦截结果的呈现映射：尽量复用后端 4 码的示例图与文案，无对应码时用端侧原话覆盖正文 */
export interface EndSideRejection {
  code: PhotoGateCheckCode | "unknown";
  title: string;
  text: string;
}

/** 端侧 reason（`domain/photo-check.ts` 逐字文案）→ 弹层呈现（**编码只用于挑反例图**，文案以端侧原话为准，避免指错方向） */
export function resolveEndSideRejection(reason: string): EndSideRejection {
  const r = typeof reason === "string" ? reason : "";
  if (r.includes("未检测到人脸")) return { code: "no_face", title: PHOTO_GATE_COPY.no_face.title, text: PHOTO_GATE_COPY.no_face.text };
  if (r.includes("多张人脸")) return { code: "multi_face", title: PHOTO_GATE_COPY.multi_face.title, text: PHOTO_GATE_COPY.multi_face.text };
  if (r.includes("占比太小")) return { code: "face_too_small", title: PHOTO_GATE_COPY.face_too_small.title, text: PHOTO_GATE_COPY.face_too_small.text };
  // 分辨率过低 / 模糊 / 其它：后端 4 码无对应 ⇒ 通用标题 + **保留端侧原话**（比兜底文案更具体）
  return { code: "unknown", title: PHOTO_GATE_COPY.unknown.title, text: r !== "" ? r : PHOTO_GATE_COPY.unknown.text };
}
