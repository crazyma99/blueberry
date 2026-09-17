# Wot UI 抖音真机三症状调查报告（证据级 · P1-25 回执 → P1-26 处置输入）

> 2026-09-17 · 主人抖音真机扫码回执（原话）：「弹层有响应（但不是弹层），选择器有问题（展开收起位置异常），轻提示／对话框点击无响应」。
> 调查范围：miniapp-vue3/（uni-app Vue3 + Vite 5.2.8 + TS 4.9 + @wot-ui/ui 2.3.2，easycom 见 src/pages.json:2-7）
> 纪律：所有结论均有源码行号或命令输出佐证；未能验证的一律标注「未验证」。
> 产物目录：dist/build/mp-toutiao/（本次只读，未重新构建、未改任何 src/）

---

## 摘要（三症状根因一句话）

| # | 症状 | 根因定性 |
|---|------|----------|
| 1 | 弹层非弹层形态（fixed 失效、渲染成文档流块） | **平台级**：wot 的 root-portal 逃生通道在 MP-TOUTIAO 条件编译中被排除，抖音产物里只剩一个普通 `<view>`；且所有 wot 组件在抖音端关闭 virtualHost（多层宿主节点包裹），弹层无任何脱离文档流的机制 |
| 2 | Picker 展开收起位置异常 | 同症状 1（wd-picker 内部就是 wd-popup position="bottom" + fixed） |
| 3 | wd-toast / wd-dialog 点击无响应 | **API 误用（与平台无关）**：wd-toast 没有 `show` prop（只能 useToast() 函数式驱动）；wd-dialog 2.3.2 不消费业务 props、无任何 emit（只消费 selector/root-portal/custom-class），只能 useDialog() 函数式驱动。探针页与 BaseFeedback 均按不存在的 API 编写，任何平台上都不会有响应 |

---

## 症状 1：弹层不是弹层形态

### 根因链（每一步有证据）

**① wot 的 root-portal 机制在抖音端不存在**

`node_modules/@wot-ui/ui/components/wd-root-portal/wd-root-portal.vue` 模板第 6-9 / 15-19 行：

```html
<!-- #ifdef MP-WEIXIN || MP-ALIPAY -->
<!-- #ifndef MP-DINGTALK -->
<root-portal>
  ...
</root-portal>
<!-- #endif -->
<!-- #endif -->
```

条件编译分支**只包含 MP-WEIXIN 和 MP-ALIPAY（排除 MP-DINGTALK）**，MP-TOUTIAO 不在其中。H5 走 teleport（第 2-4 行），APP 走 renderjs（文件末尾 script module="render"）。抖音端什么都不包。

**② 产物证实：抖音端 wd-root-portal 编译为普通 view**

`dist/build/mp-toutiao/node-modules/@wot-ui/ui/components/wd-root-portal/wd-root-portal.ttml` 全文：

```html
<view class="${(a) + ' ' + 'wd-root-portal'}" style="${b}"><slot/></view>
```

同目录 wd-root-portal.json 的 usingComponents 为空。全产物 grep `<root-portal` **零命中**。

**③ uni-app 抖音编译器没有 teleport→root-portal 转换**

- `node_modules/@dcloudio/uni-mp-weixin/dist/uni.compiler.js:185`：nodeTransforms 包含 `uniCliShared.transformTeleport`（把 `<teleport>` 编译成 `<root-portal>`，实现见 `@dcloudio/uni-cli-shared/dist/vue/transforms/transformTeleport.js:15`）。
- `node_modules/@dcloudio/uni-mp-toutiao/dist/uni.compiler.js:86-95`：nodeTransforms 只有 `transformRef`、`transformComponentLink`，**没有 transformTeleport**；customElements 白名单（同文件约 70-85 行）也不含 root-portal。

**④ 抖音端所有 wot 组件关闭 virtualHost → 多层宿主节点**

