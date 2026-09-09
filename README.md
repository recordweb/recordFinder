# RecordFinder

**RecordFinder** ist eine Referenz-Client-App für [RecordWeb](https://recordweb.github.io/rwp/): Sie löst einen `did:rwp`-Identifier vollständig über das dezentrale **RootResolver-Netzwerk** auf und zeigt jeden einzelnen Schritt dieser Auflösung transparent an.

Die App verbindet sich dazu direkt (über [Hyperledger Fabric Gateway](https://hyperledger.github.io/fabric-gateway/)) mit einem Peer des RootResolver-Netzwerks, ruft die `namespace-registry`-Chaincode auf, folgt dem zurückgegebenen Resolver-Endpoint und lädt anschließend das DID-Dokument sowie den zugehörigen Record.

## Was RecordFinder zeigt

Für eine eingegebene DID (z. B. `did:rwp:a3f9e21c:xyz123`) durchläuft RecordFinder vier Schritte und macht jeden davon einzeln nachvollziehbar:

1. **Eingabe** – Namespace wird aus der DID extrahiert.
2. **Root-Resolver-Chaincode** – `ResolveNamespace(namespace)` wird gegen die Blockchain ausgeführt; die Antwort enthält u. a. den zuständigen `resolverEndpoint`, `registeredBy`, `txId` und die Endorsements.
3. **DID-Dokument abrufen** – der zurückgemeldete Resolver wird per HTTP abgefragt.
4. **Record abrufen** – falls das DID-Dokument einen `recordEndpoint` enthält, wird der eigentliche Record geladen und dessen Payload sowie Metadaten dargestellt.

Jeder Schritt ist als aufklappbares Element sichtbar, inklusive der jeweiligen Rohantwort als JSON – so bleibt nachvollziehbar, welche Organisation welchen Teil der Auflösung verantwortet, ganz im Sinn des RootResolver-Modells (kein zentraler Single Point of Trust).

## Peer-Adresse ändern

Der einzige Netzwerkparameter, der fachlich variieren darf, ist die Adresse des **Fabric-Peers**, gegen den die App die `ResolveNamespace`-Anfrage stellt. Alles andere (Channel, Chaincode, Fabric-Identität) ist durch das RootResolver-Netzwerk fest vorgegeben und wird nicht über das Frontend verändert.

Ein kleines Dreieck (▾) oben rechts neben dem Titel öffnet ein unauffälliges Panel, in dem sich diese Peer-Adresse im Format `host:port` setzen lässt, zum Beispiel:

```
peer0.tws.rwrrn.recordweb.dev:7051
```

Die Eingabe wird im Browser (`localStorage`) gespeichert und bei jeder Anfrage an den Server mitgegeben. Der Server validiert das Format serverseitig und fällt ohne Eingabe auf den konfigurierten Standard-Peer zurück. Über die Umgebungsvariable `ALLOW_CLIENT_PEER_OVERRIDE=false` kann ein Betreiber diese Möglichkeit auch vollständig deaktivieren und die Peer-Adresse fest verdrahten.

## Architektur

```
Browser (frontend/)
   │  GET /api/resolve?did=...&peer=...
   ▼
server.js  ──▶ fabricConnect.js ──▶ Fabric-Peer (gRPC/mTLS) ──▶ namespace-registry Chaincode
   │
   ├─▶ Resolver-Endpoint (HTTP)  ──▶ DID-Dokument
   └─▶ Record-Endpoint (HTTP)    ──▶ Record inkl. Payload
```

- **`server.js`** – Express-Server, orchestriert die vier Auflösungsschritte, validiert Eingaben (DID-Syntax, Peer-Adressformat) und liefert das statische Frontend aus.
- **`fabricConnect.js`** – Fabric-Gateway-Client; baut pro Anfrage eine TLS-gesicherte gRPC-Verbindung zum gewählten Peer auf und ruft `ResolveNamespace` auf dem Channel des RootResolver-Netzwerks auf.
- **`mockResolver.js`** – Lokaler Fallback-Resolver für Demos ohne Netzwerkzugriff; liefert ausschließlich Beispiel-Records und wird nie anstelle eines funktionierenden Live-Resolvers verwendet.
- **`frontend/`** – Statisches Frontend (HTML/CSS/Vanilla-JS), rendert Auflösungsweg, Record-Details und Payload.

## Voraussetzungen

- Zugriff auf einen Peer eines RootResolver-Netzwerks (z. B. das TWS-Testnetz, siehe [RootResolver Network Operating Handbook](https://github.com/recordweb)) sowie eine gültige Fabric-Identität (Zertifikat + privater Schlüssel) mit Leserecht auf den jeweiligen Channel.
- Das MSP-/TLS-Kryptomaterial dieser Identität, lokal oder als Volume verfügbar.
- Node.js 20+, falls ohne Docker betrieben.

## Konfiguration

Alle Werte werden über Umgebungsvariablen gesetzt, siehe [`.env.example`](./.env.example):

| Variable | Bedeutung | Default |
|---|---|---|
| `PORT` | HTTP-Port der App | `3000` |
| `CRYPTO_DIR` | Basisverzeichnis des MSP-/TLS-Kryptomaterials | `/crypto/peerOrganizations/org.recordweb.dev` |
| `MSP_ID` | MSP-ID der eigenen Fabric-Identität | `TWSOrgMSP` |
| `ORG_DOMAIN` | Organisations-Domain, unter der die Admin-Identität abgelegt ist | `org.recordweb.dev` |
| `CHANNEL_NAME` | Fabric-Channel des RootResolver-Netzwerks | `rw-gnr-test` |
| `CHAINCODE_NAME` | Name der Namespace-Registry-Chaincode | `namespace-registry` |
| `PEER_ENDPOINT` | Standard-Peer-Adresse (`host:port`) | `peer0.tws.rwrrn.recordweb.dev:7051` |
| `PEER_HOST_ALIAS` | TLS-SAN-Hostname des Standard-Peers | `peer0.tws.rwrrn.recordweb.dev` |
| `ALLOW_CLIENT_PEER_OVERRIDE` | Erlaubt Peer-Wahl über das Frontend | `true` |
| `FETCH_TIMEOUT_MS` | Timeout für HTTP-Aufrufe an Resolver/Record-Endpoints | `4000` |

> Die produktive Peer-Adresse hängt vom jeweiligen Netzwerk-Stage ab (siehe RootResolver Network Operating Handbook, Stage 1–4). Für das aktuelle TWS-Testnetz gilt der oben genannte Default; bei einer Erweiterung des Netzwerks um weitere Organisationen kann über das Dreieck-Panel gezielt gegen den Peer einer anderen Organisation getestet werden.

## Lokale Ausführung

```bash
cd backend
npm install
cp .env.example .env   # Werte anpassen
node server.js
```

Die App ist danach unter `http://localhost:3000` erreichbar.

## Betrieb mit Docker

```bash
docker compose up -d --build
```

`docker-compose.yml` mountet das Kryptomaterial read-only unter `/crypto` in den Container – passe den lokalen Pfad in der Datei an dein Setup an. Die Auslieferung auf einen VPS erfolgt automatisiert über [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml) (SSH-Deploy bei Push auf `main`), sofern die Secrets `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY` und `DEPLOY_PATH` im Repository hinterlegt sind.

## Sicherheitshinweise

- Die App führt ausschließlich lesende Operationen aus (`evaluateTransaction`, keine `submitTransaction`); sie kann keine Namespace-Registrierungen verändern.
- Nur die Peer-**Netzwerkadresse** ist client-seitig wählbar – Fabric-Identität, MSP, Channel und Chaincode bleiben serverseitig fix und sind nicht über die UI beeinflussbar.
- Kryptomaterial (private Schlüssel, Admin-Zertifikate) wird nie an das Frontend ausgeliefert und sollte auf dem Host mit restriktiven Dateiberechtigungen bzw. einem Secrets-Manager geschützt werden.

## Bezug zu RecordWeb

RecordFinder demonstriert das in [RWP](https://recordweb.github.io/rwp/) spezifizierte namensraumübergreifende Resolver-Modell: Die Blockchain speichert ausschließlich Routing-Informationen (`namespace → resolverEndpoint`), niemals DID-Dokumente oder Records selbst. Details zum Netzwerkaufbau, zur Governance und zum Rollout-Plan des RootResolver-Netzwerks finden sich im [RootResolver Network Operating Handbook](https://github.com/recordweb) der RecordWeb-Organisation.

## Lizenz

[MIT](./LICENSE)

