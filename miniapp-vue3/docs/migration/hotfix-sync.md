# 热修账本（P1-14 纪律：每笔 main 修复必须登记；每 Phase 开始与候选发布前核对增量）

| 日期 | main 旧 SHA | 新端等价 SHA | 回归用例 | 备注 |
|---|---|---|---|---|
| 2026-09-17 | —（开工时点无在途热修） | — | — | 账本建立 |
| 2026-09-21 | 旧端首页下拉刷新（旧端 `src/pages.json:5-8`＋`index.uvue:252-263`，banner 防缓存 `index.uvue:356`） | 新端 T6 接入期漏迁 ⇒ 本轮补齐：`onPullDownRefresh`＋`enablePullDownRefresh`＋`fgTick` 重播 | `tests/unit/t49-index-pull-refresh.spec.ts`（9 例，含防缓存 `t`） | 见 `deviations.md` #27；客片页（demoDetail）旧端同样有、本轮未开 |
| 2026-09-21 | 旧端首页/客片列表下拉刷新（`pages.json:5-8/:16-22`）；旧端分享三件套（`utils/share.uts`／`faceShareCard.uts`／`vkFace.uts`） | 新端：4 页下拉刷新（含客片详情/AI试衣记录/价目表＝新增）＋3 页分享卡片＋VK 人脸 5:4 封面 | `t50`(10)/`t51`(7)/`t52`(9)＋`t18`/`t19`/`t22`/`t30` 各 1 例 | 见 `deviations.md` #28；`aiRecommend` 旧端本就无分享逻辑 |
