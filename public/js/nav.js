const NAV = [
  { id: "overview", label: "Vue d'ensemble", icon: "◈" },
  { id: "mail", label: "Mail", icon: "✉" },
  { id: "ma", label: "M&A", icon: "🤝" },
  { id: "clients", label: "Clients", icon: "◐" },
  { id: "compliance", label: "Conformité", icon: "🛡" },
  { id: "hr", label: "RH", icon: "❖" },
  { id: "finance", label: "Finance", icon: "📊" }
];

function visibleNav(player) {
  return NAV.filter(item => player.access.includes(item.id));
}
