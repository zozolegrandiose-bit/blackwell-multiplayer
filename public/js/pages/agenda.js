function renderAgenda() {
  const meetings = [...(appState.agenda || [])].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  return `
    <div class="page-title">Agenda</div>
    <div class="page-sub">Réunions partagées entre tous les joueurs.</div>
    <div class="panel" style="margin-bottom:16px;">
      <div class="panel-title">Nouvelle réunion</div>
      <div class="form-row"><label>Titre</label><input id="ag-title" type="text" placeholder="ex. Point hebdomadaire"/></div>
      <div class="form-row"><label>Date</label><input id="ag-date" type="date"/></div>
      <div class="form-row"><label>Heure</label><input id="ag-time" type="time" value="09:00"/></div>
      <div class="form-row"><label>Participants</label>
        <select id="ag-participants" multiple style="height:100px;">
          ${appState.players.map(p => `<option value="${p.id}">${escapeHtml(p.fullName)}</option>`).join("")}
        </select>
      </div>
      <div id="ag-error" class="join-error"></div>
      <button id="ag-create" class="btn-sm">Planifier</button>
    </div>
    <div class="panel">
      <div class="panel-title">Réunions à venir (${meetings.length})</div>
      <table class="data-table">
        <thead><tr><th>Titre</th><th>Date</th><th>Heure</th><th>Participants</th><th>Créé par</th></tr></thead>
        <tbody>
          ${meetings.map(m => `
            <tr>
              <td>${escapeHtml(m.title)}</td>
              <td class="tnum">${escapeHtml(m.date)}</td>
              <td class="tnum">${escapeHtml(m.time)}</td>
              <td>${m.participants.map(p => escapeHtml(p.fullName)).join(", ") || "—"}</td>
              <td>${escapeHtml(m.createdByName)}</td>
            </tr>
          `).join("") || `<tr><td colspan="5" class="empty-cell">Aucune réunion planifiée.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function bindAgenda() {
  const createBtn = document.getElementById("ag-create");
  if (!createBtn) return;
  createBtn.addEventListener("click", () => {
    const select = document.getElementById("ag-participants");
    const participants = Array.from(select.selectedOptions).map(o => o.value);
    socket.emit("agenda:create", {
      title: document.getElementById("ag-title").value,
      date: document.getElementById("ag-date").value,
      time: document.getElementById("ag-time").value,
      participants
    });
  });
}

PAGE_RENDERERS.agenda = renderAgenda;
PAGE_BINDERS.agenda = bindAgenda;
