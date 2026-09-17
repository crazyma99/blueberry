// P1-14~19 Profile 生成前置测试（先红后绿）
import { describe, expect, it } from "vitest";
import { readFileSync, mkdtempSync, writeFileSync, mkdirSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseProfileText, validateProfile, LEGACY_REQUIRED_FIELDS } from "../../scripts/profile-schema.mjs";
import { generateProfile } from "../../scripts/generate-profile.mjs";

const root = resolve(__dirname, "../..");
const rawA = JSON.parse(readFileSync(resolve(root, "tests/fixtures/profiles/A.json"), "utf-8"));
const rawB = JSON.parse(readFileSync(resolve(root, "tests/fixtures/profiles/B.json"), "utf-8"));

describe("parseProfileText（不 eval/source，fail-closed）", () => {
  it("解析引号行、跳过注释与空行", () => {
    const raw = parseProfileText("# 注释\n\nPROJECT_KEY=\"p1\"\nAPP_CODE=\"c1\"\n");
    expect(raw).toEqual({ PROJECT_KEY: "p1", APP_CODE: "c1" });
  });
  it("值按字面处理（不求值）", () => {
    expect(parseProfileText('APP_CODE="2+2"').APP_CODE).toBe("2+2");
  });
  it("畸形行报错：小写键/无引号值", () => {
    expect(() => parseProfileText("lower_case=1")).toThrow();
    expect(() => parseProfileText("NO_QUOTE=value")).toThrow();
  });
  it("注入表达式拒绝：$( )／反引号／${}", () => {
    expect(() => parseProfileText('BRAND_NAME="$(id)"')).toThrow();
    expect(() => parseProfileText('BRAND_NAME="`id`"')).toThrow();
    expect(() => parseProfileText('BRAND_NAME="${HOME}"')).toThrow();
  });
});

describe("validateProfile（P1-14 旧字段对齐＋平台 appid；P1-15 env 语义；P1-16 失败用例）", () => {
  it("微信/release 正常：17 页注册表＋apiBases 映射＋appid 取微信", () => {
    const r = validateProfile(rawA, { platform: "mp-weixin", environment: "release" });
    expect(r.ok).toBe(true);
    const p = r.profile;
    expect(p.appid).toBe("wx000000000000000a");
    expect(p.apiBases.release).toBe("https://lanmei66.cloud/");
    expect(p.apiBases.trial).toBe("https://crazyma99.xyz/");
    expect(p.apiBases.develop).toBe("https://crazyma99.xyz/");
    expect(p.pageRegistry.length).toBe(17);
    expect(p.features.mineMenu.length).toBe(2);
  });
  it("抖音缺 MP_TOUTIAO_APPID 报错——不回落微信 appid（P1-14）", () => {
    const noTt: Record<string, unknown> = { ...rawA }; delete noTt.MP_TOUTIAO_APPID;
    const r = validateProfile(noTt, { platform: "mp-toutiao", environment: "trial" });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toContain("MP_TOUTIAO_APPID");
  });
  it("抖音正常：appid=tt…／11 页注册表／我的页菜单只留收藏", () => {
    const r = validateProfile(rawA, { platform: "mp-toutiao", environment: "trial" });
    expect(r.ok).toBe(true);
    expect(r.profile.appid).toBe("tt000000000000000a");
    expect(r.profile.pageRegistry.length).toBe(11);
    expect(r.profile.features.mineMenu).toEqual(["favorites"]);
    expect(r.profile.features.navStyle).toBe("default");
  });
  it("小红书缺 MP_XHS_APPID 拒绝", () => {
    expect(validateProfile(rawA, { platform: "mp-xhs", environment: "release" }).ok).toBe(false);
  });
  it("未知 environment 拒绝（不落生产也不默认 trial，P1-15）", () => {
    expect(validateProfile(rawA, { platform: "mp-weixin", environment: "production" }).ok).toBe(false);
    expect(validateProfile(rawA, { platform: "mp-weixin", environment: "prod" }).ok).toBe(false);
  });
  it("CONTACT_QR_SRC：包内 static/ 路径合法（huahua 实况）；../ 穿越与非白名单 host 拒绝", () => {
    const staticQr = { ...rawA, CONTACT_QR_SRC: "/static/contactQRCode.jpg" };
    expect(validateProfile(staticQr, { platform: "mp-weixin", environment: "release" }).ok).toBe(true);
    const traversal = { ...rawA, CONTACT_QR_SRC: "../../etc/passwd" };
    expect(validateProfile(traversal, { platform: "mp-weixin", environment: "release" }).ok).toBe(false);
    const evil = { ...rawA, CONTACT_QR_SRC: "https://evil.example.com/x.jpg" };
    expect(validateProfile(evil, { platform: "mp-weixin", environment: "release" }).ok).toBe(false);
  });
  it("缺 APP_CODE／非法 host／路径穿越 PROJECT_KEY／注入值 均拒绝（P1-16）", () => {
    const noCode: Record<string, unknown> = { ...rawA }; delete noCode.APP_CODE;
    expect(validateProfile(noCode, { platform: "mp-weixin", environment: "release" }).ok).toBe(false);
    const badHost = { ...rawA, API_BASE_URL: "https://evil.example.com/" };
    expect(validateProfile(badHost, { platform: "mp-weixin", environment: "release" }).ok).toBe(false);
    const traversal = { ...rawA, PROJECT_KEY: "../evil" };
    expect(validateProfile(traversal, { platform: "mp-weixin", environment: "release" }).ok).toBe(false);
    const injected = { ...rawA, BRAND_NAME: "$(id)" };
    expect(validateProfile(injected, { platform: "mp-weixin", environment: "release" }).ok).toBe(false);
  });
});

