import { css } from 'lit'

export const styles = css`
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
`
