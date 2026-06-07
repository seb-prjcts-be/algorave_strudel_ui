/**
 * Eenmalige bursts bovenop de lopende stack (geen hush tussen bursts).
 */
import { compose, buildLineChain, masterGainFragment } from './composer.js?v=17';
import { evaluateCode, stopAll } from './strudel-runtime.js?v=14';
import { getEffect } from './catalog/effects.js?v=14';
import { getInstrument } from './catalog/instruments.js?v=14';

let burstTimer = null;

function burstDurationMs(cpm) {
    const cycleSec = 60 / Math.max(cpm, 1);
    return Math.round(cycleSec * 2 * 1000);
}

export function cancelBurstTimer() {
    if (burstTimer) {
        clearTimeout(burstTimer);
        burstTimer = null;
    }
}

async function evaluateBurstStack(appState, burstLine) {
    const cpm = appState.cpm;
    const activeParts = appState.lines
        .filter((l) => l.enabled)
        .map((l) => buildLineChain(l));

    const master = masterGainFragment(appState);
    const parts = [...activeParts, burstLine];
    const stackBody = parts.map((p) => `  ${p}`).join(',\n');
    const code = parts.length
        ? `setcpm(${cpm})\n\nstack(\n${stackBody}\n)${master}`
        : `setcpm(${cpm})\n\n${burstLine}${master}`;

    await evaluateCode(code);

    burstTimer = setTimeout(async () => {
        burstTimer = null;
        try {
            await evaluateCode(compose(appState));
        } catch (e) {
            console.warn('Restore na burst mislukt', e);
        }
    }, burstDurationMs(cpm));
}

/**
 * Speel één regel eenmalig af zonder lopende stack (preview).
 */
export async function playLineStandalone(appState, line, variantIndex) {
    cancelBurstTimer();
    const burst = `${buildLineChain(line, variantIndex)}.mask("<1 0 0 0 0 0 0 0>")`;
    await evaluateCode(`setcpm(${appState.cpm})\n\n${burst}${masterGainFragment(appState)}`);
    burstTimer = setTimeout(async () => {
        burstTimer = null;
        try {
            await stopAll();
        } catch (e) {
            console.warn('Stop na preview mislukt', e);
        }
    }, burstDurationMs(appState.cpm));
}

/**
 * Speel één regel eenmalig af (mask-burst bovenop stack).
 */
export async function playLineBurst(appState, line) {
    cancelBurstTimer();
    const burst = `${buildLineChain(line)}.mask("<1 0 0 0 0 0 0 0>")`;
    await evaluateBurstStack(appState, burst);
}

/**
 * Speel één effect eenmalig op een regel (preview, zonder stack).
 */
export async function playEffectStandalone(appState, line, effectId) {
    cancelBurstTimer();
    const fx = getEffect(effectId);
    if (!fx || fx.id === 'none' || !fx.oneShot) return;

    const slot = (line.effects || []).find((s) => s.effectId === effectId);
    const value = slot ? slot.value : fx.defaultValue;
    const instrument = getInstrument(line.instrumentId);
    let burst = instrument.base;
    burst += `.gain(${line.volume})`;
    const fragment = fx.apply(String(value));
    if (fragment) burst += fragment;
    burst += '.mask("<1 0 0 0 0 0 0 0>")';

    await evaluateCode(`setcpm(${appState.cpm})\n\n${burst}${masterGainFragment(appState)}`);
    burstTimer = setTimeout(async () => {
        burstTimer = null;
        try {
            await stopAll();
        } catch (e) {
            console.warn('Stop na preview mislukt', e);
        }
    }, burstDurationMs(appState.cpm));
}

/**
 * Speel één effect eenmalig op een regel (bovenop stack).
 */
export async function playEffectBurst(appState, line, effectId) {
    cancelBurstTimer();
    const fx = getEffect(effectId);
    if (!fx || fx.id === 'none' || !fx.oneShot) {
        return;
    }

    const slot = (line.effects || []).find((s) => s.effectId === effectId);
    const value = slot ? slot.value : fx.defaultValue;
    const instrument = getInstrument(line.instrumentId);
    let burst = instrument.base;
    burst += `.gain(${line.volume})`;
    const fragment = fx.apply(String(value));
    if (fragment) burst += fragment;
    burst += '.mask("<1 0 0 0 0 0 0 0>")';

    await evaluateBurstStack(appState, burst);
}
