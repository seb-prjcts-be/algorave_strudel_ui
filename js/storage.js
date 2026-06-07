/**
 * Simple JSON persistence (localStorage).
 * - "last" auto-saves current state
 * - optional named presets via UI / URL param (?preset=naam)
 */

const VERSION = 3;
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

    // Fase-set (namen + gewichten) per preset; exact 6 of terug naar standaard.
    const DEFAULT_LABELS = ['Air', 'Drone', 'Motion', 'Bass', 'Beat', 'Melody'];
    const DEFAULT_WEIGHTS = [3, 3, 2, 1, 1, 1];
    const phasesRaw = state.phases && typeof state.phases === 'object' ? state.phases : {};
    const phases = {
        labels: Array.isArray(phasesRaw.labels) && phasesRaw.labels.length === 6
            ? phasesRaw.labels.map((s) => String(s))
            : DEFAULT_LABELS,
        weights: Array.isArray(phasesRaw.weights) && phasesRaw.weights.length === 6
            ? phasesRaw.weights.map((w) => Math.max(1, Math.round(Number(w) || 1)))
            : DEFAULT_WEIGHTS
    };

    return {
        cpm: Number.isFinite(cpm) ? cpm : 55,
        master,
        arc,
        phases,
        lines: lines.map((l, idx) => {
            const id = typeof l.id === 'string' ? l.id : `line-${Date.now()}-${idx}`;
            const enabled = l.enabled !== false;
            const instrumentId = typeof l.instrumentId === 'string' ? l.instrumentId : 'pink';
            const volume = Number.isFinite(Number(l.volume)) ? Number(l.volume) : 0.3;
            const enterAt = Number.isFinite(Number(l.enterAt)) ? Math.max(0, Math.min(5, Math.round(Number(l.enterAt)))) : 0;
            const anchor = (l.anchor && typeof l.anchor === 'object')
                ? { enabled: l.anchor.enabled === true, octaves: Math.max(1, Math.min(2, Math.round(Number(l.anchor.octaves) || 1))) }
                : { enabled: false, octaves: 1 };

            // Variant-set (klik-volgorde) + hold. Nieuw model met legacy-migratie:
            // ouder formaat (variantIndex + variantCycle{enabled,count}) → reeks.
            const clampVar = (n) => Math.max(0, Math.min(7, Math.round(Number(n) || 0)));
            let variants;
            if (Array.isArray(l.variants) && l.variants.length) {
                const seen = new Set();
                variants = [];
                for (const v of l.variants) { const i = clampVar(v); if (!seen.has(i)) { seen.add(i); variants.push(i); } }
                if (!variants.length) variants = [0];
            } else {
                const start = clampVar(l.variantIndex);
                const vc = l.variantCycle;
                if (vc && vc.enabled === true && Number(vc.count) > 1) {
                    const count = Math.min(Math.round(Number(vc.count)), 8);
                    variants = Array.from({ length: count }, (_, k) => (start + k) % 8);
                } else {
                    variants = [start];
                }
            }
            const variantCycle = { cycles: Math.max(1, Math.min(16, Math.round(Number(l.variantCycle?.cycles) || 4))) };

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
                variants,
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

