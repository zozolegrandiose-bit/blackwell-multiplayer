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
const MASSIVE_DEAL_THRESHOLD_CLIENT = 500;

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
          ${d.valuation >= MASSIVE_DEAL_THRESHOLD_CLIENT ? `<button class="btn-sm" data-wf-propose-syndication="${d.id}" style="border-color:var(--accent-2);">🌐 Syndication inter-banques</button>` : ""}
        </div>
      `).join("")}
    </div>
  `;
}

// Live status of deals currently being syndicated inter-banques (server/handlers/
// dealWorkflow.js's "syndicating" phase) -- purely informational, resolution is
// autonomous (each rival bank's bid resolves on its own timer), no action needed
// here besides watching it play out.
function syndicatingDealsHtml() {
  const syndicating = (appState.maDeals || []).filter(d => d.workflow && d.workflow.phase === "syndicating");
  if (!syndicating.length) return "";
  const STATUS_LABEL = { bidding: "⏳ en négociation", accepted: "✅ acceptée", rejected: "❌ déclinée" };
  return `
    <div class="panel" style="margin-bottom:16px;">
      <div class="panel-title">🌐 Syndication en cours</div>
      ${syndicating.map(d => `
        <div style="margin-bottom:10px;">
          <div style="font-weight:700; font-size:12.5px; margin-bottom:4px;">${escapeHtml(d.name)} — lead Blackwell &amp; Co ${fmtMoney(d.workflow.leadAmount)}</div>
          <div style="display:flex; gap:10px; flex-wrap:wrap;">
            ${d.workflow.tranches.map(t => `
              <div class="warroom-cluster-chip ${t.status === "accepted" ? "done" : ""}" style="min-width:170px;">
                ${escapeHtml(t.bankName)} · ${fmtMoney(t.amount)} — ${STATUS_LABEL[t.status]}
              </div>
            `).join("")}
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

// Information Privilégiée -- deals not yet public (stage !== "Clôturé") are already
// visible here via the shared maDeals snapshot (Patch 11). Trading on them ahead of
// the announcement is a deliberate rule-break: framed with a warning border/copy,
// distinct from the ordinary instrument cards above, since it always carries a real
// risk of getting caught by Compliance (server/handlers/markets.js).
function insiderTradingPanelHtml() {
  const pendingDeals = (appState.maDeals || []).filter(d => d.stage !== "Clôturé");
  if (!pendingDeals.length) return "";
  return `
    <div class="panel" style="margin-bottom:16px; border-color:rgba(255,92,122,0.35);">
      <div class="panel-title">🕵️ Information Privilégiée <span style="font-weight:400; font-size:11px; color:var(--text-muted);">(risqué — contrôle Compliance possible)</span></div>
      <div style="font-size:11.5px; color:var(--text-muted); margin-bottom:10px;">Négocier sur un deal M&amp;A pas encore annoncé publiquement rapporte gros si ça passe inaperçu — mais expose à une amende et une sanction si Compliance vous attrape.</div>
      ${pendingDeals.map(d => `
        <div style="border:1px solid var(--border); border-radius:8px; padding:8px 10px; margin-bottom:8px; display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
          <div style="flex:1; min-width:160px;">
            <div style="font-weight:600; font-size:12.5px;">${escapeHtml(d.name)}</div>
            <div style="font-size:11px; color:var(--text-muted);">${escapeHtml(d.stage)} · ${fmtMoney(d.valuation)}</div>
          </div>
          <input data-insider-notional="${d.id}" type="number" step="10" min="1" placeholder="Montant (M$)" style="width:120px; padding:5px 7px; border-radius:6px; border:1px solid var(--border); background:var(--surface-2); color:var(--text-900); font-size:11.5px;"/>
          <button data-insider-trade="${d.id}" class="btn-sm" style="border-color:#ff5c7a; color:#ffb3c1;">Négocier sur l'information</button>
        </div>
      `).join("")}
      <div id="insider-error" class="join-error"></div>
    </div>
  `;
}

const DARK_POOL_MIN_NOTIONAL_CLIENT = 300;
const DARK_POOL_STATUS_LABEL = { pending: "⏳ en négociation OTC", matched: "✅ exécuté", expired: "❌ expiré" };

// Anonymous large-volume orders (server/handlers/markets.js's markets:placeDarkPoolOrder)
// -- a short response window during which a rival bank may anonymously take the
// other side OTC. Rides the same appState.markets object as everything else on
// this page (darkPoolOrders is just another field on it), no separate socket
// listener needed for the data itself.
function darkPoolPanelHtml() {
  const markets = appState.markets || {};
  const instruments = markets.instruments || [];
  const orders = markets.darkPoolOrders || [];
  return `
    <div class="panel" style="margin-bottom:16px; border-color:rgba(181,140,255,0.35);">
      <div class="panel-title">🌑 Dark Pool <span style="font-weight:400; font-size:11px; color:var(--text-muted);">(ordres anonymes, gros volumes ≥ ${DARK_POOL_MIN_NOTIONAL_CLIENT} M$)</span></div>
      <div style="font-size:11.5px; color:var(--text-muted); margin-bottom:10px;">Un ordre de gros volume placé ici n'affecte pas le prix affiché — une banque rivale peut anonymement en prendre l'autre côté (OTC) sous quelques secondes.</div>
      <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin-bottom:10px;">
        <select id="dp-side"><option value="buy">Achat</option><option value="sell">Vente</option></select>
        <select id="dp-instrument">${instruments.map(i => `<option value="${i.id}">${escapeHtml(i.name)}</option>`).join("")}</select>
        <input id="dp-notional" type="number" step="10" min="${DARK_POOL_MIN_NOTIONAL_CLIENT}" placeholder="Notionnel (M$)" style="width:140px; padding:6px 8px; border-radius:6px; border:1px solid var(--border); background:var(--surface-2); color:var(--text-900); font-size:12px;"/>
        <button id="dp-submit" class="btn-sm">Soumettre l'ordre</button>
      </div>
      <div id="dp-error" class="join-error"></div>
      ${orders.length ? `
        <table class="data-table">
          <thead><tr><th>Instrument</th><th>Sens</th><th>Notionnel</th><th>Statut</th></tr></thead>
          <tbody>
            ${orders.slice(0, 8).map(o => `
              <tr>
                <td>${escapeHtml(o.instrumentName)}</td>
                <td>${o.side === "buy" ? "Achat" : "Vente"}</td>
                <td class="tnum">${fmtMoney(o.notional)}</td>
                <td>${DARK_POOL_STATUS_LABEL[o.status]}${o.status === "matched" ? ` — ${escapeHtml(o.matchedBank)} (+${o.gain} M$)` : ""}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      ` : ""}
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
    ${syndicatingDealsHtml()}
    ${insiderTradingPanelHtml()}
    ${darkPoolPanelHtml()}
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
  document.querySelectorAll("[data-wf-propose-syndication]").forEach(el => {
    el.addEventListener("click", () => {
      socket.emit("dealWorkflow:proposeSyndication", { dealId: el.getAttribute("data-wf-propose-syndication") });
    });
  });
  document.querySelectorAll("[data-insider-trade]").forEach(el => {
    el.addEventListener("click", () => {
      const dealId = el.getAttribute("data-insider-trade");
      const input = document.querySelector(`[data-insider-notional="${dealId}"]`);
      const notional = Number(input && input.value);
      const errEl = document.getElementById("insider-error");
      if (errEl) errEl.textContent = "";
      if (!notional) {
        if (errEl) errEl.textContent = "Indiquez un montant.";
        return;
      }
      socket.emit("markets:insiderTrade", { dealId, notional });
    });
  });
  const dpBtn = document.getElementById("dp-submit");
  if (dpBtn) dpBtn.addEventListener("click", () => {
    const side = document.getElementById("dp-side").value;
    const instrumentId = document.getElementById("dp-instrument").value;
    const notional = Number(document.getElementById("dp-notional").value);
    const errEl = document.getElementById("dp-error");
    if (errEl) errEl.textContent = "";
    if (!notional) {
      if (errEl) errEl.textContent = "Indiquez un notionnel.";
      return;
    }
    socket.emit("markets:placeDarkPoolOrder", { side, instrumentId, notional });
  });
  bindTaskPanel();
}

PAGE_RENDERERS.markets = renderMarkets;
PAGE_BINDERS.markets = bindMarkets;
