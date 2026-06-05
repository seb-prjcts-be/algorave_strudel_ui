/**
 * DOM: regels renderen, events, debug-paneel.
 */
import { createLine, compose, applyScene, ARC_PHASES, PHASE_LABELS, DEFAULT_ARC, DEFAULT_MASTER, clampPhase } from './composer.js';
import { getInstrument, instrumentOptionsHtml } from './catalog/instruments.js';
import {
    getEffect,
    effectOptionsHtml,
    effectsForInstrument
} from './catalog/effects.js';
import { VARIANT_COUNT } from './catalog/variations.js';

export function createDefaultState() {
    return {
        cpm: 55,
        master: DEFAULT_MASTER,
        arc: { ...DEFAULT_ARC },
        lines: [
            createLine({ instrumentId: 'pink', volume: 0.2 }),
            createLine({ instrumentId: 'wind', volume: 0.28, effects: [{ effectId: 'room', value: 0.5 }, { effectId: 'lpf', value: 1000 }] })
        ]
    };
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
        this.openLineIds = new Set(this.state.lines.map((l) => l.id));
        this.bindGlobal();
        this.renderPhaseButtons();
        this.syncArcControls();
        this.syncPhaseButtons();
        this.renderLines();
        this.updateDebug();
    }

    renderPhaseButtons() {
        if (!this.phaseBtnsEl) return;
        this.phaseBtnsEl.innerHTML = Array.from({ length: ARC_PHASES }, (_, i) =>
            `<button type="button" class="ls-btn ls-btn--phase" data-phase="${i}" title="Jump to ${PHASE_LABELS[i]}">${PHASE_LABELS[i]}</button>`
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
        this.openLineIds = new Set(this.state.lines.map((l) => l.id));
        this.renderLines();
        this.updateDebug();
        this.syncArcControls();
        this.syncPhaseButtons();
        if (this.cpmSlider) {
            this.cpmSlider.value = String(this.state.cpm);
            if (this.cpmValue) this.cpmValue.textContent = String(this.state.cpm);
        }
        if (this.masterSlider) {
            this.masterSlider.value = String(this.state.master);
            if (this.masterValue) this.masterValue.textContent = String(this.state.master);
        }
    }

    bindGlobal() {
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
                this.callbacks.onChange();
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

        this.root.querySelectorAll('[data-scene]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const scene = applyScene(btn.getAttribute('data-scene'));
                if (scene) {
                    this.setState(scene);
                    this.callbacks.onChange();
                    this.callbacks.ensurePlaying?.();
                }
            });
        });
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

    buildEffectSlotHtml(line, instrument, slot, slotIndex) {
        const fx = getEffect(slot.effectId);
        const compat = effectsForInstrument(instrument);
        const canOneShot = fx.oneShot && fx.id !== 'none';
        const valueInput = this.buildValueInput(fx, slot, slotIndex);

        return `
            <div class="ls-effect-row" data-slot="${slotIndex}">
                <label class="ls-field">
                    <span class="ls-label">Effect ${slotIndex + 1}</span>
                    <select data-field="effect-id">${effectOptionsHtml(instrument, slot.effectId)}</select>
                </label>
                ${valueInput}
                ${canOneShot ? `<button type="button" class="ls-btn ls-btn--play ls-btn--oneshot" data-action="oneshot-effect" data-effect-id="${fx.id}" title="Play effect once">▶</button>` : '<span class="ls-effect-spacer" aria-hidden="true"></span>'}
            </div>
        `;
    }

    buildValueInput(fx, slot, slotIndex) {
        if (!fx || fx.id === 'none' || fx.valueType === 'none') {
            return '<label class="ls-field"><span class="ls-label">Value</span><input type="text" disabled value="—"></label>';
        }
        if (fx.valueType === 'slider') {
            return `
                <label class="ls-field">
                    <span class="ls-label">Value</span>
                    <input type="range" data-field="effect-value" min="${fx.min}" max="${fx.max}" step="${fx.step}" value="${slot.value}">
                </label>
            `;
        }
        return `
            <label class="ls-field">
                <span class="ls-label">Value</span>
                <input type="number" data-field="effect-value" min="${fx.min}" max="${fx.max}" step="${fx.step}" value="${slot.value}">
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
                this.renderLines();
                notify();
            });

            slotEl.querySelector('[data-field="effect-value"]')?.addEventListener('input', (e) => {
                line.effects[idx].value = Number(e.target.value);
                notify();
            });

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
