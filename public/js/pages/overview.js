function bankHealthColor(health) {
  if (health >= 60) return "var(--series-green)";
  if (health >= 30) return "#f5b942";
  return "var(--series-red)";
}

// "Moteur d'Événements Vivants" — a global claimable feed (server/liveEvents.js),
// distinct from the page-scoped crisis banners: any connected player, regardless
// of department, can claim a card here first-come-first-served.
function liveEventsPanelHtml() {
  const events = appState.liveEvents || [];
  return `
    <div class="panel task-panel" style="margin-bottom:16px;">
      <div class="panel-title">📰 Fil d'actualité — événements en direct (${events.length})</div>
      ${events.length ? events.map(ev => `
        <div class="live-event-card">
          <div class="live-event-card-main">
            <div class="live-event-card-label">${ev.icon} ${escapeHtml(ev.label)}</div>
            <div class="live-event-card-text">${escapeHtml(ev.text)}</div>
          </div>
          <div class="live-event-card-side">
            <div class="task-row-timer">⏱ ${Math.max(0, Math.round((ev.expiresAt - Date.now()) / 1000))}s</div>
            <button class="btn-sm" data-live-claim="${ev.id}">S'en saisir</button>
          </div>
        </div>
      `).join("") : `<div style="font-size:12.5px; color:var(--text-muted);">Calme plat pour l'instant — une nouvelle alerte apparaîtra sous peu.</div>`}
    </div>
  `;
}

const TASK_SUMMARY_LABELS = { ma: "M&A", clients: "Clients", compliance: "Conformité", hr: "RH", finance: "Finance", markets: "Marchés" };

// The last step of the Analyste → Risk Manager → Desk Trading workflow: RH/MD
// sees the direct P&L impact of each executed deal and the prime automatically
// split between the three participating roles (already awarded server-side by
// server/handlers/dealWorkflow.js's executeDeal(), not just displayed here).
function executedWorkflowsHtml() {
  const records = appState.executedWorkflows || [];
  if (!records.length) return "";
  return `
    <div class="panel" style="margin-bottom:16px;">
      <div class="panel-title">💼 Dernières exécutions — impact P&amp;L &amp; primes</div>
      <table class="data-table">
        <thead><tr><th>Deal</th><th>Méthode</th><th>Résultat net</th><th>Prime répartie</th><th>Participants</th></tr></thead>
        <tbody>
          ${records.map(r => `
            <tr>
              <td>${escapeHtml(r.dealName)}</td>
              <td>${r.method === "syndication" ? "Syndication" : "Couverture"}</td>
              <td class="tnum">${r.netFee >= 0 ? "+" : ""}${r.netFee} M$</td>
              <td class="tnum">${r.bonusPool} M$</td>
              <td style="font-size:11px; color:var(--text-muted);">${r.participants.map(p => escapeHtml(p.name) + " (" + escapeHtml(p.role) + ")").join(", ")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

// The direct answer to "on ne sait pas quoi faire" — a live, always-accurate list
// computed from real state (never scripted/fake), warning early (roughly half the
// real penalty threshold) so players see a priority before the actual consequence
// (fine, churn, collapsed deal) hits. Filtered to pages the player can act on.
function computePriorities() {
  const items = [];
  const access = (appState.player && appState.player.access) || [];
  const now = Date.now();

  if (access.includes("compliance")) {
    const stale = (appState.complianceItems || []).filter(i => (i.status === "Ouvert" || i.status === "Escaladé") && now - i.ts >= 2 * 60 * 1000);
    if (stale.length) items.push({ icon: "🚨", page: "compliance", text: stale.length + " alerte(s) de conformité en attente depuis plus de 2 minutes — risque d'amende à l'audit trimestriel." });
    const pendingRisk = (appState.maDeals || []).filter(d => d.workflow && d.workflow.phase === "pending_risk");
    if (pendingRisk.length) items.push({ icon: "🎯", page: "compliance", text: pendingRisk.length + " dossier(s) M&A en attente de validation Risque." });
  }
  if (access.includes("ma")) {
    const stalling = (appState.maDeals || []).filter(d => d.stage !== "Clôturé" && now - d.updatedAt >= 90 * 1000);
    if (stalling.length) items.push({ icon: "💤", page: "ma", text: stalling.length + " deal(s) M&A sans avancée récente — risque qu'ils tombent à l'eau." });
  }
  if (access.includes("markets")) {
    const pendingExec = (appState.maDeals || []).filter(d => d.workflow && d.workflow.phase === "pending_execution");
    if (pendingExec.length) items.push({ icon: "⏱️", page: "markets", text: pendingExec.length + " exécution(s) de deal en attente — chrono de 2 minutes en cours." });
  }
  if (access.includes("clients")) {
    const atRisk = (appState.clients || []).filter(c => c.status === "Actif" && now - (c.lastTouchedAt || 0) >= 2 * 60 * 1000);
    if (atRisk.length) items.push({ icon: "📉", page: "clients", text: atRisk.length + " client(s) actif(s) sans suivi récent — risque de passer inactif." });
  }
  if (access.includes("hr")) {
    const hr = appState.hr || {};
    const openPos = (hr.openPositions || []).filter(p => p.status === "Ouvert").length;
    if (openPos) items.push({ icon: "🎯", page: "hr", text: openPos + " poste(s) ouvert(s) à pourvoir." });
    const pendingLeave = (hr.leaveRequests || []).filter(r => r.status === "En attente").length;
    if (pendingLeave) items.push({ icon: "🗓️", page: "hr", text: pendingLeave + " demande(s) de congé en attente de décision." });
  }
  if (access.includes("finance")) {
    const kpis = appState.financeKPIs || {};
    if (kpis.budgetPool) {
      const remaining = Math.round((kpis.budgetPool.total - kpis.budgetPool.allocated) * 10) / 10;
      if (remaining < 0) items.push({ icon: "⚠️", page: "finance", text: "Budgets départementaux dépassent le pool de " + Math.abs(remaining) + " M$ — à corriger." });
    }
    if (kpis.capitalRatio != null && kpis.capitalRatio < 8) items.push({ icon: "🏦", page: "finance", text: "Ratio de fonds propres sous le seuil réglementaire (" + kpis.capitalRatio + "%)." });
  }
  if (access.includes("strategy")) {
    const myCluster = appState.player && appState.player.cluster;
    if (myCluster && !(appState.quarterDecisions || {})[myCluster]) items.push({ icon: "📋", page: "strategy", text: "Votre département n'a pas encore verrouillé sa décision pour ce trimestre." });
  }
  const taskCount = Object.values(appState.tasksSummary || {}).reduce((a, b) => a + b, 0);
  if (taskCount) items.push({ icon: "⚡", page: null, text: taskCount + " tâche(s) rapide(s) en attente sur vos pages." });

  return items;
}

function prioritiesPanelHtml() {
  const items = computePriorities();
  if (!items.length) {
    return `
      <div class="panel task-panel" style="margin-bottom:16px;">
        <div class="panel-title">✅ Priorités</div>
        <div style="font-size:12.5px; color:var(--text-muted);">Rien d'urgent pour l'instant — tout est sous contrôle sur vos pages.</div>
      </div>
    `;
  }
  return `
    <div class="panel task-panel" style="margin-bottom:16px;">
      <div class="panel-title">🧭 Priorités (${items.length})</div>
      ${items.map(item => `
        <div class="task-row" ${item.page ? `data-nav-page="${item.page}" style="cursor:pointer;"` : ""}>
          <span class="task-row-text">${item.icon} ${escapeHtml(item.text)}</span>
        </div>
      `).join("")}
    </div>
  `;
}

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
    <div class="page-sub">Tableau de bord partagé — visible par tous les joueurs. Vous reprenez une banque avec des années d'historique : consultez les priorités ci-dessous pour savoir où intervenir en premier.</div>
    ${liveEventsPanelHtml()}
    ${prioritiesPanelHtml()}
    ${executedWorkflowsHtml()}
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

function bindOverview() {
  document.querySelectorAll("[data-live-claim]").forEach(el => {
    el.addEventListener("click", () => {
      socket.emit("liveEvents:claim", { cardId: el.getAttribute("data-live-claim") });
    });
  });
}

PAGE_RENDERERS.overview = renderOverview;
PAGE_BINDERS.overview = bindOverview;
