/**
 * Left Strudel — orchestratie, transport, debounced evaluate.
 */
import { Dashboard } from './dashboard.js?v=15';
import { compose, countActiveLines } from './composer.js?v=14';
import { getStrudelRuntime, evaluateCode, stopAll, isSamplesReady } from './strudel-runtime.js?v=14';
import {
    playLineBurst,
    playLineStandalone,
    playEffectBurst,
    playEffectStandalone,
    cancelBurstTimer
} from './oneshot.js?v=14';
import {
    loadStateByName,
    saveStateByName,
    getPresetNameFromUrl,
    getActivePresetName
} from './storage.js?v=14';
import { loadInstruments } from './catalog/instruments.js?v=14';
import { PANEL_HTML } from './panel.js?v=15';

const DEBOUNCE_MS = 300;

// ── Self-mounting embed support ──
// The module owns its styles, markup and optional deps, so a host page only needs
// an offcanvas with a mount element and this one script. Standalone pages already
// contain the panel markup (and wire their own styles/deps), so we self-provision
// ONLY when there's nothing mounted yet — leaving standalone untouched.
// Function declarations are hoisted, so these run before the queries below.
if (!document.getElementById('left-strudel-panel')) {
    injectModuleStyles();
    loadOptionalDeps();
    mountPanel();
}

/** Link the module's own stylesheet (which also @imports its fonts) once. */
function injectModuleStyles() {
    if (document.querySelector('link[data-left-strudel-styles]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = new URL('../css/dashboard.css?v=15', import.meta.url).href;
    link.dataset.leftStrudelStyles = '';
    document.head.appendChild(link);
}

/** p5.waves is an optional modulation source (window.Waves). Load it lazily; the
 *  panel degrades gracefully to static values if it never arrives. */
function loadOptionalDeps() {
    if (window.Waves || document.querySelector('script[data-left-strudel-waves]')) return;
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/gh/seb-prjcts-be/p5.waves@v3.3.0/p5.waves.min.js';
    s.async = true;
    s.dataset.leftStrudelWaves = '';
    document.head.appendChild(s);
}

/** Inject the panel markup into the host's mount point, unless markup is already
 *  present (standalone pages inline it themselves). */
function mountPanel() {
    if (document.getElementById('left-strudel-panel')) return;
    const mount = document.getElementById('left-strudel-mount')
        || document.querySelector('[data-left-strudel-mount]');
    if (mount) mount.innerHTML = PANEL_HTML;
}

let playing = false;
let debounceTimer = null;
let persistTimer = null;

const statusEl = document.getElementById('status');
const btnPlay = document.getElementById('btn-play');
const btnStop = document.getElementById('btn-stop');
const panel = document.getElementById('left-strudel-panel');
const presetNameEl = document.getElementById('preset-name');
const btnSave = document.getElementById('btn-save');
const btnLoad = document.getElementById('btn-load');

function setStatus(text, className = '') {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.className = 'ls-status' + (className ? ` ${className}` : '');
}

async function refreshPlayback(dashboard) {
    if (!playing) return;
    cancelBurstTimer();
    const code = compose(dashboard.getState());
    try {
        await evaluateCode(code);
        const n = countActiveLines(dashboard.getState().lines);
        setStatus(`Playing · ${n} layer${n === 1 ? '' : 's'} active`, 'is-playing');
    } catch (err) {
        console.error(err);
        setStatus('Code error — check the lines', 'is-error');
    }
}

function scheduleRefresh(dashboard) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => refreshPlayback(dashboard), DEBOUNCE_MS);
}

function currentPresetName() {
    return presetNameEl ? String(presetNameEl.value || '').trim() : '';
}

function persistState(dashboard) {
    if (!window.localStorage) return;
    const name = currentPresetName();
    try {
        saveStateByName(dashboard.getState(), name);
    } catch (err) {
        console.warn('Opslaan mislukt:', err);
    }
}

function schedulePersist(dashboard) {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => persistState(dashboard), 350);
}

let highlightRaf = null;
// Baseline cycle captured at the start of each playback, so the host can derive
// per-take progress even if getTime() is continuous across plays. See the
// `window.algoraveTransport` publish in the highlight tick below.
let transportStartCycle = null;

// Live UI-weerslag: licht de nu-klinkende variant op bij cycling-regels.
// getTime() (global, na runtime-init) geeft de cyclus-positie — dezelfde klok
// als de scheduler, dus de highlight loopt exact in de maat met de audio.
function startHighlightLoop(dashboard) {
    if (highlightRaf) return;
    const tick = () => {
        if (!playing) { highlightRaf = null; return; }
        let cycle = 0;
        try { if (typeof globalThis.getTime === 'function') cycle = globalThis.getTime(); } catch (e) { /* nog geen klok */ }
        dashboard.highlightCyclingVariants(cycle);

        // Publish transport state for any host (e.g. the algorave visuals) to read.
        // Raw figures only — the host derives arc phase/progress from cpm + arc.
        if (transportStartCycle == null && cycle > 0) transportStartCycle = cycle;
        const st = dashboard.getState();
        window.algoraveTransport = {
            playing: true,
            cycle,
            startCycle: transportStartCycle ?? cycle,
            cpm: st.cpm,
            arcEnabled: st.arc?.enabled !== false,
            arcMinutes: st.arc?.minutes,
        };

        highlightRaf = requestAnimationFrame(tick);
    };
    highlightRaf = requestAnimationFrame(tick);
}

