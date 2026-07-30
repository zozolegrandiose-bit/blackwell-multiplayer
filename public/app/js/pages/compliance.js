const COMPLIANCE_TYPES = ["Surveillance marché", "Éthique & Déontologie", "KYC/AML", "Réglementaire"];
const COMPLIANCE_STATUSES = ["Ouvert", "En cours d'analyse", "Résolu", "Escaladé"];

function slaBadge(ts) {
  const days = Math.floor((Date.now() - ts) / 86400000);
  const cls = days >= 7 ? "chip-critical" : days >= 3 ? "chip-warning" : "chip-good";
  return `<span class="chip ${cls}">${days} j</span>`;
}

// Client-side mirror of server/riskControl.js's computeVaR() -- pure function of
// the same markets.positions/instruments already shared with compliance-access
// players (server/handlers/join.js), so no extra round trip is needed.
const VAR_CONFIDENCE_MULTIPLIER_CLIENT = 1.65;
const PLAYER_VAR_WARNING_CLIENT = 30;
const PLAYER_VAR_CRITICAL_CLIENT = 60;

function computeVaRClient() {
  const markets = appState.markets || { positions: [], instruments: [] };
  const perPlayer = {};
  let bankTotal = 0;
  markets.positions.forEach(pos => {
    const instrument = markets.instruments.find(i => i.id === pos.instrumentId);
    if (!instrument) return;
    const posVaR = Math.round(Math.abs(pos.notional) * instrument.volatility * VAR_CONFIDENCE_MULTIPLIER_CLIENT * 100) / 100;
    bankTotal = Math.round((bankTotal + posVaR) * 100) / 100;
    const key = pos.openedByPlayerId || "unassigned";
    if (!perPlayer[key]) perPlayer[key] = { playerId: pos.openedByPlayerId, playerName: pos.openedByName, var: 0, positionCount: 0 };
    perPlayer[key].var = Math.round((perPlayer[key].var + posVaR) * 100) / 100;
    perPlayer[key].positionCount += 1;
  });
  return { perPlayer: Object.values(perPlayer), bankTotal };
}

function varStatusClient(v) {
  if (v >= PLAYER_VAR_CRITICAL_CLIENT) return "critical";
  if (v >= PLAYER_VAR_WARNING_CLIENT) return "warning";
  return "ok";
}
const VAR_STATUS_CHIP = { ok: "chip-good", warning: "chip-warning", critical: "chip-critical" };

