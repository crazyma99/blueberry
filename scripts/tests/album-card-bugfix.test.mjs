/**
 * 相册卡片 bugfix 契约测试（主人 2026-09-15 指示；在 main 上、接入 rice 前的代码基线上实施）
 * 运行：node scripts/tests/album-card-bugfix.test.mjs
 *
 * 覆盖四条：①标题+点赞 与 右侧 AI 试衣按钮 垂直居中 ②标题≥7字→6字+… ③点赞按下即时反馈（乐观更新）
 *          ④触感反馈 ⑤两处间距（点赞图标↔数量、标题↔点赞模块）
 * 设计：只断言结构与行为契约，不把实现细节写死成单点字符串。
 */
import { readFileSync } from 'node:fs';

const ROOT = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf8');
const DD = read('src/pages/demoDetail/index.uvue');
const FAV = read('src/pages/favorites/index.uvue');

let pass = 0, fail = 0;
const check = (label, ok, extra = '') => {
  if (ok) { pass++; console.log('  PASS ' + label); }
  else { fail++; console.log('  FAIL ' + label + (extra ? ' → ' + extra : '')); }
};

console.log('[① 对齐：标题+点赞 与 右侧 AI 试衣按钮 垂直居中]');
check('.desc 左侧竖排（不依赖 flex 行布局）', /\.desc\{[\s\S]{0,400}flex-direction: column;/.test(DD));
check('左列 .desc-main 给右侧按钮留占位（padding-right）', /\.desc-main\{[\s\S]{0,200}padding-right: 140rpx;/.test(DD));
check('右列 .desc-tryon 绝对定位锚右 + translateY(-50%) 垂直居中', /\.desc-tryon\{[\s\S]{0,220}position: absolute;[\s\S]{0,160}top: 50%;[\s\S]{0,120}transform: translateY\(-50%\);/.test(DD));
check('AI 试衣标签已移出 .desc-row（成为 .desc 的直接子节点）', DD.includes('class="desc-tryon"') && !/desc-row[\s\S]{0,400}ai-tryon-tag/.test(DD));
check('两处网格均已完成该结构（desc-main 出现 ≥2 次）', (DD.match(/class="desc-main"/g) || []).length >= 2);

console.log('\n[② 标题截断：≥7 字显示前 6 字 + ...]');
check('formatAlbumTitle(title : any) : string 存在', /formatAlbumTitle\(title : any\) : string/.test(DD));
check('规则落在公共工具 src/utils/text.uts（码点计数 + 前 6 字符 + ...）', /count >= 6[\s\S]{0,120}substring\(0, cut\) \+ '\.\.\.'/.test(read('src/utils/text.uts')));
check('两处网格标题均调用 formatAlbumTitle', (DD.match(/formatAlbumTitle\(item/g) || []).length >= 2);

console.log('\n[③ 点赞即时反馈：乐观更新 + 失败回滚]');
check('先本地翻转状态（nextLiked）', /nextLiked = !prevLiked/.test(DD));
check('在 await 请求之前就写入 item.liked / likeCount', /item\.liked = nextLiked[\s\S]{0,160}item\.likeCount = nextLiked[\s\S]{0,200}await toggleLike/.test(DD));
check('先播动效（playLikeAnim 在请求之前）', /playLikeAnim\(item\.id, nextLiked\)[\s\S]{0,200}await toggleLike/.test(DD));
check('失败回滚到 prevLiked / prevCount', /catch \(err\)[\s\S]{0,220}item\.liked = prevLiked[\s\S]{0,120}item\.likeCount = prevCount/.test(DD));
check('成功以服务端返回为准', /res\.code === 200 && res\.data[\s\S]{0,120}item\.likeCount = res\.data\.likeCount/.test(DD));

console.log('\n[④ 触感反馈]');
check('已 import haptics 工具', DD.includes("from '../../utils/haptics.uts'"));
check('doToggleLike 内调用 hapticTap()', /async doToggleLike[\s\S]{0,600}hapticTap\(\)/.test(DD));

console.log('\n[⑤ 间距]');
check('点赞图标↔数量间距（demoDetail + favorites，由新断言覆盖实现方式）', true);
check('标题↔点赞模块：.desc-row margin-top 10rpx（demoDetail + favorites）', /\.desc-row\s*\{[^}]*margin-top: 10rpx/.test(DD) && /\.desc-row\s*\{[^}]*margin-top: 10rpx/.test(FAV));
check('长标题单行省略（避免顶到 AI 标签）', /\.desc \.photoName\{[\s\S]{0,200}text-overflow: ellipsis/.test(DD));

console.log('\n[回归保护：rice 接入已整体撤除]');
check('demoDetail 无 rice-grid 残留', !DD.includes('rice-grid'));
check('src/uni_modules/rice-ui 不存在', (() => { try { readFileSync(new URL('src/uni_modules/rice-ui/package.json', ROOT)); return false; } catch { return true; } })());

console.log('\n[标签配平]');
for (const [name, s] of [['demoDetail', DD], ['favorites', FAV]]) {
  const vo = (s.match(/<view[\s>]/g) || []).length;
  const vc = (s.match(/<\/view>/g) || []).length;
  check(name + ' view 开合配对', vo === vc, vo + '/' + vc);
}


// ============ CR 🟡8 补充：真行为测试（执行源码逻辑，而非仅正则 lint） ============
console.log('\n[行为测试：formatAlbumTitle 真执行 + 表驱动边界]');
const rawUtil = read('src/utils/text.uts');
// 从 .uts 抽出函数体，去掉 UTS 类型注解后在 Node 里执行
const fnStart = rawUtil.indexOf('export function formatAlbumTitle');
// 工具文件只含该函数，直接取到文件末尾
let fnSrc = rawUtil.slice(fnStart)
  .replace('export function', 'function')
  .replace('(title : any) : string', '(title)')
  .replace(/const s : string =/g, 'const s =')
  .replace(/let (\w+) : number =/g, 'let $1 =');
const fmt = new Function('return (' + fnSrc + ')')();
const cases = [
  ['6 字不截', '一二三四五六', '一二三四五六'],
  ['7 字截为 6+…', '一二三四五六七', '一二三四五六...'],
  ['空串', '', ''],
  ['null', null, ''],
  ['undefined', undefined, ''],
  ['数字（非字符串容错）', 1234567, ''],
  ['emoji 按码点计数（4 个 emoji 不截）', '😀😀😀😀', '😀😀😀😀'],
  ['emoji 7 个 → 前 6 + …', '😀😀😀😀😀😀😀', '😀😀😀😀😀😀...'],
  ['混排不切在代理对中间', 'a😀😀😀😀', 'a😀😀😀😀'],
  ['全角字符计数正确', '①②③④⑤⑥⑦', '①②③④⑤⑥...'],
];
for (const [label, input, want] of cases) {
  const got = fmt(input);
  check('formatAlbumTitle ' + label, got === want, JSON.stringify(got) + ' ≠ ' + JSON.stringify(want));
}

console.log('\n[CR 🟡 修复项断言]');
check('失败反馈两条路径都有 toast（else + catch）', (DD.match(/操作失败，请重试/g) || []).length >= 2, String((DD.match(/操作失败，请重试/g) || []).length));
check('并发 seq 守卫：请求前写 seq', /const seq = \(item\.likeSeq == null \? 0 : item\.likeSeq\) \+ 1[\s\S]{0,120}item\.likeSeq = seq/.test(DD));
check('并发 seq 守卫：旧响应被丢弃', /item\.likeSeq !== seq[\s\S]{0,120}return/.test(DD));
check('间距用 margin-left 而非 flex gap（旧 WebView 兼容）', /\.stat-count\s*\{[^}]*margin-left: 10rpx/.test(DD) && /\.stat-count\s*\{[^}]*margin-left: 10rpx/.test(FAV));
check('两页均无 flex gap 残留于 .collect', !/\.collect\s*\{[^}]*gap:/.test(DD) && !/\.collect\s*\{[^}]*gap:/.test(FAV));
check('favorites 也走标题截断', FAV.includes('formatAlbumTitle(item.title)') && FAV.includes('formatAlbumTitleUtil'));
check('两页共用公共工具 src/utils/text.uts', read('src/utils/text.uts').includes('export function formatAlbumTitle'));

console.log('\n[品牌馆展示入口开关：超管配置 → 刷新/重新进入生效（2026-09-15）]');
const HOME = read('src/pages/index/index.uvue');

// ① 结构契约：onShow 内做一次「只查开关」的轻量刷新，且带 30s 节流时间戳
check('data 里有节流时间戳 brandHubCheckedAt', /brandHubCheckedAt:\s*0/.test(HOME));
const onShowBlock = (() => {
  const i = HOME.indexOf('onShow() {');
  return i < 0 ? '' : HOME.slice(i, HOME.indexOf('onLoad', i) > i ? HOME.indexOf('onLoad', i) : i + 3000);
})();
const onShowBody = (() => {
  const i = HOME.indexOf('onShow() {');
  if (i < 0) return '';
  const open = HOME.indexOf('{', i);
  let depth = 0, end = -1;
  for (let k = open; k < HOME.length; k++) {
    if (HOME[k] === '{') depth++;
    else if (HOME[k] === '}') { depth--; if (depth === 0) { end = k; break; } }
  }
  return HOME.slice(open + 1, end).replace(/\/\/[^\n]*/g, '');
})();
check('onShow 里 refreshBrandHubEntry 是独立语句（CR：防被 if(false) 包裹的死代码）', /^[ \t]*this\.refreshBrandHubEntry\(\)[ \t]*$/m.test(onShowBody));
const rhStart = HOME.indexOf('async reloadHomeData() {');
const rhStamp = HOME.indexOf('this.brandHubCheckedAt = Date.now()', rhStart);
const rhFetch = HOME.indexOf('Promise.all', rhStart);
check('reloadHomeData 发起即占住节流窗口（早于请求发起）', rhStart >= 0 && rhStamp > rhStart && rhFetch > rhStamp, 'stamp@' + rhStamp + ' fetch@' + rhFetch);
check('seq 守卫：两个写者分别取号', /const hubSeq = this\.brandHubSeq \+ 1/.test(HOME) && /const seq = this\.brandHubSeq \+ 1/.test(HOME));
check('seq 守卫：过期响应被丢弃', /this\.brandHubSeq !== seq[\s\S]{0,120}return/.test(HOME) && /this\.brandHubSeq === hubSeq/.test(HOME));
check('品牌切换先作废在飞查询', /this\.brandHubEnabled = false[\s\S]{0,140}this\.brandHubSeq = this\.brandHubSeq \+ 1/.test(HOME));
check('开关查询仍走 force（跳 60s 缓存）', /const on = await isBrandHubEnabled\(true\)/.test(HOME));
check('节流窗口为 30s', /now - this\.brandHubCheckedAt < 30000/.test(HOME));

// ② 行为契约：把真实方法体抽出来执行（真跑，不做字符串匹配）
const mStart = HOME.indexOf('async refreshBrandHubEntry() {');
let body = '';
if (mStart >= 0) {
  const open = HOME.indexOf('{', mStart);
  let depth = 0, end = -1;
  for (let i = open; i < HOME.length; i++) {
    if (HOME[i] === '{') depth++;
    else if (HOME[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  body = HOME.slice(open + 1, end);
}
check('能从源码抽到 refreshBrandHubEntry 方法体', body.includes('brandHubCheckedAt') && body.includes('await isBrandHubEnabled(true)'));
const makeRefresh = new Function('isBrandHubEnabled', 'return (async function () {' + body + '})');

let queries = 0, nextValue = true;
const fakeNow = { t: 1000000 };
const RealDateNow = Date.now;
Date.now = () => fakeNow.t;
const ctx = { brandHubCheckedAt: 0, brandHubEnabled: false, brandHubSeq: 0 };
const refresh = makeRefresh(async () => { queries++; return nextValue; });
(async () => {
  await refresh.call(ctx);
  check('首次调用：发查询并写入开关值', queries === 1 && ctx.brandHubEnabled === true, 'queries=' + queries);
  await refresh.call(ctx);
  check('30s 内再次调用：被节流、不重复查询', queries === 1, 'queries=' + queries);
  fakeNow.t += 29000;
  await refresh.call(ctx);
  check('29s 后仍被节流', queries === 1, 'queries=' + queries);
  fakeNow.t += 2000;
  nextValue = false;
  await refresh.call(ctx);
  check('超过 30s：重新查询并跟随最新值（关→隐藏）', queries === 2 && ctx.brandHubEnabled === false, 'queries=' + queries + ' enabled=' + ctx.brandHubEnabled);

  // 并发守卫（CR 🟡-5）：refresh 在飞时若已有更新的写入，迟到的响应必须被丢弃
  ctx.brandHubCheckedAt = 0; // 放开节流，制造一次新的 refresh
  let release = null;
  const refreshSlow = makeRefresh(() => new Promise((res) => { release = res; }));
  const inflight = refreshSlow.call(ctx);
  ctx.brandHubSeq = ctx.brandHubSeq + 1; // 模拟 reloadHomeData 取到更新的序号
  ctx.brandHubEnabled = true;            // 并已写入新结果
  release(false);                        // Q1 迟到返回 false
  await inflight;
  check('迟到响应不覆盖更新的结果（seq 守卫）', ctx.brandHubEnabled === true, 'enabled=' + ctx.brandHubEnabled);
  Date.now = RealDateNow;

  console.log('\n[标签配平（先剥注释再计数，避免注释里的字面标签干扰）]');
  const stripComments = (s) => s.replace(/<!--[\s\S]*?-->/g, '');
  for (const [name, s] of [['demoDetail', stripComments(DD)], ['favorites', stripComments(FAV)]]) {
    const vo = (s.match(/<view[\s>]/g) || []).length;
    const vc = (s.match(/<\/view>/g) || []).length;
    check(name + ' view 开合配对（剥注释后）', vo === vc, vo + '/' + vc);
  }
  console.log('\n结果：' + pass + ' 通过 / ' + fail + ' 失败');
  process.exit(fail === 0 ? 0 : 1);
})();
