# Left Strudel — knowledge base

## Waarom `@strudel/web` i.p.v. iframe

strudel.cc in een iframe biedt geen stabiele API om code vanuit het dashboard te updaten. `@strudel/web` gebruikt dezelfde `evaluate()`-semantiek als de REPL (dubbele quotes = mini-notation). Patroon gekopieerd uit `p5_cursus_site/strudel-mini.js`.

## Zin-opbouwer

Elke regel = instrument (basis-chain) + tot 2 effecten + volumeregelaar. Checkbox = regel in `stack` of als `//` commentaar (algorave-stack-patroon).

## Varianten (0–7)

Acht knoppen per zin — zoals sample-nummers na een klank in Strudel (`.n(0)` … `.n(7)`). Samples: `.n(i)`; synth: filter/density-shift; noten: transpose of andere toon. `beat`/`bass`/`lead` hebben elk een **patroon-bank** (8 patronen) i.p.v. `.n(i)` — zie `BEAT_PATTERNS`/`BASS_PATTERNS`/`LEAD_PATTERNS` in `variations.js`. Klik = preview + variant wordt actief in de gegenereerde code.

## Genormaliseerde UI-waarden (0–1)

Elke effect-regelaar staat in de UI op **0–1**; de échte waarde (Hz enz.) blijft in de state en in de gegenereerde Strudel-code. Mapping in `catalog/effects.js`: `normToValue`/`valueToNorm` (filters `scale:'log'` → musikaal; rest lineair), `roundEffectValue` (Hz → heel getal), `formatEffectDisplay` (hint-tekst naast de schuif, bv. "1500 Hz"). Geldt voor de effect-waarde én de mod min/max. Volume/master waren al 0–1; tempo (cpm) en opbouw-duur (min) blijven echte eenheden (betekenisvol). `compose()`/scenes/storage zijn onveranderd — alleen de UI-laag normaliseert.

## ⚠ Cache-bust: `?v=N` op alle module-imports

ESM-modules cachen hardnekkig (htdocs/Apache én browser). **Elke** import en de entry dragen een versie-query: `js/main.js?v=N`, `import … from './x.js?v=N'`, en `data/instruments.json?v=N`. **Na een module-wijziging: hoog N overal tegelijk op** (find/replace `?v=N`). Cruciaal: élke import van dezelfde module moet hetzelfde nummer hebben, anders laadt de browser twee instances (gedeelde state zoals `INSTRUMENTS` breekt). Huidige versie: **14**. Symptoom van een stale module: app laadt niet (0 regels, status blijft op HTML-default "Ready"), zonder console-fout — diagnose via dynamische import met try/catch. (Preview-server draait `http-server -c-1`, no-cache, ter ondersteuning.)

## Catalogus als data (JSON)

Instrumenten staan in **`data/instruments.json`**, geladen vóór de UI via `loadInstruments()` (await in `main.js`-`boot()`). Elk instrument: `{ id, label, tags, base, defaultVolume, variant? }`. Het **variant-recept** stuurt knoppen 0–7 en wordt geïnterpreteerd door `catalog/variations.js`:
- `sampleIndex` → `.n(i)` · `transpose` (step) → `.transpose(i*step)` · `param` (fn, from, step, decimals) → `.fn(from+i*step)` · `notes` (items, template met `$`) · `patterns` (items[i] + optionele suffix).
- Geen recept → standaard (`.n(i)` voor sample-tag, `.transpose(i*2)` voor note-tag).

Nieuwe instrumenten = puur JSON, geen code. `instruments.js` houdt een mutabele array + `getInstrument`/`getInstruments`/`instrumentOptionsHtml`.

⚠ **Valkuil:** niets mag `getInstrument`/`createLine` op módule-laadtijd aanroepen (instrumenten zijn dan nog niet geladen — async fetch). Alles moet draaien ná `loadInstruments()` (in `main.js`-`boot()`).

## Vaste presets (i.p.v. save/load)

Ingebouwde presets in `composer.js` `PRESETS` (platte regel-specs); `applyPreset(id)` mapt ze door `createLine` bij toepassen (niet op laadtijd). UI: vaste preset-knoppen (`[data-preset]`, gebonden in `dashboard.bindGlobal`) → setState + `ensurePlaying` (laden én starten). De vrije Save/Load-balk is verwijderd. `createDefaultState` = `applyPreset('gentle_jazz')`. Autosave naar `localStorage:last` blijft (continuïteit); de preset-knop reset altijd naar de baseline. Presets: **gentle_jazz** (baseline), **vibes_marimba** (mallet/vibrafoon-jazz), **upright_trio** (walking upright + swung groove + keys/melodie), **haze** (ambient, beatloos: pads/drone/sub/bell/chirps).

