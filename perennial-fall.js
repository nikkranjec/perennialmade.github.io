// perennial — letters falling behind frosted glass.
// Needs: opentype.js loaded first, and fonts/MundialP-Regular.ttf next to the page. three.js and cannon-es load from jsDelivr.
// Settings: set window.PERENNIAL_SETTINGS before this script (see index.html).

// "perennial" dropped onto a hard floor behind frosted glass.
// Physics: each letter is a rigid body (a compound of spheres along its strokes), simulated once per setting with cannon-es.
// Look: the front-most surface depth is split into slabs; each slab is blurred by its distance from the glass, then composited.

const PF = (() => {
  const W = 1920, H = 1080, FLOOR = 1030, BASE = 420, PXM = 400, US = 260, HZ = 240, REC = 120;
  const NL = 15, UMAX = 1.4, STEP = UMAX / (NL - 1);
  const imp = new Function('u', 'return import(u)');
  let libsP = null;
  const libs = () => libsP || (libsP = (async () => {
    while (!window.opentype) await new Promise(r => setTimeout(r, 40));
    const [THREE, CANNON, buf] = await Promise.all([
      imp('https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js'),
      imp('https://cdn.jsdelivr.net/npm/cannon-es@0.20.0/dist/cannon-es.js'),
      fetch('fonts/MundialP-Regular.ttf').then(r => r.arrayBuffer()),
    ]);
    return { THREE, CANNON, font: window.opentype.parse(buf) };
  })());

  const area = p => { let s = 0; for (let i = 0; i < p.length; i++) { const a = p[i], b = p[(i + 1) % p.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; };
  const inside = (pt, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) c = !c; } return c; };
  const rng = seed => { let s = (seed >>> 0) || 1; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

  function contours(glyph, size, step) {
    const out = []; let cur = null;
    for (const c of glyph.getPath(0, 0, size).commands) {
      if (c.type === 'M') { cur = [[c.x, c.y]]; cur.cmds = [c]; out.push(cur); }
      else if (c.type === 'L') { cur.push([c.x, c.y]); cur.cmds.push(c); }
      else if (c.type === 'Q' || c.type === 'C') {
        cur.cmds.push(c);
        const [x0, y0] = cur[cur.length - 1], n = Math.max(2, Math.ceil(Math.hypot(c.x - x0, c.y - y0) / step));
        for (let k = 1; k <= n; k++) {
          const t = k / n, u = 1 - t;
          cur.push(c.type === 'Q'
            ? [u * u * x0 + 2 * u * t * c.x1 + t * t * c.x, u * u * y0 + 2 * u * t * c.y1 + t * t * c.y]
            : [u * u * u * x0 + 3 * u * u * t * c.x1 + 3 * u * t * t * c.x2 + t * t * t * c.x, u * u * u * y0 + 3 * u * u * t * c.y1 + 3 * u * t * t * c.y2 + t * t * t * c.y]);
        }
      }
    }
    for (const p of out) { const a = p[0], b = p[p.length - 1]; if (p.length > 2 && Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.01) p.pop(); }
    return out.filter(p => p.length > 2);
  }

  function edt(f, w, h) {
    const n = Math.max(w, h), g = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
    const dt = len => {
      let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
      for (let q = 1; q < len; q++) {
        let s = ((g[q] + q * q) - (g[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
        while (s <= z[k]) { k--; s = ((g[q] + q * q) - (g[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
        k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
      }
      k = 0;
      for (let q = 0; q < len; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) * (q - v[k]) + g[v[k]]; }
    };
    for (let x = 0; x < w; x++) { for (let y = 0; y < h; y++) g[y] = f[y * w + x]; dt(h); for (let y = 0; y < h; y++) f[y * w + x] = d[y]; }
    for (let y = 0; y < h; y++) { for (let x = 0; x < w; x++) g[x] = f[y * w + x]; dt(w); for (let x = 0; x < w; x++) f[y * w + x] = d[x]; }
  }

  // The solid: every stroke becomes a rounded tube of radius rho (half the i-stem); half-thickness t(p) per pixel.
  function piece(ch, outer, holes, rho, dil) {
    const xs = outer.map(p => p[0]), ys = outer.map(p => p[1]), pad = 3 + Math.ceil(dil / 2);
    const bx = Math.floor(Math.min(...xs)) - pad, by = Math.floor(Math.min(...ys)) - pad;
    const w = Math.ceil(Math.max(...xs)) + pad - bx, h = Math.ceil(Math.max(...ys)) + pad - by;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.beginPath();
    for (const poly of [outer, ...holes]) { poly.forEach(([px, py], i) => (i ? x.lineTo(px - bx, py - by) : x.moveTo(px - bx, py - by))); x.closePath(); }
    x.fill('evenodd'); x.lineWidth = dil; x.lineJoin = 'round'; x.stroke();
    const al = x.getImageData(0, 0, w, h).data, n = w * h, f = new Float64Array(n), mask = new Uint8Array(n);
    for (let i = 0; i < n; i++) { mask[i] = al[i * 4 + 3] >= 128 ? 1 : 0; f[i] = mask[i] ? 1e20 : 0; }
    edt(f, w, h);
    const d = new Float32Array(n), t = new Float32Array(n);
    let sx = 0, sy = 0, sw = 0;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const k = j * w + i;
      if (!mask[k]) continue;
      const dd = Math.max(0, Math.sqrt(f[k]) - 0.5), e = Math.max(rho - dd, 0), tt = Math.sqrt(Math.max(0, rho * rho - e * e));
      d[k] = dd; t[k] = tt; sx += (i + 0.5) * tt; sy += (j + 0.5) * tt; sw += tt;
    }
    return { ch, w, h, bx, by, mask, d, t, Cx: bx + sx / sw, Cy: by + sy / sw, vol: 2 * sw };
  }

  function spheres(P, rho) {
    const cand = [];
    for (let k = 0; k < P.w * P.h; k++) if (P.mask[k] && P.d[k] >= 0.6 * rho) cand.push(k);
    if (!cand.length) { let b = 0; for (let k = 1; k < P.w * P.h; k++) if (P.d[k] > P.d[b]) b = k; cand.push(b); }
    cand.sort((a, b) => P.d[b] - P.d[a]);
    const cell = 0.9 * rho, grid = new Map(), out = [];
    for (const k of cand) {
      const px = k % P.w + 0.5, py = Math.floor(k / P.w) + 0.5, gx = Math.floor(px / cell), gy = Math.floor(py / cell);
      let ok = true;
      for (let a = -1; a <= 1 && ok; a++) for (let b = -1; b <= 1 && ok; b++) {
        const list = grid.get((gx + a) + ',' + (gy + b));
        if (list) for (const q of list) if ((q[0] - px) ** 2 + (q[1] - py) ** 2 < cell * cell) { ok = false; break; }
      }
      if (!ok) continue;
      const key = gx + ',' + gy;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push([px, py]);
      out.push({ x: (px + P.bx - P.Cx) / PXM, y: -(py + P.by - P.Cy) / PXM, r: Math.max(1, Math.min(P.t[k], P.d[k] + 0.5)) / PXM });
    }
    return out;
  }

  function mesh(THREE, P, g) {
    const nx = Math.floor((P.w - 1) / g) + 1, ny = Math.floor((P.h - 1) / g) + 1;
    const vid = new Int32Array(nx * ny * 2).fill(-1), pos = [], idx = [];
    const inG = (i, j) => P.mask[(j * g) * P.w + i * g];
    const V = (i, j, s) => {
      const k = (j * nx + i) * 2 + s;
      if (vid[k] < 0) {
        vid[k] = pos.length / 3;
        const px = i * g, py = j * g;
        pos.push(px + 0.5 + P.bx - P.Cx, -(py + 0.5 + P.by - P.Cy), (s ? -1 : 1) * P.t[py * P.w + px]);
      }
      return vid[k];
    };
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      if (!(inG(i, j) || inG(i + 1, j) || inG(i, j + 1) || inG(i + 1, j + 1))) continue;
      for (let s = 0; s < 2; s++) { const a = V(i, j, s), b = V(i + 1, j, s), c = V(i, j + 1, s), d = V(i + 1, j + 1, s); idx.push(a, c, b, b, c, d); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeBoundingBox();
    return geo;
  }

  function build({ THREE, font }) {
    const word = 'perennial', gl = [...word].map(ch => font.charToGlyph(ch));
    const em = gl.reduce((s, g) => s + g.advanceWidth, 0) / font.unitsPerEm;
    const ww = (window.PERENNIAL_SETTINGS || {}).wordWidth || 1152, bb = gl.map(g => g.getBoundingBox()), upm = font.unitsPerEm;
    const lsb = bb[0].x1 / upm, rsb = (gl[gl.length - 1].advanceWidth - bb[bb.length - 1].x2) / upm;
    const tr = (window.PERENNIAL_SETTINGS || {}).track ?? 0;
    const size = ww / (em + tr * (word.length - 1) - lsb - rsb + 0.026), track = tr * size, dil = 0.026 * size;  // weight + tracking fitted to the wordmark artwork
    const raw = [];
    let x = 0;
    gl.forEach((g, gi) => {
      const ch = word[gi], cs = contours(g, size, 2.5).map(c => { const m = c.map(([px, py]) => [px + x, py]); m.cmds = c.cmds; m.xo = x; return m; }), ar = cs.map(area);
      const big = ar.reduce((m, a, i) => (Math.abs(a) > Math.abs(ar[m]) ? i : m), 0), sg = Math.sign(ar[big]);
      const outers = cs.filter((c, i) => Math.sign(ar[i]) === sg), holes = cs.filter((c, i) => Math.sign(ar[i]) !== sg);
      const maxA = Math.max(...outers.map(o => Math.abs(area(o))));
      for (const o of outers) raw.push({ ch: ch === 'i' && Math.abs(area(o)) < maxA ? 'dot' : ch, outer: o, holes: holes.filter(hh => inside(hh[0], o)) });
      x += g.advanceWidth / font.unitsPerEm * size + track;
    });
    const st = raw.find(r => r.ch === 'i').outer.map(p => p[0]);
    const rho = 0.5 * (Math.max(...st) - Math.min(...st)) + dil / 2;
    let minX = Infinity, maxX = -Infinity;
    for (const r of raw) for (const p of r.outer) { if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0]; }
    const pieces = raw.map(r => {
      const P = piece(r.ch, r.outer, r.holes, rho, dil);
      P.spheres = spheres(P, rho);
      P.geo = mesh(THREE, P, 2);
      // exact vector outline in body-local coordinates, for the sharp (unfrosted) part of the fall
      const path = new Path2D();
      for (const poly of [r.outer, ...r.holes]) {
        const X = v => v + poly.xo - P.Cx, Y = v => v - P.Cy;
        for (const c of poly.cmds) {
          if (c.type === 'M') path.moveTo(X(c.x), Y(c.y));
          else if (c.type === 'L') path.lineTo(X(c.x), Y(c.y));
          else if (c.type === 'Q') path.quadraticCurveTo(X(c.x1), Y(c.y1), X(c.x), Y(c.y));
          else if (c.type === 'C') path.bezierCurveTo(X(c.x1), Y(c.y1), X(c.x2), Y(c.y2), X(c.x), Y(c.y));
        }
        path.closePath();
      }
      P.path = path;
      delete P.mask; delete P.d; delete P.t;
      return P;
    });
    return { pieces, rho, size, dil, cx: (minX + maxX) / 2 };
  }

  async function simulate(CANNON, G, tw, dur, alive, jit) {
    const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.81, 0) });
    world.allowSleep = true;
    world.solver.iterations = 20;
    world.broadphase = new CANNON.NaiveBroadphase();
    const mL = new CANNON.Material('letter'), mF = new CANNON.Material('floor'), mG = new CANNON.Material('glass');
    const cLF = new CANNON.ContactMaterial(mL, mF, { friction: 0.55, restitution: 0.32 }), cLL = new CANNON.ContactMaterial(mL, mL, { friction: 0.4, restitution: 0.18 });
    world.addContactMaterial(cLF); world.addContactMaterial(cLL);
    world.addContactMaterial(new CANNON.ContactMaterial(mL, mG, { friction: 0, restitution: 0.05 }));
    const wall = (mat, x, y, z, ex, ey) => { const b = new CANNON.Body({ mass: 0, material: mat }); b.addShape(new CANNON.Plane()); b.position.set(x, y, z); b.quaternion.setFromEuler(ex, ey, 0); world.addBody(b); };
    const rhoM = G.rho / PXM, gapM = tw.gap * US / PXM, roomM = tw.room * US / PXM, slotM = 2 * rhoM + roomM;
    const xw = (W / 2 - 40) / PXM;
    wall(mF, 0, 0, 0, -Math.PI / 2, 0);
    wall(mG, 0, 0, -gapM, Math.PI, 0);
    wall(mG, 0, 0, -gapM - slotM, 0, 0);
    wall(mG, -xw, 0, 0, 0, Math.PI / 2);
    wall(mG, xw, 0, 0, 0, -Math.PI / 2);
    // jit: a small per-play perturbation on top of the chosen seed (amt 0 = identical every time)
    const rnd = rng(tw.seed), jr = rng(jit.seed), ja = jit.seed ? jit.amt : 0, J = sc => (jr() - 0.5) * sc * ja;
    const phi = -(tw.tilt + J(6)) * Math.PI / 180, cyL = -0.3 * G.size, ycW = (FLOOR - ((tw.base ?? BASE) + cyL)) / PXM;
    const depthM = Math.min(tw.depth, tw.room) * US / PXM, k = tw.spin;
    const bodies = G.pieces.map(P => {
      const b = new CANNON.Body({ mass: P.vol / (PXM * PXM * PXM) * 1000, material: mL, linearDamping: 0.02, angularDamping: P.ch === 'dot' ? 0.35 : 0.08 });
      b.allowSleep = true; b.sleepSpeedLimit = 0.03; b.sleepTimeLimit = 0.5;
      for (const s of P.spheres) b.addShape(new CANNON.Sphere(s.r), new CANNON.Vec3(s.x, s.y, 0));
      b.updateMassProperties();
      b.ld0 = b.linearDamping; b.ad0 = b.angularDamping;
      const dx = (P.Cx - G.cx) / PXM, dy = -(P.Cy - cyL) / PXM;
      b.position.set(dx * Math.cos(phi) - dy * Math.sin(phi), ycW + dx * Math.sin(phi) + dy * Math.cos(phi), -gapM - rhoM - 0.002 - rnd() * depthM);
      b.quaternion.setFromAxisAngle(new CANNON.Vec3(0, 0, 1), phi);
      b.velocity.set((rnd() - 0.5) * 0.5 * k + J(0.6), 0, 0);
      b.angularVelocity.set((rnd() - 0.5) * 3 * k + J(2.4), (rnd() - 0.5) * 3 * k + J(2.4), (rnd() - 0.5) * 1.5 * k + J(1.2));
      world.addBody(b);
      return b;
    });
    const nb = bodies.length, n = Math.ceil(dur * REC) + 1, fr = new Float32Array(n * nb * 7);
    const rec = f => bodies.forEach((b, i) => {
      const o = (f * nb + i) * 7;
      fr[o] = b.position.x; fr[o + 1] = b.position.y; fr[o + 2] = b.position.z;
      fr[o + 3] = b.quaternion.x; fr[o + 4] = b.quaternion.y; fr[o + 5] = b.quaternion.z; fr[o + 6] = b.quaternion.w;
    });
    rec(0);
    // over the last ~2 s that is shown, damping rises and bounce drops so every play comes to rest by its final frame
    const tE = dur - 0.25, tS = Math.max(1, tE - 2);
    for (let f = 1; f < n; f++) {
      const t = f / REC;
      if (t > tS) {
        const a = Math.min(1, (t - tS) / Math.max(0.3, tE - 0.3 - tS)), e = a * a * (3 - 2 * a);
        bodies.forEach((b, i) => { const dot = G.pieces[i].ch === 'dot'; b.linearDamping = b.ld0 + ((dot ? 0.99 : 0.97) - b.ld0) * e; b.angularDamping = b.ad0 + ((dot ? 0.995 : 0.99) - b.ad0) * e; b.sleepSpeedLimit = 0.03 + 0.09 * e; b.sleepTimeLimit = 0.5 - 0.3 * e; });
        cLF.restitution = 0.32 - 0.28 * e; cLL.restitution = 0.18 - 0.16 * e;
      }
      for (let s = 0; s < HZ / REC; s++) world.step(1 / HZ);
      rec(f);
      if (f % 24 === 0) { await new Promise(r => setTimeout(r, 0)); if (!alive()) return null; }
    }
    // settled: no part of a letter moves more than 5 px over the last 0.4 s shown, every letter rests on the floor or on another letter,
    // and no letter is propped up by an invisible side wall
    let settled = true, motion = 0;
    const why = { move: 0, wall: 0, hang: 0 };
    if (n > 1) {
      const fE = Math.min(n - 1, Math.max(0, Math.round(tE * REC))), fA = Math.max(0, fE - Math.round(0.4 * REC)), eps = 4 / PXM;
      const world = [];
      const place = (o, sp) => {
        const qx = fr[o + 3], qy = fr[o + 4], qz = fr[o + 5], qw = fr[o + 6];
        const tx = -2 * qz * sp.y, ty = 2 * qz * sp.x, tz = 2 * (qx * sp.y - qy * sp.x);
        return [fr[o] + sp.x + qw * tx + (qy * tz - qz * ty), fr[o + 1] + sp.y + qw * ty + (qz * tx - qx * tz), fr[o + 2] + qw * tz + (qx * ty - qy * tx), sp.r];
      };
      for (let i = 0; i < nb; i++) {
        const o = (fE * nb + i) * 7, p = (fA * nb + i) * 7, sps = G.pieces[i].spheres;
        const W3 = sps.map(sp => place(o, sp));
        // visible motion: how far any part of the letter moved over the last 0.4 s (a spin about its own tube is invisible and ignored)
        let dm = 0;
        sps.forEach((sp, k) => { const q = place(p, sp), w = W3[k]; dm = Math.max(dm, Math.hypot(w[0] - q[0], w[1] - q[1], w[2] - q[2]) * PXM); });
        if (G.pieces[i].ch === 'dot') dm = Math.hypot(fr[o] - fr[p], fr[o + 1] - fr[p + 1], fr[o + 2] - fr[p + 2]) * PXM;
        motion = Math.max(motion, dm);
        if (dm > 5) why.move++;
        world.push({ W3, cx: fr[o], wall: W3.some(w => Math.abs(w[0]) + w[3] > xw - 0.004) });
      }
      for (let i = 0; i < nb; i++) {
        const { W3: A, cx, wall } = world[i], fc = A.filter(w => w[1] - w[3] < 1.5 * eps);
        if (!fc.length) {
          let sup = false;
          for (let j = 0; j < nb && !sup; j++) {
            if (j === i) continue;
            for (const a of A) { for (const b of world[j].W3) { if (b[1] < a[1] && Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) <= a[3] + b[3] + eps) { sup = true; break; } } if (sup) break; }
          }
          if (!sup) why.hang++;
          if (wall) why.wall++;
        } else if (wall) {
          const xs = fc.map(w => w[0]);
          if (cx < Math.min(...xs) - 0.005 || cx > Math.max(...xs) + 0.005) why.wall++;
        }
      }
      settled = !why.move && !why.wall && !why.hang;
      motion += 60 * why.wall + 200 * why.hang;
    }
    return { fr, nb, n, settled, motion, why };
  }

  class Frost {
    constructor(THREE, canvas, G, res = 1, Hc = H) {
      this.res = res; const RW = Math.round(W * res), RH = Math.round(Hc * res);
      const r = this.r = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, preserveDrawingBuffer: true });
      r.setPixelRatio(1); r.setSize(RW, RH, false); r.autoClear = false;
      this.cam = new THREE.OrthographicCamera(0, W, Hc, 0, 1, 10000);
      this.cam.position.set(0, 0, 5000); this.cam.updateMatrixWorld();
      this.scene = new THREE.Scene();
      const md = new THREE.ShaderMaterial({
        side: THREE.DoubleSide, blending: THREE.NoBlending,
        vertexShader: 'varying float vZ; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vZ = w.z; gl_Position = projectionMatrix * viewMatrix * w; }',
        fragmentShader: 'varying float vZ; void main(){ gl_FragColor = vec4(-vZ / ' + US.toFixed(1) + ', 0.0, 0.0, 1.0); }',
      });
      this.meshes = G.pieces.map(P => { const m = new THREE.Mesh(P.geo, md); m.matrixAutoUpdate = false; m.frustumCulled = false; this.scene.add(m); return m; });
      const rt = (w, h, filt, depth) => new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, minFilter: filt, magFilter: filt, depthBuffer: !!depth, generateMipmaps: false });
      this.rtD = rt(RW, RH, THREE.NearestFilter, true);
      this.rtA = rt(RW, RH, THREE.LinearFilter);
      this.lv = [1, 2, 4, 8].map(f => ({ f, a: rt(Math.ceil(RW / f), Math.ceil(RH / f), THREE.LinearFilter), b: rt(Math.ceil(RW / f), Math.ceil(RH / f), THREE.LinearFilter) }));
      const vs = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
      const M = (fs, uniforms, blending) => new THREE.ShaderMaterial({ vertexShader: vs, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false, blending: blending || THREE.NoBlending });
      this.mx = M(`uniform sampler2D tD; uniform vec2 full; uniform float f; uniform float uk; uniform float st; uniform float um; uniform float al;
        void main(){
          vec2 base = floor(gl_FragCoord.xy) * f; float s = 0.0;
          for (int j = 0; j < 8; j++) { if (float(j) >= f) break;
            for (int i = 0; i < 8; i++) { if (float(i) >= f) break;
              vec4 d = texture2D(tD, (base + vec2(float(i), float(j)) + 0.5) / full);
              s += d.a * max(0.0, 1.0 - abs(min(d.r, um) - uk) / st); } }
          gl_FragColor = vec4(s / (f * f) * al, 0.0, 0.0, 1.0);
        }`, { tD: { value: this.rtD.texture }, full: { value: new THREE.Vector2(RW, RH) }, f: { value: 1 }, uk: { value: 0 }, st: { value: STEP }, um: { value: UMAX }, al: { value: 1 } });
      this.mb = M(`uniform sampler2D tS; uniform vec2 tx; uniform float sg; varying vec2 vUv;
        void main(){
          float s = 0.0, ws = 0.0, R = ceil(3.0 * sg);
          for (int i = -40; i <= 40; i++) { float fi = float(i); if (abs(fi) > R) continue;
            float w = exp(-fi * fi / (2.0 * sg * sg)); s += w * texture2D(tS, vUv + tx * fi).r; ws += w; }
          gl_FragColor = vec4(s / ws, 0.0, 0.0, 1.0);
        }`, { tS: { value: null }, tx: { value: new THREE.Vector2() }, sg: { value: 1 } });
      this.ma = M(`uniform sampler2D tS; varying vec2 vUv; void main(){ gl_FragColor = vec4(texture2D(tS, vUv).r, 0.0, 0.0, 1.0); }`, { tS: { value: null } }, THREE.AdditiveBlending);
      this.mc = M(`uniform sampler2D tA; uniform vec3 bg; uniform vec3 ink; varying vec2 vUv;
        void main(){ float a = clamp(texture2D(tA, vUv).r, 0.0, 1.0); gl_FragColor = vec4(ink * a, a); }`,
        { tA: { value: this.rtA.texture }, bg: { value: new THREE.Vector3(217 / 255, 221 / 255, 216 / 255) }, ink: { value: new THREE.Vector3(64 / 255, 64 / 255, 62 / 255) } });
      this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mx); this.quad.frustumCulled = false;
      this.qs = new THREE.Scene(); this.qs.add(this.quad);
      this.qc = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      this.p = new THREE.Vector3(); this.q = new THREE.Quaternion(); this.one = new THREE.Vector3(1, 1, 1); this.box = new THREE.Box3();
    }
    pass(m, target) { this.quad.material = m; this.r.setRenderTarget(target); this.r.render(this.qs, this.qc); }
    render(sim, tp, frost, off = 0) {
      const F = sim.fr, nb = sim.nb, fi = Math.min(sim.n - 1, Math.max(0, tp * REC)), f0 = Math.floor(fi), f1 = Math.min(sim.n - 1, f0 + 1), a = fi - f0;
      let uLo = Infinity, uHi = -Infinity;
      this.meshes.forEach((m, i) => {
        const o = (f0 * nb + i) * 7, p = (f1 * nb + i) * 7;
        const sgn = F[o + 3] * F[p + 3] + F[o + 4] * F[p + 4] + F[o + 5] * F[p + 5] + F[o + 6] * F[p + 6] < 0 ? -1 : 1;
        const Lp = (kk, s) => F[o + kk] + (F[p + kk] * s - F[o + kk]) * a;
        this.p.set(W / 2 + Lp(0, 1) * PXM, (H - FLOOR) + Lp(1, 1) * PXM + off, Lp(2, 1) * PXM);
        this.q.set(Lp(3, sgn), Lp(4, sgn), Lp(5, sgn), Lp(6, sgn)).normalize();
        m.matrix.compose(this.p, this.q, this.one); m.matrixWorldNeedsUpdate = true;
        this.box.copy(m.geometry.boundingBox).applyMatrix4(m.matrix);
        uLo = Math.min(uLo, -this.box.max.z / US); uHi = Math.max(uHi, -this.box.min.z / US);
      });
      const r = this.r;
      r.setClearColor(0x000000, 0);
      r.setRenderTarget(this.rtD); r.clear(true, true, true); r.render(this.scene, this.cam);
      r.setRenderTarget(this.rtA); r.clear(true, false, false);
      const k0 = Math.max(0, Math.floor(uLo / STEP) - 1), k1 = Math.min(NL - 1, Math.ceil(uHi / STEP) + 1);
      for (let k = k0; k <= k1; k++) {
        const uk = k * STEP, sg = (1 + frost * uk) * this.res, lv = this.lv[sg <= 10 ? 0 : sg <= 20 ? 1 : sg <= 40 ? 2 : 3];
        const U = this.mx.uniforms; U.f.value = lv.f; U.uk.value = uk; U.al.value = 1 - 0.22 * Math.min(uk, 1) * Math.min(1, frost / 19);
        this.pass(this.mx, lv.a);
        const B = this.mb.uniforms; B.sg.value = sg / lv.f;
        B.tS.value = lv.a.texture; B.tx.value.set(1 / lv.a.width, 0); this.pass(this.mb, lv.b);
        B.tS.value = lv.b.texture; B.tx.value.set(0, 1 / lv.b.height); this.pass(this.mb, lv.a);
        this.ma.uniforms.tS.value = lv.a.texture; this.pass(this.ma, this.rtA);
      }
      this.pass(this.mc, null);
    }
  }

  return { libs, build, simulate, Frost, W, H };
})();

