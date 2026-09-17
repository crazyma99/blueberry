# 接口合同台账（P1-03 建账）

> 状态口径：`pending`（名单已锁，明细未冻结）／`frozen`（method/path/参数已核对冻结）。

## 已冻结的跨端规则（P1-09）

- HTTP 业务码 **4001 → `INSUFFICIENT_CREDITS`**；保留 businessCode／安全 message／requestId。
- 普通 BUSINESS 错误**不得**触发支付流程（domain/payment-state.ts `mayTriggerRecharge` 已测试锁定）。

## T5/T6 首条纵切片（首页→相册列表→详情→返回）合同 —— 2026-09-17 旧端 api.uts 实测冻结

| wrapper | method | path | 入参 | 消费页面 | 状态 |
|---|---|---|---|---|---|
| getImage | GET（可传 method 覆盖） | `/wechat/carousels` | method?, params? | index | frozen |
| getShops | GET | `/api/shops` | — | index | frozen |
| getCategories | GET | `/wechat/categories` | shopId | demoDetail | frozen |
| getAlbumList | GET | `/wechat/albums` | params（shopId 等） | demoDetail（×2 调用点） | **frozen**（P2-09 实测：响应＝{albums,page,size,total}，album 项键 6 个已登记 DTO） |
| getalbumDetail | GET（可传 method 覆盖） | `/wechat/album/detail` | **albumId＋type**（旧端 :221 实测，非 idx） | targetPhotoDetail | **frozen**（P2-09 响应键 7 个已登记 DTO） |
| getLikeStatus | GET | `/api/like/status` | albumIds（逗号串） | demoDetail、targetPhotoDetail | frozen |
| toggleLike | POST | `/api/like` | albumId（number） | demoDetail、targetPhotoDetail | frozen |
| wxLogin | POST | `/api/wx/login` | { code, ... }（真实 code 需真机登录，**留待 T6 真机验证**） | demoDetail、targetPhotoDetail（登录前置） | frozen-path／code 注入 pending |

### 纵切片三页的 utils 依赖面（迁移范围边界，旧端实测）

- **index**：api／auth／brand／haptics／http／imageLoader／legal／loginFlow／navigate／pageConfig／profileSubmit／share／tabbar
- **demoDetail**：api／auth／format／haptics／http／imageLoader／legal／loginFlow／navigate／profileSubmit／share／text
- **targetPhotoDetail**：api／auth／format／haptics／http／imageLoader／legal／loginFlow／share

> 说明：13 个 wrapper 名单见 inventory.md；本表只冻结 T5/T6 切片涉及的 8 个。`getalbum` 已登记退役不重实现。其余 wrapper（B2-B4 批次）随各批次迁移逐条冻结。

**⭐ P2-09 真实 provider 报文核对（2026-09-17，测试域只读 GET，门控 spec `tests/provider/wire-format.spec.ts`）**：8 个切片 wrapper 中 6 个已对真实线格式核对一致——`/api/shops`（14 键）／`/wechat/carousels`（8 键）／`/wechat/categories`（4 键）／`/wechat/albums`（信封 4 键＋album 项 6 键）／`/wechat/album/detail`（7 键）／`/api/like/status`（albumId,likeCount,liked **与冻结 DTO 逐字段一致**）；**fixture 与 provider 无冲突，无需修合同**；wxLogin 的 code 注入与 toggleLike 写调用**不在只读核对范围**（写/付费调用须单独授权，P2-09 纪律）。


## T7 普通业务页批次合同（P2-17/18/19/20，2026-09-17 旧端 api.uts 实测冻结）

| wrapper | method | path | 入参 | 消费页面 | 状态 |
|---|---|---|---|---|---|
| getPackages | GET | `/wechat/packages` | shopId（number/string） | priceList | frozen（P2-17；ShopPackageInfo 8 键登记） |
| wxBindPhone | POST | `/api/wx/phone` | { code } | mine（手机号登录第 3 步） | frozen（P2-18；需登录 never） |
| wxGetUserInfo | GET | `/api/wx/userinfo` | — | mine（onShow 头像兜底拉取） | frozen（P2-18；**需登录**——CR 🔴1 回归锁见 repositories.spec.ts） |
| wxUpdateUserInfo | PUT | `/api/wx/userinfo` | { nickname?, avatarUrl? }（**仅非空字段**，空串不传防误覆盖） | mine（资料提交） | frozen（P2-18；需登录 never） |
| getFavoriteList | GET | `/api/favorite/list` | shopId?（**⛔ 不得含 page/size**——P2-19 红线：默认一次获取全量） | favorites | frozen（P2-19；需登录 idempotent；契约断言锁定 query 无 page/size） |
| getFavoriteStatus | GET | `/api/favorite/status` | albumIds（逗号串） | favorites（批量收藏态预留） | frozen（P2-19；需登录） |
| toggleFavorite | POST | `/api/favorite` | albumId（number） | favorites | frozen（P2-19；需登录 never） |
| searchAlbums | GET | `/api/search` | keyword,page,size | favorites（**唯一允许分页的路径**） | frozen（P2-19；公开 idempotent） |
| getPageConfig | GET | `/api/page-config` | — | index（品牌馆入口显隐）＋brandHub（**页内自守卫**） | frozen（P2-20；公开 idempotent。⭐ 两侧**必须共用同一仓储**——入口显示而进入被拦＝P2-20 红线；旧端 60s 缓存由 controller scope 代次取代） |
| getBrands | GET | `/api/brands` | — | brandHub（**过滤 brandId==='PLATFORM' 占位品牌**） | frozen（P2-20；公开 idempotent；BrandBrief 6 键登记） |

