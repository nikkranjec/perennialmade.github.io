// header: wordmark -> logo mark on scroll (also drops hero letters)
const onScroll = () => document.body.classList.toggle('scrolled', window.scrollY > 40);
onScroll(); addEventListener('scroll', onScroll, {passive:true});

// live Ljubljana clock
const clock = document.getElementById('clock');
const tick = () => { clock.textContent = new Intl.DateTimeFormat('sl-SI',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false,timeZone:'Europe/Ljubljana'}).format(new Date()); };
tick(); setInterval(tick, 1000);

// duplicate rail items so the loop is seamless
const rail = document.querySelector('.rail');
rail.innerHTML += rail.innerHTML;

// hero wordmark: live Mundial text with the same size, tracking (0.05em, no kerning) and ink box as the falling letters
const TRACK = parseFloat(new URLSearchParams(location.search).get('track') ?? '0');   // letter spacing in em; ?track=-0.01 to test
window.PERENNIAL_SETTINGS = Object.assign(window.PERENNIAL_SETTINGS || {}, { track: TRACK });
const WORD = 'perennial', wmEl = document.querySelector('.wm');
wmEl.innerHTML = [...WORD].map(ch => `<span class="letter" style="--r:${Math.random() * 160 - 80}deg;--d:${Math.random() * 0.5}s">${ch}<span class="alt hand">${ch}</span></span>`).join('') + '<i class="bl"></i>';
(async () => {
  await Promise.all([document.fonts.load('100px Mundial'), document.fonts.load('100px PerennialMade')]);
  const c = document.createElement('canvas').getContext('2d');
  c.font = '100px Mundial';
  const adv = [...WORD].reduce((s, ch) => s + c.measureText(ch).width, 0), mp = c.measureText('p'), ml = c.measureText('l'), m1 = c.measureText('x');
  const lsb = -mp.actualBoundingBoxLeft, rsb = ml.width - ml.actualBoundingBoxRight;
  c.font = '100px PerennialMade';
  const m2 = c.measureText('x');
  const base = mm => ((100 - (mm.fontBoundingBoxAscent + mm.fontBoundingBoxDescent)) / 2 + mm.fontBoundingBoxAscent) / 100;
  const r = document.documentElement.style;
  r.setProperty('--ink-em', (adv + TRACK * 100 * (WORD.length - 1) - lsb - rsb + 2.6) / 100);
  r.setProperty('--lsb', (lsb - 1.3) / 100);
  r.setProperty('--track', TRACK + 'em');
  r.setProperty('--b1', base(m1));
  r.setProperty('--b2', base(m2));
  r.setProperty('--alt-k', m1.actualBoundingBoxAscent / m2.actualBoundingBoxAscent);
  document.body.classList.add('wm-ready');
})();


// tuning: ?tune panel, or live values posted from the Tweaks wrapper
const root = document.documentElement.style;
addEventListener('message', e => { if (e.data && e.data.type === 'tune') { root.setProperty('--alt-dx', e.data.dx); root.setProperty('--alt-dy', e.data.dy); root.setProperty('--alt-scale', e.data.scale); } });


