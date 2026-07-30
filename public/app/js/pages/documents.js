function fmtSizeKb(kb) {
  if (kb >= 1024) return (kb / 1024).toFixed(1) + " Mo";
  return kb + " Ko";
}

function renderDocuments() {
  const docs = [...(appState.documents || [])].sort((a, b) => b.ts - a.ts);
  return `
    <div class="page-title">Documents</div>
    <div class="page-sub">Dépôt de documents partagé entre tous les joueurs.</div>
    <div class="panel" style="margin-bottom:16px;">
      <div class="panel-title">Déposer un document</div>
      <div class="form-row"><label>Nom du fichier</label><input id="doc-name" type="text" placeholder="ex. Presentation_Client.pptx"/></div>
      <div id="doc-error" class="join-error"></div>
      <button id="doc-upload" class="btn-sm">Déposer</button>
    </div>
    <div class="panel">
      <div class="panel-title">Documents (${docs.length})</div>
      <table class="data-table">
        <thead><tr><th>Nom</th><th>Taille</th><th>Déposé par</th><th>Date</th></tr></thead>
        <tbody>
          ${docs.map(d => `
            <tr>
              <td>📎 ${escapeHtml(d.name)}</td>
              <td class="tnum">${fmtSizeKb(d.sizeKb)}</td>
              <td>${escapeHtml(d.uploadedByName)}</td>
              <td>${fmtDate(d.ts)}</td>
            </tr>
          `).join("") || `<tr><td colspan="4" class="empty-cell">Aucun document.</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

function bindDocuments() {
  const uploadBtn = document.getElementById("doc-upload");
  if (!uploadBtn) return;
  uploadBtn.addEventListener("click", () => {
    socket.emit("documents:upload", { name: document.getElementById("doc-name").value });
  });
}

PAGE_RENDERERS.documents = renderDocuments;
PAGE_BINDERS.documents = bindDocuments;
