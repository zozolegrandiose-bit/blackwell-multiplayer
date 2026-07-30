const MA_STAGES = ["Screening", "Due Diligence", "Négociation", "Signing", "Clôturé"];

function computeValuation(p) {
  const years = 5;
  let pvFcf = 0, ebitdaFinal = 0;
  for (let yr = 1; yr <= years; yr++) {
    const revenue = p.revenue1 * Math.pow(1 + p.growth / 100, yr - 1);
    const ebitda = revenue * (p.margin / 100);
    const fcf = ebitda * 0.65;
    pvFcf += fcf / Math.pow(1 + p.wacc / 100, yr);
    if (yr === years) ebitdaFinal = ebitda;
  }
  const terminalValue = ebitdaFinal * p.exitMultiple;
  const pvTv = terminalValue / Math.pow(1 + p.wacc / 100, years);
  return pvFcf + pvTv;
}

const WORKFLOW_METHOD_LABEL = { syndication: "syndication", couverture: "couverture" };

// Renders the current step of the Analyste → Risk Manager → Desk Trading workflow
// for a given deal, from the M&A page's point of view (read-only past the
// submission step — the next two steps happen on Conformité/Marchés).
const NEGOTIATION_CLAUSES_CLIENT = ["Minimale", "Standard", "Renforcée"];

function negotiationHtml(d) {
  if (d.stage !== "Négociation") return "";
  if (!d.negotiation) {
    return `<div class="workflow-box" style="margin-top:8px;"><button data-open-negotiation="${d.id}" class="btn-sm">💬 Ouvrir le canal de négociation (3 min)</button></div>`;
  }
  const neg = d.negotiation;
  return `
    <div class="workflow-box" style="margin-top:8px;">
      <div style="font-size:11px; font-weight:700; color:var(--text-muted); margin-bottom:6px;">💬 Négociation ${neg.active ? "en cours" : "close"}${neg.active ? " — ⏱ " + Math.max(0, Math.round((neg.deadline - Date.now()) / 1000)) + "s" : ""}</div>
      <div style="max-height:120px; overflow-y:auto; margin-bottom:8px;">
        ${neg.messages.map(m => `<div style="font-size:11.5px; padding:2px 0; ${m.from === "us" ? "color:var(--series-green);" : ""}">${escapeHtml(m.text)}</div>`).join("")}
      </div>
      ${neg.active ? `
        <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
          <input data-negotiation-offer="${d.id}" type="number" step="1" placeholder="Votre offre (M$)" style="width:130px; padding:5px 7px; border-radius:6px; border:1px solid var(--border); background:var(--surface-2); color:var(--text-900); font-size:11.5px;"/>
          <select data-negotiation-clause="${d.id}" class="btn-sm">
            ${NEGOTIATION_CLAUSES_CLIENT.map(c => `<option value="${c}" ${neg.clause === c ? "selected" : ""}>${c}</option>`).join("")}
          </select>
          <button data-negotiation-submit="${d.id}" class="btn-sm">Proposer</button>
        </div>
      ` : neg.agreedPrice ? `<div style="font-size:12px; color:var(--series-green);">✅ Accord à ${fmtMoney(neg.agreedPrice)}</div>` : `<div style="font-size:12px; color:var(--text-muted);">Aucun accord trouvé.</div>`}
    </div>
  `;
}

function dataRoomHtml(d) {
  if (!d.dataRoom) return "";
  const dr = d.dataRoom;
  return `
    <div class="workflow-box" style="margin-top:8px;">
      <div style="font-size:11px; font-weight:700; color:var(--text-muted); margin-bottom:6px;">📁 Data Room</div>
      <div class="credit-file-grid">
        <div class="credit-file-item"><div class="credit-file-value">${fmtMoney(dr.bilanFinancier)}</div><div class="credit-file-label">Bilan financier</div></div>
        <div class="credit-file-item"><div class="credit-file-value">${fmtMoney(dr.ebitda)}</div><div class="credit-file-label">EBITDA</div></div>
        <div class="credit-file-item"><div class="credit-file-value">${fmtMoney(dr.detteNette)}</div><div class="credit-file-label">Dette nette</div></div>
      </div>
      ${dr.analyzed
        ? `<div style="font-size:12px; margin-top:6px; color:${d.valuation > dr.fairValue * 1.1 ? "var(--series-red)" : d.valuation < dr.fairValue * 0.9 ? "var(--series-green)" : "var(--text-600)"};">Juste valeur estimée : <b>${fmtMoney(dr.fairValue)}</b> (proposée à ${fmtMoney(d.valuation)})</div>`
        : `<button data-analyze-dataroom="${d.id}" class="btn-sm" style="margin-top:6px;">Analyser la data room</button>`}
    </div>
  `;
}

