# 按钮自绘盘点（口径已与守卫 `t62-button-facade-guard.spec.ts` 对齐：2026-09-23）

> 口径：模板内「带 `@click/@tap` 且 class 含 `btn/button/cta`」或原生 `<button>` ⇒ 计为**自绘按钮**（与守卫同一实现，避免两套数字）。
> 目标：全部改用 `ui/BaseButton` 门面（`type`／`variant(base|plain|dashed|soft|subtle|text)`／`size`／`block`／`round`／`disabled`／`busy`／`customStyle`）；**新增自绘按钮会被 `t62` 拦下**。
> 免替换：`src/ui/BasePicker.vue`（门面自身为抖音自绘分支实现）。

| 文件 | 自绘数 | 已用 BaseButton | 样例 class |
|---|---|---|---|
| `pages/aiTryOnResult/index.vue` | 9 | 0 | gen-btn btn-secondary 、 gen-btn btn-secondary 、 btn-primary |
| `pages/aiTryOn/index.vue` | 3 | 0 | tpl-empty-btn 、 canGenerate ? 'generate-btn' : 'generate-btn generate-btn-disabled' 、 canGenerate ? 'generate-btn' : 'generate-btn generate-btn-disabled' |
| `pages/aiRecommendLoading/index.vue` | 2 | 0 | retry-btn 、 back-btn-wrapper |
| `pages/targetPhotoDetail/index.vue` | 2 | 0 | btn-primary 、 retry-btn |
| `components/ProfilePopup/ProfilePopup.vue` | 1 | 0 | confirm-btn btn-primary |
| `pages/demoDetail/index.vue` | 1 | 0 | search-btn |
| `pages/mine/index.vue` | 1 | 0 | logout-btn |
| `ui/BaseDialog.vue` | 1 | 0 | base-dialog-native__btn base-dialog-native__btn--confirm |

**待替换合计：20 处 / 8 文件**（＋ `ui/BasePicker.vue` 2 处免替换）。

## 批次进度（B3 逐页推进，替换后同步下调 `t62` 白名单）

- ✅ B1 弹层按钮（`QualityRejectSheet` 2 处）→ 已组件化（提交 `aeb3270`）
- ✅ B4 守卫（`t62`）已上线：新增自绘按钮即红（提交 `cc1c574`）
- ⏳ B3 其余文件：按上表自上而下替换
