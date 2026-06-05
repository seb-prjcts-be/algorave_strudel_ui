# Left Strudel — strategie

## Doel

Linker-half dashboard dat Strudel op de achtergrond aanstuurt. Zonder code een **gelaagde, organisch-jazzy opbouw** spelen (van textuur/drone → akkoorden → percussie → bas → swing-groove → melodie) via formuliervelden per regel. Klank-kwaliteit en tuning wegen even zwaar als features.

## Architectuur

- **UI**: `left-strudel-panel` — herbruikbaar in pagina-split of Bootstrap-offcanvas.
- **Audio**: `@strudel/web` via `strudel-runtime.js` (geen iframe strudel.cc).
- **Code**: `composer.js` vertaalt UI-state → `setcpm` + `stack(...).gain(master)`; uitgeschakelde regels als `//` commentaar.
- **Master**: globale volume-regelaar (naast tempo) als plafond op stack én one-shots — bescherming tegen plotse uitschieters.
- **Varianten**: 8 knoppen (0–7) per zin via `variations.js` — `.n(i)` voor samples, param-shift voor synth/noten, patroon-banken voor `beat`/`bass`/`lead`.
- **Auto-opbouw**: 6 fases (Air→Drone→Motion→Bass→Beat→Melody); elke regel heeft `enterAt` (0–5); `compose()` maskeert per regel zodat lagen instromen en blijven (`mask`). Duur in **minuten** (`arc.minutes`, 1–20), cycli afgeleid van tempo. UI Engelstalig. Jump-knoppen = live controle (spring naar fase). Preset-scènes verwijderd — gebruiker bouwt zelf op met + Line.
- **One-shot**: `oneshot.js` — korte burst met `.mask("<1 0 0 0>")` bovenop lopende stack.

## Stand (zie README.md + knowledge_base.md voor details)

- **Gedaan**: split-layout, regels, transport+master(-limiter), 6-fase auto-opbouw (minuten, gewogen) + Jump, p5.waves wave-modulatie, variant-cycling + live highlight, anchor, genormaliseerde 0–1 regelaars, catalogus-als-JSON (24 instrumenten), vaste presets (`gentle_jazz`/`vibes_marimba`/`upright_trio`/`haze`), inklappen van uitgeschakelde regels, jazz-tuning (dorian/swing/akkoorden).
- **Volgende**: `#stage` visuals / FFT (`.analyze`/`getAnalyzerData`, `getTime()`=cycli voor sync); bewegende mod-waarden in de UI; meer sounds/presets.
- **Embed**: `offcanvas-demo.html` + class `.left-strudel-panel` op animatiepagina's.

## Conventies (kort — zie README §Conventies & valkuilen)

- **Cache-bust `?v=N`** op álle module-imports + JSON + entry; bij wijziging overal samen ophogen (nu v14).
- Catalogus laadt **async** → niets mag instrumenten raken op laadtijd; `PRESETS` zijn platte data.
- Samples: `bd/sd/hh/cp` + textures betrouwbaar; `rim`/`oh` ontbreken → organische perc = synth.
- Gehoor maker: mono rechts, ~150 Hz–1,5 kHz, boventonen, geen pure sub.
- Bootstrap 5.3 collapse per regel; minimal B/W CSS; debounced `evaluate` (300 ms) tijdens spelen; autosave naar `localStorage:last`.
