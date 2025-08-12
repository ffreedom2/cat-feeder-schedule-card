/* Cat Feeder Schedule Card (no-build JS) — v0.1.3
   Fix: removed recursive getStubConfig causing "Maximum call stack size exceeded"
   Aqara ZNCWWSQ01LM (Pet Feeder C1) via Zigbee2MQTT
*/
(function(){
  const DAY_PATTERNS = ["everyday","workdays","weekend","mon","tue","wed","thu","fri","sat","sun","mon-wed-fri-sun","tue-thu-sat"];
  const DAYS = ["mon","tue","wed","thu","fri","sat","sun"];
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
  function boolish(v){
    if (typeof v === 'boolean') return v;
    const s = String(v).toLowerCase();
    return s==='true' || s==='on' || s==='1' || s==='error';
  }

  const DEFAULTS = {
    title: 'Cat Feeder Schedule',
    mqtt_topic: 'zigbee2mqtt/your_feeder/set',
    schedule_key: 'schedule',
    schedule_entity: '',
    status_entity: '',
    default_size: 1,
    show_serving_size: true,
    show_portion_weight: true,
    serving_size: null,
    portion_weight: null,
    manual_command_key: 'feed',
    mode: 'schedule',
    schedule: [],
  };

  class CatFeederScheduleCard extends HTMLElement {
    static getStubConfig(){ return { ...DEFAULTS }; }

    setConfig(config){
      this._config = Object.assign({}, DEFAULTS, config||{});
      if(!this._config.mqtt_topic) throw new Error("'mqtt_topic' is required");
      this._state = {
        rows: this._normalizeRows(this._config.schedule),
        publishing: false,
        info: null,
        errorMsg: null,
        mode: this._config.mode || 'schedule',
        serving_size: this._numOrNull(this._config.serving_size),
        portion_weight: this._numOrNull(this._config.portion_weight),
        manual_size: this._config.default_size || 1,
      };
      if (this._root) this._render();
    }
    set hass(hass){
      this._hass = hass;
      if(!this._root){ this._root = this.attachShadow({mode:'open'}); this._injectStyles(); this._render(); }
    }
    getCardSize(){ return 8; }

    // Helpers
    _numOrNull(v){ const n = Number(v); return Number.isFinite(n)?n:null; }
    _clampInt(v,min,max){ v=Math.round(Number(v)); if(!Number.isFinite(v)) v=min; return Math.max(min, Math.min(max, v)); }
    _sanitizePattern(p){ p=String(p||'workdays').toLowerCase(); return DAY_PATTERNS.includes(p)?p:'workdays'; }
    _normalizeRows(arr){
      if(!Array.isArray(arr)) return [];
      return arr.map(r=>({ pattern: this._sanitizePattern(r.days||r.pattern||'workdays'),
                           hour: this._clampInt(r.hour??8,0,23),
                           minute: this._clampInt(r.minute??0,0,59),
                           size: this._clampInt(r.size??this._config?.default_size??1,1,20)}));
    }

    _injectStyles(){
      const style = document.createElement('style');
      style.textContent = `
        :host{ display:block; }
        .card{ padding:16px; }
        .header{ display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:8px; }
        .title{ font-size:20px; font-weight:600; margin:0; }
        .header-right{ display:flex; gap:8px; align-items:center; }
        .pill{ padding:4px 10px; border-radius:999px; border:1px solid var(--divider-color); font-size:.85rem; }
        .status{ display:flex; align-items:center; gap:6px; }
        .status ha-icon{ --mdc-icon-size:20px; }
        .status.ok{ color: var(--success-color, #138000); }
        .status.err{ color: var(--error-color, #b00020); }
        .toggle{ display:flex; background: var(--card-background-color); border:1px solid var(--divider-color); border-radius:10px; overflow:hidden; }
        .toggle button{ border:none; background:transparent; padding:6px 10px; cursor:pointer; font:inherit; }
        .toggle button.active{ background: var(--primary-color); color:#fff; }
        .metrics{ display:grid; grid-template-columns: repeat(3, 1fr); gap:8px; margin:10px 0 6px; }
        .metric{ padding:10px; border-radius:10px; background: var(--ha-card-background, rgba(0,0,0,0.02)); border:1px solid var(--divider-color); text-align:center; }
        .metric .label{ font-size:.8rem; color: var(--secondary-text-color); }
        .metric .value{ font-weight:600; font-size:1.1rem; }
        .line{ height:1px; background: var(--divider-color); margin: 12px 0; }
        .actions{ display:flex; gap:8px; justify-content:flex-end; }
        .btn{ cursor:pointer; border:none; padding:8px 12px; border-radius:10px; background: var(--primary-color); color:#fff; font:inherit; }
        .btn.secondary{ background: var(--secondary-text-color); color: var(--primary-text-color); }
        .btn.ghost{ background: transparent; color: var(--primary-color); border:1px solid var(--primary-color); }
        .btn.danger{ background:#c62828; }
        .rows{ display:flex; flex-direction:column; gap:10px; }
        .row{ display:grid; grid-template-columns: 1.1fr 0.7fr 0.7fr 0.6fr auto; gap:10px; align-items:center; padding:10px; border:1px solid var(--divider-color); border-radius:12px; }
        .row label{ font-size:.8rem; color: var(--secondary-text-color); }
        select,input[type="number"],input[type="time"]{ width:100%; box-sizing:border-box; padding:8px 10px; border-radius:10px; border:1px solid var(--divider-color); background: var(--card-background-color); }
        .hint{ color: var(--secondary-text-color); font-size:.9rem; }
        .badges{ display:flex; gap:8px; align-items:center; margin: 8px 0; flex-wrap: wrap; }
        .message{ font-size:.9rem; }
        .error{ color:#b00020; }
        .success{ color: var(--success-color, #138000); }
        .manual{ display:grid; grid-template-columns: 1fr auto auto; gap:10px; align-items:end; }
        .manual .field{ display:flex; flex-direction:column; gap:6px; }
      `;
      this._root.appendChild(style);
    }

    _render(){
      if(!this._root) return;
      this._root.innerHTML='';
      const card = document.createElement('ha-card');
      const wrap = document.createElement('div'); wrap.className='card';

      // header
      const header = document.createElement('div'); header.className='header';
      const title = document.createElement('h1'); title.className='title'; title.textContent = this._config.title;
      const hr = document.createElement('div'); hr.className='header-right';

      const { errorFlag, servingSize, portionWeight } = this._readLiveState();
      const status = document.createElement('div'); status.className='status ' + (errorFlag? 'err':'ok');
      const icon = document.createElement('ha-icon'); icon.setAttribute('icon', errorFlag ? 'mdi:alert-circle' : 'mdi:check-circle');
      const stext = document.createElement('span'); stext.textContent = errorFlag ? 'Error' : 'OK';
      status.append(icon, stext);

      const toggle = document.createElement('div'); toggle.className='toggle';
      const b1 = document.createElement('button'); b1.textContent='Schedule'; if(this._state.mode==='schedule') b1.classList.add('active');
      b1.addEventListener('click', ()=>{ this._state.mode='schedule'; this._render(); });
      const b2 = document.createElement('button'); b2.textContent='Manual'; if(this._state.mode==='manual') b2.classList.add('active');
      b2.addEventListener('click', ()=>{ this._state.mode='manual'; this._render(); });
      toggle.append(b1,b2);

      hr.append(status, toggle);
      header.append(title, hr);
      wrap.appendChild(header);

      // metrics
      const { avgPortionsPerDay, avgWeightPerDay } = this._computeDailyTotals(servingSize, portionWeight);
      const metrics = document.createElement('div'); metrics.className='metrics';
      metrics.append(
        this._metric('Current serving size', servingSize ?? '—'),
        this._metric('Portions per day (avg)', Number.isFinite(avgPortionsPerDay)? avgPortionsPerDay.toFixed(1): '—'),
        this._metric('Weight per day (avg)', Number.isFinite(avgWeightPerDay)? `${avgWeightPerDay.toFixed(0)} g` : '—'),
      );
      wrap.appendChild(metrics);

      wrap.appendChild(this._div('line'));

      if(this._state.mode==='schedule'){
        const rowsWrap = document.createElement('div'); rowsWrap.className='rows';
        if(!this._state.rows.length){ rowsWrap.appendChild(this._el('div', {className:'hint'}, 'No schedule yet. Click “+ Add row”.')); }
        this._state.rows.forEach((row, idx)=> rowsWrap.appendChild(this._renderRow(row, idx)));
        wrap.appendChild(rowsWrap);

        const actions = this._div('actions');
        const btnPreview = this._btn('secondary','Preview JSON',()=>this._previewJson());
        const btnClear = this._btn('ghost','Clear All',()=>this._clearAll());
        const btnAdd = this._btn('ghost','+ Add row',()=>this._addRow());
        const btnPublish = this._btn('', this._state.publishing? 'Publishing…':'Publish', ()=>this._publish()); btnPublish.disabled = this._state.publishing;
        actions.append(btnPreview, btnClear, btnAdd, btnPublish);
        wrap.appendChild(actions);
      } else {
        const man = document.createElement('div'); man.className='manual';
        const f1 = document.createElement('div'); f1.className='field'; f1.append(this._el('span',{},'Manual size'));
        const i1 = document.createElement('input'); i1.type='number'; i1.min='1'; i1.max='20'; i1.step='1'; i1.value = String(this._state.manual_size||1);
        i1.addEventListener('change',(e)=>{ this._state.manual_size = this._clampInt(e.target.value,1,20); });
        f1.append(i1);
        const btnNow = this._btn('', 'Feed now', ()=>this._feedNow());
        const btnStop = this._btn('danger', 'Stop', ()=>this._stopNow());
        man.append(f1, btnNow, btnStop);
        wrap.appendChild(man);
      }

      const badges = this._div('badges');
      badges.appendChild(this._el('span', { className: 'hint' }, `Topic: ${this._config.mqtt_topic}`));
      badges.appendChild(this._el('span', { className: 'hint' }, `Key: ${this._config.schedule_key}`));
      if (this._config.schedule_entity) badges.appendChild(this._el('span', { className: 'pill' }, `Entity: ${this._config.schedule_entity}`));
      wrap.appendChild(badges);

      if (this._state.errorMsg) wrap.appendChild(this._el('div', {className:'message error'}, this._state.errorMsg));
      if (this._state.info) wrap.appendChild(this._el('div', {className:'message success'}, this._state.info));

      card.appendChild(wrap); this._root.appendChild(card);
    }

    _metric(label, value){
      const m = document.createElement('div'); m.className='metric';
      const l = document.createElement('div'); l.className='label'; l.textContent = label;
      const v = document.createElement('div'); v.className='value'; v.textContent = String(value);
      m.append(l,v); return m;
    }

    _renderRow(row, idx){
      const el = this._div('row');

      const sel = document.createElement('select'); DAY_PATTERNS.forEach(p=>{ const o=document.createElement('option'); o.value=p; o.textContent=p.toUpperCase(); if(p===row.pattern) o.selected=true; sel.appendChild(o); });
      sel.addEventListener('change',(e)=> this._updateRow(idx, { pattern: e.target.value }));

      const time = document.createElement('input'); time.type='time';
      const hh = String(row.hour).padStart(2,'0'); const mm = String(row.minute).padStart(2,'0');
      time.value = `${hh}:${mm}`;
      time.addEventListener('change',(e)=>{ const [H,M]=(e.target.value||'08:00').split(':').map(Number); this._updateRow(idx,{hour:this._clampInt(H,0,23),minute:this._clampInt(M,0,59)}); });

      const size = document.createElement('input'); size.type='number'; size.min='1'; size.max='20'; size.step='1'; size.value=String(row.size);
      size.addEventListener('change',(e)=> this._updateRow(idx, { size: this._clampInt(e.target.value,1,20) }));

      const remove = this._btn('danger','Remove',()=>this._removeRow(idx));

      el.append(sel, time, size, this._el('div',{},''), remove);
      return el;
    }

    // Data
    _readLiveState(){
      const stEntity = this._config.schedule_entity && this._hass?.states?.[this._config.schedule_entity];
      const statusEntity = this._config.status_entity && this._hass?.states?.[this._config.status_entity];

      let errorFlag = false;
      if(statusEntity){ errorFlag = boolish(statusEntity.state); }
      else if(stEntity){ const attrErr = stEntity.attributes?.error ?? stEntity.attributes?.fault ?? null; if(attrErr!=null) errorFlag = boolish(attrErr); }

      let servingSize = this._state.serving_size;
      let portionWeight = this._state.portion_weight;
      if(stEntity){
        if(!Number.isFinite(servingSize) && Number.isFinite(stEntity.attributes?.serving_size)) servingSize = Number(stEntity.attributes.serving_size);
        if(!Number.isFinite(portionWeight) && Number.isFinite(stEntity.attributes?.portion_weight)) portionWeight = Number(stEntity.attributes.portion_weight);
      }
      return { errorFlag, servingSize, portionWeight };
    }

    _computeDailyTotals(servingSize, portionWeight){
      try{
        const rows = this._state.rows;
        if(!rows.length) return { avgPortionsPerDay: NaN, avgWeightPerDay: NaN };
        const perDay = {mon:0,tue:0,wed:0,thu:0,fri:0,sat:0,sun:0};
        rows.forEach(r=>{ expandPattern(r.pattern).forEach(d=>{ perDay[d] += r.size; }); });
        const totalWeek = Object.values(perDay).reduce((a,b)=>a+b,0);
        const avgPortionsPerDay = totalWeek/7;
        const avgWeightPerDay = Number.isFinite(portionWeight) ? avgPortionsPerDay * portionWeight : NaN;
        return { avgPortionsPerDay, avgWeightPerDay };
      }catch(e){ return { avgPortionsPerDay: NaN, avgWeightPerDay: NaN }; }
    }

    // Actions
    _updateRow(idx, patch){ const rows=[...this._state.rows]; rows[idx] = Object.assign({}, rows[idx], patch); this._state.rows=rows; this._render(); }
    _addRow(){ const rows=[...this._state.rows, { pattern:'workdays', hour:8, minute:0, size:this._config.default_size||1 }]; this._state.rows=rows; this._render(); }
    _removeRow(idx){ this._state.rows = this._state.rows.filter((_,i)=>i!==idx); this._render(); }
    _clearAll(){ this._state.rows=[]; this._state.info=null; this._state.errorMsg=null; this._render(); }

    _buildPayload(){
      if(!this._state.rows.length) throw new Error('No schedule rows');
      const key = this._config.schedule_key || 'schedule';
      const rows = this._state.rows.map(r=>({ days:this._sanitizePattern(r.pattern), hour:this._clampInt(r.hour,0,23), minute:this._clampInt(r.minute,0,59), size:this._clampInt(r.size,1,20) }));
      const payload = { [key]: rows };
      if(Number.isFinite(this._state.serving_size)) payload.serving_size = this._clampInt(this._state.serving_size,1,10);
      if(Number.isFinite(this._state.portion_weight)) payload.portion_weight = this._clampInt(this._state.portion_weight,1,20);
      return payload;
    }

    _previewJson(){
      try{ const p=this._buildPayload(); this._state.info = 'Preview:\\n'+JSON.stringify(p,null,2); this._state.errorMsg=null; }
      catch(e){ this._state.errorMsg=String(e); this._state.info=null; }
      this._render();
    }
    async _publish(){
      if(!this._hass) return;
      try{
        this._state.publishing=true; this._state.errorMsg=null; this._state.info=null; this._render();
        const payload = this._buildPayload();
        await this._hass.callService('mqtt','publish',{ topic:this._config.mqtt_topic, payload: JSON.stringify(payload), qos:0, retain:false });
        this._state.info='Published successfully';
      }catch(e){ this._state.errorMsg = 'Publish failed: '+(e.message||e); }
      finally{ this._state.publishing=false; this._render(); }
    }
    async _feedNow(){
      if(!this._hass) return;
      const key = this._config.manual_command_key || 'feed';
      const size = this._clampInt(this._state.manual_size||1,1,20);
      try{
        this._state.publishing=true; this._state.errorMsg=null; this._state.info=null; this._render();
        await this._hass.callService('mqtt','publish',{ topic:this._config.mqtt_topic, payload: JSON.stringify({ [key]: size }), qos:0, retain:false });
        this._state.info = `Fed ${size} now`;
      }catch(e){ this._state.errorMsg = 'Manual feed failed: '+(e.message||e); }
      finally{ this._state.publishing=false; this._render(); }
    }
    async _stopNow(){
      if(!this._hass) return;
      try{
        this._state.publishing=true; this._state.errorMsg=null; this._state.info=null; this._render();
        await this._hass.callService('mqtt','publish',{ topic:this._config.mqtt_topic, payload: JSON.stringify({ stop: true }), qos:0, retain:false });
        this._state.info = 'Stop command sent';
      }catch(e){ this._state.errorMsg = 'Stop failed: '+(e.message||e); }
      finally{ this._state.publishing=false; this._render(); }
    }

    // DOM helpers
    _div(cls){ const d=document.createElement('div'); d.className=cls; return d; }
    _el(tag, props={}, text){ const el=document.createElement(tag); Object.assign(el, props); if(text!=null) el.textContent=text; return el; }
    _btn(kind, label, onClick){ const b=document.createElement('button'); b.className='btn'+(kind? ' '+kind:''); b.textContent=label; b.addEventListener('click', onClick); return b; }

    // Config editor support
    static getConfigElement(){ return document.createElement('cat-feeder-schedule-card-editor'); }
  }
  customElements.define('cat-feeder-schedule-card', CatFeederScheduleCard);

  // Simple Config Editor (guards added)
  class CatFeederScheduleCardEditor extends HTMLElement{
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
          ${this._field('MQTT topic','mqtt_topic', c.mqtt_topic, 'zigbee2mqtt/feeder/set', true)}
          ${this._field('Schedule key','schedule_key', c.schedule_key || 'schedule')}
          ${this._field('Manual command key','manual_command_key', c.manual_command_key || 'feed')}
          ${this._field('Schedule entity','schedule_entity', c.schedule_entity)}
          ${this._field('Status entity (optional)','status_entity', c.status_entity)}
          ${this._field('Default size','default_size', c.default_size ?? 1, '', false, 'number', {min:1,max:20})}
          ${this._field('Serving size (optional)','serving_size', c.serving_size ?? '', 'e.g., 3', false, 'number', {min:1,max:10})}
          ${this._field('Portion weight g (optional)','portion_weight', c.portion_weight ?? '', 'e.g., 5', false, 'number', {min:1,max:20})}
          <label>Show serving size<select id="showsize">
            <option value="true" ${c.show_serving_size!==false?'selected':''}>Yes</option>
            <option value="false" ${c.show_serving_size===false?'selected':''}>No</option>
          </select></label>
          <label>Show portion weight<select id="showpw">
            <option value="true" ${c.show_portion_weight!==false?'selected':''}>Yes</option>
            <option value="false" ${c.show_portion_weight===false?'selected':''}>No</option>
          </select></label>
        </div>
      `;
      const wrap = this.shadowRoot.querySelector('.wrap');
      if(!wrap) return;
      wrap.querySelectorAll('input').forEach((el)=> el.addEventListener('change', ()=> this._emit()));
      const ss = this.shadowRoot.getElementById('showsize'); if (ss) ss.addEventListener('change', ()=> this._emit());
      const spw = this.shadowRoot.getElementById('showpw'); if (spw) spw.addEventListener('change', ()=> this._emit());
    }
    _field(label,key,val,placeholder='',required=false,type='text',range){
      return `<label class="${key==='title'||key==='mqtt_topic'?'full':''}">${label}
        <input data-key="${key}" type="${type}" value="${val??''}" placeholder="${placeholder}" ${range?`min="${range.min}" max="${range.max}"`:''} ${required?'required':''}>
      </label>`;
    }
    _emit(){
      if(!this.shadowRoot) return;
      const cfg = {...(this._config||{})};
      this.shadowRoot.querySelectorAll('input').forEach((el)=>{
        const k = el.getAttribute('data-key');
        if(!k) return;
        let v = el.getAttribute('type')==='number' ? Number(el.value||0) : el.value;
        if(k==='serving_size' || k==='portion_weight'){ if(el.value==='') v = null; }
        cfg[k] = v;
      });
      const ss = this.shadowRoot.getElementById('showsize'); if (ss) cfg.show_serving_size = ss.value==='true';
      const spw = this.shadowRoot.getElementById('showpw'); if (spw) cfg.show_portion_weight = spw.value==='true';
      this._config = cfg;
      this.dispatchEvent(new CustomEvent('config-changed',{ detail: { config: cfg }, bubbles:true, composed:true }));
    }
  }
  customElements.define('cat-feeder-schedule-card-editor', CatFeederScheduleCardEditor);

  // Register card with HA for discovery
  window.customCards = window.customCards || [];
  window.customCards.push({ type: 'cat-feeder-schedule-card', name: 'Cat Feeder Schedule Card', description: 'Aqara Pet Feeder C1 schedule helper' });
})();
