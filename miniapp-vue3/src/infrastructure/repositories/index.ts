// P2-01 repositories 汇出：切片 8 wrapper 的仓储层入口（B0-B1 批次；B2-B4 随各批迁移补齐）。
export { createCarouselRepository, type ClientLike, type RepoResult } from "./carousels";
export { createShopRepository } from "./shops";
export { createAlbumRepository } from "./albums";
export { createLikeRepository, type LikeStatusItem, type ToggleLikeResult } from "./likes";
export { createWxAuthRepository, type WxLoginResult } from "./wx-auth";
export { createPackageRepository, type ShopPackageInfo } from "./packages";
export { createUserInfoRepository, type WxUserInfo } from "./user-info";
export {
  createFavoriteRepository,
  type FavoriteAlbum,
  type FavoriteStatusItem,
  type SearchPageResult,
} from "./favorites";
export { createPageConfigRepository, type PageConfigItem } from "./page-config";
export { createBrandRepository, type BrandBrief } from "./brands";