每个 wot 组件的 options 都是同一模式：

```js
options: {
  // #ifndef MP-TOUTIAO
  virtualHost: true,
  // #endif
  ...
}
```

（wd-root-portal.vue:28-30、wd-popup.vue:71-74、wd-toast.vue、wd-dialog.vue、wd-overlay.vue 等全部如此；产物 dist/.../wd-root-portal.js 的 options 编译后只剩 `{addGlobalClass:!0,styleIsolation:"shared"}`，virtualHost 被剥离。）

抖音端弹层实际嵌套：`base-popup(宿主节点) → wd-popup(宿主节点) → wd-transition(宿主节点) → view.wd-popup{position:fixed}`。fixed 样式已确认编译进产物：`dist/.../wd-popup/wd-popup.ttss` 首条规则 `.wd-popup{position:fixed;max-height:100%;...}`。抖音小程序自定义组件宿主节点成为 fixed 包含块——这是「fixed 失效、内容渲染成文档流块」的机制。

**「抖音宿主节点导致 fixed 相对组件定位」这一运行时行为属平台已知问题，本报告未做真机 DOM 验证（未验证）**；但症状与该机制吻合，且 wot 自己在 `wd-picker/types.ts:111-115` 的注释原文写明 root-portal 是「是否从页面中脱离出来，用于解决各种 fixed 失效问题 (H5: teleport, APP: renderjs, 小程序: root-portal)」——wot 官方把 root-portal 认定为小程序端 fixed 失效的解法，而该解法在抖音端没有实现。

### 结论（证据级）

**`rootPortal=true` 在抖音端不能修好 fixed 失效**——它在抖音产物里编译成一个普通 `<view>` 包裹层（wd-root-portal.ttml），纯 no-op，只是多一层节点。wot 2.3.2 没有为抖音实现任何脱离机制。另注：wot 2.3.2 package.json 的平台自述里 `小程序.字节跳动 = "u"`（未承诺支持）。

### 修复建议

1. **门面透传（无害、为其他平台铺路）**：见「任务 4」章节。
2. **抖音端根治——候选方案（按可行性排序）**：
   - **候选 E（有源码证据的可行方向，需真机验证）**：uni-app 抖音运行时**支持 virtualHost**——`uni-mp-toutiao/dist/uni.mp.esm.js:523` 有 `if (options && options.virtualHost)` 处理分支，1051-1060 行注释「使用 virtualHost 后，头条不支持 triggerEvent，通过主动调用方法抹平差异」说明运行时已做兼容。用 `pnpm patch @wot-ui/ui` 去掉关键组件（wd-popup / wd-transition / wd-overlay / wd-root-portal / wd-icon）`#ifndef MP-TOUTIAO` 的 virtualHost 守卫，宿主节点消失后 fixed 元素回到页面级，预期修复症状 1/2。**风险**：wot 主动禁用可能踩过抖音 virtualHost 的坑（slot 边界、样式穿透），必须真机全量回归探针页。
   - **候选 A（平台 UI bridge 兜底，原报告推荐路径）**：BasePopup/BasePicker 在抖音分支降级为页面级自绘蒙层＋居中容器（纯 view + fixed，不经 wot 自定义组件链）；toast 改 uni.showToast（见 3a 兜底证据）。工作量小、行为可控，微信端不动。
   - **候选 B（未验证）**：查抖音基础库是否原生支持 `root-portal` 组件（官方文档页为 SPA，本次抓取未获正文；抖音编译器白名单无此项）。若支持，可自建 `src/ui/BaseRootPortal.vue` 用 `#ifdef MP-TOUTIAO` 直写原生标签，但需先验证 uni-app 抖音编译器是否透传未知标签。
   - **候选 C（未验证）**：升级 @wot-ui/ui，查 changelog 是否给 MP-TOUTIAO 补了 root-portal 分支（执行前先 `pnpm view @wot-ui/ui versions`）。