## Default-compositie: jazz in laagjes

`createDefaultState` (dashboard.js) is een gecureerde, gelaagde opbouw (geen presets meer, dit is het startpunt): **Air** warme kamertoon (warm_drone) → **Drone** jazz-akkoorden (`keys`, Cm7-progressie, driehoek, lang) → **Motion** takjes (`twigs`, organische perc met variant-cycling) + zachte vogels → **Bass** warme dorische bas → **Beat** losse swung jazz-groove (`groove`, `swingBy(1/3,4)`) → **Melody** dorisch melodietje. cpm 52. Bas/melodie staan in **dorian** (jazzy); bas is driehoek (warm, niet ruw). Tuning/kwaliteit van de klank weegt even zwaar als features.

**Uitgebreid sound-vocabularium (24 instrumenten).** Melodisch/harmonisch: `vibes`, `bell`, `mallet` (Marimba), `keys`, `warmpad`, `chirps` (abstracte synth-pings i.p.v. uncanny vogels). Bas: `bass` (warme driehoek), `upright` (walking, zaagtand-pluk), `sub` (lage sine). Percussie: `groove` (swung kit), `beat`, `twigs` & `hands` — **synth-gebaseerd** (resp. korte driehoek-klikjes en sine-membranen), géén samples.

⚠ **Sample-betrouwbaarheid.** In de geladen `github:tidalcycles/dirt-samples` zijn **`rim` en `oh` NIET aanwezig** (geven "sound not found", spelen stil). Betrouwbaar gebleken: `bd sd hh cp` + textuur-samples `wind birds pad`. Daarom: drumkit op `bd/sd/hh/cp`, en organische percussie als **synth** (stembaar, in het hoorvenster, nul sample-risico). Test nieuwe sample-namen vóór gebruik (evalueren + console op "not found").

**Opslag-versie** (`storage.js` `VERSION`) opgehoogd → oudere `localStorage`-states worden bij laden weggegooid (`loadStateByName` geeft null bij mismatch), zodat de nieuwe default verschijnt i.p.v. een stale restje.

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

## Jump = live controle (preset-scènes verwijderd)

De preset-knoppen (Build/Pulse/Lo-Fi/Drive, `SCENES`/`applyScene`) zijn verwijderd; de gebruiker bouwt regels zelf op (+ Line). **De Jump-knoppen zijn bewust behouden/teruggezet** — ze zijn de live menselijke controle over de opbouw (zonder code).

**Jump-knoppen** (één per fase, `#phase-btns`, gerenderd uit `PHASE_LABELS`): zet `state.previewPhase`. In `compose()` overschrijft een gezette `previewPhase` de tijd-mask → statische mix van alle lagen t/m die fase (geen `.mask`). Nogmaals op dezelfde fase = `previewPhase = null` = terug naar de getimede opbouw. Transient (niet bewaard). Klik start ook auto via `ensurePlaying`.

## Golf-modulatie (p5.waves → parameter)

Een effect-slot kan een parameter laten **variëren via een p5.waves-golf** i.p.v. een vaste waarde. `js/modulation.js` bemonstert `Waves.createSampler({wave, range:[min,max]})` deterministisch op 16 punten over één periode (`sampler.period`, fallback 62.8319) → `modValuePattern()` bouwt `"v0 v1 … v15".slow(cycles)`. `compose()`/`buildLineChain` gebruikt dat patroon i.p.v. de statische waarde.

- **Deterministisch** (geen `shift`): zelfde golf = zelfde curve → audio en (later) visual zijn identieke data.
- **`Waves` is een browser-global** (p5 + p5.waves geladen in `index.html`, gebruikt als pure sampler — geen canvas). In Node ontbreekt het → val terug op de statische waarde (composer blijft Node-veilig).
- Slot-schema: `{ effectId, value, mod?: { enabled, wave, min, max, cycles } }`. Bewaard in `storage.js`. Mod wordt gewist als het effect wisselt (bereik hoort bij het oude effect).
- UI: `~`-toggle per modulatie-baar effect (niet voor none/slow/fast) → paneel met wave-keuze (34 waves), min, max, cycles. Stepped waves (`steps`, `stepped sine`) geven stapsgewijze "kleine fases"; gentle waves geven gladde sweeps.
- p5.waves **v3.3.0** (`createGrid` verwijderd; `sampler.period` toegevoegd).

