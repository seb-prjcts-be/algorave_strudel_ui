/**
 * Effect modifiers — volgorde via `order` bij compositie.
 * compatibleWith: instrument tags of 'crackle' voor density.
 */
export const EFFECTS = [
    {
        id: 'none',
        label: '— none —',
        order: 99,
        compatibleWith: ['sample', 'synth', 'note', 'crackle'],
        valueType: 'none',
        defaultValue: 0,
        apply: () => '',
        oneShot: false
    },
    {
        id: 'sparse',
        label: 'Sparse',
        order: 5,
        compatibleWith: ['sample', 'synth', 'note', 'crackle'],
        valueType: 'slider',
        min: 0,
        max: 0.9,
        step: 0.05,
        defaultValue: 0.4,
        apply: (v) => `.degradeBy(${v})`,
        oneShot: false
    },
    {
        id: 'room',
        label: 'Reverb',
        order: 50,
        compatibleWith: ['sample', 'synth', 'note', 'crackle'],
        valueType: 'slider',
        min: 0,
        max: 1,
        step: 0.05,
        defaultValue: 0.5,
        apply: (v) => `.room(${v})`,
        oneShot: true
    },
    {
        id: 'lpf',
        label: 'Lowpass',
        order: 20,
        compatibleWith: ['sample', 'synth', 'note', 'crackle'],
        valueType: 'number',
        min: 200,
        max: 8000,
        step: 50,
        scale: 'log',
        unit: 'Hz',
        defaultValue: 1200,
        apply: (v) => `.lpf(${v})`,
        oneShot: true
    },
    {
        id: 'hpf',
        label: 'Highpass',
        order: 21,
        compatibleWith: ['sample', 'synth', 'note', 'crackle'],
        valueType: 'number',
        min: 100,
        max: 4000,
        step: 50,
        scale: 'log',
        unit: 'Hz',
        defaultValue: 800,
        apply: (v) => `.hpf(${v})`,
        oneShot: true
    },
    {
        id: 'delay',
        label: 'Delay',
        order: 51,
        compatibleWith: ['sample', 'synth', 'note'],
        valueType: 'slider',
        min: 0,
        max: 1,
        step: 0.05,
        defaultValue: 0.35,
        apply: (v) => `.delay(${v})`,
        oneShot: true
    },
    {
        id: 'slow',
        label: 'Slower',
        order: 30,
        compatibleWith: ['sample', 'synth', 'note', 'crackle'],
        valueType: 'number',
        min: 1,
        max: 8,
        step: 1,
        unit: '×',
        defaultValue: 2,
        apply: (v) => `.slow(${v})`,
        oneShot: false
    },
    {
        id: 'fast',
        label: 'Faster',
        order: 31,
        compatibleWith: ['sample', 'synth', 'note', 'crackle'],
        valueType: 'number',
        min: 1,
        max: 4,
        step: 1,
        unit: '×',
        defaultValue: 2,
        apply: (v) => `.fast(${v})`,
        oneShot: false
    },
    {
        id: 'density',
        label: 'Density',
        order: 10,
        compatibleWith: ['crackle'],
        valueType: 'slider',
        min: 0.01,
        max: 0.5,
        step: 0.01,
        scale: 'log',
        defaultValue: 0.12,
        apply: (v) => `.density(${v})`,
        oneShot: true
    },
    {
        id: 'bpf',
        label: 'Bandpass',
        order: 22,
        compatibleWith: ['sample', 'synth', 'note', 'crackle'],
        valueType: 'number',
        min: 300,
        max: 5000,
        step: 100,
        scale: 'log',
        unit: 'Hz',
        defaultValue: 1800,
        apply: (v) => `.bpf(${v}).bpq(8)`,
        oneShot: true
    }
];

export function getEffect(id) {
    return EFFECTS.find((e) => e.id === id) || EFFECTS[0];
}

export function effectsForInstrument(instrument) {
    const tags = new Set(instrument.tags || []);
    if (tags.has('crackle') || instrument.id === 'crackle') {
        tags.add('crackle');
    }
    return EFFECTS.filter((fx) => {
        if (fx.id === 'none') return true;
        return fx.compatibleWith.some((t) => tags.has(t));
    });
}

export function effectOptionsHtml(instrument, selectedId) {
    return effectsForInstrument(instrument)
        .map((fx) => {
            const sel = fx.id === selectedId ? ' selected' : '';
            return `<option value="${fx.id}"${sel}>${fx.label}</option>`;
        })
        .join('');
}

export function defaultEffectSlots() {
    return [
        { effectId: 'none', value: 0 },
        { effectId: 'room', value: 0.5 }
    ];
}

/* --- Genormaliseerde UI-waarden (0–1) ↔ echte parameterwaarden --------------
 * Elke regelaar staat in de UI op 0–1; intern blijft de echte waarde (Hz enz.).
 * Filters mappen logaritmisch (musikaal), de rest lineair.
 */
const clamp01 = (n) => Math.max(0, Math.min(1, Number(n) || 0));

/** Echte waarde uit een 0–1 positie. */
export function normToValue(fx, pos) {
    const p = clamp01(pos);
    const min = Number(fx.min ?? 0);
    const max = Number(fx.max ?? 1);
    if (fx.scale === 'log' && min > 0 && max > 0) {
        return min * Math.pow(max / min, p);
    }
    return min + p * (max - min);
}

/** 0–1 positie uit een echte waarde. */
export function valueToNorm(fx, value) {
    const v = Number(value);
    const min = Number(fx.min ?? 0);
    const max = Number(fx.max ?? 1);
    if (!Number.isFinite(v) || max === min) return 0;
    if (fx.scale === 'log' && min > 0 && v > 0) {
        return clamp01(Math.log(v / min) / Math.log(max / min));
    }
    return clamp01((v - min) / (max - min));
}

/** Rond de echte waarde af op een zinvolle precisie voor opslag. */
export function roundEffectValue(fx, value) {
    const v = Number(value);
    if (fx.unit === 'Hz' || Number(fx.step) >= 1) return Math.round(v);
    return Math.round(v * 100) / 100;
}

/** Toon-string van de echte waarde (hint naast de 0–1 regelaar). */
export function formatEffectDisplay(fx, value) {
    const v = roundEffectValue(fx, value);
    if (fx.unit === 'Hz') return `${v} Hz`;
    if (fx.unit) return `${v}${fx.unit}`;
    return String(v);
}
