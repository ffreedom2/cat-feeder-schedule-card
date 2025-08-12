import { LitElement, html, nothing } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'
import { styles } from './styles'

const DAY_PATTERNS = [
  'everyday','workdays','weekend','mon','tue','wed','thu','fri','sat','sun','mon-wed-fri-sun','tue-thu-sat'
] as const
const DAYS = ['mon','tue','wed','thu','fri','sat','sun'] as const

function expandPattern(pattern: string){
  const p = String(pattern||'workdays').toLowerCase()
  switch(p){
    case 'everyday': return DAYS
    case 'workdays': return ['mon','tue','wed','thu','fri']
    case 'weekend': return ['sat','sun']
    case 'mon-wed-fri-sun': return ['mon','wed','fri','sun']
    case 'tue-thu-sat': return ['tue','thu','sat']
    default: return (DAYS as readonly string[]).includes(p) ? [p] : ['mon','tue','wed','thu','fri']
  }
}

function boolish(v: any){
  if (typeof v === 'boolean') return v
  const s = String(v).toLowerCase()
  return s==='true' || s==='on' || s==='1' || s==='error'
}

interface Row { pattern: string; hour: number; minute: number; size: number }

@customElement('cat-feeder-schedule-card')
export class CatFeederScheduleCard extends LitElement {
  static styles = styles

  @property({attribute: false}) hass: any

  @state() private config: any = {}
  @state() private rows: Row[] = []
  @state() private publishing = false
  @state() private info: string | null = null
  @state() private errorMsg: string | null = null
  @state() private mode: 'schedule'|'manual' = 'schedule'
  @state() private servingSize: number | null = null
  @state() private portionWeight: number | null = null
  @state() private manualSize: number = 1

  static getStubConfig(){
    return {
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
    }
  }

  setConfig(config: any){
    const stub = (this.constructor as any).getStubConfig()
    this.config = { ...stub, ...config }
    if (!this.config.mqtt_topic) throw new Error("'mqtt_topic' is required")
    this.rows = this.normalizeRows(this.config.schedule)
    this.mode = this.config.mode
    this.servingSize = this.numOrNull(this.config.serving_size)
    this.portionWeight = this.numOrNull(this.config.portion_weight)
    this.manualSize = this.config.default_size
  }

  getCardSize(){ return 8 }

  private numOrNull(v:any){ const n=Number(v); return Number.isFinite(n)?n:null }
  private clamp(v:any,min:number,max:number){ v=Math.round(Number(v)); if(!Number.isFinite(v)) v=min; return Math.max(min, Math.min(max, v)) }
  private sanitizePattern(p:string){ p=String(p||'workdays').toLowerCase(); return (DAY_PATTERNS as readonly string[]).includes(p)?p:'workdays' }
  private normalizeRows(arr:any[]): Row[]{
    if(!Array.isArray(arr)) return []
    return arr.map((r:any)=>({
      pattern: this.sanitizePattern(r.days||r.pattern||'workdays'),
      hour: this.clamp(r.hour??8,0,23),
      minute: this.clamp(r.minute??0,0,59),
      size: this.clamp(r.size??this.config?.default_size??1,1,20)
    }))
  }

  private readLiveState(){
    const stEntity = this.config.schedule_entity && this.hass?.states?.[this.config.schedule_entity]
    const statusEntity = this.config.status_entity && this.hass?.states?.[this.config.status_entity]

    let errorFlag = false
    if(statusEntity){ errorFlag = boolish(statusEntity.state) }
    else if(stEntity){ const a:any=stEntity.attributes; const err=a?.error ?? a?.fault; if(err!=null) errorFlag = boolish(err) }

    if(stEntity){
      if(!Number.isFinite(this.servingSize as any) && Number.isFinite(stEntity.attributes?.serving_size)) this.servingSize = Number(stEntity.attributes.serving_size)
      if(!Number.isFinite(this.portionWeight as any) && Number.isFinite(stEntity.attributes?.portion_weight)) this.portionWeight = Number(stEntity.attributes.portion_weight)
    }
    return { errorFlag }
  }

