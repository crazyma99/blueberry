import fs from 'fs';
import path from 'path';
import { Home, User, Left, Right, Down, Check, Like, Star, Search, ShareThree, TagOne } from '@icon-park/svg';
const outDir = '/home/majunhi/blueberry/src/static/iconpark';
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
console.log('done');