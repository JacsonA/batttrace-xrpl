// Serveur web : API JSON + interface statique (public/). Aucune dépendance en plus de xrpl et dotenv.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { dropsToXrp } from "xrpl";
import { ACTEURS, EXPLORER, getClient, getWallet } from "./xrpl.mjs";
import {
  accepterTransfert,
  cloturerLot,
  creerLot,
  historique,
  listerLots,
  proposerTransfert,
  verifierFiche,
} from "./lots.mjs";
import { agreer, etatAgrement, infosAutorite, revoquer } from "./credentials.mjs";

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC = new URL("../public/", import.meta.url);
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css" };

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
      return { role, nom, address, solde, agree, agrement: etat, lien: `${EXPLORER}/accounts/${address}` };
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
  ["POST", /^\/api\/agrements\/([A-Z]+)$/, ([role]) => agreer(role)],
  ["POST", /^\/api\/agrements\/([A-Z]+)\/revoquer$/, ([role]) => revoquer(role)],
  ["GET", /^\/api\/lots$/, () => listerLots()],
  ["POST", /^\/api\/lots$/, (_, b) => creerLot(b.acteur, b.fiche)],
  ["GET", /^\/api\/lots\/(\w+)\/historique$/, ([id]) => historique(id)],
  ["GET", /^\/api\/lots\/(\w+)\/verifier$/, ([id]) => verifierFiche(id)],
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

await getClient();
server.listen(PORT, () => console.log(`BattTrace : http://localhost:${PORT}`));
