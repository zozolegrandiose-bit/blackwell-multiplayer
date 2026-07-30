// Authentication routes & access-gating middleware (Patch 25). Plain Express
// request/response endpoints, deliberately NOT Socket.io events -- account
// creation/login are one-shot actions, not real-time game state.
const express = require("express");
const {
  toPublicUser, findUserByEmail, findUserById, createUser, verifyPassword
} = require("./db");
const { DEPARTMENTS, GRADES } = require("./seedData");

function registerAuthRoutes(app) {
  const router = express.Router();
  router.use(express.json());

  router.post("/register", (req, res) => {
    const { firstName, lastName, email, password, deptRequested, gradeRequested } = req.body || {};
    if (!firstName || !lastName || !email || !password) {
      res.status(400).json({ ok: false, reason: "Tous les champs obligatoires doivent être renseignés." });
      return;
    }
    const result = createUser({ firstName, lastName, email, password, deptRequested, gradeRequested });
    if (!result.ok) {
      res.status(400).json(result);
      return;
    }
    res.json({ ok: true, user: toPublicUser(result.user) });
  });

  router.post("/login", (req, res) => {
    const { email, password } = req.body || {};
    const user = findUserByEmail(email);
    if (!user || !verifyPassword(user, password)) {
      res.status(401).json({ ok: false, reason: "Email ou mot de passe incorrect." });
      return;
    }
    if (user.status === "PENDING_APPROVAL") {
      res.status(403).json({ ok: false, reason: "Votre compte est en attente d'approbation par l'administrateur." });
      return;
    }
    if (user.status !== "APPROVED") {
      res.status(403).json({ ok: false, reason: "Ce compte n'a plus accès (statut : " + user.status + ")." });
      return;
    }
    req.session.userId = user.id;
    res.json({ ok: true, user: toPublicUser(user) });
  });

  router.post("/logout", (req, res) => {
    req.session.destroy(() => res.json({ ok: true }));
  });

  router.get("/api/me", (req, res) => {
    const user = req.session.userId ? findUserById(req.session.userId) : null;
    if (!user) {
      res.status(401).json({ ok: false });
      return;
    }
    res.json({ ok: true, user: toPublicUser(user) });
  });

  router.get("/api/roster-options", (req, res) => {
    res.json({ departments: DEPARTMENTS, grades: GRADES });
  });

  app.use(router);
}

// Blocks both page loads (redirects to /login) and JSON API calls (401) for
// anyone without a valid, APPROVED session -- covers /app/* and /api/admin/*.
function requireApproved(req, res, next) {
  const user = req.session.userId ? findUserById(req.session.userId) : null;
  if (!user || user.status !== "APPROVED") {
    // req.originalUrl (not req.path) because this middleware also runs
    // inside sub-routers (e.g. mounted at /api/admin), where req.path is
    // rewritten relative to the mount point and would lose the /api prefix.
    if (req.accepts("html") && !req.originalUrl.startsWith("/api")) {
      res.redirect("/login");
      return;
    }
    res.status(401).json({ ok: false, reason: "Non authentifié ou compte non approuvé." });
    return;
  }
  req.user = user;
  next();
}

function requireSuperAdmin(req, res, next) {
  requireApproved(req, res, () => {
    if (!req.user.isSuperAdmin) {
      res.status(403).json({ ok: false, reason: "Réservé au Super-Admin." });
      return;
    }
    next();
  });
}

module.exports = { registerAuthRoutes, requireApproved, requireSuperAdmin };
