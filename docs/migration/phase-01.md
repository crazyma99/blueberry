# Phase 1 回执（phase-01.md）——G1 验收与流水线证据

> 2026-09-17 · 对应 phases 文档 P1-29~37；数据全部本机实测，可复算。

## G1 完整复跑（本机，2026-09-17）

| 步骤 | 命令 | 结果 |
|---|---|---|
| 固定锁安装 | `pnpm install --frozen-lockfile` | exit 0（206ms，store 命中） |
| 类型检查 | `pnpm run typecheck` | exit 0 |
| 测试 | `pnpm exec vitest run tests/unit tests/components tests/pipeline` | **98/98，9 文件，exit 0** |
| 微信构建 | `pnpm run build:mp-weixin` | exit 0 |
| 抖音构建 | `pnpm run build:mp-toutiao` | exit 0 |
| 旧端 src 零改动 | `git diff 95528cd HEAD -- src/` | **空**（迁移红线） |

## build-target / verify-target 真实调用与 A/B 产物哈希（P1-35）

| Profile | appid | appCode | profileDigest | generatedProfileDigest | tokenDigest | artifact sha256(前16) | manifest sha256(前16) |
|---|---|---|---|---|---|---|---|
| blueberry | wxb19ad7426dfb8bd4 | blueBerry | 2d8fb058a854af90… | e8bbdeb8f09e4dd9… | 55a65558fc17…（同源） | **3a12a5eb49637d17** | cc1410c176066009 |
| huahua | wxd3933d928ffed10d | huahua | 813335054759a088… | 9f46bdc8a0779232… | 55a65558fc17…（同源） | **dea9a5c3037bfb14** | 96ba6cc73511a093 |

- 两份 release-manifest 均 verify.ok=true（七查：app.json/app.js/路由集合/appid/导航/引擎指纹/残留扫）。
- **交叉残留实测 0**：blueberry 产物 grep「花花旅拍」0 命中；huahua 产物 grep「蓝莓」0 命中。
- 隔离目录 `.work/build/vue3/<profile>/mp-weixin/269603cbf3d3/<digest12>/<runId>/`；`.work` 已入根 .gitignore；**未上传**。

## CI 双车道（P1-36，`.github/workflows/migration-ci.yml`）
- **old-end-regression**：旧端单测 55 用例（纯 node，不装依赖）＋「旧端 src 零改动」红线校验（diff 基线 95528cd）。
- **new-end-suite**：pnpm 11.7.0 + Node 24 + frozen install → typecheck → vitest 全量 → 三平台构建 → 产物 artifact 留证（7 天）。
- **publish-placeholder**：`if: false` 硬停（GitHub Actions 表达式原样写入 yaml），须主人授权后才可能运行；**全文件 0 处 secret 引用**（PR 无 secret 车道）。

## P1-37 独立 CR 状态
Profile/路径/数据隔离独立 CR 待办：重点＝validateBuildRequest 闭集完整性、allocateWorkDir 不可穿越、applyProfile 只写隔离目录、verify 七查无自证循环（expectedRoutes 已改源码取值）。16 条负向用例已覆盖主要攻击面；完整独立 CR 报告随下一轮补。

## 遗留（如实登记）
- T4 真机三症状根因与处置选项见 `docs/migration/wot-realdevice-investigation.md`，**待主人拍板 A/B/C**。
- P1-36 workflow 未在远端跑过（分支推送后由 GitHub Actions 首跑验证）。
