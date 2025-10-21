/* Cat Feeder Mealplan-style — v0.2.3
   Changes requested:
   - Remove all UTC conversion (device now uses local time)
   - Remove subtitle ("Times are saved as UTC") and summary chips
   - Dropdown options no longer uppercased
   - Inputs styled to match Lovelace look & feel
*/
(function(){
  const DAY_PATTERNS = ["everyday","workdays","weekend","mon","tue","wed","thu","fri","sat","sun","mon-wed-fri-sun","tue-thu-sat"];
  const DEFAULTS = {
    title: 'Cat Feeder Schedule',
    mqtt_topic: '',
    schedule_entity: '',
    schedule_key: 'schedule',
    default_size: 1,
  };

  function clampInt(v, min, max){ v=Math.round(Number(v)); if(!Number.isFinite(v)) v=min; return Math.max(min, Math.min(max, v)); }
  function sanitizePattern(p){ p=String(p||'workdays').toLowerCase(); return DAY_PATTERNS.includes(p)?p:'workdays'; }

  function tryParseJSONish(input){
    if(typeof input!=='string') return null;
    try{ return JSON.parse(input); }catch{}
    let s = input.trim();
    if(!(s.startsWith('[') || s.startsWith('{'))) return null;
    s = s
      .replace(/'/g, '"')
      .replace(/\bNone\b/g, 'null')
      .replace(/\bTrue\b/g, 'true')
      .replace(/\bFalse\b/g, 'false');
    try{ return JSON.parse(s); }catch{ return null; }
  }

  class MealplanStyleFeederCard extends HTMLElement {
    static getStubConfig(){ return { ...DEFAULTS, title: 'Cat Feeder (Mealplan)' }; }

    setConfig(config){
      this._config = Object.assign({}, DEFAULTS, config||{});
      if(!this._config.mqtt_topic) throw new Error("'mqtt_topic' is required");
      this._state = {
        rows: [],
        saving: false,
        msg: null,
        err: null,
        loadedOnce: false,
      };
      this._lastEntityFingerprint = null;
      if(this._root) this._render();
    }

    set hass(hass){
      this._hass = hass;
      if(!this._root){
        this._root = this.attachShadow({mode:'open'});
        this._injectStyles();
        this._render();
      }
      this._maybeLoadFromEntity();
    }

    getCardSize(){ return 5; }

    // ---------- Styles (Lovelace-like) ----------
    _injectStyles(){
      const style = document.createElement('style');
      style.textContent = `
        :host{ display:block; }
        .card{ padding:16px; }
        .header{ display:flex; align-items:center; justify-content:space-between; gap:12px; }
        .title{ margin:0; font: 600 20px/1.2 system-ui, -apple-system, Segoe UI, Roboto, Arial; }
        .toolbar{ display:flex; gap:8px; align-items:center; }
        .rows{ display:flex; flex-direction:column; gap:12px; margin-top:12px; }
        .row{ border:1px solid var(--ha-card-border-color, var(--divider-color)); border-radius:12px; padding:12px; display:grid;
              grid-template-columns: 1.2fr 0.9fr 0.7fr auto; gap:10px; align-items:center; }
        select, input[type="number"], input[type="time"]{
          width:100%; padding:10px 12px; border-radius:8px;
          border:1px solid var(--ha-card-border-color, var(--divider-color));
          background: var(--card-background-color);
          color: var(--primary-text-color);
          box-sizing: border-box;
          font: inherit;
        }
        select:focus, input[type="number"]:focus, input[type="time"]:focus{
          outline: 2px solid var(--primary-color);
          border-color: var(--primary-color);
        }
        .btn{ border:none; border-radius:8px; padding:10px 12px; cursor:pointer; font:inherit; }
        .btn.primary{ background: var(--primary-color); color:#fff; }
        .btn.secondary{ background: var(--secondary-text-color); color: var(--card-background-color); }
        .btn:disabled{ opacity:.6; cursor: default; }
        .message{ font-size:.9rem; margin-top:8px; }
        .error{ color:#b00020; }
        .ok{ color: var(--success-color, #138000); }
      `;
      this._root.appendChild(style);
    }

    // ---------- Render ----------
    _render(){
      if(!this._root) return;
      this._root.innerHTML = '';
      const card = document.createElement('ha-card');
      const wrap = document.createElement('div'); wrap.className = 'card';

      // Header
      const header = document.createElement('div'); header.className='header';
      const title = document.createElement('h1'); title.className='title'; title.textContent = this._config.title;
      const tools = document.createElement('div'); tools.className='toolbar';
      const addBtn = this._btn('secondary','+ Add', ()=> this._addRow());
      const saveBtn = this._btn('primary', this._state.saving? 'Saving…':'Save', ()=> this._save());
      saveBtn.disabled = this._state.saving || this._state.rows.length===0;
      tools.append(addBtn, saveBtn);
      header.append(title, tools);
      wrap.appendChild(header);

      // Rows editor only (no summary or subtitle)
      const rowsWrap = document.createElement('div'); rowsWrap.className='rows';
      if(!this._state.rows.length){
        rowsWrap.appendChild(this._el('div',{className:'message'}, this._config.schedule_entity ? (this._state.loadedOnce?'No schedule yet.':'Loading…') : 'Add rows to create a schedule.'));
      }
      this._state.rows.forEach((row, idx)=> rowsWrap.appendChild(this._renderRow(row, idx)));
      wrap.appendChild(rowsWrap);

      // messages
      if (this._state.err) wrap.appendChild(this._el('div', {className:'message error'}, this._state.err));
      if (this._state.msg) wrap.appendChild(this._el('div', {className:'message ok'}, this._state.msg));

      card.appendChild(wrap);
      this._root.appendChild(card);
    }

    _renderRow(row, idx){
      const el = document.createElement('div'); el.className='row';
      // pattern
      const sel = document.createElement('select');
      DAY_PATTERNS.forEach(p=>{ const o=document.createElement('option'); o.value=p; o.textContent=p; if(p===row.pattern) o.selected=true; sel.appendChild(o); });
      sel.addEventListener('change',(e)=> this._patchRow(idx, { pattern: e.target.value }));

      // time (HH:MM)
      const time = document.createElement('input'); time.type='time';
      const hh = String(row.hour).padStart(2,'0'); const mm = String(row.minute).padStart(2,'0');
      time.value = `${hh}:${mm}`;
      time.addEventListener('change',(e)=>{ const [H,M]=(e.target.value||'08:00').split(':').map(Number); this._patchRow(idx,{hour:clampInt(H,0,23),minute:clampInt(M,0,59)}); });

      // size
      const size = document.createElement('input'); size.type='number'; size.min='1'; size.max='20'; size.step='1'; size.value=String(row.size||1);
      size.addEventListener('change',(e)=> this._patchRow(idx, { size: clampInt(e.target.value,1,20) }));

      const remove = this._btn('', 'Remove',()=> this._removeRow(idx)); remove.classList.add('remove');

      el.append(sel, time, size, remove);
      return el;
    }

    // ---------- Entity loading (local time only) ----------
    _maybeLoadFromEntity(){
      try{
        const ent = this._config.schedule_entity;
        if(!ent || !this._hass || !this._hass.states) return;
        const st = this._hass.states[ent];
        if(!st) return; // entity not ready yet
        const fingerprint = JSON.stringify({s: st.state, a: st.attributes});
        if (this._lastEntityFingerprint === fingerprint && this._state.loadedOnce) return; // no change
        // parse schedule
        const rows = this._parseScheduleFromState(st);
        if(rows){ this._state.rows = rows; this._state.loadedOnce = true; this._msg(null); this._render(); }
        this._lastEntityFingerprint = fingerprint;
      }catch(e){ /* swallow; avoid re-render loops */ }
    }

    _parseScheduleFromState(st){
      const key = this._config.schedule_key || 'schedule';
      let fromAttr = st?.attributes?.[key];
      if (Array.isArray(fromAttr)) {
        return this._postProcessRows(fromAttr);
      }
      // try JSON from state (may be single-quoted Python-ish)
      let parsed = tryParseJSONish(st.state);
      if(parsed && typeof parsed==='object'){
        let raw = parsed[key] ?? parsed;
        if (Array.isArray(raw)) return this._postProcessRows(raw);
      }
      if(typeof fromAttr === 'string'){
        parsed = tryParseJSONish(fromAttr);
        if(parsed && Array.isArray(parsed)) return this._postProcessRows(parsed);
        if(parsed && typeof parsed==='object' && Array.isArray(parsed[key])) return this._postProcessRows(parsed[key]);
      }
      return null;
    }

    _postProcessRows(arr){
      return arr.map(r=>({ pattern: sanitizePattern(r.days||r.pattern||'workdays'),
                           hour: clampInt(r.hour??8,0,23),
                           minute: clampInt(r.minute??0,0,59),
                           size: clampInt(r.size??this._config.default_size??1,1,20)}));
    }

    // ---------- Data ----------
    _patchRow(idx, patch){ const next=[...this._state.rows]; next[idx] = Object.assign({}, next[idx], patch); this._state.rows=next; this._msg(null); this._render(); }
    _addRow(){ this._state.rows=[...this._state.rows, { pattern:'workdays', hour:8, minute:0, size:this._config.default_size||1 }]; this._render(); }
    _removeRow(idx){ this._state.rows = this._state.rows.filter((_,i)=>i!==idx); this._render(); }

    _buildPayload(){
      const key = this._config.schedule_key || 'schedule';
      if(!this._state.rows.length) throw new Error('No schedule rows');
      const rows = this._state.rows.map(r=>({ days: sanitizePattern(r.pattern),
                                              hour: clampInt(r.hour,0,23),
                                              minute: clampInt(r.minute,0,59),
                                              size: clampInt(r.size,1,20)}));
      return { [key]: rows };
    }

    async _save(){
      if(!this._hass) return;
      try{
        this._state.saving=true; this._state.err=null; this._state.msg=null; this._render();
        const payload = this._buildPayload();
        await this._hass.callService('mqtt','publish',{
          topic: this._config.mqtt_topic,
          payload: JSON.stringify(payload), qos:0, retain:false
        });
        this._msg('Schedule saved.');
      }catch(e){ this._err(e.message||String(e)); }
      finally{ this._state.saving=false; this._render(); }
    }

    // ---------- UX helpers ----------
    _btn(kind, text, onClick){ const b=document.createElement('button'); b.className=`btn ${kind}`; b.textContent=text; b.addEventListener('click', onClick); return b; }
    _el(tag, props={}, text){ const el=document.createElement(tag); Object.assign(el, props); if(text!=null) el.textContent=text; return el; }
    _msg(s){ this._state.msg = s; this._state.err = null; }
    _err(s){ this._state.err = s; this._state.msg = null; }
  }

  customElements.define('cat-feeder-mealplan-card', MealplanStyleFeederCard);

  // Minimal editor
  class MealplanFeederEditor extends HTMLElement{
    setConfig(config){ this._config = Object.assign({}, DEFAULTS, config||{}); this._render(); }
    set hass(hass){ this._hass=hass; }
    _render(){
      if(!this.shadowRoot) this.attachShadow({mode:'open'});
      const c = this._config||{};
      this.shadowRoot.innerHTML = `
        <style>
          .wrap{ display:grid; grid-template-columns: 1.2fr 1fr; gap:12px; }
          label{ display:flex; flex-direction:column; gap:6px; font-size:.9rem; }
          input, select{ padding:10px 12px; border-radius:8px; border:1px solid var(--ha-card-border-color, var(--divider-color)); background: var(--card-background-color); }
          input:focus, select:focus{ outline: 2px solid var(--primary-color); border-color: var(--primary-color); }
          .full{ grid-column: 1/-1; }
        </style>
        <div class="wrap">
          ${this._field('Title','title', c.title)}
          ${this._field('MQTT topic (required)','mqtt_topic', c.mqtt_topic, 'zigbee2mqtt/feeder/set', true)}
          ${this._field('Schedule entity (optional)','schedule_entity', c.schedule_entity, 'sensor.feeder_schedule')}
          ${this._field('Schedule key','schedule_key', c.schedule_key||'schedule')}
        </div>
      `;
      const emit = () => this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: this._collect() }, bubbles:true, composed:true }));
      this.shadowRoot.querySelectorAll('input,select').forEach((el)=> el.addEventListener('change', emit));
    }
    _field(label,key,val,placeholder='',required=false){
      return `<label class="${key==='title'||key==='mqtt_topic'?'full':''}">${label}
        <input data-key="${key}" value="${val??''}" placeholder="${placeholder}" ${required?'required':''}>
      </label>`;
    }
    _collect(){
      const v = (key)=> (this.shadowRoot.querySelector(`input[data-key="${key}"]`)||{}).value || '';
      return {
        type: 'custom:cat-feeder-mealplan-card',
        title: v('title') || DEFAULTS.title,
        mqtt_topic: v('mqtt_topic'),
        schedule_entity: v('schedule_entity'),
        schedule_key: v('schedule_key') || 'schedule',
      };
    }
  }
  customElements.define('cat-feeder-mealplan-card-editor', MealplanFeederEditor);

  // Register for card picker
  window.customCards = window.customCards || [];
  window.customCards.push({ type: 'cat-feeder-mealplan-card', name: 'Cat Feeder (Mealplan-style)', description: 'Schedule editor styled like mealplan; local time only.' });
})();
