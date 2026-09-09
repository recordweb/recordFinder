"use strict";

const express = require("express");
const router = express.Router();

// Statische Beispiel-Antworten, damit die App auch ohne erreichbaren
// Live-Resolver vorfuehrbar bleibt (Netzwerk-Ausfall, Demo ohne Internet, o.ae.).
const MOCK_RECORDS = {
  "did:rwp:a3f9e21c:xyz123": {
    did: "did:rwp:a3f9e21c:xyz123",
    recordEndpoint: "https://records.bundesarchiv.admin.ch/api/v1/records/xyz123",
    created: "2026-05-31T14:00:00Z",
    currentVersion: "sha256:mock-hash-abc123...",
    controller: "did:rwp:a3f9e21c:controller-001",
    mock: true,
  },
};

// Regex statt ":did", damit DIDs mit Pfadsegmenten (did:rwp:ns:users/name) matchen.
router.get(/^\/rwp\/v2\/(.+)$/, (req, res) => {
  const did = decodeURIComponent(req.params[0]);
  const record =
    MOCK_RECORDS[did] || {
      did,
      status: "not-found-in-mock",
      mock: true,
      message: "No simulated record has been stored for this DID.",
    };
  res.json(record);
});

module.exports = router;