  private computeDailyTotals(){
    try{
      if(!this.rows.length) return { avgPortionsPerDay: NaN, avgWeightPerDay: NaN }
      const perDay: Record<string, number> = {mon:0,tue:0,wed:0,thu:0,fri:0,sat:0,sun:0}
      this.rows.forEach(r=>{ (expandPattern(r.pattern) as string[]).forEach(d=> perDay[d] += r.size ) })
      const totalWeek = Object.values(perDay).reduce((a,b)=>a+b,0)
      const avgPortionsPerDay = totalWeek/7
      const avgWeightPerDay = Number.isFinite(this.portionWeight as any) ? avgPortionsPerDay * (this.portionWeight as number) : NaN
      return { avgPortionsPerDay, avgWeightPerDay }
    }catch: 
      # type: ignore
      return { avgPortionsPerDay: NaN, avgWeightPerDay: NaN }
  }

  protected render(){
    const { errorFlag } = this.readLiveState()
    const { avgPortionsPerDay, avgWeightPerDay } = this.computeDailyTotals()

    return html`
      <ha-card>
        <div class="card">
          <div class="header">
            <h1 class="title">${this.config.title}</h1>
            <div class="header-right">
              <div class="status ${errorFlag?'err':'ok'}">
                <ha-icon .icon=${errorFlag? 'mdi:alert-circle':'mdi:check-circle'}></ha-icon>
                <span>${errorFlag? 'Error':'OK'}</span>
              </div>
              <div class="toggle">
                <button class=${this.mode==='schedule'?'active':''} @click=${()=>{this.mode='schedule'}}>Schedule</button>
                <button class=${this.mode==='manual'?'active':''} @click=${()=>{this.mode='manual'}}>Manual</button>
              </div>
            </div>
          </div>

          <div class="metrics">
            ${this.metric('Current serving size', this.servingSize ?? '—')}
            ${this.metric('Portions per day (avg)', Number.isFinite(avgPortionsPerDay)? avgPortionsPerDay.toFixed(1): '—')}
            ${this.metric('Weight per day (avg)', Number.isFinite(avgWeightPerDay)? `${avgWeightPerDay.toFixed(0)} g` : '—')}
          </div>

          <div class="line"></div>

          ${this.mode==='schedule' ? html`${this.renderSchedule()}` : html`${this.renderManual()}`}

          <div class="badges">
            <span class="hint">Topic: ${this.config.mqtt_topic}</span>
            <span class="hint">Key: ${this.config.schedule_key}</span>
            ${this.config.schedule_entity ? html`<span class="pill">Entity: ${this.config.schedule_entity}</span>` : nothing}
          </div>

          ${this.errorMsg ? html`<div class="message error">${this.errorMsg}</div>` : nothing}
          ${this.info ? html`<div class="message success">${this.info}</div>` : nothing}
        </div>
      </ha-card>
    `
  }

  private metric(label:string, value:any){
    return html`<div class="metric"><div class="label">${label}</div><div class="value">${value}</div></div>`
  }

  private renderSchedule(){
    return html`
      <div class="rows">
        ${this.rows.length===0 ? html`<div class="hint">No schedule yet. Click “+ Add row”.</div>` : nothing}
        ${this.rows.map((r, i)=> html`${this.renderRow(r,i)}`)}
      </div>
      <div class="actions">
        <button class="btn secondary" @click=${this.previewJson}>Preview JSON</button>
        <button class="btn ghost" @click=${()=>{this.rows=[]; this.requestUpdate()}}>Clear All</button>
        <button class="btn ghost" @click=${()=>{ this.rows=[...this.rows, {pattern:'workdays', hour:8, minute:0, size:this.config.default_size||1}] }}>+ Add row</button>
        <button class="btn" ?disabled=${this.publishing} @click=${this.publish}>${this.publishing? 'Publishing…':'Publish'}</button>
      </div>
    `
  }

