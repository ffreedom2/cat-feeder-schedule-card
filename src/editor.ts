import { LitElement, html } from 'lit'
import { customElement, property, state } from 'lit/decorators.js'

@customElement('cat-feeder-schedule-card-editor')
export class CatFeederScheduleCardEditor extends LitElement{
  @property({attribute:false}) hass: any
  @state() private config: any = {}

  setConfig(config:any){ this.config = config; this.requestUpdate() }

  protected render(){
    const c = this.config || {}
    return html`
      <style>
        .wrap{ display:grid; grid-template-columns: 1fr 1fr; gap:12px; }
        label{ display:flex; flex-direction:column; gap:6px; font-size:.9rem; }
        input, select{ padding:8px 10px; border-radius:10px; border:1px solid var(--divider-color); background: var(--card-background-color); }
        .full{ grid-column: 1/-1; }
      </style>
      <div class="wrap">
        ${this.field('Title','title', c.title)}
        ${this.field('MQTT topic','mqtt_topic', c.mqtt_topic, 'zigbee2mqtt/feeder/set', true)}
        ${this.field('Schedule key','schedule_key', c.schedule_key || 'schedule')}
        ${this.field('Manual command key','manual_command_key', c.manual_command_key || 'feed')}
        ${this.field('Schedule entity','schedule_entity', c.schedule_entity)}
        ${this.field('Status entity (optional)','status_entity', c.status_entity)}
        ${this.field('Default size','default_size', c.default_size ?? 1, '', false, 'number', {min:1,max:20})}
        ${this.field('Serving size (optional)','serving_size', c.serving_size ?? '', 'e.g., 3', false, 'number', {min:1,max:10})}
        ${this.field('Portion weight g (optional)','portion_weight', c.portion_weight ?? '', 'e.g., 5', false, 'number', {min:1,max:20})}
        <label>Show serving size<select @change=${(e:any)=> this.set('show_serving_size', e.target.value==='true')}>
          <option value="true" ?selected=${c.show_serving_size!==false}>Yes</option>
          <option value="false" ?selected=${c.show_serving_size===false}>No</option>
        </select></label>
        <label>Show portion weight<select @change=${(e:any)=> this.set('show_portion_weight', e.target.value==='true')}>
          <option value="true" ?selected=${c.show_portion_weight!==false}>Yes</option>
          <option value="false" ?selected=${c.show_portion_weight===false}>No</option>
        </select></label>
      </div>
    `
  }

  private field(label:string, key:string, val:any, placeholder='', required=false, type:'text'|'number'='text', range?:{min:number,max:number}){
    return html`<label class="${key==='title' || key==='mqtt_topic' ? 'full':''}">${label}
      <input .type=${type} .value=${String(val ?? '')} placeholder=${placeholder}
        @change=${(e:any)=> this.set(key, type==='number'? Number(e.target.value||0): e.target.value)}
        ${range? html`min=${range.min} max=${range.max}`: ''}
        ${required? 'required': ''}>
    </label>`
  }

  private set(k:string, v:any){
    const cfg = { ...(this.config||{}), [k]: v }
    this.config = cfg
    this.dispatchEvent(new CustomEvent('config-changed',{ detail: { config: cfg }, bubbles:true, composed:true }))
  }
}
