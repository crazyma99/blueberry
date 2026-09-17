# 资产清单（P1-03，自 preflight §1–4 转换 · 2026-09-17）

## 路由（17 条 + 3 Tab，对外 path 不变）

Tab：`pages/index/index`、`pages/priceHomePage/index`、`pages/mine/index`。

| # | path | onLoad 入参 | 登录静态命中 | 抖音 Profile |
|---|---|---|---|---|
| 1 | pages/index/index | — | — | ✅ |
| 2 | pages/brandHub/index | — | — | ✅ |
| 3 | pages/demoDetail/index | — | ✅ | ✅ |
| 4 | pages/priceList/index | — | — | ✅ |
| 5 | pages/targetPhotoDetail/index | — | ✅ | ✅ |
| 6 | pages/priceHomePage/index | — | — | ✅ |
| 7 | pages/mine/index | — | ✅ | ✅（菜单只留「我的喜欢」） |
| 8 | pages/favorites/index | — | — | ✅ |
| 9 | pages/webview/index | url | — | ✅ |
| 10 | pages/policies/user | — | — | ✅ |
| 11 | pages/policies/privacy | — | — | ✅ |
| 12 | pages/aiTryOn/index | albumId brandId category gender share_from shopId style sub_category subCategory templateId | ✅ | ❌ 不注册 |
| 13 | pages/aiTryOnResult/index | brandId shareToken | ✅ | ❌ |
| 14 | pages/aiTryOnHistory/index | — | — | ❌ |
| 15 | pages/aiRecommend/index | — | ✅ | ❌ |
| 16 | pages/aiRecommendLoading/index | — | — | ❌ |
| 17 | pages/aiRecommendResult/index | — | — | ❌ |

> 抖音 Profile＝11 页/3 tab（2026-09-17 主人拍板，SPEC §10F）；微信全量 17 页。

## 组件（15，旧 src/components/）

AppFooter / AppInput / AppPhotoPicker / AppSegment / AppSelector / BottomActionBar / BottomActionBarSecondary / CustomNavBar / GenerationProgress / LoadingBlock / LoginPopup / PhotoGrid / ProfilePopup / ServiceContact / SkeletonBlock

**微信 native tabBar 四文件单列**（非 Vue 组件）：`custom-tab-bar/index.{js,json,wxml,wxss}`。

## 工具（20，旧 src/utils/*.uts）

api / auth / brand / config / faceShareCard / format / haptics / http / imageLoader / legal / loginFlow / navigate / pageConfig / payGuard / photoCheck / profileSubmit / share / tabbar / text / vkFace

## API wrapper（34 + 2 队列函数 + 11 导出类型）

getImage getalbum getCategories getAlbumList getalbumDetail wxLogin wxBindPhone wxGetUserInfo wxUpdateUserInfo toggleLike getLikeStatus toggleFavorite getFavoriteStatus getFavoriteList searchAlbums getShops getPackages getPageConfig getAiTemplates getAiStyles getAiTemplateDetail uploadPhoto submitAiTryOn getAiTryOnResult getSharedAiTryOnResult downloadAiTryOnResult getAiTasks deleteAiTask getCreditBalance createCreditRecharge getCreditRechargeStatus redeemCreditCode getAiRecommend getBrands

队列函数（非业务接口）：`flushPendingUploads`、`rejectAllPendingUploads`。

**退役登记**：`getalbum` 旧端 0 调用者（全仓 grep 实测）⇒ 新端不重实现。
