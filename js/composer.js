/**
 * UI-state → Strudel code (setcpm + stack).
 */
import { getInstrument } from './catalog/instruments.js';
import { getEffect } from './catalog/effects.js';
import { buildInstrumentBase } from './catalog/variations.js';

/** Aantal fases in de auto-opbouw — 6 voor een fijnmazige opbouw over minuten. */
export const ARC_PHASES = 6;
/** Labels per fase — puur hint, de fase is alleen timing. */
export const PHASE_LABELS = ['Air', 'Drone', 'Motion', 'Bass', 'Beat', 'Melody'];
/** Master-volume: plafond waar geen enkel onderdeel overheen kan. */
export const DEFAULT_MASTER = 0.6;

export function clampMaster(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return DEFAULT_MASTER;
    return Math.max(0, Math.min(1, n));
}

/** Standaard arc-instellingen. `minutes` = totale duur van de opbouw. */
export const DEFAULT_ARC = { enabled: true, minutes: 12 };
/** Grenzen voor de opbouw-duur (minuten). */
export const ARC_MIN_MINUTES = 1;
export const ARC_MAX_MINUTES = 20;
/**
 * Relatieve lengte per fase. Front-loaded: de eerste twee fases (intro) duren
 * veel langer — een lange, minimale kampvuur-aanloop voor alles binnenkomt.
 * Lengte moet gelijk zijn aan ARC_PHASES.
 */
export const PHASE_WEIGHTS = [3, 3, 2, 1, 1, 1];

/**
 * @typedef {Object} EffectSlot
 * @property {string} effectId
 * @property {number} value
 */

/**
 * @typedef {Object} LineState
 * @property {string} id
 * @property {boolean} enabled
 * @property {string} instrumentId
 * @property {number} volume
 * @property {number} variantIndex — sample/klank-variant 0–7
 * @property {EffectSlot[]} effects
 */

/**
 * @typedef {Object} AppState
 * @property {number} cpm
 * @property {LineState[]} lines
 */

export function createLine(overrides = {}) {
    const id = overrides.id || `line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const instrument = getInstrument(overrides.instrumentId || 'pink');
    return {
        id,
        enabled: overrides.enabled !== false,
        instrumentId: instrument.id,
        volume: overrides.volume ?? instrument.defaultVolume ?? 0.3,
        variantIndex: overrides.variantIndex ?? 0,
        enterAt: clampPhase(overrides.enterAt ?? 0),
        effects: overrides.effects || defaultEffectsFor(instrument)
    };
}

/** Standaard-effecten per instrument; bas krijgt een zichtbare Lowpass i.p.v. een verborgen filter. */
function defaultEffectsFor(instrument) {
    if (instrument.id === 'bass') {
        return [{ effectId: 'lpf', value: 700 }, { effectId: 'room', value: 0.2 }];
    }
    return [
        { effectId: 'room', value: 0.4 },
        { effectId: 'none', value: 0 }
    ];
}

export function clampPhase(p) {
    return Math.max(0, Math.min(ARC_PHASES - 1, Math.round(Number(p) || 0)));
}

function normalizeArc(arc) {
    const a = arc || {};
    const minutes = Math.max(
        ARC_MIN_MINUTES,
        Math.min(ARC_MAX_MINUTES, Number(a.minutes) || DEFAULT_ARC.minutes)
    );
    return { enabled: a.enabled !== false, minutes };
}

/**
 * Cycli per fase als array, afgeleid van tempo + totaalduur, gewogen via
 * PHASE_WEIGHTS. cpm = cycli/minuut, dus totaal cycli = cpm · minuten.
 */
export function arcPhaseCycleArray(cpm, minutes) {
    const total = (Number(cpm) || 55) * (Number(minutes) || DEFAULT_ARC.minutes);
    const sumW = PHASE_WEIGHTS.reduce((a, b) => a + b, 0);
    return PHASE_WEIGHTS.map((w) => Math.max(1, Math.round((total * w) / sumW)));
}

/**
 * Bouw een `.mask(...)` zodat een regel pas vanaf fase `enterAt` klinkt en
 * daarna blijft. Eén token per cyclus, `<...>` herhaalt per loop — dezelfde
 * vorm als de one-shot burst, dus gegarandeerd geldige mini-notation.
 * enterAt 0 → geen mask (altijd hoorbaar).
 */
export function arcMaskFragment(enterAt, cycleArr) {
    const p = clampPhase(enterAt);
    if (p <= 0) return '';
    const tokens = [];
    for (let phase = 0; phase < ARC_PHASES; phase++) {
        const on = phase >= p ? '1' : '0';
        const c = cycleArr[phase] || 1;
        tokens.push(c > 1 ? `${on}!${c}` : on);
    }
    return `.mask("<${tokens.join(' ')}>")`;
}

function formatValue(fx, raw) {
    const n = Number(raw);
    if (fx.valueType === 'slider') {
        const s = n.toFixed(2);
        return s.replace(/\.?0+$/, '') || '0';
    }
    return String(Math.round(n * 100) / 100);
}

export function buildLineChain(line, variantOverride) {
    const instrument = getInstrument(line.instrumentId);
    const variant = variantOverride ?? line.variantIndex ?? 0;
    let chain = buildInstrumentBase(instrument, variant);

    const gainVal = Number(line.volume);
    if (!Number.isNaN(gainVal)) {
        chain += `.gain(${formatValue({ valueType: 'slider' }, gainVal)})`;
    }

    const slots = [...(line.effects || [])].filter((s) => s.effectId && s.effectId !== 'none');
    slots.sort((a, b) => {
        const oa = getEffect(a.effectId).order;
        const ob = getEffect(b.effectId).order;
        return oa - ob;
    });

    for (const slot of slots) {
        const fx = getEffect(slot.effectId);
        if (fx.id === 'none' || !fx.apply) continue;
        const fragment = fx.apply(formatValue(fx, slot.value));
        if (fragment) chain += fragment;
    }

    return chain;
}

export function buildStackBody(lines, arc, cpm, previewPhase = null) {
    if (!lines.length) {
        return 'silence';
    }
    const a = normalizeArc(arc);
    const preview = previewPhase != null;
    const cycleArr = preview ? null : arcPhaseCycleArray(cpm, a.minutes);

    return lines
        .map((line) => {
            const chain = buildLineChain(line);
            const enterAt = clampPhase(line.enterAt ?? 0);

            // Sprong naar fase: statische mix t/m die fase, geen tijd-mask.
            if (preview) {
                const audible = line.enabled && enterAt <= previewPhase;
                return audible ? `  ${chain}` : `  // ${chain}`;
            }

            const masked = a.enabled ? chain + arcMaskFragment(enterAt, cycleArr) : chain;
            return line.enabled ? `  ${masked}` : `  // ${masked}`;
        })
        .join(',\n');
}

