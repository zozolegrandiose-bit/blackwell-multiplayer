const STRATEGY_CLUSTER_LABELS = {
  A: "Dealmaking (M&A, ECM, DCM…)",
  B: "Marchés & Recherche",
  C: "Gestion de Fortune & Actifs",
  D: "Conformité, Risque & Juridique",
  E: "Finance & Trésorerie",
  F: "RH & Communication",
  G: "Direction Générale"
};
const STRATEGY_OPERATIONAL_CLUSTERS = ["A", "B", "C", "D", "E", "F"];

const STRATEGY_CLUSTER_OPTIONS = {
  A: [
    { id: "aggressive", label: "Pipeline agressif", description: "Multiplier les mandats, quitte à prendre plus de risque." },
    { id: "selective", label: "Sélectif", description: "Ne retenir que les dossiers les plus solides." },
    { id: "defensive", label: "Défensif", description: "Ralentir le pipeline, protéger la réputation." }
  ],
  B: [
    { id: "risky", label: "Position risquée", description: "Prises de position agressives sur les marchés." },
    { id: "neutral", label: "Neutre", description: "Exposition mesurée." },
    { id: "hedge", label: "Couverture", description: "Se couvrir contre la volatilité." }
  ],
  C: [
    { id: "campaign", label: "Campagne d'acquisition", description: "Investir dans l'acquisition de nouveaux clients." },
    { id: "status_quo", label: "Statu quo", description: "Maintenir le portefeuille actuel." },
    { id: "retention", label: "Fidélisation", description: "Renforcer la relation avec les clients existants." }
  ],
  D: [
    { id: "minimal", label: "Minimal", description: "Réduire les contrôles pour économiser." },
    { id: "standard", label: "Standard", description: "Maintenir le niveau de contrôle actuel." },
    { id: "reinforced", label: "Renforcé", description: "Investir dans la conformité." }
  ],
  E: [
    { id: "invest", label: "Investir", description: "Financer la croissance." },
    { id: "consolidate", label: "Consolider", description: "Stabiliser le bilan." },
    { id: "distribute", label: "Distribuer", description: "Verser un dividende, rassurer les actionnaires." }
  ],
  F: [
    { id: "recruit", label: "Recruter", description: "Renforcer les équipes." },
    { id: "train", label: "Former", description: "Investir dans les compétences existantes." },
    { id: "freeze", label: "Geler", description: "Économiser sur la masse salariale." }
  ]
};

const STRATEGY_G_MULTIPLIERS = {
  growth: { label: "Croissance", description: "Amplifie les effets (positifs et négatifs) des décisions du trimestre." },
  stability: { label: "Stabilité", description: "Atténue les effets, positifs comme négatifs." },
  costcutting: { label: "Réduction des coûts", description: "Effets atténués, mais bonus de résultat net garanti." }
};

function strategyOptionLabel(cluster, optionId) {
  const options = cluster === "G" ? Object.keys(STRATEGY_G_MULTIPLIERS).map(id => ({ id, ...STRATEGY_G_MULTIPLIERS[id] })) : STRATEGY_CLUSTER_OPTIONS[cluster];
  const found = (options || []).find(o => o.id === optionId);
  return found ? found.label : optionId;
}

// A decision value is either: undefined (pending), `true` (submitted, redacted —
// what most players see for other clusters), or a real option id string (visible to
// Direction Générale for every cluster, and to any player for their own cluster).
function renderDecisionStatus(cluster, value) {
  if (value === undefined) return `<span class="chip chip-warning">⏳ En attente</span>`;
  if (value === true) return `<span class="chip chip-good">✅ Soumis</span>`;
  return `<span class="chip chip-good">✅ ${escapeHtml(strategyOptionLabel(cluster, value))}</span>`;
}

const DIFFICULTY_LABELS = { detente: "Détente", standard: "Standard", intense: "Intense" };

function esgColor(score) {
  if (score >= 60) return "var(--series-green)";
  if (score >= 35) return "#f5b942";
  return "var(--series-red)";
}

function gmPanelHtml() {
  if (!appState.player.hasFullAccess) return "";
  const paused = appState.paused;
  const difficulty = appState.difficulty || "standard";
  return `
    <div class="panel" style="margin-bottom:16px;">
      <div class="panel-title">🎛 Panneau GM — Direction Générale</div>
      <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:10px;">
        ${paused
          ? `<button id="gm-resume" class="btn-sm">▶️ Reprendre la partie</button>`
          : `<button id="gm-pause" class="btn-sm">⏸ Mettre en pause</button>`}
        <button id="gm-extend" class="btn-sm">⏱ Prolonger le trimestre (+60s)</button>
        <button id="gm-trigger-event" class="btn-sm">🎲 Déclencher un événement</button>
      </div>
      <div class="form-row"><label>Difficulté</label>
        <select id="gm-difficulty">
          ${Object.keys(DIFFICULTY_LABELS).map(d => `<option value="${d}" ${d === difficulty ? "selected" : ""}>${DIFFICULTY_LABELS[d]}</option>`).join("")}
        </select>
      </div>
    </div>
  `;
}

