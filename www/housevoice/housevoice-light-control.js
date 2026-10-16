class HouseVoiceLightControl extends HTMLElement {
  setConfig(config) {
    if (!config || !config.entity) throw new Error("housevoice-light-control requires an entity");
    this.config = config;
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = `
      <style>
        :host { display:block; height:70px; }
        ha-card { height:70px; box-sizing:border-box; padding:10px 14px; border-radius:16px;
          background:#081a2c; border:1px solid rgba(55,174,255,.42); color:#f4f7fa; }
        .wrap { height:100%; display:grid; grid-template-rows:24px 16px; gap:8px; }
        .top { display:flex; align-items:center; justify-content:space-between; min-width:0; }
        .name { font-size:16px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        button { border:0; background:transparent; color:#ffd27a; font:inherit; font-size:14px;
          font-weight:600; padding:4px 8px; min-height:32px; border-radius:8px; cursor:pointer; }
        button.off { color:#9fb3c7; } button:disabled { color:#718397; cursor:default; }
        input { width:100%; height:16px; margin:0; accent-color:#ffbd20; cursor:pointer; }
        input:disabled { opacity:.35; cursor:default; }
        .unavailable { color:#8295a8; }
      </style>
      <ha-card><div class="wrap"><div class="top"><span class="name"></span><button></button></div><input type="range" min="1" max="100" step="1" /></div></ha-card>`;
    this.nameEl = this.shadowRoot.querySelector('.name');
    this.button = this.shadowRoot.querySelector('button');
    this.slider = this.shadowRoot.querySelector('input');
    this.button.addEventListener('click', (e) => { e.stopPropagation(); if (!this._unavailable) this.hass.callService('light', 'toggle', { entity_id: this.config.entity }); });
    this.slider.addEventListener('input', (e) => { e.stopPropagation(); this._pending = Number(e.target.value); clearTimeout(this._timer); this._timer = setTimeout(() => { if (!this._unavailable) this.hass.callService('light', 'turn_on', { entity_id: this.config.entity, brightness_pct: this._pending }); }, 180); });
  }
  set hass(value) { this._hass = value; this.update(); }
  get hass() { return this._hass; }
  update() {
    const states = this._hass && this._hass.states;
    const entity = this.config && this.config.entity;
    const s = states && entity ? states[entity] : null;
    if (!s) return;
    this._unavailable = ['unavailable','unknown'].includes(s.state);
    const pct = s.attributes.brightness == null ? null : Math.round(Number(s.attributes.brightness) / 255 * 100);
    this.nameEl.textContent = this.config.name || s.attributes.friendly_name || this.config.entity;
    const stateText = s.state === 'on' ? 'On' : 'Off';
    const brightnessText = pct != null ? ' · ' + pct + '%' : '';
    this.button.textContent = this._unavailable ? 'Unavailable' : stateText + brightnessText;
    this.button.classList.toggle('off', s.state !== 'on'); this.button.disabled = this._unavailable;
    this.slider.value = String(pct == null ? 1 : pct);
    const colorModes = s.attributes.supported_color_modes || [];
    const supportsBrightness = colorModes.some(x => ['brightness','color_temp','hs','xy','rgb','rgbw','rgbww'].includes(x));
    this.slider.disabled = this._unavailable || !supportsBrightness;
  }
  getCardSize() { return 1; }
}
if (!customElements.get('housevoice-light-control')) {
  customElements.define('housevoice-light-control', HouseVoiceLightControl);
}
window.customCards = window.customCards || [];
window.customCards.push({ type:'housevoice-light-control', name:'HouseVoice Light Control', description:'Compact two-row light control' });
