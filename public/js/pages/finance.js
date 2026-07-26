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

function renderFinance() {
  const kpis = appState.financeKPIs || {};
  const history = kpis.history || [];
  const budgetVsActual = kpis.budgetVsActual || [];
  return `
    <div class="page-title">Finance</div>
    <div class="page-sub">Indicateurs financiers du groupe, éditables et historisés.</div>
    <div class="kpi-grid">
      ${Object.keys(FIELD_LABELS).map(f => `
        <div class="kpi-card">
          <div class="kpi-label">${FIELD_LABELS[f]}</div>
          <div class="kpi-value">${kpis[f]}</div>
          <div class="sparkline-wrap">${sparklineSvg(fieldSeries(history, f, kpis[f]), 130, 28)}</div>
        </div>
      `).join("")}
    </div>
    <div class="panel" style="margin-bottom:16px;">
      <div class="panel-title">Modifier un indicateur</div>
      <div class="form-row"><label>Indicateur</label>
        <select id="fin-field">${Object.keys(FIELD_LABELS).map(f => `<option value="${f}">${FIELD_LABELS[f]}</option>`).join("")}</select>
      </div>
      <div class="form-row"><label>Nouvelle valeur</label><input id="fin-value" type="number" step="0.1"/></div>
      <button id="fin-submit" class="btn-sm">Mettre à jour</button>
    </div>
    <div class="panel" style="margin-bottom:16px;">
      <div class="panel-title">Budget vs réalisé par département (M$)</div>
      <table class="data-table">
        <thead><tr><th>Département</th><th>Budget</th><th>Réalisé</th><th>Écart</th><th></th></tr></thead>
        <tbody>
          ${budgetVsActual.map(r => {
            const variance = r.actual - r.budget;
            const cls = variance >= 0 ? "chip-good" : "chip-critical";
            return `
            <tr>
              <td>${deptBadgeHtml(r.dept)}</td>
              <td class="tnum">${r.budget}</td>
              <td class="tnum">${r.actual}</td>
              <td><span class="chip ${cls}">${variance >= 0 ? "+" : ""}${variance}</span></td>
              <td>
                <input data-fin-budget-input="${escapeHtml(r.dept)}" type="number" step="1" placeholder="Nouveau réalisé" style="width:110px; padding:5px 7px; border-radius:6px; border:1px solid var(--line-200); font-size:12px;"/>
                <button data-fin-budget-btn="${escapeHtml(r.dept)}" class="btn-sm">OK</button>
              </td>
            </tr>
          `;
          }).join("") || `<tr><td colspan="5" class="empty-cell">Aucune donnée budgétaire.</td></tr>`}
        </tbody>
      </table>
    </div>
    <div class="panel">
      <div class="panel-title">Historique des modifications</div>
      <div class="activity-feed">
        ${history.map(h => `
          <div class="activity-row">
            <span class="activity-time">${fmtTime(h.ts)}</span>
            <span class="activity-text">${escapeHtml(h.byName)} a modifié ${escapeHtml(FIELD_LABELS[h.field])} : ${h.oldValue} → ${h.newValue}</span>
          </div>
        `).join("") || `<div class="empty-cell">Aucune modification pour l'instant.</div>`}
      </div>
    </div>
  `;
}

function bindFinance() {
  const submitBtn = document.getElementById("fin-submit");
  if (submitBtn) submitBtn.addEventListener("click", () => {
    socket.emit("finance:updateKPI", {
      field: document.getElementById("fin-field").value,
      value: document.getElementById("fin-value").value
    });
  });
  document.querySelectorAll("[data-fin-budget-btn]").forEach(el => {
    el.addEventListener("click", () => {
      const dept = el.getAttribute("data-fin-budget-btn");
      const input = document.querySelector(`[data-fin-budget-input="${dept}"]`);
      const actual = input.value;
      if (actual === "") return;
      socket.emit("finance:updateBudgetActual", { dept, actual });
    });
  });
}

PAGE_RENDERERS.finance = renderFinance;
PAGE_BINDERS.finance = bindFinance;
