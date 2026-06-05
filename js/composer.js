/**
 * UI-state → Strudel code (setcpm + stack).
 */
import { getInstrument } from './catalog/instruments.js?v=14';
import { getEffect } from './catalog/effects.js?v=14';
import { buildInstrumentBase } from './catalog/variations.js?v=14';
import { modValuePattern } from './modulation.js?v=14';

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
        variantCycle: normalizeVariantCycle(overrides.variantCycle),
        enterAt: clampPhase(overrides.enterAt ?? 0),
        anchor: normalizeAnchor(overrides.anchor),
        effects: overrides.effects || defaultEffectsFor(instrument)
    };
}

/**
 * Hoorbaar anker: zachte octaaf-verschoven kopie die de klank het hoorvenster
 * in trekt (voor wie alleen ~150 Hz–1,5 kHz hoort), terwijl het origineel
 * vol-bereik blijft spelen voor het publiek. octaves 1 of 2 omhoog.
 */
export function normalizeAnchor(a) {
    if (!a || typeof a !== 'object') return { enabled: false, octaves: 1 };
    const oct = Math.max(1, Math.min(2, Math.round(Number(a.octaves) || 1)));
    return { enabled: a.enabled === true, octaves: oct };
}

/** Vaste relatieve sterkte van het anker t.o.v. het origineel. */
const ANCHOR_GAIN = 0.4;

/**
 * Variant-cycling: laat een regel z'n varianten traag wisselen over de maten,
 * reproduceerbaar via `arrange([N, …])`. `count` opeenvolgende varianten vanaf
 * `variantIndex`, elk `cycles` cycli vastgehouden. Lus-periode = count·cycles.
 */
export function normalizeVariantCycle(vc) {
    if (!vc || typeof vc !== 'object') return { enabled: false, count: 3, cycles: 4 };
    return {
        enabled: vc.enabled === true,
        count: Math.max(2, Math.min(8, Math.round(Number(vc.count) || 3))),
        cycles: Math.max(1, Math.min(16, Math.round(Number(vc.cycles) || 4)))
    };
}

/** Lijst variant-indices die een regel doorloopt, of null als cycling uit staat. */
export function variantCycleList(line) {
    const vc = line.variantCycle;
    if (!vc || !vc.enabled) return null;
    const start = Math.max(0, Math.min(7, Math.round(Number(line.variantIndex) || 0)));
    const count = Math.max(2, Math.min(8, vc.count || 3));
    return Array.from({ length: count }, (_, k) => (start + k) % 8);
}

