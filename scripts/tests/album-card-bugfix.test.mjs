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
check('.desc 改为横排 + align-items:center', /\.desc\{[\s\S]{0,300}flex-direction: row;[\s\S]{0,160}align-items: center;/.test(DD));
check('左列 .desc-main 存在（flex:1 + min-width:0）', /\.desc-main\{[\s\S]{0,200}flex: 1;/.test(DD) && DD.includes('min-width: 0;'));
check('右列 .desc-tryon 存在（flex-shrink:0）', /\.desc-tryon\{[\s\S]{0,160}flex-shrink: 0;/.test(DD));
check('AI 试衣标签已移出 .desc-row（成为 .desc 的直接子节点）', DD.includes('class="desc-tryon"') && !/desc-row[\s\S]{0,400}ai-tryon-tag/.test(DD));
check('两处网格均已完成该结构（desc-main 出现 ≥2 次）', (DD.match(/class="desc-main"/g) || []).length >= 2);

console.log('\n[② 标题截断：≥7 字显示前 6 字 + ...]');
check('formatAlbumTitle(title : any) : string 存在', /formatAlbumTitle\(title : any\) : string/.test(DD));
check('规则为 length >= 7 → substring(0, 6) + ...', /length >= 7[\s\S]{0,80}substring\(0, 6\) \+ '.{3}'/.test(DD));
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
check('点赞图标↔数量：.collect gap 10rpx（demoDetail + favorites）', /\.collect\s*\{[^}]*gap: 10rpx/.test(DD) && /\.collect\s*\{[^}]*gap: 10rpx/.test(FAV));
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

console.log('\n结果：' + pass + ' 通过 / ' + fail + ' 失败');
process.exit(fail === 0 ? 0 : 1);
