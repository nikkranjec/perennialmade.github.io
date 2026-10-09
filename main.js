// header: wordmark -> logo mark on scroll (also drops hero letters)
const onScroll = () => document.body.classList.toggle('scrolled', window.scrollY > 40);
onScroll(); addEventListener('scroll', onScroll, {passive:true});

// live Ljubljana clock
const clock = document.getElementById('clock');
const tick = () => { clock.textContent = new Intl.DateTimeFormat('sl-SI',{hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false,timeZone:'Europe/Ljubljana'}).format(new Date()); };
tick(); setInterval(tick, 1000);

// hero video: autoplays muted on a loop; the button pauses it. It also rests while off screen.
document.querySelectorAll('.about-video').forEach(box => {
  const v = box.querySelector('video'), bp = box.querySelector('.vid-play');
  let userPaused = false, vis = true;
  v.muted = true;
  const sync = () => { bp.setAttribute('aria-pressed', v.paused ? 'true' : 'false'); bp.setAttribute('aria-label', v.paused ? 'Predvajaj' : 'Pavza'); };
  bp.addEventListener('click', () => { if (v.paused) { userPaused = false; v.play().catch(() => {}); } else { userPaused = true; v.pause(); } });
  ['play', 'pause', 'volumechange'].forEach(e => v.addEventListener(e, sync));
  new IntersectionObserver(es => { vis = es[0].isIntersecting; if (!vis) v.pause(); else if (!userPaused && !document.body.classList.contains('view-sub')) v.play().catch(() => {}); }, { threshold: .15 }).observe(box);
  document.addEventListener('visibilitychange', () => { if (document.hidden) v.pause(); else if (vis && !userPaused) v.play().catch(() => {}); });
  sync();
});

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
const pageViews = { 'o-nas': [document.getElementById('page-o-nas')], dela: [document.getElementById('page-dela')], dnevnik: [document.getElementById('page-dnevnik')], kontakt: [document.getElementById('page-kontakt')] };
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
document.addEventListener('click', e => {
  const a = e.target.closest('a[href^="#"]'); if (!a) return;
  const t = a.getAttribute('href').slice(1);
  if (t in pageViews) { e.preventDefault(); history.pushState(null, '', '#' + t); go(t); }
  else if (t === 'top') { e.preventDefault(); if (view !== 'home') { history.pushState(null, '', location.pathname); go('home'); } else scrollTo({ top: 0, behavior: 'smooth' }); }
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
// The whole grid is pre-rendered once into a sprite, so each stamp is a single image draw; nothing runs while it is off screen.
document.querySelectorAll('.people').forEach(win => {
  const cv = win.querySelector('.people-canvas'), ctx = cv.getContext('2d');
  const layer = document.createElement('canvas'), lctx = layer.getContext('2d');
  const sprite = document.createElement('canvas'), sctx = sprite.getContext('2d');
  const coarse = matchMedia('(pointer: coarse)').matches;
  let loaded = 0;
  const srcs = [1, 2, 3, 4, 5, 6].map(n => { const im = new Image(); im.decoding = 'async'; im.onload = () => { if (++loaded === 6) { buildSprite(); kick(); } }; im.src = 'assets/people/person-' + n + '.webp'; return im; });
  let W = 1, H = 1, dpr = 1, raf = 0, hidden = true, onScreen = false, ready = false;
  let gx = 0, gy = 0, px = 0, py = 0, sx0 = 0, sy0 = 0;   // sx0/sy0: position of the last stamped copy
  const STAMP = coarse ? 3 : 2, MAX_STAMPS = coarse ? 14 : 40;   // px between stamped copies; per-frame cap
  let cells = [], faceH = 200, extW = 1, extH = 1, SW = 1, SH = 1;
  function layout() {
    faceH = Math.max(150, Math.min(270, W * .17));
    const sx = faceH * 1.55, sy = faceH * 1.2; cells = [];
    for (let r = -2; r <= 2; r++) for (let c = -3; c <= 3; c++) cells.push({ x: c * sx + (r & 1 ? sx / 2 : 0), y: r * sy, i: (((c * 7 + r * 11) % 6) + 6) % 6, rot: (((c * 13 + r * 5) % 9) - 4) * .012 });
    extW = 6 * sx + faceH; extH = 4 * sy + faceH;
    SW = 7 * sx + 2 * faceH; SH = 4 * sy + 2.4 * faceH;
  }
  function buildSprite() {
    if (loaded < 6 || W <= 1) return;
    sprite.width = Math.round(SW * dpr); sprite.height = Math.round(SH * dpr);
    sctx.setTransform(dpr, 0, 0, dpr, 0, 0); sctx.clearRect(0, 0, SW, SH);
    cells.forEach(cell => {
      const im = srcs[cell.i], w = faceH * im.naturalWidth / im.naturalHeight;
      sctx.save(); sctx.translate(SW / 2 + cell.x, SH / 2 + cell.y); sctx.rotate(cell.rot); sctx.drawImage(im, -w / 2, -faceH / 2, w, faceH); sctx.restore();
    });
    ready = true;
  }
  function resize() {
    const r = win.getBoundingClientRect();
    if (!r.width) { hidden = true; return; }
    if (hidden) { hidden = false; px = py = gx = gy = sx0 = sy0 = 0; }
    if (Math.abs(r.width - W) < 1 && Math.abs(r.height - H) < 1 && cv.width) return;   // ignore no-op resizes (keeps the trail)
    W = r.width; H = r.height; dpr = Math.min(coarse ? 1.25 : 2, window.devicePixelRatio || 1);
    cv.width = layer.width = Math.round(W * dpr); cv.height = layer.height = Math.round(H * dpr); layout(); buildSprite(); kick();
  }
  const stampAt = (c, ox, oy) => c.drawImage(sprite, W / 2 - SW / 2 + ox, H / 2 - SH / 2 + oy, SW, SH);
  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    ctx.drawImage(layer, 0, 0, W, H);
    stampAt(ctx, px, py);
  }
  function loop() {
    raf = 0; if (!ready || !onScreen) return;
    px += (gx - px) * .1; py += (gy - py) * .1;
    // stamp a copy every STAMP px of travel, however slowly the grid moves (distance is carried over between frames)
    lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (let k = 0; k < MAX_STAMPS; k++) {
      const dx = px - sx0, dy = py - sy0, d = Math.hypot(dx, dy); if (d < STAMP) break;
      sx0 += dx / d * STAMP; sy0 += dy / d * STAMP; stampAt(lctx, sx0, sy0);
    }
    if (Math.hypot(px - sx0, py - sy0) > STAMP * MAX_STAMPS) { sx0 = px; sy0 = py; }   // fell far behind: skip ahead instead of lagging
    draw();
    if (Math.abs(gx - px) + Math.abs(gy - py) > .1 || drifting()) raf = requestAnimationFrame(loop);
  }
  function kick() { if (!raf && W > 1 && onScreen) raf = requestAnimationFrame(loop); }
  new IntersectionObserver(es => { onScreen = es[0].isIntersecting; if (onScreen) { if (ready) draw(); kick(); } }).observe(win);
  win.addEventListener('pointermove', e => {
    if (e.pointerType === 'touch') return;
    const r = win.getBoundingClientRect(), mx = Math.max(0, (extW - r.width) / 2) + r.width * .08, my = Math.max(0, (extH - r.height) / 2) + r.height * .06;
    gx = -(((e.clientX - r.left) / r.width) * 2 - 1) * mx; gy = -(((e.clientY - r.top) / r.height) * 2 - 1) * my; kick();
  });
  // touch screens: drag to pan sideways (vertical swipes still scroll the page). Left alone, it drifts slowly along a loop,
  // easing back onto it from wherever the finger left it (no jumps)
  let drifting = () => false;
  if (coarse) {
    win.style.touchAction = 'pan-y'; win.style.cursor = 'default';
    let lx = null, idleAt = 0, t = 0, last = 0;
    const lim = () => ({ mx: Math.max(0, (extW - W) / 2) + W * .08, my: Math.max(0, (extH - H) / 2) + H * .06 });
    win.addEventListener('pointerdown', e => { lx = e.clientX; idleAt = performance.now() + 2200; });
    win.addEventListener('pointermove', e => { if (lx === null) return; const { mx } = lim(); gx = Math.max(-mx, Math.min(mx, gx + (e.clientX - lx) * 1.2)); lx = e.clientX; idleAt = performance.now() + 2200; kick(); });
    const end = () => { lx = null; }; win.addEventListener('pointerup', end); win.addEventListener('pointercancel', end);
    // gyro: tilting the phone pans the grid. The rest angle re-centres slowly, so it works however the phone is held.
    // iOS asks for permission: there it is not used at all (no prompt), the grid just drifts. Other browsers: on without asking.
    let gyro = false, b0 = null, g0 = null;
    const onTilt = e => {
      if (e.beta == null || e.gamma == null) return;
      const ang = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
      let tx = e.gamma, ty = e.beta;                                   // portrait: left/right tilt, forward/back tilt
      if (ang === 90) { tx = e.beta; ty = -e.gamma; } else if (ang === -90 || ang === 270) { tx = -e.beta; ty = e.gamma; }
      if (b0 === null) { g0 = tx; b0 = ty; }
      g0 += (tx - g0) * .004; b0 += (ty - b0) * .004;                 // slow re-centre
      gyro = true;
      if (lx !== null || performance.now() < idleAt || hidden) return;
      const { mx, my } = lim(), c = v => Math.max(-1, Math.min(1, v / 22));
      gx = -c(tx - g0) * mx; gy = -c(ty - b0) * my; kick();
    };
    const listen = () => addEventListener('deviceorientation', onTilt);
    const DOE = window.DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission !== 'function') listen();
    drifting = () => {
      const now = performance.now(), dt = Math.min(.05, (now - last) / 1000 || 0); last = now;
      if (gyro) return false;
      if (hidden || lx !== null || now < idleAt) return lx !== null;
      t += dt; const { mx, my } = lim(), k = Math.min(1, dt * .8);
      gx += (Math.cos(t * .15) * mx * .55 - gx) * k; gy += (Math.sin(t * .22) * my * .7 - gy) * k;
      return true;
    };
  }
  new ResizeObserver(resize).observe(win);
  resize();
});

// wordmark click: the page colour steps through the palette (ink flips to light on the dark ones)
{
  const THEMES = [['#f2f1ef', '#141414'], ['#d0c1c8', '#141414'], ['#c47588', '#141414'], ['#889d3d', '#141414'], ['#f2cdbc', '#141414'], ['#3e5dab', '#f2f1ef'], ['#d69250', '#141414'], ['#adc3e5', '#141414'], ['#ebcf86', '#141414'], ['#242424', '#f2f1ef']];
  let ti = 0;
  const meta = document.querySelector('meta[name="theme-color"]');
  document.querySelector('.brand').addEventListener('click', () => {
    ti = (ti + 1) % THEMES.length;
    const [bg, ink] = THEMES[ti], r = document.documentElement;
    r.style.setProperty('--bg', bg); r.style.setProperty('--ink', ink);
    r.classList.toggle('ink-light', ink !== '#141414');
    if (meta) meta.setAttribute('content', bg);
    document.dispatchEvent(new CustomEvent('perennial-theme', { detail: { bg, ink } }));
  });
}
