
// Projekti: seznam sestavi build-projekti.mjs iz map v projekti/ (projekti/projekti.json, GitHub Action ga posodobi sam).
// JSON že vsebuje vse velikosti, zato stran ničesar ne meri: prebere seznam in takoj zažene karusel.
(async () => {
  let list = [];
  try { const res = await fetch('projekti/projekti.json'); if (res.ok) list = await res.json(); } catch (_) {}
  window.PERENNIAL_WORKS = list.slice(0, 32).map(p => {
    const media = [].concat(p.youtube ? [{ t: 'yt', src: p.youtube }] : [], (p.videos || []).map(src => ({ t: 'v', src })), (p.images || []).map(src => ({ t: 'i', src })));
    const aspect = p.aspect || 2 / 3;
    return { name: p.name, desc: p.desc || '', thumb: p.thumb, aspect, openAspect: p.openAspect || aspect, media };
  });
  for (const src of ['wheel-shaders.js', 'wheel.js']) await new Promise(r => { const s = document.createElement('script'); s.src = src; s.onload = s.onerror = r; document.body.appendChild(s); });
})();
