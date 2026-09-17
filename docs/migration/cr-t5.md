# T5 公共层独立 CR 报告（P2-10）

> 2026-09-17 · 审查范围：infrastructure/{http,storage,repositories}、application/{auth-coordinator,brand-hub-controller,use-consent}、ports 全部 ＋ 8 个配套测试文件。
> 说明：原派 CR 子 agent（`d43c87dc`）**真失败**（注册表 ready＋零产出＋worktree 干净，与既往两次误报不同）⇒ 本 CR 由秘书内联完成；审查发现已修复并补回归测试，**独立性有限、留待主人/团队二审**。

## 一、P2-10 三明示重点

| 重点 | 结论 | 依据 |
|---|---|---|
| 越权 | ✅ 通过 | Bearer 仅 authRequired 注入；X-Brand-Id 仅品牌作用域且有值（默认品牌不硬塞，P2-02 红线测试锁定）；toggleLike authRequired／getLikeStatus 公开／wxLogin 换票入口不带 Bearer——三者与旧端语义一致；versioned storage 平台/Profile 归属校验（跨 Profile 隔离测试锁定） |
| 错误码丢失 | **🟡 1 条（已修）** | 业务失败映射丢失信封 message：ports HttpResponse 原无 message 字段、client 传空串给 mapBusinessFailure ⇒ **已修**：HttpResponse 补 `message?` ＋ client 透传；4001→INSUFFICIENT_CREDITS 映射无旁路（domain 单一事实源）；上传非法 JSON 安全失败信息完整 |
| 队列悬空 | **🔴 1 条（已修）** | auth-coordinator 换票 Promise **reject 路径未接**：`.then` 只接成功 ⇒ exchanging 永久卡 true、waiters 永不唤醒＝登录队列悬空 ⇒ **已修**：补 rejection 处理器（failAll(exchange-failed)＋复位 exchanging），回归测试验证 reject 后第二次 waitForLogin 可正常发起换票 |

## 二、合同一致性

- repositories 8 wrapper 的 method/path/参数位与 contracts.md 冻结值逐条一致（P2-09 已用真实 provider 核对 6 项；详情入参 albumId+type 已按实测修正）。
- 重放策略：读 idempotent／写 never／wxLogin never，与 P2-05 语义一致。

## 三、测试有效性

- 全部套件先红后绿落地（各轮记录在案）；本轮 CR 修复新增 2 条回归测试（reject 不悬挂／message 透传），改断言会红。
- provider spec 门控 RUN_PROVIDER（默认 skipped），CI 无网络依赖。

## 四、结论

**T5 公共层 CR 通过（1🔴＋1🟡 均已修复＋回归测试）**。T5（P2-01~10）**全部完成**；下一步＝T6 首条纵切片（首页→相册列表→详情→返回）。
