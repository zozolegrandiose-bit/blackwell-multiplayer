// Agenda -- Outlook-style month calendar grid (Patch 24), replacing the flat
// upcoming-meetings table. Duplicates a tiny month-grid helper rather than
// relying on public/js/pages/hr.js's near-identical buildMonthDays()/isoDate()
// (loaded after this file in index.html, and cross-file coupling on two small,
// easily-inlined date utilities isn't worth the fragility).
const AGENDA_DOW = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
let agendaViewDate = new Date();

function agendaMonthDays(year, month) {
  const firstDay = new Date(year, month, 1);
  const startWeekday = (firstDay.getDay() + 6) % 7; // Monday = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const days = [];
  for (let i = 0; i < startWeekday; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(new Date(year, month, d));
  return days;
}

function agendaIsoDate(date) {
  return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
}

const AGENDA_MONTH_LABELS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

function agendaCalendarHtml(meetings) {
  const year = agendaViewDate.getFullYear(), month = agendaViewDate.getMonth();
  const days = agendaMonthDays(year, month);
  const todayIso = agendaIsoDate(new Date());
  const meetingsByDate = {};
  meetings.forEach(m => { (meetingsByDate[m.date] = meetingsByDate[m.date] || []).push(m); });

  return `
    <div class="panel">
      <div class="outlook-calendar-nav">
        <button id="ag-prev-month" class="btn-sm">◀</button>
        <div class="panel-title" style="margin:0;">${AGENDA_MONTH_LABELS[month]} ${year}</div>
        <button id="ag-next-month" class="btn-sm">▶</button>
      </div>
      <div class="outlook-calendar-grid">
        ${AGENDA_DOW.map(d => `<div class="outlook-calendar-dow">${d}</div>`).join("")}
        ${days.map(day => {
          if (!day) return `<div class="outlook-calendar-cell empty"></div>`;
          const iso = agendaIsoDate(day);
          const dayMeetings = (meetingsByDate[iso] || []).sort((a, b) => a.time.localeCompare(b.time));
          return `
            <div class="outlook-calendar-cell ${iso === todayIso ? "today" : ""}">
              <div class="outlook-calendar-daynum">${day.getDate()}</div>
              ${dayMeetings.slice(0, 3).map(m => `<div class="outlook-calendar-event" title="${escapeHtml(m.title)} — ${escapeHtml(m.time)}">${escapeHtml(m.time)} ${escapeHtml(m.title)}</div>`).join("")}
              ${dayMeetings.length > 3 ? `<div style="font-size:9.5px; color:var(--text-muted);">+${dayMeetings.length - 3} de plus</div>` : ""}
            </div>
          `;
        }).join("")}
      </div>
    </div>
  `;
}

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
    ${agendaCalendarHtml(meetings)}
  `;
}

function bindAgenda() {
  const createBtn = document.getElementById("ag-create");
  if (createBtn) createBtn.addEventListener("click", () => {
    const select = document.getElementById("ag-participants");
    const participants = Array.from(select.selectedOptions).map(o => o.value);
    socket.emit("agenda:create", {
      title: document.getElementById("ag-title").value,
      date: document.getElementById("ag-date").value,
      time: document.getElementById("ag-time").value,
      participants
    });
  });
  const prevBtn = document.getElementById("ag-prev-month");
  if (prevBtn) prevBtn.addEventListener("click", () => {
    agendaViewDate = new Date(agendaViewDate.getFullYear(), agendaViewDate.getMonth() - 1, 1);
    renderApp();
  });
  const nextBtn = document.getElementById("ag-next-month");
  if (nextBtn) nextBtn.addEventListener("click", () => {
    agendaViewDate = new Date(agendaViewDate.getFullYear(), agendaViewDate.getMonth() + 1, 1);
    renderApp();
  });
}

PAGE_RENDERERS.agenda = renderAgenda;
PAGE_BINDERS.agenda = bindAgenda;
