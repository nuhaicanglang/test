import { mkdir, writeFile, readFile } from 'node:fs/promises';

const cssUrl = 'https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@0,500;0,600;0,700;1,700;1,800&display=swap';
const response = await fetch(cssUrl, { headers: { 'User-Agent': 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36' } });
if (!response.ok) throw new Error(`字体请求失败: ${response.status}`);
const css = await response.text();
const blocks = css.split('/* latin */').slice(1).map((block) => block.slice(0, block.indexOf('}') + 1).trim());
if (blocks.length !== 5) throw new Error(`字体样式数量不正确: ${blocks.length}`);
await mkdir('public/fonts', { recursive: true });
const localBlocks = [];
for (let i = 0; i < blocks.length; i++) {
  const block = blocks[i];
  const url = block.match(/url\(([^)]+)\)/)?.[1];
  if (!url?.startsWith('https://fonts.gstatic.com/')) throw new Error('未知字体来源');
  const font = await fetch(url);
  if (!font.ok) throw new Error(`字体下载失败: ${font.status}`);
  const name = `barlow-condensed-${i}.woff2`;
  await writeFile(`public/fonts/${name}`, new Uint8Array(await font.arrayBuffer()));
  localBlocks.push(block.replace(url, `/fonts/${name}`));
}
const license = await fetch('https://raw.githubusercontent.com/google/fonts/main/ofl/barlowcondensed/OFL.txt');
if (!license.ok) throw new Error('无法取得字体许可证');
await writeFile('public/fonts/OFL.txt', await license.text(), 'utf8');
const path = 'src/style.css';
const current = await readFile(path, 'utf8');
const importStatement = current.split('\n')[0];
if (!importStatement.startsWith('@import url(')) throw new Error('CSS 已转换，停止重复修改');
await writeFile(path, current.replace(importStatement, localBlocks.join('\n')), 'utf8');
console.log('5 种字体样式已保存到本地，许可证已保存。');
