// P1-05 工具链测试：真实工程全绿；不一致 fixture 必须被校验器判红。
// 纪律：负向用例先存在（断言“必须检出问题”），校验器漏检即测试失败。
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  APPROVED_PLATFORMS,
  dcloudLineIssues,
  isApprovedPlatform,
  lockConsistencyIssues,
  platformScriptIssues,
  vueConsistencyIssues,
  type PkgShape,
} from "../pipeline/toolchain-rules";

const root = resolve(__dirname, "../..");
const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf-8")) as PkgShape;
const lockText = readFileSync(resolve(root, "pnpm-lock.yaml"), "utf-8");

describe("真实工程（必须全绿）", () => {
  it("@dcloudio/* 同发行线且等于冻结值", () => {
    expect(dcloudLineIssues(pkg)).toEqual([]);
  });
  it("vue 与 @vue/runtime-core 约束一致", () => {
    expect(vueConsistencyIssues(pkg)).toEqual([]);
  });
  it("三个批准平台各有 dev/build 脚本", () => {
    expect(platformScriptIssues(pkg, APPROVED_PLATFORMS)).toEqual([]);
  });
  it("lockfile 存在且含全部钉版依赖", () => {
    expect(lockConsistencyIssues(pkg, lockText)).toEqual([]);
  });
});

describe("负向 fixture（校验器漏检即红）", () => {
  it("跨发行线混装必须被检出", () => {
    const broken: PkgShape = {
      dependencies: { "@dcloudio/uni-app": "3.0.0-5020420260813003" },
      devDependencies: { "@dcloudio/vite-plugin-uni": "3.0.0-4060620250520001" },
    };
    const issues = dcloudLineIssues(broken);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]).toContain("跨发行线混装");
  });
  it("发行线偏离冻结值必须被检出", () => {
    const drifted: PkgShape = { dependencies: { "@dcloudio/uni-app": "3.0.0-4060620250520001" } };
    const issues = dcloudLineIssues(drifted);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]).toContain("≠ 冻结值");
  });
  it("vue 运行时/类型不一致必须被检出", () => {
    const broken: PkgShape = {
      dependencies: { vue: "^3.4.21" },
      devDependencies: { "@vue/runtime-core": "^3.5.0" },
    };
    expect(vueConsistencyIssues(broken).length).toBe(1);
  });
  it("闭集外平台必须被拒绝", () => {
    expect(isApprovedPlatform("mp-kuaishou")).toBe(false);
    expect(isApprovedPlatform("mp-douyin")).toBe(false);
    expect(isApprovedPlatform("mp-weixin")).toBe(true);
    const issues = platformScriptIssues(pkg, ["mp-kuaishou"]);
    expect(issues[0]).toContain("不在批准闭集");
  });
  it("缺脚本必须被检出", () => {
    const broken: PkgShape = { scripts: { "dev:mp-weixin": "uni -p mp-weixin" } };
    const issues = platformScriptIssues(broken, ["mp-weixin"]);
    expect(issues).toContain("缺少脚本 build:mp-weixin");
  });
  it("lockfile 缺失/漏钉版依赖必须被检出", () => {
    expect(lockConsistencyIssues(pkg, null)).toEqual(["lockfile 缺失"]);
    const issues = lockConsistencyIssues(pkg, "lockfileVersion: '9.0'\n");
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]).toContain("未包含钉版依赖");
  });
});
