/**
 * Strudel achtergrond-runtime — init, samples, evaluate, hush.
 */
const STRUDEL_WEB_URL = 'https://unpkg.com/@strudel/web@1.2.3?module';
const STRUDEL_SAMPLE_MAPS = [
    'github:tidalcycles/dirt-samples'
];

let runtimePromise = null;
let samplesReady = false;

export function isSamplesReady() {
    return samplesReady;
}

export async function getStrudelRuntime() {
    if (runtimePromise) {
        return runtimePromise;
    }

    runtimePromise = (async () => {
        const moduleApi = await import(STRUDEL_WEB_URL);
        const namespaceApi = globalThis.strudel || globalThis.Strudel || globalThis.strudelWeb || {};
        const initStrudel = moduleApi.initStrudel || globalThis.initStrudel || namespaceApi.initStrudel;
        const evaluate = moduleApi.evaluate || globalThis.evaluate || namespaceApi.evaluate;
        const hush = moduleApi.hush || globalThis.hush || namespaceApi.hush;
        const samples = moduleApi.samples || globalThis.samples || namespaceApi.samples;

        if (
            typeof initStrudel !== 'function' ||
            typeof evaluate !== 'function' ||
            typeof hush !== 'function'
        ) {
            throw new Error('Strudel API is niet beschikbaar.');
        }

        await Promise.resolve(
            initStrudel({
                prebake: async () => {
                    if (typeof samples !== 'function') {
                        samplesReady = false;
                        return;
                    }
                    try {
                        await Promise.all(
                            STRUDEL_SAMPLE_MAPS.map((map) => samples(map))
                        );
                        samplesReady = true;
                    } catch (err) {
                        console.warn('Sample preload mislukt, synth-only fallback.', err);
                        samplesReady = false;
                    }
                }
            })
        );

        return {
            evaluate: (code) => Promise.resolve(evaluate(code)),
            hush: () => Promise.resolve(hush())
        };
    })();

    return runtimePromise;
}

export async function evaluateCode(code) {
    const { evaluate } = await getStrudelRuntime();
    return evaluate(code);
}

export async function stopAll() {
    const { hush } = await getStrudelRuntime();
    return hush();
}
