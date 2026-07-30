// Admin Panel (Patch 26) -- plain Express JSON routes, all gated by
// requireSuperAdmin (server/auth.js), mirroring the same convention as
// server/auth.js: account management is a one-shot request/response action,
// not real-time game state, so it doesn't belong on Socket.io.
//
// The "entité géographique" options intentionally reuse the 4 real regional
// entities already built in server/globalBank.js (Patch 19), which carry real
// mechanics (capital ratio, activeDesks, liquidity) -- rather than inventing
// extra cities here that wouldn't correspond to an actual functioning entity
// in the game. The public Careers page (a later patch) can still list more
// cities as flavor for job postings without every one of them needing to be a
// fully mechanized entity.
const express = require("express");
const {
  toPublicUser, listPendingUsers, listAllUsers, listCandidates,
  approveUser, rejectUser, revokeUser, updateUserAssignment
} = require("./db");
const { DEPARTMENTS, GRADES } = require("./seedData");
const { requireSuperAdmin } = require("./auth");

const ADMIN_ENTITIES = [
  { id: "ny", label: "New York (Siège)" },
  { id: "fra", label: "Francfort (Blackwell SE)" },
  { id: "hk", label: "Hong Kong" },
  { id: "ldn", label: "Londres" }
];

function registerAdminRoutes(app) {
  const router = express.Router();
  router.use(express.json());
  router.use(requireSuperAdmin);

  router.get("/api/admin/overview", (req, res) => {
    res.json({
      pendingUsers: listPendingUsers().map(toPublicUser),
      allUsers: listAllUsers().map(toPublicUser),
      candidates: listCandidates(),
      options: { departments: DEPARTMENTS, grades: GRADES, entities: ADMIN_ENTITIES }
    });
  });

  router.post("/api/admin/approve", (req, res) => {
    const { userId, assignedDept, assignedGrade, assignedEntity, assignedSalary } = req.body || {};
    if (!userId || !assignedDept || !assignedGrade || !assignedEntity) {
      res.status(400).json({ ok: false, reason: "Rôle, grade et entité sont requis pour approuver un compte." });
      return;
    }
    const result = approveUser(userId, { assignedDept, assignedGrade, assignedEntity, assignedSalary });
    res.status(result.ok ? 200 : 400).json(result.ok ? { ok: true, user: toPublicUser(result.user) } : result);
  });

  router.post("/api/admin/reject", (req, res) => {
    const result = rejectUser((req.body || {}).userId);
    res.status(result.ok ? 200 : 400).json(result.ok ? { ok: true, user: toPublicUser(result.user) } : result);
  });

  router.post("/api/admin/revoke", (req, res) => {
    const result = revokeUser((req.body || {}).userId);
    res.status(result.ok ? 200 : 400).json(result.ok ? { ok: true, user: toPublicUser(result.user) } : result);
  });

  router.post("/api/admin/update-assignment", (req, res) => {
    const { userId, assignedDept, assignedGrade, assignedEntity, assignedSalary } = req.body || {};
    const result = updateUserAssignment(userId, { assignedDept, assignedGrade, assignedEntity, assignedSalary });
    res.status(result.ok ? 200 : 400).json(result.ok ? { ok: true, user: toPublicUser(result.user) } : result);
  });

  app.use(router);
}

module.exports = { registerAdminRoutes, ADMIN_ENTITIES };
