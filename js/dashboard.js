/**
 * DOM: regels renderen, events, debug-paneel.
 */
import { createLine, compose, applyPreset, activeVariantAt, ARC_PHASES, TIMELINE_PHASES, DEFAULT_ARC, DEFAULT_MASTER, clampPhase, previewThreshold, resolvePhases, timelineLabelsFor, progressionSnapshot, sameProgression, clampHold } from './composer.js?v=18';
import { getInstrument, instrumentOptionsHtml } from './catalog/instruments.js?v=14';
import {
    getEffect,
    effectOptionsHtml,
    effectsForInstrument,
    normToValue,
    valueToNorm,
    roundEffectValue,
    formatEffectDisplay
} from './catalog/effects.js?v=14';
import { variantCount } from './catalog/variations.js?v=15';
import { isWavesAvailable, waveNames } from './modulation.js?v=14';

const FALLBACK_WAVES = ['classic sine', 'triangle', 'square', 'mountain peaks', 'steps', 'saw up', 'noise'];

export function createDefaultState() {
    // Startpunt = de vaste preset "Gentle Jazz".
    return applyPreset('gentle_jazz');
}

export class Dashboard {
    /**
     * @param {HTMLElement} root — #left-strudel-panel of equivalent
     * @param {{ onChange: () => void, onOneShotLine: (line) => void, onOneShotEffect: (line, effectId) => void, onVariant: (line, index) => void }} callbacks
     */
    constructor(root, callbacks) {
        this.root = root;
        this.callbacks = callbacks;
        this.linesEl = root.querySelector('#lines-container') || document.getElementById('lines-container');
        this.debugEl = root.querySelector('#debug-code') || document.getElementById('debug-code');
        this.cpmSlider = root.querySelector('#cpm-slider') || document.getElementById('cpm-slider');
        this.cpmValue = root.querySelector('#cpm-value') || document.getElementById('cpm-value');
        this.masterSlider = root.querySelector('#master-slider') || document.getElementById('master-slider');
        this.masterValue = root.querySelector('#master-value') || document.getElementById('master-value');
        this.arcToggle = root.querySelector('#arc-enabled') || document.getElementById('arc-enabled');
        this.arcMinutes = root.querySelector('#arc-minutes') || document.getElementById('arc-minutes');
        this.arcMinutesValue = root.querySelector('#arc-minutes-value') || document.getElementById('arc-minutes-value');
        this.phaseBtnsEl = root.querySelector('#phase-btns') || document.getElementById('phase-btns');
        this.arcHintEl = root.querySelector('#arc-hint') || document.getElementById('arc-hint');
        this.state = createDefaultState();
        /** @type {Set<string>} open collapse panel ids per zin — begint leeg: alles dicht */
        this.openLineIds = new Set();
        /** Transport-status: spiegelt main.js. Preset-knoppen liggen vast tijdens een lopende auto build-up. */
        this.playing = false;
        /** Snapshot van de standaard-progressie; gezet bij elke volledige state-wissel. */
        this.baseline = null;
        this.bindGlobal();
        this.buildOffPathUI();
        this.baseline = progressionSnapshot(this.state);
        this.renderPhaseButtons();
        this.syncArcControls();
        this.syncPhaseButtons();
        this.syncTransport();
        this.syncPresetButtons();
        this.renderLines();
        this.updateDebug();
    }

    /** main.js meldt play/stop; presets liggen vast zolang een auto build-up speelt. */
    setPlaying(isPlaying) {
        this.playing = !!isPlaying;
        this.syncPresetButtons();
    }

    /** Grijs de preset-knoppen uit terwijl we in een lopende auto build-up zitten. */
    syncPresetButtons() {
        const arcOn = this.state.arc?.enabled !== false;
        const lock = this.playing && arcOn;
        this.root.querySelectorAll('[data-preset]').forEach((btn) => {
            btn.disabled = lock;
        });
    }

    syncTransport() {
        if (this.cpmSlider) {
            this.cpmSlider.value = String(this.state.cpm);
            if (this.cpmValue) this.cpmValue.textContent = String(this.state.cpm);
        }
        if (this.masterSlider) {
            this.masterSlider.value = String(this.state.master);
            if (this.masterValue) this.masterValue.textContent = String(this.state.master);
        }
    }

    /** Fase-namen uit de huidige state (per-preset), met fallback op de standaard. */
    phaseLabels() {
        return resolvePhases(this.state).labels;
    }

