# Perennial

Statična stran, brez gradnje. Vse je v tej mapi.

## Objava na GitHub Pages
1. Naloži vsebino te mape (ne mape same) v koren repozitorija.
2. Settings > Pages > Source: Deploy from a branch, branch `main`, mapa `/ (root)`.
3. Domena: datoteke `CNAME` v tej mapi ni, ker jo repozitorij že ima. Pusti jo, kot je. Domena v `index.html` (canonical, og:url, og:image, twitter:image), `robots.txt` in `sitemap.xml` je `perennialmade.com`. Če je tvoja domena drugačna, jo zamenjaj.
4. Pri ponudniku domene dodaj A zapise (185.199.108.153, 185.199.109.153, 185.199.110.153, 185.199.111.153) ali CNAME na `uporabnik.github.io`, nato v Pages vklopi Enforce HTTPS.

## Datoteke
- `index.html`, `styles.css`, `main.js`: stran, prehodi, mreža ljudi
- `perennial-fall.js`: padajoče črke (three.js, cannon-es in opentype.js se naložijo z jsDelivr)
- `wheel.js`, `wheel-shaders.js`: karusel na strani dela (three.js z jsDelivr)
- `draw.js`: risanje na strani dnevnik
- `assets/work/`: slike del (`<ime>.webp`, video `video-<ime>.mp4`)
- `assets/people/`: izrezi ekipe
- `.nojekyll`, `404.html`, `robots.txt`, `sitemap.xml`

## Pred objavo
- Slike v `assets/work/` so začasne in niso vaše. Zamenjaj jih s svojimi.
- Na prvi strani manjkajo `assets/photo-about.jpg` in `assets/work-1.jpg` do `work-5.jpg`.
- Preveri licenco fonta Mundial in Inter Tight za spletno uporabo.
