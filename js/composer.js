/**
 * UI-state → Strudel code (setcpm + stack).
 */
import { getInstrument } from './catalog/instruments.js?v=14';
import { getEffect } from './catalog/effects.js?v=14';
import { buildInstrumentBase, variantCount, VARIANT_COUNT } from './catalog/variations.js?v=15';
import { modValuePattern } from './modulation.js?v=15';

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
 * Fade-out: na de piek keren we terug langs de openingsfasen (in omgekeerde
 * volgorde), zodat het stuk eindigt op dezelfde ijle drone-bedding als waar het
 * begon — een gespiegelde uitgang. Elke waarde is de fase-INDEX waarvan de
 * aan/uit-staat wordt gekopieerd: eerst terug naar "Drone" (1), dan "Air" (0).
 * Gevolg: dichte lagen (enterAt ≥ 2) vallen meteen na de piek weg; alleen de
 * drones doven uit. (enterAt 0 = altijd hoorbaar, dus die blijft de bedding.)
 */
export const FADE_PHASES = [1, 0];
/** Volledige tijdlijn-labels (opbouw + fade) voor hosts die de fase tonen. */
export const TIMELINE_LABELS = [...PHASE_LABELS, ...FADE_PHASES.map((i) => `${PHASE_LABELS[i]} ↓`)];
/** Aantal segmenten op de volledige tijdlijn (opbouw + fade). */
export const TIMELINE_PHASES = ARC_PHASES + FADE_PHASES.length;

/** Standaard fase-set. Presets mogen een eigen set (namen + gewichten) meegeven. */
export const DEFAULT_PHASES = { labels: [...PHASE_LABELS], weights: [...PHASE_WEIGHTS] };

/**
 * Los de fase-set van een state op naar exact ARC_PHASES namen + gewichten.
 * Het AANTAL fases ligt vast (ARC_PHASES) zodat alle timing-, mask- en
 * preview-logica ongewijzigd blijft; alleen de namen en lengteverhoudingen zijn
 * per-preset. Ontbrekend of foutgevormd → terug naar de standaard.
 */
export function resolvePhases(state) {
    const p = state && typeof state.phases === 'object' && state.phases ? state.phases : {};
    const labels = Array.isArray(p.labels) && p.labels.length === ARC_PHASES
        ? p.labels.map((s) => String(s))
        : [...PHASE_LABELS];
    const weights = Array.isArray(p.weights) && p.weights.length === ARC_PHASES
        ? p.weights.map((w) => Math.max(1, Math.round(Number(w) || 1)))
        : [...PHASE_WEIGHTS];
    return { labels, weights };
}

/** Volledige tijdlijn-labels (opbouw + gespiegelde fade) voor een gegeven labelset. */
export function timelineLabelsFor(labels) {
    return [...labels, ...FADE_PHASES.map((i) => `${labels[i]} ↓`)];
}

/**
 * Snapshot van enkel de PROGRESSIE-velden — hoe het stuk over tijd evolueert:
 * de arc, de fase-set, en per regel de instap-fase + de variant-set (geordend)
 * + hold. Klank-keuzes (instrument, volume, effecten) horen er NIET bij; die
 * blijven van de gebruiker. Basis voor "van het standaardpad af"-detectie.
 */
export function progressionSnapshot(state) {
    const arc = state && state.arc ? state.arc : {};
    return {
        arc: { enabled: arc.enabled !== false, minutes: arc.minutes ?? DEFAULT_ARC.minutes },
        phases: resolvePhases(state),
        lines: ((state && state.lines) || []).map((l) => ({
            id: l.id,
            enterAt: clampPhase(l.enterAt ?? 0),
            variants: normalizeVariants(l),
            hold: clampHold(l.variantCycle?.cycles)
        }))
    };
}

/**
 * Gelijk = nog op het standaardpad. Vergelijkt arc + fase-set, en per regel de
 * progressie (instap-fase + variant-set in volgorde + hold) gematcht op id.
 * Regels die de gebruiker toevoegde (geen match in de baseline) tellen NIET als
 * afwijking — dat is een sound-keuze, geen progressie-edit.
 */
