const MA_STAGES = ["Screening", "Due Diligence", "Négociation", "Signing", "Clôturé"];

function renderMa() {
  const deals = appState.maDeals || [];
  return `
    <div class="page-title">M&amp;A</div>
    <div class="page-sub">Pipeline d'opérations — visible par Direction Générale et les métiers de dealmaking.</div>
    <div class="panel" style="margin-bottom:16px;">
      <div class="panel-title">Nouveau projet</div>
      <div class="form-row"><label>Nom du projet</label><input id="ma-name" type="text" placeholder="ex. Projet Atlas — acquisition XYZ"/></div>
      <div class="form-row"><label>Description</label><textarea id="ma-desc" rows="2" placeholder="Résumé de l'opération…" style="width:100%; padding:8px 10px; border-radius:6px; border:1px solid var(--line-200); font-size:13px;"></textarea></div>
      <div class="form-row"><label>Valorisation estimée (M$)</label><input id="ma-valuation" type="number" placeholder="ex. 500"/></div>
      <div class="form-row"><label>Synergies estimées (M$)</label><input id="ma-synergies" type="number" placeholder="ex. 20"/></div>
      <div id="ma-error" class="join-error"></div>
      <button id="ma-create" class="btn-sm">Créer le projet</button>
    </div>
    <div class="panel">
      <div class="panel-title">Projets en cours (${deals.length})</div>
      ${deals.map(d => `
        <div class="activity-row" style="display:block; padding:10px 0;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div style="font-weight:700; font-size:13px;">${escapeHtml(d.name)}</div>
            <select data-ma-stage="${d.id}" class="btn-sm">
              ${MA_STAGES.map(s => `<option value="${s}" ${d.stage === s ? "selected" : ""}>${s}</option>`).join("")}
            </select>
          </div>
          <div style="font-size:11px; color:var(--text-muted); margin:4px 0;">Banquier responsable : ${escapeHtml(d.leadBankerName)} · Valorisation : ${fmtMoney(d.valuation)} · Synergies : ${d.synergies ? fmtMoney(d.synergies) : "—"}</div>
          <div style="font-size:12.5px; margin-bottom:6px;">${escapeHtml(d.description) || "—"}</div>
          <div>
            ${d.ddChecklist.map((c, i) => `
              <label style="display:block; font-size:12px; margin-bottom:2px;">
                <input type="checkbox" data-ma-checklist="${d.id}|${i}" ${c.done ? "checked" : ""}/> ${escapeHtml(c.item)}
              </label>
            `).join("")}
          </div>
        </div>
      `).join("") || `<div class="empty-cell">Aucun projet en cours.</div>`}
    </div>
  `;
}

function bindMa() {
  const createBtn = document.getElementById("ma-create");
  if (createBtn) createBtn.addEventListener("click", () => {
    socket.emit("ma:create", {
      name: document.getElementById("ma-name").value,
      description: document.getElementById("ma-desc").value,
      valuation: document.getElementById("ma-valuation").value,
      synergies: document.getElementById("ma-synergies").value
    });
  });
  document.querySelectorAll("[data-ma-stage]").forEach(el => {
    el.addEventListener("change", () => {
      socket.emit("ma:updateStage", { dealId: el.getAttribute("data-ma-stage"), stage: el.value });
    });
  });
  document.querySelectorAll("[data-ma-checklist]").forEach(el => {
    el.addEventListener("change", () => {
      const [dealId, index] = el.getAttribute("data-ma-checklist").split("|");
      socket.emit("ma:toggleChecklist", { dealId, index: Number(index) });
    });
  });
}

PAGE_RENDERERS.ma = renderMa;
PAGE_BINDERS.ma = bindMa;