/** Master-fragment voor de top-level pattern: `.gain(master)` (leeg bij 1). */
export function masterGainFragment(state) {
    const master = clampMaster(state?.master ?? DEFAULT_MASTER);
    return `.gain(${formatValue({ valueType: 'slider' }, master)})`;
}

export function compose(state) {
    const cpm = Number(state.cpm) || 55;
    const previewPhase = state.previewPhase != null ? clampPhase(state.previewPhase) : null;

    const active = state.lines.filter((l) => {
        if (!l.enabled) return false;
        if (previewPhase != null) return clampPhase(l.enterAt ?? 0) <= previewPhase;
        return true;
    });
    if (!active.length) {
        return `setcpm(${cpm})\n\nsilence`;
    }
    const body = buildStackBody(state.lines, state.arc, cpm, previewPhase);
    return `setcpm(${cpm})\n\nstack(\n${body}\n)${masterGainFragment(state)}`;
}

export function composeLineForOneShot(line) {
    const chain = buildLineChain(line);
    return `${chain}.mask("<1 0 0 0 0 0 0 0>")`;
}

export function countActiveLines(lines) {
    return lines.filter((l) => l.enabled).length;
}

/**
 * Preset-scènes. `build` = de volledige boog (texture → motion → beat → melody).
 * pulse/lofi/drive zijn geaarde, beat-gerichte presets (minder zweverig).
 */
