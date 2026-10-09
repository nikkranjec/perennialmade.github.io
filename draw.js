// kontakt: draw anywhere on the page. The canvas is window-sized and fixed; strokes are stored in page coordinates and
// redrawn with the scroll offset, so the whole page (any length, footer included) can be drawn on. Links stay clickable.
(() => {
  const sec = document.getElementById('page-kontakt'), menu = document.querySelector('.draw-menu'); if (!sec || !menu) return;
  const cv = sec.querySelector('.draw-canvas'), ctx = cv.getContext('2d'), pal = menu.querySelector('.draw-palette'), sw = menu.querySelector('.draw-color');
  const COLORS = ['#141414', '#e0793a', '#d8453a', '#3a6fd8', '#2f9e6a', '#e6c23a'];
  const coarse = matchMedia('(pointer: coarse)').matches;
  // eraser cursor: a circle the exact size of the eraser (26px)
  const ERASER_CURSOR = 'url("data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28"><circle cx="14" cy="14" r="12.5" fill="rgba(255,255,255,.35)" stroke="#141414" stroke-width="1"/></svg>') + '") 14 14, auto';
  const strokes = []; let cur = null, tool = null, color = COLORS[0], dpr = 1, raf = 0;
  const paintSwatch = () => { sw.innerHTML = '<span class="draw-sw" style="background:' + color + '"></span>'; };
  COLORS.forEach(c => { const b = document.createElement('button'); b.type = 'button'; b.className = 'draw-dot'; b.style.background = c; b.setAttribute('aria-label', c); b.addEventListener('click', () => { color = c; if (tool !== 'pencil') setTool('pencil'); paintSwatch(); pal.hidden = true; }); pal.appendChild(b); });
  sw.addEventListener('click', () => { pal.hidden = !pal.hidden; });
  // tapping the active tool switches drawing off (on phones that gives page scrolling back)
  function setTool(t) {
    tool = tool === t ? null : t;
    menu.querySelectorAll('[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === tool));
    sec.classList.toggle('drawing', !!tool); sec.style.cursor = tool === 'eraser' ? ERASER_CURSOR : tool ? 'crosshair' : ''; sec.style.touchAction = tool ? 'none' : '';
  }
  menu.querySelectorAll('[data-tool]').forEach(b => b.addEventListener('click', () => setTool(b.dataset.tool)));
  menu.querySelector('.draw-undo').addEventListener('click', () => { strokes.pop(); redraw(); });
  function paint(s) {
    ctx.save(); ctx.globalCompositeOperation = s.erase ? 'destination-out' : 'source-over'; ctx.strokeStyle = s.color; ctx.fillStyle = s.color; ctx.lineWidth = s.w; ctx.lineCap = ctx.lineJoin = 'round';
    const p = s.pts;
    if (p.length === 1) { ctx.beginPath(); ctx.arc(p[0].x, p[0].y, s.w / 2, 0, 6.2832); ctx.fill(); }
    else { ctx.beginPath(); ctx.moveTo(p[0].x, p[0].y); for (let i = 1; i < p.length - 1; i++) ctx.quadraticCurveTo(p[i].x, p[i].y, (p[i].x + p[i + 1].x) / 2, (p[i].y + p[i + 1].y) / 2); ctx.lineTo(p[p.length - 1].x, p[p.length - 1].y); ctx.stroke(); }
    ctx.restore();
  }
  function redraw() {
    if (sec.classList.contains('gone')) return;
    const r = sec.getBoundingClientRect();
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.setTransform(dpr, 0, 0, dpr, r.left * dpr, r.top * dpr);
    strokes.forEach(paint); if (cur) paint(cur);
  }
  const queue = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; redraw(); }); };
  function size() { dpr = Math.min(2, devicePixelRatio || 1); cv.width = Math.round(innerWidth * dpr); cv.height = Math.round(innerHeight * dpr); redraw(); }
  addEventListener('resize', size); addEventListener('scroll', queue, { passive: true });
  const pos = e => { const r = sec.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const skip = e => e.target.closest('a,button,summary,input,textarea,.draw-menu');
  sec.addEventListener('pointerdown', e => {
    if (!tool || e.button > 0 || skip(e)) return; e.preventDefault(); pal.hidden = true;
    cur = { pts: [pos(e)], color, w: tool === 'eraser' ? 26 : 3, erase: tool === 'eraser' };
    try { sec.setPointerCapture(e.pointerId); } catch (_) {} queue();
  });
  sec.addEventListener('pointermove', e => { if (!cur) return; cur.pts.push(pos(e)); queue(); });
  const end = () => { if (!cur) return; strokes.push(cur); cur = null; queue(); };
  sec.addEventListener('pointerup', end); sec.addEventListener('pointercancel', end);
  const foot = () => sec.querySelector('.contact'), padPx = () => parseFloat(getComputedStyle(menu).right) || 24;
  function place() { if (menu.hidden) return; const f = foot(); let b = padPx(); if (f) { const top = f.getBoundingClientRect().top; if (top < innerHeight) b = Math.max(b, innerHeight - top + 14); } menu.style.bottom = b + 'px'; }
  addEventListener('scroll', place, { passive: true }); addEventListener('resize', place);
  const sync = () => { const on = !sec.classList.contains('gone'); menu.hidden = !on; if (on) { size(); place(); } else pal.hidden = true; };
  new MutationObserver(sync).observe(sec, { attributes: true, attributeFilter: ['class'] });
  new ResizeObserver(() => { queue(); place(); }).observe(sec);
  paintSwatch(); if (!coarse) setTool('pencil'); sync();
})();
