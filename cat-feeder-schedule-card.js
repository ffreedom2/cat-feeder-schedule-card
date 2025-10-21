/* Cat Feeder Schedule Card — Mealplan-style v0.2.0
   Aqara ZNCWWSQ01LM via Zigbee2MQTT
   Goals:
   - Looks & flow similar to https://github.com/FredrikM97/mealplan-card
   - Minimal config: mqtt_topic (required), schedule_entity (optional), schedule_key (default 'schedule')
   - Loads schedule on init (if schedule_entity provided)
   - Converts local time -> UTC before publishing; converts UTC -> local when loading (config flags)
*/
(function(){
  const DAY_PATTERNS = ["everyday","workdays","weekend","mon","tue","wed","thu","fri","sat","sun","mon-wed-fri-sun","tue-thu-sat"];
  const DAYS = ["mon","tue","wed","thu","fri","sat","sun"];

  const DEFAULTS = {
    title: 'Cat Feeder Schedule',
    mqtt_topic: '',
    schedule_entity: '',
    schedule_key: 'schedule',
    convert_times_to_utc: true,   // when publishing
    schedule_times_are_utc: true, // interpret loaded schedule as UTC -> convert to local for display
    default_size: 1,
  };

  function clampInt(v, min, max){ v=Math.round(Number(v)); if(!Number.isFinite(v)) v=min; return Math.max(min, Math.min(max, v)); }
  function sanitizePattern(p){ p=String(p||'workdays').toLowerCase(); return DAY_PATTERNS.includes(p)?p:'workdays'; }

  // Convert {hour,minute} in LOCAL to UTC hour/minute, using browser TZ
  function localHMtoUTC({hour, minute}){
    const d = new Date();
    d.setHours(hour, minute, 0, 0);
    return { hour: d.getUTCHours(), minute: d.getUTCMinutes() };
  }
  // Convert {hour,minute} in UTC to LOCAL hour/minute
  function utcHMtoLocal({hour, minute}){
    const d = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate(), hour, minute, 0, 0));
    return { hour: d.getHours(), minute: d.getMinutes() };
  }

  function expandPattern(pattern){
    const p = String(pattern||'workdays').toLowerCase();
    switch(p){
      case 'everyday': return DAYS;
      case 'workdays': return ['mon','tue','wed','thu','fri'];
      case 'weekend': return ['sat','sun'];
      case 'mon-wed-fri-sun': return ['mon','wed','fri','sun'];
      case 'tue-thu-sat': return ['tue','thu','sat'];
      default: return DAYS.includes(p) ? [p] : ['mon','tue','wed','thu','fri'];
    }
  }

  class MealplanStyleFeederCard extends HTMLElement {
    static getStubConfig(){ return { ...DEFAULTS, title: 'Cat Feeder (Mealplan)' }; }

    setConfig(config){
      this._config = Object.assign({}, DEFAULTS, config||{});
      if(!this._config.mqtt_topic) throw new Error("'mqtt_topic' is required");
      this._state = {
        rows: [],
        loading: false,
        saving: false,
        msg: null,
        err: null,
        loadedOnce: false,
      };
      if(this._root) this._render();
    }

    set hass(hass){
      this._hass = hass;
      if(!this._root){
        this._root = this.attachShadow({mode:'open'});
        this._injectStyles();
        this._render();
        // auto-load on first attach if entity provided
        if(this._config.schedule_entity) this._loadCurrent(true);
      }
    }

    getCardSize(){ return 8; }

    // ---------- Styles (Mealplan-ish) ----------
    _injectStyles(){
      const style = document.createElement('style');
      style.textContent = `
        :host{ display:block; }
        .card{ padding:16px; }
        .header{ display:flex; align-items:center; justify-content:space-between; gap:12px; }
        .title{ margin:0; font: 600 20px/1.2 system-ui, -apple-system, Segoe UI, Roboto, Arial; }
        .sub{ color: var(--secondary-text-color); font-size:.9rem; }
        .pill{ border:1px solid var(--divider-color); border-radius:999px; padding:4px 10px; }
        .toolbar{ display:flex; gap:8px; align-items:center; }
        .rows{ display:flex; flex-direction:column; gap:12px; margin-top:12px; }
        .row{ border:1px solid var(--divider-color); border-radius:12px; padding:12px; display:grid; grid-template-columns: 1.1fr 0.7fr 0.6fr auto; gap:10px; align-items:center; }
        .row select, .row input{ width:100%; padding:8px 10px; border-radius:10px; border:1px solid var(--divider-color); background: var(--card-background-color); }
        .row .remove{ justify-self:end; }
        .actions{ display:flex; gap:8px; justify-content:flex-end; margin-top:10px; }
        .btn{ border:none; border-radius:10px; padding:8px 12px; cursor:pointer; font:inherit; }
        .btn.primary{ background: var(--primary-color); color:#fff; }
        .btn.ghost{ background: transparent; color: var(--primary-color); border:1px solid var(--primary-color); }
        .btn.secondary{ background: var(--secondary-text-color); color: var(--primary-text-color); }
        .hint{ color: var(--secondary-text-color); font-size:.9rem; }
        .list{ margin-top:4px; font-size:.95rem; }
        .list .chip{ display:inline-flex; align-items:center; gap:6px; padding:4px 8px; border-radius:999px; background: var(--ha-card-background, rgba(0,0,0,.04)); border:1px solid var(--divider-color); margin: 4px 6px 0 0; }
        .line{ height:1px; background: var(--divider-color); margin: 12px 0; }
        .message{ font-size:.9rem; }
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
      const hleft = document.createElement('div');
      const title = document.createElement('h1'); title.className='title'; title.textContent = this._config.title;
      const sub = document.createElement('div'); sub.className='sub'; sub.textContent = this._config.convert_times_to_utc ? 'Times are saved as UTC' : 'Times are saved as local';
      hleft.append(title, sub);
      const tools = document.createElement('div'); tools.className='toolbar';
      const loadBtn = this._btn('ghost', this._state.loading? 'Loading…':'Load current', ()=> this._loadCurrent());
      loadBtn.disabled = !this._config.schedule_entity || this._state.loading;
      const addBtn = this._btn('ghost','+ Add', ()=> this._addRow());
      const saveBtn = this._btn('primary', this._state.saving? 'Saving…':'Save', ()=> this._save());
      saveBtn.disabled = this._state.saving || this._state.rows.length===0;
      tools.append(loadBtn, addBtn, saveBtn);
      header.append(hleft, tools);
      wrap.appendChild(header);

      // Existing schedule (overview chips)
      const overview = document.createElement('div'); overview.className='list';
      if(!this._state.rows.length){
        overview.appendChild(this._el('div',{className:'hint'}, this._state.loadedOnce ? 'No schedule.' : 'Click "Load current" to fetch schedule, or add rows.'));
      } else {
        // group by pattern for quick glance
        const groups = {};
        this._state.rows.forEach(r=>{
          const key = r.pattern;
          if(!groups[key]) groups[key] = [];
          groups[key].push(r);
        });
        Object.keys(groups).forEach(p=>{
          const tag = document.createElement('div'); tag.className='chip';
          const label = p.toUpperCase();
          const times = groups[p].map(x=> `${String(x.hour).padStart(2,'0')}:${String(x.minute).padStart(2,'0')}×${x.size}`).join(', ');
          tag.textContent = `${label}: ${times}`;
          overview.appendChild(tag);
        });
      }
      wrap.appendChild(overview);

      wrap.appendChild(this._div('line'));

      // Rows editor
      const rowsWrap = document.createElement('div'); rowsWrap.className='rows';
      this._state.rows.forEach((row, idx)=> rowsWrap.appendChild(this._renderRow(row, idx)));
      wrap.appendChild(rowsWrap);

      // messages
      if (this._state.err) wrap.appendChild(this._el('div', {className:'message error'}, this._state.err));
      if (this._state.msg) wrap.appendChild(this._el('div', {className:'message ok'}, this._state.msg));

      card.appendChild(wrap);
      this._root.appendChild(card);
    }

    _renderRow(row, idx){
      const el = this._div('row');
      // pattern
      const sel = document.createElement('select');
      DAY_PATTERNS.forEach(p=>{ const o=document.createElement('option'); o.value=p; o.textContent=p.toUpperCase(); if(p===row.pattern) o.selected=true; sel.appendChild(o); });
      sel.addEventListener('change',(e)=> this._patchRow(idx, { pattern: e.target.value }));

      // time (HH:MM)
      const time = document.createElement('input'); time.type='time';
      const hh = String(row.hour).padStart(2,'0'); const mm = String(row.minute).padStart(2,'0');
      time.value = `${hh}:${mm}`;
      time.addEventListener('change',(e)=>{ const [H,M]=(e.target.value||'08:00').split(':').map(Number); this._patchRow(idx,{hour:clampInt(H,0,23),minute:clampInt(M,0,59)}); });

      // size
      const size = document.createElement('input'); size.type='number'; size.min='1'; size.max='20'; size.step='1'; size.value=String(row.size||1);
      size.addEventListener('change',(e)=> this._patchRow(idx, { size: clampInt(e.target.value,1,20) }));

      const remove = this._btn('secondary','Remove',()=> this._removeRow(idx)); remove.classList.add('remove');

      el.append(sel, time, size, remove);
      return el;
    }

    // ---------- Data ----------
    _normalizeRows(arr){
      if(!Array.isArray(arr)) return [];
      return arr.map(r=>({ pattern: sanitizePattern(r.days||r.pattern||'workdays'),
                           hour: clampInt(r.hour??8,0,23),
                           minute: clampInt(r.minute??0,0,59),
                           size: clampInt(r.size??this._config.default_size??1,1,20)}));
    }

    _patchRow(idx, patch){ const next=[...this._state.rows]; next[idx] = Object.assign({}, next[idx], patch); this._state.rows=next; this._msg(null); this._render(); }
    _addRow(){ this._state.rows=[...this._state.rows, { pattern:'workdays', hour:8, minute:0, size:this._config.default_size||1 }]; this._render(); }
    _removeRow(idx){ this._state.rows = this._state.rows.filter((_,i)=>i!==idx); this._render(); }

    async _loadCurrent(initial=false){
      if(!this._config.schedule_entity || !this._hass) return;
      try{
        this._state.loading=true; this._state.err=null; if(!initial) this._state.msg=null; this._render();
        const st = this._hass.states[this._config.schedule_entity];
        if(!st){ throw new Error(`Entity not found: ${this._config.schedule_entity}`); }
        // Prefer attribute key, fallback to entire state (JSON string)
        let raw = st.attributes?.[this._config.schedule_key];
        if(!raw){ raw = st.state; }
        let parsed;
        if(typeof raw === 'string'){
          try{ parsed = JSON.parse(raw); } catch{ parsed = {}; }
        } else { parsed = raw || {}; }
        let arr = parsed?.[this._config.schedule_key];
        if(!Array.isArray(arr)) arr = Array.isArray(parsed)? parsed : [];
        let rows = this._normalizeRows(arr);
        // If schedule is stored as UTC, convert to local for the editor
        if(this._config.schedule_times_are_utc){
          rows = rows.map(r=>{ const {hour,minute} = utcHMtoLocal({hour:r.hour, minute:r.minute}); return {...r, hour, minute}; });
        }
        this._state.rows = rows;
        this._state.loadedOnce = true;
        this._msg('Loaded current schedule.');
      }catch(e){ this._err(e.message||String(e)); }
      finally{ this._state.loading=false; this._render(); }
    }

    _buildPayload(){
      const key = this._config.schedule_key || 'schedule';
      if(!this._state.rows.length) throw new Error('No schedule rows');
      const rowsRaw = this._state.rows.map(r=>({ days: sanitizePattern(r.pattern),
                                                 hour: clampInt(r.hour,0,23),
                                                 minute: clampInt(r.minute,0,59),
                                                 size: clampInt(r.size,1,20)}));
      // Convert to UTC if configured
      const rows = this._config.convert_times_to_utc
        ? rowsRaw.map(r=>{ const hm = localHMtoUTC({hour:r.hour, minute:r.minute}); return {...r, hour: hm.hour, minute: hm.minute}; })
        : rowsRaw;
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
    _div(cls){ const d=document.createElement('div'); d.className=cls; return d; }
    _el(tag, props={}, text){ const el=document.createElement(tag); Object.assign(el, props); if(text!=null) el.textContent=text; return el; }
    _btn(kind, text, onClick){ const b=document.createElement('button'); b.className=`btn ${kind}`; b.textContent=text; b.addEventListener('click', onClick); return b; }
    _msg(s){ this._state.msg = s; this._state.err = null; }
    _err(s){ this._state.err = s; this._state.msg = null; }
  }

  customElements.define('cat-feeder-mealplan-card', MealplanStyleFeederCard);

  // Minimal editor to keep GUI flow simple
  class MealplanFeederEditor extends HTMLElement{
    setConfig(config){ this._config = Object.assign({}, DEFAULTS, config||{}); this._render(); }
    set hass(hass){ this._hass=hass; }
    _render(){
      if(!this.shadowRoot) this.attachShadow({mode:'open'});
      const c = this._config||{};
      this.shadowRoot.innerHTML = `
        <style>
          .wrap{ display:grid; grid-template-columns: 1fr 1fr; gap:12px; }
          label{ display:flex; flex-direction:column; gap:6px; font-size:.9rem; }
          input, select{ padding:8px 10px; border-radius:10px; border:1px solid var(--divider-color); background: var(--card-background-color); }
          .full{ grid-column: 1/-1; }
        </style>
        <div class="wrap">
          ${this._field('Title','title', c.title)}
          ${this._field('MQTT topic (required)','mqtt_topic', c.mqtt_topic, 'zigbee2mqtt/feeder/set', true)}
          ${this._field('Schedule entity (optional)','schedule_entity', c.schedule_entity, 'sensor.feeder_schedule')}
          ${this._field('Schedule key','schedule_key', c.schedule_key||'schedule')}
          <label>Convert times to UTC on save<select id="to_utc">
            <option value="true" ${c.convert_times_to_utc!==false?'selected':''}>Yes</option>
            <option value="false" ${c.convert_times_to_utc===false?'selected':''}>No</option>
          </select></label>
          <label>Loaded schedule times are UTC?<select id="is_utc">
            <option value="true" ${c.schedule_times_are_utc!==false?'selected':''}>Yes</option>
            <option value="false" ${c.schedule_times_are_utc===false?'selected':''}>No</option>
          </select></label>
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
      const cfg = {
        type: 'custom:cat-feeder-mealplan-card',
        title: v('title') || DEFAULTS.title,
        mqtt_topic: v('mqtt_topic'),
        schedule_entity: v('schedule_entity'),
        schedule_key: v('schedule_key') || 'schedule',
        convert_times_to_utc: (this.shadowRoot.getElementById('to_utc')||{value:'true'}).value==='true',
        schedule_times_are_utc: (this.shadowRoot.getElementById('is_utc')||{value:'true'}).value==='true',
      };
      return cfg;
    }
  }
  customElements.define('cat-feeder-mealplan-card-editor', MealplanFeederEditor);

  // Register for card picker
  window.customCards = window.customCards || [];
  window.customCards.push({ type: 'cat-feeder-mealplan-card', name: 'Cat Feeder (Mealplan-style)', description: 'Schedule editor styled like mealplan; UTC-aware.' });
})();