// ---- Player: letters fall in real time from the hero down to the footer floor (glued to the page).
// Sharp vector letters (2D canvas) for most of the fall, cross-fading into the frosted WebGL render near the landing.
(() => {
  const cfg = Object.assign({
    seed: 70, randomSeed: true, variation: 0.3, tilt: 0, spin: 1, frost: 19, gap: 0.42, depth: 0.25, room: 0.5,
    ink: '#141414', wordWidth: 1152, motionBlur: false,
  }, window.PERENNIAL_SETTINGS || {});
  const canvas = document.getElementById('perennial'), crisp = document.getElementById('perennial-crisp'), wm = document.querySelector('.wm');
  if (!canvas || !crisp || !wm) return;
  const ctx = crisp.getContext('2d');
  const FLOOR = 1030, PXM = 400, REC = 120, RATE = 1.15;
  const clamp01 = v => Math.min(1, Math.max(0, v)), smooth = v => v * v * (3 - 2 * v);
  const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const newPlay = () => ({ seed: cfg.randomSeed ? 1 + Math.floor(Math.random() * 99) : cfg.seed, js: cfg.variation > 0 ? 1 + Math.floor(Math.random() * 1e9) : 0 });
  const varies = cfg.randomSeed || cfg.variation > 0;
  let L, G, gfx, cur = null, next = null, raf = 0, dropped = false, pile = false, rearm = false, pre = false, lastCross = '', ready = false, rt = 0, t0 = 0;
  const probe = document.getElementById('floor-probe');
  const maxScroll = () => Math.max(0, document.documentElement.scrollHeight - innerHeight);
  const floorCss = () => probe.getBoundingClientRect().height;   // distance of the floor line from the bottom of the window (css px)
  // D: distance (canvas px) from the hero text baseline down to the footer floor
  const layout = () => {
    const b = wm.querySelector('.bl').getBoundingClientRect(), cw = canvas.clientWidth;
    const D = (innerHeight - floorCss() + maxScroll() - (b.top + scrollY)) * PF.W / cw;
    return { D, tF: Math.sqrt(2 * Math.max(0.3, D) / PXM / 9.81) };
  };
  // world offset for the frosted canvas (its bottom edge is the bottom of the window)
  const off = () => { const k = PF.W / canvas.clientWidth; return -(maxScroll() - scrollY) * k + floorCss() * k - 50; };
  const sim = (pl, lay) => PF.simulate(L.CANNON, G, Object.assign({}, cfg, { seed: pl.seed, base: FLOOR - lay.D }), lay.tF + 4.9, () => true, { seed: pl.js, amt: cfg.variation });
  const settled = async () => {
    const lay = layout(); let best = null;
    for (let k = 0; k < 8; k++) { const s = await sim(newPlay(), lay); s.lay = lay; if (s.settled || !varies) return s; if (!best || s.motion < best.motion) best = s; }
    return best;
  };
  const prefetch = () => { if (varies && !document.body.classList.contains('view-sub')) settled().then(s => { next = s; }); };
  const sizeCrisp = () => { const d = Math.min(2, window.devicePixelRatio || 1); crisp.width = Math.round(innerWidth * d); crisp.height = Math.round(innerHeight * d); sprites = null; if (cur) { ctx._d = null; } };
  // sharp letters are drawn on a window-sized canvas, so nothing is cut off at the bottom while falling
  const tmp = document.createElement('canvas'), tctx = tmp.getContext('2d');
  // each letter is pre-rendered once into a small sprite, so a motion-blur frame is just a few image draws
  let sprites = null;
  const buildSprites = () => {
    const sc = canvas.clientWidth / PF.W * (crisp.width / innerWidth);
    sprites = G.pieces.map(P => {
      const pad = G.dil + 3, l = P.bx - P.Cx - pad, t = P.by - P.Cy - pad, cv = document.createElement('canvas');
      cv.width = Math.ceil((P.w + 2 * pad) * sc); cv.height = Math.ceil((P.h + 2 * pad) * sc);
      const x = cv.getContext('2d'); x.setTransform(sc, 0, 0, sc, -l * sc, -t * sc);
      x.fillStyle = x.strokeStyle = cfg.ink; x.fill(P.path, 'evenodd'); x.lineWidth = G.dil; x.lineJoin = 'round'; x.stroke(P.path);
      return { cv, l, t, w: cv.width / sc, h: cv.height / sc };
    });
  };
  const clearDirty = c => { c.setTransform(1, 0, 0, 1, 0, 0); const q = c._d; if (q) c.clearRect(q[0], q[1], q[2], q[3]); else c.clearRect(0, 0, crisp.width, crisp.height); c._d = null; };
  const drawPieces = (c, tp, env, vector) => {
    const F = cur.fr, nb = cur.nb, fi = Math.min(cur.n - 1, Math.max(0, tp * REC)), f0 = Math.floor(fi), f1 = Math.min(cur.n - 1, f0 + 1), a = fi - f0, sc = env.sc;
    clearDirty(c);
    c.fillStyle = c.strokeStyle = cfg.ink;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; const R = G.size * sc;
    G.pieces.forEach((P, i) => {
      const q0 = (f0 * nb + i) * 7, q1 = (f1 * nb + i) * 7;
      const sg = F[q0 + 3] * F[q1 + 3] + F[q0 + 4] * F[q1 + 4] + F[q0 + 5] * F[q1 + 5] + F[q0 + 6] * F[q1 + 6] < 0 ? -1 : 1;
      const Lp = (k, s) => F[q0 + k] + (F[q1 + k] * s - F[q0 + k]) * a;
      let x = Lp(3, sg), y = Lp(4, sg), z = Lp(5, sg), w = Lp(6, sg); const n = Math.hypot(x, y, z, w); x /= n; y /= n; z /= n; w /= n;
      const r00 = 1 - 2 * (y * y + z * z), r01 = 2 * (x * y - z * w), r10 = 2 * (x * y + z * w), r11 = 1 - 2 * (x * x + z * z);
      const cx = env.mid + Lp(0, 1) * PXM * sc, cy = env.floorY - Lp(1, 1) * PXM * sc;
      x0 = Math.min(x0, cx - R); x1 = Math.max(x1, cx + R); y0 = Math.min(y0, cy - R); y1 = Math.max(y1, cy + R);
      c.setTransform(sc * r00, -sc * r10, -sc * r01, sc * r11, cx, cy);
      if (vector) { c.fill(P.path, 'evenodd'); c.lineWidth = G.dil; c.lineJoin = 'round'; c.stroke(P.path); }
      else { const s = sprites[i]; c.drawImage(s.cv, s.l, s.t, s.w, s.h); }
    });
    x0 = Math.max(0, Math.floor(x0) - 2); y0 = Math.max(0, Math.floor(y0) - 2); x1 = Math.min(crisp.width, Math.ceil(x1) + 2); y1 = Math.min(crisp.height, Math.ceil(y1) + 2);
    const bb = [x0, y0, Math.max(0, x1 - x0), Math.max(0, y1 - y0)];
    c._d = bb; return bb;
  };
  // motion blur: average several sub-frame samples across a 180-degree shutter; sample count follows the on-screen speed
  const SHUTTER = 0.5 / 60 * RATE;
  const drawCrisp = (tp, sk = 1) => {
    const F = cur.fr, nb = cur.nb, d = crisp.width / innerWidth, sc = canvas.clientWidth / PF.W * d, dt = Math.min(tp, SHUTTER * sk);
    const env = { sc, mid: innerWidth / 2 * d, floorY: (innerHeight - floorCss() + maxScroll() - scrollY) * d };
    let streak = 0;
    const f1 = Math.min(cur.n - 1, Math.round(tp * REC)), f0 = Math.min(cur.n - 1, Math.max(0, Math.round((tp - dt) * REC)));
    for (let i = 0; i < nb; i += 3) streak = Math.max(streak, (Math.abs(F[(f1 * nb + i) * 7 + 1] - F[(f0 * nb + i) * 7 + 1]) + Math.abs(F[(f1 * nb + i) * 7] - F[(f0 * nb + i) * 7])) * PXM * sc / d);
    const n = reduce || !cfg.motionBlur || dt <= 0 ? 1 : Math.min(10, Math.max(1, Math.ceil(streak / 4)));
    if (n === 1) { drawPieces(ctx, tp, env, true); return; }
    if (!sprites) buildSprites();
    if (tmp.width !== crisp.width || tmp.height !== crisp.height) { tmp.width = crisp.width; tmp.height = crisp.height; tctx._d = null; }
    clearDirty(ctx);
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 1 / n;
    let u = null;
    for (let j = 0; j < n; j++) {
      const bb = drawPieces(tctx, tp - dt * j / (n - 1), env, false);
      if (bb[2] > 0 && bb[3] > 0) ctx.drawImage(tmp, bb[0], bb[1], bb[2], bb[3], bb[0], bb[1], bb[2], bb[3]);
      u = u ? [Math.min(u[0], bb[0]), Math.min(u[1], bb[1]), Math.max(u[0] + u[2], bb[0] + bb[2]) - Math.min(u[0], bb[0]), Math.max(u[1] + u[3], bb[1] + bb[3]) - Math.min(u[1], bb[1])] : bb;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx._d = u;
  };
  const frame = () => {
    raf = 0;
    const T = cur.lay.tF, end = T + 4.65;
    const tau = reduce ? end : Math.min(end, (performance.now() - t0) / 1000 * RATE);
    const k = clamp01((tau - 0.4 * T) / (0.4 + 0.2 * T)), cross = smooth(clamp01(k / 0.35));
    if (cross < 1) drawCrisp(tau);
    if (cross > 0) gfx.render(cur, tau, cfg.frost * smooth(k), off());
    const key = cross.toFixed(3);
    if (key !== lastCross) { lastCross = key; crisp.style.opacity = 1 - cross; canvas.style.opacity = cross; }
    if (tau < end) raf = requestAnimationFrame(frame);
    else if (!pre) { pre = true; setTimeout(prefetch, 300); }
  };
  const request = () => { if (!raf) raf = requestAnimationFrame(frame); };
  const onScroll = () => {
    if (!ready || document.body.classList.contains('view-sub')) return;
    const B = document.body;
    // reached the bottom: the hero wordmark is already back at the top (off-screen), the pile stays in the footer
    if (dropped && scrollY >= maxScroll() - 40) { dropped = false; pile = true; rearm = false; B.classList.remove('dropped'); }
    if (scrollY <= 2) { if (pile) rearm = true; }
    else if (!dropped && (!pile || rearm)) {
      dropped = true; pile = false; rearm = false;
      if (next) { cur = next; next = null; }
      B.classList.add('dropped'); t0 = performance.now(); pre = false;
    }
    if (dropped || pile) request();
  };
  // called by the page router when the home view is shown again: wordmark back, animation ready to play
  window.perennialReset = () => {
    if (!ready) return;
    dropped = false; pile = false; rearm = false; cancelAnimationFrame(raf); raf = 0;
    document.body.classList.remove('dropped');
    crisp.style.opacity = canvas.style.opacity = ''; lastCross = '';
    if (next) { cur = next; next = null; }
    if (Math.abs(layout().D - cur.lay.D) >= 2) settled().then(s => { if (!dropped) cur = s; });
  };
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(async () => {
      if (!ready || document.body.classList.contains('view-sub')) return;
      sizeCrisp();
      if ((dropped && raf) || Math.abs(layout().D - cur.lay.D) < 2) { if (dropped) request(); return; }
      next = null; const s = await settled();
      if (dropped && raf) return;
      cur = s;
      if (dropped || pile) { t0 = performance.now() - 1e7; request(); }
    }, 300);
  });
  (async () => {
    while (!document.body.classList.contains('wm-ready')) await new Promise(r => setTimeout(r, 40));
    L = await PF.libs();
    G = PF.build(L);
    const cw = canvas.clientWidth, Hc = Math.min(3072, Math.max(PF.H, Math.ceil(PF.W * Math.max(screen.height, innerHeight) / Math.max(320, cw * 0.6))));
    canvas.style.setProperty('--hr', Hc / PF.W);
    const res = Math.min(0.75, Math.max(0.5, cw * (window.devicePixelRatio || 1) / PF.W));
    gfx = new PF.Frost(L.THREE, canvas, G, res, Hc);
    gfx.mc.uniforms.ink.value.set(...rgb(cfg.ink));
    sizeCrisp();
    cur = await settled();
    ready = true;
    document.body.classList.add('physics');
    onScroll();
  })().catch(e => console.error('perennial:', e));
})();