export function sameProgression(cur, base) {
    if (!cur || !base) return false;
    if (cur.arc.enabled !== base.arc.enabled || cur.arc.minutes !== base.arc.minutes) return false;
    if (cur.phases.labels.join('|') !== base.phases.labels.join('|')) return false;
    if (cur.phases.weights.join(',') !== base.phases.weights.join(',')) return false;
    const baseById = new Map(base.lines.map((l) => [l.id, l]));
    for (const lc of cur.lines) {
        const lb = baseById.get(lc.id);
        if (!lb) continue; // toegevoegde regel telt niet mee
        if (lc.enterAt !== lb.enterAt) return false;
        if (lc.hold !== lb.hold) return false;
        if (lc.variants.length !== lb.variants.length) return false;
        for (let k = 0; k < lc.variants.length; k++) {
            if (lc.variants[k] !== lb.variants[k]) return false;
        }
    }
    return true;
}

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
        variants: normalizeVariants(overrides, variantCount(instrument)),
        variantCycle: { cycles: clampHold(overrides.variantCycle?.cycles) },
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
/** Hold (cycli per variant) genormaliseerd naar 1..16. */
export function clampHold(v) {
    return Math.max(1, Math.min(16, Math.round(Number(v) || 4)));
}

/**
 * Geordende, unieke set variant-indices die een regel doorloopt — in klik-
 * volgorde. Nieuw model: `line.variants`. Valt terug op het oude model
 * (variantIndex + variantCycle{enabled,count} → opeenvolgende reeks) zodat
 * bestaande presets/opslag naadloos blijven werken. `max` = aantal geldige
 * varianten van het instrument.
 */
export function normalizeVariants(line, max = VARIANT_COUNT) {
    const lim = Math.max(1, Math.round(Number(max) || VARIANT_COUNT));
    const clampOne = (n) => Math.max(0, Math.min(lim - 1, Math.round(Number(n) || 0)));
    if (Array.isArray(line.variants) && line.variants.length) {
        const seen = new Set();
        const out = [];
        for (const v of line.variants) {
            const i = clampOne(v);
            if (!seen.has(i)) { seen.add(i); out.push(i); }
        }
        if (out.length) return out;
    }
    const start = clampOne(line.variantIndex);
    const vc = line.variantCycle;
    if (vc && vc.enabled && Number(vc.count) > 1) {
        const count = Math.min(Math.round(Number(vc.count)), lim);
        return Array.from({ length: count }, (_, k) => (start + k) % lim);
    }
    return [start];
}

/** Geordende lijst varianten die een regel doorloopt, of null als er één (of geen) is. */
export function variantCycleList(line) {
    const list = Array.isArray(line.variants) ? line.variants : [];
    return list.length > 1 ? list : null;
}

/** Eerste/vaste variant van een regel (de klank bij niet-cyclen). */
export function primaryVariant(line) {
    if (Array.isArray(line.variants) && line.variants.length) return line.variants[0];
    return line.variantIndex ?? 0;
}

