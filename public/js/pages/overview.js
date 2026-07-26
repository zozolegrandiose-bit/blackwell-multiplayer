function bankHealthColor(health) {
  if (health >= 60) return "var(--series-green)";
  if (health >= 30) return "#f5b942";
  return "var(--series-red)";
}

const TASK_SUMMARY_LABELS = { ma: "M&A", clients: "Clients", compliance: "Conformité", hr: "RH", finance: "Finance" };

function taskSummaryPanelHtml() {
  const summary = appState.tasksSummary || {};
  const total = Object.values(summary).reduce((a, b) => a + b, 0);
  return `
    <div class="panel task-panel" style="margin-bottom:16px;">
      <div class="panel-title">⚡ Tâches rapides en cours (${total})</div>
      <div class="task-summary-grid">
        ${Object.keys(TASK_SUMMARY_LABELS).map(page => `
          <div class="task-summary-item">
            <div class="task-summary-count">${summary[page] || 0}</div>
            <div class="task-summary-label">${TASK_SUMMARY_LABELS[page]}</div>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

const OVERVIEW_CLUSTER_LABELS = {
  A: "Dealmaking (M&A, ECM, DCM…)",
  B: "Marchés & Recherche",
  C: "Gestion de Fortune & Actifs",
  D: "Conformité, Risque & Juridique",
  E: "Finance & Trésorerie",
  F: "RH & Communication",
  G: "Direction Générale"
};

function clusterLeaderboardHtml() {
  const totals = {};
  appState.players.forEach(p => {
    if (!p.cluster) return;
    totals[p.cluster] = (totals[p.cluster] || 0) + scoreForPlayer(appState.playerScores, p.fullName);
  });
  const rows = Object.keys(totals).sort((a, b) => totals[b] - totals[a]);
  return `
    <div class="panel">
      <div class="panel-title">🏢 Classement par département</div>
      <table class="data-table">
        <thead><tr><th>#</th><th>Département</th><th>Score cumulé</th></tr></thead>
        <tbody>
          ${rows.map((cluster, i) => `
            <tr><td class="tnum">${i + 1}</td><td>${escapeHtml(OVERVIEW_CLUSTER_LABELS[cluster] || cluster)}</td><td class="tnum">${totals[cluster]}</td></tr>
          `).join("") || `<tr><td colspan="3" class="empty-cell">Aucun score pour l'instant.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function hallOfFameHtml() {
  const hallOfFame = appState.hallOfFame || [];
  if (!hallOfFame.length) return "";
  return `
    <div class="panel" style="margin-bottom:16px;">
      <div class="panel-title">🏛 Hall of Fame — meilleurs scores toutes parties confondues</div>
      <table class="data-table">
        <thead><tr><th>#</th><th>Joueur</th><th>Score</th><th>Trimestre</th></tr></thead>
        <tbody>
          ${hallOfFame.map((entry, i) => `
            <tr><td class="tnum">${i + 1}</td><td>${escapeHtml(entry.fullName)}</td><td class="tnum">${entry.score}</td><td class="tnum">T${entry.quarter}</td></tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderOverview() {
  const kpis = appState.financeKPIs || {};
  const health = appState.bankHealth == null ? 100 : appState.bankHealth;
  const leaderboard = Object.values(appState.playerScores || {}).sort((a, b) => b.score - a.score).slice(0, 5);

  return `
    <div class="page-title">Vue d'ensemble</div>
    <div class="page-sub">Tableau de bord partagé — visible par tous les joueurs.</div>
    ${taskSummaryPanelHtml()}
    ${hallOfFameHtml()}
    <div class="panel-row" style="margin-bottom:16px;">
      <div class="panel">
        <div class="panel-title">Santé de la banque</div>
        <div style="display:flex; align-items:center; gap:14px;">
          <div style="flex:1; height:16px; background:var(--border); border-radius:8px; overflow:hidden;">
            <div style="width:${health}%; height:100%; background:${bankHealthColor(health)}; transition:width 0.3s;"></div>
          </div>
          <div style="font-weight:700; font-size:15px; min-width:48px; text-align:right;">${Math.round(health)}%</div>
        </div>
      </div>
      <div class="panel">
        <div class="panel-title">🎯 Objectif de campagne</div>
        ${(() => {
          const goal = appState.campaignGoal || { targetAUM: 500000 };
          const pct = Math.min(100, Math.round((kpis.aum || 0) / goal.targetAUM * 100));
          return `
          <div style="display:flex; align-items:center; gap:14px;">
            <div style="flex:1; height:16px; background:var(--border); border-radius:8px; overflow:hidden;">
              <div style="width:${pct}%; height:100%; background:var(--accent-2); transition:width 0.3s;"></div>
            </div>
            <div style="font-weight:700; font-size:15px; min-width:48px; text-align:right;">${pct}%</div>
          </div>
          <div style="font-size:11px; color:var(--text-muted); margin-top:6px;">${fmtMoney(kpis.aum)} / ${fmtMoney(goal.targetAUM)} visé</div>
          `;
        })()}
      </div>
    </div>
    <div class="kpi-grid">
      <div class="kpi-card"><div class="kpi-label">Joueurs connectés</div><div class="kpi-value">${appState.players.length}</div></div>
      <div class="kpi-card"><div class="kpi-label">AUM</div><div class="kpi-value">${fmtMoney(kpis.aum)}</div></div>
      <div class="kpi-card"><div class="kpi-label">Revenus</div><div class="kpi-value">${fmtMoney(kpis.revenue)}</div></div>
      <div class="kpi-card"><div class="kpi-label">Résultat net</div><div class="kpi-value">${fmtMoney(kpis.netIncome)}</div></div>
      <div class="kpi-card"><div class="kpi-label">Ratio CET1</div><div class="kpi-value">${kpis.capitalRatio == null ? "—" : kpis.capitalRatio + "%"}</div></div>
      <div class="kpi-card"><div class="kpi-label">Moral RH</div><div class="kpi-value">${appState.hr && appState.hr.morale != null ? appState.hr.morale + "%" : "—"}</div></div>
    </div>
    <div class="panel-row" style="margin-bottom:16px;">
      <div class="panel">
        <div class="panel-title">Équipe en poste</div>
        <table class="data-table">
          <thead><tr><th>Nom</th><th>Grade</th><th>Département</th></tr></thead>
          <tbody>
            ${appState.players.map(p => `
              <tr><td><div class="person-row">${avatarHtml(p.fullName, 24)}<span class="person-row-name">${escapeHtml(p.fullName)}</span> ${tierBadgeHtml(scoreForPlayer(appState.playerScores, p.fullName))} ${badgesHtml(badgesForPlayer(appState.playerScores, p.fullName))}</div></td><td>${escapeHtml(p.grade)}</td><td>${deptBadgeHtml(p.dept)}</td></tr>
            `).join("") || `<tr><td colspan="3" class="empty-cell">Personne d'autre pour l'instant.</td></tr>`}
          </tbody>
        </table>
      </div>
      <div class="panel">
        <div class="panel-title">🏆 Classement</div>
        <table class="data-table">
          <thead><tr><th>#</th><th>Joueur</th><th>Score</th></tr></thead>
          <tbody>
            ${leaderboard.map((entry, i) => `
              <tr><td class="tnum">${i + 1}</td><td>${tierBadgeHtml(entry.score)} ${escapeHtml(entry.fullName)} ${badgesHtml(entry.badges)}</td><td class="tnum">${entry.score}</td></tr>
            `).join("") || `<tr><td colspan="3" class="empty-cell">Aucun point marqué pour l'instant.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
    <div class="panel-row" style="margin-bottom:16px;">
      ${clusterLeaderboardHtml()}
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
  `;
}

PAGE_RENDERERS.overview = renderOverview;
