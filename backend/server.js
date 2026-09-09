"use strict";

const path = require("path");
const express = require("express");
const fetch = require("node-fetch");

const { resolveNamespace } = require("./fabricConnect");
const mockResolver = require("./mockResolver");

const PORT = process.env.PORT || 3000;
const DEFAULT_PEER_ENDPOINT =
  process.env.PEER_ENDPOINT || "peer0.tws.rwrrn.recordweb.dev:7051";
const ALLOW_CLIENT_PEER_OVERRIDE =
  (process.env.ALLOW_CLIENT_PEER_OVERRIDE || "true").toLowerCase() === "true";
const FETCH_TIMEOUT_MS = Number(process.env.FETCH_TIMEOUT_MS || 4000);

const app = express();
app.disable("x-powered-by");
app.use(express.static(path.join(__dirname, "frontend")));
app.use("/mock-resolver", mockResolver);

// Liefert dem Frontend, welcher Peer aktuell als Default gilt und ob ein
// Override durch den Client ueberhaupt erlaubt ist (Betreiber-Schalter).
app.get("/api/config", (_req, res) => {
  res.json({
    defaultPeerEndpoint: DEFAULT_PEER_ENDPOINT,
    allowClientPeerOverride: ALLOW_CLIENT_PEER_OVERRIDE,
  });
});

function isValidPeerEndpoint(value) {
  if (typeof value !== "string") return false;
  // host:port, keine Schemas/Pfade/Leerzeichen - bewusst restriktiv, da der
  // Wert direkt in einen gRPC-Zielnamen einfliesst.
  return /^[a-zA-Z0-9.-]+:[0-9]{2,5}$/.test(value.trim());
}

app.get("/api/resolve", async (req, res) => {
  const did = req.query.did;
  if (!did || !did.startsWith("did:rwp:")) {
    return res.status(400).json({ error: "Invalid did:rwp-ID" });
  }

  const parts = did.split(":");
  const namespace = parts[2];
  if (!namespace) {
    return res
      .status(400)
      .json({ error: "The namespace could not be extracted from the DID" });
  }

  let peerEndpoint = DEFAULT_PEER_ENDPOINT;
  const requestedPeer = req.query.peer;
  if (requestedPeer !== undefined && requestedPeer !== "") {
    if (!ALLOW_CLIENT_PEER_OVERRIDE) {
      return res
        .status(403)
        .json({ error: "The operator of this instance does not allow clients to select peers." });
    }
    if (!isValidPeerEndpoint(requestedPeer)) {
      return res
        .status(400)
        .json({ error: "Invalid peer address. The format must be host:port, e.g., peer0.example.org:7051" });
    }
    peerEndpoint = requestedPeer.trim();
  }

  try {
    const chaincodeResult = await resolveNamespace(namespace, { peerEndpoint });
    const resolverEndpoint = chaincodeResult.resolverEndpoint;

    let didRecord;
    let resolverSource = "live";
    try {
      const httpRes = await fetch(`${resolverEndpoint}/${did}`, {
        timeout: FETCH_TIMEOUT_MS,
      });
      // Ein 404 mit JSON-Body ist die gueltige Antwort "DID unbekannt" und wird
      // durchgereicht; nur ein nicht erreichbarer/kaputter Resolver faellt auf den Mock zurueck.
      didRecord = await httpRes.json();
      if (!httpRes.ok) resolverSource = "live-not-found";
    } catch (err) {
      resolverSource = "mock-fallback";
      const mockUrl = `http://localhost:${PORT}/mock-resolver/rwp/v2/${encodeURIComponent(did)}`;
      const mockRes = await fetch(mockUrl);
      didRecord = await mockRes.json();
    }

    let fullRecord = null;
    if (didRecord.recordEndpoint) {
      try {
        const recordRes = await fetch(didRecord.recordEndpoint, {
          timeout: FETCH_TIMEOUT_MS,
        });
        if (recordRes.ok) {
          fullRecord = await recordRes.json();
        } else {
          fullRecord = {
            error: `Unable to load the record (HTTP ${recordRes.status})`,
            status: recordRes.status,
          };
        }
      } catch (err) {
        fullRecord = { error: "Unable to load the record: " + err.message };
      }
    }

    res.json({
      inputDid: did,
      extractedNamespace: namespace,
      peerEndpointUsed: peerEndpoint,
      chaincodeResult,
      resolverEndpointCalled: resolverEndpoint,
      recordEndpointCalled: didRecord.recordEndpoint || null,
      resolverSource,
      didDocument: didRecord,
      fullRecord,
    });
  } catch (err) {
    console.error("Resolution failed:", err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`RecordFinder runs on http://localhost:${PORT}`);
  console.log(`Standard-Peer: ${DEFAULT_PEER_ENDPOINT}`);
});