**Volgende stappen (nog niet gebouwd):** variant-automatisering (golf → `n("<…>")`), live playhead/visuele weerslag op de UI (vereist cyclus-positie uit Strudel's klok), en uiteindelijk dezelfde golven groot op `#stage`.

## Variant-cycling + live highlight

Een regel kan z'n varianten traag laten wisselen over de maten: `line.variantCycle = { enabled, count, cycles }` — `count` opeenvolgende varianten vanaf `variantIndex`, elk `cycles` cycli vastgehouden. `buildLineChain` bouwt dan `arrange([N, base_v0], [N, base_v1], …)` (effecten/anker komen ná de arrange, gelden voor het geheel). `arrange` (niet `.slow`) houdt het tempo intact. Reproduceerbaar — werkt voor élk instrument (ook synth/sample, bv. crackle-density). UI: select "Cycle" (uit/2/3/4/6/8) + "hold" (cycli) onder de variant-knoppen.

**Live highlight (klok = cycli!).** Cruciale vondst: **`getTime()` geeft de cyclus-positie terug, niet seconden** (gemeten: units/sec ≈ cpm/60). Dat is exact de scheduler-klok, dus een `requestAnimationFrame`-lus (`main.js`, alleen tijdens spelen) berekent `activeVariantAt(line, getTime())` — identieke formule als `arrange` (`floor((cycle mod count·N)/N)`) → de oplichtende variant-knop (`.is-live`, ring) loopt **exact in de maat** met de audio. Geen klok-offset, geen losse timer. Bron-klok van Strudel zit niet als cyclist-object in de globals; `getTime()` is de toegang.

## Hoorbaar anker (octaaf-dubbel)

Per toon-regel (`anchor: { enabled, octaves }`, 1–2 octaven). Idee: speel vol-bereik voor het publiek, maar geef de maker (die alleen ~150 Hz–1,5 kHz mono hoort) een houvast. `buildLineChain` wikkelt een toon-regel dan in `stack(origineel, origineel.transpose(octaves*12).gain(0.4))` — het origineel blijft vol-bereik, de zachte kopie trekt de toon het hoorvenster in. Alleen voor `note`-tag instrumenten (transpose op samples slaat nergens op). UI: select "Anchor (octaaf-dubbel)" uit/+1/+2 in de regel-grid. Bewaard in `storage.js`. Vult de FFT-visual-piste aan (beeld toont wat de oren missen).

## Master-volume

Eén regelaar in het transport (`#master-slider`, 0–1, default 0.6), naast tempo. `compose()` sluit de hele `stack(...)` af met `.gain(master)`; `masterGainFragment()` wordt óók op alle one-shots/previews toegepast. `state.master` blijft behouden bij scène-wissel en wordt opgeslagen.

**Echte master-limiter (`strudel-runtime.js`).** `.gain()` vermenigvuldigt per laag → de SOM kan alsnog boven het plafond stapelen (bv. extra lagen in Motion = luider). Superdough mixt alles in een verborgen master-gain → destination. We onderscheppen daarom éénmalig (vóór het eerste geluid) elke `connect(...)` naar `ctx.destination` en leiden die om via een `DynamicsCompressorNode` (bus-leveler: threshold −16, ratio 6). Zo loopt àlle audio door één limiter → luidere fases worden teruggetrokken, de master is een betrouwbaar gedeeld plafond. Geverifieerd via `comp.reduction` (in-path; Motion krijgt meer reductie dan Air). Debug-handle: `globalThis.__leftStrudelLimiter`.

## Ruis & textuur (geen machinegeweer)

`pink`/`white` zijn **trage washes**: base `s("pink").slow(2).attack(1).release(1)` (één zwellende klank, geen `*16`-retrigger-geratel). Pink-variant = lpf-sweep van diep/warm (300) naar helder. `crackle` = `s("crackle")` met `density`-variant laag (0.03) → spaarzame kampvuur-pops. `sine_drone` heeft lange swells (`attack 1.5 / release 2.5`) — menselijk, geen grid.

**Sparse-effect** (`degradeBy`): laat willekeurig events weg → "sometimes", organische onregelmatigheid. Voor elke regel beschikbaar.

## Samples

`github:tidalcycles/dirt-samples` preload voor `wind`, `birds`, `pad`. Bij falende load blijven synth-only presets (`pink`, `crackle`, `sine`) bruikbaar.

## One-shot

Burst: `stack(main, burstLine)` met `.mask("<1 0 0 0 0 0 0 0>")`; na interval (afgeleid van cpm) terug naar `main` zonder `hush()`.

## Offcanvas

Zelfde `#left-strudel-panel` markup; zie `offcanvas-demo.html`. JS-modules ongewijzigd — alleen wrapper wijzigt.

## Inklappen van niet-gebruikte regels

Een regel uitschakelen (Aan-checkbox uit) **klapt 'm in** (Bootstrap `Collapse.hide()`), inschakelen klapt 'm uit. `openLineIds` bevat bij (her)laden alléén ingeschakelde regels, dus uitgeschakelde regels starten ingeklapt. Header + samenvatting blijven zichtbaar.

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
