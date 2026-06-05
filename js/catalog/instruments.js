/**
 * Instrument presets — basis-chains voor elke zin.
 * tags: sample | synth | note
 */
export const INSTRUMENTS = [
    {
        id: 'wind',
        label: 'Wind',
        tags: ['sample'],
        base: 's("wind").loopAt(8)',
        defaultVolume: 0.3
    },
    {
        id: 'birds',
        label: 'Birds',
        tags: ['sample'],
        base: 's("birds").loopAt(8)',
        defaultVolume: 0.25
    },
    {
        id: 'pad',
        label: 'Pad',
        tags: ['sample'],
        base: 's("pad").loopAt(4).striate(16)',
        defaultVolume: 0.35
    },
    {
        id: 'pink',
        label: 'Pink noise',
        tags: ['synth'],
        // Trage, zwellende wash (geen retrigger-geratel).
        base: 's("pink").slow(2).attack(1).release(1)',
        defaultVolume: 0.18
    },
    {
        id: 'crackle',
        label: 'Crackle',
        tags: ['synth', 'crackle'],
        // Kampvuur: één bron, dichtheid = hoe vaak het knettert.
        base: 's("crackle")',
        defaultVolume: 0.2
    },
    {
        id: 'white',
        label: 'White noise',
        tags: ['synth'],
        base: 's("white").slow(2).attack(1).release(1)',
        defaultVolume: 0.12
    },
    {
        id: 'sine_drone',
        label: 'Sine drone',
        tags: ['note'],
        base: 'note("c2").s("sine").attack(0.3).release(0.8)',
        defaultVolume: 0.28
    },
    {
        id: 'triangle_melody',
        label: 'Triangle melody',
        tags: ['note'],
        base: 'note("<c4 eb4 g4 bb3>").s("triangle").slow(2)',
        defaultVolume: 0.35
    },
    {
        id: 'beat',
        label: 'Beat',
        tags: ['sample', 'drums'],
        base: 's("bd ~ sd ~, hh*8")',
        defaultVolume: 0.6
    },
    {
        id: 'bass',
        label: 'Bass',
        tags: ['note', 'bass'],
        base: 'n("0 0 3 0").scale("c2:minor").s("sawtooth").lpf(700).release(0.18)',
        defaultVolume: 0.45
    },
    {
        id: 'lead',
        label: 'Melody',
        tags: ['note', 'melody'],
        base: 'n("0 2 4 2").scale("c4:minor").s("triangle").slow(2)',
        defaultVolume: 0.4
    }
];

export function getInstrument(id) {
    return INSTRUMENTS.find((i) => i.id === id) || INSTRUMENTS[0];
}

export function instrumentOptionsHtml(selectedId) {
    return INSTRUMENTS.map((inst) => {
        const sel = inst.id === selectedId ? ' selected' : '';
        return `<option value="${inst.id}"${sel}>${inst.label}</option>`;
    }).join('');
}
