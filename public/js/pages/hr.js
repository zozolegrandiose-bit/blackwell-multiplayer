const LEAVE_TYPES = ["Congés payés", "RTT", "Arrêt maladie", "Congé sans solde"];
const LEAVE_STATUS_CLASS = { "En attente": "chip-warning", "Approuvé": "chip-good", "Refusé": "chip-critical" };
const BONUS_POOL_RATE = 0.10;

function moraleColor(morale) {
  if (morale >= 60) return "var(--series-green)";
  if (morale >= 40) return "#f5b942";
  return "var(--series-red)";
}

const LEAVE_CALENDAR_DOW = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

function buildMonthDays(year, month) {
  const firstDay = new Date(year, month, 1);
  const startWeekday = (firstDay.getDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days = [];
  for (let i = 0; i < startWeekday; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(new Date(year, month, d));
  return days;
}

function isoDate(date) {
  return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
}

// Visual leave planning, built entirely from the same leaveRequests already used by
// the table below — a request's start/end (ISO date strings) sort/compare correctly
// as plain strings, no date parsing needed to test day-in-range.
function leaveCalendarHtml(requests) {
  const now = new Date();
  const year = now.getFullYear(), month = now.getMonth();
  const days = buildMonthDays(year, month);
  const monthLabel = now.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  const todayIso = isoDate(now);

  return `
    <div class="panel" style="margin-bottom:16px;">
      <div class="panel-title">📅 Planning des congés — ${monthLabel}</div>
      <div class="leave-calendar-grid">
        ${LEAVE_CALENDAR_DOW.map(d => `<div class="leave-calendar-dow">${d}</div>`).join("")}
        ${days.map(day => {
          if (!day) return `<div class="leave-calendar-cell leave-calendar-empty"></div>`;
          const iso = isoDate(day);
          const onLeave = requests.filter(r => r.status !== "Refusé" && iso >= r.start && iso <= r.end);
          return `
            <div class="leave-calendar-cell ${iso === todayIso ? "leave-calendar-today" : ""}">
              <div class="leave-calendar-daynum">${day.getDate()}</div>
              ${onLeave.map(r => `<div class="leave-calendar-chip ${r.status === "Approuvé" ? "leave-chip-approved" : "leave-chip-pending"}" title="${escapeHtml(r.playerName)} — ${escapeHtml(r.type)} (${r.status})">${escapeHtml((r.playerName || "").split(" ")[0])}</div>`).join("")}
            </div>
          `;
        }).join("")}
      </div>
      <div style="display:flex; gap:16px; margin-top:10px; font-size:11px; color:var(--text-muted);">
        <span><span class="leave-chip-approved" style="display:inline-block; width:10px; height:10px; border-radius:3px; margin-right:4px;"></span>Approuvé</span>
        <span><span class="leave-chip-pending" style="display:inline-block; width:10px; height:10px; border-radius:3px; margin-right:4px;"></span>En attente</span>
      </div>
    </div>
  `;
}

function renderHr() {
  const hr = appState.hr || {};
  const requests = hr.leaveRequests || [];
  const hrRoster = appState.hrRoster || [];
  const morale = hr.morale == null ? 80 : hr.morale;
  const openPositions = hr.openPositions || [];
  const candidates = hr.candidates || {};
  const netIncome = (appState.financeKPIs && appState.financeKPIs.netIncome) || 0;
  const bonusPool = Math.round(netIncome * BONUS_POOL_RATE * 10) / 10;

  const headcountByDept = {};
  appState.players.forEach(p => { headcountByDept[p.dept] = (headcountByDept[p.dept] || 0) + 1; });

  return `
    <div class="page-title">RH</div>
    <div class="page-sub">Effectif, recrutement, moral des équipes et primes.</div>
    ${taskPanelHtml("hr")}
    <div class="kpi-grid">
      <div class="kpi-card"><div class="kpi-label">Effectif joueurs</div><div class="kpi-value">${appState.players.length}</div></div>
      <div class="kpi-card"><div class="kpi-label">Recrues embauchées</div><div class="kpi-value">${hr.headcountNPC || 0}</div></div>
      <div class="kpi-card"><div class="kpi-label">Pool de primes (10% du résultat net)</div><div class="kpi-value">${fmtMoney(bonusPool)}</div></div>
    </div>
    <div class="panel-row" style="margin-bottom:16px;">
      <div class="panel">
        <div class="panel-title">Moral des équipes</div>
        <div style="display:flex; align-items:center; gap:14px;">
          <div style="flex:1; height:16px; background:var(--border); border-radius:8px; overflow:hidden;">
            <div style="width:${morale}%; height:100%; background:${moraleColor(morale)}; transition:width 0.3s;"></div>
          </div>
          <div style="font-weight:700; font-size:15px; min-width:48px; text-align:right;">${morale}%</div>
        </div>
        <div style="font-size:11px; color:var(--text-muted); margin-top:6px;">Baisse quand des congés sont refusés, remonte avec les congés approuvés, l'intégration, les embauches et les primes distribuées.</div>
      </div>
      <div class="panel">
        <div class="panel-title">Effectif par département</div>
        <table class="data-table">
          <thead><tr><th>Département</th><th>Effectif</th></tr></thead>
          <tbody>
            ${Object.keys(headcountByDept).map(dept => `<tr><td>${deptBadgeHtml(dept)}</td><td class="tnum">${headcountByDept[dept]}</td></tr>`).join("") || `<tr><td colspan="2" class="empty-cell">Aucun joueur.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
    <div class="panel" style="margin-bottom:16px;">
      <div class="panel-title">Recrutement — postes ouverts (${openPositions.filter(p => p.status === "Ouvert").length})</div>
      ${openPositions.filter(p => p.status === "Ouvert").map(pos => {
        const posCandidates = candidates[pos.id] || [];
        return `
        <div class="activity-row" style="display:block; padding:10px 0;">
          <div style="font-weight:700; font-size:13px;">${escapeHtml(pos.dept)} — ${escapeHtml(pos.level)}</div>
          <div style="font-size:11px; color:var(--text-muted); margin:4px 0 8px;">Salaire mensuel proposé : ${fmtMoney(pos.monthlySalary)}</div>
          <div style="display:flex; gap:14px; flex-wrap:wrap;">
            ${posCandidates.map(c => `
              <div style="border:1px solid var(--border); border-radius:8px; padding:8px 10px; min-width:180px;">
                <div style="font-weight:600; font-size:12.5px;">${escapeHtml(c.name)}</div>
                <div style="font-size:11px; color:var(--text-muted); margin:2px 0 6px;">${escapeHtml(c.level)} · prétention ${fmtMoney(c.monthlySalary)}/mois</div>
                <div style="font-size:11px; margin-bottom:6px;">Adéquation : ${c.interviewed ? c.fitScore + "%" : "? — à interviewer"}</div>
                ${!c.interviewed
                  ? `<button data-hr-interview="${pos.id}|${c.id}" class="btn-sm">Interviewer</button>`
                  : `<button data-hr-hire="${pos.id}|${c.id}" class="btn-sm">Embaucher</button>`}
              </div>
            `).join("")}
          </div>
        </div>
      `;
      }).join("") || `<div class="empty-cell">Aucun poste ouvert pour l'instant — un choix « Recruter » au Comité de Direction en ouvrira un.</div>`}
      <div id="hr-hire-error" class="join-error"></div>
    </div>
    <div class="panel" style="margin-bottom:16px;">
      <div class="panel-title">Répartition des primes (pool : ${fmtMoney(bonusPool)})</div>
      ${appState.players.length ? `
        <table class="data-table">
          <thead><tr><th>Collaborateur</th><th>Montant (M$)</th></tr></thead>
          <tbody>
            ${appState.players.map(p => `
              <tr>
                <td><div class="person-row">${avatarHtml(p.fullName, 20)}<span class="person-row-name">${escapeHtml(p.fullName)}</span></div></td>
                <td><input data-hr-bonus-input="${p.id}" type="number" step="0.1" min="0" placeholder="0" style="width:90px; padding:5px 7px; border-radius:6px; border:1px solid var(--border); background:var(--surface-2); color:var(--text-900); font-size:12px;"/></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
        <button id="hr-bonus-submit" class="btn-sm" style="margin-top:10px;">Distribuer les primes</button>
        <div id="hr-bonus-error" class="join-error"></div>
      ` : `<div class="empty-cell">Aucun joueur connecté.</div>`}
    </div>
    <div class="panel" style="margin-bottom:16px;">
      <div class="panel-title">Demander un congé</div>
      <div class="form-row"><label>Type</label>
        <select id="hr-leave-type">${LEAVE_TYPES.map(t => `<option value="${t}">${t}</option>`).join("")}</select>
      </div>
      <div class="form-row"><label>Du</label><input id="hr-leave-start" type="date"/></div>
      <div class="form-row"><label>Au</label><input id="hr-leave-end" type="date"/></div>
      <div id="hr-error" class="join-error"></div>
      <button id="hr-leave-submit" class="btn-sm">Soumettre</button>
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
    ${leaveCalendarHtml(requests)}
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
  document.querySelectorAll("[data-hr-interview]").forEach(el => {
    el.addEventListener("click", () => {
      const [positionId, candidateId] = el.getAttribute("data-hr-interview").split("|");
      socket.emit("hr:interviewCandidate", { positionId, candidateId });
    });
  });
  document.querySelectorAll("[data-hr-hire]").forEach(el => {
    el.addEventListener("click", () => {
      const [positionId, candidateId] = el.getAttribute("data-hr-hire").split("|");
      socket.emit("hr:hireCandidate", { positionId, candidateId });
    });
  });
  const bonusBtn = document.getElementById("hr-bonus-submit");
  if (bonusBtn) bonusBtn.addEventListener("click", () => {
    const allocations = {};
    document.querySelectorAll("[data-hr-bonus-input]").forEach(el => {
      const amount = Number(el.value);
      if (amount > 0) allocations[el.getAttribute("data-hr-bonus-input")] = amount;
    });
    socket.emit("hr:distributeBonus", { allocations });
  });
  bindTaskPanel();
}

PAGE_RENDERERS.hr = renderHr;
PAGE_BINDERS.hr = bindHr;