function workflowSectionHtml(d) {
  const wf = d.workflow;
  if (!wf) {
    if (d.stage === "Clôturé") return "";
    return `
      <div class="workflow-box">
        <div style="font-size:11px; font-weight:700; color:var(--text-muted); margin-bottom:6px;">Workflow d'exécution</div>
        <div style="display:flex; gap:6px; align-items:center;">
          <input data-wf-rate="${d.id}" type="number" step="0.1" min="0.1" placeholder="Taux %" style="width:80px; padding:5px 7px; border-radius:6px; border:1px solid var(--border); background:var(--surface-2); color:var(--text-900); font-size:12px;"/>
          <button data-wf-submit="${d.id}" class="btn-sm">Soumettre au Risque</button>
        </div>
      </div>
    `;
  }
  if (wf.phase === "pending_risk") {
    return `<div class="workflow-box"><span class="chip chip-warning">⏳ En attente de validation Risque</span> <span style="font-size:11px; color:var(--text-muted);">taux proposé ${wf.rate} %</span></div>`;
  }
  if (wf.phase === "pending_execution") {
    return `<div class="workflow-box"><span class="chip chip-good">✅ Validé par ${escapeHtml(wf.riskDecisionByName)}</span> <span style="font-size:11px; color:var(--text-muted);">taux ${wf.rate} % — exécution attendue sur Marchés</span>${wf.aiComment ? `<div style="font-size:11px; color:var(--text-muted); margin-top:4px; font-style:italic;">💬 « ${escapeHtml(wf.aiComment)} »</div>` : ""}</div>`;
  }
  if (wf.phase === "executed") {
    return `<div class="workflow-box"><span class="chip chip-good">💼 Exécuté en ${WORKFLOW_METHOD_LABEL[wf.method] || ""} — +${wf.netFee} M$</span></div>`;
  }
  if (wf.phase === "expired") {
    return `<div class="workflow-box"><span class="chip chip-critical">⌛ Exécution expirée — occasion manquée</span></div>`;
  }
  return "";
}

