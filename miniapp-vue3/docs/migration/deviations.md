# 已知偏差登记（P0-09；行为修正必须写明产品依据与测试，不盲保缺陷）

1. **package/lock 历史差异**：以 preflight §0 实测哈希为准（lock 60a176ad…／pkg 9f522349…）。
2. **finalScore 类型缺失**：旧端 AI 推荐结果 `finalScore` 运行时有值、类型未声明 ⇒ 新端补齐类型（嘉仪 PR#1 已对齐后端降序口径）。
3. **下载 paid 与权益到账竞态**：旧端 payGuard.uts 统一支付门闩＋到账双条件 paid&&balance>0＋续跑前重拉余额＋不自动二次拉起支付 ⇒ 新端保语义。
4. **品牌馆开关刷新口径（plan §7 有意修正，2026-09-17 校正表述）**：新端**冷启动（首页 onMounted）**刷新开关，**同上下文在飞请求去重**（brand-hub-controller 按 scopeRevision 去重、切品牌作废在飞）；旧端 60s 内存缓存＋下拉/热恢复强制刷新**不再保留**（controller 无缓存，且当前**未实现** onPullDownRefresh——原表述「下拉/热恢复强制刷新」与代码不符，此处更正）。**2026-09-17 P2-20 追加**：品牌馆页切品牌后回首页，由**首页 onShow 检测品牌基线变化**触发 bumpScope＋复位入口开关＋重载（旧端 index:218-232 同序，非偏差），保证「入口显隐」与「品牌数据」同步，杜绝入口显示而进入被拦。
5. **vitest 版本适配（2026-09-17 实测）**：vitest 5.0.1 需 vite `./module-runner` 导出（vite 6+），与冻结的 vite 5.2.8 不兼容（启动即 ERR_PACKAGE_PATH_NOT_EXPORTED）⇒ **降级锁 vitest 3.2.4**（其 dependencies.vite＝^5.0.0），不为测试框架盲升 vite。
6. **工具链测试自身两处 bug（2026-09-17 首跑抓出并修复）**：①精确版判定正则写错（`[^~]` 语义相反）②`@dcloudio/types@^3.4.8` 属独立版本线被误判跨线 ⇒ 修正为显式首字符判定＋发行线检查限定 `3.0.0-` 族；**负向 fixture 先红后绿**，10/10 通过。
7. **品牌馆页解析口径（P2-20 CR 🟡4，已知低风险）**：gate 取件的严格性由 client `isBusinessSuccess`（0/200 均成功）承担，旧端 `pageConfig.uts:11` 为严格 `code===200` ⇒ 若接口返回 `code=0` 旧端隐藏、新端可能放行（实测返回 200，概率低）。`domain/brand-hub.parseBrandHubResponse` 保留为旧端口径的规格测试锚点，生产链路已不经它。
