# Algorave Strudel UI (Left Strudel)

Een **klik-om-te-bouwen** UI die [Strudel](https://strudel.cc) (`@strudel/web`) op de achtergrond aanstuurt — muziek maken zonder code typen. Bedoeld als linker-paneel naast een visuele/animatie-stage.

Je stapelt **regels** (lines): elk = instrument + tot 2 effecten + volume + variant. Een **auto-opbouw** (arc) laat de regels gelaagd binnenkomen over de tijd, en je kunt **live** door de fases springen. Vier vaste presets geven een complete sfeer in één klik.

> Status: werkend, in actieve ontwikkeling. Dit bestand is het instappunt; `knowledge_base.md` heeft de gedetailleerde werking, `strategy.md` de architectuur-keuzes.

---

## Draaien

Statische site — heeft alleen een webserver nodig (`@strudel/web`, p5 en p5.waves laden via CDN).

- **Preview/dev:** `.claude/launch.json` start `npx http-server . -p 8765 -c-1` (`-c-1` = geen caching, belangrijk — zie cache-bust hieronder).
- **Lokaal:** staat in `C:\server\htdocs\left_strudel` (XAMPP/Apache htdocs) → bereikbaar via `localhost/left_strudel`.
- Open `index.html` (split-layout) of `offcanvas-demo.html` (paneel in een Bootstrap-offcanvas over een animatiepagina).

---

## Wat de UI kan

- **Presets** (vaste knoppen, laden + starten in één klik): **Gentle Jazz** (baseline), **Vibes & Marimba**, **Upright Trio**, **Haze** (ambient, beatloos).
- **Transport:** Start/Stop, **Tempo** (cpm), **Master** (= echte limiter op de som, zie onder).
- **Auto build-up (arc):** aan/uit + duur in **minuten** (1–20). 6 gewogen fases — **Air → Drone → Motion → Bass → Beat → Melody** — front-loaded (lange intro). Elke regel komt binnen "vanaf" een fase (`enterAt`) en blijft.
- **Jump:** knoppen per fase → spring live naar de volledige laag-opbouw t/m die fase; nogmaals = terug naar de getimede opbouw. (Live menselijke controle.)
- **Per regel:** instrument, volume, "Enter at" (fase), 2 effecten, 8 varianten (one-shot preview), en:
  - **Variant-cycling** — laat varianten traag wisselen over de maten (`arrange`), met een **live highlight** die exact in de maat meebeweegt.
  - **Wave-modulatie** (`~`) — een **p5.waves**-golf stuurt een effect-waarde i.p.v. een vast getal (deterministisch bemonsterd → Strudel value-pattern).
  - **Anchor** — zachte octaaf-kopie die lage tonen het hoorvenster in trekt (zie gehoor-context).
- **Genormaliseerde regelaars:** alle effect-waarden staan op **0–1** in de UI (filters log-gemapt), met de echte waarde (Hz enz.) als hint.
- **Inklappen:** uitgeschakelde regels klappen automatisch in (overzicht).
- **Opslag:** autosave naar `localStorage:last`; preset-knop reset naar de baseline.

---

## ⚠ Belangrijke conventies & valkuilen

1. **Cache-bust `?v=N` op álle module-imports.** ESM-modules + `data/instruments.json` cachen hardnekkig (browser én Apache). Elke import en de entry dragen `?v=N` (nu **v14**). **Na elke wijziging: hoog N overal tegelijk op** (`sed -i "s/?v=14'/?v=15'/g"` op de js-bestanden + `instruments.json?v=` + `main.js?v=` in de html's). Élke verwijzing naar dezelfde module moet hetzelfde nummer hebben, anders laadt de browser twee instances en breekt gedeelde state (bv. `INSTRUMENTS`). Symptoom van een stale module: app laadt niet (0 regels, status blijft "Ready"), zónder console-fout → diagnose via dynamische `import('...?v='+Date.now())` met try/catch.
2. **Niets mag `getInstrument`/`createLine` op module-laadtijd aanroepen** — de catalogus laadt async (`loadInstruments()` in `main.js`-`boot()`, vóór de UI). Daarom zijn `PRESETS` platte data; `applyPreset`/`createLine` draaien pas bij toepassen.
3. **Sample-betrouwbaarheid (dirt-samples).** Betrouwbaar: `bd sd hh cp` + textuur-samples `wind birds pad`. **`rim` en `oh` ontbreken** (spelen stil!). Daarom: drumkit op `bd/sd/hh/cp`, organische percussie (`twigs`, `hands`) **synth-gebaseerd**. Test nieuwe sample-namen vóór gebruik.
4. **Gehoor van de maker.** Seb hoort effectief **mono rechts, ~150 Hz–1,5 kHz**. Ontwerp essentiële klank daarbinnen, met **boventonen** (driehoek/zaag, geen pure sub-sines), mono-compatibel; reken niet op >2 kHz. Master-limiter staat als comfort-plafond.

---

## Architectuur

| Bestand | Rol |
|---|---|
| `index.html` / `offcanvas-demo.html` | Split-layout / offcanvas-embed; laadt bootstrap, p5, p5.waves, `js/main.js` |
| `data/instruments.json` | **Instrument-catalogus als data** (24 instrumenten) — `{id,label,tags,base,defaultVolume,variant}`, async geladen |
| `js/main.js` | Orchestratie: async `boot()`, transport, debounce, autosave, live-highlight rAF-loop, master-limiter-trigger |
| `js/strudel-runtime.js` | `@strudel/web` init + samples; **master-limiter** (onderschept `connect→destination`) |
| `js/composer.js` | UI-state → Strudel-code; arc-masking, modulatie, anchor, variant-cycling, `PRESETS`/`applyPreset`, `createLine` |
| `js/dashboard.js` | DOM: regels, controls, jump/preset-knoppen, live highlight, inklappen |
| `js/modulation.js` | p5.waves-golf → Strudel value-pattern (deterministisch) |
| `js/catalog/variations.js` | Interpreter van het variant-recept (sampleIndex/transpose/param/notes/patterns) |
| `js/catalog/effects.js` | Effecten + 0–1↔echte-waarde mapping (log/lin) |
| `js/catalog/instruments.js` | Async laden + `getInstrument`/`instrumentOptionsHtml` |
| `js/storage.js` | JSON-persistentie (localStorage), schema-`VERSION` |
| `css/dashboard.css` | Minimal B/W stijl |

**Sleutel-mechanismen:**
- **Arc-masking:** per regel `.mask("<0!N 1!N …>")`, cycli per fase = `cpm·minuten·gewicht/Σgewichten`. `getTime()` geeft **cycli** (niet seconden) → dezelfde klok als de scheduler, dus live highlights lopen exact in de maat.
- **Master-limiter:** `.gain(master)` op de stack + een `DynamicsCompressorNode` die superdough's verborgen master-bus (`fr → destination`) onderschept → echt plafond op de som.
- **Tuning:** instrumenten in **dorian**; jazz-akkoorden via `note("<[c3,eb3,g3,bb3] …]>")`; swing via `swingBy(1/3,4)`.

---

## Roadmap / volgende stappen

- **`#stage` visuals / FFT-projecten.** Aftappunt ligt klaar: Strudel `.analyze(id)` + `getAnalyzerData(id)` (FFT/scope), en de master-limiter-bus. `getTime()` = cyclus-positie voor exacte sync. Idee: FFT-beeld toont óók wat de maker niet hoort (visueel anker).
- **Bewegende mod-waarden** in de UI (schuif glijdt mee met de golf) — tegenhanger van de variant-highlight.
- **Meer vocabularium/presets** naar smaak; klank-tuning blijft gehoor-afhankelijk (Seb's oren).

Zie `knowledge_base.md` voor de details per onderdeel.
