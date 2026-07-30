// Global Entities & Footprint -- turns Blackwell & Co into a JPMorgan-style
// multi-region group. Server-side shape/logic lives in server/globalBank.js
// (see its header comment for the honest TS→JS adaptation note). This page is
// universally viewable; edit controls (headcount, entity params, capital
// transfers) are only rendered — and separately re-checked server-side — for
// Head of CIB / DRH Global / Board Of Directors.
const GLOBAL_REGION_LABELS = { AMER: "Amériques", EMEA: "Europe / Moyen-Orient / Afrique", APAC: "Asie-Pacifique", LATAM: "Amérique Latine" };
const GLOBAL_DESK_LABELS = { TRADING: "Trading", MA: "M&A", PRIVATE_BANKING: "Gestion de Fortune", TREASURY: "Trésorerie", RISK: "Risque", RH: "RH" };

// Approximate, stylized positions on a flat 1000x500 world outline -- not
// geographically precise (no mapping library/tileset in this vanilla-JS, no-
// build-step project), just enough to read as "world map with lit-up hubs".
const GLOBAL_HUB_POSITIONS = {
  ny: { x: 250, y: 190 },
  fra: { x: 520, y: 150 },
  ldn: { x: 480, y: 135 },
  hk: { x: 800, y: 245 }
};

function globalCanManage(player) {
  return !!player && (player.dept === "Board Of Directors" || player.isHeadOfCIB || player.isDrhGlobal);
}

function globalWorldMapHtml(entities) {
  const maxActivity = Math.max(1, ...entities.map(e => Math.abs(e.allocatedCapital)));
  const pins = entities.map(e => {
    const pos = GLOBAL_HUB_POSITIONS[e.id];
    if (!pos) return "";
    const intensity = Math.max(0.25, Math.abs(e.allocatedCapital) / maxActivity);
    const color = e.isMarketOpen ? "#22c55e" : "#626c82";
    const radius = 6 + intensity * 10;
    return `
      <g transform="translate(${pos.x},${pos.y})">
        <circle r="${radius + 8}" fill="${color}" opacity="${0.12 * intensity}"/>
        <circle r="${radius}" fill="${color}" opacity="0.85"/>
        <text x="0" y="-${radius + 12}" text-anchor="middle" font-size="13" fill="var(--text-600)" font-weight="700">${escapeHtml(e.city)}</text>
        <text x="0" y="${radius + 18}" text-anchor="middle" font-size="10.5" fill="var(--text-muted)">${e.isMarketOpen ? "🟢 Ouvert" : "⚪ Fermé"}</text>
      </g>
    `;
  }).join("");

  // Stylized continent silhouettes -- abstract blobs, not a real geo projection.
  return `
    <svg viewBox="0 0 1000 500" width="100%" height="320" style="background:#05070c; border-radius:var(--radius-sm); border:1px solid var(--border);">
      <path d="M120,140 Q220,90 300,150 Q340,220 260,280 Q180,320 130,260 Q90,200 120,140 Z" fill="#121824" stroke="var(--border)"/>
      <path d="M420,110 Q560,80 620,140 Q600,200 520,210 Q440,190 420,110 Z" fill="#121824" stroke="var(--border)"/>
      <path d="M430,230 Q520,220 540,320 Q500,400 440,380 Q400,300 430,230 Z" fill="#121824" stroke="var(--border)"/>
      <path d="M700,180 Q850,150 900,240 Q870,320 760,310 Q690,260 700,180 Z" fill="#121824" stroke="var(--border)"/>
      <path d="M760,340 Q850,340 860,410 Q800,440 750,400 Z" fill="#121824" stroke="var(--border)"/>
      ${pins}
    </svg>
  `;
}

const ACTIVE_DESK_TYPES_CLIENT = ["TRADING", "MA", "PRIVATE_BANKING", "TREASURY", "RISK", "RH"];

