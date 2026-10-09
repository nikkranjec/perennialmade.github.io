// dela: the Viscose carousel (ring of cards fused by a signed-distance-field shader), ported from the reference repo to plain JS.
// Entry: seed is born -> launches out -> ring unfurls -> ring spins and moves off-centre. Then wheel / drag / click / arrows turn it.
(() => {
  const sec = document.getElementById('page-dela'); if (!sec) return;
  const stage = sec.querySelector('.wheel'), list = stage.querySelector('.wheel-list'), title = stage.querySelector('.wheel-title');
  const info = stage.querySelector('.wheel-info'), nameEl = stage.querySelector('.wheel-name'), pill = stage.querySelector('.wheel-view');
  const SH = window.WHEEL_SHADERS; if (!SH) return;
  const { MAX_PLANES, MAX_LINKS } = SH;
  // The works come from works.js (names, descriptions, formats).
  const WORKS = (window.PERENNIAL_WORKS || []).map(o => Object.assign({ desc: '', tags: [] }, o));
  if (!WORKS.length) return;
  const P = {
    refWidth: 1512, minScale: .5, maxScale: 1.75, narrowAt: 1024, narrowPlane: 1.25, narrowRadius: 1.3, narrowPosX: -2.5, narrowEndScale: 4.22, tightAt: 640, tightRadius: .82, tightPosX: -3.5,
    cardX: -.1, planeSize: 90, ringRadius: 340, radius: 6, blend: 14, stagger: .34, launchTime: 1.95, spreadTime: 3.6, stageAt: .7, spinTime: 2.6, spinDelay: 0, posX: -2, posY: 0, endScale: 4.46, moveTime: 2.2, moveDelay: .2,
    scrollSpeed: .006, damping: .955, maxSpeed: 12, snapTime: .8, snapFrom: 1, pickTime: .45,
    bandTop: .08, bandBottom: .08, refract: 60, squeeze: .05, ripple: 5, rippleFreq: .02, fringe: 1.5, sheen: .05,
    lag: .3, melt: 0, meltReach: 260, reach: 1.7, swell: .09, pull: 26, grab: .14, release: .06, web: .2, webReach: 1.15, wave: 0, waveFreq: .05, waveSpeed: 7,
    sideScale: .035, sidePush: 17, sideDim: .15, sideReach: 2.4, tagFrom: 1024, tagX: 64, tagY: -38,
    thread: 1, thin: .4, pinch: .35, sag: 6, dissolve: 2.9, fillet: 14, wobble: 0, goo: 0,
  };
  const COUNT = WORKS.length, TAU = Math.PI * 2, HALF_PI = Math.PI / 2, DEG = Math.PI / 180, FAN_START = .06;
  // card format: same area, own aspect (3:2 is the base plane), capped so tall posters stay on stage
  const FMT = WORKS.map(o => { const s = Math.sqrt(o.aspect / 1.5); let ax = s, ay = 1 / s; const m = Math.max(ax, ay); if (m > 1.25) { ax *= 1.25 / m; ay *= 1.25 / m; } return { ax, ay }; });
  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const smoothstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const signedOffset = i => i === 0 ? 0 : i % 2 === 1 ? (i + 1) / 2 : -i / 2;
  const chase = (dt, r) => 1 - Math.pow(1 - r, dt * 60);
  const inOut = n => x => x < .5 ? Math.pow(2 * x, n) / 2 : 1 - Math.pow(-2 * x + 2, n) / 2;
  const out = n => x => 1 - Math.pow(1 - x, n);
  const p2out = out(3), p2io = inOut(3), p3io = inOut(4), p4out = out(5), cubicOut = out(3);
  const seg = (t, a, d, ease) => ease(clamp01((t - a) / d));

  const state = { progress: 0, launch: 0, spread: 0, spin: 0, shift: 0 };
  let T3 = null, renderer, scene, camera, mesh, U, atlas, imageCount = COUNT;
  document.addEventListener('perennial-theme', e => { if (U) U.uPage.value.set(e.detail.bg); });
  let DY = 0, viewW = 1, viewH = 1, fit = 1, planeK = 1, radiusK = 1, narrowNow = false, tightNow = false;
  const bounds = { left: 0, top: 0 };
  let entryT = 0, interactive = false, wasVisible = false, started = false, firstIn = false, last = 0;
  let spinVel = 0, dragging = false, dragPrev = 0, dragPrevT = 0, settling = false, snapTo = 0, snapCap = 0, picking = null, travel = 0, tx0 = 0, ty0 = 0;
  const ringC = { x: 0, y: 0 }; let frontAngle = 0;
  const pointer = { x: 0, y: 0, inside: false, seeded: false }, cursor = { x: 0, y: 0, amt: 0, wake: 0 }; let coarse = false;
  let shown = -1, over = -1, overBase = -1, frontPlane = -1, locked = false, openEl = null;
  const hoverF = new Float32Array(MAX_PLANES), leanX = new Float32Array(MAX_PLANES), leanY = new Float32Array(MAX_PLANES), sideF = new Float32Array(MAX_PLANES), webF = new Float32Array(MAX_LINKS);
  const travelA = new Float32Array(MAX_PLANES), cum = new Float32Array(MAX_PLANES), order = [], focusPos = { x: 0, y: 0 };
  let rest = [];
  const items = WORKS.map((w, i) => { const li = document.createElement('li'); li.textContent = w.name; li.addEventListener('click', e => { e.stopPropagation(); if (interactive) pick(planeOfCell(i)); }); list.appendChild(li); return li; });

  async function init() {
    T3 = await new Function('u', 'return import(u)')('https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js');
    const THREE = T3;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }); } catch (e) { console.error('wheel: no WebGL', e); return false; }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    const cv = renderer.domElement; cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;opacity:0'; stage.insertBefore(cv, stage.firstChild);
    scene = new THREE.Scene(); camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -100, 100);
    // atlas
    const cols = Math.ceil(Math.sqrt(COUNT)), rows = Math.ceil(COUNT / cols), CW = COUNT <= 4 ? 1024 : 768, CH = CW;
    const ac = document.createElement('canvas'); ac.width = cols * CW; ac.height = rows * CH; const actx = ac.getContext('2d');
    const tex = new THREE.CanvasTexture(ac); tex.flipY = false; tex.colorSpace = THREE.NoColorSpace; tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = true; tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    atlas = { tex, cols, rows };
    const loadCell = i => new Promise(res => {
      const im = new Image(); im.onload = () => {
        const x = (i % cols) * CW, y = Math.floor(i / cols) * CH;
        actx.drawImage(im, x, y, CW, CH); tex.needsUpdate = true; res();
      }; im.onerror = res; im.src = 'assets/work/' + WORKS[i].file + '.webp';
    });
    loadCell(0).then(() => { firstIn = true; }); for (let i = 1; i < COUNT; i++) loadCell(i);
    const V2 = () => new THREE.Vector2(), V4 = () => new THREE.Vector4();
    const tagTex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1); tagTex.needsUpdate = true;
    const blank = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); blank.needsUpdate = true;
    const bg = getComputedStyle(document.body).backgroundColor;
    U = {
      uResolution: { value: new THREE.Vector2(1, 1) }, uSize: { value: new THREE.Vector2(150, 100) }, uRadius: { value: P.radius }, uCount: { value: COUNT },
      uPos: { value: Array.from({ length: MAX_PLANES }, V2) }, uRot: { value: new Float32Array(MAX_PLANES) }, uScale: { value: Array.from({ length: MAX_PLANES }, () => new THREE.Vector4(0, 0, 1, 0)) },
      uLinkCount: { value: 0 }, uLinkA: { value: Array.from({ length: MAX_LINKS }, V2) }, uLinkB: { value: Array.from({ length: MAX_LINKS }, V2) }, uLinkPar: { value: Array.from({ length: MAX_LINKS }, V4) },
      uK: { value: P.goo }, uWobble: { value: P.wobble }, uTime: { value: 0 }, uColor: { value: new THREE.Color('#0a0a0a') }, uAtlas: { value: tex }, uGrid: { value: new THREE.Vector2(cols, rows) },
      uBlend: { value: P.blend }, uTextured: { value: 0 }, uBandTop: { value: 0 }, uBandBottom: { value: 0 }, uGlass: { value: V4() }, uFringe: { value: 0 }, uSheen: { value: 0 },
      uMouse: { value: V4() }, uMelt: { value: V4() }, uTagTex: { value: tagTex }, uTag: { value: V4() }, uTagP: { value: V4() }, uTagQ: { value: V4() }, uPage: { value: new THREE.Color(bg) },
    };
    mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({ vertexShader: SH.vertexShader, fragmentShader: SH.fragmentShader, uniforms: U, transparent: true, depthWrite: false }));
    scene.add(mesh); rest = Array.from({ length: MAX_PLANES }, () => ({ x: 0, y: 0 }));
    resize(); return true;
  }

  function resize() {
    if (!renderer) return;
    viewW = stage.clientWidth || 1; viewH = stage.clientHeight || 1;
    const s = viewW / P.refWidth; fit = Math.min(P.maxScale, Math.max(P.minScale, s));
    narrowNow = viewW <= P.narrowAt; tightNow = viewW <= P.tightAt; planeK = narrowNow ? P.narrowPlane : 1; radiusK = (narrowNow ? P.narrowRadius : 1) * (tightNow ? P.tightRadius : 1);
    renderer.setSize(viewW, viewH); camera.left = -viewW / 2; camera.right = viewW / 2; camera.top = viewH / 2; camera.bottom = -viewH / 2; camera.updateProjectionMatrix();
    mesh.scale.set(viewW, viewH, 1); U.uResolution.value.set(viewW, viewH);
    const r = renderer.domElement.getBoundingClientRect(); bounds.left = r.left; bounds.top = r.top;
    const k = (narrowNow ? 1.4 : 1) * Math.max(.75, Math.min(1.2, viewW / 1440));
    stage.style.setProperty('--wk', k);
    DY = viewW <= 719 ? 40 : Math.min(48, Math.max(26, viewH * .04)); stage.style.setProperty('--wdy', DY + 'px'); // pushes everything below the header
    if (narrowNow) { info.style.left = ''; info.style.width = ''; nameEl.style.right = ''; nameEl.style.maxWidth = ''; } else { const cl = viewW / 2 + P.cardX * viewW - P.planeSize * planeK * P.endScale * fit / 2; nameEl.style.right = (viewW - cl + viewW * .04) + 'px'; nameEl.style.maxWidth = Math.max(120, cl - viewW * .04 - viewW * .06) + 'px'; const Wend = P.planeSize * planeK * P.endScale * fit, left = viewW / 2 + P.cardX * viewW + Wend / 2 + viewW * .05; info.style.left = left + 'px'; info.style.width = Math.max(180, viewW - left - viewW * .12) + 'px'; }
  }
  addEventListener('resize', resize);

  // list rows are art cells; pick() wants the plane wearing that cell
  function planeOfCell(c) { for (let i = 0; i < COUNT; i++) if ((((-signedOffset(i)) % COUNT) + COUNT) % COUNT === c) return i; return 0; }
  // click on the front card: it grows over most of the stage and everything else blurs back
  const rectOf = i => { const W = U.uSize.value.x * U.uScale.value[i].x, H = U.uSize.value.y * U.uScale.value[i].y; return { x: viewW / 2 + U.uPos.value[i].x - W / 2, y: viewH / 2 - U.uPos.value[i].y - H / 2, w: W, h: H }; };
  const setRect = (el, r, rad) => { el.style.left = r.x + 'px'; el.style.top = r.y + 'px'; el.style.width = r.w + 'px'; el.style.height = r.h + 'px'; el.style.borderRadius = rad + 'px'; };
  function openWork() {
    if (locked || frontPlane < 0) return; locked = true; const i = frontPlane, r0 = rectOf(i), rad = P.radius * planeK * (viewW / P.refWidth) * 4;
    openEl = document.createElement('div'); openEl.className = 'wheel-open'; openEl.style.backgroundImage = 'url(assets/work/' + WORKS[shown].file + '.webp)'; setRect(openEl, r0, rad); stage.appendChild(openEl);
    // placeholder player: drop assets/work/video-<file>.mp4 next to the image and it autoplays; until then the image stays
    const wk = WORKS[shown], vid = document.createElement('video'); vid.muted = true; vid.loop = true; vid.playsInline = true; vid.autoplay = true; vid.preload = 'auto'; if (wk.video) { vid.src = 'assets/work/video-' + wk.file + '.mp4'; vid.addEventListener('error', () => vid.remove()); openEl.appendChild(vid); const pp = vid.play(); if (pp && pp.catch) pp.catch(() => {}); }
    const mw = viewW * .88, mh = viewH * .8, tw = Math.min(mw, mh * wk.aspect), th = tw / wk.aspect, tr = { x: (viewW - tw) / 2, y: (viewH - th) / 2 + DY / 2, w: tw, h: th };
    openEl._from = r0; openEl._rad = rad; pill.style.opacity = 0; stage.classList.add('opened'); document.body.classList.add('work-open');
    requestAnimationFrame(() => requestAnimationFrame(() => { openEl.classList.add('go'); setRect(openEl, tr, 28); }));
  }
  function closeWork() {
    if (!locked || !openEl || openEl._closing) return; const el = openEl; el._closing = true; stage.classList.remove('opened'); document.body.classList.remove('work-open');
    const r = frontPlane >= 0 ? rectOf(frontPlane) : el._from; setRect(el, r, el._rad);
    const done = () => { el.remove(); if (openEl === el) { openEl = null; locked = false; } }; el.addEventListener('transitionend', e => { if (e.propertyName === 'width') done(); }); setTimeout(done, 900);
  }
  function pick(i) {
    const slot = TAU / COUNT, base = frontAngle - signedOffset(i) * slot, target = base + Math.round((state.spin - base) / TAU) * TAU, slots = Math.abs(target - state.spin) / slot;
    if (slots < .01) return;
    spinVel = 0; settling = false; picking = { from: state.spin, to: target, t0: performance.now(), dur: P.pickTime * Math.sqrt(Math.max(1, slots)) * 1000 };
  }

  const ptrAngle = e => Math.atan2(-(e.clientY - bounds.top - ringC.y), e.clientX - bounds.left - ringC.x);
  const track = e => { coarse = e.pointerType === 'touch'; pointer.x = e.clientX - bounds.left - viewW / 2; pointer.y = viewH / 2 - (e.clientY - bounds.top); pointer.inside = true; if (!pointer.seeded) { pointer.seeded = true; cursor.x = pointer.x; cursor.y = pointer.y; } };
  const BASE_T = .45, BASE_S = matchMedia('(prefers-reduced-motion: reduce)').matches ? 8 : 1.6; // title is up first, then the card is born; the whole entry runs 1.6x
  let rush = false, rushS = null, entrySpeed = BASE_S, rushT = 0;
  const skip = () => { if (!interactive && started) rush = true; }; // first input during the entry: it speeds up hard and finishes, rather than jumping to the end
  // wheel / trackpad: one card per gesture. After a short cooldown a step is accepted when the wheel went idle, a mouse notch arrived,
  // or the swipe clearly got stronger; the decaying momentum tail of the previous swipe is ignored. A very fast spin adds extra cards.
  let wCool = 0, wPrev = 0, wPrevT = 0, wSum = 0, wT = 0, wDir = 0, wNotches = 0;
  const stepBy = (dir, n) => {
    const slot = TAU / COUNT, from = state.spin, k = Math.round(((picking ? picking.to : from) - frontAngle) / slot), target = frontAngle + (k + dir * n) * slot;
    spinVel = 0; settling = false; picking = { from, to: target, t0: performance.now(), dur: P.pickTime * 1000 * Math.sqrt(Math.max(1, Math.abs(target - from) / slot)) };
  };
  stage.addEventListener('wheel', e => {
    e.preventDefault(); if (locked) { closeWork(); return; } if (!interactive) { skip(); return; }
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY, ad = Math.abs(d), now = performance.now(); if (ad < 1) return;
    const dir = Math.sign(d), gap = now - wPrevT, mouse = e.deltaMode === 1 || (ad >= 50 && (ad % 100 === 0 || ad % 120 === 0)), rising = ad > wPrev * 1.12 + 2, strong = ad > 25 && now - wT > 450 && ad >= wPrev * .85;
    wPrevT = now; wPrev = ad;
    if (now - wT < 180 && dir === wDir) { wSum += ad; if (mouse) wNotches++; }
    if (now < wCool) return;
    if (!(gap > 90 || mouse || rising || strong || dir !== wDir)) return;
    wCool = now + 120; wT = now; wDir = dir; wSum = ad; wNotches = 1; stepBy(dir, 1);
    setTimeout(() => { const extra = Math.min(2, Math.max(wNotches - 1, Math.floor(wSum / 2500))); if (extra > 0) stepBy(dir, extra); }, 190);
  }, { passive: false });
  stage.addEventListener('pointerdown', e => {
    if (e.target.closest('.wheel-list')) return; travel = 0; tx0 = e.clientX; ty0 = e.clientY; track(e); if (locked) return; if (!interactive) { skip(); return; }
    picking = null; dragging = true; settling = false; spinVel = 0; dragPrev = ptrAngle(e); dragPrevT = performance.now(); stage.setPointerCapture && stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener('pointermove', e => {
    track(e); travel += Math.abs(e.clientX - tx0) + Math.abs(e.clientY - ty0); tx0 = e.clientX; ty0 = e.clientY; if (!dragging) return;
    const a = ptrAngle(e); let d = a - dragPrev; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; state.spin += d;
    const now = performance.now(); spinVel = d / (Math.max(8, now - dragPrevT) / 1000); dragPrev = a; dragPrevT = now;
  });
  const up = e => { track(e); if (!dragging) return; dragging = false; stage.releasePointerCapture && stage.releasePointerCapture(e.pointerId); };
  stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
  stage.addEventListener('pointerleave', () => { pointer.inside = false; });
  stage.addEventListener('click', e => { if (e.target.closest('.wheel-list')) return; if (locked) { closeWork(); return; } if (interactive && travel < 5 && over >= 0) { if (over === frontPlane) openWork(); else pick(over); } });
  addEventListener('keydown', e => {
    if (sec.classList.contains('gone')) return; if (locked) { if (e.key === 'Escape') closeWork(); return; } const f = ['ArrowDown', 'ArrowRight', 'PageDown'].includes(e.key), b = ['ArrowUp', 'ArrowLeft', 'PageUp'].includes(e.key); if (!f && !b) return;
    e.preventDefault(); if (!interactive) { skip(); return; } pick(planeOfCell((((shown + (f ? 1 : -1)) % COUNT) + COUNT) % COUNT));
  });

  function layout(dt) {
    const THREE = T3, step = TAU / COUNT, spread = clamp01(state.spread);
    const endScale = narrowNow ? P.narrowEndScale : P.endScale, posX = tightNow ? P.tightPosX : narrowNow ? P.narrowPosX : P.posX;
    const cardPx = narrowNow ? 0 : P.cardX * viewW, shift = clamp01(state.shift), g = (1 + (endScale - 1) * shift) * fit, cx = (cardPx - P.ringRadius * radiusK * endScale * fit) * shift, cy = P.posY * viewH * .5 * shift;
    ringC.x = viewW * .5 + cx; ringC.y = viewH * .5 - cy + DY; frontAngle = cx !== 0 || cy !== 0 ? Math.atan2(-cy, -cx) : 0;
    const W = P.planeSize * planeK * g, H = W / 1.5; U.uSize.value.set(W, H); U.uRadius.value = P.radius * planeK * g;
    const sepExtent = H, faceEdge = W, R = P.ringRadius * radiusK * g, finalSep = Math.max(1, 2 * R * Math.sin(step / 2) - sepExtent);
    const maxN = Math.max(1, Math.abs(signedOffset(COUNT - 1))), dur = Math.max(.1, 1 - FAN_START - P.stagger);
    cum[0] = 0;
    for (let n = 1; n <= maxN; n++) { const s = FAN_START + ((n - 1) / maxN) * P.stagger, t = clamp01((spread - s) / dur), e = t * t * (3 - 2 * t); travelA[n] = e; cum[n] = cum[n - 1] + e; }
    const launch = (x => x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)(clamp01(state.launch)), Rnow = R * launch;
    order.length = 0;
    const trk = cursor.amt > .001, reach = Math.max(1, P.reach * W), sideReach = Math.max(1, P.sideReach * W), kRise = chase(dt, P.grab), kFall = chase(dt, P.release);
    let frontI = -1, frontD = 1e9, frontCell = 0;
    const cellOf = slot => (((-slot) % COUNT) + COUNT) % COUNT;
    const probe = pointer.inside && pointer.seeded && interactive; let overI = -1; const focusI = trk ? overBase : -1;
    const swellOf = i => Math.max(.05, 1 + P.swell * hoverF[i] - P.sideScale * sideF[i]);
    const pos = U.uPos.value, scl = U.uScale.value;
    for (let i = 0; i < COUNT; i++) {
      const sIdx = signedOffset(i), n = Math.abs(sIdx), u = i === 0 ? clamp01(state.progress) : travelA[n], cell = cellOf(sIdx);
      const angle = Math.sign(sIdx) * step * cum[n] + state.spin, px = Math.cos(angle) * Rnow + cx, py = Math.sin(angle) * Rnow + cy - DY; rest[i].x = px; rest[i].y = py;
      const da = angle - frontAngle, toFront = Math.abs(Math.atan2(Math.sin(da), Math.cos(da))); if (toFront < frontD) { frontD = toFront; frontI = i; frontCell = cell; }
      let f = 0, toX = 0, toY = 0;
      if (trk) { const dx = cursor.x - px, dy = cursor.y - py, dist = Math.hypot(dx, dy); f = smoothstep(reach, reach * .22, dist) * cursor.amt * u; if (f > .0001 && dist > .0001) { const l = P.pull * fit * f / dist; toX = dx * l; toY = dy * l; } }
      const k = f > hoverF[i] ? kRise : kFall; hoverF[i] += (f - hoverF[i]) * k; leanX[i] += (toX - leanX[i]) * k; leanY[i] += (toY - leanY[i]) * k;
      let sf = 0; if (focusI >= 0 && i !== focusI) sf = smoothstep(sideReach, sideReach * .2, Math.hypot(focusPos.x - px, focusPos.y - py)) * u;
      sideF[i] += (sf - sideF[i]) * (sf > sideF[i] ? kRise : kFall);
      let pushX = 0, pushY = 0; if (sideF[i] > .0001) { const dx = px - focusPos.x, dy = py - focusPos.y, dist = Math.hypot(dx, dy); if (dist > .0001) { const a = P.sidePush * fit * sideF[i] / dist; pushX = dx * a; pushY = dy * a; } }
      pos[i].set(px + leanX[i] + pushX, py + leanY[i] + pushY); U.uRot.value[i] = (angle) * launch;
      const sx = i === 0 ? cubicOut(clamp01(u / .7)) : cubicOut(clamp01(u / .34)), sy = i === 0 ? cubicOut(clamp01((u - .18) / .74)) : cubicOut(clamp01((u - .06) / .36)), sw = swellOf(i);
      const fm = FMT[cell]; scl[i].set(sx * sw * fm.ax, sy * sw * fm.ay, 1 - P.sideDim * sideF[i], cell);
      if (probe && overI < 0) { const rot = U.uRot.value[i], qx = cursor.x - (px + leanX[i] + pushX), qy = cursor.y - (py + leanY[i] + pushY), cr = Math.cos(rot), sr = Math.sin(rot); if (Math.abs(qx * cr + qy * sr) <= W * .5 * sx * sw * fm.ax && Math.abs(-qx * sr + qy * cr) <= H * .5 * sy * sw * fm.ay) overI = i; }
      order.push(i);
    }
    for (let i = COUNT; i < MAX_PLANES; i++) { scl[i].set(0, 0, 1, 0); hoverF[i] = leanX[i] = leanY[i] = sideF[i] = 0; }
    over = overI; overBase = overI; frontPlane = frontI;
    if (overI >= 0) { focusPos.x = rest[overI].x; focusPos.y = rest[overI].y; }
    if (frontI >= 0 && frontCell !== shown) { shown = frontCell; paintList(); }
    order.sort((a, b) => signedOffset(a) - signedOffset(b));
    const edgeHalf = faceEdge * .5 * P.thread, closed = spread > .995 && COUNT > 2, linkCount = 0; // no honey threads between cards
    for (let l = 0; l < linkCount; l++) {
      const ia = order[l], ib = order[(l + 1) % COUNT], ca = pos[ia], cb = pos[ib], shA = scl[ia].y / swellOf(ia), shB = scl[ib].y / swellOf(ib);
      const sep = Math.hypot(rest[ia].x - rest[ib].x, rest[ia].y - rest[ib].y) - sepExtent * .5 * (shA + shB), v = clamp01(sep / finalSep);
      let fl = 0; if (trk && P.web > .0001) { const d = Math.hypot(cursor.x - (ca.x + cb.x) * .5, cursor.y - (ca.y + cb.y) * .5), wr = Math.max(1, P.webReach * W); fl = smoothstep(wr, wr * .15, d) * cursor.amt; }
      webF[l] += (fl - webF[l]) * (fl > webF[l] ? kRise : kFall);
      const w = Math.max(Math.pow(1 - v, P.thin), P.web * webF[l]), rEnd = edgeHalf * w - P.dissolve, rMid = rEnd * (1 - (1 - P.pinch) * smoothstep(0, .7, v));
      U.uLinkA.value[l].set(ca.x, ca.y); U.uLinkB.value[l].set(cb.x, cb.y);
      U.uLinkPar.value[l].set(rEnd, rMid, P.sag * g * Math.pow(v, 1.5), Math.min(P.fillet * g * smoothstep(0, .35, v), Math.max(rMid, 0) * 1.5));
    }
    for (let l = linkCount; l < MAX_LINKS; l++) U.uLinkPar.value[l].set(-100, -100, 0, 0);
    U.uLinkCount.value = linkCount; U.uK.value = P.goo * planeK * fit; U.uWobble.value = P.wobble * fit * (1 - smoothstep(.2, .95, state.progress));
    U.uTextured.value = firstIn ? 1 : 0; U.uBlend.value = Math.max(.5, P.blend * planeK * g);
    U.uBandTop.value = P.bandTop * viewH; U.uBandBottom.value = P.bandBottom * viewH; U.uGlass.value.set(P.refract, P.squeeze, P.ripple, P.rippleFreq); U.uFringe.value = P.fringe; U.uSheen.value = P.sheen;
    // View pill rides the cursor over a hovered card
    const want = over >= 0 && !coarse && viewW > P.tagFrom; pill.style.opacity = want ? 1 : 0;
    pill.style.transform = 'translate(' + (cursor.x + viewW / 2 + P.tagX) + 'px,' + (viewH / 2 - cursor.y - P.tagY) + 'px) translate(-50%,-50%)';
  }

  let announced = -1;
  function paintList() { items.forEach((li, i) => li.classList.toggle('on', i === shown)); }
  function setMeta(i) { info.style.opacity = nameEl.style.opacity = 0; setTimeout(() => { if (shown !== i) return; const o = WORKS[i]; nameEl.textContent = o.name; info.querySelector('.d').textContent = o.desc; info.style.opacity = nameEl.style.opacity = 1; }, 90); }

  function updatePointer(dt) {
    const live = pointer.inside && pointer.seeded && interactive && !coarse; cursor.amt += ((live ? 1 : 0) - cursor.amt) * chase(dt, .12);
    const k = chase(dt, P.lag); cursor.x += (pointer.x - cursor.x) * k; cursor.y += (pointer.y - cursor.y) * k;
    cursor.wake = Math.max(cursor.wake * Math.pow(.94, dt * 60), clamp01(Math.hypot(pointer.x - cursor.x, pointer.y - cursor.y) / (Math.max(dt, .001) * 2600)));
    U.uMouse.value.set(cursor.x, cursor.y, cursor.amt, P.melt * fit); U.uMelt.value.set(P.meltReach * fit, P.wave * fit * cursor.wake * cursor.amt, P.waveFreq, P.waveSpeed);
  }

  // entry timeline, driven by entryT seconds (same timings as the reference)
  const D0 = 1.2, spreadStart = D0 + P.launchTime - .15, stageStart = spreadStart + P.stageAt * P.spreadTime, textStart = spreadStart + .42 * P.spreadTime;
  const landed = Math.max(stageStart + P.spinDelay + P.spinTime, stageStart + P.moveDelay + P.moveTime), END = landed;
  function applyEntry(t) {
    state.progress = seg(t, 0, D0, p2out); state.launch = seg(t, D0, P.launchTime, p2io);
    // rushing: the launch starts before the ring has finished forming, so the ring never stops between forming and flying out (blended in, no jump)
    if (rushS) { const rw = smoothstep(0, .25, rushS.u), l2 = seg(t, D0 - .55, P.launchTime + .55, p2io); state.launch += (l2 - state.launch) * rw; }
    state.spread = seg(t, spreadStart, P.spreadTime, p2out);
    // rushing: the other cards start fanning out of the first one while it is still flying to its place (same end time, blended in)
    if (rushS) { const rw = smoothstep(0, .25, rushS.u), s2 = seg(t, spreadStart - 1.2, P.spreadTime + 1.2, p2out); state.spread += (s2 - state.spread) * rw; }
    // rushing: spin and move start while the ring is still opening, so it never rests in between (same end time)
    const ds = rushS ? .9 * smoothstep(0, .3, rushS.u) : 0;
    state.spin = seg(t, stageStart + P.spinDelay - ds, P.spinTime + ds, p2io) * TAU; state.shift = seg(t, stageStart + P.moveDelay - ds, P.moveTime + ds, p2io);
    const tin = seg(t, -BASE_T, .7, p4out), lin = seg(t, textStart, .95, p4out), slide = state.shift;
    renderer.domElement.style.opacity = seg(t, D0, P.launchTime, p2io); title.style.opacity = tin; title.style.transform = 'translate(' + (-slide * viewW * 1.1) + 'px,-50%)'; list.style.opacity = lin;
  }

  function begin() {
    if (openEl) { openEl.remove(); openEl = null; } locked = false; stage.classList.remove('opened'); document.body.classList.remove('work-open');
    state.progress = state.launch = state.spread = state.spin = state.shift = 0; entryT = -BASE_T; rush = false; rushS = null; entrySpeed = BASE_S; rushT = 0; interactive = false; spinVel = 0; picking = null; settling = false; shown = -1; announced = -1;
    renderer.domElement.style.opacity = 0; info.style.opacity = nameEl.style.opacity = 0; title.style.opacity = 0; title.style.transform = ''; list.style.opacity = 0; pill.style.opacity = 0; hoverF.fill(0); leanX.fill(0); leanY.fill(0); sideF.fill(0); webF.fill(0); started = true; setTimeout(() => { if (started && !interactive) entryT = Math.max(entryT, 0); }, 0);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(.05, (now - last) / 1000 || 0); last = now;
    const visible = !sec.classList.contains('gone');
    if (!visible) { if (wasVisible) { info.style.opacity = nameEl.style.opacity = title.style.opacity = list.style.opacity = pill.style.opacity = 0; if (renderer) renderer.domElement.style.opacity = 0; announced = -1; shown = -1; } wasVisible = false; return; }
    if (!renderer) { if (!init.p) init.p = init(); return; }
    if (!wasVisible) { wasVisible = true; resize(); begin(); }
    if (!firstIn) return;
    U.uTime.value = now * .001;
    if (!interactive) {
      if (rush) {
        // rush: the rest of the entry is re-timed as one smooth curve (cubic Hermite): it starts at the current playback speed,
        // accelerates to a peak around the middle and decelerates to a stop exactly at the end
        if (!rushS) { const R = Math.max(.01, END - entryT), Tr = Math.max(.8, Math.min(1.5, R / 7)); rushS = { e0: entryT, R, Tr, m0: Math.min(3, entrySpeed * Tr / R), u: 0 }; }
        rushS.u = Math.min(1, rushS.u + dt / rushS.Tr); const u = rushS.u, u2 = u * u, u3 = u2 * u;
        entryT = rushS.e0 + rushS.R * ((u3 - 2 * u2 + u) * rushS.m0 + (-2 * u3 + 3 * u2));
      } else entryT += dt * entrySpeed;
      applyEntry(entryT); if (entryT >= END) { entryT = END; applyEntry(END); interactive = true; } }
    else {
      if (picking) { const x = clamp01((performance.now() - picking.t0) / picking.dur); state.spin = picking.from + (picking.to - picking.from) * p3io(x); if (x >= 1) picking = null; }
      else if (!dragging) {
        state.spin += spinVel * dt; spinVel *= Math.pow(P.damping, dt * 60); let off = 0;
        const slot = TAU / COUNT, decay = Math.max(.01, -Math.log(P.damping) * 60), engage = Math.max(P.snapFrom, decay * slot * .5), rate = 4.8 / Math.max(.05, P.snapTime);
        if (!settling && Math.abs(spinVel) < engage) { const coast = state.spin + spinVel / decay, phase = -frontAngle; snapTo = Math.round((coast + phase) / slot) * slot - phase; snapCap = Math.max(Math.abs(spinVel), slot * .5 * rate); settling = true; }
        if (settling) { off = snapTo - state.spin; const aim = Math.max(-snapCap, Math.min(snapCap, off * rate)); spinVel += (aim - spinVel) * clamp01(rate * dt); }
        if (Math.abs(spinVel) < .0015 && Math.abs(off) < .0008) { spinVel = 0; state.spin += off; }
      }
    }
    updatePointer(dt); layout(dt);
    if (interactive && shown >= 0 && shown !== announced) { announced = shown; setMeta(shown); }
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);
})();
