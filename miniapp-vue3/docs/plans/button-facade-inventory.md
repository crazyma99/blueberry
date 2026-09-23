# 按钮自绘盘点（2026-09-23；目标：全部改用 `ui/BaseButton` 门面）

> 口径：模板内「带 `@click/@tap` 且 class 含 `btn/button/cta`」→ 判为**自绘按钮**（可能含误判，需人工确认）；`<button>` 原生元素单独列出。
> 目标：真·按钮统一走 `ui/BaseButton`（门面已支持 `variant: base|plain|dashed|soft|subtle|text`、`type`、`block`、`round`、`busy`、`custom-class/style`）。
> ⚠️ 可交互但**非按钮**的（卡片/选项卡/图标/导航返回/列表项）不在此清单替换范围，另行标注。

| 文件 | 自绘按钮数 | 已用 BaseButton | 样例 class |
|---|---|---|---|
| `components/ProfilePopup/ProfilePopup.vue` | 1 | 0 | confirm-btn btn-primary |
| `components/QualityRejectSheet/QualityRejectSheet.vue` | 2 | 0 | qr-btn qr-btn--ghost 、 qr-btn qr-btn--primary |
| `pages/_probe/wot-sample.vue` | 0 | 8 | — |
| `pages/aiRecommendLoading/index.vue` | 2 | 0 | back-btn-wrapper 、 retry-btn |
| `pages/aiTryOn/index.vue` | 3 | 0 | canGenerate ? 'generate-btn' : 'generate-btn generate-btn-disabled' 、 tpl-empty-btn |
| `pages/aiTryOnResult/index.vue` | 9 | 0 | back-btn-wrapper 、 btn-primary 、 gen-btn btn-secondary 、 retry-btn |
| `pages/demoDetail/index.vue` | 1 | 0 | search-btn |
| `pages/index/index.vue` | 0 | 1 | — |
| `pages/mine/index.vue` | 1 | 0 | logout-btn |
| `pages/priceHomePage/index.vue` | 0 | 1 | — |
| `pages/targetPhotoDetail/index.vue` | 2 | 0 | btn-primary 、 retry-btn |
| `ui/BaseDialog.vue` | 1 | 0 | base-dialog-native__btn base-dialog-native__btn--confirm |
| `ui/BasePicker.vue` | 2 | 0 | base-picker-native__btn 、 base-picker-native__btn base-picker-native__btn--ok |

**合计自绘按钮：24 处**（10 个文件）；已用 BaseButton 的文件：3 个。