function globalEntityCardHtml(entity, canManage) {
  const desksHtml = ACTIVE_DESK_TYPES_CLIENT.map(desk => `
    <label style="display:inline-flex; align-items:center; gap:4px; margin:2px 8px 2px 0; font-size:11px;">
      <input type="checkbox" data-global-desk="${entity.id}|${desk}" ${entity.activeDesks.includes(desk) ? "checked" : ""} ${canManage ? "" : "disabled"}/>
      ${GLOBAL_DESK_LABELS[desk]}
    </label>
  `).join("");

  return `
    <div class="panel" style="margin-bottom:14px;">
      <div class="panel-title" style="display:flex; justify-content:space-between; align-items:center;">
        <span>${entity.isMarketOpen ? "🟢" : "⚪"} ${escapeHtml(entity.name)}</span>
        <span class="chip chip-neutral">${escapeHtml(GLOBAL_REGION_LABELS[entity.region] || entity.region)}</span>
      </div>
      <div style="font-size:11.5px; color:var(--text-muted); margin-bottom:10px;">${escapeHtml(entity.city)} — ${escapeHtml(entity.timezone)}</div>
      <div class="kpi-grid" style="margin-bottom:10px;">
        <div class="kpi-card">
          <div class="kpi-label">Effectifs locaux</div>
          ${canManage
            ? `<input type="number" min="0" step="100" data-global-field="${entity.id}|headcount" value="${entity.headcount}" class="tnum" style="width:100%; padding:5px 7px; border-radius:6px; border:1px solid var(--border); background:var(--surface-2); color:var(--text-900); font-size:13px;"/>`
            : `<div class="kpi-value tnum">${entity.headcount.toLocaleString("fr-FR")}</div>`}
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Capital alloué</div>
          <div class="kpi-value" data-flash-key="global-cap-${entity.id}" data-flash-val="${entity.allocatedCapital}">${fmtMoney(entity.allocatedCapital)}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">P&amp;L régional</div>
          <div class="kpi-value" data-flash-key="global-pnl-${entity.id}" data-flash-val="${entity.localPnL}">${fmtMoney(entity.localPnL)}</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Ratio CET1</div>
          ${canManage
            ? `<input type="number" min="0" max="100" step="0.1" data-global-field="${entity.id}|capitalRatioPct" value="${entity.capitalRatioPct}" class="tnum" style="width:100%; padding:5px 7px; border-radius:6px; border:1px solid var(--border); background:var(--surface-2); color:var(--text-900); font-size:13px;"/>`
            : `<div class="kpi-value tnum">${entity.capitalRatioPct}%</div>`}
        </div>
      </div>
      <div class="form-row" style="margin-bottom:8px;">
        <label>Régulateur local</label>
        ${canManage
          ? `<input type="text" data-global-field="${entity.id}|regulatoryBody" value="${escapeHtml(entity.regulatoryBody)}" maxlength="60"/>`
          : `<div style="font-size:12.5px; color:var(--text-600);">${escapeHtml(entity.regulatoryBody)}</div>`}
      </div>
      <div class="form-row" style="margin-bottom:8px;">
        <label>Coût masse salariale (M$/an)</label>
        ${canManage
          ? `<input type="number" min="0" step="10" data-global-field="${entity.id}|payrollCostM" value="${entity.payrollCostM}"/>`
          : `<div class="tnum" style="font-size:12.5px; color:var(--text-600);">${fmtMoney(entity.payrollCostM)}</div>`}
      </div>
      <div class="form-row">
        <label>Desks actifs</label>
        <div>${desksHtml}</div>
      </div>
    </div>
  `;
}

function globalTransferFormHtml(entities, canManage) {
  if (!canManage) return "";
  const options = entities.map(e => `<option value="${e.id}">${escapeHtml(e.city)} — ${escapeHtml(e.name)}</option>`).join("");
  return `
    <div class="panel" style="margin-bottom:14px;">
      <div class="panel-title">🌐 Transfert de liquidité overnight (arbitrage de capital inter-entités)</div>
      <div class="form-row"><label>Entité source</label><select id="global-transfer-from">${options}</select></div>
      <div class="form-row"><label>Entité destinataire</label><select id="global-transfer-to">${options}</select></div>
      <div class="form-row"><label>Montant (M$)</label><input type="number" id="global-transfer-amount" min="1" step="10" placeholder="Ex: 200"/></div>
      <button id="global-transfer-submit" class="btn-sm">Transférer</button>
      <div id="global-transfer-error" class="join-error"></div>
    </div>
  `;
}

