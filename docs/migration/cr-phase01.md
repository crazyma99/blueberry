# Phase 1 独立 CR（P1-37）：Profile／路径／数据隔离审查

> 2026-09-17 · 审查对象：`miniapp-vue3/scripts/{build-target,verify-target,profile-schema,generate-profile,generate-tokens}.mjs` ＋ `tests/pipeline/*`；方法＝逐函数读代码对合同，与 16 条负向用例、双 Profile 真实构建证据交叉验证。只读审查，本报告为唯一产出。

## 一、逐项结论

| 审查项 | 结论 | 依据 |
|---|---|---|
| BuildRequest 闭集 | ✅ 通过 | engine 仅 vue3（legacy 拒绝）；platform/env 闭集；9 字段必填；runId/profileKey/sourceCommit/digest 字符集正则——负向用例 7 条全失败实测 |
| 路径隔离（realpath） | ✅ 通过 | sourceRoot/profilePath 必须 realpath 于 repoRoot 内；projectRoot 必须位于 repoRoot/.work 下；`/tmp` 逃逸与 `../evil` 穿越均被拒（测试锁定） |
| run 目录唯一性 | ✅ 通过 | allocateWorkDir 对已存在非空目录抛错；同 runId 并发第二者必失败（测试锁定） |
| 数据来源验证 | ✅ 通过 | profileDigest 与 profilePath 实际内容 sha256 比对；tokenDigest 与 tokens/source.json 实际生成 digest 比对——两者不符即抛，install 之前拦截 |
| applyProfile 只写隔离目录 | ✅ 通过 | 仅编辑 projectDir/src/{manifest,pages}.json；源目录 sentinel 实测未动（T3a/T3b 双重验证）；写回丢失 JSONC 注释属隔离副本可接受行为 |
| verify 无自证循环 | ✅ 通过（已修） | expectedRoutes 曾从产物自读（恒过）——T3b 已改从源码 pages.json 取阶段期望集合；其余六查（appid/导航/引擎指纹/残留）均命中产物文件而非源码 |
| token/配置生成幂等 | ✅ 通过 | generate-tokens 幂等字节一致＋digest 稳定；generate-profile A→B→A 字节一致（测试锁定） |

## 二、已知限制（3 条，如实登记，不在本轮修）

1. **allocateWorkDir 存在 TOCTOU 窗口**：existsSync 非空检查与 mkdirSync 之间理论上有并发竞态（两个进程同时通过检查）。当前单机串行使用下无实际风险；若未来 CI 并行同 runId，建议改 `mkdir`（非 recursive）＋ EEXIST 错误处理。已由「同 runId 第二者失败」测试覆盖主要面。
2. **verifyTarget 的残留扫描无 symlink 防护**：walk() 不解 symlink。artifact 目录由本流水线自产（模板白名单内无 symlink），风险低；若未来模板引入 symlink 需加 lstat 判断。
3. **forbiddenResidues 由调用者传入**：属信任输入（构建请求方＝内部流水线）。若未来暴露为外部可调 API，需改为服务端固定策略。

## 三、与 G1 复跑的交叉验证

- G1 全绿（frozen 0／TC 0／98-98／双平台构建 0／旧端 src CLEAN）见 `phase-01.md`；本 CR 未发现需要回退 G1 结论的问题。
- 双 Profile 真实构建交叉残留 0（blueberry 产物无「花花旅拍」、huahua 产物无「蓝莓」）＝数据隔离实证。

## 四、结论

**Profile／路径／数据隔离 CR 通过**，附 3 条已知限制登记。Phase 1 工程底座（T1/T2/T3a/T3b/T4 工具侧）全部完成；剩余＝T4 真机闭环（方案 A 修复中）与 P1-28 最终审阅。
