# Left Strudel — strategie

## Doel

Linker-half dashboard dat Strudel op de achtergrond aanstuurt. Gebruikers bouwen een **tapijt van open, natuurlijke klanken** via formuliervelden (zin per regel), niet via handmatig coderen.

## Architectuur

- **UI**: `left-strudel-panel` — herbruikbaar in pagina-split of Bootstrap-offcanvas.
- **Audio**: `@strudel/web` via `strudel-runtime.js` (geen iframe strudel.cc).
- **Code**: `composer.js` vertaalt UI-state → `setcpm` + `stack(...).gain(master)`; uitgeschakelde regels als `//` commentaar.
- **Master**: globale volume-regelaar (naast tempo) als plafond op stack én one-shots — bescherming tegen plotse uitschieters.
- **Varianten**: 8 knoppen (0–7) per zin via `variations.js` — `.n(i)` voor samples, param-shift voor synth/noten, patroon-banken voor `beat`/`bass`/`lead`.
- **Auto-opbouw**: 6 fases (Air→Drone→Motion→Bass→Beat→Melody); elke regel heeft `enterAt` (0–5); `compose()` maskeert per regel zodat lagen instromen en blijven (`mask`). Duur in **minuten** (`arc.minutes`, 1–20), cycli afgeleid van tempo. UI Engelstalig. Jump-knoppen = live controle (spring naar fase). Preset-scènes verwijderd — gebruiker bouwt zelf op met + Line.
- **One-shot**: `oneshot.js` — korte burst met `.mask("<1 0 0 0>")` bovenop lopende stack.

## Fasering

1. **v1**: split layout, regels, presets, debug-code, transport, master, auto-opbouw (6 gewogen fases) + jump.
2. **v1.5 (huidig)**: golf-modulatie — p5.waves stuurt parameters (filters/reverb) als value-pattern (`js/modulation.js`). p5 + p5.waves laden al (als pure sampler). Volgende: variant-automatisering, live playhead/visuele weerslag.
3. **Later**: dezelfde golven groot op `#stage`; shared AudioContext-tap (algorave-patroon) voor audio-reactieve visuals.
3. **Embed**: `offcanvas-demo.html` + class `.left-strudel-panel` op animatiepagina’s.

## Conventies

- Bootstrap 5.3 (CDN) voor collapse per zin; eigen CSS (`dashboard.css`) overschrijft naar minimal B/W.
- Catalogi in `js/catalog/` — instrumenten en effecten met `compatibleWith` metadata.
- Debounced `evaluate` (300 ms) alleen wanneer transport speelt.
- Autosave JSON presets via `js/storage.js` + `localStorage` (laatste of named preset).
