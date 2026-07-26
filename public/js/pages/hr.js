const LEAVE_TYPES = ["Congés payés", "RTT", "Arrêt maladie", "Congé sans solde"];
const LEAVE_STATUS_CLASS = { "En attente": "chip-warning", "Approuvé": "chip-good", "Refusé": "chip-critical" };
const BONUS_POOL_RATE = 0.10;

function renderHr() {
  const requests = (appState.hr && appState.hr.leaveRequests) || [];
  const hrRoster = appState.hrRoster || [];
  const netIncome = (appState.financeKPIs && appState.financeKPIs.netIncome) || 0;
  const bonusPool = netIncome * BONUS_POOL_RATE;
  const perPlayer = appState.players.length ? bonusPool / appState.players.length : 0;

  const headcountByDept = {};
  appState.players.forEach(p => { headcountByDept[p.dept] = (headcountByDept[p.dept] || 0) + 1; });

  return `
    <div class="page-title">RH</div>
    <div class="page-sub">Effectif de la partie, intégration et congés.</div>
    <div class="kpi-grid">
      <div class="kpi-card"><div class="kpi-label">Effectif total</div><div class="kpi-value">${appState.players.length}</div></div>
      <div class="kpi-card"><div class="kpi-label">Pool de bonus (10% du résultat net)</div><div class="kpi-value">${fmtMoney(bonusPool)}</div></div>
      <div class="kpi-card"><div class="kpi-label">Part individuelle estimée</div><div class="kpi-value">${fmtMoney(perPlayer)}</div></div>
    </div>
    <div class="panel-row" style="margin-bottom:16px;">
      <div class="panel">
        <div class="panel-title">Effectif par département</div>
        <table class="data-table">
          <thead><tr><th>Département</th><th>Effectif</th></tr></thead>
          <tbody>
            ${Object.keys(headcountByDept).map(dept => `<tr><td>${deptBadgeHtml(dept)}</td><td class="tnum">${headcountByDept[dept]}</td></tr>`).join("") || `<tr><td colspan="2" class="empty-cell">Aucun joueur.</td></tr>`}
          </tbody>
        </table>
      </div>
      <div class="panel">
        <div class="panel-title">Demander un congé</div>
        <div class="form-row"><label>Type</label>
          <select id="hr-leave-type">${LEAVE_TYPES.map(t => `<option value="${t}">${t}</option>`).join("")}</select>
        </div>
        <div class="form-row"><label>Du</label><input id="hr-leave-start" type="date"/></div>
        <div class="form-row"><label>Au</label><input id="hr-leave-end" type="date"/></div>
        <div id="hr-error" class="join-error"></div>
        <button id="hr-leave-submit" class="btn-sm">Soumettre</button>
      </div>
    </div>
    <div class="panel" style="margin-bottom:16px;">
      <div class="panel-title">Intégration des joueurs</div>
      ${hrRoster.map(p => {
        const onboarding = p.onboarding || [];
        const done = onboarding.filter(o => o.done).length;
        return `
        <div class="activity-row" style="display:block; padding:8px 0;">
          <div class="person-row" style="margin-bottom:6px;">
            ${avatarHtml(p.fullName, 22)}
            <span class="person-row-name" style="font-size:12.5px;">${escapeHtml(p.fullName)}</span>
            <span style="font-size:11px; color:var(--text-muted);">(${done}/${onboarding.length})</span>
          </div>
          <div style="display:flex; gap:14px; flex-wrap:wrap;">
            ${onboarding.map((o, i) => `
              <label style="font-size:11.5px;">
                <input type="checkbox" data-hr-onboard="${p.id}|${i}" ${o.done ? "checked" : ""}/> ${escapeHtml(o.item)}
              </label>
            `).join("")}
          </div>
        </div>
      `;
      }).join("") || `<div class="empty-cell">Aucun joueur pour l'instant.</div>`}
    </div>
    <div class="panel">
      <div class="panel-title">Demandes de congé (${requests.length})</div>
      <table class="data-table">
        <thead><tr><th>Collaborateur</th><th>Type</th><th>Du</th><th>Au</th><th>Statut</th><th></th></tr></thead>
        <tbody>
          ${requests.map(r => `
            <tr>
              <td>${escapeHtml(r.playerName)}</td>
              <td>${escapeHtml(r.type)}</td>
              <td>${escapeHtml(r.start)}</td>
              <td>${escapeHtml(r.end)}</td>
              <td><span class="chip ${LEAVE_STATUS_CLASS[r.status]}">${r.status}</span></td>
              <td>
                ${r.status === "En attente" ? `
                  <button data-hr-approve="${r.id}" class="btn-sm">Approuver</button>
                  <button data-hr-deny="${r.id}" class="btn-sm">Refuser</button>
                ` : ""}
              </td>
            </tr>
          `).join("") || `<tr><td colspan="6" class="empty-cell">Aucune demande.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function bindHr() {
  const submitBtn = document.getElementById("hr-leave-submit");
  if (submitBtn) submitBtn.addEventListener("click", () => {
    socket.emit("hr:requestLeave", {
      type: document.getElementById("hr-leave-type").value,
      start: document.getElementById("hr-leave-start").value,
      end: document.getElementById("hr-leave-end").value
    });
  });
  document.querySelectorAll("[data-hr-approve]").forEach(el => {
    el.addEventListener("click", () => socket.emit("hr:setLeaveStatus", { requestId: el.getAttribute("data-hr-approve"), status: "Approuvé" }));
  });
  document.querySelectorAll("[data-hr-deny]").forEach(el => {
    el.addEventListener("click", () => socket.emit("hr:setLeaveStatus", { requestId: el.getAttribute("data-hr-deny"), status: "Refusé" }));
  });
  document.querySelectorAll("[data-hr-onboard]").forEach(el => {
    el.addEventListener("change", () => {
      const [playerId, index] = el.getAttribute("data-hr-onboard").split("|");
      socket.emit("hr:toggleOnboarding", { playerId, index: Number(index) });
    });
  });
}

PAGE_RENDERERS.hr = renderHr;
PAGE_BINDERS.hr = bindHr;