/** Welke variant klinkt nu, gegeven de cyclus-positie (`getTime()`). */
export function activeVariantAt(line, cycle) {
    const list = variantCycleList(line);
    if (!list) return primaryVariant(line);
    const n = clampHold(line.variantCycle?.cycles);
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

/** Clamp naar de VOLLEDIGE tijdlijn (opbouw + fade): 0..TIMELINE_PHASES-1. */
export function clampTimeline(p) {
    return Math.max(0, Math.min(TIMELINE_PHASES - 1, Math.round(Number(p) || 0)));
}

/**
 * Bij een preview-sprong naar tijdlijn-fase `tp`: welke `enterAt`-drempel hoort
 * daarbij? Opbouwfasen (0..5) → de fase zelf. Fade-fasen (6,7) → de gespiegelde
 * openingsfase (Drone=1, Air=0), want de fade hergebruikt die laag-set. Zo
 * klinkt "jump → Air ↓" exact als de ijle uitgang.
 */
export function previewThreshold(tp) {
    const p = clampTimeline(tp);
    return p < ARC_PHASES ? p : FADE_PHASES[p - ARC_PHASES];
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
export function arcPhaseCycleArray(cpm, minutes, weights = PHASE_WEIGHTS) {
    const total = (Number(cpm) || 55) * (Number(minutes) || DEFAULT_ARC.minutes);
    const fadeWeights = FADE_PHASES.map((i) => weights[i]); // fade kopieert de gespiegelde openingsfasen
    const all = [...weights, ...fadeWeights]; // build-up + mirrored fade-out
    const sumW = all.reduce((a, b) => a + b, 0);
    return all.map((w) => Math.max(1, Math.round((total * w) / sumW)));
}

/**
 * Welke tijdlijn-fase (0..TIMELINE_PHASES-1) klinkt op cyclus `cycle`? De mask
 * `<…>` is absoluut uitgelijnd op cyclus 0 en herhaalt elke `sum(cycleArr)`
 * cycli; deze mapping volgt exact diezelfde segmenten, zodat de UI-indicator in
 * de maat met de audio loopt.
 */
export function arcPhaseAtCycle(cycle, cycleArr) {
    const total = cycleArr.reduce((a, b) => a + b, 0);
    if (!(total > 0)) return 0;
    let pos = ((Math.floor(cycle) % total) + total) % total;
    for (let i = 0; i < cycleArr.length; i++) {
        if (pos < cycleArr[i]) return i;
        pos -= cycleArr[i];
    }
    return cycleArr.length - 1;
}

/**
 * Bouw een `.mask(...)` zodat een regel pas vanaf fase `enterAt` klinkt en
 * daarna blijft. Eén token per cyclus, `<...>` herhaalt per loop — dezelfde
 * vorm als de one-shot burst, dus gegarandeerd geldige mini-notation.
 * enterAt 0 → geen mask (altijd hoorbaar).
 */
export function arcMaskFragment(enterAt, cycleArr) {
    const p = clampPhase(enterAt);
    if (p <= 0) return ''; // enterAt 0 = altijd hoorbaar (de blijvende drone-bedding)
    // ON-staat per segment: opbouw (phase ≥ enterAt) + fade (spiegel van fase 1, 0).
    const on = [];
    for (let phase = 0; phase < ARC_PHASES; phase++) on.push(phase >= p ? 1 : 0);
    for (const mirror of FADE_PHASES) on.push(mirror >= p ? 1 : 0);
    const tokens = on.map((v, i) => {
        const c = cycleArr[i] || 1;
        return c > 1 ? `${v}!${c}` : `${v}`;
    });
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
        const n = clampHold(line.variantCycle?.cycles);
        const sections = cycleList
            .map((i) => `[${n}, ${buildInstrumentBase(instrument, i)}]`)
            .join(', ');
        chain = `arrange(${sections})`;
    } else {
        const variant = variantOverride ?? primaryVariant(line);
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

export function buildStackBody(lines, arc, cpm, previewPhase = null, weights = PHASE_WEIGHTS) {
    if (!lines.length) {
        return 'silence';
    }
    const a = normalizeArc(arc);
    const preview = previewPhase != null;
    const previewThr = preview ? previewThreshold(previewPhase) : null;
    const cycleArr = preview ? null : arcPhaseCycleArray(cpm, a.minutes, weights);

    return lines
        .map((line) => {
            const chain = buildLineChain(line);
            const enterAt = clampPhase(line.enterAt ?? 0);

            // Sprong naar (tijdlijn-)fase: statische mix t/m de bijhorende drempel,
            // geen tijd-mask. Fade-fasen vallen terug op hun gespiegelde laag-set.
            if (preview) {
                const audible = line.enabled && enterAt <= previewThr;
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
    const { weights } = resolvePhases(state);
    const previewPhase = state.previewPhase != null ? clampTimeline(state.previewPhase) : null;
    const previewThr = previewPhase != null ? previewThreshold(previewPhase) : null;

    const active = state.lines.filter((l) => {
        if (!l.enabled) return false;
        if (previewPhase != null) return clampPhase(l.enterAt ?? 0) <= previewThr;
        return true;
    });
    if (!active.length) {
        return `setcpm(${cpm})\n\nsilence`;
    }
    const body = buildStackBody(state.lines, state.arc, cpm, previewPhase, weights);
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
        phases: { labels: ['Air', 'Rhodes', 'Texture', 'Bass', 'Groove', 'Lead'], weights: [3, 3, 2, 1, 1, 1] },
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
        phases: { labels: ['Air', 'Mallets', 'Pad', 'Vibes', 'Bass', 'Groove'], weights: [3, 2, 2, 1, 1, 1] },
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
        phases: { labels: ['Air', 'Keys', 'Bass', 'Brushes', 'Lead', 'Vibes'], weights: [3, 2, 1, 1, 1, 1] },
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
        // Ambient, beatloos — pads, drone, sub, abstracte sparkles. Géén 'Beat'-fase.
        phases: { labels: ['Veil', 'Pad', 'Deep', 'Bells', 'Glints', 'Shimmer'], weights: [4, 3, 2, 1, 1, 1] },
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
        phases: p.phases
            ? { labels: [...p.phases.labels], weights: [...p.phases.weights] }
            : { labels: [...PHASE_LABELS], weights: [...PHASE_WEIGHTS] },
        lines: p.lines.map((l) => createLine(l))
    };
}


