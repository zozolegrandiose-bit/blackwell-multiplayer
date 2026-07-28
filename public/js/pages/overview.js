// Workspace Modulable -- the informational/social panels on Overview (not the
// core financial KPI grid, which stays fixed) can be shown/hidden and reordered.
// Persisted client-side only (a display preference, not shared game state); real
// drag-and-drop needs a live browser, so reordering is done via up/down controls
// instead, which is fully testable and just as functional.
const WORKSPACE_STORAGE_KEY = "blackwell_workspace_overview";
const WORKSPACE_WIDGETS = [
  { id: "liveEvents", label: "Événements en direct" },
  { id: "leagueTable", label: "League Table & P&L" },
  { id: "teamChat", label: "Chat d'équipe" },
  { id: "priorities", label: "Priorités" },
  { id: "executedWorkflows", label: "Deals exécutés" },
  { id: "taskSummary", label: "Résumé des tâches" },
  { id: "hallOfFame", label: "Hall of Fame" }
];

const WORKSPACE_HEIGHT_MIN = 140;
const WORKSPACE_HEIGHT_MAX = 800;
const WORKSPACE_HEIGHT_STEP = 60;

function getWorkspaceLayout() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(WORKSPACE_STORAGE_KEY)); } catch (e) { saved = null; }
  const defaultOrder = WORKSPACE_WIDGETS.map(w => w.id);
  if (!saved || !Array.isArray(saved.order)) return { order: defaultOrder, hidden: [], heights: {} };
  // Merge in any widget ids added since the layout was saved (forward-compatible).
  const merged = saved.order.filter(id => defaultOrder.includes(id));
  defaultOrder.forEach(id => { if (!merged.includes(id)) merged.push(id); });
  return {
    order: merged,
    hidden: Array.isArray(saved.hidden) ? saved.hidden : [],
    // Panels déplaçables ET redimensionnables : un drag-resize par poignée libre
    // demanderait de reconstruire un mini système de grille (façon react-grid-layout)
    // dans une base 100% vanilla JS sans framework -- adapté ici en un contrôle par
    // paliers (+/- 60px), aussi fonctionnel et bien plus simple à fiabiliser, dans le
    // même esprit que le choix "haut/bas" déjà fait pour le réordonnancement (Patch 17).
    heights: (saved.heights && typeof saved.heights === "object") ? saved.heights : {}
  };
}

function saveWorkspaceLayout(layout) {
  localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify(layout));
}

let workspaceEditorOpen = false;

function workspaceControlsHtml() {
  const layout = getWorkspaceLayout();
  return `
    <div class="panel" style="margin-bottom:16px;">
      <div class="panel-title" style="display:flex; justify-content:space-between; align-items:center; cursor:pointer;" data-workspace-toggle="1">
        <span>🧩 Workspace modulable</span>
        <span style="font-size:11px; color:var(--text-muted);">${workspaceEditorOpen ? "▲ Réduire" : "▼ Personnaliser"}</span>
      </div>
      ${workspaceEditorOpen ? `
        <div style="font-size:11px; color:var(--text-muted); margin:8px 0;">Affichez, masquez et réorganisez les panneaux ci-dessous — préférence locale à votre navigateur.</div>
        ${layout.order.map((id, i) => {
          const widget = WORKSPACE_WIDGETS.find(w => w.id === id);
          if (!widget) return "";
          const hidden = layout.hidden.includes(id);
          return `
          <div style="display:flex; align-items:center; gap:8px; padding:5px 0; border-top:1px solid var(--border);">
            <label style="flex:1; font-size:12.5px; ${hidden ? "color:var(--text-muted);" : ""}">
              <input type="checkbox" data-workspace-visible="${id}" ${hidden ? "" : "checked"}/> ${escapeHtml(widget.label)}
            </label>
            <button data-workspace-up="${id}" class="btn-sm" ${i === 0 ? "disabled" : ""} style="padding:2px 8px;">↑</button>
            <button data-workspace-down="${id}" class="btn-sm" ${i === layout.order.length - 1 ? "disabled" : ""} style="padding:2px 8px;">↓</button>
            <button data-workspace-shrink="${id}" class="btn-sm" ${(layout.heights[id] || WORKSPACE_HEIGHT_MAX) <= WORKSPACE_HEIGHT_MIN ? "disabled" : ""} style="padding:2px 8px;">⤒</button>
            <button data-workspace-grow="${id}" class="btn-sm" ${(layout.heights[id] || WORKSPACE_HEIGHT_MAX) >= WORKSPACE_HEIGHT_MAX ? "disabled" : ""} style="padding:2px 8px;">⤓</button>
          </div>
        `;
        }).join("")}
      ` : ""}
    </div>
  `;
}

