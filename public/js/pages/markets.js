const MARKET_CATEGORY_COLOR = {
  "Actions": "var(--accent-2)",
  "Obligations": "var(--accent)",
  "Matières Premières": "var(--gold)",
  "Devises": "#5ee0e0",
  "Crypto": "#b58cff"
};

// Desk Structuration/Trading's step of the Analyste → Risk Manager → Desk Trading
// workflow — deals validated by Risk (server/handlers/dealWorkflow.js) show up
// here with a live 2-minute countdown; missing it has a real health penalty
// (server-side sweep), so the deadline shown here is not just cosmetic.
function executionQueueHtml() {
  const pending = (appState.maDeals || []).filter(d => d.workflow && d.workflow.phase === "pending_execution");
  if (!pending.length) return "";
  return `
    <div class="panel task-panel" style="margin-bottom:16px;">
      <div class="panel-title">⏱ Desk Structuration — exécutions en attente (${pending.length})</div>
      ${pending.map(d => `
        <div class="task-row" style="align-items:center;">
          <span class="task-row-text">${escapeHtml(d.name)} — ${fmtMoney(d.valuation)} · taux ${d.workflow.rate} % · validé par ${escapeHtml(d.workflow.riskDecisionByName)}</span>
          <span class="task-row-timer">⏱ ${Math.max(0, Math.round((d.workflow.executionDeadline - Date.now()) / 1000))}s</span>
          <button class="btn-sm" data-wf-execute="${d.id}|syndication">Syndication</button>
          <button class="btn-sm" data-wf-execute="${d.id}|couverture">Couverture</button>
        </div>
      `).join("")}
    </div>
  `;
}

function renderMarkets() {
  const markets = appState.markets || { instruments: [], positions: [], cash: 0, realizedPnL: 0, tradeLog: [] };
  const instruments = markets.instruments || [];
  const positions = markets.positions || [];

  return `
    <div class="page-title">Marchés</div>
    <div class="page-sub">Desk de trading partagé — capital alloué, positions et résultat visibles par toute l'équipe Marchés.</div>
    ${taskPanelHtml("markets")}
    ${executionQueueHtml()}
    <div class="kpi-grid">
      <div class="kpi-card"><div class="kpi-label">Capital disponible</div><div class="kpi-value">${fmtMoney(markets.cash)}</div></div>
      <div class="kpi-card"><div class="kpi-label">Résultat réalisé cumulé</div><div class="kpi-value">${fmtMoney(markets.realizedPnL)}</div></div>
      <div class="kpi-card"><div class="kpi-label">Positions ouvertes</div><div class="kpi-value">${positions.length}</div></div>
    </div>
    <div class="panel" style="margin-bottom:16px;">
      <div class="panel-title">Instruments</div>
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:12px;">
        ${instruments.map(inst => `
          <div style="border:1px solid var(--border); border-radius:var(--radius-sm); padding:10px 12px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
              <span style="font-weight:700; font-size:12.5px;">${escapeHtml(inst.name)}</span>
              <span class="dept-badge" style="background:${MARKET_CATEGORY_COLOR[inst.category] || "#6c7488"}22; color:${MARKET_CATEGORY_COLOR[inst.category] || "#6c7488"}; border:1px solid ${MARKET_CATEGORY_COLOR[inst.category] || "#6c7488"}55;">${escapeHtml(inst.category)}</span>
            </div>
            <div style="font-size:16px; font-weight:800; margin-bottom:4px;">${inst.price}</div>
            <div class="sparkline-wrap">${sparklineSvg(inst.history, 180, 32)}</div>
            <div style="display:flex; gap:6px; margin-top:8px;">
              <input data-mk-notional="${inst.id}" type="number" step="1" min="1" placeholder="M$" style="width:70px; padding:5px 7px; border-radius:6px; border:1px solid var(--border); background:var(--surface-2); color:var(--text-900); font-size:12px;"/>
              <button data-mk-buy="${inst.id}" class="btn-sm">Acheter</button>
            </div>
          </div>
        `).join("")}
      </div>
      <div id="mk-buy-error" class="join-error"></div>
    </div>
    <div class="panel" style="margin-bottom:16px;">
      <div class="panel-title">Positions ouvertes (${positions.length})</div>
      <table class="data-table">
        <thead><tr><th>Instrument</th><th>Notionnel</th><th>Prix d'entrée</th><th>Prix actuel</th><th>P&amp;L latent</th><th>Ouverte par</th><th></th></tr></thead>
        <tbody>
          ${positions.map(pos => {
            const inst = instruments.find(i => i.id === pos.instrumentId);
            const currentPrice = inst ? inst.price : pos.entryPrice;
            const pnl = Math.round(pos.notional * (currentPrice / pos.entryPrice - 1) * 100) / 100;
            const cls = pnl >= 0 ? "chip-good" : "chip-critical";
            return `
            <tr>
              <td>${inst ? escapeHtml(inst.name) : "—"}</td>
              <td class="tnum">${pos.notional} M$</td>
              <td class="tnum">${pos.entryPrice}</td>
              <td class="tnum">${currentPrice}</td>
              <td><span class="chip ${cls}">${pnl >= 0 ? "+" : ""}${pnl} M$</span></td>
              <td>${escapeHtml(pos.openedByName)}</td>
              <td><button data-mk-sell="${pos.id}" class="btn-sm">Clôturer</button></td>
            </tr>
          `;
          }).join("") || `<tr><td colspan="7" class="empty-cell">Aucune position ouverte.</td></tr>`}
        </tbody>
      </table>
    </div>
    <div class="panel">
      <div class="panel-title">Historique des trades</div>
      <div class="activity-feed">
        ${(markets.tradeLog || []).map(t => `
          <div class="activity-row">
            <span class="activity-time">${fmtTime(t.ts)}</span>
            <span class="activity-text">${escapeHtml(t.closedByName)} a clôturé ${escapeHtml(t.instrumentName)} (${t.notional} M$) — ${t.pnl >= 0 ? "+" : ""}${t.pnl} M$</span>
          </div>
        `).join("") || `<div class="empty-cell">Aucun trade clôturé pour l'instant.</div>`}
      </div>
    </div>
  `;
}

function bindMarkets() {
  document.querySelectorAll("[data-mk-buy]").forEach(el => {
    el.addEventListener("click", () => {
      const instrumentId = el.getAttribute("data-mk-buy");
      const input = document.querySelector(`[data-mk-notional="${instrumentId}"]`);
      const notional = input.value;
      if (!notional) return;
      socket.emit("markets:buy", { instrumentId, notional });
    });
  });
  document.querySelectorAll("[data-mk-sell]").forEach(el => {
    el.addEventListener("click", () => {
      socket.emit("markets:sell", { positionId: el.getAttribute("data-mk-sell") });
    });
  });
  document.querySelectorAll("[data-wf-execute]").forEach(el => {
    el.addEventListener("click", () => {
      const [dealId, method] = el.getAttribute("data-wf-execute").split("|");
      socket.emit("dealWorkflow:execute", { dealId, method });
    });
  });
  bindTaskPanel();
}

PAGE_RENDERERS.markets = renderMarkets;
PAGE_BINDERS.markets = bindMarkets;
