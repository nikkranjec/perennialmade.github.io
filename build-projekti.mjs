// Prebere vse mape v projekti/ in zapiše projekti/projekti.json (to bere spletna stran).
// Zagon: node build-projekti.mjs   (GitHub Action ga požene sam ob vsakem pushu v projekti/)
import { readdirSync, readFileSync, writeFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), 'projekti');
const VIDEO = ['.mp4', '.webm', '.mov', '.m4v'], IMAGE = ['.webp', '.jpg', '.jpeg', '.png', '.avif', '.gif'];
const nat = (a, b) => a.localeCompare(b, 'sl', { numeric: true });
const url = (dir, file) => 'projekti/' + encodeURIComponent(dir) + '/' + encodeURIComponent(file);

const out = [];
for (const dir of readdirSync(root).filter(d => statSync(join(root, d)).isDirectory()).sort(nat)) {
  const files = readdirSync(join(root, dir)).filter(f => !f.startsWith('.')).sort(nat);
  const ext = f => extname(f).toLowerCase();
  const cover = files.find(f => /^naslovnica\.[a-z0-9]+$/i.test(f) && IMAGE.includes(ext(f)));
  const videos = files.filter(f => VIDEO.includes(ext(f))), images = files.filter(f => IMAGE.includes(ext(f)) && f !== cover);
  const p = { dir, name: dir.replace(/^\d+[-_ ]*/, '').replace(/[-_]+/g, ' '), desc: '', thumb: cover || images[0] || '', videos, images: cover ? images : images.slice(1), youtube: '', ratio: 0 };
  const txt = files.find(f => f.toLowerCase() === 'projekt.txt');
  if (txt) {
    // vrstica 1 = naslov, naslednje vrstice = opis; neobvezno: "youtube: ID" in "razmerje: 2.35" (ali 16/9)
    const lines = readFileSync(join(root, dir, txt), 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/).map(l => l.trim());
    const desc = [];
    lines.forEach((l, i) => {
      const m = l.match(/^(youtube|razmerje)\s*:\s*(.+)$/i);
      if (m && m[1].toLowerCase() === 'youtube') p.youtube = (m[2].match(/(?:v=|youtu\.be\/|embed\/)?([\w-]{11})\s*$/) || [])[1] || '';
      else if (m) { const [a, b] = m[2].split('/').map(Number); p.ratio = b ? a / b : a || 0; }
      else if (i === 0) p.name = l || p.name;
      else if (l) desc.push(l);
    });
    p.desc = desc.join(' ');
  }
  if (!p.thumb) { console.warn('preskočeno (ni naslovnice ali slike):', dir); continue; }
  out.push({ ...p, thumb: url(dir, p.thumb), videos: videos.map(f => url(dir, f)), images: p.images.map(f => url(dir, f)) });
}
writeFileSync(join(root, 'projekti.json'), JSON.stringify(out, null, 2) + '\n');
console.log(out.length + ' projektov -> projekti/projekti.json');
