# Profile 整包构建留档（P1-35「核对各自 manifest 及 hash」）

> 生成方式：`node scripts/e2e-build.mjs mp-toutiao both`（**只用合成 fixture A/B，不触碰真实 Profile/凭证**）后，
> 解析各 run 的 `release-manifest.json` 自动汇总。原始清单位于 git 忽略的 `.work/build/vue3/<profileKey>/…/<runId>/release-manifest.json`。

| # | profileKey | platform | appid | 期望路由数 | verify.ok | manifest sha256(前16) | runId |
|---|---|---|---|---|---|---|---|
| 1 | `profile-a` | `mp-toutiao` | `tt000000000000000a` | 12 | True | `7eae803be2c553c0` | `e2e-A-mp-toutiao-mu5d72qo` |
| 2 | `profile-a` | `mp-toutiao` | `tt000000000000000a` | 12 | True | `2a53bb9b8f054559` | `e2e-mp-toutiao-mu5d51dc` |
| 3 | `profile-a` | `mp-toutiao` | `tt000000000000000a` | 12 | True | `67a08ee24029ebfc` | `e2e-tt-mu5d3awz` |
| 4 | `profile-b` | `mp-toutiao` | `tt000000000000000b` | 12 | True | `a4a814ab963c20cd` | `e2e-B-mp-toutiao-mu5d7609` |

## 结论（据上表）

- **Profile 隔离成立**：profileKey ∈ {profile-a, profile-b}，appid ∈ {tt000000000000000a, tt000000000000000b}（A/B 各自注入，互不串用）
- **平台作用域成立**：抖音侧期望路由数 **[12]**（＝11 业务＋探针；AI 六页不在其内）
- **产物校验全绿**：`verify.ok` ∈ {True, True, True, True}
- ⚠️ **hash 口径说明**：manifest 内含 `runId`/工作目录等本次运行信息 ⇒ **同一 Profile 多次运行的 sha256 本就不同**；
  跨 Profile 比较应以 `appid`/`profileKey`/期望路由数等**语义字段**为准（上表已列），而非直接比 hash。
- ⚠️ **仍未做**：用**获准的实际 Profile** 做微信/抖音**工具打开验证**（需真实 Profile＋平台工具，属工具/真机侧）。
