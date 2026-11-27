// Serveur web : API JSON + interface statique (public/). Aucune dépendance en plus de xrpl et dotenv.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { dropsToXrp } from "xrpl";
import QRCode from "qrcode";
import { ACTEURS, EXPLORER, getClient, getWallet } from "./xrpl.mjs";
import {
  accepterTransfert,
  cloturerLot,
  creerLot,
  historique,
  listerLots,
  proposerTransfert,
  restaurerFiche,
  simulerFalsification,
  verifierFiche,
} from "./lots.mjs";
import { agreer, etatAgrement, infosAutorite, revoquer } from "./credentials.mjs";
import { solde as soldeEco, totalEmis } from "./ecocredits.mjs";

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC = new URL("../public/", import.meta.url);
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };

async function acteurs() {
  const c = await getClient();
  return Promise.all(
    Object.entries(ACTEURS).map(async ([role, nom]) => {
      const { address } = getWallet(role);
      let solde = null;
      try {
        const r = await c.request({ command: "account_info", account: address, ledger_index: "validated" });
        solde = Number(dropsToXrp(r.result.account_data.Balance));
      } catch {
        // compte non activé
      }
      const { agree, etat } = await etatAgrement(role);
      const ecoCredits = await soldeEco(role);
      return { role, nom, address, solde, ecoCredits, agree, agrement: etat, lien: `${EXPLORER}/accounts/${address}` };
    }),
  );
}

async function corps(req) {
  let data = "";
  for await (const chunk of req) data += chunk;
  return data ? JSON.parse(data) : {};
}

// Table des routes : [méthode, motif, action]
const ROUTES = [
  ["GET", /^\/api\/acteurs$/, () => acteurs()],
  ["GET", /^\/api\/autorite$/, () => infosAutorite()],
  ["GET", /^\/api\/ecocredits$/, () => totalEmis()],
  ["POST", /^\/api\/agrements\/([A-Z]+)$/, ([role]) => agreer(role)],
  ["POST", /^\/api\/agrements\/([A-Z]+)\/revoquer$/, ([role]) => revoquer(role)],
  ["GET", /^\/api\/lots$/, () => listerLots()],
  ["POST", /^\/api\/lots$/, (_, b) => creerLot(b.acteur, b.fiche)],
  ["GET", /^\/api\/lots\/(\w+)\/historique$/, ([id]) => historique(id)],
  ["GET", /^\/api\/lots\/(\w+)\/verifier$/, ([id]) => verifierFiche(id)],
  ["POST", /^\/api\/lots\/(\w+)\/falsifier$/, ([id]) => simulerFalsification(id)],
  ["POST", /^\/api\/lots\/(\w+)\/restaurer$/, ([id]) => restaurerFiche(id)],
  ["POST", /^\/api\/lots\/(\w+)\/proposer$/, ([id], b) => proposerTransfert(id, b.de, b.vers)],
  ["POST", /^\/api\/lots\/(\w+)\/accepter$/, ([id], b) => accepterTransfert(id, b.acteur)],
  ["POST", /^\/api\/lots\/(\w+)\/cloturer$/, ([id], b) => cloturerLot(id, b.acteur)],
];

const server = createServer(async (req, res) => {
  const { pathname } = new URL(req.url, "http://localhost");
  const envoyerJson = (code, obj) => {
    res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify(obj));
  };

  // QR code du passeport : pointe vers la page publique du NFT dans l'explorateur XRPL,
  // vérifiable par n'importe qui depuis un téléphone, sans passer par BattTrace.
  const qr = pathname.match(/^\/api\/lots\/(\w+)\/qr\.svg$/);
  if (qr) {
    const svg = await QRCode.toString(`${EXPLORER}/nft/${qr[1]}`, {
      type: "svg",
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#101828", light: "#ffffff" },
    });
    res.writeHead(200, { "Content-Type": "image/svg+xml" });
    return res.end(svg);
  }

  if (pathname.startsWith("/api/")) {
    for (const [methode, motif, action] of ROUTES) {
      const m = pathname.match(motif);
      if (m && req.method === methode) {
        try {
          const b = req.method === "POST" ? await corps(req) : {};
          return envoyerJson(200, await action(m.slice(1), b));
        } catch (e) {
          console.error(e.message);
          return envoyerJson(400, { erreur: e.message });
        }
      }
    }
    return envoyerJson(404, { erreur: "Route inconnue" });
  }

  // Fichiers statiques
  const fichier = pathname === "/" ? "index.html" : pathname.slice(1);
  if (fichier.includes("..")) return envoyerJson(400, { erreur: "Chemin invalide" });
  try {
    const contenu = await readFile(new URL(fichier, PUBLIC));
    res.writeHead(200, { "Content-Type": TYPES[extname(fichier)] ?? "application/octet-stream" });
    res.end(contenu);
  } catch {
    res.writeHead(404);
    res.end("Introuvable");
  }
});

// Message clair si un autre serveur BattTrace (ou une autre appli) occupe déjà le port.
server.on("error", (e) => {
  if (e.code !== "EADDRINUSE") throw e;
  console.error(`\nLe port ${PORT} est déjà utilisé : BattTrace tourne sans doute déjà.`);
  console.error(`Ouvre simplement http://localhost:${PORT}`);
  console.error("Ou arrête l'autre serveur (fenêtre de terminal fermée ou Ctrl+C), puis relance npm start.\n");
  process.exit(1);
});

await getClient();
server.listen(PORT, () => console.log(`BattTrace : http://localhost:${PORT}`));
