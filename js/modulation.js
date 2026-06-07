/**
 * Modulatie: bemonster een p5.waves-golf deterministisch over één periode en
 * vertaal die naar een Strudel value-pattern, zodat een parameter (filter,
 * reverb, …) automatisch varieert binnen een fase.
 *
 * Dezelfde golf+bemonstering kan later een visual op de UI voeden — dat is de
 * hele opzet: één bron, audio én beeld.
 *
 * `Waves` is een browser-global (p5.waves). In Node ontbreekt die; dan geven
 * de functies null terug en valt de composer terug op de statische waarde.
 */

const BASE_PERIOD = 62.8319; // 2π / 0.1 — basisperiode van p5.waves
const STEPS = 16; // resolutie van het value-pattern

export function isWavesAvailable() {
    return typeof Waves !== 'undefined' && Waves && typeof Waves.createSampler === 'function';
}

/** Lijst beschikbare wave-namen (voor de UI-dropdown), of null. */
export function waveNames() {
    if (!isWavesAvailable() || typeof Waves.list !== 'function') return null;
    return Waves.list().map((w) => w.name);
}

/** Bemonster de golf op STEPS punten over één periode → array waarden in [min,max]. */
export function sampleWaveValues(mod) {
    if (!isWavesAvailable()) return null;
    const min = Number(mod.min);
    const max = Number(mod.max);
    if (!Number.isFinite(min) || !Number.isFinite(max)) return null;

    const sampler = Waves.createSampler({ wave: mod.wave || 'classic sine', range: [min, max] });
    const period = sampler.period || BASE_PERIOD;
    const decimals = Math.abs(max) <= 4 ? 2 : 0; // gain-achtig → 2 decimalen, filters → heel getal

    const vals = [];
    for (let i = 0; i < STEPS; i++) {
        const y = (i / STEPS) * period;
        const raw = sampler.sample(y);
        const factor = 10 ** decimals;
        vals.push(Math.round(raw * factor) / factor);
    }
    return vals;
}

/**
 * Bouw het Strudel value-pattern: `"v0 v1 … vN".slow(cycles)`.
 * cycles = aantal cycli voor één volledige golf-passage (traag = lange sweep).
 * Geeft null als p5.waves ontbreekt of de mod onvolledig is.
 */
export function modValuePattern(mod) {
    if (!mod || !mod.enabled) return null;
    const vals = sampleWaveValues(mod);
    if (!vals || !vals.length) return null;
    const cycles = Math.max(1, Math.min(64, Math.round(Number(mod.cycles) || 16)));
    return `"${vals.join(' ')}".slow(${cycles})`;
}

/**
 * Live: waar zit de golf nú? Geeft de huidige waarde genormaliseerd naar [0,1]
 * binnen het sweep-bereik [min,max] (0 = min, 1 = max), op basis van de
 * transport-cyclus — dezelfde klok en uitlijning (op cyclus 0, één passage per
 * `cycles` cycli) als het value-pattern. `scale === 'log'` geeft een perceptueel
 * relevante log-schaal (filters); anders lineair. Null als p5.waves ontbreekt of
 * de mod uit/onvolledig is. Voor de UI-meter.
 */
export function liveModNorm(mod, cycle, scale) {
    if (!isWavesAvailable() || !mod || !mod.enabled) return null;
    const min = Number(mod.min);
    const max = Number(mod.max);
    if (!Number.isFinite(min) || !Number.isFinite(max) || max === min) return null;
    const sampler = Waves.createSampler({ wave: mod.wave || 'classic sine', range: [min, max] });
    const period = sampler.period || BASE_PERIOD;
    const cycles = Math.max(1, Math.min(64, Math.round(Number(mod.cycles) || 16)));
    const frac = (((Number(cycle) % cycles) + cycles) % cycles) / cycles; // 0..1 over één passage
    const raw = sampler.sample(frac * period);
    let t;
    if (scale === 'log' && min > 0 && max > 0 && raw > 0) {
        t = Math.log(raw / min) / Math.log(max / min); // log: 0 = min, 1 = max
    } else {
        t = (raw - min) / (max - min);
    }
    return Math.max(0, Math.min(1, t)); // 0..1
}
