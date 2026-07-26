const FIELD_LABELS = {
  revenue: "Revenus",
  netIncome: "Résultat net",
  aum: "AUM",
  costIncomeRatio: "Coefficient d'exploitation"
};

function fieldSeries(history, field, currentValue) {
  const entries = history.filter(h => h.field === field).slice().sort((a, b) => a.ts - b.ts);
  const values = [];
  entries.forEach((h, i) => {
    if (i === 0) values.push(h.oldValue);
    values.push(h.newValue);
  });
  if (!values.length || values[values.length - 1] !== currentValue) values.push(currentValue);
  return values;
}

function capitalRatioColor(ratio) {
  if (ratio >= 12) return "var(--series-green)";
  if (ratio >= 8) return "#f5b942";
  return "var(--series-red)";
}

function renderFinance() {
  const kpis = appState.financeKPIs || {};
  const history = kpis.history || [];
  const budgetVsActual = kpis.budgetVsActual || [];
  const pool = kpis.budgetPool || { total: 0, allocated: 0 };
  const remaining = Math.round((pool.total - pool.allocated) * 10) / 10;
  const quarter = appState.currentQuarter || 1;
  const dividendUsed = kpis.lastDividendQuarter === quarter;
  const retainUsed = kpis.lastRetainQuarter === quarter;
  const capitalRatio = kpis.capitalRatio == null ? 0 : kpis.capitalRatio;

  return `
    <div class="page-title">Finance</div>
    <div class="page-sub">Résultats du groupe — revenus et résultat net proviennent des opérations réelles (deals M&amp;A clôturés, AUM des clients actifs, trimestres résolus), plus aucune saisie libre.</div>
    ${taskPanelHtml("finance")}
    <div class="kpi-grid">
      ${Object.keys(FIELD_LABELS).map(f => `
        <div class="kpi-card">
          <div class="kpi-label">${FIELD_LABELS[f]}</div>
          <div class="kpi-value">${kpis[f]}</div>
          <div class="sparkline-wrap">${sparklineSvg(fieldSeries(history, f, kpis[f]), 130, 28)}</div>
        </div>
      `).join("")}
    </div>
    <div class="panel-row" style="margin-bottom:16px;">
      <div class="panel">
        <div class="panel-title">Ratio de fonds propres (CET1)</div>
        <div style="display:flex; align-items:center; gap:14px;">
          <div style="flex:1; height:16px; background:var(--border); border-radius:8px; overflow:hidden;">
            <div style="width:${Math.max(2, Math.min(100, capitalRatio * 5))}%; height:100%; background:${capitalRatioColor(capitalRatio)}; transition:width 0.3s;"></div>
          </div>
          <div style="font-weight:700; font-size:15px; min-width:52px; text-align:right;">${capitalRatio}%</div>
        </div>
        <div style="font-size:11px; color:var(--text-muted); margin:8px 0 12px;">Fonds propres ${fmtMoney(kpis.equity)} · Actifs pondérés du risque ${fmtMoney(kpis.riskWeightedAssets)} · seuil minimum réglementaire 8 %</div>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button id="fin-dividend" class="btn-sm" ${dividendUsed ? "disabled" : ""}>${dividendUsed ? "Dividende déjà versé ce trimestre" : "Verser un dividende"}</button>
          <button id="fin-retain" class="btn-sm" ${retainUsed ? "disabled" : ""}>${retainUsed ? "Fonds propres déjà renforcés" : "Renforcer les fonds propres"}</button>
        </div>
        <div id="fin-capital-error" class="join-error"></div>
      </div>
      <div class="panel">
        <div class="panel-title">Pool budgétaire trimestriel</div>
        <div style="font-size:12.5px; margin-bottom:10px;">Alloué <b>${pool.allocated}</b> / <b>${pool.total}</b> M$ (40 % des revenus) — ${remaining >= 0 ? `reste <b>${remaining}</b> M$ à répartir.` : `<span style="color:var(--series-red); font-weight:700;">dépassement de ${Math.abs(remaining)} M$ — réduisez des budgets ci-dessous.</span>`}</div>
      </div>
    </div>
    <div class="panel" style="margin-bottom:16px;">
      <div class="panel-title">Budget vs réalisé par département (M$)</div>
      <table class="data-table">
        <thead><tr><th>Département</th><th>Budget alloué</th><th>Réalisé</th><th>Écart</th><th></th></tr></thead>
        <tbody>
          ${budgetVsActual.map(r => {
            const variance = Math.round((r.actual - r.budget) * 10) / 10;
            const cls = variance >= 0 ? "chip-good" : "chip-critical";
            return `
            <tr>
              <td>${deptBadgeHtml(r.dept)}</td>
              <td class="tnum">${r.budget}</td>
              <td class="tnum">${r.actual}</td>
              <td><span class="chip ${cls}">${variance >= 0 ? "+" : ""}${variance}</span></td>
              <td>
                <input data-fin-budget-alloc="${escapeHtml(r.dept)}" type="number" step="1" placeholder="Nouveau budget" style="width:100px; padding:5px 7px; border-radius:6px; border:1px solid var(--border); background:var(--surface-2); color:var(--text-900); font-size:12px;"/>
                <button data-fin-budget-alloc-btn="${escapeHtml(r.dept)}" class="btn-sm">Allouer</button>
                <input data-fin-budget-input="${escapeHtml(r.dept)}" type="number" step="1" placeholder="Nouveau réalisé" style="width:100px; padding:5px 7px; border-radius:6px; border:1px solid var(--border); background:var(--surface-2); color:var(--text-900); font-size:12px;"/>
                <button data-fin-budget-btn="${escapeHtml(r.dept)}" class="btn-sm">OK</button>
              </td>
            </tr>
          `;
          }).join("") || `<tr><td colspan="5" class="empty-cell">Aucune donnée budgétaire.</td></tr>`}
        </tbody>
      </table>
      <div id="fin-budget-error" class="join-error"></div>
    </div>
    <div class="panel">
      <div class="panel-title">Historique des mouvements</div>
      <div class="activity-feed">
        ${history.map(h => `
          <div class="activity-row">
            <span class="activity-time">${fmtTime(h.ts)}</span>
            <span class="activity-text">${escapeHtml(h.byName)} — ${escapeHtml(FIELD_LABELS[h.field] || h.field)} : ${h.oldValue} → ${h.newValue}</span>
          </div>
        `).join("") || `<div class="empty-cell">Aucun mouvement pour l'instant.</div>`}
      </div>
    </div>
  `;
}

function bindFinance() {
  document.querySelectorAll("[data-fin-budget-btn]").forEach(el => {
    el.addEventListener("click", () => {
      const dept = el.getAttribute("data-fin-budget-btn");
      const input = document.querySelector(`[data-fin-budget-input="${dept}"]`);
      const actual = input.value;
      if (actual === "") return;
      socket.emit("finance:updateBudgetActual", { dept, actual });
    });
  });
  document.querySelectorAll("[data-fin-budget-alloc-btn]").forEach(el => {
    el.addEventListener("click", () => {
      const dept = el.getAttribute("data-fin-budget-alloc-btn");
      const input = document.querySelector(`[data-fin-budget-alloc="${dept}"]`);
      const budget = input.value;
      if (budget === "") return;
      socket.emit("finance:allocateBudget", { dept, budget });
    });
  });
  const dividendBtn = document.getElementById("fin-dividend");
  if (dividendBtn) dividendBtn.addEventListener("click", () => socket.emit("finance:capitalAction", { action: "dividend" }));
  const retainBtn = document.getElementById("fin-retain");
  if (retainBtn) retainBtn.addEventListener("click", () => socket.emit("finance:capitalAction", { action: "retain" }));
  bindTaskPanel();
}

PAGE_RENDERERS.finance = renderFinance;
PAGE_BINDERS.finance = bindFinance;