describe("generateProfile（P1-17 A→B→A 幂等＋只写 projectRoot；P1-18 结构化生成）", () => {
  it("A→B→A：A 两次字节一致、digest 相同；B 不同；sourceRoot 不被修改", () => {
    const tmp = mkdtempSync(join(tmpdir(), "profile-"));
    const sourceRoot = join(tmp, "tpl"); mkdirSync(sourceRoot);
    writeFileSync(join(sourceRoot, "sentinel.txt"), "keep");
    const pa = validateProfile(rawA, { platform: "mp-weixin", environment: "release" }).profile;
    const pb = validateProfile(rawB, { platform: "mp-weixin", environment: "release" }).profile;
    const pr1 = join(tmp, "proj1"); mkdirSync(pr1);
    const rA1 = generateProfile({ profile: pa, sourceRoot, projectRoot: pr1 });
    const jsonA1 = readFileSync(join(pr1, "generated/profile.json"), "utf-8");
    const pr2 = join(tmp, "proj2"); mkdirSync(pr2);
    generateProfile({ profile: pb, sourceRoot, projectRoot: pr2 });
    const jsonB = readFileSync(join(pr2, "generated/profile.json"), "utf-8");
    expect(jsonB).not.toBe(jsonA1);
    const rA2 = generateProfile({ profile: pa, sourceRoot, projectRoot: pr1 });
    expect(readFileSync(join(pr1, "generated/profile.json"), "utf-8")).toBe(jsonA1);
    expect(rA2.digest).toBe(rA1.digest);
    expect(readdirSync(sourceRoot)).toEqual(["sentinel.txt"]);
    expect(readFileSync(join(sourceRoot, "sentinel.txt"), "utf-8")).toBe("keep");
    expect(rA1.generatedFiles).toEqual(["generated/profile.json", "generated/profile.config.ts"]);
    expect(existsSync(join(pr1, "generated/profile.config.ts"))).toBe(true);
  });
});

describe("profile-map.json（不暗中弃字段）", () => {
  it("14 个旧字段全部有消费者映射", () => {
    const map = JSON.parse(readFileSync(resolve(root, "docs/migration/profile-map.json"), "utf-8"));
    for (const f of LEGACY_REQUIRED_FIELDS) {
      expect(Object.keys(map.fields)).toContain(f);
    }
  });
});

describe("parseProfileText 兼容 JSON 形态（2026-09-17：合成 fixture 驱动 E2E 的前置）", () => {
  it("⭐JSON fixture 可解析且能通过 validateProfile；非法 JSON/数组拒绝", () => {
    const text = readFileSync(resolve(__dirname, "../fixtures/profiles/A.json"), "utf-8");
    const raw = parseProfileText(text);
    expect(Object.keys(raw).length).toBeGreaterThan(10);
    expect(raw.PROJECT_KEY).toBe("profile-a");
    const v = validateProfile(raw, { platform: "mp-toutiao", environment: "trial" });
    expect(v.ok, JSON.stringify(v.errors)).toBe(true);
    expect(() => parseProfileText("{ not json }")).toThrow(/malformed profile JSON/);
    expect(() => parseProfileText("[1,2]")).toThrow(/must be an object/);
  });
});