function bindWorkspaceControls() {
  const toggle = document.querySelector("[data-workspace-toggle]");
  if (toggle) toggle.addEventListener("click", () => { workspaceEditorOpen = !workspaceEditorOpen; renderApp(); });
  document.querySelectorAll("[data-workspace-visible]").forEach(el => {
    el.addEventListener("change", () => {
      const id = el.getAttribute("data-workspace-visible");
      const layout = getWorkspaceLayout();
      layout.hidden = el.checked ? layout.hidden.filter(h => h !== id) : [...layout.hidden, id];
      saveWorkspaceLayout(layout);
      renderApp();
    });
  });
  document.querySelectorAll("[data-workspace-up]").forEach(el => {
    el.addEventListener("click", () => {
      const id = el.getAttribute("data-workspace-up");
      const layout = getWorkspaceLayout();
      const i = layout.order.indexOf(id);
      if (i > 0) { [layout.order[i - 1], layout.order[i]] = [layout.order[i], layout.order[i - 1]]; saveWorkspaceLayout(layout); renderApp(); }
    });
  });
  document.querySelectorAll("[data-workspace-down]").forEach(el => {
    el.addEventListener("click", () => {
      const id = el.getAttribute("data-workspace-down");
      const layout = getWorkspaceLayout();
      const i = layout.order.indexOf(id);
      if (i !== -1 && i < layout.order.length - 1) { [layout.order[i + 1], layout.order[i]] = [layout.order[i], layout.order[i + 1]]; saveWorkspaceLayout(layout); renderApp(); }
    });
  });
  document.querySelectorAll("[data-workspace-shrink]").forEach(el => {
    el.addEventListener("click", () => {
      const id = el.getAttribute("data-workspace-shrink");
      const layout = getWorkspaceLayout();
      const current = layout.heights[id] || WORKSPACE_HEIGHT_MAX;
      layout.heights[id] = Math.max(WORKSPACE_HEIGHT_MIN, current - WORKSPACE_HEIGHT_STEP);
      saveWorkspaceLayout(layout);
      renderApp();
    });
  });
  document.querySelectorAll("[data-workspace-grow]").forEach(el => {
    el.addEventListener("click", () => {
      const id = el.getAttribute("data-workspace-grow");
      const layout = getWorkspaceLayout();
      const current = layout.heights[id] || WORKSPACE_HEIGHT_MAX;
      layout.heights[id] = Math.min(WORKSPACE_HEIGHT_MAX, current + WORKSPACE_HEIGHT_STEP);
      saveWorkspaceLayout(layout);
      renderApp();
    });
  });
}

function renderWorkspaceWidgets() {
  const layout = getWorkspaceLayout();
  const renderers = {
    liveEvents: liveEventsPanelHtml,
    leagueTable: leagueTablePanelHtml,
    teamChat: teamChatHtml,
    priorities: prioritiesPanelHtml,
    executedWorkflows: executedWorkflowsHtml,
    taskSummary: taskSummaryPanelHtml,
    hallOfFame: hallOfFameHtml
  };
  return layout.order
    .filter(id => !layout.hidden.includes(id))
    .map(id => {
      if (!renderers[id]) return "";
      const height = layout.heights[id];
      const style = height ? `max-height:${height}px; overflow-y:auto;` : "";
      return `<div data-resize-wrapper="${id}" style="${style}">${renderers[id]()}</div>`;
    })
    .join("");
}

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

function marketDayCountdownLabel() {
  const day = appState.marketDay || {};
  if (!day.deadline) return "--:--";
  const secondsLeft = Math.max(0, Math.round((day.deadline - Date.now()) / 1000));
  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");
  return mm + ":" + ss;
}

// "League Table & P&L Tracker" — real P&L (not gamified points) per bank, fed by
// server/handlers/ma.js (M&A closings + rival banks winning stalled deals),
// server/handlers/dealWorkflow.js (executed workflow deals) and
// server/handlers/markets.js (trading P&L). The employee side reuses the same
// bonusEarned/score fields already tracked by server/scoring.js — no new
// per-player bookkeeping needed.
const RATING_CHIP_CLASS = {
  AAA: "chip-good", AA: "chip-good", A: "chip-good",
  BBB: "chip-warning", BB: "chip-warning",
  B: "chip-critical", CCC: "chip-critical", D: "chip-critical"
};

