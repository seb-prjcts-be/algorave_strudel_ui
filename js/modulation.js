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