3. 探针页当前弹层已在页面根部（无滚动/transform 祖先）仍失败，**「把弹层移到页面根节点」这条路已被真机现象证伪**，不要再试。

---

## 症状 2：Picker 展开收起位置异常

### 根因

与症状 1 同链路。`node_modules/@wot-ui/ui/components/wd-picker/wd-picker.vue:1-13`：wd-picker 根节点是 `<view :class="wd-picker ...">`（virtualHost 同样被禁），内部 `<wd-popup position="bottom" :root-portal="rootPortal">`（第 10 行）。wd-popup 的 bottom 定位依赖 `.wd-popup{position:fixed}` + 偏移类（wd-popup/index.scss:16 起），抖音端 fixed 失效 → 位置异常。

`rootPortal` 默认 false（wd-picker/types.ts:115 `rootPortal: makeBooleanProp(false)`），且即使设为 true 在抖音端也是 no-op（症状 1 证据②）。

### 修复建议

随症状 1 一起解决。门面层为 BasePicker 增加 rootPortal 透传（见任务 4），对抖音无害、对微信/支付宝/H5 有效。

---

## 症状 3：wd-toast / wd-dialog 点击无响应

### 3a. wd-toast：没有 show prop，只能函数式驱动

**证据①**：`node_modules/@wot-ui/ui/components/wd-toast/types.ts:78` 起的 `toastProps` **没有 show 字段**（脚本化验证：`toastProps contains show field: false`）。CLI 佐证（`pnpm exec wot info Toast --version 2.3.2`）：Props 列表为 selector/msg/direction/icon-name/...，**无 show**，Events 为空。

**证据②**：组件内部 `show` 是一个 ref（wd-toast.vue:65 `const show = ref<boolean>(false)`），唯一驱动源是注入的 provide：

- wd-toast.vue:82-83：`const toastOptionKey = getToastOptionKey(props.selector)` + `const toastOption = inject(toastOptionKey, ref<ToastOptions>(defaultOptions))`
- wd-toast.vue:86-94：`watch(() => toastOption.value, newVal => { reset(newVal) }, { deep: true, immediate: true })`
- 默认注入值 `defaultOptions = { duration: 2000, show: false }`（wd-toast/index.ts:13-16）——**无人 provide 时永远 show:false**。
- provide 方在 `useToast()`（wd-toast/index.ts:22-33，`provide(toastOptionKey, toastOption)`）。

**证据③**：门面写法违规——`src/ui/BaseFeedback.vue:25`：`<wd-toast :show="visible" :msg="msg" :icon-name="icon" />`。传了不存在的 show prop。产物佐证：`dist/build/mp-toutiao/ui/BaseFeedback.js` 编译为 `e.p({show:t.value,msg:a.value,"icon-name":s.value})`，wd-toast 声明 `props:e.toastProps`（无 show）→ show 被丢弃。**任何平台上 toast 都不会显示，与抖音无关。**

**次要风险（未验证）**：即使改对 API，wd-toast 的定位是 wd-transition 上的内联 `position:fixed; top:50%`（wd-toast.vue:100-110 transitionStyle），同样裸露在抖音宿主节点内，fixed 可能仍异常（当前症状未报告此现象，属预防性提示）。

**兜底证据（uni.showToast 可用性）**：
- 类型：`node_modules/@dcloudio/types/uni-app/uni/legacy/uni.d.ts:11178` `showToast(options: UniNamespace.ShowToastOptions): void`；11228 `hideToast(): void`；ShowToastOptions（4609-4629）icon 支持 `'success'|'loading'|'error'|'none'|'fail'`。
- 运行时：`dist/build/mp-toutiao/common/vendor.js` 中 uni 是 Proxy，get 兜底为 `ln(0,Wt(r,o(r,n[r])))` 且 `n=tt`——即 `uni.showToast` 运行时直接转发 `tt.showToast`（vendor.js 内 grep 'showToast' 字面零命中是**因为它是动态代理而非静态方法表**，这恰是转发机制存在的证据）。

