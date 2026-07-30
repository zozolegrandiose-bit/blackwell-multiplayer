// Shared session middleware (Patch 25) -- used by BOTH the Express app and the
// Socket.io handshake (via io.engine.use(...), the standard technique for
// letting a socket connection see the same session as its originating HTTP
// request), so a single login covers both the page and the game connection.
const session = require("express-session");

if (!process.env.SESSION_SECRET) {
  console.log("SESSION_SECRET non défini -- utilisation d'un secret de secours (à définir sur Render pour la production).");
}

const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET || "blackwell-dev-secret-change-in-production",
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 } // 30 days
});

module.exports = { sessionMiddleware };
