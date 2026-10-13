// Projekti: seznam se sestavi iz map v projekti/ (projekti/projekti.json ustvari build-projekti.mjs ali GitHub Action).
// Tu se prebere seznam, izmerijo se razmerja stranic, nato se zažene karusel.
(async () => {
  const ratioImg = src => new Promise(r => { const i = new Image(); i.onload = () => r(i.naturalWidth / i.naturalHeight || 0); i.onerror = () => r(0); i.src = src; });
  const ratioVid = src => new Promise(r => { const v = document.createElement('video'), t = setTimeout(() => r(0), 6000); v.preload = 'metadata'; v.muted = true; v.onloadedmetadata = () => { clearTimeout(t); r(v.videoWidth / v.videoHeight || 0); }; v.onerror = () => { clearTimeout(t); r(0); }; v.src = src; });
  let list = [];
  try { const res = await fetch('projekti/projekti.json', { cache: 'no-cache' }); if (res.ok) list = await res.json(); } catch (_) {}
  window.PERENNIAL_WORKS = await Promise.all(list.slice(0, 32).map(async p => {
    const media = [].concat(p.youtube ? [{ t: 'yt', src: p.youtube }] : [], (p.videos || []).map(src => ({ t: 'v', src })), (p.images || []).map(src => ({ t: 'i', src })));
    const aspect = await ratioImg(p.thumb) || 2 / 3, f = media[0];
    const openAspect = p.ratio || (f && f.t === 'v' ? await ratioVid(f.src) : f && f.t === 'i' ? await ratioImg(f.src) : 0) || aspect;
    return { name: p.name, desc: p.desc || '', thumb: p.thumb, aspect, openAspect, media };
  }));
  for (const src of ['wheel-shaders.js', 'wheel.js']) await new Promise(r => { const s = document.createElement('script'); s.src = src; s.onload = s.onerror = r; document.body.appendChild(s); });
})();
