// 商家端相册上传依赖装配（issue #14 · M2）：把平台适配器（选图/压缩/上传）与商家口径常量接在一起，页面只拿现成的端口对象。
// 页面不直接 new 任何 platform 适配器（便于测试替换，也让「商家专属常量」只在这一处注入）。
import { createUniUpload } from "../../platform/uni/upload";
import { createUniMediaPicker, type MediaPickerPort } from "../../platform/uni/media-picker";
import { createWeixinImageCompress, type ImageCompressPort } from "../../platform/weixin/image-compress";
import type { UploadPort } from "../../ports/upload";
import {
  MERCHANT_COMPRESS_MAX_BYTES,
  MERCHANT_COMPRESS_MAX_LONG_EDGE,
  MERCHANT_COMPRESS_QUALITIES,
  computeMerchantTargetSize,
  needsCompress,
} from "../domain/merchant-upload";
import { merchantApiBase } from "./merchant-runtime";

/** 压缩总超时：商家口径 1600px 的 canvas 编码比 AI 试衣的 1080 慢，给 15s（低端机仍会 fail-closed 返回失败而非挂起） */
export const MERCHANT_COMPRESS_TIMEOUT_MS = 15_000;

export function createMerchantImageCompress(): ImageCompressPort {
  return createWeixinImageCompress({
    maxLongEdge: MERCHANT_COMPRESS_MAX_LONG_EDGE,
    maxBytes: MERCHANT_COMPRESS_MAX_BYTES,
    qualities: MERCHANT_COMPRESS_QUALITIES,
    timeoutMs: MERCHANT_COMPRESS_TIMEOUT_MS,
    needsCompress,
    computeSize: computeMerchantTargetSize,
  });
}

export interface MerchantUploadDeps {
  picker: MediaPickerPort;
  compress: ImageCompressPort;
  /** 每次调用返回**新的**上传端口（uni.uploadFile 的 task 是实例私有的；封面与批量上传各用各的，互不 abort） */
  newUpload: () => UploadPort;
  albumUploadUrl: () => string;
  coverUploadUrl: () => string;
}

export function createMerchantUploadDeps(): MerchantUploadDeps {
  return {
    picker: createUniMediaPicker(),
    compress: createMerchantImageCompress(),
    newUpload: () => createUniUpload(),
    albumUploadUrl: () => merchantApiBase() + "/photo-albums/albums/upload",
    coverUploadUrl: () => merchantApiBase() + "/photo-albums/upload-cover",
  };
}
