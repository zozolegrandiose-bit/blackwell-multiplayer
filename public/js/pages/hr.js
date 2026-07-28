const LEAVE_TYPES = ["Congés payés", "RTT", "Arrêt maladie", "Congé sans solde"];
const LEAVE_STATUS_CLASS = { "En attente": "chip-warning", "Approuvé": "chip-good", "Refusé": "chip-critical" };
const BONUS_POOL_RATE = 0.10;

// One flagship department per cluster (A-F) -- lets HR move a player between
// desks without needing the full 39-department picker; matches the user's own
// framing of "desks" as M&A / Trading / Risk / Wealth / Finance / RH.
const DESK_OPTIONS = [
  { dept: "Fusions-Acquisitions (M&A)", label: "M&A" },
  { dept: "Trading FICC", label: "Trading" },
  { dept: "Gestion de Fortune", label: "Gestion de Fortune" },
  { dept: "Conformité", label: "Risk / Conformité" },
  { dept: "Trésorerie de Groupe", label: "Finance" },
  { dept: "Ressources Humaines", label: "RH" }
];

function satisfactionMeterColor(value) {
  if (value >= 60) return "var(--series-green)";
  if (value >= 30) return "#f5b942";
  return "var(--series-red)";
}

function orgChartPanelHtml() {
  const roster = appState.players || [];
  return `
    <div class="panel" style="margin-bottom:16px;">
      <div class="panel-title">🗂️ Organigramme</div>
      <table class="data-table">
        <thead><tr><th>Collaborateur</th><th>Grade</th><th>Desk</th><th>Salaire</th><th>Satisfaction</th><th>Stress</th><th>Compétence</th><th>Réaffecter</th><th></th><th></th></tr></thead>
        <tbody>
          ${roster.map(p => `
            <tr>
              <td><div class="person-row">${avatarHtml(p.fullName, 20)}<span class="person-row-name">${escapeHtml(p.fullName)}</span></div>${p.onSabbatical ? `<div style="font-size:10px; color:var(--text-muted);">🌴 En sabbatique</div>` : ""}${p.onSickLeave ? `<div style="font-size:10px; color:var(--series-red);">🤒 Arrêt (burn-out)</div>` : ""}${p.raiseRequested ? `<div style="font-size:10px; color:var(--warning);">💬 Demande d'augmentation <button data-org-grant-raise="${p.id}" class="btn-sm" style="padding:1px 6px; font-size:10px;">Accorder</button></div>` : ""}</td>
              <td>${escapeHtml(p.grade)}</td>
              <td>${escapeHtml(p.dept)}</td>
              <td class="tnum">${p.baseSalary != null ? fmtMoney(p.baseSalary) + "/an" : "—"}</td>
              <td><span class="chip" style="background:transparent; color:${satisfactionMeterColor(p.satisfaction == null ? 70 : p.satisfaction)};">${p.satisfaction == null ? "—" : p.satisfaction + "%"}</span></td>
              <td><span class="chip" style="background:transparent; color:${(p.stress || 0) >= 85 ? "var(--series-red)" : (p.stress || 0) >= 50 ? "#f5b942" : "var(--series-green)"};">${p.stress || 0}%</span></td>
              <td class="tnum">${p.skillRating != null ? p.skillRating : "—"}</td>
              <td>
                <select data-org-desk-select="${p.id}" class="btn-sm">
                  ${DESK_OPTIONS.map(d => `<option value="${d.dept}" ${p.dept === d.dept ? "selected" : ""}>${escapeHtml(d.label)}</option>`).join("")}
                </select>
              </td>
              <td><button data-org-promote="${p.id}" class="btn-sm">Promouvoir</button></td>
              <td>${p.onSabbatical ? "—" : `<button data-org-sabbatical="${p.id}" class="btn-sm">🌴 Sabbatique</button>`}</td>
            </tr>
          `).join("") || `<tr><td colspan="10" class="empty-cell">Aucun collaborateur connecté.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function bindOrgChartPanel() {
  document.querySelectorAll("[data-org-promote]").forEach(el => {
    el.addEventListener("click", () => socket.emit("hr:promotePlayer", { playerId: el.getAttribute("data-org-promote") }));
  });
  document.querySelectorAll("[data-org-desk-select]").forEach(el => {
    el.addEventListener("change", () => socket.emit("hr:reassignDesk", { playerId: el.getAttribute("data-org-desk-select"), newDept: el.value }));
  });
  document.querySelectorAll("[data-org-sabbatical]").forEach(el => {
    el.addEventListener("click", () => socket.emit("hr:sendOnSabbatical", { playerId: el.getAttribute("data-org-sabbatical"), durationMs: 120000 }));
  });
  document.querySelectorAll("[data-org-grant-raise]").forEach(el => {
    el.addEventListener("click", () => socket.emit("hr:grantRaise", { playerId: el.getAttribute("data-org-grant-raise"), raiseAmount: 2 }));
  });
}

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
    ${orgChartPanelHtml()}
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
        <button id="hr-bonus-submit" class="btn-sm" style="margin-top:10px;">Distribuer manuellement</button>
        <button id="hr-bonus-auto" class="btn-sm" style="margin-top:10px;">🤖 Répartition automatique (au prorata du score)</button>
        <div id="hr-bonus-error" class="join-error"></div>
      ` : `<div class="empty-cell">Aucun joueur connecté.</div>`}
      ${hr.lastPayrollAmount ? `<div style="font-size:11px; color:var(--text-muted); margin-top:8px;">💸 Masse salariale mensuelle prélevée à la dernière clôture de journée : ${fmtMoney(hr.lastPayrollAmount)}</div>` : ""}
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
    ${mercatoPanelHtml()}
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

// Shared between hr.js and strategy.js -- HR players and Director-and-above
// players both get access to the mercato via server/mercato.js, but only HR
// has the "hr" page in their nav, so Directors need it surfaced on Comité de
// Direction instead. appState.rivalTalent/mercatoOffers are only ever present
// in the snapshot for players with one of those two access grants.
function mercatoPanelHtml() {
  const rivalTalent = appState.rivalTalent;
  if (!rivalTalent) return "";
  const offers = appState.mercatoOffers || [];
  return `
    <div class="panel" style="margin-bottom:16px;">
      <div class="panel-title">🔀 Mercato Inter-Banques</div>
      <div style="font-size:11.5px; color:var(--text-muted); margin-bottom:10px;">Débauchez un talent d'une banque rivale en lui proposant un meilleur salaire — plus l'écart est généreux, plus l'offre a de chances d'être acceptée.</div>
      ${Object.keys(rivalTalent).map(bankName => `
        <div style="margin-bottom:12px;">
          <div style="font-weight:700; font-size:12.5px; margin-bottom:6px;">${escapeHtml(bankName)}</div>
          <div style="display:flex; gap:10px; flex-wrap:wrap;">
            ${rivalTalent[bankName].map(npc => `
              <div style="border:1px solid var(--border); border-radius:8px; padding:8px 10px; min-width:210px;">
                <div style="font-weight:600; font-size:12.5px;">${escapeHtml(npc.name)}</div>
                <div style="font-size:11px; color:var(--text-muted); margin:2px 0 6px;">${escapeHtml(npc.role)} · niveau ${npc.skillRating} · salaire actuel ${fmtMoney(npc.currentSalary)}</div>
                <div style="font-size:11px; margin-bottom:6px;">Loyauté : <span style="color:${npc.loyalty < 40 ? "var(--series-red)" : "var(--series-green)"};">${npc.loyalty}%</span>${npc.loyalty < 40 ? " — cible facile" : ""}</div>
                ${npc.pendingOffer ? `
                  <div style="font-size:11px; color:var(--warning);">⏳ Offre de ${escapeHtml(npc.pendingOffer.byName)} (${fmtMoney(npc.pendingOffer.offeredSalary)}) — contre-offre possible sous ${Math.max(0, Math.round((npc.pendingOffer.deadline - Date.now()) / 1000))}s</div>
                ` : `
                  <div style="display:flex; gap:6px; align-items:center;">
                    <input data-mercato-salary-input="${bankName}|${npc.id}" type="number" step="0.5" min="${npc.currentSalary * 1.05}" placeholder="Offre (M$)" style="width:110px; padding:5px 7px; border-radius:6px; border:1px solid var(--border); background:var(--surface-2); color:var(--text-900); font-size:11.5px;"/>
                    <button data-mercato-offer="${bankName}|${npc.id}" class="btn-sm">Débaucher</button>
                  </div>
                `}
              </div>
            `).join("")}
          </div>
        </div>
      `).join("") || `<div class="empty-cell">Aucun talent disponible actuellement.</div>`}
      <div id="mercato-error" class="join-error"></div>
      ${offers.length ? `
        <div style="margin-top:10px;">
          <div style="font-size:11px; color:var(--text-muted); margin-bottom:4px;">Dernières offres</div>
          ${offers.slice(0, 6).map(o => `
            <div style="font-size:11.5px; padding:4px 0; border-top:1px solid var(--border);">
              ${o.success ? "✅" : (o.countered ? "🛡️" : "❌")} ${escapeHtml(o.byName)} → ${escapeHtml(o.npcName)} (${escapeHtml(o.bankName)}) — ${fmtMoney(o.offeredSalary)}${o.countered ? " (contre-offre réussie, cible retenue)" : ""}
            </div>
          `).join("")}
        </div>
      ` : ""}
    </div>
  `;
}

function bindMercatoPanel() {
  document.querySelectorAll("[data-mercato-offer]").forEach(el => {
    el.addEventListener("click", () => {
      const [bankName, npcId] = el.getAttribute("data-mercato-offer").split("|");
      const input = document.querySelector(`[data-mercato-salary-input="${bankName}|${npcId}"]`);
      const offeredSalary = Number(input && input.value);
      const errEl = document.getElementById("mercato-error");
      if (errEl) errEl.textContent = "";
      if (!offeredSalary) {
        if (errEl) errEl.textContent = "Indiquez un montant d'offre.";
        return;
      }
      socket.emit("mercato:makeOffer", { bankName, npcId, offeredSalary });
    });
  });
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
  const autoBonusBtn = document.getElementById("hr-bonus-auto");
  if (autoBonusBtn) autoBonusBtn.addEventListener("click", () => socket.emit("hr:autoDistributeBonus"));
  bindTaskPanel();
  bindMercatoPanel();
  bindOrgChartPanel();
}

PAGE_RENDERERS.hr = renderHr;
PAGE_BINDERS.hr = bindHr;
