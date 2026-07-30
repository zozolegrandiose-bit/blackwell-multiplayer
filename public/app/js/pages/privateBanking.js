// Private Banking & Wealth Management (Patch 23) -- ultra-rich Family Office
// prospects, mandates, and the deposit-to-entity-liquidity link (server/
// privateBanking.js): signing a mandate directly credits a regional entity
// that actually runs a Private Banking desk (Global Footprint, Patch 19).
function familyOfficeStatusClass(status) {
  if (status === "Mandat actif") return "chip-good";
  if (status === "Expiré") return "chip-critical";
  return "chip-warning";
}

function privateBankingPanelHtml() {
  const offices = (appState.privateBanking && appState.privateBanking.familyOffices) || [];
  return `
    <div class="panel">
      <div class="panel-title">💎 Family Offices &amp; Mandats</div>
      <table class="data-table">
        <thead><tr><th>Family Office</th><th>Fortune nette</th><th>Type de mandat</th><th>Dépôt proposé</th><th>Statut</th><th></th></tr></thead>
        <tbody>
          ${offices.map(o => `
            <tr>
              <td>${escapeHtml(o.name)}</td>
              <td class="tnum">${fmtMoney(o.netWorth)}</td>
              <td>${escapeHtml(o.mandateType)}</td>
              <td class="tnum">${fmtMoney(o.proposedDeposit)}</td>
              <td><span class="chip ${familyOfficeStatusClass(o.status)}">${escapeHtml(o.status)}</span></td>
              <td>${o.status === "Prospect" ? `<button data-pb-sign="${o.id}" class="btn-sm">Signer le mandat</button>` : (o.creditedEntityId ? `<span style="font-size:11px; color:var(--text-muted);">crédité à ${escapeHtml(o.creditedEntityId)}</span>` : "")}</td>
            </tr>
          `).join("") || `<tr><td colspan="6" class="empty-cell">Aucun Family Office pour l'instant.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function renderPrivateBanking() {
  return `
    <div class="page-title">💎 Private Banking &amp; Wealth Management</div>
    <div class="page-sub">Clients ultra-riches (Family Offices), mandats de gestion — les dépôts collectés accroissent directement la liquidité des entités régionales dotées d'un desk Private Banking.</div>
    ${privateBankingPanelHtml()}
  `;
}

function bindPrivateBanking() {
  document.querySelectorAll("[data-pb-sign]").forEach(el => {
    el.addEventListener("click", () => socket.emit("privateBanking:signMandate", { officeId: el.getAttribute("data-pb-sign") }));
  });
}

PAGE_RENDERERS.privateBanking = renderPrivateBanking;
PAGE_BINDERS.privateBanking = bindPrivateBanking;
