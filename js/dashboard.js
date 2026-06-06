/**
 * DOM: regels renderen, events, debug-paneel.
 */
import { createLine, compose, applyPreset, activeVariantAt, ARC_PHASES, PHASE_LABELS, TIMELINE_LABELS, TIMELINE_PHASES, DEFAULT_ARC, DEFAULT_MASTER, clampPhase } from './composer.js?v=16';
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
import { VARIANT_COUNT } from './catalog/variations.js?v=14';
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
        this.state = createDefaultState();
        /** @type {Set<string>} open collapse panel ids per zin */
        this.openLineIds = new Set(this.state.lines.filter((l) => l.enabled).map((l) => l.id));
        this.bindGlobal();
        this.renderPhaseButtons();
        this.syncArcControls();
        this.syncPhaseButtons();
        this.syncTransport();
        this.renderLines();
        this.updateDebug();
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

    renderPhaseButtons() {
        if (!this.phaseBtnsEl) return;
        // Full timeline: 6 build-up phases + 2 mirrored fade-out phases (Drone ↓,
        // Air ↓). A fade button previews the thinned ending (its mirrored layer set).
        this.phaseBtnsEl.innerHTML = Array.from({ length: TIMELINE_PHASES }, (_, i) =>
            `<button type="button" class="ls-btn ls-btn--phase${i >= ARC_PHASES ? ' ls-btn--fade' : ''}" data-phase="${i}" title="Go to ${TIMELINE_LABELS[i]}">${TIMELINE_LABELS[i]}</button>`
        ).join('');
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
    }

    lineSummary(line, index) {
        const inst = getInstrument(line.instrumentId);
        const v = line.variantIndex ?? 0;
        const on = line.enabled ? '' : ' · off';
        const enterAt = clampPhase(line.enterAt ?? 0);
        const arcEnabled = this.state.arc?.enabled !== false;
        const phase = arcEnabled && enterAt > 0 ? ` · from ${PHASE_LABELS[enterAt]}` : '';
        return `line ${index + 1} · ${inst.label} · v${v}${phase}${on}`;
    }

    syncArcControls() {
        const arc = this.state.arc || DEFAULT_ARC;
        const minutes = arc.minutes ?? DEFAULT_ARC.minutes;
        if (this.arcToggle) this.arcToggle.checked = arc.enabled !== false;
        if (this.arcMinutes) this.arcMinutes.value = String(minutes);
        if (this.arcMinutesValue) this.arcMinutesValue.textContent = String(minutes);
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
        // Bij herladen opnieuw standaard alles openzetten (anders vallen collapse heads mismatch).
        this.openLineIds = new Set(this.state.lines.filter((l) => l.enabled).map((l) => l.id));
        this.renderLines();
        this.updateDebug();
        this.syncArcControls();
        this.syncPhaseButtons();
        this.syncTransport();
    }

    bindGlobal() {
        // Vaste presets: laden én starten.
        this.root.querySelectorAll('[data-preset]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const state = applyPreset(btn.getAttribute('data-preset'));
                if (state) {
                    this.setState(state);
                    this.callbacks.onChange();
                    this.callbacks.ensurePlaying?.();
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
    }

    renderLines() {
        if (!this.linesEl) return;
        this.linesEl.innerHTML = '';
        this.state.lines.forEach((line, index) => {
            this.linesEl.appendChild(this.buildLineEl(line, index));
        });
    }

    buildLineEl(line, index) {
        const instrument = getInstrument(line.instrumentId);
        const isOpen = this.openLineIds.has(line.id);
        const collapseId = `line-collapse-${line.id}`;
        const el = document.createElement('article');
        el.className = 'ls-line' + (line.enabled ? ' is-enabled' : '');
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
                    <input type="checkbox" data-field="enabled" ${line.enabled ? 'checked' : ''}>
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
                        <label class="ls-field ls-field--full">
                            <span class="ls-label">Enter at</span>
                            <select data-field="enter-at">${this.phaseOptionsHtml(line.enterAt ?? 0)}</select>
                        </label>
                        ${(instrument.tags || []).includes('note') ? `
                        <label class="ls-field ls-field--full">
                            <span class="ls-label">Anchor (octaaf-dubbel)</span>
                            <select data-field="anchor">${this.anchorOptionsHtml(line.anchor)}</select>
                        </label>` : ''}
                    </div>
                    ${this.buildEffectSlotHtml(line, instrument, effects[0], 0)}
                    ${this.buildEffectSlotHtml(line, instrument, effects[1], 1)}
                    <div class="ls-variations">
                        <span class="ls-label">Variants</span>
                        <div class="ls-variant-btns" role="group" aria-label="Sound variants 0 to 7">
                            ${Array.from({ length: VARIANT_COUNT }, (_, i) => {
                                const active = (line.variantIndex ?? 0) === i ? ' is-active' : '';
                                return `<button type="button" class="ls-btn ls-btn--variant${active}" data-action="variant" data-variant="${i}" title="Variant ${i} — preview and pick">${i}</button>`;
                            }).join('')}
                        </div>
                        <div class="ls-variant-cycle">
                            <label class="ls-field ls-field--inline">
                                <span class="ls-label">Cycle</span>
                                <select data-field="cycle-count">${this.cycleCountOptionsHtml(line.variantCycle)}</select>
                            </label>
                            <label class="ls-field ls-field--inline">
                                <span class="ls-label">hold</span>
                                <input type="number" data-field="cycle-hold" min="1" max="16" step="1" value="${line.variantCycle?.cycles ?? 4}">
                                <span class="ls-unit">cycli</span>
                            </label>
                        </div>
                    </div>
                    <div class="ls-line-actions">
                        <button type="button" class="ls-btn ls-btn--play" data-action="oneshot-line" title="Play this line once">▶ line</button>
                    </div>
                </div>
            </div>
        `;

        this.bindLine(el, line, index);
        return el;
    }

    phaseOptionsHtml(selected) {
        const sel = clampPhase(selected);
        return Array.from({ length: ARC_PHASES }, (_, i) => {
            const isSel = i === sel ? ' selected' : '';
            const label = i === 0 ? `1 · from start` : `${i + 1} · ${PHASE_LABELS[i]}`;
            return `<option value="${i}"${isSel}>${label}</option>`;
        }).join('');
    }

    updateLineSummary(el, line, index) {
        const summary = el.querySelector('[data-field="summary"]');
        if (summary) summary.textContent = this.lineSummary(line, index);
    }

    anchorOptionsHtml(anchor) {
        const cur = anchor && anchor.enabled ? (anchor.octaves || 1) : 0;
        return [[0, 'uit'], [1, '+1 oct'], [2, '+2 oct']]
            .map(([v, label]) => `<option value="${v}"${v === cur ? ' selected' : ''}>${label}</option>`)
            .join('');
    }

    cycleCountOptionsHtml(vc) {
        const cur = vc && vc.enabled ? (vc.count || 3) : 0;
        return [[0, 'uit'], [2, '2'], [3, '3'], [4, '4'], [6, '6'], [8, '8']]
            .map(([v, label]) => `<option value="${v}"${v === cur ? ' selected' : ''}>${label}</option>`)
            .join('');
    }

    /** Live: licht de nu-klinkende variant op bij cycling-regels (klok = getTime, cycli). */
    highlightCyclingVariants(cycle) {
        if (!this.linesEl) return;
        this.state.lines.forEach((line) => {
            const el = this.linesEl.querySelector(`[data-line-id="${line.id}"]`);
            if (!el) return;
            const btns = el.querySelectorAll('[data-action="variant"]');
            if (!(line.variantCycle && line.variantCycle.enabled)) {
                btns.forEach((b) => b.classList.remove('is-live'));
                return;
            }
            const active = activeVariantAt(line, cycle);
            btns.forEach((b) => b.classList.toggle('is-live', Number(b.dataset.variant) === active));
        });
    }

    clearLiveHighlights() {
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
            ? `<button type="button" class="ls-btn ls-btn--mod${modOn ? ' is-active' : ''}" data-action="toggle-mod" title="${modOn ? 'Wave modulation on' : 'Drive this with a wave'}">~</button>`
            : '<span class="ls-effect-spacer" aria-hidden="true"></span>';

        return `
            <div class="ls-effect-row" data-slot="${slotIndex}">
                <label class="ls-field">
                    <span class="ls-label">Effect ${slotIndex + 1}</span>
                    <select data-field="effect-id">${effectOptionsHtml(instrument, slot.effectId)}</select>
                </label>
                ${valueInput}
                ${modToggle}
                ${canOneShot ? `<button type="button" class="ls-btn ls-btn--play ls-btn--oneshot" data-action="oneshot-effect" data-effect-id="${fx.id}" title="Play effect once">▶</button>` : '<span class="ls-effect-spacer" aria-hidden="true"></span>'}
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
            el.classList.toggle('is-enabled', line.enabled);
            this.updateLineSummary(el, line, lineIndex);
            // Niet-gebruikte (uitgeschakelde) regels inklappen; ingeschakelde uitklappen.
            const collapseEl = el.querySelector('[data-line-collapse]');
            const Collapse = globalThis.bootstrap && globalThis.bootstrap.Collapse;
            if (collapseEl && Collapse) {
                const inst = Collapse.getOrCreateInstance(collapseEl, { toggle: false });
                if (line.enabled) inst.show(); else inst.hide();
            }
            notify();
        });

        el.querySelector('[data-field="instrument"]').addEventListener('change', (e) => {
            line.instrumentId = e.target.value;
            const inst = getInstrument(line.instrumentId);
            line.volume = inst.defaultVolume ?? line.volume;
            line.variantIndex = 0;
            const wasOpen = this.openLineIds.has(line.id);
            this.renderLines();
            if (wasOpen) this.openLineIds.add(line.id);
            notify();
        });

        el.querySelectorAll('[data-action="variant"]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const index = Number(btn.dataset.variant);
                line.variantIndex = index;
                el.querySelectorAll('[data-action="variant"]').forEach((b) => {
                    b.classList.toggle('is-active', Number(b.dataset.variant) === index);
                });
                this.updateLineSummary(el, line, lineIndex);
                this.callbacks.onVariant(line, index);
                notify();
            });
        });

        el.querySelector('[data-field="enter-at"]')?.addEventListener('change', (e) => {
            line.enterAt = clampPhase(e.target.value);
            this.updateLineSummary(el, line, lineIndex);
            notify();
        });

        el.querySelector('[data-field="anchor"]')?.addEventListener('change', (e) => {
            const v = Number(e.target.value);
            if (!line.anchor) line.anchor = { enabled: false, octaves: 1 };
            line.anchor.enabled = v > 0;
            if (v > 0) line.anchor.octaves = v;
            notify();
        });

        el.querySelector('[data-field="cycle-count"]')?.addEventListener('change', (e) => {
            const v = Number(e.target.value);
            if (!line.variantCycle) line.variantCycle = { enabled: false, count: 3, cycles: 4 };
            line.variantCycle.enabled = v >= 2;
            if (v >= 2) line.variantCycle.count = v;
            if (!line.variantCycle.enabled) {
                el.querySelectorAll('[data-action="variant"]').forEach((b) => b.classList.remove('is-live'));
            }
            notify();
        });

        el.querySelector('[data-field="cycle-hold"]')?.addEventListener('input', (e) => {
            if (!line.variantCycle) line.variantCycle = { enabled: false, count: 3, cycles: 4 };
            line.variantCycle.cycles = Math.max(1, Math.min(16, Number(e.target.value) || 4));
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