export const SCENES = {
    build: {
        cpm: 60,
        arc: { enabled: true, minutes: 15 },
        // Kampvuur → vol. Lange, minimale, lage intro; beat/melodie komen pas laat.
        lines: [
            // Fase 1 (Air, ~4 min) — alleen lage warme drone + spaarzaam vuur.
            createLine({ instrumentId: 'sine_drone', volume: 0.32, variantIndex: 0, enterAt: 0, effects: [{ effectId: 'room', value: 0.5 }, { effectId: 'slow', value: 4 }] }),
            createLine({ instrumentId: 'crackle', volume: 0.16, variantIndex: 0, enterAt: 0, effects: [{ effectId: 'lpf', value: 1200 }, { effectId: 'sparse', value: 0.4 }] }),
            // Fase 2 (Drone, ~4 min) — lage warme wash + trage natuurlijke wind.
            createLine({ instrumentId: 'pink', volume: 0.16, variantIndex: 0, enterAt: 1, effects: [{ effectId: 'lpf', value: 400 }, { effectId: 'room', value: 0.45 }] }),
            createLine({ instrumentId: 'wind', volume: 0.18, enterAt: 1, effects: [{ effectId: 'lpf', value: 600 }, { effectId: 'room', value: 0.5 }] }),
            // Fase 3 (Motion) — tweede lage drone (harmonische beweging) + iets meer vuur.
            createLine({ instrumentId: 'sine_drone', volume: 0.24, variantIndex: 4, enterAt: 2, effects: [{ effectId: 'room', value: 0.6 }, { effectId: 'slow', value: 4 }] }),
            createLine({ instrumentId: 'crackle', volume: 0.13, variantIndex: 2, enterAt: 2, effects: [{ effectId: 'lpf', value: 1800 }, { effectId: 'sparse', value: 0.3 }] }),
            // Fase 4 (Bass) — warme lage bas.
            createLine({ instrumentId: 'bass', volume: 0.4, variantIndex: 1, enterAt: 3, effects: [{ effectId: 'lpf', value: 600 }, { effectId: 'room', value: 0.2 }] }),
            // Fase 5 (Beat) — minimale beat, niet druk.
            createLine({ instrumentId: 'beat', volume: 0.45, variantIndex: 1, enterAt: 4, effects: [{ effectId: 'lpf', value: 5000 }, { effectId: 'room', value: 0.25 }] }),
            // Fase 6 (Melody) — climax, ingetogen.
            createLine({ instrumentId: 'lead', volume: 0.32, variantIndex: 0, enterAt: 5, effects: [{ effectId: 'delay', value: 0.4 }, { effectId: 'room', value: 0.5 }] })
        ]
    },
    pulse: {
        cpm: 66,
        arc: { enabled: true, minutes: 9 },
        lines: [
            createLine({ instrumentId: 'pink', volume: 0.12, enterAt: 0, effects: [{ effectId: 'hpf', value: 1200 }, { effectId: 'room', value: 0.2 }] }),
            createLine({ instrumentId: 'bass', volume: 0.42, variantIndex: 1, enterAt: 2, effects: [{ effectId: 'lpf', value: 700 }, { effectId: 'none', value: 0 }] }),
            createLine({ instrumentId: 'beat', volume: 0.6, variantIndex: 0, enterAt: 3, effects: [{ effectId: 'room', value: 0.15 }, { effectId: 'none', value: 0 }] }),
            createLine({ instrumentId: 'lead', volume: 0.3, variantIndex: 1, enterAt: 5, effects: [{ effectId: 'delay', value: 0.2 }, { effectId: 'room', value: 0.25 }] })
        ]
    },
    lofi: {
        cpm: 48,
        arc: { enabled: true, minutes: 10 },
        lines: [
            createLine({ instrumentId: 'crackle', volume: 0.14, enterAt: 0, effects: [{ effectId: 'hpf', value: 1500 }, { effectId: 'room', value: 0.2 }] }),
            createLine({ instrumentId: 'bass', volume: 0.4, variantIndex: 2, enterAt: 2, effects: [{ effectId: 'lpf', value: 600 }, { effectId: 'none', value: 0 }] }),
            createLine({ instrumentId: 'beat', volume: 0.5, variantIndex: 2, enterAt: 3, effects: [{ effectId: 'lpf', value: 3000 }, { effectId: 'room', value: 0.3 }] }),
            createLine({ instrumentId: 'lead', volume: 0.32, variantIndex: 0, enterAt: 5, effects: [{ effectId: 'delay', value: 0.35 }, { effectId: 'room', value: 0.4 }] })
        ]
    },
    drive: {
        cpm: 74,
        arc: { enabled: true, minutes: 9 },
        lines: [
            createLine({ instrumentId: 'pink', volume: 0.1, enterAt: 0, effects: [{ effectId: 'bpf', value: 1800 }, { effectId: 'none', value: 0 }] }),
            createLine({ instrumentId: 'bass', volume: 0.45, variantIndex: 3, enterAt: 2, effects: [{ effectId: 'lpf', value: 900 }, { effectId: 'none', value: 0 }] }),
            createLine({ instrumentId: 'beat', volume: 0.55, variantIndex: 5, enterAt: 3, effects: [{ effectId: 'room', value: 0.2 }, { effectId: 'none', value: 0 }] }),
            createLine({ instrumentId: 'lead', volume: 0.34, variantIndex: 2, enterAt: 5, effects: [{ effectId: 'delay', value: 0.25 }, { effectId: 'room', value: 0.3 }] })
        ]
    }
};

export function applyScene(sceneId) {
    const scene = SCENES[sceneId];
    if (!scene) return null;
    return {
        cpm: scene.cpm,
        arc: normalizeArc(scene.arc || DEFAULT_ARC),
        lines: scene.lines.map((l) => createLine({ ...l, id: undefined }))
    };
}
