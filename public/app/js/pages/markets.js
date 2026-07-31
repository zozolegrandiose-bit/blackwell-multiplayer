const MARKET_CATEGORY_COLOR = {
  "Actions": "var(--accent-2)",
  "Indices": "var(--accent-2)",
  "Obligations": "var(--accent)",
  "Matières Premières": "var(--gold)",
  "Devises": "#5ee0e0",
  "Crypto": "#b58cff",
  "Taux": "var(--gold-dim)"
};

// Carnet d'ordres Niveau 2 (Patch 29) -- purely a display/informational feature
// (the request asks for a visible order book, not a new execution/order-type
// system), so it's synthesized client-side from the instrument's own price and
// volatility rather than adding new server state. Seeded off price+id so the
// ladder looks stable between renders of the same tick instead of jittering on
// every keystroke, and only actually changes when a new price tick arrives.
function seededRandom01(seed) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function roundToQuote(n) {
  return n < 10 ? Math.round(n * 10000) / 10000 : Math.round(n * 100) / 100;
}

function orderBookHtml(inst) {
  const spread = Math.max(inst.price * inst.volatility * 0.15, inst.price * 0.0006);
  const tick = spread / 3;
  const seedBase = inst.price * 997 + inst.id.length * 31;
  const rows = [3, 2, 1].map(i => ({
    askPrice: roundToQuote(inst.price + tick * i),
    askSize: Math.round(8 + seededRandom01(seedBase + i) * 90),
    bidPrice: roundToQuote(inst.price - tick * i),
    bidSize: Math.round(8 + seededRandom01(seedBase - i) * 90)
  }));
  return `
    <div class="order-book">
      <div class="order-book-row order-book-header"><span>Taille</span><span>Ask</span></div>
      ${rows.slice().reverse().map(r => `<div class="order-book-row order-book-ask"><span>${r.askSize}</span><span class="tnum">${r.askPrice}</span></div>`).join("")}
      <div class="order-book-spread">Spread ${roundToQuote(tick * 2)}</div>
      ${rows.map(r => `<div class="order-book-row order-book-bid"><span>${r.bidSize}</span><span class="tnum">${r.bidPrice}</span></div>`).join("")}
      <div class="order-book-row order-book-header"><span>Taille</span><span>Bid</span></div>
    </div>
  `;
}

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

// RFQ -- a live 15s window, urgent enough to warrant its own countdown span
// updated every second (same technique as the War Room overlay in app.js)
// rather than relying on the next full renderApp() to refresh the number.
let rfqTickInterval = null;

function rfqPanelHtml() {
  const rfq = (appState.rfqRequests || []).find(r => !r.resolved);
  if (!rfq) return "";
  return `
    <div class="panel" style="margin-bottom:16px; border-color:rgba(232,182,74,0.4);">
      <div class="panel-title">📞 RFQ — ${escapeHtml(rfq.clientName)}</div>
      <div style="font-size:12.5px; margin-bottom:8px;">Demande de <b>${rfq.side}</b> sur ${escapeHtml(rfq.instrumentName)} — notionnel ${fmtMoney(rfq.notional)} · prix référence ${rfq.referencePrice}</div>
      <div class="warroom-countdown" id="rfq-countdown-text" style="font-size:22px;">--</div>
      <div style="display:flex; gap:6px; align-items:center;">
        <input id="rfq-quote-input" type="number" step="0.01" placeholder="Votre prix" style="width:120px; padding:5px 7px; border-radius:6px; border:1px solid var(--border); background:var(--surface-2); color:var(--text-900); font-size:12px;"/>
        <button id="rfq-submit" class="btn-sm">Coter</button>
      </div>
    </div>
  `;
}

function tickRfqCountdown() {
  const el = document.getElementById("rfq-countdown-text");
  const rfq = (appState.rfqRequests || []).find(r => !r.resolved);
  if (!el || !rfq) return;
  const remaining = Math.max(0, Math.round((rfq.deadline - Date.now()) / 1000));
  el.textContent = "⏱ " + remaining + "s";
}