### 3b. wd-dialog：2.3.2 无受控 show、无 emit、业务 props 是死代码

**证据①（props 消费面）**：对 `wd-dialog.vue` 全文 grep `props\.`，业务消费只有两处：

- 173 行：`return "wd-dialog__container " + props.customClass`
- 180 行：`getDialogDefaultOptionKey(props.selector)`
- 模板 11 行：`:root-portal="rootPortal"`

`dialogProps`（types.ts:287 起）虽声明了 title/msg/type/showErr 等字段，但**组件体从不读取**（模板渲染全部走 `dialogState.*`，dialogState 只由 `reset(option)` 从注入的 messageOption 派生；注入在 wd-dialog.vue:180-181，watch 在 382-390）。脚本化验证：`dialogProps contains show field: false`。CLI 佐证（`wot info Dialog`）：Props 只列 selector / root-portal / custom-class / custom-style，**Events 列表为空**。

**证据②（emit 零命中）**：`grep -n 'defineEmits|emit(' wd-dialog.vue` → 无输出。产物佐证：`dist/build/mp-toutiao/pages/_probe/wot-sample.ttml` 中 `<wd-dialog ... bindconfirm="${{A}}" bindcancel="${{B}}" bindupdateModelValue="${{C}}"/>`——Vue 把 @confirm/@cancel/v-model 编译成了监听，但组件永远不会触发。

**证据③（唯一驱动通道）**：show 状态来自 useDialog() 的 provide/inject：

- `components/wd-dialog/index.ts:34` `export function useDialog(...)`；provide 在 36-40 行；`show()` 返回 Promise：confirm 路径 resolve、cancel/modal/close 路径 reject（124-137 行）。
- 组件关闭时自己把 `dialogState.show = false`（handleConfirm 468-470、handleCancel 479-481），**不需要也不会通知外部**。

**结论**：探针页 `src/pages/_probe/wot-sample.vue:88` 的 `<wd-dialog v-model="dialogShow" title="确认操作" content="..." @confirm @cancel>` 里，v-model / content / @confirm / @cancel 全部不存在（title 虽是声明的 prop 但为死代码），dialogState.show 恒为 false → 点击无响应。**任何平台都无响应。**

### wd-dialog 组件式最小可用写法（含关闭按钮位置）

「组件式受控 `<wd-dialog :show>`」在 2.3.2 **不存在**；正确形态 = 页面挂载点 + useDialog() 函数式驱动（插槽定制内容）：

```vue
<script setup lang="ts">
import { useDialog } from "@wot-ui/ui"; // 经 composables/index.ts:16 转出
// ⚠️ 沿用原报告提醒：import useDialog 会把包内 .ts 拉进 vue-tsc 程序；
// 若 TS7053（common/util.ts:431）复现，改用构建期桥接或 .js 包装，实测定夺。

const dialog = useDialog(); // 与 <wd-dialog /> 同页 provide/inject 配对

async function openDialog() {
  try {
    const res = await dialog.confirm({
      title: "确认操作",
      msg: "这是对话框内容",
      showClose: true, // 右上角关闭图标（渲染点：wd-dialog.vue:14，消费 dialogState.showClose）
    });
    // res.action === 'confirm'，res.value 为输入值（prompt 型）
  } catch (err) {
    // cancel / modal / close 均 reject，err.action 标识来源
  }
}
</script>

<template>
  <!-- 挂载点：插槽定制内容（wot info Dialog：header/image/title/default/actions） -->
  <wd-dialog root-portal>
    <template #title>自定义标题</template>
    <view>自定义内容</view>
    <!-- actions 是作用域插槽，形参即关闭函数：confirm/cancel/close（wd-dialog.vue:56） -->
    <template #actions="{ confirm, cancel, close }">
      <button @click="cancel()">取消</button>
      <button @click="confirm()">确定</button>
    </template>
  </wd-dialog>
</template>
```

