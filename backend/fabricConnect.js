"use strict";

const grpc = require("@grpc/grpc-js");
const { connect, signers } = require("@hyperledger/fabric-gateway");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const CRYPTO_DIR =
  process.env.CRYPTO_DIR || "/crypto/peerOrganizations/org.recordweb.dev";

const MSP_ID = process.env.MSP_ID || "TWSOrgMSP";
const PEER_HOST_ALIAS =
  process.env.PEER_HOST_ALIAS || "peer0.tws.rwrrn.recordweb.dev";
const CHANNEL_NAME = process.env.CHANNEL_NAME || "rw-gnr-test";
const CHAINCODE_NAME = process.env.CHAINCODE_NAME || "namespace-registry";
const ORG_DOMAIN = process.env.ORG_DOMAIN || "org.recordweb.dev";

const TLS_CERT_PATH = path.join(
  CRYPTO_DIR,
  "peers",
  PEER_HOST_ALIAS,
  "tls",
  "ca.crt"
);
const ADMIN_MSP_DIR = path.join(CRYPTO_DIR, "users", `Admin@${ORG_DOMAIN}`, "msp");
const CERT_PATH = path.join(
  ADMIN_MSP_DIR,
  "signcerts",
  `Admin@${ORG_DOMAIN}-cert.pem`
);
const KEY_DIR = path.join(ADMIN_MSP_DIR, "keystore");

// Kleiner Cache, damit ein wiederholtes Aufloesen desselben Peers das
// TLS-Rootzertifikat nicht bei jedem Request erneut von der Platte liest.
const tlsCertCache = new Map();

function loadKey() {
  const filesInDir = fs.readdirSync(KEY_DIR);
  return fs.readFileSync(path.join(KEY_DIR, filesInDir[0]));
}

function loadTlsRootCert() {
  if (tlsCertCache.has(TLS_CERT_PATH)) return tlsCertCache.get(TLS_CERT_PATH);
  const cert = fs.readFileSync(TLS_CERT_PATH);
  tlsCertCache.set(TLS_CERT_PATH, cert);
  return cert;
}

/**
 * Baut eine frische Gateway-Verbindung auf.
 *
 * @param {string} [peerEndpoint] host:port des Ziel-Peers. Nur die
 *   Netzwerkadresse ist waehlbar (siehe Peer-Auswahl im Frontend) - Identitaet,
 *   Channel und Chaincode bleiben fachlich fix, da sie durch das RootResolver-
 *   Netzwerk vorgegeben sind, nicht durch den anfragenden Client.
 */
async function getGateway(peerEndpoint) {
  const target = peerEndpoint || process.env.PEER_ENDPOINT;
  const tlsRootCert = loadTlsRootCert();

  const client = new grpc.Client(target, grpc.credentials.createSsl(tlsRootCert), {
    "grpc.ssl_target_name_override": PEER_HOST_ALIAS,
  });

  const credentials = fs.readFileSync(CERT_PATH);
  const privateKeyPem = loadKey();
  const privateKey = crypto.createPrivateKey(privateKeyPem);

  const gateway = connect({
    client,
    identity: { mspId: MSP_ID, credentials },
    signer: signers.newPrivateKeySigner(privateKey),
  });

  return { gateway, client };
}

/**
 * Ruft ResolveNamespace(namespace) auf der namespace-registry-Chaincode auf.
 *
 * @param {string} namespace Global Namespace Identifier (UUIDv4, siehe RWP 23).
 * @param {{peerEndpoint?: string}} [options] Optionaler Peer-Override.
 */
async function resolveNamespace(namespace, options = {}) {
  const { gateway, client } = await getGateway(options.peerEndpoint);
  try {
    const network = gateway.getNetwork(CHANNEL_NAME);
    const contract = network.getContract(CHAINCODE_NAME);
    const resultBytes = await contract.evaluateTransaction(
      "ResolveNamespace",
      namespace
    );
    const resultJson = Buffer.from(resultBytes).toString("utf8");
    return JSON.parse(resultJson);
  } finally {
    gateway.close();
    client.close();
  }
}

module.exports = { resolveNamespace };