function varPanelHtml() {
  if (!appState.markets) return "";
  const { perPlayer, bankTotal } = computeVaRClient();
  const killSwitched = (appState.players || []).filter(p => p.tradingFrozen);
  return `
    <div class="panel" style="margin-bottom:16px;">
      <div class="panel-title">📊 Matrice VaR (Value at Risk) — book total : ${fmtMoney(bankTotal)}</div>
      ${perPlayer.length ? `
        <table class="data-table">
          <thead><tr><th>Trader</th><th>Positions</th><th>VaR</th><th></th></tr></thead>
          <tbody>
            ${perPlayer.map(p => `
              <tr>
                <td>${escapeHtml(p.playerName || "—")}</td>
                <td class="tnum">${p.positionCount}</td>
                <td><span class="chip ${VAR_STATUS_CHIP[varStatusClient(p.var)]}">${fmtMoney(p.var)}</span></td>
                <td>${p.playerId ? `<button data-kill-switch="${p.playerId}" class="btn-sm" style="border-color:#ff5c7a; color:#ffb3c1;">🛑 Kill Switch</button>` : ""}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      ` : `<div class="empty-cell">Aucune position ouverte pour l'instant.</div>`}
      ${killSwitched.length ? `<div style="font-size:11px; color:var(--series-red); margin-top:8px;">🛑 Trading interdit : ${killSwitched.map(p => escapeHtml(p.fullName)).join(", ")}</div>` : ""}
    </div>
  `;
}

// The Risk Manager's step of the Analyste → Risk Manager → Desk Trading workflow:
// deals awaiting review show up here even though this player has no M&A page
// access — server/handlers/join.js shares maDeals with any compliance-access
// player specifically so this panel has something to render.
function riskQueueHtml() {
  const pending = (appState.maDeals || []).filter(d => d.workflow && d.workflow.phase === "pending_risk");
  if (!pending.length) return "";
  return `
    <div class="panel" style="margin-bottom:16px;">
      <div class="panel-title">🎯 Risk Manager — dossiers en attente (${pending.length})</div>
      ${pending.map(d => {
        const cf = d.workflow.creditFile;
        return `
        <div class="activity-row" style="display:block; padding:10px 0;">
          <div style="font-weight:700; font-size:13px; margin-bottom:6px;">${escapeHtml(d.name)} — ${fmtMoney(d.valuation)}</div>
          <div class="credit-file-grid">
            <div class="credit-file-item"><div class="credit-file-value">${escapeHtml(cf.rating)}</div><div class="credit-file-label">Notation</div></div>
            <div class="credit-file-item"><div class="credit-file-value">${cf.leverage}x</div><div class="credit-file-label">Levier</div></div>
            <div class="credit-file-item"><div class="credit-file-value">${cf.liquidityDays} j</div><div class="credit-file-label">Liquidité</div></div>
          </div>
          <div style="display:flex; gap:6px; align-items:center;">
            <label style="font-size:11.5px;">Taux</label>
            <input data-risk-rate="${d.id}" type="number" step="0.1" min="0.1" value="${d.workflow.rate}" style="width:80px; padding:5px 7px; border-radius:6px; border:1px solid var(--border); background:var(--surface-2); color:var(--text-900); font-size:12px;"/>
            <button data-risk-approve="${d.id}" class="btn-sm">Approuver</button>
            <button data-risk-reject="${d.id}" class="btn-sm">Refuser</button>
          </div>
        </div>
      `;
      }).join("")}
    </div>
  `;
}

function dealKillSwitchPanelHtml() {
  const active = (appState.maDeals || []).filter(d => d.workflow && ["pending_risk", "pending_execution", "syndicating"].includes(d.workflow.phase));
  if (!active.length) return "";
  return `
    <div class="panel" style="margin-bottom:16px;">
      <div class="panel-title">🛑 Geler un deal à risque</div>
      ${active.map(d => `
        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; padding:6px 0; border-top:1px solid var(--border);">
          <div style="font-size:12.5px;">${escapeHtml(d.name)} — ${fmtMoney(d.valuation)} ${d.frozen ? `<span class="chip chip-critical">Gelé</span>` : ""}</div>
          ${d.frozen ? "" : `<button data-freeze-deal="${d.id}" class="btn-sm">Geler (2 min)</button>`}
        </div>
      `).join("")}
    </div>
  `;
}

function renderCompliance() {
  const items = [...(appState.complianceItems || [])].sort((a, b) => b.ts - a.ts);
  const assignableplayers = appState.players || [];
  return `
    <div class="page-title">Conformité</div>
    <div class="page-sub">Alertes et suivi réglementaire.</div>
    ${taskPanelHtml("compliance")}
    ${varPanelHtml()}
    ${dealKillSwitchPanelHtml()}
    ${riskQueueHtml()}
    <div class="panel" style="margin-bottom:16px;">
      <div class="panel-title">Nouvelle alerte</div>
      <div class="form-row"><label>Type</label>
        <select id="cp-type">${COMPLIANCE_TYPES.map(t => `<option value="${t}">${t}</option>`).join("")}</select>
      </div>
      <div class="form-row"><label>Desk / département concerné</label><input id="cp-desk" type="text" placeholder="ex. Bureau Actions"/></div>
      <div class="form-row"><label>Description</label><textarea id="cp-flag" rows="2" placeholder="Description de l'alerte…" style="width:100%; padding:8px 10px; border-radius:6px; border:1px solid var(--border); font-size:13px;"></textarea></div>
      <div id="cp-error" class="join-error"></div>
      <button id="cp-create" class="btn-sm">Signaler</button>
    </div>
    <div class="panel">
      <div class="panel-title">Alertes (${items.length})</div>
      <table class="data-table">
        <thead><tr><th>Type</th><th>Desk</th><th>Description</th><th>Ancienneté</th><th>Assigné à</th><th>Statut</th><th>Discipline RH</th></tr></thead>
        <tbody>
          ${items.map(i => `
            <tr>
              <td>${escapeHtml(i.type)}</td>
              <td>${escapeHtml(i.desk)}</td>
              <td>${escapeHtml(i.flag)}</td>
              <td>${slaBadge(i.ts)}</td>
              <td>
                <select data-cp-assign="${i.id}" class="btn-sm">
                  <option value="">— Non assigné —</option>
                  ${assignableplayers.map(p => `<option value="${p.id}" ${i.assignedToPlayerId === p.id ? "selected" : ""}>${escapeHtml(p.fullName)}</option>`).join("")}
                </select>
              </td>
              <td><select data-cp-status="${i.id}" class="btn-sm">${COMPLIANCE_STATUSES.map(s => `<option value="${s}" ${i.status === s ? "selected" : ""}>${s}</option>`).join("")}</select></td>
              <td>
                ${i.targetPlayerId ? `
                  <div style="font-size:10.5px; color:var(--text-muted); margin-bottom:3px;">Ciblé : ${escapeHtml(i.targetPlayerName)}</div>
                  <button data-discipline="${i.targetPlayerId}|blame" class="btn-sm" style="padding:2px 6px;">Blâme</button>
                  <button data-discipline="${i.targetPlayerId}|suspend" class="btn-sm" style="padding:2px 6px;">Suspendre</button>
                  <button data-discipline="${i.targetPlayerId}|terminate" class="btn-sm" style="padding:2px 6px; border-color:#ff5c7a; color:#ffb3c1;">Licencier</button>
                ` : "—"}
              </td>
            </tr>
          `).join("") || `<tr><td colspan="7" class="empty-cell">Aucune alerte pour l'instant.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function bindCompliance() {
  const createBtn = document.getElementById("cp-create");
  if (createBtn) createBtn.addEventListener("click", () => {
    socket.emit("compliance:create", {
      type: document.getElementById("cp-type").value,
      desk: document.getElementById("cp-desk").value,
      flag: document.getElementById("cp-flag").value
    });
  });
  document.querySelectorAll("[data-cp-status]").forEach(el => {
    el.addEventListener("change", () => {
      socket.emit("compliance:updateStatus", { itemId: el.getAttribute("data-cp-status"), status: el.value });
    });
  });
  document.querySelectorAll("[data-cp-assign]").forEach(el => {
    el.addEventListener("change", () => {
      socket.emit("compliance:assign", { itemId: el.getAttribute("data-cp-assign"), playerId: el.value || null });
    });
  });
  document.querySelectorAll("[data-discipline]").forEach(el => {
    el.addEventListener("click", () => {
      const [playerId, action] = el.getAttribute("data-discipline").split("|");
      socket.emit("hr:disciplineEmployee", { playerId, action });
    });
  });
  document.querySelectorAll("[data-kill-switch]").forEach(el => {
    el.addEventListener("click", () => socket.emit("compliance:killSwitchTrader", { playerId: el.getAttribute("data-kill-switch") }));
  });
  document.querySelectorAll("[data-freeze-deal]").forEach(el => {
    el.addEventListener("click", () => socket.emit("compliance:freezeDeal", { dealId: el.getAttribute("data-freeze-deal") }));
  });
  document.querySelectorAll("[data-risk-approve]").forEach(el => {
    el.addEventListener("click", () => {
      const dealId = el.getAttribute("data-risk-approve");
      const rateInput = document.querySelector(`[data-risk-rate="${dealId}"]`);
      socket.emit("dealWorkflow:riskDecision", { dealId, decision: "approve", rate: rateInput ? rateInput.value : null });
    });
  });
  document.querySelectorAll("[data-risk-reject]").forEach(el => {
    el.addEventListener("click", () => {
      socket.emit("dealWorkflow:riskDecision", { dealId: el.getAttribute("data-risk-reject"), decision: "reject" });
    });
  });
  bindTaskPanel();
}

PAGE_RENDERERS.compliance = renderCompliance;
PAGE_BINDERS.compliance = bindCompliance;
