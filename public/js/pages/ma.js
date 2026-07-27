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
    return `<div class="workflow-box"><span class="chip chip-good">✅ Validé par ${escapeHtml(wf.riskDecisionByName)}</span> <span style="font-size:11px; color:var(--text-muted);">taux ${wf.rate} % — exécution attendue sur Marchés</span></div>`;
  }
  if (wf.phase === "executed") {
    return `<div class="workflow-box"><span class="chip chip-good">💼 Exécuté en ${WORKFLOW_METHOD_LABEL[wf.method] || ""} — +${wf.netFee} M$</span></div>`;
  }
  if (wf.phase === "expired") {
    return `<div class="workflow-box"><span class="chip chip-critical">⌛ Exécution expirée — occasion manquée</span></div>`;
  }
  return "";
}

function renderMa() {
  const deals = appState.maDeals || [];
  return `
    <div class="page-title">M&amp;A</div>
    <div class="page-sub">Pipeline d'opérations — visible par Direction Générale et les métiers de dealmaking.</div>
    ${taskPanelHtml("ma")}
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
  bindMaValuationSim();
  bindTaskPanel();
}

PAGE_RENDERERS.ma = renderMa;
PAGE_BINDERS.ma = bindMa;
