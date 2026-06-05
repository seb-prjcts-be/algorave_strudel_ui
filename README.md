# Algorave Strudel UI (Left Strudel)

A click-to-build UI that drives [Strudel](https://strudel.cc) (`@strudel/web`) in the background — no code typing. Designed as the left-hand panel next to a visual/animation stage.

You stack **lines** (instrument + up to 2 effects + volume + variant), and an **auto build-up** unfolds them over time: each line enters "from" a phase and stays, so a piece grows from a minimal campfire intro to a full beat + melody over minutes.

## Use

Open `index.html` via any static web server (it loads `@strudel/web` and samples from CDN). For example:

```
python -m http.server 8765
```

then visit `http://localhost:8765/`.

- **Presets** — Build / Pulse / Lo-Fi / Drive load a full starting configuration and start playing.
- **Master** — global volume ceiling; no part (or one-shot preview) can exceed it.
- **Auto build-up** — total length in minutes; 6 weighted phases (Air → Drone → Motion → Bass → Beat → Melody), front-loaded so the intro lasts longest.
- **Jump** — jump straight to any phase's full layering; click again to resume the timed build.
- **Per line** — instrument, volume, "enter at" phase, 2 effects (incl. *Sparse* for human/irregular timing), 8 variants, one-shot preview.
- Presets/state autosave to `localStorage`; named presets supported.

## Structure

| File | Role |
|------|------|
| `index.html` / `offcanvas-demo.html` | Split layout / Bootstrap-offcanvas embed |
| `js/main.js` | Orchestration, transport, debounce |
| `js/strudel-runtime.js` | `@strudel/web` init + evaluate/hush |
| `js/composer.js` | UI state → Strudel code (`setcpm` + `stack(...).gain(master)`), arc masking, presets |
| `js/dashboard.js` | DOM: lines, controls, jump/phase buttons |
| `js/oneshot.js` | One-shot bursts / previews |
| `js/storage.js` | JSON persistence |
| `js/catalog/*.js` | Instruments, effects, variant pattern banks |

See `strategy.md` and `knowledge_base.md` for design notes.
