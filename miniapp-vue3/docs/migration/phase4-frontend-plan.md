# Phase 4 前端部分·开工即执行清单（2026-09-17 立）

> **门禁**：Phase 4 入口＝**G3 通过**（当前仅差微信真机证据，见 `device-acceptance-checklist.md`）。
> **本文只列前端可独立完成的部分**（`P4-07/08/09/11/13`）；**后端合同类**（`P4-02/03/04/05/15`）按主人 2026-09-17 口径
> 「后端没开发」**挂起**，待后端出合同时再开工（`P4-01` 已决＝provider 隔离）。
> 目的：G3 一通过，按本文顺序执行，不再重复调研。

## 0. 范围（主人 2026-09-17 拍板）
抖音端＝**客片展示版**：11 页 / 3 tab；**AI 六页不注册**；「我的」只留「我的喜欢」；**零支付改造**。
小红书（MP-XHS）：**本轮不做**（`P4-17` 需登记批准与范围）。

## 1. 执行顺序与交付（逐条对应 phases）

| 步 | 条目 | 交付物 | 验收方式 |
|---|---|---|---|
| 1 | **P4-11** context/env 识别 | `src/ports/context.ts` 已有闭集＋`ui-platform.ts`；补：**未知 env 失败关闭**的显式用例；`AppID/provider` 不跨端混用（平台 appid 只来自该端 profile） | 单测（未知 env／未知 platform 拒绝） |
| 2 | **P4-07** 平台实现骨架 | `src/platform/{toutiao,xhs}/`（按需）：transport 复用 `platform/uni`；**平台专属能力按需**（抖音无支付/无订阅/无防截屏 ⇒ 不建空实现） | 单测：目录内零 `uni.request` 直连；`scan-platform-usage` 通过 |
| 3 | **P4-08** native UI bridge | `src/platform/toutiao/ui-bridge/`：分享按钮（`tt.onShareAppMessage` 如需）、头像/昵称（若抖音版「我的」需要） | 组件单测 + 能力矩阵登记 |
| 4 | **P4-09** tabBar | 抖音走**原生 tabBar list**（现产物已是）；补「每端各自官方方式」的断言与注释 | 产物断言（`app.json.tabBar`） |
| 5 | **P4-13** 三端构建与 verify | 扩展 `verify-target.mjs`（已有 `forbiddenRoutes`／tt 指纹／appid 非占位）；补 **xhs** 分支与 CI 步骤 | `scripts/e2e-build.mjs <platform> both` 三端各跑 |
| 6 | **P4-10** 定稿 | 能力矩阵把 `unknown` 依真机结果收敛为 `supported/unsupported` 并补版本依据 | 真机（`P4-14`） |

## 2. 明确不做（避免越界）
- 不注册 AI 六页到抖音（拍板）｜不做支付/登录跨端（后端未开发，D2）｜不做小红书整列（未批准）｜不引入第二套 UI 库（P1-26）

## 3. 需要的输入
| 输入 | 用途 | 状态 |
|---|---|---|
| G3 真机结论 | 解除 Phase 4 门禁 | ⏳ 主人/测试同学执行中 |
| 抖音 AppID | 真机出码（`tma preview --qrcode-output`） | ⏳ 待提供（构建侧已用合成 Profile 打通 E2E） |
| 各平台后台合法域名 | `P4-06` | ⏳ 待提供 |
