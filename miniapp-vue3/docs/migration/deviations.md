# 已知偏差登记（P0-09；行为修正必须写明产品依据与测试，不盲保缺陷）

1. **package/lock 历史差异**：以 preflight §0 实测哈希为准（lock 60a176ad…／pkg 9f522349…）。
2. **finalScore 类型缺失**：旧端 AI 推荐结果 `finalScore` 运行时有值、类型未声明 ⇒ 新端补齐类型（嘉仪 PR#1 已对齐后端降序口径）。
3. **下载 paid 与权益到账竞态**：旧端 payGuard.uts 统一支付门闩＋到账双条件 paid&&balance>0＋续跑前重拉余额＋不自动二次拉起支付 ⇒ 新端保语义。
4. **品牌馆开关刷新口径（plan §7 有意修正，2026-09-17 校正表述）**：新端**冷启动（首页 onMounted）**刷新开关，**同上下文在飞请求去重**（brand-hub-controller 按 scopeRevision 去重、切品牌作废在飞）；旧端 60s 内存缓存＋下拉/热恢复强制刷新**不再保留**（controller 无缓存，且当前**未实现** onPullDownRefresh——原表述「下拉/热恢复强制刷新」与代码不符，此处更正）。**2026-09-17 P2-20 追加**：品牌馆页切品牌后回首页，由**首页 onShow 检测品牌基线变化**触发 bumpScope＋复位入口开关＋重载（旧端 index:218-232 同序，非偏差），保证「入口显隐」与「品牌数据」同步，杜绝入口显示而进入被拦。
5. **vitest 版本适配（2026-09-17 实测）**：vitest 5.0.1 需 vite `./module-runner` 导出（vite 6+），与冻结的 vite 5.2.8 不兼容（启动即 ERR_PACKAGE_PATH_NOT_EXPORTED）⇒ **降级锁 vitest 3.2.4**（其 dependencies.vite＝^5.0.0），不为测试框架盲升 vite。
6. **工具链测试自身两处 bug（2026-09-17 首跑抓出并修复）**：①精确版判定正则写错（`[^~]` 语义相反）②`@dcloudio/types@^3.4.8` 属独立版本线被误判跨线 ⇒ 修正为显式首字符判定＋发行线检查限定 `3.0.0-` 族；**负向 fixture 先红后绿**，10/10 通过。
7. **品牌馆页解析口径（P2-20 CR 🟡4，已知低风险）**：gate 取件的严格性由 client `isBusinessSuccess`（0/200 均成功）承担，旧端 `pageConfig.uts:11` 为严格 `code===200` ⇒ 若接口返回 `code=0` 旧端隐藏、新端可能放行（实测返回 200，概率低）。`domain/brand-hub.parseBrandHubResponse` 保留为旧端口径的规格测试锚点，生产链路已不经它。
8. **webview URL 准入加固（P2-22，**有意修正**）**：旧端 `pages/webview/index.uvue:24-26` 对 `url` 参数**零校验**（`decodeURIComponent` 后直接透传 `<web-view :src>`）⇒ 可打开任意外部 URL（含 `javascript:`/`data:` 等）。**产品依据**：phases P2-22「webview 只允许既有合法 URL 策略…不放开任意 URL」。**新端口径**：仅 `http(s)` 且 host 精确命中或其子域（白名单＝Profile `apiBases` 派生域，兜底 `lanmei66.cloud`/`crazyma99.xyz`；沿用 `imageLoader.uts:33-38` 精确主域口径防子串伪装）；非法/缺失 → 不渲染 web-view＋toast「链接不可打开」＋800ms 返回。协议（policies/user、policies/privacy）与联系信息（ServiceContact 电话/二维码）走**站内页**，不经 webview；第三方 URL 一律拒绝。**测试**：`tests/unit/t29-webview.spec.ts`（6 例：白名单主域/子域/大小写/端口/userinfo 放行；外域/伪装子串/`javascript:`/`data:`/`file:`/相对路径/空值拒绝；页面拒绝路径＋返回按钮）。

9. **推荐空载荷判失败＝有意比旧端更严（2026-09-17，T9b CR 🟡3）**：旧端判据为 `(code===0||200) && res.data`（`aiRecommendLoading:146`），在 JS 真值语义下 `{}` 与 `{analysis:null,recommendations:[]}` **都算成功**（转场到**空白结果页**）；新端 `application/ai-recommend-flow.ts` 对「整包全空」判 `BUSINESS` 失败并给「推荐结果为空，请重试」。**无误伤**：真正合法的「有 `analysis`＋空 `recommendations`」仍 `ok:true`。**产品理由**：空白结果页对用户是死路，失败提示＋重试入口更可用；如需逐字等价请指示。
10. **finalScore 数字字符串口径（2026-09-17，T9b CR 🟡5，可选登记）**：旧端 `v-if="rec.finalScore > 0"` 在 `"90"`（字符串）时成立会显示「90分」；新端 `normalizeFinalScore` 仅接受 `number` ⇒ 字符串不显示。现行后端 DTO 为 number，**实务等价**。

11. **字体全局类未定义（2026-09-17 补登，CR 🔴2 触发）**：旧端 `App.uvue` 全局类 `font-noto-serif`／`harmony`（宋体/鸿蒙字族）在新端**未定义**，样式沿用既有口径：字号按旧值**字面量**还原（如旧 `--font-size-body=24rpx` ≠ 新 `tokens.semantic.fontSizeBody=32rpx`，不得混映射），字体族差异由后续主题批次统一处理。**产品依据**：字体族缺失属视觉细节，不阻断功能闭环；**测试**：各批页面单测按字面量断言字号（如 `t22`／`t26`／`t32`），本表 `platform-capability-matrix.md` 引用本条。此条为补齐「矩阵引用不存在的登记」的缺口而补登（此前该偏差**未登记**，违反「偏差必须进 deviations」纪律）。

12. **店铺封面追加 `lazy-load`（2026-09-17，性能偏差；排查「模拟器卡死」时引入）**：旧端 `components/PhotoGrid/PhotoGrid.uvue` 的店铺封面（`<image mode="aspectFill">`）**无懒加载**（`grep lazy-load` = 0），新端初版按忠实移植同样未加；但首页会**一次性渲染全部店铺封面**，在微信模拟器/低端机上首屏容易长卡。**改法**：仅给该 `<image>` 追加 `lazy-load`——**只改变加载时机**，不改布局类名、尺寸、圆角与点击行为。**产品依据**：性能与可感知卡顿；**测试**：`tests/components/ui-contract.spec.ts`、`t6-index.spec.ts` 与三平台构建均通过（无断言依赖图片加载时机）。
