const LEAVE_TYPES = ["Congés payés", "RTT", "Arrêt maladie", "Congé sans solde"];
const LEAVE_STATUS_CLASS = { "En attente": "chip-warning", "Approuvé": "chip-good", "Refusé": "chip-critical" };

function renderHr() {
  const requests = (appState.hr && appState.hr.leaveRequests) || [];
  return `
    <div class="page-title">RH</div>
    <div class="page-sub">Effectif de la partie et demandes de congé.</div>
    <div class="panel-row" style="margin-bottom:16px;">
      <div class="panel">
        <div class="panel-title">Effectif (${appState.players.length})</div>
        <table class="data-table">
          <thead><tr><th>Nom</th><th>Grade</th><th>Département</th></tr></thead>
          <tbody>
            ${appState.players.map(p => `<tr><td>${escapeHtml(p.fullName)}</td><td>${escapeHtml(p.grade)}</td><td>${escapeHtml(p.dept)}</td></tr>`).join("")}
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
}

PAGE_RENDERERS.hr = renderHr;
PAGE_BINDERS.hr = bindHr;