function leagueTablePanelHtml() {
  const league = appState.leagueTable || {};
  const ratings = appState.creditRatings || {};
  const banks = Object.keys(league).map(name => ({ name, ...league[name] })).sort((a, b) => b.pnl - a.pnl);
  const employees = Object.values(appState.playerScores || {})
    .filter(e => (e.bonusEarned || 0) > 0)
    .sort((a, b) => (b.bonusEarned || 0) - (a.bonusEarned || 0))
    .slice(0, 5);
  const day = appState.marketDay || {};

  return `
    <div class="panel" style="margin-bottom:16px;">
      <div class="panel-title">📊 League Table &amp; P&amp;L Tracker — Journée J${day.dayNumber || 1} · ⏱ ${marketDayCountdownLabel()} avant clôture</div>
      <div style="font-size:11px; color:var(--text-muted); margin-bottom:4px;">Une journée de marché dure 15 minutes réelles — à la clôture, le P&amp;L du jour est arrêté et les primes sont versées à ceux qui y ont contribué.</div>
    </div>
    <div class="panel-row" style="margin-bottom:16px;">
      <div class="panel">
        <div class="panel-title">🏦 Classement des banques</div>
        <table class="data-table">
          <thead><tr><th>#</th><th>Banque</th><th>P&amp;L cumulé</th><th>Deals clos</th><th>Note 📐</th></tr></thead>
          <tbody>
            ${banks.map((b, i) => {
              const rating = ratings[b.name];
              return `
              <tr class="${b.isPlayer ? "strategy-my-row" : ""}">
                <td class="tnum">${i + 1}</td>
                <td>${escapeHtml(b.name)}${b.isPlayer ? " <b>(nous)</b>" : ""}</td>
                <td class="tnum">${b.pnl >= 0 ? "+" : ""}${b.pnl} M$</td>
                <td class="tnum">${b.dealsClosed}</td>
                <td>${rating ? `<span class="chip ${RATING_CHIP_CLASS[rating.rating] || "chip-neutral"}" ${rating.solvencyRatio != null ? `title="Solvabilité ${rating.solvencyRatio}% · Liquidité ${rating.liquidityRatio}%"` : ""}>${rating.rating}</span>` : "—"}</td>
              </tr>
            `;
            }).join("")}
          </tbody>
        </table>
      </div>
      <div class="panel">
        <div class="panel-title">🥇 Meilleurs employés — prime &amp; réputation</div>
        <table class="data-table">
          <thead><tr><th>#</th><th>Joueur</th><th>Prime perçue</th><th>Réputation</th></tr></thead>
          <tbody>
            ${employees.map((e, i) => {
              const tier = getProgressionTier(e.score || 0);
              return `
              <tr>
                <td class="tnum">${i + 1}</td>
                <td>${escapeHtml(e.fullName)}</td>
                <td class="tnum">${e.bonusEarned} M$</td>
                <td>${tier.icon} ${escapeHtml(tier.label)}</td>
              </tr>
            `;
            }).join("") || `<tr><td colspan="4" class="empty-cell">Aucune prime distribuée pour l'instant.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// Proactive AI reactions (server/gameState.js's postTeamChat, triggered from
// ma.js/dealWorkflow.js on a big deal closing and from scoring.js on a bank-health
// crossing) — a lightweight team chat, distinct from the factual activity feed.
function teamChatHtml() {
  const messages = appState.teamChat || [];
  if (!messages.length) return "";
  return `
    <div class="panel" style="margin-bottom:16px;">
      <div class="panel-title">💬 Chat d'équipe</div>
      <div class="activity-feed">
        ${messages.map(m => `
          <div class="activity-row team-chat-${m.tone === "alert" ? "alert" : "congrats"}">
            <span class="activity-time">${fmtTime(m.ts)}</span>
            <span class="activity-text"><b>${escapeHtml(m.authorName)}</b> — ${escapeHtml(m.text)}</span>
          </div>
        `).join("")}
      </div>
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
  G: "Board Of Directors"
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
    ${workspaceControlsHtml()}
    ${renderWorkspaceWidgets()}
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
      <div class="kpi-card"><div class="kpi-label">AUM</div><div class="kpi-value" data-flash-key="ov-aum" data-flash-val="${kpis.aum}">${fmtMoney(kpis.aum)}</div></div>
      <div class="kpi-card"><div class="kpi-label">Revenus</div><div class="kpi-value" data-flash-key="ov-revenue" data-flash-val="${kpis.revenue}">${fmtMoney(kpis.revenue)}</div></div>
      <div class="kpi-card"><div class="kpi-label">Résultat net</div><div class="kpi-value" data-flash-key="ov-netincome" data-flash-val="${kpis.netIncome}">${fmtMoney(kpis.netIncome)}</div></div>
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
  bindWorkspaceControls();
}

PAGE_RENDERERS.overview = renderOverview;
PAGE_BINDERS.overview = bindOverview;
