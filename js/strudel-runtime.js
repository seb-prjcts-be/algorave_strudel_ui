/**
 * Strudel achtergrond-runtime — init, samples, evaluate, hush.
 */
const STRUDEL_WEB_URL = 'https://unpkg.com/@strudel/web@1.2.3?module';
const STRUDEL_SAMPLE_MAPS = [
    'github:tidalcycles/dirt-samples'
];

let runtimePromise = null;
let samplesReady = false;
let masterLimiter = null;

export function isSamplesReady() {
    return samplesReady;
}

/**
 * Echte master-limiter op de SOM van alle lagen. Superdough mixt alles in een
 * interne master-gain → destination. Die master-node zit verborgen in een
 * closure, dus we onderscheppen elke connectie naar `ctx.destination` en leiden
 * die één keer om via een DynamicsCompressorNode (brickwall-achtig). Zo kan het
 * totaal niet boven het plafond, hoeveel lagen er ook stapelen.
 * Moet vóór het eerste geluid draaien (superdough verbindt lazy bij start).
 */
function installMasterLimiter(getCtx) {
    let ctx;
    try {
        ctx = getCtx();
    } catch {
        return;
    }
    if (!ctx || masterLimiter) return;

    const Proto = (typeof AudioNode !== 'undefined' && AudioNode.prototype) || null;
    if (!Proto || typeof Proto.connect !== 'function') return;

    // Bus-leveler: trekt luidere fases (meer lagen) terug naar het niveau van de
    // stille intro, zodat de master een betrouwbaar, gelijkmatig plafond is.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;  // dB — begint al ruim onder clipping te nivelleren
    comp.ratio.value = 6;
    comp.knee.value = 6;
    comp.attack.value = 0.03;    // traag genoeg om niet op crackle-tikken te pompen
    comp.release.value = 0.3;

    const origConnect = Proto.connect;
    // Wire de limiter zelf met de originele connect (anders verwijst hij naar zichzelf).
    origConnect.call(comp, ctx.destination);

    Proto.connect = function (target, ...rest) {
        if (target === ctx.destination && this !== comp) {
            return origConnect.call(this, comp, ...rest);
        }
        return origConnect.call(this, target, ...rest);
    };

    masterLimiter = comp;
    globalThis.__leftStrudelLimiter = comp; // alleen voor debug/verificatie
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
        const getAudioContext = moduleApi.getAudioContext || globalThis.getAudioContext || namespaceApi.getAudioContext;

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

        // Master-limiter installeren vóór het eerste geluid.
        if (typeof getAudioContext === 'function') {
            try {
                installMasterLimiter(getAudioContext);
            } catch (err) {
                console.warn('Master-limiter niet geïnstalleerd:', err);
            }
        }

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