// Only a Head of CIB (Director+ within cluster A) sees this -- server/cibBonus.js
// precomputes player.isHeadOfCIB at join time rather than duplicating the grade
// index comparison client-side.
// IPO (server/ipo.js) -- banks compete for the underwriting mandate of a client
// company. Rendered whenever appState.ipo is truthy, regardless of who's currently
// looking, since the pitch/price/intention actions are each individually gated by
// the server on the right access room -- the panel itself just adapts to phase.
function ipoPanelHtml() {
  const ipo = appState.ipo;
  if (!ipo) return "";

  if (ipo.phase === "bidding") {
    const secondsLeft = Math.max(0, Math.round((ipo.biddingDeadline - Date.now()) / 1000));
    return `
      <div class="panel" style="margin-bottom:16px; border-color:rgba(46,230,166,0.35);">
        <div class="panel-title">🔔 Appel d'offres IPO — ${escapeHtml(ipo.companyName)} (${escapeHtml(ipo.industry)})</div>
        <div style="font-size:12px; color:var(--text-muted); margin-bottom:10px;">Valorisation estimée ${fmtMoney(ipo.companyValuation)} · ⏱ ${secondsLeft}s avant attribution du mandat.</div>
        ${ipo.blackwellPitchSubmitted
          ? `<div style="font-size:12.5px; color:var(--series-green);">✅ Pitch soumis par ${escapeHtml(ipo.blackwellPitchByName)} — décision imminente.</div>`
          : `<button id="ipo-pitch-submit" class="btn-sm">Soumettre notre pitch</button>`}
      </div>
    `;
  }

  if (ipo.phase === "bookbuilding") {
    const secondsLeft = Math.max(0, Math.round((ipo.bookbuildingDeadline - Date.now()) / 1000));
    const totalDemand = ipo.intentions.reduce((s, i) => s + i.amount, 0);
    const demandPct = ipo.offeringSize > 0 ? Math.min(200, Math.round((totalDemand / ipo.offeringSize) * 100)) : 0;
    return `
      <div class="panel" style="margin-bottom:16px; border-color:rgba(46,230,166,0.35);">
        <div class="panel-title">🏆 Mandat IPO remporté — ${escapeHtml(ipo.companyName)}</div>
        <div style="font-size:12px; color:var(--text-muted); margin-bottom:10px;">Taille de l'offre ${fmtMoney(ipo.offeringSize)} · fourchette indicative ${ipo.priceRangeLow}–${ipo.priceRangeHigh} €/action · ⏱ ${secondsLeft}s</div>
        ${ipo.finalPrice === null ? `
          <div style="display:flex; gap:8px; align-items:center;">
            <input id="ipo-price-input" type="number" step="0.1" min="0.1" placeholder="Prix (€/action)" style="width:150px; padding:6px 8px; border-radius:6px; border:1px solid var(--border); background:var(--surface-2); color:var(--text-900); font-size:12px;"/>
            <button id="ipo-price-submit" class="btn-sm">Fixer le prix</button>
          </div>
        ` : `
          <div style="font-size:12.5px; margin-bottom:8px;">Prix fixé par ${escapeHtml(ipo.pricedByName)} à <b>${ipo.finalPrice} €/action</b>.</div>
          <div style="display:flex; align-items:center; gap:10px; margin-bottom:10px;">
            <div style="flex:1; height:12px; background:var(--border); border-radius:6px; overflow:hidden;">
              <div style="width:${demandPct}%; height:100%; background:${demandPct >= 100 ? "var(--series-green)" : "#f5b942"};"></div>
            </div>
            <div style="font-size:11px; color:var(--text-muted); white-space:nowrap;">${fmtMoney(totalDemand)} / ${fmtMoney(ipo.offeringSize)}</div>
          </div>
          <div style="display:flex; gap:8px; align-items:center; margin-bottom:8px;">
            <input id="ipo-intention-input" type="number" step="1" min="1" placeholder="Intention (M$)" style="width:150px; padding:6px 8px; border-radius:6px; border:1px solid var(--border); background:var(--surface-2); color:var(--text-900); font-size:12px;"/>
            <button id="ipo-intention-submit" class="btn-sm">Soumettre une intention</button>
          </div>
          ${ipo.intentions.length ? `
            <div style="font-size:11px; color:var(--text-muted);">
              ${ipo.intentions.slice(0, 5).map(i => `${i.isAI ? "🏦" : "👤"} ${escapeHtml(i.investorName)} — ${fmtMoney(i.amount)}`).join(" · ")}
            </div>
          ` : ""}
        `}
      </div>
    `;
  }

  return "";
}

