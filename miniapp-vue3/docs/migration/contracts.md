# 接口合同台账（P1-03 建账 · 冻结发生在 Phase 2/T5，本文件随迁移推进逐条填实）

> 状态口径：`pending`（名单已锁，明细未冻结）／`frozen`（method/path/header/业务code 已核对冻结）。

## 已冻结的跨端规则（P1-09，T2 落地前先锁语义）

- HTTP 业务码 **4001 → `INSUFFICIENT_CREDITS`**；保留 businessCode／安全 message／requestId。
- 普通 BUSINESS 错误**不得**触发支付流程（支付门闩语义，旧端 payGuard.uts）。

## wrapper 台账（34 条，逐条在 Phase 2 迁移时冻结）

| wrapper | method/path | 状态 |
|---|---|---|
| （34 条名单见 ../migration/inventory.md；本表随 T5–T9 逐条补实） | — | pending |

## 端口合同（T2 产出，占位）

`RequestContext/Result/IdentityTicket/IdentityPort/StoragePort/ClockPort` 沿用母方案；HTTP/upload 端口明确 timeout、取消、requestContext 快照与 replayPolicy；PaymentPort 只回平台面板结果，不改业务余额。
