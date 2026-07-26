function renderOverview() {
  const kpis = appState.financeKPIs || {};
  return `
    <div class="page-title">Vue d'ensemble</div>
    <div class="page-sub">Tableau de bord partagé — visible par tous les joueurs.</div>
    <div class="kpi-grid">
      <div class="kpi-card"><div class="kpi-label">Joueurs connectés</div><div class="kpi-value">${appState.players.length}</div></div>
      <div class="kpi-card"><div class="kpi-label">AUM</div><div class="kpi-value">${fmtMoney(kpis.aum)}</div></div>
      <div class="kpi-card"><div class="kpi-label">Revenus</div><div class="kpi-value">${fmtMoney(kpis.revenue)}</div></div>
      <div class="kpi-card"><div class="kpi-label">Résultat net</div><div class="kpi-value">${fmtMoney(kpis.netIncome)}</div></div>
    </div>
    <div class="panel-row">
      <div class="panel">
        <div class="panel-title">Équipe en poste</div>
        <table class="data-table">
          <thead><tr><th>Nom</th><th>Grade</th><th>Département</th></tr></thead>
          <tbody>
            ${appState.players.map(p => `
              <tr><td><div class="person-row">${avatarHtml(p.fullName, 24)}<span class="person-row-name">${escapeHtml(p.fullName)}</span></div></td><td>${escapeHtml(p.grade)}</td><td>${deptBadgeHtml(p.dept)}</td></tr>
            `).join("") || `<tr><td colspan="3" class="empty-cell">Personne d'autre pour l'instant.</td></tr>`}
          </tbody>
        </table>
      </div>
      <div class="panel">
        <div class="panel-title">Fil d'activité</div>
        <div class="activity-feed">
          ${appState.activityLog.map(entry => `
            <div class="activity-row">
              <span class="activity-time">${fmtTime(entry.ts)}</span>
              <span class="activity-text">${escapeHtml(entry.text)}</span>
            </div>
          `).join("") || `<div class="empty-cell">Aucune activité pour l'instant.</div>`}
        </div>
      </div>
    </div>
  `;
}

PAGE_RENDERERS.overview = renderOverview;