// Visible to everyone (org-chart-level info, not financial) -- the AI board's
// formal Head of CIB office, distinct from the broader isHeadOfCIB permission
// any qualifying Director+ in cluster A holds.
function boardOfDirectorsStatusHtml() {
  const leadership = appState.cibLeadership;
  if (!leadership) return "";
  return `
    <div class="panel" style="margin-bottom:16px;">
      <div class="panel-title">🏛 Head of CIB (Conseil d'Administration)</div>
      <div style="font-size:12.5px;">
        ${leadership.holderName
          ? `<b>${escapeHtml(leadership.holderName)}</b>${leadership.consecutiveBadCycles > 0 ? ` — <span style="color:var(--series-red);">${leadership.consecutiveBadCycles} période(s) de sous-performance consécutive(s)</span>` : ` — <span style="color:var(--series-green);">performance saine</span>`}`
          : `<span style="color:var(--text-muted);">Poste vacant — le Conseil d'Administration cherche un(e) candidat(e) éligible.</span>`}
      </div>
    </div>
  `;
}

function pitchbookPanelHtml() {
  const competitions = (appState.pitchbookCompetitions || []).filter(c => !c.resolved);
  if (!competitions.length) return "";
  return `
    <div class="panel" style="margin-bottom:16px;">
      <div class="panel-title">📋 Pitchbook Competition</div>
      ${competitions.map(c => {
        const ourBid = c.bids.find(b => b.bankName === "Blackwell & Co Capital");
        return `
        <div style="border:1px solid var(--border); border-radius:8px; padding:10px 12px; margin-bottom:8px;">
          <div style="font-weight:700; font-size:12.5px;">${escapeHtml(c.clientName)} <span class="chip chip-neutral">${escapeHtml(c.dealType || "M&A")}</span> — valorisation indicative ${fmtMoney(c.targetValuation)}</div>
          <div style="font-size:11px; color:var(--text-muted); margin:4px 0 8px;">⏱ ${Math.max(0, Math.round((c.deadline - Date.now()) / 1000))}s restantes · ${c.bids.length} offre(s) reçue(s)</div>
          ${ourBid ? `
            <div style="font-size:11.5px; color:var(--series-green);">✅ Votre offre : commission ${ourBid.commissionRate}%</div>
          ` : `
            <div style="display:flex; gap:6px; align-items:center;">
              <input data-pitchbook-commission="${c.id}" type="number" step="0.1" min="0.5" max="5" placeholder="Commission %" style="width:120px; padding:5px 7px; border-radius:6px; border:1px solid var(--border); background:var(--surface-2); color:var(--text-900); font-size:11.5px;"/>
              <button data-pitchbook-submit="${c.id}" class="btn-sm">Soumettre l'offre</button>
            </div>
          `}
        </div>
      `;
      }).join("")}
      <div id="pitchbook-error" class="join-error"></div>
    </div>
  `;
}

// Hostile Takeover & M&A Defense (Patch 24) -- a predator bank threatens an
// active deal in the pipeline; deploy Poison Pill (instant, dilutes the deal's
// valuation) or Chevalier Blanc (no cost, but unavailable in the final 30s)
// before the 90s countdown runs out or the client is lost outright.
function hostileTakeoverPanelHtml() {
  const takeovers = (appState.hostileTakeovers || []).filter(t => t.status === "Active");
  if (!takeovers.length) return "";
  return `
    <div class="panel" style="margin-bottom:16px; border-color:rgba(239,68,68,0.4);">
      <div class="panel-title">⚔️ OPA Hostile — Défense M&amp;A requise</div>
      ${takeovers.map(t => {
        const secondsLeft = Math.max(0, Math.round((t.deadline - Date.now()) / 1000));
        const whiteKnightAvailable = (t.deadline - Date.now()) >= 30000;
        return `
        <div style="border:1px solid var(--series-red); border-radius:8px; padding:10px 12px; margin-bottom:8px;">
          <div style="font-weight:700; font-size:12.5px;">« ${escapeHtml(t.dealName)} » attaqué par ${escapeHtml(t.predatorName)}</div>
          <div class="event-banner-deadline" style="margin:4px 0 8px;">⏱ ${secondsLeft}s pour défendre</div>
          <div style="display:flex; gap:8px;">
            <button data-ht-defend="${t.id}|poisonPill" class="btn-sm">🧪 Poison Pill</button>
            <button data-ht-defend="${t.id}|whiteKnight" class="btn-sm" ${whiteKnightAvailable ? "" : "disabled"}>🐎 Chevalier Blanc${whiteKnightAvailable ? "" : " (trop tard)"}</button>
          </div>
        </div>
      `;
      }).join("")}
      <div id="ht-defense-error" class="join-error"></div>
    </div>
  `;
}

function cibBonusPanelHtml() {
  if (!appState.player.isHeadOfCIB) return "";
  const pool = appState.cibBonusPool || { available: 0, distributedLog: [] };
  const cibTeam = (appState.players || []).filter(p => p.cluster === "A");
  return `
    <div class="panel" style="margin-bottom:16px;">
      <div class="panel-title">💼 Bonus Pool CIB — enveloppe disponible : ${fmtMoney(pool.available)}</div>
      <div style="font-size:11.5px; color:var(--text-muted); margin-bottom:10px;">Accumulée automatiquement à chaque clôture de journée de marché (6% du résultat net positif du jour) — à vous de la répartir dans votre équipe Dealmaking.</div>
      <table class="data-table">
        <thead><tr><th>Collaborateur</th><th>Montant (M$)</th></tr></thead>
        <tbody>
          ${cibTeam.map(p => `
            <tr>
              <td><div class="person-row">${avatarHtml(p.fullName, 20)}<span class="person-row-name">${escapeHtml(p.fullName)}</span></div></td>
              <td><input data-cib-bonus-input="${p.id}" type="number" step="0.1" min="0" placeholder="0" style="width:90px; padding:5px 7px; border-radius:6px; border:1px solid var(--border); background:var(--surface-2); color:var(--text-900); font-size:12px;"/></td>
            </tr>
          `).join("")}
          <tr>
            <td>🤖 Équipe IA — CIB <span style="font-size:11px; color:var(--text-muted);">(postes non pourvus)</span></td>
            <td><input data-cib-bonus-input="ai-team" type="number" step="0.1" min="0" placeholder="0" style="width:90px; padding:5px 7px; border-radius:6px; border:1px solid var(--border); background:var(--surface-2); color:var(--text-900); font-size:12px;"/></td>
          </tr>
        </tbody>
      </table>
      <button id="cib-bonus-submit" class="btn-sm" style="margin-top:10px;">Distribuer le bonus CIB</button>
      <div id="cib-bonus-error" class="join-error"></div>
      ${(pool.distributedLog || []).length ? `
        <div style="margin-top:10px; font-size:11px; color:var(--text-muted);">
          Dernière répartition : ${escapeHtml(pool.distributedLog[0].byName)} — ${fmtMoney(pool.distributedLog[0].total)} entre ${pool.distributedLog[0].recipients.join(", ")}.
        </div>
      ` : ""}
    </div>
  `;
}

function renderMa() {
  const deals = appState.maDeals || [];
  return `
    <div class="page-title">M&amp;A</div>
    <div class="page-sub">Pipeline d'opérations — visible par le Board Of Directors et les métiers de dealmaking.</div>
    ${taskPanelHtml("ma")}
    ${hostileTakeoverPanelHtml()}
    ${boardOfDirectorsStatusHtml()}
    ${pitchbookPanelHtml()}
    ${ipoPanelHtml()}
    ${cibBonusPanelHtml()}
    <div class="panel" style="margin-bottom:16px;">
      <div class="panel-title">Nouveau projet</div>
      <div class="form-row"><label>Nom du projet</label><input id="ma-name" type="text" placeholder="ex. Projet Atlas — acquisition XYZ"/></div>
      <div class="form-row"><label>Description</label><textarea id="ma-desc" rows="2" placeholder="Résumé de l'opération…" style="width:100%; padding:8px 10px; border-radius:6px; border:1px solid var(--border); font-size:13px;"></textarea></div>
      <div class="form-row"><label>Valorisation estimée (M$)</label><input id="ma-valuation" type="number" placeholder="ex. 500"/></div>
      <div class="form-row"><label>Synergies estimées (M$)</label><input id="ma-synergies" type="number" placeholder="ex. 20"/></div>
      <div id="ma-error" class="join-error"></div>
      <button id="ma-create" class="btn-sm">Créer le projet</button>
    </div>
    <div class="panel" style="margin-bottom:16px;">
      <div class="panel-title">🧮 Simulateur de valorisation (DCF simplifié, 5 ans)</div>
      <div class="card-sub" style="font-size:11.5px; color:var(--text-muted); margin-bottom:10px;">Calcul indicatif, non contractuel.</div>
      <div class="form-row"><label>Revenu Année 1 : <span id="vs-revenue-val">100</span> M$</label><input type="range" id="vs-revenue" min="10" max="1000" step="10" value="100" style="width:100%;"/></div>
      <div class="form-row"><label>Croissance annuelle : <span id="vs-growth-val">8</span> %</label><input type="range" id="vs-growth" min="0" max="30" step="1" value="8" style="width:100%;"/></div>
      <div class="form-row"><label>Marge EBITDA : <span id="vs-margin-val">30</span> %</label><input type="range" id="vs-margin" min="5" max="60" step="1" value="30" style="width:100%;"/></div>
      <div class="form-row"><label>WACC : <span id="vs-wacc-val">9</span> %</label><input type="range" id="vs-wacc" min="5" max="15" step="0.5" value="9" style="width:100%;"/></div>
      <div class="form-row"><label>Multiple de sortie : <span id="vs-multiple-val">8</span>x EBITDA</label><input type="range" id="vs-multiple" min="4" max="15" step="0.5" value="8" style="width:100%;"/></div>
      <div class="kpi-card" style="margin-top:10px;"><div class="kpi-label">Valeur d'entreprise estimée</div><div class="kpi-value" id="vs-out-ev">—</div></div>
    </div>
    <div class="panel">
      <div class="panel-title">Projets en cours (${deals.length})</div>
      ${deals.map(d => `
        <div class="activity-row" style="display:block; padding:10px 0;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div style="font-weight:700; font-size:13px;">${escapeHtml(d.name)}</div>
            <select data-ma-stage="${d.id}" class="btn-sm">
              ${MA_STAGES.map(s => `<option value="${s}" ${d.stage === s ? "selected" : ""}>${s}</option>`).join("")}
            </select>
          </div>
          <div style="font-size:11px; color:var(--text-muted); margin:4px 0;">Banquier responsable : ${escapeHtml(d.leadBankerName)} · Valorisation : ${fmtMoney(d.valuation)} · Synergies : ${d.synergies ? fmtMoney(d.synergies) : "—"}</div>
          <div style="font-size:12.5px; margin-bottom:8px;">${escapeHtml(d.description) || "—"}</div>
          <div style="display:flex; gap:24px; flex-wrap:wrap;">
            <div>
              <div style="font-size:11px; font-weight:700; color:var(--text-muted); margin-bottom:4px;">Due diligence</div>
              ${d.ddChecklist.map((c, i) => `
                <label style="display:block; font-size:12px; margin-bottom:2px;">
                  <input type="checkbox" data-ma-checklist="${d.id}|${i}" ${c.done ? "checked" : ""}/> ${escapeHtml(c.item)}
                </label>
              `).join("")}
            </div>
            <div>
              <div style="font-size:11px; font-weight:700; color:var(--text-muted); margin-bottom:4px;">Vote du comité d'investissement</div>
              ${(d.icVote || []).map((c, i) => `
                <label style="display:block; font-size:12px; margin-bottom:2px;">
                  <input type="checkbox" data-ma-icvote="${d.id}|${i}" ${c.done ? "checked" : ""}/> ${escapeHtml(c.item)}
                </label>
              `).join("")}
            </div>
          </div>
          ${dataRoomHtml(d)}
          ${negotiationHtml(d)}
          ${workflowSectionHtml(d)}
        </div>
      `).join("") || `<div class="empty-cell">Aucun projet en cours.</div>`}
    </div>
  `;
}

function bindMaValuationSim() {
  const revenue = document.getElementById("vs-revenue");
  const growth = document.getElementById("vs-growth");
  const margin = document.getElementById("vs-margin");
  const wacc = document.getElementById("vs-wacc");
  const multiple = document.getElementById("vs-multiple");
  if (!revenue) return;
  function update() {
    document.getElementById("vs-revenue-val").textContent = revenue.value;
    document.getElementById("vs-growth-val").textContent = growth.value;
    document.getElementById("vs-margin-val").textContent = margin.value;
    document.getElementById("vs-wacc-val").textContent = Number(wacc.value).toFixed(1);
    document.getElementById("vs-multiple-val").textContent = Number(multiple.value).toFixed(1);
    const ev = computeValuation({
      revenue1: Number(revenue.value), growth: Number(growth.value), margin: Number(margin.value),
      wacc: Number(wacc.value), exitMultiple: Number(multiple.value)
    });
    document.getElementById("vs-out-ev").textContent = fmtMoney(ev);
  }
  [revenue, growth, margin, wacc, multiple].forEach(el => el.addEventListener("input", update));
  update();
}

function bindMa() {
  const createBtn = document.getElementById("ma-create");
  if (createBtn) createBtn.addEventListener("click", () => {
    socket.emit("ma:create", {
      name: document.getElementById("ma-name").value,
      description: document.getElementById("ma-desc").value,
      valuation: document.getElementById("ma-valuation").value,
      synergies: document.getElementById("ma-synergies").value
    });
  });
  document.querySelectorAll("[data-ma-stage]").forEach(el => {
    el.addEventListener("change", () => {
      socket.emit("ma:updateStage", { dealId: el.getAttribute("data-ma-stage"), stage: el.value });
    });
  });
  document.querySelectorAll("[data-ht-defend]").forEach(el => {
    el.addEventListener("click", () => {
      const [takeoverId, strategy] = el.getAttribute("data-ht-defend").split("|");
      const errEl = document.getElementById("ht-defense-error");
      if (errEl) errEl.textContent = "";
      socket.emit("ma:deployDefense", { takeoverId, strategy });
    });
  });
  document.querySelectorAll("[data-ma-checklist]").forEach(el => {
    el.addEventListener("change", () => {
      const [dealId, index] = el.getAttribute("data-ma-checklist").split("|");
      socket.emit("ma:toggleChecklist", { dealId, index: Number(index) });
    });
  });
  document.querySelectorAll("[data-ma-icvote]").forEach(el => {
    el.addEventListener("change", () => {
      const [dealId, index] = el.getAttribute("data-ma-icvote").split("|");
      socket.emit("ma:toggleIcVote", { dealId, index: Number(index) });
    });
  });
  document.querySelectorAll("[data-wf-submit]").forEach(el => {
    el.addEventListener("click", () => {
      const dealId = el.getAttribute("data-wf-submit");
      const rateInput = document.querySelector(`[data-wf-rate="${dealId}"]`);
      const rate = rateInput ? rateInput.value : "";
      if (!rate) return;
      socket.emit("dealWorkflow:submitToRisk", { dealId, rate });
    });
  });
  document.querySelectorAll("[data-analyze-dataroom]").forEach(el => {
    el.addEventListener("click", () => socket.emit("ma:analyzeDataRoom", { dealId: el.getAttribute("data-analyze-dataroom") }));
  });
  document.querySelectorAll("[data-open-negotiation]").forEach(el => {
    el.addEventListener("click", () => socket.emit("ma:openNegotiation", { dealId: el.getAttribute("data-open-negotiation") }));
  });
  document.querySelectorAll("[data-negotiation-submit]").forEach(el => {
    el.addEventListener("click", () => {
      const dealId = el.getAttribute("data-negotiation-submit");
      const offerInput = document.querySelector(`[data-negotiation-offer="${dealId}"]`);
      const clauseSelect = document.querySelector(`[data-negotiation-clause="${dealId}"]`);
      const offerPrice = Number(offerInput && offerInput.value);
      if (!offerPrice) return;
      socket.emit("ma:submitNegotiationOffer", { dealId, offerPrice, clause: clauseSelect ? clauseSelect.value : null });
    });
  });
  const ipoPitchBtn = document.getElementById("ipo-pitch-submit");
  if (ipoPitchBtn) ipoPitchBtn.addEventListener("click", () => socket.emit("ipo:submitPitch"));
  const ipoPriceBtn = document.getElementById("ipo-price-submit");
  if (ipoPriceBtn) ipoPriceBtn.addEventListener("click", () => {
    const price = Number(document.getElementById("ipo-price-input").value);
    if (price > 0) socket.emit("ipo:setPrice", { price });
  });
  const ipoIntentionBtn = document.getElementById("ipo-intention-submit");
  if (ipoIntentionBtn) ipoIntentionBtn.addEventListener("click", () => {
    const amount = Number(document.getElementById("ipo-intention-input").value);
    if (amount > 0) socket.emit("ipo:submitIntention", { amount });
  });
  const cibBtn = document.getElementById("cib-bonus-submit");
  if (cibBtn) cibBtn.addEventListener("click", () => {
    const allocations = {};
    document.querySelectorAll("[data-cib-bonus-input]").forEach(el => {
      const amount = Number(el.value);
      if (amount > 0) allocations[el.getAttribute("data-cib-bonus-input")] = amount;
    });
    socket.emit("cib:distributeBonus", { allocations });
  });
  document.querySelectorAll("[data-pitchbook-submit]").forEach(el => {
    el.addEventListener("click", () => {
      const competitionId = el.getAttribute("data-pitchbook-submit");
      const input = document.querySelector(`[data-pitchbook-commission="${competitionId}"]`);
      const commissionRate = Number(input && input.value);
      const errEl = document.getElementById("pitchbook-error");
      if (errEl) errEl.textContent = "";
      if (!commissionRate) {
        if (errEl) errEl.textContent = "Indiquez un taux de commission.";
        return;
      }
      socket.emit("pitchbook:submitBid", { competitionId, commissionRate });
    });
  });
  bindMaValuationSim();
  bindTaskPanel();
}

PAGE_RENDERERS.ma = renderMa;
PAGE_BINDERS.ma = bindMa;
