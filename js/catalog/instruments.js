/**
 * Instrument-catalogus — geladen uit `data/instruments.json` (op voorhand,
 * vóór de UI wordt opgebouwd). Zie `loadInstruments()` in `main.js`-boot.
 * Velden: id, label, tags, base, defaultVolume, optioneel variant-recept
 * (geïnterpreteerd door `catalog/variations.js`).
 */
let INSTRUMENTS = [];
let loadPromise = null;

/** Laad de catalogus één keer. Resolved met de instrument-array. */
export function loadInstruments(url = 'data/instruments.json?v=14') {
    if (loadPromise) return loadPromise;
    loadPromise = fetch(url)
        .then((res) => {
            if (!res.ok) throw new Error(`instruments.json: HTTP ${res.status}`);
            return res.json();
        })
        .then((data) => {
            const list = Array.isArray(data) ? data : data.instruments;
            if (!Array.isArray(list) || !list.length) {
                throw new Error('instruments.json bevat geen instrumenten');
            }
            INSTRUMENTS = list;
            return INSTRUMENTS;
        });
    return loadPromise;
}

export function getInstruments() {
    return INSTRUMENTS;
}

export function getInstrument(id) {
    return INSTRUMENTS.find((i) => i.id === id) || INSTRUMENTS[0];
}

export function instrumentOptionsHtml(selectedId) {
    return INSTRUMENTS.map((inst) => {
        const sel = inst.id === selectedId ? ' selected' : '';
        return `<option value="${inst.id}"${sel}>${inst.label}</option>`;
    }).join('');
}
