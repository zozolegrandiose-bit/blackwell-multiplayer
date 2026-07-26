const FIELD_LABELS = {
  revenue: "Revenus",
  netIncome: "Résultat net",
  aum: "AUM",
  costIncomeRatio: "Coefficient d'exploitation"
};

function renderFinance() {
  const kpis = appState.financeKPIs || {};
  const history = kpis.history || [];
  return `
    <div class="page-title">Finance</div>
    <div class="page-sub">Indicateurs financiers du groupe, éditables et historisés.</div>
    <div class="kpi-grid">
      <div class="kpi-card"><div class="kpi-label">Revenus (M$)</div><div class="kpi-value">${kpis.revenue}</div></div>
      <div class="kpi-card"><div class="kpi-label">Résultat net (M$)</div><div class="kpi-value">${kpis.netIncome}</div></div>
      <div class="kpi-card"><div class="kpi-label">AUM (M$)</div><div class="kpi-value">${kpis.aum}</div></div>
      <div class="kpi-card"><div class="kpi-label">Coefficient d'exploitation (%)</div><div class="kpi-value">${kpis.costIncomeRatio}</div></div>
    </div>
    <div class="panel" style="margin-bottom:16px;">
      <div class="panel-title">Modifier un indicateur</div>
      <div class="form-row"><label>Indicateur</label>
        <select id="fin-field">${Object.keys(FIELD_LABELS).map(f => `<option value="${f}">${FIELD_LABELS[f]}</option>`).join("")}</select>
      </div>
      <div class="form-row"><label>Nouvelle valeur</label><input id="fin-value" type="number" step="0.1"/></div>
      <button id="fin-submit" class="btn-sm">Mettre à jour</button>
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
}

PAGE_RENDERERS.finance = renderFinance;
PAGE_BINDERS.finance = bindFinance;