function stopHighlightLoop(dashboard) {
    if (highlightRaf) { cancelAnimationFrame(highlightRaf); highlightRaf = null; }
    dashboard.clearLiveHighlights?.();
}

async function startPlayback(dashboard) {
    if (playing) {
        await refreshPlayback(dashboard);
        return;
    }
    setStatus('Loading audio…');
    if (btnPlay) btnPlay.disabled = true;
    try {
        await getStrudelRuntime();
        const samples = isSamplesReady() ? '' : ' (synth-only)';
        playing = true;
        transportStartCycle = null; // recapture the baseline for this take
        btnStop.disabled = false;
        btnPlay.classList.add('is-active');
        btnPlay.textContent = '▶ Playing';
        await refreshPlayback(dashboard);
        startHighlightLoop(dashboard);
        if (!statusEl.classList.contains('is-error')) {
            setStatus(`Playing${samples}`, 'is-playing');
        }
    } catch (err) {
        console.error(err);
        setStatus('Failed to load Strudel', 'is-error');
        playing = false;
    } finally {
        if (btnPlay) btnPlay.disabled = false;
    }
}

function initTransport(dashboard) {
    btnPlay?.addEventListener('click', () => startPlayback(dashboard));

    btnStop?.addEventListener('click', async () => {
        cancelBurstTimer();
        clearTimeout(debounceTimer);
        try {
            await stopAll();
        } catch (e) {
            console.warn(e);
        }
        playing = false;
        transportStartCycle = null;
        if (window.algoraveTransport) window.algoraveTransport.playing = false;
        stopHighlightLoop(dashboard);
        btnPlay.classList.remove('is-active');
        btnPlay.textContent = '▶ Start';
        btnStop.disabled = true;
        setStatus('Stopped');
    });
}

async function ensureRuntime() {
    setStatus('Loading audio…');
    try {
        await getStrudelRuntime();
        return true;
    } catch (err) {
        console.error(err);
        setStatus('Failed to load Strudel', 'is-error');
        return false;
    }
}

const urlPreset = getPresetNameFromUrl();
const activePreset = urlPreset || getActivePresetName();
if (presetNameEl && activePreset) presetNameEl.value = activePreset;

let dashboard;

async function boot() {
    setStatus('Loading instruments…');
    try {
        await loadInstruments();
    } catch (err) {
        console.error(err);
        setStatus('Failed to load instruments', 'is-error');
        return;
    }

    dashboard = new Dashboard(panel || document.body, {
    onChange: () => {
        scheduleRefresh(dashboard);
        schedulePersist(dashboard);
    },
    ensurePlaying: async () => {
        if (!playing) await startPlayback(dashboard);
    },
    onOneShotLine: async (line) => {
        if (!(await ensureRuntime())) return;
        try {
            if (playing) {
                await playLineBurst(dashboard.getState(), line);
                setStatus('Line · once', 'is-playing');
            } else {
                await playLineStandalone(dashboard.getState(), line);
                setStatus('Preview line');
            }
        } catch (e) {
            console.error(e);
            setStatus('One-shot failed', 'is-error');
        }
    },
    onVariant: async (line, index) => {
        if (!(await ensureRuntime())) return;
        try {
            if (playing) {
                await playLineBurst(dashboard.getState(), { ...line, variantIndex: index });
                setStatus(`Variant ${index} · once`, 'is-playing');
            } else {
                await playLineStandalone(dashboard.getState(), line, index);
                setStatus(`Variant ${index}`);
            }
        } catch (e) {
            console.error(e);
            setStatus('Variant failed', 'is-error');
        }
    },
    onOneShotEffect: async (line, effectId) => {
        if (!(await ensureRuntime())) return;
        try {
            if (playing) {
                await playEffectBurst(dashboard.getState(), line, effectId);
                setStatus('Effect · once', 'is-playing');
            } else {
                await playEffectStandalone(dashboard.getState(), line, effectId);
                setStatus('Preview effect');
            }
        } catch (e) {
            console.error(e);
            setStatus('One-shot failed', 'is-error');
        }
    }
});

// Load persisted settings on start.
try {
    const loaded = loadStateByName(activePreset || '');
    if (loaded) {
        dashboard.setState(loaded);
        setStatus(activePreset ? `Restored preset · ${activePreset}` : 'Restored last', '');
    } else {
        setStatus('Ready', '');
    }
} catch (err) {
    console.warn('Load failed:', err);
}

btnSave?.addEventListener('click', () => {
    persistState(dashboard);
    const name = currentPresetName();
    setStatus(name ? `Saved · ${name}` : 'Saved · last', '');
});

btnLoad?.addEventListener('click', () => {
    const name = currentPresetName();
    try {
        const loaded = loadStateByName(name);
        if (loaded) {
            dashboard.setState(loaded);
            scheduleRefresh(dashboard);
            setStatus(name ? `Loaded · ${name}` : 'Loaded · last', '');
        } else {
            setStatus('No preset found', 'is-error');
        }
    } catch (err) {
        console.warn('Load failed:', err);
        setStatus('Load failed', 'is-error');
    }
});

    initTransport(dashboard);
}

boot();

export { dashboard };
