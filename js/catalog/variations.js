/**
 * Varianten 0–7 per instrument — zoals n() / sample-nummers in Strudel.
 */

const DRONE_NOTES = ['c2', 'd2', 'e2', 'f2', 'g2', 'a2', 'b2', 'c3'];

/** Beat-patronen 0–7: van kaal naar druk. */
export const BEAT_PATTERNS = [
    's("bd*4")',
    's("bd ~ sd ~")',
    's("bd ~ sd ~, hh*8")',
    's("bd*2 ~ sd ~, hh*8")',
    's("bd ~ ~ bd ~ ~ sd ~, hh*8")',
    's("bd sd, hh*16")',
    's("[bd bd] ~ sd ~, hh*8, ~ ~ ~ oh")',
    's("bd*4, ~ cp ~ cp, hh*8")'
];

/** Bas-riffs 0–7 op c2 mineur. */
export const BASS_PATTERNS = [
    'n("0 ~ 0 ~").scale("c2:minor")',
    'n("0 0 3 0").scale("c2:minor")',
    'n("0 0 5 3").scale("c2:minor")',
    'n("0 3 5 7").scale("c2:minor")',
    'n("0 ~ 7 ~ 0 ~ 3 ~").scale("c2:minor")',
    'n("<0 3> <5 7>").scale("c2:minor")',
    'n("0 0 ~ 0 3 ~ 0 5").scale("c2:minor")',
    'n("0 7 5 3").scale("c2:minor")'
];

/** Melodie-patronen 0–7 op c4 mineur. */
export const LEAD_PATTERNS = [
    'n("0 2 4 2").scale("c4:minor")',
    'n("4 3 2 0").scale("c4:minor")',
    'n("0 2 4 7 4 2").scale("c4:minor")',
    'n("7 4 2 0").scale("c4:minor")',
    'n("0 ~ 4 ~ 7 ~ 4 ~").scale("c4:minor")',
    'n("<0 4> <2 7>").scale("c4:minor")',
    'n("0 1 2 3 4 5 6 7").scale("c4:minor")',
    'n("4 7 4 2 0 2").scale("c4:minor")'
];

/**
 * Bouw de basis-chain voor een instrument met variant-index (0–7).
 */
export function buildInstrumentBase(instrument, variantIndex = 0) {
    const i = Math.max(0, Math.min(7, Number(variantIndex) || 0));
    const tags = instrument.tags || [];

    // Id-specifieke patroon-banken hebben voorrang op de tag-generieke regels.
    switch (instrument.id) {
        case 'beat':
            return BEAT_PATTERNS[i];
        case 'bass':
            return `${BASS_PATTERNS[i]}.s("sawtooth").release(0.18)`;
        case 'lead':
            return `${LEAD_PATTERNS[i]}.s("triangle").slow(2)`;
        case 'crackle':
            // Lage variant = spaarzaam (kampvuur), hoge variant = drukker.
            return `${instrument.base}.density(${(0.03 + i * 0.03).toFixed(2)})`;
        case 'pink':
            // Variant 0 = diep en warm; oplopend richting helder.
            return `${instrument.base}.lpf(${300 + i * 350})`;
        case 'white':
            return `${instrument.base}.hpf(${1200 + i * 350})`;
        case 'sine_drone':
            // Lange swells — menselijk, geen grid.
            return `note("${DRONE_NOTES[i]}").s("sine").attack(1.5).release(2.5)`;
        case 'triangle_melody':
            return `${instrument.base}.transpose(${i * 2})`;
        default:
            break;
    }

    if (tags.includes('sample')) {
        return `${instrument.base}.n(${i})`;
    }
    if (tags.includes('note')) {
        return `${instrument.base}.transpose(${i * 2})`;
    }
    return `${instrument.base}.n(${i})`;
}

export const VARIANT_COUNT = 8;