function deltaHedgingHtml() {
  const unhedged = (appState.pendingHedges || []).filter(h => !h.hedged);
  if (!unhedged.length) return "";
  return `
    <div style="margin-top:12px; border-top:1px solid var(--border); padding-top:10px;">
      <div style="font-size:11px; color:var(--warning); margin-bottom:6px;">⚖️ Delta non couvert — reste dans la VaR du book tant qu'il n'est pas hedgé sur le spot :</div>
      ${unhedged.map(h => `
        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; padding:4px 0;">
          <span style="font-size:11.5px;">${escapeHtml(h.structureType)} (${escapeHtml(h.clientName)}) — delta ${fmtMoney(h.deltaExposure)}</span>
          <button data-hedge-delta="${h.id}" class="btn-sm">Couvrir sur le spot</button>
        </div>
      `).join("")}
    </div>
  `;
}

function structuredProductsPanelHtml() {
  const requests = appState.hedgingRequests || [];
  const products = appState.structuredProducts || [];
  const structureOptions = ["Swap de taux", "Collar (Cap+Floor)", "Option Vanille", "Swap de devises", "Swap de matières premières"];
  return `
    <div class="panel" style="margin-bottom:16px;">
      <div class="panel-title">🧩 Produits Structurés &amp; Swaps</div>
      <div style="font-size:11.5px; color:var(--text-muted); margin-bottom:10px;">Packagez une structure sur-mesure pour couvrir l'exposition d'un client corporate — une structure bien adaptée à l'exposition rapporte nettement plus qu'un choix approximatif.</div>
      ${requests.length ? requests.map(r => `
        <div style="border:1px solid var(--border); border-radius:8px; padding:8px 10px; margin-bottom:8px; display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
          <div style="flex:1; min-width:180px;">
            <div style="font-weight:600; font-size:12.5px;">${escapeHtml(r.clientName)}</div>
            <div style="font-size:11px; color:var(--text-muted);">Exposition : ${escapeHtml(r.exposureType)} · Notionnel ${fmtMoney(r.notional)} · ⏱ ${Math.max(0, Math.round((r.deadline - Date.now()) / 1000))}s</div>
          </div>
          <select data-structure-select="${r.id}" class="btn-sm">
            ${structureOptions.map(s => `<option value="${s}">${escapeHtml(s)}</option>`).join("")}
          </select>
          <button data-structure-submit="${r.id}" class="btn-sm">Packager</button>
        </div>
      `).join("") : `<div class="empty-cell">Aucune demande de couverture pour l'instant.</div>`}
      ${products.length ? `
        <div style="margin-top:10px;">
          <div style="font-size:11px; color:var(--text-muted); margin-bottom:4px;">Dernières structures créées</div>
          ${products.slice(0, 6).map(p => `
            <div style="font-size:11.5px; padding:4px 0; border-top:1px solid var(--border);">
              ${p.matched ? "✅" : "⚠️"} ${escapeHtml(p.byName)} → ${escapeHtml(p.structureType)} pour ${escapeHtml(p.clientName)} (${escapeHtml(p.exposureType)}) — +${fmtMoney(p.fee)}
            </div>
          `).join("")}
        </div>
      ` : ""}
      ${deltaHedgingHtml()}
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

// Central Bank & Monetary Policy (Patch 22) -- Fed/ECB rate decisions move the
// tradeable "US 10Y"/"Euribor 3M" instruments directly (see server/centralBank.js);
// this panel just surfaces the current policy stance so Trading/Treasury know
// what they're arbitraging against.
function centralBankPanelHtml() {
  const cb = appState.centralBank;
  if (!cb) return "";
  return `
    <div class="panel" style="margin-bottom:16px;">
      <div class="panel-title">🏛 Banque Centrale &amp; Politique Monétaire</div>
      <div class="kpi-grid">
        <div class="kpi-card"><div class="kpi-label">Taux Fed</div><div class="kpi-value tnum">${cb.fedRateBps} bps</div></div>
        <div class="kpi-card"><div class="kpi-label">Inflation US</div><div class="kpi-value tnum">${cb.lastInflationUS}%</div></div>
        <div class="kpi-card"><div class="kpi-label">Taux BCE</div><div class="kpi-value tnum">${cb.ecbRateBps} bps</div></div>
        <div class="kpi-card"><div class="kpi-label">Inflation zone euro</div><div class="kpi-value tnum">${cb.lastInflationEU}%</div></div>
      </div>
      ${cb.lastDecisionAt ? `<div style="font-size:11px; color:var(--text-muted); margin-top:6px;">Dernière décision : ${fmtTime(cb.lastDecisionAt)}</div>` : ""}
    </div>
  `;
}

// Algorithmic & HFT Trading (Patch 23) -- configurable bots (instrument,
// stratégie, taille par trade) que le Trader lance puis laisse tourner en
// autonomie ; l'infrastructure de latence (gated côté serveur à DRH/IT/Board)
// accélère leur cadence d'exécution par paliers.
const ALGO_LATENCY_LABELS = ["Standard", "Colocation", "Fibre dédiée", "Micro-ondes propriétaire"];
const ALGO_LATENCY_COSTS = [0, 150, 400, 900];

function algoTradingPanelHtml() {
  const bots = appState.algoBots || [];
  const infra = appState.algoInfrastructure || { latencyTier: 0, investedTotal: 0 };
  const instruments = (appState.markets && appState.markets.instruments) || [];
  const nextTier = infra.latencyTier + 1;
  const canInvestMore = nextTier < ALGO_LATENCY_LABELS.length;
  const canManageLatency = appState.player && (appState.player.dept === "Board Of Directors" || appState.player.dept === "Ressources Humaines" || appState.player.dept === "Sécurité Informatique");

  return `
    <div class="panel" style="margin-bottom:16px;">
      <div class="panel-title">🤖 Algorithmic &amp; HFT Trading</div>
      <div class="kpi-grid" style="margin-bottom:10px;">
        <div class="kpi-card"><div class="kpi-label">Infrastructure latence</div><div class="kpi-value">${escapeHtml(ALGO_LATENCY_LABELS[infra.latencyTier])}</div></div>
        <div class="kpi-card"><div class="kpi-label">Investi au total</div><div class="kpi-value">${fmtMoney(infra.investedTotal)}</div></div>
        <div class="kpi-card"><div class="kpi-label">Bots actifs</div><div class="kpi-value">${bots.filter(b => b.active).length} / ${bots.length}</div></div>
      </div>
      ${canManageLatency && canInvestMore ? `<button id="algo-invest-latency" class="btn-sm" style="margin-bottom:10px;">Investir dans « ${ALGO_LATENCY_LABELS[nextTier]} » (${ALGO_LATENCY_COSTS[nextTier]} M$)</button><div id="algo-latency-error" class="join-error"></div>` : ""}
      <div style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:10px;">
        <select id="algo-bot-instrument">${instruments.map(i => `<option value="${i.id}">${escapeHtml(i.name)}</option>`).join("")}</select>
        <select id="algo-bot-strategy">
          <option value="momentum">Momentum</option>
          <option value="meanReversion">Retour à la moyenne</option>
        </select>
        <input id="algo-bot-size" type="number" min="10" max="200" step="5" placeholder="Taille/trade (M$)" style="width:140px; padding:5px 7px; border-radius:6px; border:1px solid var(--border); background:var(--surface-2); color:var(--text-900); font-size:12px;"/>
        <input id="algo-bot-name" type="text" placeholder="Nom du bot" style="width:140px; padding:5px 7px; border-radius:6px; border:1px solid var(--border); background:var(--surface-2); color:var(--text-900); font-size:12px;"/>
        <button id="algo-bot-create" class="btn-sm">Lancer le bot</button>
      </div>
      <table class="data-table">
        <thead><tr><th>Bot</th><th>Instrument</th><th>Stratégie</th><th>Taille/trade</th><th>Trades exécutés</th><th>Statut</th><th></th></tr></thead>
        <tbody>
          ${bots.map(b => `
            <tr>
              <td>${escapeHtml(b.name)}</td>
              <td>${escapeHtml(b.instrumentName)}</td>
              <td>${b.strategy === "momentum" ? "Momentum" : "Retour à la moyenne"}</td>
              <td class="tnum">${fmtMoney(b.sizePerTrade)}</td>
              <td class="tnum">${b.tradeCount}</td>
              <td><span class="chip ${b.active ? "chip-good" : "chip-neutral"}">${b.active ? "Actif" : "En pause"}</span></td>
              <td><button data-algo-toggle="${b.id}" class="btn-sm">${b.active ? "Mettre en pause" : "Relancer"}</button></td>
            </tr>
          `).join("") || `<tr><td colspan="7" class="empty-cell">Aucun bot lancé.</td></tr>`}
        </tbody>
      </table>
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
    ${centralBankPanelHtml()}
    ${algoTradingPanelHtml()}
    ${executionQueueHtml()}
    ${syndicatingDealsHtml()}
    ${rfqPanelHtml()}
    ${structuredProductsPanelHtml()}
    ${insiderTradingPanelHtml()}
    ${darkPoolPanelHtml()}
    <div class="kpi-grid">
      <div class="kpi-card"><div class="kpi-label">Capital disponible</div><div class="kpi-value" data-flash-key="mk-cash" data-flash-val="${markets.cash}">${fmtMoney(markets.cash)}</div></div>
      <div class="kpi-card"><div class="kpi-label">Résultat réalisé cumulé</div><div class="kpi-value" data-flash-key="mk-pnl" data-flash-val="${markets.realizedPnL}">${fmtMoney(markets.realizedPnL)}</div></div>
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
            <div class="tnum" style="font-size:16px; font-weight:800; margin-bottom:4px;" data-flash-key="mk-price-${inst.id}" data-flash-val="${inst.price}">${inst.price}</div>
            <div class="sparkline-wrap">${sparklineSvg(inst.history, 180, 32)}</div>
            ${orderBookHtml(inst)}
            <div style="display:flex; gap:6px; margin-top:8px;">
              <input data-mk-notional="${inst.id}" type="number" step="1" min="1" placeholder="M$" style="width:70px; padding:5px 7px; border-radius:6px; border:1px solid var(--border); background:var(--surface-2); color:var(--text-900); font-size:12px;"/>
              <select data-mk-side="${inst.id}" style="padding:5px 4px; border-radius:6px; border:1px solid var(--border); background:var(--surface-2); color:var(--text-900); font-size:12px;">
                <option value="long">Long</option>
                <option value="short">Short</option>
              </select>
              <button data-mk-buy="${inst.id}" class="btn-sm">Ouvrir</button>
            </div>
          </div>
        `).join("")}
      </div>
      <div id="mk-buy-error" class="join-error"></div>
    </div>
    <div class="panel" style="margin-bottom:16px;">
      <div class="panel-title">Positions ouvertes (${positions.length})</div>
      <table class="data-table">
        <thead><tr><th>Instrument</th><th>Sens</th><th>Notionnel</th><th>Prix d'entrée</th><th>Prix actuel</th><th>P&amp;L latent</th><th>Ouverte par</th><th></th></tr></thead>
        <tbody>
          ${positions.map(pos => {
            const inst = instruments.find(i => i.id === pos.instrumentId);
            const currentPrice = inst ? inst.price : pos.entryPrice;
            const priceMove = currentPrice / pos.entryPrice - 1;
            const pnl = Math.round(pos.notional * (pos.side === "short" ? -priceMove : priceMove) * 100) / 100;
            const cls = pnl >= 0 ? "chip-good" : "chip-critical";
            return `
            <tr>
              <td>${inst ? escapeHtml(inst.name) : "—"}</td>
              <td><span class="chip ${pos.side === "short" ? "chip-warning" : "chip-neutral"}">${pos.side === "short" ? "Short" : "Long"}</span></td>
              <td class="tnum">${pos.notional} M$</td>
              <td class="tnum">${pos.entryPrice}</td>
              <td class="tnum">${currentPrice}</td>
              <td><span class="chip ${cls}">${pnl >= 0 ? "+" : ""}${pnl} M$</span></td>
              <td>${escapeHtml(pos.openedByName)}</td>
              <td><button data-mk-sell="${pos.id}" class="btn-sm">Clôturer</button></td>
            </tr>
          `;
          }).join("") || `<tr><td colspan="8" class="empty-cell">Aucune position ouverte.</td></tr>`}
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
      const sideSelect = document.querySelector(`[data-mk-side="${instrumentId}"]`);
      const notional = input.value;
      if (!notional) return;
      socket.emit("markets:buy", { instrumentId, notional, side: sideSelect ? sideSelect.value : "long" });
    });
  });
  document.querySelectorAll("[data-mk-sell]").forEach(el => {
    el.addEventListener("click", () => {
      socket.emit("markets:sell", { positionId: el.getAttribute("data-mk-sell") });
    });
  });
  const algoCreateBtn = document.getElementById("algo-bot-create");
  if (algoCreateBtn) algoCreateBtn.addEventListener("click", () => {
    const instrumentId = document.getElementById("algo-bot-instrument").value;
    const strategy = document.getElementById("algo-bot-strategy").value;
    const sizePerTrade = document.getElementById("algo-bot-size").value;
    const name = document.getElementById("algo-bot-name").value;
    if (!instrumentId || !sizePerTrade) return;
    socket.emit("algo:createBot", { instrumentId, strategy, sizePerTrade, name });
  });
  document.querySelectorAll("[data-algo-toggle]").forEach(el => {
    el.addEventListener("click", () => socket.emit("algo:toggleBot", { botId: el.getAttribute("data-algo-toggle") }));
  });
  const latencyBtn = document.getElementById("algo-invest-latency");
  if (latencyBtn) latencyBtn.addEventListener("click", () => socket.emit("algo:investLatency"));
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
  document.querySelectorAll("[data-structure-submit]").forEach(el => {
    el.addEventListener("click", () => {
      const requestId = el.getAttribute("data-structure-submit");
      const select = document.querySelector(`[data-structure-select="${requestId}"]`);
      socket.emit("markets:createStructuredProduct", { requestId, structureType: select ? select.value : null });
    });
  });
  document.querySelectorAll("[data-hedge-delta]").forEach(el => {
    el.addEventListener("click", () => socket.emit("markets:hedgeDelta", { hedgeId: el.getAttribute("data-hedge-delta") }));
  });
  const rfqBtn = document.getElementById("rfq-submit");
  if (rfqBtn) rfqBtn.addEventListener("click", () => {
    const rfq = (appState.rfqRequests || []).find(r => !r.resolved);
    const input = document.getElementById("rfq-quote-input");
    const quotedPrice = Number(input && input.value);
    if (!rfq || !quotedPrice) return;
    socket.emit("markets:respondRfq", { rfqId: rfq.id, quotedPrice });
  });
  tickRfqCountdown();
  if (rfqTickInterval) clearInterval(rfqTickInterval);
  if ((appState.rfqRequests || []).some(r => !r.resolved)) {
    rfqTickInterval = setInterval(tickRfqCountdown, 1000);
  } else {
    rfqTickInterval = null;
  }
  bindTaskPanel();
}

PAGE_RENDERERS.markets = renderMarkets;
PAGE_BINDERS.markets = bindMarkets;