关闭按钮放置规则（均有源码行号）：
- **右上角 × 图标**：options 传 `showClose: true`，渲染点 wd-dialog.vue:14，点击走 `toggleModal('close')` → reject(action:'close')。
- **自定义按钮**：放 `#actions` 作用域插槽，直接调用形参 `cancel()`/`confirm()`/`close()`（wd-dialog.vue:56）。
- 默认底部按钮组（取消/确定）由 `cancelButtonProps`/`confirmButtonProps`/`confirmButtonText` 等 options 控制，不需要插槽；`showCancelButton`/`cancelButtonText` 等快捷属性在 index.ts 的 normalizeButtonProps 合并。

---

## 任务 4：BasePopup / BasePicker 的 root-portal 透传建议

### 事实

- wd-popup：`rootPortal: makeBooleanProp(false)`（wd-popup/types.ts:105）。模板双分支：`<wd-root-portal v-if="rootPortal">`（wd-popup.vue:2-33）/ `<view v-else>`（35 行起）。emits：close/click-modal 等（wot info Popup 佐证）。
- wd-picker：`rootPortal: makeBooleanProp(false)`（wd-picker/types.ts:115），透传给内部 wd-popup（wd-picker.vue:10）。
- wd-dialog：`rootPortal: makeBooleanProp(false)`（wd-dialog/types.ts:300），透传给 wd-popup（wd-dialog.vue:11）。
- **平台实现差异（本次实测）**：H5=teleport to body；微信/支付宝（非钉钉）=原生 `<root-portal>`；**抖音=普通 view，no-op**（症状 1 证据②③）。

### 建议

**门面新增 `rootPortal` prop，全平台默认 `true`**：

- 微信/支付宝/H5 端：获得真正的脱离文档流能力，符合弹层语义；wot 默认 false 只是保守缺省。
- 抖音端：no-op（多一个无样式 view 节点），无副作用；未来 wot 若补上抖音分支，门面无需再改即自动生效。
- 风险提示：H5 端 teleport to body 改变层叠上下文，若遇 z-index 问题可将门面默认改 false、由页面按需开启（本项目当前主目标 mp-toutiao，H5 风险暂不触发）。

**注意**：此透传**不能**解决症状 1/2（抖音端无效），只是不留下跨平台欠账。抖音端修复走候选 E 或候选 A。

---

## 修复清单（执行者照抄）

| # | 文件 | 位置 | 改动 |
|---|------|------|------|
| 1 | src/ui/BaseFeedback.vue | 全文（26 行） | 重写为 useToast() 驱动 + 抖音 uni.showToast 兜底（参考代码见下） |
| 2 | src/pages/_probe/wot-sample.vue | 第 17 行 `dialogShow` ref | 删除；改 `import { useDialog } from "@wot-ui/ui"` + `const dialog = useDialog()`（注意 TS7053 提醒） |
| 3 | src/pages/_probe/wot-sample.vue | 第 85 行「对话框」按钮 | @click 改调 `openDialog()`（函数式写法见 3b 节） |
| 4 | src/pages/_probe/wot-sample.vue | 第 88 行 `<wd-dialog v-model ...>` | 替换为 `<wd-dialog root-portal :show-close="true" />`（纯挂载点） |
| 5 | src/ui/BasePopup.vue | 第 5-13 行 props、第 34-40 行模板 | props 增加 `rootPortal?: boolean`（默认 true）；`<wd-popup>` 上加 `:root-portal="rootPortal"` |
| 6 | src/ui/BasePicker.vue | 第 10-19 行 props、第 49-57 行模板 | 同上，`<wd-picker>` 上加 `:root-portal="rootPortal"`（wd-picker 自带该 prop，types.ts:115） |
| 7 | （二选一）抖音端弹层根治 | 门面组件 #ifdef MP-TOUTIAO 分支 或 pnpm patch | 候选 A（门面自绘蒙层降级）或候选 E（patch 放开 virtualHost），均需真机回归 |

