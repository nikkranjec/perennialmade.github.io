// Prebere vse mape v projekti/ in zapiše projekti/projekti.json (to bere spletna stran).
// Zagon: node build-projekti.mjs   (GitHub Action ga požene sam ob vsakem pushu v projekti/)
import { readdirSync, readFileSync, writeFileSync, statSync, openSync, readSync, closeSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), 'projekti');
const VIDEO = ['.mp4', '.webm', '.mov', '.m4v'], IMAGE = ['.webp', '.jpg', '.jpeg', '.png', '.avif', '.gif'];
const nat = (a, b) => a.localeCompare(b, 'sl', { numeric: true });
const url = (dir, file) => 'projekti/' + encodeURIComponent(dir) + '/' + encodeURIComponent(file);

// Velikosti se preberejo tukaj (iz glave datotek), da stran ob nalaganju ničesar ne meri. Vrne razmerje širina/višina ali 0.
const rd = (fd, pos, len) => { const buf = Buffer.alloc(len); const n = readSync(fd, buf, 0, len, pos); return buf.subarray(0, n); };
function imageRatio(path) {
  const fd = openSync(path, 'r');
  try {
    const h = rd(fd, 0, 64); let w = 0, hh = 0;
    if (h.toString('latin1', 1, 4) === 'PNG') { w = h.readUInt32BE(16); hh = h.readUInt32BE(20); }
    else if (h.toString('latin1', 0, 4) === 'RIFF' && h.toString('latin1', 8, 12) === 'WEBP') {
      const t = h.toString('latin1', 12, 16);
      if (t === 'VP8X') { w = 1 + h.readUIntLE(24, 3); hh = 1 + h.readUIntLE(27, 3); }
      else if (t === 'VP8L') { const v = h.readUInt32LE(21); w = (v & 0x3fff) + 1; hh = ((v >> 14) & 0x3fff) + 1; }
      else if (t === 'VP8 ') { w = h.readUInt16LE(26) & 0x3fff; hh = h.readUInt16LE(28) & 0x3fff; }
    } else if (h[0] === 0xff && h[1] === 0xd8) {
      const all = readFileSync(path); let i = 2;
      while (i + 9 < all.length) { if (all[i] !== 0xff) { i++; continue; } const m = all[i + 1]; if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) { hh = all.readUInt16BE(i + 5); w = all.readUInt16BE(i + 7); break; } i += 2 + all.readUInt16BE(i + 2); }
    }
    return w && hh ? w / hh : 0;
  } finally { closeSync(fd); }
}
function videoRatio(path) {
  const fd = openSync(path, 'r'), size = statSync(path).size;
  try {
    let pos = 0, moov = null;
    while (pos + 8 <= size) { const h = rd(fd, pos, 16); let len = h.readUInt32BE(0), hl = 8; if (len === 1) { len = Number(h.readBigUInt64BE(8)); hl = 16; } if (!len) len = size - pos; if (h.toString('latin1', 4, 8) === 'moov') { moov = [pos + hl, pos + len]; break; } pos += len; }
    if (!moov) return 0;
    const buf = rd(fd, moov[0], moov[1] - moov[0]);
    const boxes = (s, e, type, fn) => { for (let q = s; q + 8 <= e;) { const l = buf.readUInt32BE(q); if (l < 8) break; if (buf.toString('latin1', q + 4, q + 8) === type) { const r = fn(q + 8, q + l); if (r) return r; } q += l; } return 0; };
    return boxes(0, buf.length, 'trak', (ts, te) => boxes(ts, te, 'tkhd', s => {
      const mo = s + (buf[s] === 1 ? 52 : 40), a = buf.readInt32BE(mo), bb = buf.readInt32BE(mo + 4), w = buf.readUInt32BE(mo + 36) / 65536, hh = buf.readUInt32BE(mo + 40) / 65536;
      return w && hh ? (a === 0 && bb !== 0 ? hh / w : w / hh) : 0;   // 90/270° rotation (phone videos) swaps the sides
    }));
  } finally { closeSync(fd); }
}
const num = v => Math.round(v * 10000) / 10000;

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
  const at = f => join(root, dir, f);
  const aspect = imageRatio(at(p.thumb)) || 0, first = p.youtube ? null : videos[0] ? { v: videos[0] } : p.images[0] ? { i: p.images[0] } : null;
  // aspect = ratio of the thumbnail, openAspect = ratio of the opened media (razmerje: v projekt.txt ima prednost)
  const openAspect = p.ratio || (first && (first.v ? videoRatio(at(first.v)) : imageRatio(at(first.i)))) || 0;
  out.push({ ...p, aspect: num(aspect), openAspect: num(openAspect), thumb: url(dir, p.thumb), videos: videos.map(f => url(dir, f)), images: p.images.map(f => url(dir, f)) });
}
writeFileSync(join(root, 'projekti.json'), JSON.stringify(out, null, 2) + '\n');
console.log(out.length + ' projektov -> projekti/projekti.json');