// ---- page transitions ----
const homeView = [document.querySelector('main'), document.querySelector('.site-footer')];
const pageViews = { 'o-nas': [document.getElementById('page-o-nas')], dela: [document.getElementById('page-dela')], dnevnik: [document.getElementById('page-dnevnik')] };
homeView.forEach(e => e.classList.add('view'));
const group = n => n === 'home' ? homeView : pageViews[n];
let view = 'home', busy = false;
const FADE = 350;
const setNav = n => document.querySelectorAll('.nav a').forEach(a => { if (a.getAttribute('href') === '#' + n) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
const go = (n, then) => {
  if (busy) return;
  if (n === view) { if (then) then(); return; }
  busy = true;
  const b = document.body, out = group(view), inn = group(n);
  if (view === 'home') b.classList.add('leaving');
  out.forEach(e => e.classList.add('out'));
  setTimeout(() => {
    out.forEach(e => e.classList.add('gone'));
    inn.forEach(e => { e.classList.add('out'); e.classList.remove('gone'); });
    b.classList.toggle('view-sub', n !== 'home');
    scrollTo({ top: 0, behavior: 'instant' });
    if (n === 'home') { b.classList.remove('leaving'); if (window.perennialReset) window.perennialReset(); }
    onScroll();
    void b.offsetWidth;
    inn.forEach(e => e.classList.remove('out'));
    view = n; setNav(n);
    setTimeout(() => { busy = false; if (then) then(); }, FADE);
  }, FADE);
};
const toEnd = () => scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' });
document.addEventListener('click', e => {
  const a = e.target.closest('a[href^="#"]'); if (!a) return;
  const t = a.getAttribute('href').slice(1);
  if (t in pageViews) { e.preventDefault(); history.pushState(null, '', '#' + t); go(t); }
  else if (t === 'top') { e.preventDefault(); if (view !== 'home') { history.pushState(null, '', location.pathname); go('home'); } else scrollTo({ top: 0, behavior: 'smooth' }); }
  else if (t === 'kontakt' && view !== 'home') { e.preventDefault(); history.pushState(null, '', '#kontakt'); go('home', toEnd); }
});
addEventListener('popstate', () => { const t = location.hash.slice(1); go(t in pageViews ? t : 'home'); });
// opened directly on a sub page
{ const t = location.hash.slice(1);
  if (t in pageViews) {
    homeView.forEach(e => e.classList.add('gone')); pageViews[t].forEach(e => e.classList.remove('gone'));
    document.body.classList.add('view-sub', 'leaving'); view = t; setNav(t);
  } }

// shared footer for the sub pages
document.querySelectorAll('.page[data-footer]').forEach(p => p.appendChild(document.getElementById('tpl-footer').content.cloneNode(true)));

// people grid: cut-out faces on a staggered grid. The grid pans with the cursor and every step of the way is stamped
// into a persistent layer behind it, so the movement leaves ribbed streaks that stay on screen (reset when the page is re-opened).
document.querySelectorAll('.people').forEach(win => {
  const cv = win.querySelector('.people-canvas'), ctx = cv.getContext('2d');
  const layer = document.createElement('canvas'), lctx = layer.getContext('2d');
  const srcs = [1, 2, 3, 4, 5, 6].map(n => { const im = new Image(); im.onload = () => kick(); im.src = 'assets/people/person-' + n + '.png'; return im; });
  let W = 1, H = 1, dpr = 1, raf = 0, hidden = true;
  let gx = 0, gy = 0, px = 0, py = 0, sx0 = 0, sy0 = 0;   // sx0/sy0: position of the last stamped copy
  const STAMP = 2;                                          // px between stamped copies along the path
  let cells = [], faceH = 200, extW = 1, extH = 1;
  function layout() {
    faceH = Math.max(150, Math.min(270, W * .17));
    const sx = faceH * 1.55, sy = faceH * 1.2; cells = [];
    for (let r = -2; r <= 2; r++) for (let c = -3; c <= 3; c++) cells.push({ x: c * sx + (r & 1 ? sx / 2 : 0), y: r * sy, i: (((c * 7 + r * 11) % 6) + 6) % 6, rot: (((c * 13 + r * 5) % 9) - 4) * .012 });
    extW = 6 * sx + faceH; extH = 4 * sy + faceH;
  }
  function resize() {
    const r = win.getBoundingClientRect();
    if (!r.width) { hidden = true; return; }
    if (hidden) { hidden = false; px = py = gx = gy = sx0 = sy0 = 0; }
    W = r.width; H = r.height; dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = layer.width = Math.round(W * dpr); cv.height = layer.height = Math.round(H * dpr); layout(); kick();
  }
  function drawSet(c, ox, oy) {
    cells.forEach(cell => {
      const im = srcs[cell.i]; if (!im.complete || !im.naturalWidth) return;
      const w = faceH * im.naturalWidth / im.naturalHeight;
      c.save(); c.translate(W / 2 + cell.x + ox, H / 2 + cell.y + oy); c.rotate(cell.rot); c.drawImage(im, -w / 2, -faceH / 2, w, faceH); c.restore();
    });
  }
  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    ctx.drawImage(layer, 0, 0, W, H);
    drawSet(ctx, px, py);
  }
  function loop() {
    px += (gx - px) * .1; py += (gy - py) * .1;
    // stamp a copy every STAMP px of travel, however slowly the grid moves (distance is carried over between frames)
    lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (let k = 0; k < 80; k++) {
      const dx = px - sx0, dy = py - sy0, d = Math.hypot(dx, dy); if (d < STAMP) break;
      sx0 += dx / d * STAMP; sy0 += dy / d * STAMP; drawSet(lctx, sx0, sy0);
    }
    draw();
    raf = Math.abs(gx - px) + Math.abs(gy - py) > .1 ? requestAnimationFrame(loop) : 0;
  }
  function kick() { if (!raf && W > 1) raf = requestAnimationFrame(loop); }
  win.addEventListener('pointermove', e => {
    if (e.pointerType === 'touch') return;
    const r = win.getBoundingClientRect(), mx = Math.max(0, (extW - r.width) / 2) + r.width * .08, my = Math.max(0, (extH - r.height) / 2) + r.height * .06;
    gx = -(((e.clientX - r.left) / r.width) * 2 - 1) * mx; gy = -(((e.clientY - r.top) / r.height) * 2 - 1) * my; kick();
  });
  // touch screens: drag sideways to pan (vertical swipes still scroll the page); it drifts on its own when left alone
  if (matchMedia('(pointer: coarse)').matches) {
    win.style.touchAction = 'pan-y'; win.style.cursor = 'default';
    let lx = null, idleAt = 0;
    const lim = () => ({ mx: Math.max(0, (extW - W) / 2) + W * .08, my: Math.max(0, (extH - H) / 2) + H * .06 });
    win.addEventListener('pointerdown', e => { lx = e.clientX; idleAt = performance.now() + 1800; });
    win.addEventListener('pointermove', e => { if (lx === null) return; const { mx } = lim(); gx = Math.max(-mx, Math.min(mx, gx + (e.clientX - lx) * 1.3)); lx = e.clientX; idleAt = performance.now() + 1800; kick(); });
    const end = () => { lx = null; }; win.addEventListener('pointerup', end); win.addEventListener('pointercancel', end);
    setInterval(() => { if (hidden || lx !== null || performance.now() < idleAt) return; const t = performance.now() / 1000, { mx, my } = lim(); gx = Math.cos(t * .15) * mx * .6; gy = Math.sin(t * .22) * my * .8; kick(); }, 60);
  }
  new ResizeObserver(resize).observe(win);
  resize();
});
