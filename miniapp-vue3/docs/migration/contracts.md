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
| getAlbumList | GET | `/wechat/albums` | params（shopId/分类/分页，随 T6 迁移时逐字段登记） | demoDetail（×2 调用点） | frozen-path／参数明细 pending |
| getalbumDetail | GET（可传 method 覆盖） | `/wechat/album/detail` | method?, params?（idx/type 等，随 T6 登记） | targetPhotoDetail | frozen-path／参数明细 pending |
| getLikeStatus | GET | `/api/like/status` | albumIds（逗号串） | demoDetail、targetPhotoDetail | frozen |
| toggleLike | POST | `/api/like` | albumId（number） | demoDetail、targetPhotoDetail | frozen |
| wxLogin | POST | `/api/wx/login` | 平台登录 code 等（T6 登记） | demoDetail、targetPhotoDetail（登录前置） | frozen-path／参数明细 pending |

### 纵切片三页的 utils 依赖面（迁移范围边界，旧端实测）

- **index**：api／auth／brand／haptics／http／imageLoader／legal／loginFlow／navigate／pageConfig／profileSubmit／share／tabbar
- **demoDetail**：api／auth／format／haptics／http／imageLoader／legal／loginFlow／navigate／profileSubmit／share／text
- **targetPhotoDetail**：api／auth／format／haptics／http／imageLoader／legal／loginFlow／share

> 说明：13 个 wrapper 名单见 inventory.md；本表只冻结 T5/T6 切片涉及的 8 个。`getalbum` 已登记退役不重实现。其余 wrapper（B2-B4 批次）随各批次迁移逐条冻结。

## wrapper 台账（34 条全名单见 inventory.md）

| 批次 | wrapper | 状态 |
|---|---|---|
| B0-B1（本表 8 条） | 见上 | 5 frozen＋3 frozen-path |
| B2-B4（26 条） | 名单已锁 | pending |
