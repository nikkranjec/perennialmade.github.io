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
- `projekti/`: projekti (vsaka mapa je en projekt, glej spodaj)
- `works.js`: prebere `projekti/projekti.json` in zažene karusel
- `build-projekti.mjs`, `.github/workflows/projekti.yml`: samodejno ustvarita `projekti/projekti.json`
- `assets/`: vse ostalo (pisave, slike, izrezi ekipe `person-*.webp`, kupi črk `pile-*.bin`)
- `.nojekyll`, `404.html`, `robots.txt`, `sitemap.xml`

Video na prvi strani je `assets/hero.mp4` (po možnosti pod 10 MB, H.264).

Vse slike so webp (razen `favicon.png` in `thumbnail.png`, ki ju nekatere aplikacije ne berejo v webp).

## Pred objavo
- Preveri licenco fonta Mundial in Inter Tight za spletno uporabo.

## Projekti (stran projekti)
Vsaka mapa v `projekti/` je en projekt, vrstni red je po imenu mape (`01-...`, `02-...`). Največ 32.

- `naslovnica.webp` (ali .jpg/.png): sličica v karuselu (obvezno)
- `projekt.txt`: 1. vrstica = naslov, naslednje vrstice = opis
  - neobvezno še vrstica `youtube: ID_ALI_POVEZAVA` in `razmerje: 2.35` (ali `16/9`)
- videi (`.mp4`, `.webm`): ob kliku se odpre prvi, če jih je več, je galerija
- ostale slike v mapi: pokažejo se v galeriji za videi (ali sama, če videov ni)

Ko dodaš ali spremeniš mapo in narediš push, GitHub Action (`.github/workflows/projekti.yml`) sam posodobi `projekti/projekti.json`. Lokalno: `node build-projekti.mjs`.