> P2-19 红线四成立项：①`getFavoriteList` 无分页参数 ②分页 UI 仅搜索态渲染 ③`loadMore` 有 `isSearching` 守卫
> ④仓储层无 page/size。其中 ①④ 由 `tests/unit/repositories.spec.ts` 契约断言自动锁定，②③ 由 `tests/unit/t26-favorites.spec.ts` 覆盖。

## Phase 3 · T9a 共享支付合同（2026-09-17 旧端 api.uts:678-780 实测冻结）

| wrapper | method | path | 入参 | 消费方 | 状态 |
|---|---|---|---|---|---|
| getCreditBalance | GET | `/api/aiface/credit/balance` | shopId?／feature?（tryon 默认、recommend、download）／taskId? | 支付协调器权益确认＋页面余额展示 | frozen（**需登录** idempotent；download＋taskId 时返回 taskBought） |
| createCreditRecharge | POST | `/api/aiface/credit/recharge` | { shopId, credits, feature?, taskId? } | payment-coordinator 下单 | frozen（**需登录 never**——扣费接口禁自动重放，客户端去重≠服务端幂等） |
| getCreditRechargeStatus | GET | `/api/aiface/credit/recharge/status` | outTradeNo | payment-coordinator 轮询到账 | frozen（**需登录** idempotent；status 0待付/1已付/2关闭/3退款；paid 由回调异步入账） |
| redeemCreditCode | POST | `/api/aiface/credit/redeem` | code（12 位） | 兑换入口 | frozen（**需登录 never**） |

> ⭐ 口径冻结（phases :571-589）：**平台支付面板 success ≠ 订单 paid ≠ 权益到账**——tryon/recommend 需 paid **且对应池
> balance>0**；单任务下载需 paid **且服务端 taskBought=true**。4001＝次数不足（HTTP 200）→ `INSUFFICIENT_CREDITS`，
> 普通 BUSINESS 错误不得拉起支付。确认轮询有截止时间，**超时≠订单作废**（按 outTradeNo resume，不新建订单）。

## Phase 3 · T8/T9b AI 端点合同（2026-09-17 旧端 api.uts:440-664/800-820 实测冻结）

> ⚠️ 成功码口径：aiface 接口 **code===0 或 200 均为成功**（client `isBusinessSuccess` 已兼容）。

| wrapper | method | path | 入参 | 消费方 | 状态 |
|---|---|---|---|---|---|
| getAiTemplates | GET | `/api/aiface/templates` | style?/keyword?/category?/package_type?/sub_category?/shop_id?/album_id?/gender?（空值不传） | aiTryOn（模板选择） | frozen（公开 idempotent） |
| getAiStyles | GET | `/api/aiface/styles` | category?/package_type?/sub_category?/shop_id? | aiTryOn（风格分组） | frozen（公开；→ [{style_name,count,cover_url}]） |
| submitAiTryOn | POST | `/api/aiface/tasks` | { templateId, userPhotoFilename, shopId, userOpenid?, category?, bodyType?, ageRange? } | aiTryOn（提交试衣） | frozen（**需登录 never**；→ {task_id}；code!==0 时 message 即业务提示） |
| getAiTasks | GET | `/api/aiface/tasks` | openid | aiTryOnHistory（历史） | frozen（**需登录** idempotent；→ [{id,status,result_image_url,template_image_url,style_name,created_at}]） |
| getAiRecommend | POST | `/api/aiface/recommend` | { user_photo_filename, shop_id } | aiRecommend（推荐结果） | frozen（**需登录 never＋timeout 180s**）：⭐**同步扣费**（每次调用扣 1 次推荐余额，耗时 1~3 分钟）⇒ **调用方严禁轮询/并发重发**（重发再次扣费）；4001＝次数不足→充值 |

## wrapper 台账（34 条全名单见 inventory.md）

| 批次 | wrapper | 状态 |
|---|---|---|
| B0-B1（本表 8 条） | 见上 | 5 frozen＋3 frozen-path |
| T7（本表 8 条） | getPackages／wxBindPhone／wxGetUserInfo／wxUpdateUserInfo／getFavoriteList／getFavoriteStatus／toggleFavorite／searchAlbums | 8 frozen |
| B2-B4（其余 18 条） | 名单已锁 | pending |
