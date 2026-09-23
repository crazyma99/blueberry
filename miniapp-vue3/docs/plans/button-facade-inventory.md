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

## 免替换清单（2026-09-23 第 6 轮登记）

| 类别 | 实例 | 原因 |
|---|---|---|
| **平台能力按钮** | `<button open-type="chooseAvatar">`（`ProfilePopup` 头像选择）、`<button open-type="getPhoneNumber">`（`LoginPopup` 手机号一键登录） | 微信**强制要求**用原生 `<button>` 承载 `open-type`；换成 `BaseButton` 会失去平台能力（可在门面后续支持 `open-type` 透传后再评估） |
| **门面内部自绘** | `src/ui/BasePicker.vue` 的 `base-picker-native__btn*` | 门面自身为**抖音自绘分支**的实现细节，非业务按钮 |
| 可交互但非按钮 | 卡片/选项卡/图标按钮/导航返回/列表项（如 `.tpl-card`、tab 项、`.custom-navbar` 返回） | 属"可点区域"而非表单按钮，替换会破坏布局语义（如需要，另立"可点区域统一"专项） |

> 判定口径：只有「表单/操作类按钮」才纳入替换；平台 `open-type` 按钮与门面实现细节**免替换**（守卫 `t62` 的启发式只统计带 `@click/@tap` 且 class 含 btn/button/cta 的元素或带 `@click` 的原生 `<button>`，天然不计入 `open-type` 按钮）。

## 交接状态（2026-09-23 第 15 轮更新；本条即"接手即用"）

**已组件化（含提交号）**
- B1 `QualityRejectSheet` 2 处 → `aeb3270`
- B3 ① `ProfilePopup` 1 处 → `e4686f7`；② `aiRecommendLoading.retry-btn` 1 处 → `030a87e`；③ `demoDetail` 1 处 → `02b2c29`；④ `targetPhotoDetail` 2 处（`retry` → `26b7214`；`btn-primary` 图文/多行块 → `b3f95a3`，内容经插槽保留 → `180778c`）；⑤ `aiTryOn.tpl-empty-btn` 1 处 → `eee8150`

**剩余（＝守卫 `t62` 白名单，替换后必须同步下调）**
| 文件 | 待替换 |
|---|---|
| `pages/aiTryOnResult/index.vue` | 9 |
| `pages/aiTryOn/index.vue` | 2 |
| `ui/BasePicker.vue` | 2 |
| `pages/aiRecommendLoading/index.vue` | 1 |
| `pages/mine/index.vue` | 1 |
| `ui/BaseDialog.vue` | 1 |

**方法固化（务必沿用——我已踩过的坑）**
1. **定位**：`grep -n "<类名>"` 看真实形态；**不要**用 `<template>…</template>` 切片（本仓部分文件根标签带属性，会取错片段 ⇒ 我曾连续 MISS 两轮）。
2. **替换**：按**行级标签配对**取整块（单行/多行都要支持）；**单个 `<text>` 子节点 ⇒ 用 `label`；含图片或多节点（图文按钮）⇒ 用默认插槽原样保留内容**（我曾用 `label=""` 丢掉图文按钮内容，已在 `180778c` 修正）。
3. **判定器注意**：统计"子节点"时要排除元素**自身**的 `<view` 标签。
4. **每页一提交**，提交前必跑：`npx vue-tsc --noEmit` ＋ `npx vitest run tests/unit/t62-button-facade-guard.spec.ts` ＋ 全量 `npx vitest run` ＋ `npx uni build -p mp-weixin`（产物再核 `base-button` 注册/渲染）。
5. 含 `open-type` 的原生 `<button>`（chooseAvatar／getPhoneNumber）与门面内部自绘**免替换**（见上文「免替换清单」）。

**已知瑕疵（如实留痕）**：空提交 `4e85572`（信息夸大为"清理"，实际未改动）——因已推送且禁止改写历史，仅登记、不追溯。
