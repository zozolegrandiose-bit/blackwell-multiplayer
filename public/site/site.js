// Shared chrome for the public marketing site (Patch 27): header/nav,
// footer, and a decorative ticker. Pure client-side, no server/session
// dependency -- these pages are public and must work with no account at all.
const SITE_NAV = [
  { href: "/about", label: "À Propos" },
  { href: "/solutions", label: "Nos Métiers" },
  { href: "/csr", label: "RSE & Impact" },
  { href: "/careers", label: "Carrières" },
  { href: "/press", label: "Presse & Insights" }
];

function renderSiteHeader(activeHref) {
  const nav = SITE_NAV.map(item =>
    `<a href="${item.href}"${item.href === activeHref ? ' style="color:var(--text-900);"' : ""}>${item.label}</a>`
  ).join("");
  document.getElementById("site-header").innerHTML = `
    <div class="site-logo"><a href="/" style="color:inherit; text-decoration:none;">Blackwell &amp; Co Capital</a></div>
    <div class="site-nav">${nav}<a href="/login" class="site-nav-cta">Accès Intranet / Portail Employé</a></div>
  `;
}

function renderSiteFooter() {
  const el = document.getElementById("site-footer");
  if (el) el.innerHTML = `© ${new Date().getFullYear()} Blackwell &amp; Co Capital. Tous droits réservés. Contenu à visée d'illustration (projet de jeu multijoueur).`;
}

const TICKER_SEED = [
  { sym: "BWCO", price: 214.30 },
  { sym: "S&P 500", price: 5482.12 },
  { sym: "NASDAQ", price: 17890.44 },
  { sym: "EURO STOXX 50", price: 4921.6 },
  { sym: "NIKKEI 225", price: 39215.8 },
  { sym: "US 10Y", price: 4.28 },
  { sym: "EUR/USD", price: 1.082 },
  { sym: "OR (Once)", price: 2384.5 }
];

function renderSiteTicker() {
  const el = document.getElementById("site-ticker");
  if (!el) return;
  const state = TICKER_SEED.map(s => Object.assign({ delta: 0 }, s));
  function draw() {
    const items = state.map(s => {
      const cls = s.delta >= 0 ? "up" : "down";
      const arrow = s.delta >= 0 ? "▲" : "▼";
      return `<span class="site-ticker-item"><span class="sym">${s.sym}</span> ${s.price.toFixed(2)} <span class="${cls}">${arrow} ${Math.abs(s.delta).toFixed(2)}%</span></span>`;
    }).join("");
    el.innerHTML = `<div class="site-ticker-track">${items}${items}</div>`;
  }
  draw();
  setInterval(() => {
    state.forEach(s => {
      const pct = (Math.random() - 0.5) * 0.6;
      s.price = Math.max(0.01, s.price * (1 + pct / 100));
      s.delta = pct;
    });
    draw();
  }, 3000);
}

document.addEventListener("DOMContentLoaded", () => {
  renderSiteFooter();
  renderSiteTicker();
});