### BaseFeedback 重写参考（抖音分支用原生 toast 兜底）

```vue
<script setup lang="ts">
// 事实源：wd-toast 无 show prop（types.ts toastProps 无该字段），仅能 useToast() 函数式驱动
import { useToast } from "@wot-ui/ui";
import type { ToastIconType } from "@wot-ui/ui/components/wd-toast/types";

const toast = useToast(); // 本组件 setup 内 provide；子组件 <wd-toast /> inject（wd-toast.vue:82-83）

function show(text: string, iconName?: ToastIconType) {
  // #ifdef MP-TOUTIAO
  // 抖音兜底：wd-toast 无 rootPortal 机制、fixed 裸露在宿主节点内；uni.showToast 运行时转发 tt.showToast
  // （vendor.js Proxy 兜底 + @dcloudio/types uni.d.ts:11178；icon 值域见 4609-4629）
  uni.showToast({
    title: text,
    icon: iconName === "success" ? "success" : iconName === "loading" ? "loading" : "none",
  });
  // #endif
  // #ifndef MP-TOUTIAO
  toast.show({ msg: text, iconName, duration: 1500 });
  // #endif
}
function hide() {
  // #ifdef MP-TOUTIAO
  uni.hideToast();
  // #endif
  // #ifndef MP-TOUTIAO
  toast.close();
  // #endif
}
defineExpose<{ show: (text: string, iconName?: ToastIconType) => void; hide: () => void }>({ show, hide });
</script>

<template>
  <wd-toast />
</template>
```

（模板只留 `<wd-toast />` 挂载点；provide 由 useToast() 在本组件 setup 内完成，注入方 wd-toast 是其子组件，链路成立——wd-toast.vue:82 inject + wd-toast/index.ts:26-29 provide。）

---

## 证据附录

### A. 命令与关键输出摘录

```
$ pnpm exec wot info Toast --version 2.3.2        # 在 miniapp-vue3/ 下执行
Props: selector / msg / direction / icon-name / icon-size / loading-type / loading-color /
       loading-size / icon-color / position / z-index / cover / icon-class / class-prefix /
       css-icon / opened / closed / custom-class / custom-style
Events:（空）        # 无 show prop

$ pnpm exec wot info Dialog --version 2.3.2
Props: selector / root-portal / custom-class / custom-style
Events:（空）
Slots: header / image / title / default / actions

$ pnpm exec wot info Popup --version 2.3.2
Props: ... root-portal: boolean = false | 是否从页面结构中脱离出来，用于解决 fixed 失效问题 ...
Events: close / click-modal

$ pnpm exec wot info Picker --version 2.3.2
Props: v-model:visible / ... / root-portal: boolean = false
Events: confirm / cancel 等

$ cat dist/build/mp-toutiao/node-modules/@wot-ui/ui/components/wd-root-portal/wd-root-portal.ttml
<view class="${(a) + ' ' + 'wd-root-portal'}" style="${b}"><slot/></view>
# 抖音产物中 root-portal 是普通 view；全产物 grep '<root-portal' 零命中

$ grep -n 'transformTeleport' node_modules/@dcloudio/uni-mp-*/dist/uni.compiler.js
uni-mp-weixin/dist/uni.compiler.js:185:    uniCliShared.transformTeleport,
# uni-mp-toutiao 无命中；其 nodeTransforms 仅 transformRef/transformComponentLink（行 86-95）

$ node -e 脚本化检查 toastProps/dialogProps 是否含 show
toastProps contains show field: false
dialogProps contains show field: false
dialogProps contains title field: true    # 声明了但组件不消费（死 prop）

$ grep -n 'defineEmits|emit(' node_modules/@wot-ui/ui/components/wd-dialog/wd-dialog.vue
# 零输出 → 无任何 emit

$ grep -o 'options:{...}' dist/.../wd-root-portal/wd-root-portal.js
options:{addGlobalClass:!0,styleIsolation:"shared"}    # virtualHost 被条件编译剥离

$ head -c 200 dist/.../wd-popup/wd-popup.ttss
.wd-popup{position:fixed;max-height:100%;overflow-y:auto;background:...}    # fixed 已编译

$ grep uni 代理兜底（vendor.js）
get:(t,r)=>u(t,r)?t[r]:... :ln(0,Wt(r,o(r,n[r])))     # n=tt → uni.showToast 转发 tt.showToast
# grep 'showToast' 字面零命中 = 动态代理机制，非 API 缺失
```

