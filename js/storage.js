/**
 * Simple JSON persistence (localStorage).
 * - "last" auto-saves current state
 * - optional named presets via UI / URL param (?preset=naam)
 */

const VERSION = 2;
const LAST_KEY = 'left_strudel:last';
const PRESET_PREFIX = 'left_strudel:preset:';
const ACTIVE_KEY = 'left_strudel:activePreset';

function safeJsonParse(text) {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

function normalizeLoadedState(raw) {
    const state = raw && raw.state ? raw.state : raw;
    if (!state || typeof state !== 'object') return null;
    const cpm = Number(state.cpm);
    const lines = Array.isArray(state.lines) ? state.lines : [];

    const masterRaw = Number(state.master);
    const master = Number.isFinite(masterRaw) ? Math.max(0, Math.min(1, masterRaw)) : 0.6;

    const arcRaw = state.arc && typeof state.arc === 'object' ? state.arc : {};
    const arcMinutes = Number(arcRaw.minutes);
    const arc = {
        enabled: arcRaw.enabled !== false,
        minutes: Number.isFinite(arcMinutes) ? Math.max(1, Math.min(20, arcMinutes)) : 12
    };

    return {
        cpm: Number.isFinite(cpm) ? cpm : 55,
        master,
        arc,
        lines: lines.map((l, idx) => {
            const id = typeof l.id === 'string' ? l.id : `line-${Date.now()}-${idx}`;
            const enabled = l.enabled !== false;
            const instrumentId = typeof l.instrumentId === 'string' ? l.instrumentId : 'pink';
            const volume = Number.isFinite(Number(l.volume)) ? Number(l.volume) : 0.3;
            const variantIndex = Number.isFinite(Number(l.variantIndex)) ? Number(l.variantIndex) : 0;
            const enterAt = Number.isFinite(Number(l.enterAt)) ? Math.max(0, Math.min(5, Math.round(Number(l.enterAt)))) : 0;
            const anchor = (l.anchor && typeof l.anchor === 'object')
                ? { enabled: l.anchor.enabled === true, octaves: Math.max(1, Math.min(2, Math.round(Number(l.anchor.octaves) || 1))) }
                : { enabled: false, octaves: 1 };
            const variantCycle = (l.variantCycle && typeof l.variantCycle === 'object')
                ? {
                    enabled: l.variantCycle.enabled === true,
                    count: Math.max(2, Math.min(8, Math.round(Number(l.variantCycle.count) || 3))),
                    cycles: Math.max(1, Math.min(16, Math.round(Number(l.variantCycle.cycles) || 4)))
                }
                : { enabled: false, count: 3, cycles: 4 };

            const effects = Array.isArray(l.effects) ? l.effects : [];
            const normalizedEffects = [
                effects[0] && effects[0].effectId ? effects[0] : { effectId: 'room', value: 0.4 },
                effects[1] && effects[1].effectId ? effects[1] : { effectId: 'none', value: 0 }
            ];

            return {
                id,
                enabled,
                instrumentId,
                volume,
                variantIndex,
                enterAt,
                anchor,
                variantCycle,
                effects: normalizedEffects.map((s) => {
                    const slot = {
                        effectId: typeof s.effectId === 'string' ? s.effectId : 'none',
                        value: Number.isFinite(Number(s.value)) ? Number(s.value) : 0
                    };
                    if (s.mod && typeof s.mod === 'object') {
                        slot.mod = {
                            enabled: s.mod.enabled === true,
                            wave: typeof s.mod.wave === 'string' ? s.mod.wave : 'classic sine',
                            min: Number.isFinite(Number(s.mod.min)) ? Number(s.mod.min) : 0,
                            max: Number.isFinite(Number(s.mod.max)) ? Number(s.mod.max) : 1,
                            cycles: Number.isFinite(Number(s.mod.cycles)) ? Math.max(1, Math.min(64, Math.round(Number(s.mod.cycles)))) : 16
                        };
                    }
                    return slot;
                })
            };
        })
    };
}

export function getPresetNameFromUrl() {
    const url = new URL(window.location.href);
    const preset = url.searchParams.get('preset');
    if (!preset) return '';
    return String(preset).trim();
}

export function presetStorageKey(name) {
    const n = String(name || '').trim();
    if (!n) return LAST_KEY;
    return `${PRESET_PREFIX}${encodeURIComponent(n)}`;
}

export function loadStateByName(name) {
    const key = presetStorageKey(name);
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = safeJsonParse(raw);
    if (!parsed) return null;
    // Oudere opslag-versie: laten vallen, zodat de (nieuwe) default-compositie laadt.
    if (parsed.version !== VERSION) return null;
    return normalizeLoadedState(parsed);
}

export function saveStateByName(state, name) {
    const key = presetStorageKey(name);
    const payload = { version: VERSION, savedAt: Date.now(), state };
    localStorage.setItem(key, JSON.stringify(payload));
    const n = String(name || '').trim();
    localStorage.setItem(ACTIVE_KEY, n);
}

export function getActivePresetName() {
    const raw = localStorage.getItem(ACTIVE_KEY);
    return raw ? String(raw) : '';
}

