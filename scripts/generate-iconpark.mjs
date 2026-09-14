// 生成 IconPark SVG 静态资产（统一接入字节 IconPark 图标库）
// 用法：npm run generate:icons（或 node scripts/generate-iconpark.mjs）
// 输出：src/static/iconpark/*.svg —— 金色 #F1CD91 / outline 主题 / strokeWidth 4
// 依赖：devDependencies @icon-park/svg（仅构建期生成用，不进小程序产物）
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Home, User, Left, Right, Down, Check, Like, Star, Search, ShareThree, TagOne } from '@icon-park/svg';
const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/static/iconpark');
fs.mkdirSync(outDir, { recursive: true });
const GOLD = '#F1CD91';
const gold = (fn) => fn({ theme: 'outline', size: 48, strokeWidth: 4, strokeLinecap: 'round', strokeLinejoin: 'round', fill: [GOLD] });
const files = {
  'home.svg': gold(Home), 'price.svg': gold(TagOne), 'mine.svg': gold(User),
  'back.svg': gold(Left), 'down.svg': gold(Down), 'right.svg': gold(Right),
  'check.svg': gold(Check), 'like.svg': gold(Like), 'star.svg': gold(Star),
  'search.svg': gold(Search), 'share-three.svg': gold(ShareThree)
};
for (const [name, svg] of Object.entries(files)) { fs.writeFileSync(path.join(outDir, name), svg); }
const filled = Like({ theme: 'filled', size: 48, fill: [GOLD, '#FFFFFF'] });
fs.writeFileSync(path.join(outDir, 'like-filled.svg'), filled);
console.log('IconPark SVGs generated to', outDir);