  private renderRow(row: Row, idx: number){
    const hh = String(row.hour).padStart(2,'0'); const mm = String(row.minute).padStart(2,'0')
    return html`
      <div class="row">
        <select @change=${(e:any)=> this.patchRow(idx, { pattern: (e.target.value) })}>
          ${DAY_PATTERNS.map(p=> html`<option value=${p} ?selected=${p===row.pattern}>${p.toUpperCase()}</option>`)}
        </select>
        <input type="time" .value=${`${hh}:${mm}`} @change=${(e:any)=>{ const [H,M]=(e.target.value||'08:00').split(':').map(Number); this.patchRow(idx,{hour:this.clamp(H,0,23),minute:this.clamp(M,0,59)}) }} />
        <input type="number" min="1" max="20" step="1" .value=${String(row.size)} @change=${(e:any)=> this.patchRow(idx, { size: this.clamp(e.target.value,1,20) })} />
        <div></div>
        <button class="btn danger" @click=${()=>{ this.rows = this.rows.filter((_,i)=>i!==idx) }}>Remove</button>
      </div>
    `
  }

  private renderManual(){
    return html`
      <div class="manual">
        <div class="field">
          <span>Manual size</span>
          <input type="number" min="1" max="20" step="1" .value=${String(this.manualSize)} @change=${(e:any)=>{ this.manualSize = this.clamp(e.target.value,1,20) }} />
        </div>
        <button class="btn" @click=${this.feedNow}>Feed now</button>
        <button class="btn danger" @click=${this.stopNow}>Stop</button>
      </div>
    `
  }

  private patchRow(idx:number, patch: Partial<Row>){
    const next = [...this.rows]; next[idx] = { ...next[idx], ...patch }; this.rows = next
  }

  private buildPayload(){
    if(!this.rows.length) throw new Error('No schedule rows')
    const key = this.config.schedule_key || 'schedule'
    const rows = this.rows.map(r=>({ days:this.sanitizePattern(r.pattern), hour:this.clamp(r.hour,0,23), minute:this.clamp(r.minute,0,59), size:this.clamp(r.size,1,20) }))
    const payload: any = { [key]: rows }
    if(Number.isFinite(this.servingSize as any)) payload.serving_size = this.clamp(this.servingSize,1,10)
    if(Number.isFinite(this.portionWeight as any)) payload.portion_weight = this.clamp(this.portionWeight,1,20)
    return payload
  }

  private previewJson = ()=>{
    try{ const p=this.buildPayload(); this.info = 'Preview:\n'+JSON.stringify(p,null,2); this.errorMsg=null }
    catch(e:any){ this.errorMsg=String(e); this.info=null }
  }

  private publish = async()=>{
    try{
      this.publishing = true; this.errorMsg=null; this.info=null
      const payload = this.buildPayload()
      await this.hass.callService('mqtt','publish',{ topic:this.config.mqtt_topic, payload: JSON.stringify(payload), qos:0, retain:false })
      this.info = 'Published successfully'
    }catch(e:any){ this.errorMsg = 'Publish failed: '+(e.message||e) }
    finally{ this.publishing=false }
  }

  private feedNow = async()=>{
    const key = this.config.manual_command_key || 'feed'
    const size = this.clamp(this.manualSize||1,1,20)
    try{
      this.publishing=true; this.errorMsg=null; this.info=null
      await this.hass.callService('mqtt','publish',{ topic:this.config.mqtt_topic, payload: JSON.stringify({ [key]: size }), qos:0, retain:false })
      this.info = `Fed ${size} now`
    }catch(e:any){ this.errorMsg = 'Manual feed failed: '+(e.message||e) }
    finally{ this.publishing=false }
  }

  private stopNow = async()=>{
    try{
      this.publishing=true; this.errorMsg=null; this.info=null
      await this.hass.callService('mqtt','publish',{ topic:this.config.mqtt_topic, payload: JSON.stringify({ stop: true }), qos:0, retain:false })
      this.info = 'Stop command sent'
    }catch(e:any){ this.errorMsg = 'Stop failed: '+(e.message||e) }
    finally{ this.publishing=false }
  }

  // Config editor wiring
  static getConfigElement(){ return document.createElement('cat-feeder-schedule-card-editor') as any }
}

// Register global for HA to find the card
;(window as any).customCards = (window as any).customCards || []
;(window as any).customCards.push({
  type: 'cat-feeder-schedule-card',
  name: 'Cat Feeder Schedule Card',
  description: 'Aqara Pet Feeder C1 schedule helper',
})
