// 工具链规则校验器（P1-05）：纯函数，供真实工程与负向 fixture 共用。
// 依据：plan §5.2（engine/platform/env 闭集）＋ phases P1-05（同发行线/运行时一致/闭集/lock 一致）。

/** 本轮批准的目标平台闭集（小红书保留编译目标，仍属批准集合） */
export const APPROVED_PLATFORMS = ["mp-weixin", "mp-toutiao", "mp-xhs"] as const;
export type ApprovedPlatform = (typeof APPROVED_PLATFORMS)[number];

/** 本工程冻结的 DCloud 发行线（P1-01） */
export const DCLOUD_LINE = "3.0.0-5020420260813003";

export interface PkgShape {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
}

export function isApprovedPlatform(name: string): name is ApprovedPlatform {
  return (APPROVED_PLATFORMS as readonly string[]).includes(name);
}

/** 所有 @dcloudio/* 依赖必须落在同一条发行线 */
export function dcloudLineIssues(pkg: PkgShape): string[] {
  const all = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  // 发行线只约束 uni 运行时/编译器族（版本号形如 3.0.0-<时间戳>）；
  // @dcloudio/types 等独立版本线的类型包显式豁免（否则 ^3.4.8 会被误判为跨线）。
  const versions = new Set(
    Object.entries(all)
      .filter(([name]) => name.startsWith("@dcloudio/"))
      .filter(([, version]) => /^3\.0\.0-/.test(version))
      .map(([, version]) => version),
  );
  if (versions.size === 0) return ["未找到任何 @dcloudio/* 依赖"];
  if (versions.size > 1) {
    return ["@dcloudio/* 跨发行线混装: " + [...versions].sort().join(" / ")];
  }
  const only = [...versions][0];
  if (only !== DCLOUD_LINE) {
    return ["@dcloudio/* 发行线 " + only + " ≠ 冻结值 " + DCLOUD_LINE];
  }
  return [];
}

/** Vue 运行时与 @vue/runtime-core 的版本约束必须一致 */
export function vueConsistencyIssues(pkg: PkgShape): string[] {
  const vue = pkg.dependencies?.["vue"];
  const runtimeCore = pkg.devDependencies?.["@vue/runtime-core"];
  if (!vue) return ["dependencies.vue 缺失"];
  if (!runtimeCore) return ["devDependencies.@vue/runtime-core 缺失"];
  return vue === runtimeCore ? [] : ["vue (" + vue + ") 与 @vue/runtime-core (" + runtimeCore + ") 约束不一致"];
}

/** 批准平台必须各有 dev/build 脚本；闭集外平台不得作为本轮目标 */
export function platformScriptIssues(pkg: PkgShape, targets: readonly string[]): string[] {
  const scripts = pkg.scripts ?? {};
  const issues: string[] = [];
  for (const target of targets) {
    if (!isApprovedPlatform(target)) {
      issues.push("目标平台不在批准闭集: " + target);
      continue;
    }
    for (const prefix of ["dev", "build"]) {
      if (!scripts[prefix + ":" + target]) {
        issues.push("缺少脚本 " + prefix + ":" + target);
      }
    }
  }
  return issues;
}

/** lockfile 必须存在且包含全部精确钉版依赖（防“声明与锁不一致”） */
export function lockConsistencyIssues(pkg: PkgShape, lockText: string | null): string[] {
  if (lockText === null) return ["lockfile 缺失"];
  const all = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  const issues: string[] = [];
  for (const [name, version] of Object.entries(all)) {
    const exact = version.charAt(0) !== "^" && version.charAt(0) !== "~";
    if (exact && !lockText.includes(name + "@" + version)) {
      issues.push("lockfile 未包含钉版依赖 " + name + "@" + version);
    }
  }
  return issues;
}
