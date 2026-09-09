# RecordFinder

**RecordFinder** is a reference client application for [RecordWeb](https://recordweb.github.io/rwp/): it resolves a `did:rwp` identifier end to end through the decentralised **RootResolver network** and makes every single step of that resolution transparent.

The app connects directly (via the [Hyperledger Fabric Gateway](https://hyperledger.github.io/fabric-gateway/)) to a peer of the RootResolver network, invokes the `namespace-registry` chaincode, follows the returned resolver endpoint, and then loads the DID document and its associated record.

## What RecordFinder shows

For an input DID (e.g. `did:rwp:a3f9e21c:xyz123`), RecordFinder walks through four steps and makes each one individually inspectable:

1. **Input** – the namespace is extracted from the DID.
2. **Root-resolver chaincode** – `ResolveNamespace(namespace)` is executed against the blockchain; the response includes the responsible `resolverEndpoint`, `registeredBy`, `txId`, and the endorsements.
3. **Fetch DID document** – the returned resolver is queried over HTTP.
4. **Fetch record** – if the DID document contains a `recordEndpoint`, the actual record is loaded and its payload and metadata are rendered.

Each step is shown as a collapsible element, including the raw JSON response — so it stays traceable which organisation is responsible for which part of the resolution, in line with the RootResolver model (no central single point of trust).

## Changing the peer address

The only network parameter that is meant to vary is the address of the **Fabric peer** the app targets for the `ResolveNamespace` call. Everything else (channel, chaincode, Fabric identity) is fixed by the RootResolver network itself and cannot be changed from the frontend.

A small triangle (▾) at the top right, next to the title, opens an unobtrusive panel where this peer address can be set in `host:port` format, for example:

```
peer0.tws.rwrrn.recordweb.dev:7051
```

The value is stored in the browser (`localStorage`) and sent along with every request to the server. The server validates the format and falls back to the configured default peer if nothing is entered. An operator can disable client-side peer selection entirely via `ALLOW_CLIENT_PEER_OVERRIDE=false` and hard-wire the peer address instead.

## Architecture

```
Browser (frontend/)
   │  GET api/resolve?did=...&peer=...
   ▼
server.js  ──▶ fabricConnect.js ──▶ Fabric peer (gRPC/mTLS) ──▶ namespace-registry chaincode
   │
   ├─▶ Resolver endpoint (HTTP)  ──▶ DID document
   └─▶ Record endpoint (HTTP)    ──▶ Record incl. payload
```

The repository is split into two top-level directories, `backend/` and `frontend/`, each independently deployable in principle but shipped together as a single container in this reference build:

- **`backend/server.js`** – Express server; orchestrates the four resolution steps, validates input (DID syntax, peer address format), and serves the static frontend.
- **`backend/fabricConnect.js`** – Fabric Gateway client; builds a TLS-secured gRPC connection to the selected peer per request and invokes `ResolveNamespace` on the RootResolver network's channel.
- **`backend/mockResolver.js`** – Local fallback resolver for demos without network access; only ever returns example records and is never used in place of a working live resolver.
- **`frontend/`** – Static frontend (HTML/CSS/vanilla JS); renders the resolution trail, record details, and payload. Uses relative fetch paths (`api/...`, no leading slash) so the app works correctly regardless of which URL prefix it is deployed under.

Note that `server.js` serves the frontend via `express.static(path.join(__dirname, "frontend"))`, which assumes the Docker image places `frontend/` as a sibling of `server.js` inside `/app` (see [`backend/Dockerfile`](./backend/Dockerfile)) — not one level above it.

## Prerequisites

- Access to a peer of a RootResolver network (e.g. the TWS test network; see the [RootResolver Network Operating Handbook](https://github.com/recordweb)) and a valid Fabric identity (certificate + private key) with read access to the relevant channel.
- The MSP/TLS crypto material for that identity, available locally or mounted as a volume.
- Node.js 20+ if running without Docker.

## Configuration

All values are set via environment variables. Two separate `.env` files are involved, each with a distinct purpose — this distinction matters and is easy to get wrong:

- **`.env`** (repository root, next to `docker-compose.yml`) — read only by Docker Compose itself, to interpolate `${...}` placeholders in `docker-compose.yml` (currently just the crypto-material host path). Variables placed only in `backend/.env` are **not** visible at this stage, since Compose parses `docker-compose.yml` — including all `volumes:` entries — before the container's own `env_file` is ever applied.
- **`backend/.env`** (see [`backend/.env.example`](./backend/.env.example)) — read by the Node.js application at runtime via `env_file:` in `docker-compose.yml`. This is where the Fabric identity, channel, chaincode, and default peer are configured.

`.env` (repository root):

| Variable | Meaning | Default |
|---|---|---|
| `CRYPTO_CONFIG_HOST_PATH` | Host path to the crypto material to bind-mount read-only into the container at `/crypto` | `/opt/recordfinder/crypto-config` |

`backend/.env`:

| Variable | Meaning | Default |
|---|---|---|
| `PORT` | HTTP port of the app | `3000` |
| `CRYPTO_DIR` | Base directory of the MSP/TLS crypto material **inside the container** (must start with `/crypto`, matching the Compose volume target) | `/crypto/peerOrganizations/org.recordweb.dev` |
| `MSP_ID` | MSP ID of the own Fabric identity | `TWSOrgMSP` |
| `ORG_DOMAIN` | Organisation domain used to derive the default admin identity name | `org.recordweb.dev` |
| `ADMIN_IDENTITY` | Name of the admin identity as registered/enrolled with the Fabric CA (defaults to the cryptogen-style `Admin@<ORG_DOMAIN>`; live-CA networks typically use a custom name, e.g. `tws-org-admin`) | `Admin@${ORG_DOMAIN}` |
| `ADMIN_CERT_FILENAME` | Filename of the signing certificate under `users/<ADMIN_IDENTITY>/msp/signcerts/` (`fabric-ca-client enroll` typically produces a plain `cert.pem`, not the cryptogen-style `Admin@...-cert.pem`) | `${ADMIN_IDENTITY}-cert.pem` |
| `CHANNEL_NAME` | Fabric channel of the RootResolver network | `rw-gnr-test` |
| `CHAINCODE_NAME` | Name of the namespace-registry chaincode | `namespace-registry` |
| `PEER_ENDPOINT` | Default peer address (`host:port`) | `peer0.tws.rwrrn.recordweb.dev:7051` |
| `PEER_HOST_ALIAS` | TLS SAN hostname of the default peer | `peer0.tws.rwrrn.recordweb.dev` |
| `ALLOW_CLIENT_PEER_OVERRIDE` | Allows peer selection from the frontend | `true` |
| `FETCH_TIMEOUT_MS` | Timeout for HTTP calls to resolver/record endpoints | `4000` |

> The production peer address depends on the network stage in question (see RootResolver Network Operating Handbook, Stages 1–4). For the current TWS test network, the default above applies; once the network grows to include more organisations, the triangle panel lets you test against a specific organisation's peer directly.
>
> `ADMIN_IDENTITY` and `ADMIN_CERT_FILENAME` exist because networks bootstrapped via a **live Fabric CA** (`fabric-ca-client register`/`enroll`, see the RootResolver Network Operating Handbook, Decision D2) let each organisation choose its own admin identity name and produce a plain `cert.pem`, unlike the fixed `Admin@<org-domain>` / `Admin@<org-domain>-cert.pem` naming that tools like `cryptogen` generate. Set both explicitly if your network was bootstrapped this way.

## Running locally

```bash
cd backend
npm install
cp .env.example .env   # adjust values
node server.js
```

The app is then reachable at `http://localhost:3000`.

## Running with Docker

```bash
cp .env.example .env       # repository root: set CRYPTO_CONFIG_HOST_PATH
cd backend && cp .env.example .env && cd ..   # backend: set Fabric identity/channel/peer
docker compose up -d --build
```

`docker-compose.yml` mounts the crypto material read-only into the container at `/crypto`, sourced from the host path configured via `CRYPTO_CONFIG_HOST_PATH` in the root `.env` — adjust that path to wherever your organisation's `crypto-config` actually lives on the host. It also joins the external `tws-proxy` Docker network so a shared nginx reverse proxy can reach the container by its Docker DNS name (`recordfinder`), without RecordFinder joining the RootResolver network's own internal Docker network — RecordFinder deliberately reaches its peer only over the peer's public TLS endpoint, the same way any external client would.

Deployment to a VPS is automated via [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml) (SSH deploy on push to `main`), provided the secrets `VPS_HOST`, `VPS_USER`, and `VPS_SSH_KEY` are configured in the repository and the target path `/opt/recordfinder` exists on the VPS with a checked-out copy of this repository.

### Reverse-proxy note

If RecordFinder is served under a path prefix (e.g. `https://example.org/recordfinder/`) via a shared reverse proxy, no special `/api/` proxy rule is needed: the frontend calls `api/config` and `api/resolve` using **relative** paths (no leading slash), so they resolve correctly under any prefix as long as the proxy forwards the whole `/recordfinder/` subtree to the container, e.g.:

```nginx
location /recordfinder/ {
    proxy_pass http://recordfinder:3000/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

## Security notes

- The app performs read-only operations exclusively (`evaluateTransaction`, never `submitTransaction`); it cannot modify namespace registrations.
- Only the peer's **network address** is client-selectable — Fabric identity, MSP, channel, and chaincode remain fixed server-side and cannot be influenced through the UI.
- Crypto material (private keys, admin certificates) is never served to the frontend and should be protected on the host with restrictive file permissions or a secrets manager.

## Relation to RecordWeb

RecordFinder demonstrates the cross-namespace resolver model specified in [RWP](https://recordweb.github.io/rwp/): the blockchain stores only routing information (`namespace → resolverEndpoint`), never DID documents or records themselves. Details on network setup, governance, and the rollout plan for the RootResolver network are available in the [RootResolver Network Operating Handbook](https://github.com/recordweb) maintained by the RecordWeb organisation.

## License

[MIT](./LICENSE)