// Regulatory Stress Testing & Basel Ratios (Patch 22) -- server/
// regulatoryStressTest.js checks each entity's capitalRatioPct (editable above)
// against a Basel minimum every 90-150s; a failure penalizes that entity's
// allocatedCapital AND restricts bonus distribution bank-wide for a few minutes.
function stressTestPanelHtml() {
  const st = appState.stressTest;
  if (!st || !st.lastResults || !st.lastResults.length) return "";
  const restricted = st.bonusRestrictedUntil && st.bonusRestrictedUntil > Date.now();
  return `
    <div class="panel" style="margin-bottom:16px;">
      <div class="panel-title">📐 Stress Test réglementaire — Ratios Basel</div>
      ${restricted ? `<div class="event-banner" style="margin-bottom:10px;">🚨 <b>Distribution de bonus restreinte</b> — un Stress Test récent a échoué. Reprise dans ${Math.max(0, Math.round((st.bonusRestrictedUntil - Date.now()) / 1000))}s.</div>` : ""}
      <table class="data-table">
        <thead><tr><th>Entité</th><th>Ratio Tier 1</th><th>Statut</th></tr></thead>
        <tbody>
          ${st.lastResults.map(r => `
            <tr>
              <td>${escapeHtml(r.name)}</td>
              <td class="tnum">${r.capitalRatioPct}%</td>
              <td><span class="chip ${r.compliant ? "chip-good" : "chip-critical"}">${r.compliant ? "Conforme" : "Non conforme"}</span></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
      ${st.lastRunAt ? `<div style="font-size:11px; color:var(--text-muted); margin-top:6px;">Dernier contrôle : ${fmtTime(st.lastRunAt)}</div>` : ""}
    </div>
  `;
}

function renderGlobal() {
  const gb = appState.globalBank || { bankName: "—", totalGlobalHeadcount: 0, globalPnL: 0, globalTier1CapitalRatio: 0, entities: [] };
  const canManage = globalCanManage(appState.player);
  const entities = gb.entities || [];

  return `
    <div class="page-title">🌍 Global Footprint — ${escapeHtml(gb.bankName)}</div>
    <div class="page-sub">Structure mondiale multi-entités, présence régionale en temps réel et arbitrage de capital inter-entités.</div>

    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label">Effectifs mondiaux</div>
        ${canManage
          ? `<input type="number" min="0" step="1000" id="global-total-headcount" value="${gb.totalGlobalHeadcount}" class="tnum" style="width:100%; padding:5px 7px; border-radius:6px; border:1px solid var(--border); background:var(--surface-2); color:var(--text-900); font-size:16px; font-weight:800;"/>`
          : `<div class="kpi-value tnum">${gb.totalGlobalHeadcount.toLocaleString("fr-FR")}</div>`}
      </div>
      <div class="kpi-card"><div class="kpi-label">P&amp;L Groupe</div><div class="kpi-value" data-flash-key="global-total-pnl" data-flash-val="${gb.globalPnL}">${fmtMoney(gb.globalPnL)}</div></div>
      <div class="kpi-card"><div class="kpi-label">Ratio Tier 1 Groupe</div><div class="kpi-value tnum">${gb.globalTier1CapitalRatio}%</div></div>
      <div class="kpi-card"><div class="kpi-label">Entités actives</div><div class="kpi-value">${entities.length}</div></div>
    </div>

    <div class="panel" style="margin-bottom:16px;">
      <div class="panel-title">🗺 World Map Operations</div>
      ${globalWorldMapHtml(entities)}
    </div>

    ${stressTestPanelHtml()}

    ${globalTransferFormHtml(entities, canManage)}

    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(320px, 1fr)); gap:14px;">
      ${entities.map(e => globalEntityCardHtml(e, canManage)).join("")}
    </div>
    ${!canManage ? `<div style="font-size:11.5px; color:var(--text-muted); margin-top:10px;">Seuls le Head of CIB, la DRH Global (Director+, RH &amp; Communication) ou le Board Of Directors peuvent modifier ces paramètres.</div>` : ""}
  `;
}

function bindGlobal() {
  document.querySelectorAll("[data-global-field]").forEach(el => {
    const commit = () => {
      const [entityId, field] = el.getAttribute("data-global-field").split("|");
      socket.emit("globalBank:updateEntity", { entityId, field, value: el.value });
    };
    el.addEventListener("change", commit);
  });
  document.querySelectorAll("[data-global-desk]").forEach(el => {
    el.addEventListener("change", () => {
      const [entityId, desk] = el.getAttribute("data-global-desk").split("|");
      const entity = (appState.globalBank.entities || []).find(e => e.id === entityId);
      if (!entity) return;
      const current = new Set(entity.activeDesks);
      if (el.checked) current.add(desk); else current.delete(desk);
      socket.emit("globalBank:updateEntity", { entityId, field: "activeDesks", value: Array.from(current) });
    });
  });
  const headcountInput = document.getElementById("global-total-headcount");
  if (headcountInput) headcountInput.addEventListener("change", () => {
    socket.emit("globalBank:updateTotalHeadcount", { value: headcountInput.value });
  });
  const transferBtn = document.getElementById("global-transfer-submit");
  if (transferBtn) transferBtn.addEventListener("click", () => {
    const fromEntityId = document.getElementById("global-transfer-from").value;
    const toEntityId = document.getElementById("global-transfer-to").value;
    const amount = document.getElementById("global-transfer-amount").value;
    const errEl = document.getElementById("global-transfer-error");
    if (fromEntityId === toEntityId) { if (errEl) errEl.textContent = "Sélectionnez deux entités différentes."; return; }
    if (errEl) errEl.textContent = "";
    socket.emit("globalBank:transferCapital", { fromEntityId, toEntityId, amount });
  });
}

PAGE_RENDERERS.global = renderGlobal;
PAGE_BINDERS.global = bindGlobal;
