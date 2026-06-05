/**
 * Varianten 0–7 per instrument — geïnterpreteerd uit het `variant`-recept dat
 * in `data/instruments.json` per instrument staat. Geen recept → standaard:
 * `.n(i)` voor samples, `.transpose(i*2)` voor noten.
 */

export const VARIANT_COUNT = 8;

function clampIndex(variantIndex) {
    return Math.max(0, Math.min(VARIANT_COUNT - 1, Number(variantIndex) || 0));
}

/**
 * Bouw de basis-chain voor een instrument met variant-index (0–7).
 */
export function buildInstrumentBase(instrument, variantIndex = 0) {
    const i = clampIndex(variantIndex);
    const tags = instrument.tags || [];
    const v = instrument.variant;

    if (v && v.type) {
        switch (v.type) {
            case 'patterns': {
                const item = (v.items && v.items[i]) ?? instrument.base;
                return `${item}${v.suffix || ''}`;
            }
            case 'notes': {
                const note = (v.items && (v.items[i] ?? v.items[0])) || 'c3';
                const tpl = v.template || 'note("$")';
                return tpl.replace('$', note);
            }
            case 'param': {
                const raw = Number(v.from || 0) + i * Number(v.step || 0);
                const val = v.decimals ? raw.toFixed(v.decimals) : String(Math.round(raw));
                return `${instrument.base}.${v.fn}(${val})`;
            }
            case 'transpose':
                return `${instrument.base}.transpose(${i * (v.step ?? 2)})`;
            case 'sampleIndex':
                return `${instrument.base}.n(${i})`;
            default:
                break;
        }
    }

    // Standaardgedrag op basis van tags.
    if (tags.includes('note')) {
        return `${instrument.base}.transpose(${i * 2})`;
    }
    return `${instrument.base}.n(${i})`;
}