function quarterHistoryHtml() {
  const history = appState.quarterHistory || [];
  if (!history.length) return "";
  return `
    <div class="panel" style="margin-bottom:16px;">
      <div class="panel-title">Historique des trimestres résolus</div>
      <table class="data-table">
        <thead><tr><th>Trimestre</th><th>AUM</th><th>Résultat net</th><th>Santé</th><th>ESG</th></tr></thead>
        <tbody>
          ${history.map(r => `
            <tr>
              <td class="tnum">T${r.quarter}</td>
              <td class="tnum">${r.aumPct >= 0 ? "+" : ""}${Math.round(r.aumPct * 1000) / 10}%</td>
              <td class="tnum">${r.netIncomePct >= 0 ? "+" : ""}${Math.round(r.netIncomePct * 1000) / 10}%</td>
              <td class="tnum">${r.healthDelta >= 0 ? "+" : ""}${r.healthDelta}</td>
              <td class="tnum">${r.esgScore != null ? r.esgScore + "%" : "—"}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderStrategy() {
  const quarter = appState.currentQuarter || 1;
  const deadline = appState.quarterDeadline;
  const decisions = appState.quarterDecisions || {};
  const secondsLeft = deadline ? Math.max(0, Math.round((deadline - Date.now()) / 1000)) : null;
  const myCluster = appState.player.cluster;
  const myOptions = myCluster === "G" ? STRATEGY_G_MULTIPLIERS : (myCluster ? STRATEGY_CLUSTER_OPTIONS[myCluster] : null);
  const myOptionsList = myCluster === "G" ? Object.keys(STRATEGY_G_MULTIPLIERS).map(id => ({ id, ...STRATEGY_G_MULTIPLIERS[id] })) : myOptions;
  const alreadySubmitted = myCluster && !!decisions[myCluster];
  const esgScore = (appState.financeKPIs && appState.financeKPIs.esgScore) || 0;

  return `
    <div class="page-title">Comité de Direction</div>
    <div class="page-sub">Décisions stratégiques trimestrielles — chaque département verrouille un choix pour le trimestre en cours.</div>
    ${gmPanelHtml()}
    <div class="kpi-grid" style="margin-bottom:16px;">
      <div class="kpi-card"><div class="kpi-label">Trimestre en cours</div><div class="kpi-value">T${quarter}</div></div>
      <div class="kpi-card"><div class="kpi-label">Temps restant</div><div class="kpi-value">${secondsLeft !== null ? secondsLeft + "s" : "—"}</div></div>
    </div>
    <div class="panel" style="margin-bottom:16px;">
      <div class="panel-title">🌱 Score ESG (piloté par Conformité, Risque &amp; Juridique)</div>
      <div style="display:flex; align-items:center; gap:14px;">
        <div style="flex:1; height:16px; background:var(--border); border-radius:8px; overflow:hidden;">
          <div style="width:${esgScore}%; height:100%; background:${esgColor(esgScore)}; transition:width 0.3s;"></div>
        </div>
        <div style="font-weight:700; font-size:15px; min-width:48px; text-align:right;">${esgScore}%</div>
      </div>
    </div>
    ${quarterHistoryHtml()}
    ${myCluster && myOptionsList ? `
      <div class="panel" style="margin-bottom:16px;">
        <div class="panel-title">Votre décision — ${escapeHtml(STRATEGY_CLUSTER_LABELS[myCluster])}</div>
        ${alreadySubmitted ? `
          <div style="font-size:12.5px; color:var(--series-green);">✅ Décision verrouillée pour ce trimestre : <b>${escapeHtml(strategyOptionLabel(myCluster, decisions[myCluster]))}</b></div>
        ` : `
          <div class="strategy-cards">
            ${myOptionsList.map(o => `
              <div class="strategy-card" data-strategy-option="${o.id}">
                <div class="strategy-card-label">${escapeHtml(o.label)}</div>
                <div class="strategy-card-desc">${escapeHtml(o.description)}</div>
                <button class="btn-sm" data-strategy-submit="${o.id}">Choisir</button>
              </div>
            `).join("")}
          </div>
        `}
      </div>
    ` : ""}
    <div class="panel">
      <div class="panel-title">Statut des décisions du trimestre${myCluster === "G" ? " — vous voyez les choix réels" : ""}</div>
      <table class="data-table">
        <thead><tr><th>Département</th><th>Statut</th></tr></thead>
        <tbody>
          ${STRATEGY_OPERATIONAL_CLUSTERS.map(cluster => `
            <tr class="${cluster === myCluster ? "strategy-my-row" : ""}">
              <td>${escapeHtml(STRATEGY_CLUSTER_LABELS[cluster])}${cluster === myCluster ? " <b>(vous)</b>" : ""}</td>
              <td>${renderDecisionStatus(cluster, decisions[cluster])}</td>
            </tr>
          `).join("")}
          <tr class="${myCluster === "G" ? "strategy-my-row" : ""}">
            <td>${escapeHtml(STRATEGY_CLUSTER_LABELS.G)}${myCluster === "G" ? " <b>(vous)</b>" : ""}</td>
            <td>${renderDecisionStatus("G", decisions.G)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
}

function bindStrategy() {
  document.querySelectorAll("[data-strategy-submit]").forEach(el => {
    el.addEventListener("click", () => {
      socket.emit("strategy:submitDecision", { optionId: el.getAttribute("data-strategy-submit") });
    });
  });
  const pauseBtn = document.getElementById("gm-pause");
  if (pauseBtn) pauseBtn.addEventListener("click", () => socket.emit("game:pause"));
  const resumeBtn = document.getElementById("gm-resume");
  if (resumeBtn) resumeBtn.addEventListener("click", () => socket.emit("game:resume"));
  const extendBtn = document.getElementById("gm-extend");
  if (extendBtn) extendBtn.addEventListener("click", () => socket.emit("strategy:extendQuarter"));
  const triggerBtn = document.getElementById("gm-trigger-event");
  if (triggerBtn) triggerBtn.addEventListener("click", () => socket.emit("game:triggerEvent"));
  const difficultySelect = document.getElementById("gm-difficulty");
  if (difficultySelect) difficultySelect.addEventListener("change", () => {
    socket.emit("game:setDifficulty", { difficulty: difficultySelect.value });
  });
}

PAGE_RENDERERS.strategy = renderStrategy;
PAGE_BINDERS.strategy = bindStrategy;
