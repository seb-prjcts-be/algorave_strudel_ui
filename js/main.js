/**
 * Left Strudel — orchestratie, transport, debounced evaluate.
 */
import { Dashboard } from './dashboard.js';
import { compose, countActiveLines } from './composer.js';
import { getStrudelRuntime, evaluateCode, stopAll, isSamplesReady } from './strudel-runtime.js';
import {
    playLineBurst,
    playLineStandalone,
    playEffectBurst,
    playEffectStandalone,
    cancelBurstTimer
} from './oneshot.js';
import {
    loadStateByName,
    saveStateByName,
    getPresetNameFromUrl,
    getActivePresetName
} from './storage.js';

const DEBOUNCE_MS = 300;

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
        btnStop.disabled = false;
        btnPlay.classList.add('is-active');
        btnPlay.textContent = '▶ Playing';
        await refreshPlayback(dashboard);
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

let dashboard = new Dashboard(panel || document.body, {
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

export { dashboard };
