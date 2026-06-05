# Left Strudel — knowledge base

## Waarom `@strudel/web` i.p.v. iframe

strudel.cc in een iframe biedt geen stabiele API om code vanuit het dashboard te updaten. `@strudel/web` gebruikt dezelfde `evaluate()`-semantiek als de REPL (dubbele quotes = mini-notation). Patroon gekopieerd uit `p5_cursus_site/strudel-mini.js`.

## Zin-opbouwer

Elke regel = instrument (basis-chain) + tot 2 effecten + volumeregelaar. Checkbox = regel in `stack` of als `//` commentaar (algorave-stack-patroon).

## Varianten (0–7)

Acht knoppen per zin — zoals sample-nummers na een klank in Strudel (`.n(0)` … `.n(7)`). Samples: `.n(i)`; synth: filter/density-shift; noten: transpose of andere toon. `beat`/`bass`/`lead` hebben elk een **patroon-bank** (8 patronen) i.p.v. `.n(i)` — zie `BEAT_PATTERNS`/`BASS_PATTERNS`/`LEAD_PATTERNS` in `variations.js`. Klik = preview + variant wordt actief in de gegenereerde code.

## Beat / bas / melodie

Drie instrumenten maken de boog naar "beat met melodie" af:
- `beat` (tag `sample drums`): percussie-patronen `s("bd ~ sd ~, hh*8")` etc. Variant 0–7 = kaal → druk.
- `bass` (tag `note bass`): `n(...).scale("c2:minor").s("sawtooth")`. Variant = riff.
- `lead` (tag `note melody`): `n(...).scale("c4:minor").s("triangle")`. Variant = melodie-patroon.

## Auto-opbouw (fase-masking, minuten-gebaseerd)

In plaats van de opbouw handmatig te scripten, doet Strudel het via `mask`. **6 fases** (`ARC_PHASES`), labels: Air → Drone → Motion → Bass → Beat → Melody. Elke regel heeft `enterAt` (0–5). De composer voegt per regel `.mask("<0!N 0!N 1!N …>")` toe (1 token/cyclus, `<...>` herhaalt per loop — dezelfde vorm als de one-shot burst, dus gegarandeerd geldig). `enterAt 0` → geen mask (altijd hoorbaar). De boog lust eindeloos: na fase 6 terug naar fase 1.

**Duur in minuten, niet cycli.** `state.arc = { enabled, minutes }` (1–20). Totaal cycli = cpm · minuten (cpm = cycli/minuut). Tempo wijzigen herberekent automatisch zodat de opbouw ~`minutes` blijft duren.

**Ongelijke fases (front-loaded).** `PHASE_WEIGHTS = [3,3,2,1,1,1]` → `arcPhaseCycleArray(cpm, minutes)` verdeelt de cycli gewogen. De eerste twee fases (intro) duren veel langer: bij 15 min @ cpm 60 → fase 1&2 elk ~4 min, beat pas ~12 min, melodie ~13,6 min. Bedoeld als lange, minimale kampvuur-aanloop.

Mask zit alléén in `compose()` (niet in `buildLineChain`), zodat previews/bursts schoon blijven. `line.enterAt` clamp 0–5 in `storage.js`.

## Presets (rij zonder "Scene"-label) + Jump

Vier preset-knoppen (geen label meer). Klik = `applyScene` → `setState` → **én** `callbacks.ensurePlaying()` (laadt én start; behoudt de master). Keys: `build`, `pulse`, `lofi`, `drive` in `SCENES`.
- **Build** — de volledige ~15-min boog, 9 lagen, kampvuur-intro → melodie-climax.
- **Pulse** (9 min) / **Lo-Fi** (10 min) / **Drive** (9 min) — geaard.

**Jump-knoppen** (één per fase, `#phase-btns`, gerenderd uit `PHASE_LABELS`): zet `state.previewPhase`. In `compose()` overschrijft een gezette `previewPhase` de tijd-mask → statische mix van alle lagen t/m die fase (geen `.mask`). Nogmaals op dezelfde fase = `previewPhase = null` = terug naar de getimede opbouw. `previewPhase` is transient (niet betekenisvol na herladen). Klik start ook auto via `ensurePlaying`.

## Master-volume

Eén regelaar in het transport (`#master-slider`, 0–1, default 0.6), naast tempo. `compose()` sluit de hele `stack(...)` af met `.gain(master)` → plafond waar geen enkel onderdeel overheen kan. `masterGainFragment()` wordt óók op alle one-shots/previews in `oneshot.js` toegepast, zodat losse plotse geluiden nooit luider zijn dan de master. `state.master` blijft behouden bij scène-wissel (comfort-instelling) en wordt opgeslagen.

## Ruis & textuur (geen machinegeweer)

`pink`/`white` zijn **trage washes**: base `s("pink").slow(2).attack(1).release(1)` (één zwellende klank, geen `*16`-retrigger-geratel). Pink-variant = lpf-sweep van diep/warm (300) naar helder. `crackle` = `s("crackle")` met `density`-variant laag (0.03) → spaarzame kampvuur-pops. `sine_drone` heeft lange swells (`attack 1.5 / release 2.5`) — menselijk, geen grid.

**Sparse-effect** (`degradeBy`): laat willekeurig events weg → "sometimes", organische onregelmatigheid. Voor elke regel beschikbaar.

## Samples

`github:tidalcycles/dirt-samples` preload voor `wind`, `birds`, `pad`. Bij falende load blijven synth-only presets (`pink`, `crackle`, `sine`) bruikbaar.

## One-shot

Burst: `stack(main, burstLine)` met `.mask("<1 0 0 0 0 0 0 0>")`; na interval (afgeleid van cpm) terug naar `main` zonder `hush()`.

## Offcanvas

Zelfde `#left-strudel-panel` markup; zie `offcanvas-demo.html`. JS-modules ongewijzigd — alleen wrapper wijzigt.

## Bootstrap collapse

Bootstrap 5.3 via CDN. Elke zin is een `collapse`-paneel (meerdere tegelijk open). Header toont samenvatting (`zin 1 · Wind · v2`). Open-state wordt bewaard bij re-render via `openLineIds`. Debug-code ook via Bootstrap collapse.

## Opslag (JSON)

Instellingen worden bewaard in `localStorage` als JSON:

- Auto-save naar `left_strudel:last` (als de Preset-naam leeg is)
- Named preset naar `left_strudel:preset:<naam>` (als de Preset-naam ingevuld is)
- Optioneel URL-param `?preset=<naam>` om bij start automatisch die preset te laden
- De Preset-naam wordt ook als “active preset” onthouden, zodat herladen dezelfde naam gebruikt

## Bestanden

| Bestand | Rol |
|---------|-----|
| `js/main.js` | Orchestratie, transport, debounce |
| `js/strudel-runtime.js` | init + evaluate/hush |
| `js/composer.js` | state → Strudel string |
| `js/dashboard.js` | DOM regels |
| `js/oneshot.js` | eenmalige bursts |
| `js/catalog/*.js` | presets |