    renderPhaseButtons() {
        if (!this.phaseBtnsEl) return;
        // Full timeline: 6 build-up phases + 2 mirrored fade-out phases. A fade
        // button previews the thinned ending (its mirrored layer set). Labels komen
        // uit de preset, dus elke preset toont z'n eigen fase-namen.
        const labels = timelineLabelsFor(this.phaseLabels());
        this.phaseBtnsEl.innerHTML = Array.from({ length: TIMELINE_PHASES }, (_, i) =>
            `<button type="button" class="ls-btn ls-btn--phase${i >= ARC_PHASES ? ' ls-btn--fade' : ''}" data-phase="${i}" title="Go to ${labels[i]}">${labels[i]}</button>`
        ).join('');
        if (this.arcHintEl) {
            this.arcHintEl.textContent = `${labels.join(' → ')}. Each line enters "from" a phase and stays; the fade-out drops the dense layers and ends on the drone bed.`;
        }
        this._livePhase = null; // verse knoppen → laat de volgende tick de ring herplaatsen
        this.phaseBtnsEl.querySelectorAll('[data-phase]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const i = Number(btn.dataset.phase);
                // Toggle: nogmaals op de actieve fase = terug naar automatische opbouw.
                this.state.previewPhase = this.state.previewPhase === i ? null : i;
                this.syncPhaseButtons();
                this.callbacks.onChange();
                this.updateDebug();
                this.callbacks.ensurePlaying?.();
                // Close the enclosing offcanvas (if any) so the within-one-bar jump
                // plays out on the visuals instead of being hidden behind the panel.
                // Host-agnostic: a no-op on standalone pages with no offcanvas.
                const oc = btn.closest('.offcanvas');
                if (oc && window.bootstrap?.Offcanvas) {
                    window.bootstrap.Offcanvas.getOrCreateInstance(oc).hide();
                }
            });
        });
    }

    syncPhaseButtons() {
        if (!this.phaseBtnsEl) return;
        const p = this.state.previewPhase ?? null;
        this.phaseBtnsEl.querySelectorAll('[data-phase]').forEach((btn) => {
            btn.classList.toggle('is-active', Number(btn.dataset.phase) === p);
        });
        this.syncPhaseMarkers();
        this.syncPausedHint();
    }

    /**
     * Klik grijpt het roer: zodra je tijdens een lopende auto build-up op een fase
     * springt, is de automaat onderbroken. Toon een regel die dat zegt én hoe je
     * het roer teruggeeft (dezelfde fase nogmaals klikken). Alleen zichtbaar als
     * de auto build-up aan staat (anders is er niets om te hervatten).
     */
    syncPausedHint() {
        if (!this.phaseBtnsEl) return;
        if (!this.pausedNoteEl) {
            this.pausedNoteEl = document.createElement('p');
            this.pausedNoteEl.className = 'ls-arc-paused';
            this.pausedNoteEl.hidden = true;
            this.phaseBtnsEl.insertAdjacentElement('afterend', this.pausedNoteEl);
        }
        const tp = this.state.previewPhase;
        const arcOn = this.state.arc?.enabled !== false;
        const paused = tp != null && arcOn;
        if (paused) {
            const label = timelineLabelsFor(this.phaseLabels())[tp] ?? '';
            this.pausedNoteEl.textContent = `⏸ Build-up paused on ${label} — click that phase again to resume the automatic build-up.`;
            this.pausedNoteEl.hidden = false;
        } else {
            this.pausedNoteEl.hidden = true;
        }
    }

    /**
     * Live indicator: ring rond de nu-klinkende build-up-fase tijdens automatisch
     * afspelen (main.js voedt de fase-index uit de transport-klok). `null` = uit.
     * Alleen DOM aanraken bij een fase-wissel, niet elke animatieframe.
     */
    highlightLivePhase(idx) {
        if (!this.phaseBtnsEl) return;
        if (this._livePhase === idx) return;
        this._livePhase = idx;
        this.phaseBtnsEl.querySelectorAll('[data-phase]').forEach((btn) => {
            btn.classList.toggle('is-live', idx != null && Number(btn.dataset.phase) === idx);
        });
    }

    /**
     * Effectief getoonde aan/uit-staat van een lijn. Zonder fase-preview = de
     * handmatige `enabled`. Tijdens een fase-sprong telt een lijn alleen als
     * "aan" wanneer ze in die fase klinkt (enterAt ≤ drempel) — zo ziet een nog
     * niet ingestapte lijn er exact uit als een uitgevinkte: vinkje uit, "· off".
     */
    displayEnabled(line) {
        if (!line.enabled) return false;
        const tp = this.state.previewPhase;
        if (tp == null) return true;
        return clampPhase(line.enterAt ?? 0) <= previewThreshold(tp);
    }

    /**
     * Fase-preview: laat elke lijn de getoonde aan/uit-staat aannemen (vinkje +
     * dim + "· off"), zodat de gekozen fase leesbaar is via dezelfde taal als
     * een handmatig uitgezette lijn. Geen aparte markering.
     */
    syncPhaseMarkers() {
        if (!this.linesEl) return;
        this.state.lines.forEach((line, index) => {
            const el = this.linesEl.querySelector(`[data-line-id="${line.id}"]`);
            if (!el) return;
            const shown = this.displayEnabled(line);
            el.classList.toggle('is-enabled', shown);
            const cb = el.querySelector('[data-field="enabled"]');
            if (cb) cb.checked = shown;
            this.updateLineSummary(el, line, index);
        });
    }

    lineSummary(line, index) {
        const inst = getInstrument(line.instrumentId);
        const variants = line.variants || [0];
        const v = variants.length > 1 ? variants.join('→') : (variants[0] ?? 0);
        const on = this.displayEnabled(line) ? '' : ' · off';
        const enterAt = clampPhase(line.enterAt ?? 0);
        const arcEnabled = this.state.arc?.enabled !== false;
        const phase = arcEnabled && enterAt > 0 ? ` · from ${this.phaseLabels()[enterAt]}` : '';
        return `line ${index + 1} · ${inst.label} · v${v}${phase}${on}`;
    }

    syncArcControls() {
        const arc = this.state.arc || DEFAULT_ARC;
        const minutes = arc.minutes ?? DEFAULT_ARC.minutes;
        if (this.arcToggle) this.arcToggle.checked = arc.enabled !== false;
        if (this.arcMinutes) this.arcMinutes.value = String(minutes);
        if (this.arcMinutesValue) this.arcMinutesValue.textContent = String(minutes);
    }

    /**
     * "Off the path"-blok onder de build-up: een 'Following preset'-vinkje als
     * status én een melding + Reset-knop wanneer de progressie afwijkt van de
     * geladen preset. Dynamisch ingevoegd (de panel-markup staat 3× gedupliceerd,
     * dus niet in de markup zelf). Klank-keuzes blijven; alleen de progressie reset.
     */
    buildOffPathUI() {
        const anchor = this.root.querySelector('.ls-phases');
        if (!anchor || this.offPathEl) return;
        const wrap = document.createElement('div');
        wrap.className = 'ls-progression';
        wrap.innerHTML = `
            <label class="ls-follow">
                <input type="checkbox" data-field="follow-preset" checked>
                <span>Following preset</span>
            </label>
            <button type="button" class="ls-btn ls-btn--ghost ls-reset-prog" data-action="reset-progression" hidden>Reset progression</button>
            <p class="ls-offpath-note" hidden>Off the standard build-up progression — your sounds are kept.</p>
        `;
        anchor.insertAdjacentElement('afterend', wrap);
        this.offPathEl = wrap;
        this.followCb = wrap.querySelector('[data-field="follow-preset"]');
        this.resetProgBtn = wrap.querySelector('[data-action="reset-progression"]');
        this.offPathNote = wrap.querySelector('.ls-offpath-note');
        this.followCb.addEventListener('change', () => {
            // Re-checken = terug naar het standaardpad. Het pad verlaat je door te
            // editen, niet via dit vinkje — dus uitvinken zet enkel de status terug.
            if (this.followCb.checked) this.resetProgression();
            else this.syncOffPath();
        });
        this.resetProgBtn.addEventListener('click', () => this.resetProgression());
    }

    /** Toon of we nog op het standaardpad zitten (vinkje aan) of ervan af (melding + Reset). */
    syncOffPath() {
        if (!this.offPathEl || !this.baseline) return;
        const onPath = sameProgression(progressionSnapshot(this.state), this.baseline);
        if (this.followCb) this.followCb.checked = onPath;
        if (this.resetProgBtn) this.resetProgBtn.hidden = onPath;
        if (this.offPathNote) this.offPathNote.hidden = onPath;
    }

    /**
     * Zet enkel de progressie terug naar de baseline: arc, fase-set en per regel
     * de instap-fase + cycling (gematcht op id). Instrument, volume, effecten en
     * vaste variant blijven onaangeroerd. Door de gebruiker toegevoegde regels
     * blijven staan; verwijderde regels worden niet teruggehaald.
     */
    resetProgression() {
        if (!this.baseline) return;
        const base = this.baseline;
        this.state.arc = { enabled: base.arc.enabled, minutes: base.arc.minutes };
        this.state.phases = { labels: [...base.phases.labels], weights: [...base.phases.weights] };
        const baseById = new Map(base.lines.map((l) => [l.id, l]));
        this.state.lines.forEach((line) => {
            const b = baseById.get(line.id);
            if (!b) return;
            line.enterAt = b.enterAt;
            line.variants = [...b.variants];
            line.variantCycle = { cycles: b.hold };
        });
        this.state.previewPhase = null; // terug naar automatische opbouw
        this.syncArcControls();
        this.renderPhaseButtons();
        this.syncPhaseButtons();
        this.renderLines();
        this.updateDebug();
        this.callbacks.onChange();
    }

    getState() {
        return this.state;
    }

    setState(next) {
        // Master is een comfort-instelling van de gebruiker: behoud 'm bij een
        // scène-wissel die zelf geen master meegeeft.
        const prevMaster = this.state?.master;
        this.state = next;
        if (!this.state.arc) this.state.arc = { ...DEFAULT_ARC };
        if (this.state.master == null) this.state.master = prevMaster ?? DEFAULT_MASTER;
        // Nieuw standaardpad: dit is voortaan "de progressie" om naar terug te keren.
        this.baseline = progressionSnapshot(this.state);
        // Bij herladen/preset-wissel alles dicht — de gebruiker klapt zelf open wat hij nodig heeft.
        this.openLineIds = new Set();
        this.renderLines();
        this.updateDebug();
        this.syncArcControls();
        this.renderPhaseButtons();
        this.syncPhaseButtons();
        this.syncTransport();
        this.syncPresetButtons();
    }

    bindGlobal() {
        // Vaste presets: een handgekozen statische scène. Laden zet de auto
        // build-up uit en start NIET vanzelf — de gebruiker drukt zelf op Start.
        this.root.querySelectorAll('[data-preset]').forEach((btn) => {
            btn.addEventListener('click', () => {
                if (btn.disabled) return; // vergrendeld tijdens een lopende auto build-up
                const state = applyPreset(btn.getAttribute('data-preset'));
                if (state) {
                    if (!state.arc) state.arc = { ...DEFAULT_ARC };
                    state.arc.enabled = false;
                    this.setState(state);
                    this.callbacks.onChange();
                }
            });
        });

        if (this.cpmSlider) {
            this.cpmSlider.addEventListener('input', () => {
                this.state.cpm = Number(this.cpmSlider.value);
                if (this.cpmValue) this.cpmValue.textContent = String(this.state.cpm);
                this.callbacks.onChange();
                this.updateDebug();
            });
        }

        if (this.masterSlider) {
            this.masterSlider.addEventListener('input', () => {
                this.state.master = Number(this.masterSlider.value);
                if (this.masterValue) this.masterValue.textContent = this.masterSlider.value;
                // Master is een live mixer-greep: meteen toepassen, niet wachten op de maat.
                this.callbacks.onChange({ immediate: true });
                this.updateDebug();
            });
        }

        if (this.arcToggle) {
            this.arcToggle.addEventListener('change', () => {
                if (!this.state.arc) this.state.arc = { ...DEFAULT_ARC };
                this.state.arc.enabled = this.arcToggle.checked;
                this.renderLines();
                this.syncPresetButtons();
                this.syncPausedHint();
                this.callbacks.onChange();
                this.updateDebug();
            });
        }

        if (this.arcMinutes) {
            this.arcMinutes.addEventListener('input', () => {
                if (!this.state.arc) this.state.arc = { ...DEFAULT_ARC };
                this.state.arc.minutes = Number(this.arcMinutes.value);
                if (this.arcMinutesValue) this.arcMinutesValue.textContent = this.arcMinutes.value;
                this.callbacks.onChange();
                this.updateDebug();
            });
        }

        const addBtn = this.root.querySelector('#btn-add-line') || document.getElementById('btn-add-line');
        if (addBtn) {
            addBtn.addEventListener('click', () => {
                const line = createLine();
                this.state.lines.push(line);
                this.openLineIds.add(line.id);
                this.renderLines();
                this.callbacks.onChange();
                this.updateDebug();
            });
        }

    }

    updateDebug() {
        if (this.debugEl) {
            this.debugEl.textContent = compose(this.state);
        }
        this.syncOffPath();
    }

    renderLines() {
        if (!this.linesEl) return;
        this.linesEl.innerHTML = '';
        this.state.lines.forEach((line, index) => {
            this.linesEl.appendChild(this.buildLineEl(line, index));
        });
        this.syncPhaseMarkers();
    }

    buildLineEl(line, index) {
        const instrument = getInstrument(line.instrumentId);
        const isOpen = this.openLineIds.has(line.id);
        const collapseId = `line-collapse-${line.id}`;
        const shown = this.displayEnabled(line);
        const el = document.createElement('article');
        el.className = 'ls-line' + (shown ? ' is-enabled' : '');
        el.dataset.lineId = line.id;

        const effects = line.effects || [];
        while (effects.length < 2) {
            effects.push({ effectId: 'none', value: 0 });
        }

        el.innerHTML = `
            <div class="ls-line-header">
                <button type="button"
                    class="ls-line-toggle${isOpen ? '' : ' collapsed'}"
                    data-bs-toggle="collapse"
                    data-bs-target="#${collapseId}"
                    aria-expanded="${isOpen}"
                    aria-controls="${collapseId}">
                    <span class="ls-line-summary" data-field="summary">${this.lineSummary(line, index)}</span>
                </button>
                <label class="ls-line-enable" data-action="stop-prop">
                    <input type="checkbox" data-field="enabled" ${shown ? 'checked' : ''}>
                    <span>On</span>
                </label>
                <button type="button" class="ls-line-remove" data-action="remove" aria-label="Remove line">×</button>
            </div>
            <div class="collapse${isOpen ? ' show' : ''}" id="${collapseId}" data-line-collapse="${line.id}">
                <div class="ls-line-body">
                    <div class="ls-line-grid">
                        <label class="ls-field ls-field--full">
                            <span class="ls-label">Instrument</span>
                            <select data-field="instrument">${instrumentOptionsHtml(line.instrumentId)}</select>
                        </label>
                        <label class="ls-field ls-field--full">
                            <span class="ls-label">Volume</span>
                            <input type="range" data-field="volume" min="0" max="1" step="0.05" value="${line.volume}">
                            <output>${line.volume}</output>
                        </label>
                        ${(instrument.tags || []).includes('note') ? `
                        <label class="ls-field ls-field--full">
                            <span class="ls-label">Anchor (octave double)</span>
                            <select data-field="anchor">${this.anchorOptionsHtml(line.anchor)}</select>
                        </label>` : ''}
                    </div>
                    ${this.buildEffectSlotHtml(line, instrument, effects[0], 0)}
                    ${this.buildEffectSlotHtml(line, instrument, effects[1], 1)}
                    <div class="ls-variations">
                        <span class="ls-label">Variants — check to rotate</span>
                        <div class="ls-variant-btns" role="group" aria-label="Sound variants">
                            ${Array.from({ length: variantCount(instrument) }, (_, i) => this.variantToggleHtml(line, i)).join('')}
                        </div>
                        <div class="ls-variant-cycle">
                            <label class="ls-field ls-field--inline ls-hold-field"${(line.variants?.length > 1) ? '' : ' hidden'}>
                                <span class="ls-label">hold</span>
                                <input type="number" data-field="cycle-hold" min="1" max="16" step="1" value="${clampHold(line.variantCycle?.cycles)}">
                            </label>
                            <button type="button" class="ls-btn ls-btn--play ls-line-play" data-action="oneshot-line" title="Play this line once">▶ line</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        this.bindLine(el, line, index);
        return el;
    }

    updateLineSummary(el, line, index) {
        const summary = el.querySelector('[data-field="summary"]');
        if (summary) summary.textContent = this.lineSummary(line, index);
    }

    anchorOptionsHtml(anchor) {
        const cur = anchor && anchor.enabled ? (anchor.octaves || 1) : 0;
        return [[0, 'off'], [1, '+1 oct'], [2, '+2 oct']]
            .map(([v, label]) => `<option value="${v}"${v === cur ? ' selected' : ''}>${label}</option>`)
            .join('');
    }

    /**
     * Eén variant-vakje. Aangevinkt = in de rotatie; bij 2+ toont een klein
     * volgnummer de plek in de klik-volgorde. Eén aangevinkt = de vaste klank.
     */
    variantToggleHtml(line, i) {
        const variants = line.variants || [];
        const pos = variants.indexOf(i);
        const checked = pos >= 0;
        const order = checked && variants.length > 1 ? `<sup class="ls-variant-order">${pos + 1}</sup>` : '';
        return `<button type="button" class="ls-btn ls-btn--variant${checked ? ' is-checked' : ''}" data-action="variant-toggle" data-variant="${i}" aria-pressed="${checked}" title="Variant ${i} — check to add to the rotation">${i}${order}</button>`;
    }

    /** Werk de vinkjes + volgnummers + de hold-zichtbaarheid in-place bij. */
    syncVariantArea(el, line) {
        const variants = line.variants || [];
        el.querySelectorAll('[data-action="variant-toggle"]').forEach((b) => {
            const i = Number(b.dataset.variant);
            const pos = variants.indexOf(i);
            const checked = pos >= 0;
            b.classList.toggle('is-checked', checked);
            b.setAttribute('aria-pressed', String(checked));
            let sup = b.querySelector('.ls-variant-order');
            if (checked && variants.length > 1) {
                if (!sup) { sup = document.createElement('sup'); sup.className = 'ls-variant-order'; b.appendChild(sup); }
                sup.textContent = String(pos + 1);
            } else if (sup) {
                sup.remove();
            }
        });
        const holdField = el.querySelector('.ls-hold-field');
        if (holdField) holdField.hidden = variants.length < 2;
    }

    /** Live: licht de nu-klinkende variant op bij cycling-regels (klok = getTime, cycli). */
    highlightCyclingVariants(cycle) {
        if (!this.linesEl) return;
        this.state.lines.forEach((line) => {
            const el = this.linesEl.querySelector(`[data-line-id="${line.id}"]`);
            if (!el) return;
            const btns = el.querySelectorAll('[data-action="variant-toggle"]');
            if (!(Array.isArray(line.variants) && line.variants.length > 1)) {
                btns.forEach((b) => b.classList.remove('is-live'));
                return;
            }
            const active = activeVariantAt(line, cycle);
            btns.forEach((b) => b.classList.toggle('is-live', Number(b.dataset.variant) === active));
        });
    }

    clearLiveHighlights() {
        this.highlightLivePhase(null); // ook de live fase-ring doven bij stop
        if (!this.linesEl) return;
        this.linesEl.querySelectorAll('.ls-btn--variant.is-live').forEach((b) => b.classList.remove('is-live'));
    }

    buildEffectSlotHtml(line, instrument, slot, slotIndex) {
        const fx = getEffect(slot.effectId);
        const canOneShot = fx.oneShot && fx.id !== 'none';
        const canMod = fx.id !== 'none' && fx.valueType !== 'none' && !['slow', 'fast'].includes(fx.id);
        const modOn = !!(slot.mod && slot.mod.enabled);
        const valueInput = this.buildValueInput(fx, slot, slotIndex);

        const modToggle = canMod
            ? `<button type="button" class="ls-btn ls-btn--mod${modOn ? ' is-active' : ''}" data-action="toggle-mod" title="${modOn ? 'Wave modulation on' : 'Drive this with a wave'}" aria-label="${modOn ? 'Wave modulation on' : 'Drive this with a wave'}"><span class="material-symbols-outlined ls-icon" aria-hidden="true">airwave</span></button>`
            : '<span class="ls-effect-spacer" aria-hidden="true"></span>';

        return `
            <div class="ls-effect-row" data-slot="${slotIndex}">
                <label class="ls-field">
                    <span class="ls-label">Effect ${slotIndex + 1}</span>
                    <select data-field="effect-id">${effectOptionsHtml(instrument, slot.effectId)}</select>
                </label>
                ${valueInput}
                <div class="ls-effect-actions">
                    ${modToggle}
                    ${canOneShot ? `<button type="button" class="ls-btn ls-btn--play ls-btn--oneshot" data-action="oneshot-effect" data-effect-id="${fx.id}" title="Play effect once">▶</button>` : '<span class="ls-effect-spacer" aria-hidden="true"></span>'}
                </div>
            </div>
            ${modOn ? this.buildModPanel(slot, slotIndex) : ''}
        `;
    }

    buildModPanel(slot, slotIndex) {
        const mod = slot.mod || {};
        const fx = getEffect(slot.effectId);
        const names = waveNames() || FALLBACK_WAVES;
        const opts = names.map((n) => `<option value="${n}"${n === mod.wave ? ' selected' : ''}>${n}</option>`).join('');
        const warn = isWavesAvailable() ? '' : '<p class="ls-mod-warn">p5.waves not loaded — using static value.</p>';
        return `
            <div class="ls-mod" data-slot-mod="${slotIndex}">
                <label class="ls-field ls-field--full">
                    <span class="ls-label">Wave</span>
                    <select data-field="mod-wave">${opts}</select>
                </label>
                <div class="ls-mod-row">
                    <label class="ls-field"><span class="ls-label">Min</span>
                        <input type="range" data-field="mod-min" min="0" max="1" step="0.01" value="${valueToNorm(fx, mod.min).toFixed(3)}">
                        <output data-field="mod-min-out">${formatEffectDisplay(fx, mod.min)}</output></label>
                    <label class="ls-field"><span class="ls-label">Max</span>
                        <input type="range" data-field="mod-max" min="0" max="1" step="0.01" value="${valueToNorm(fx, mod.max).toFixed(3)}">
                        <output data-field="mod-max-out">${formatEffectDisplay(fx, mod.max)}</output></label>
                    <label class="ls-field"><span class="ls-label">Cycles</span>
                        <input type="number" data-field="mod-cycles" min="1" max="64" step="1" value="${mod.cycles}"></label>
                </div>
                ${warn}
            </div>
        `;
    }

    buildValueInput(fx, slot, slotIndex) {
        if (!fx || fx.id === 'none' || fx.valueType === 'none') {
            return '<label class="ls-field"><span class="ls-label">Value</span><input type="text" disabled value="—"></label>';
        }
        // Genormaliseerde 0–1 regelaar; echte waarde (Hz enz.) als hint ernaast.
        const pos = valueToNorm(fx, slot.value);
        return `
            <label class="ls-field">
                <span class="ls-label">Value</span>
                <input type="range" data-field="effect-value" min="0" max="1" step="0.01" value="${pos.toFixed(3)}">
                <output data-field="effect-value-out">${formatEffectDisplay(fx, slot.value)}</output>
            </label>
        `;
    }

    bindLine(el, line, lineIndex) {
        const notify = () => {
            this.callbacks.onChange();
            this.updateDebug();
        };

        const collapseEl = el.querySelector('[data-line-collapse]');
        if (collapseEl) {
            collapseEl.addEventListener('shown.bs.collapse', () => {
                this.openLineIds.add(line.id);
                const toggle = el.querySelector('.ls-line-toggle');
                if (toggle) {
                    toggle.classList.remove('collapsed');
                    toggle.setAttribute('aria-expanded', 'true');
                }
            });
            collapseEl.addEventListener('hidden.bs.collapse', () => {
                this.openLineIds.delete(line.id);
                const toggle = el.querySelector('.ls-line-toggle');
                if (toggle) {
                    toggle.classList.add('collapsed');
                    toggle.setAttribute('aria-expanded', 'false');
                }
            });
        }

        el.querySelectorAll('[data-action="stop-prop"]').forEach((node) => {
            node.addEventListener('click', (e) => e.stopPropagation());
        });

        el.querySelector('[data-field="enabled"]').addEventListener('change', (e) => {
            line.enabled = e.target.checked;
            el.classList.toggle('is-enabled', this.displayEnabled(line));
            this.updateLineSummary(el, line, lineIndex);
            // Aan/uit raakt het open/dicht-zijn niet: de balk bestuurt dat zelf.
            notify();
        });

        el.querySelector('[data-field="instrument"]').addEventListener('change', (e) => {
            line.instrumentId = e.target.value;
            const inst = getInstrument(line.instrumentId);
            line.volume = inst.defaultVolume ?? line.volume;
            line.variants = [0]; // ander instrument → terug naar de eerste variant
            const wasOpen = this.openLineIds.has(line.id);
            this.renderLines();
            if (wasOpen) this.openLineIds.add(line.id);
            notify();
        });

        el.querySelectorAll('[data-action="variant-toggle"]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const i = Number(btn.dataset.variant);
                if (!Array.isArray(line.variants)) line.variants = [];
                const pos = line.variants.indexOf(i);
                if (pos >= 0) {
                    // Uitvinken, maar minstens één variant blijft staan.
                    if (line.variants.length > 1) line.variants.splice(pos, 1);
                } else {
                    line.variants.push(i); // aangevinkt → achteraan = klik-volgorde
                    this.callbacks.onVariant(line, i); // speel de zojuist aangevinkte even voor
                }
                this.syncVariantArea(el, line);
                this.updateLineSummary(el, line, lineIndex);
                notify();
            });
        });

        el.querySelector('[data-field="anchor"]')?.addEventListener('change', (e) => {
            const v = Number(e.target.value);
            if (!line.anchor) line.anchor = { enabled: false, octaves: 1 };
            line.anchor.enabled = v > 0;
            if (v > 0) line.anchor.octaves = v;
            notify();
        });

        el.querySelector('[data-field="cycle-hold"]')?.addEventListener('input', (e) => {
            if (!line.variantCycle) line.variantCycle = {};
            line.variantCycle.cycles = clampHold(e.target.value);
            notify();
        });

        const vol = el.querySelector('[data-field="volume"]');
        const volOut = vol?.nextElementSibling;
        vol?.addEventListener('input', () => {
            line.volume = Number(vol.value);
            if (volOut) volOut.textContent = vol.value;
            notify();
        });

        el.querySelectorAll('[data-slot]').forEach((slotEl) => {
            const idx = Number(slotEl.dataset.slot);
            if (!line.effects[idx]) {
                line.effects[idx] = { effectId: 'none', value: 0 };
            }

            slotEl.querySelector('[data-field="effect-id"]')?.addEventListener('change', (e) => {
                const fx = getEffect(e.target.value);
                line.effects[idx].effectId = e.target.value;
                line.effects[idx].value = fx.defaultValue ?? 0;
                delete line.effects[idx].mod; // mod-bereik hoort bij het oude effect
                this.renderLines();
                notify();
            });

            slotEl.querySelector('[data-field="effect-value"]')?.addEventListener('input', (e) => {
                const fx = getEffect(line.effects[idx].effectId);
                const real = roundEffectValue(fx, normToValue(fx, e.target.value));
                line.effects[idx].value = real;
                const out = slotEl.querySelector('[data-field="effect-value-out"]');
                if (out) out.textContent = formatEffectDisplay(fx, real);
                notify();
            });

            // Golf-modulatie aan/uit voor dit slot.
            slotEl.querySelector('[data-action="toggle-mod"]')?.addEventListener('click', () => {
                const slot = line.effects[idx];
                const fx = getEffect(slot.effectId);
                if (!slot.mod) {
                    slot.mod = {
                        enabled: false,
                        wave: 'classic sine',
                        min: Number.isFinite(fx.min) ? fx.min : 0,
                        max: Number.isFinite(fx.max) ? fx.max : 1,
                        cycles: 16
                    };
                }
                slot.mod.enabled = !slot.mod.enabled;
                this.renderLines();
                notify();
            });

            // Mod-paneel is een sibling van de rij → op regelniveau zoeken.
            const modPanel = el.querySelector(`[data-slot-mod="${idx}"]`);
            if (modPanel) {
                modPanel.querySelector('[data-field="mod-wave"]')?.addEventListener('change', (e) => {
                    line.effects[idx].mod.wave = e.target.value;
                    notify();
                });
                modPanel.querySelector('[data-field="mod-min"]')?.addEventListener('input', (e) => {
                    const fx = getEffect(line.effects[idx].effectId);
                    const real = roundEffectValue(fx, normToValue(fx, e.target.value));
                    line.effects[idx].mod.min = real;
                    const out = modPanel.querySelector('[data-field="mod-min-out"]');
                    if (out) out.textContent = formatEffectDisplay(fx, real);
                    notify();
                });
                modPanel.querySelector('[data-field="mod-max"]')?.addEventListener('input', (e) => {
                    const fx = getEffect(line.effects[idx].effectId);
                    const real = roundEffectValue(fx, normToValue(fx, e.target.value));
                    line.effects[idx].mod.max = real;
                    const out = modPanel.querySelector('[data-field="mod-max-out"]');
                    if (out) out.textContent = formatEffectDisplay(fx, real);
                    notify();
                });
                modPanel.querySelector('[data-field="mod-cycles"]')?.addEventListener('input', (e) => {
                    line.effects[idx].mod.cycles = Number(e.target.value);
                    notify();
                });
            }

            slotEl.querySelector('[data-action="oneshot-effect"]')?.addEventListener('click', () => {
                const effectId = slotEl.querySelector('[data-action="oneshot-effect"]').dataset.effectId;
                this.callbacks.onOneShotEffect(line, effectId);
            });
        });

        el.querySelector('[data-action="oneshot-line"]')?.addEventListener('click', () => {
            this.callbacks.onOneShotLine(line);
        });

        el.querySelector('[data-action="remove"]')?.addEventListener('click', (e) => {
            e.stopPropagation();
            if (this.state.lines.length <= 1) return;
            this.openLineIds.delete(line.id);
            this.state.lines = this.state.lines.filter((l) => l.id !== line.id);
            this.renderLines();
            notify();
        });
    }
}
