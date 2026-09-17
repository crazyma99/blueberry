# Wot 真机三症状调查报告（P1-25 回执 → P1-26 处置输入）

> 2026-09-17 · 主人抖音真机扫码回执（原话）：「弹层有响应（但不是弹层），选择器有问题（展开收起位置异常），轻提示／对话框点击无响应」。
> 说明：原计划由子 agent 承接本调查，**该子 agent 未产出任何内容即失败**（closing message 为空）⇒ 改由主 run 内联完成。以下每条结论均有源码/产物行级证据。

## 症状一：对话框点击无响应 —— 根因＝探针页用法违规（认错）

**证据链**：
- `wd-dialog.vue:160` `defineProps(dialogProps)`；**defineEmits 全文 0 命中**（无任何 emit）。
- `types.ts` dialogProps（287 行起）全量字段＝selector rootPortal title msg type theme zIndex lazyRender headerImage icon iconColor iconProps inputProps textareaProps inputPattern inputValidate inputError showErr actionLayout confirmButtonProps cancelButtonProps showCancelButton confirmButtonText cancelButtonText actions closeOnClickModal showClose beforeConfirm —— **没有 show 可见性 prop**；可见性由内部 `dialogState`（初始 show:false）经 **provide/inject（`useDialog(selector).show()` 函数式，index.ts:34）** 驱动。
- 探针页当前写法 `<wd-dialog v-model= title= content= @confirm @cancel>`：**v-model（无此 prop 且无 emit）、content（真实 prop 名是 msg）、@confirm/@cancel（无 emit）三项全是凭记忆编造**，违反 SPEC §6.4 事实源纪律 ⇒ 点击后组件内部状态未被驱动、无响应。

**修复方案（精确）**：探针页改函数式——挂载 `<wd-dialog :show-close="true" />`（appearance props 均为已验证字段），点击改调 `useDialog().show({ title: '确认操作', msg: '这是对话框内容' })`（Promise<DialogResult>，res.action ∈ confirm|cancel|modal|close）。⚠️ 执行前须验证：import useDialog 会把包内 .ts 拉进 vue-tsc 程序——若 TS7053（common/util.ts:431）复现，则改用构建期桥接或 .js 包装，实测定夺。

## 症状二/三：弹层形态异常、picker 位置异常、toast 无响应 —— 根因＝Wot 2.3.2 弹层系在抖音无原生脱离能力（平台能力缺口）

**证据链**：
1. `wd-root-portal.vue` 模板条件编译：**`<root-portal>` 原生组件仅包在 `#ifdef MP-WEIXIN || MP-ALIPAY` 内**（另有 `#ifndef MP-DINGTALK` 嵌套）——**没有 MP-TOUTIAO 分支**。
2. 抖音产物实证：`dist/build/mp-toutiao/.../wd-root-portal.ttml` ＝ 纯 `<view class=...wd-root-portal><slot/></view>`——**无 root-portal 原生节点**。⇒ **root-portal=true 在抖音不产生脱离效果**（picker types.ts:111-115 注释宣称的「小程序: root-portal」只对微信/支付宝成立）。
3. 弹层系家族在抖音仅有一处适配：`#ifndef MP-TOUTIAO → virtualHost` 关闭（wd-popup.vue:72、wd-overlay.vue:24、wd-transition.vue:22、wd-toast.vue:42）——**没有任何抖音端定位兜底**。
4. 产物侧排除项：easycom 注册正确（页面 json usingComponents 齐全）、各组件 ttss 已编译（wd-popup.ttss 1924B、wd-toast.ttss 1881B）、wd-popup.json 内部注册 wd-overlay/wd-transition/wd-root-portal 正常 ⇒ **不是接入问题，是组件家族在抖音的定位能力问题**（fixed 在抖音自定义组件上下文失效且无 portal 逃生口）。
5. 三症状共同包裹层：popup/toast/dialog 全部经 wd-transition + fixed/overlay 渲染 ⇒ 同根因解释三症状（dialog 另叠加症状一的用法违规）。

**处置选项（待主人拍板，P1-26 路径）**：
- **A（推荐）平台 UI bridge 兜底**：BasePopup/BasePicker/BaseFeedback 在抖音分支降级——popup 用页面级自绘蒙层＋居中容器（纯 view+fixed，脱离自定义组件上下文）；toast 改 uni.showToast 原生（@dcloudio/types 有定义）；picker 容器挂页面根级。工作量小、行为可控；微信端不动。
- **B 继续 wot 试验**：试 root-portal=true（已知抖音无效，仅排除法）＋试把弹层移到页面根节点渲染；成功率低，不推荐单独采用。
- **C 抖音端降级交互**：弹层改 navigateTo 独立页／picker 改 actionSheet；产品形态变化需主人确认。

## 附：本轮已确认的接入层事实（非问题）
- easycom 生效、组件进产物、样式编译、BaseButton/BaseField 合同正常（主人回执未提这两者）。