### B. 关键源码行号索引

| 事实 | 位置 |
|------|------|
| root-portal 条件编译仅微信/支付宝（抖音排除） | wd-root-portal.vue:6-9, 15-19 |
| 抖音端所有 wot 组件禁用 virtualHost | wd-root-portal.vue:28-30、wd-popup.vue:71-74 等（模式统一） |
| uni 抖音运行时支持 virtualHost 及 triggerEvent 抹平 | uni-mp-toutiao/dist/uni.mp.esm.js:523, 1051-1060 |
| rootPortal prop 声明（默认 false） | wd-popup/types.ts:105、wd-picker/types.ts:115、wd-dialog/types.ts:300 |
| wot 自述 root-portal 用途=解决 fixed 失效 | wd-picker/types.ts:111-115 注释原文 |
| wd-picker 透传 root-portal 给 wd-popup | wd-picker.vue:10 |
| wd-toast show 仅由注入驱动 | wd-toast.vue:82-94（inject+watch）、index.ts:13-16（defaultOptions show:false）、22-33（useToast provide） |
| wd-toast fixed 定位实现 | wd-toast.vue:100-110（transitionStyle：position:fixed/top:50%） |
| wd-dialog 仅消费 customClass/selector | wd-dialog.vue:173, 180；注入 180-181；watch 382-390 |
| wd-dialog 关闭自闭环（无外部通知） | wd-dialog.vue:468-470, 479-481 |
| actions 作用域插槽形参 confirm/cancel/close | wd-dialog.vue:56 |
| showClose 图标渲染点 | wd-dialog.vue:14 |
| useDialog Promise resolve/reject | wd-dialog/index.ts:124-137 |
| useToast/useDialog 包级导出 | composables/index.ts:15-16 |
| uni.showToast/hideToast 类型 | @dcloudio/types uni.d.ts:11178, 11228, 4609-4629 |
| BaseFeedback 违规点 | src/ui/BaseFeedback.vue:25 |
| 探针页 dialog 违规点 | src/pages/_probe/wot-sample.vue:17, 85, 88 |
| wot 2.3.2 抖音平台支持度自述 | node_modules/@wot-ui/ui/package.json：小程序.字节跳动 = "u"（官方未承诺支持） |

### C. 明确标注「未验证」的事项

1. 抖音宿主节点导致 fixed 相对组件定位的运行时细节（未做真机 DOM 检查；症状吻合 + wot 注释佐证，但非直接观测）。
2. 抖音基础库是否原生支持 `<root-portal>` 组件（官方文档 SPA 抓取失败；编译器白名单不含此项）。
3. 候选 E（放开 virtualHost）在抖音真机的实际效果与副作用（slot 边界/样式穿透风险）。
4. wd-toast 改对 API 后在抖音端 fixed 定位是否正常（预防性提示，非已观测症状）。
5. uni.showToast 在 tma preview 真机的实际表现（类型与运行时转发链已证实，端上表现未实测）。
6. import useDialog 后 vue-tsc 是否复现 TS7053（common/util.ts:431）——沿用原报告挂账，执行时验证。
