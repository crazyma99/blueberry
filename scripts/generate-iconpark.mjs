// 生成 IconPark SVG 静态资产（统一接入字节 IconPark 图标库）
// 用法：npm run generate:icons（或 node scripts/generate-iconpark.mjs）
// 输出：src/static/iconpark/*.svg —— 金色 #F1CD91 / outline 主题 / strokeWidth 4
// 依赖：devDependencies @icon-park/svg（仅构建期生成用，不进小程序产物）
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Home, User, Left, Right, Down, Check, Like, Star, Search, ShareThree, TagOne, Protect, FaceRecognition, Eyes, Puzzle, Picture, Plan, ListSuccess, Shop } from '@icon-park/svg';
const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/static/iconpark');
fs.mkdirSync(outDir, { recursive: true });
const GOLD = '#F1CD91';
const gold = (fn) => fn({ theme: 'outline', size: 48, strokeWidth: 4, strokeLinecap: 'round', strokeLinejoin: 'round', fill: [GOLD] });
const files = {
  'home.svg': gold(Home), 'price.svg': gold(TagOne), 'mine.svg': gold(User),
  'back.svg': gold(Left), 'down.svg': gold(Down), 'right.svg': gold(Right),
  'check.svg': gold(Check), 'like.svg': gold(Like), 'star.svg': gold(Star),
  'search.svg': gold(Search), 'share-three.svg': gold(ShareThree),
  // 等待页 Tips 胶囊：盾牌+勾（安全提示语义）
  'protect.svg': gold(Protect),
  // 等待页步骤条节点：每步语义图标（2026-09-14 主人指示：序号 1/2/3/4 一律换成语义图标）
  'face-scan.svg': gold(FaceRecognition),   // 1 分析照片面部细节
  'eyes.svg': gold(Eyes),                   // 2 分析五官类型
  'puzzle.svg': gold(Puzzle),               // 3 试衣：正在匹配面部
  'picture.svg': gold(Picture),             // 4 试衣：生成试衣图像
  'plan.svg': gold(Plan),                   // 3 推荐：生成推荐方案
  'list-success.svg': gold(ListSuccess),    // 4 推荐：生成推荐结果
  // 首页左上角「品牌馆」入口按钮（2026-09-15 主人指示：原文字「馆」改 IconPark 图标）
  'shop.svg': gold(Shop)
};
for (const [name, svg] of Object.entries(files)) { fs.writeFileSync(path.join(outDir, name), svg); }
const filled = Like({ theme: 'filled', size: 48, fill: [GOLD, '#FFFFFF'] });
fs.writeFileSync(path.join(outDir, 'like-filled.svg'), filled);
// 底部 Tab：激活态用「面性」同款图标（默认态为上面的 outline 版；2026-09-15 主人指示）
// 第二个填充位用底栏底色 #160F04（= 页面底色）而不是白色 —— 否则 Home 的「门」、Tag 的「孔」
// 会渲染成白块（CR 🟡），深色底上应是「镂空」观感
const filledGold = (fn) => fn({ theme: 'filled', size: 48, fill: [GOLD, '#160F04'] });
// ⚠️ IconPark filled 变体把第二个填充位硬编码为 #FFF（不吃 fill[1]），
// 深色底栏上会渲染成白块 ⇒ 生成后统一把 #FFF 换成底色 #160F04，得到「镂空」观感（CR 🟡）
const tabFilled = (fn) => filledGold(fn).replace(/#FFF/g, '#160F04');
fs.writeFileSync(path.join(outDir, 'home-filled.svg'), tabFilled(Home));
fs.writeFileSync(path.join(outDir, 'price-filled.svg'), tabFilled(TagOne));
fs.writeFileSync(path.join(outDir, 'mine-filled.svg'), tabFilled(User));
// 等待页步骤条「已完成」节点：金底上的白勾（金色勾在金色圆上不可见，故单列一个白色变体）
const checkWhite = Check({ theme: 'outline', size: 48, strokeWidth: 5, strokeLinecap: 'round', strokeLinejoin: 'round', fill: ['#FFFFFF'] });
fs.writeFileSync(path.join(outDir, 'check-white.svg'), checkWhite);
console.log('IconPark SVGs generated to', outDir);