/** Welke variant klinkt nu, gegeven de cyclus-positie (`getTime()`). */
export function activeVariantAt(line, cycle) {
    const list = variantCycleList(line);
    if (!list) return line.variantIndex ?? 0;
    const n = Math.max(1, line.variantCycle.cycles || 4);
    const period = list.length * n;
    const pos = Math.floor(((((cycle % period) + period) % period)) / n);
    return list[pos];
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
    // Variant-cycling alleen in de volle compositie, niet bij een one-shot preview
    // (die toont juist één variant via variantOverride).
    const cycleList = variantOverride == null ? variantCycleList(line) : null;
    let chain;
    if (cycleList) {
        const n = Math.max(1, line.variantCycle.cycles || 4);
        const sections = cycleList
            .map((i) => `[${n}, ${buildInstrumentBase(instrument, i)}]`)
            .join(', ');
        chain = `arrange(${sections})`;
    } else {
        const variant = variantOverride ?? line.variantIndex ?? 0;
        chain = buildInstrumentBase(instrument, variant);
    }

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
        // Golf-gestuurde waarde indien aanwezig, anders de statische waarde.
        const pattern = modValuePattern(slot.mod);
        const value = pattern || formatValue(fx, slot.value);
        const fragment = fx.apply(value);
        if (fragment) chain += fragment;
    }

    // Hoorbaar anker: alleen voor toon-content (transpose op samples slaat nergens
    // op). Origineel blijft vol-bereik; de kopie schuift een octaaf hoorbaar omhoog.
    const isTonal = (instrument.tags || []).includes('note');
    if (isTonal && line.anchor && line.anchor.enabled) {
        const semis = (line.anchor.octaves || 1) * 12;
        chain = `stack(${chain}, ${chain}.transpose(${semis}).gain(${ANCHOR_GAIN}))`;
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

/**
 * Master-fragment voor de top-level pattern: `.gain(master)` schaalt de invoer
 * naar de master-limiter (zie `strudel-runtime.js`). De limiter — niet deze
 * gain — is het echte plafond op de som van alle lagen.
 */
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
 * Vaste, ingebouwde presets — platte regel-specs (géén createLine op laadtijd,
 * dat zou instrumenten raken die nog niet geladen zijn). `applyPreset` mapt ze
 * pas door createLine bij toepassen.
 */
export const PRESETS = {
    gentle_jazz: {
        label: 'Gentle Jazz',
        cpm: 52,
        master: DEFAULT_MASTER,
        arc: { enabled: true, minutes: 12 },
        lines: [
            { instrumentId: 'warm_drone', volume: 0.28, variantIndex: 0, enterAt: 0, effects: [{ effectId: 'lpf', value: 1400 }, { effectId: 'room', value: 0.6 }] },
            { instrumentId: 'keys', volume: 0.22, variantIndex: 0, enterAt: 1, effects: [{ effectId: 'lpf', value: 1600 }, { effectId: 'room', value: 0.55 }] },
            { instrumentId: 'twigs', volume: 0.26, variantIndex: 1, enterAt: 2, variantCycle: { enabled: true, count: 3, cycles: 4 }, effects: [{ effectId: 'lpf', value: 2500 }, { effectId: 'room', value: 0.4 }] },
            { instrumentId: 'chirps', volume: 0.18, enterAt: 2, effects: [{ effectId: 'delay', value: 0.35 }, { effectId: 'room', value: 0.55 }] },
            { instrumentId: 'bass', volume: 0.3, variantIndex: 1, enterAt: 3, effects: [{ effectId: 'lpf', value: 500 }, { effectId: 'room', value: 0.2 }] },
            { instrumentId: 'groove', volume: 0.38, variantIndex: 2, enterAt: 4, effects: [{ effectId: 'lpf', value: 3000 }, { effectId: 'room', value: 0.4 }] },
            { instrumentId: 'lead', volume: 0.32, variantIndex: 0, enterAt: 5, effects: [{ effectId: 'delay', value: 0.4 }, { effectId: 'room', value: 0.5 }] }
        ]
    },

    vibes_marimba: {
        label: 'Vibes & Marimba',
        cpm: 54,
        master: DEFAULT_MASTER,
        arc: { enabled: true, minutes: 12 },
        lines: [
            { instrumentId: 'warm_drone', volume: 0.24, variantIndex: 0, enterAt: 0, effects: [{ effectId: 'lpf', value: 1300 }, { effectId: 'room', value: 0.6 }] },
            { instrumentId: 'mallet', volume: 0.3, variantIndex: 0, enterAt: 1, variantCycle: { enabled: true, count: 3, cycles: 4 }, effects: [{ effectId: 'delay', value: 0.2 }, { effectId: 'room', value: 0.45 }] },
            { instrumentId: 'warmpad', volume: 0.18, variantIndex: 0, enterAt: 2, effects: [{ effectId: 'lpf', value: 1000 }, { effectId: 'room', value: 0.6 }] },
            { instrumentId: 'vibes', volume: 0.3, variantIndex: 0, enterAt: 3, effects: [{ effectId: 'delay', value: 0.3 }, { effectId: 'room', value: 0.55 }] },
            { instrumentId: 'upright', volume: 0.3, variantIndex: 1, enterAt: 4, effects: [{ effectId: 'lpf', value: 500 }, { effectId: 'room', value: 0.2 }] },
            { instrumentId: 'groove', volume: 0.3, variantIndex: 1, enterAt: 5, effects: [{ effectId: 'lpf', value: 3000 }, { effectId: 'room', value: 0.4 }] }
        ]
    },

    upright_trio: {
        label: 'Upright Trio',
        cpm: 58,
        master: DEFAULT_MASTER,
        arc: { enabled: true, minutes: 10 },
        lines: [
            { instrumentId: 'warm_drone', volume: 0.2, variantIndex: 0, enterAt: 0, effects: [{ effectId: 'lpf', value: 1300 }, { effectId: 'room', value: 0.55 }] },
            { instrumentId: 'keys', volume: 0.22, variantIndex: 0, enterAt: 1, effects: [{ effectId: 'lpf', value: 1600 }, { effectId: 'room', value: 0.5 }] },
            { instrumentId: 'upright', volume: 0.32, variantIndex: 3, enterAt: 2, effects: [{ effectId: 'lpf', value: 550 }, { effectId: 'room', value: 0.2 }] },
            { instrumentId: 'groove', volume: 0.34, variantIndex: 3, enterAt: 3, effects: [{ effectId: 'lpf', value: 3500 }, { effectId: 'room', value: 0.4 }] },
            { instrumentId: 'lead', volume: 0.3, variantIndex: 2, enterAt: 4, effects: [{ effectId: 'delay', value: 0.35 }, { effectId: 'room', value: 0.5 }] },
            { instrumentId: 'vibes', volume: 0.26, variantIndex: 2, enterAt: 5, effects: [{ effectId: 'delay', value: 0.3 }, { effectId: 'room', value: 0.55 }] }
        ]
    },

    haze: {
        label: 'Haze',
        cpm: 46,
        master: DEFAULT_MASTER,
        arc: { enabled: true, minutes: 14 },
        // Ambient, beatloos — pads, drone, sub, abstracte sparkles.
        lines: [
            { instrumentId: 'warm_drone', volume: 0.26, variantIndex: 0, enterAt: 0, effects: [{ effectId: 'lpf', value: 1200 }, { effectId: 'room', value: 0.65 }] },
            { instrumentId: 'warmpad', volume: 0.2, variantIndex: 0, enterAt: 1, effects: [{ effectId: 'lpf', value: 900 }, { effectId: 'room', value: 0.6 }] },
            { instrumentId: 'pink', volume: 0.12, variantIndex: 0, enterAt: 1, effects: [{ effectId: 'lpf', value: 500 }, { effectId: 'room', value: 0.5 }] },
            { instrumentId: 'sub', volume: 0.26, variantIndex: 0, enterAt: 2, effects: [{ effectId: 'room', value: 0.35 }, { effectId: 'none', value: 0 }] },
            { instrumentId: 'bell', volume: 0.2, variantIndex: 0, enterAt: 3, effects: [{ effectId: 'delay', value: 0.5 }, { effectId: 'room', value: 0.65 }] },
            { instrumentId: 'chirps', volume: 0.16, variantIndex: 0, enterAt: 4, effects: [{ effectId: 'delay', value: 0.4 }, { effectId: 'room', value: 0.6 }] },
            { instrumentId: 'twigs', volume: 0.16, variantIndex: 0, enterAt: 5, variantCycle: { enabled: true, count: 3, cycles: 6 }, effects: [{ effectId: 'room', value: 0.55 }, { effectId: 'sparse', value: 0.5 }] }
        ]
    }
};

export function applyPreset(id) {
    const p = PRESETS[id];
    if (!p) return null;
    return {
        cpm: p.cpm,
        master: p.master ?? DEFAULT_MASTER,
        arc: { ...(p.arc || DEFAULT_ARC) },
        lines: p.lines.map((l) => createLine(l))
    };
}


