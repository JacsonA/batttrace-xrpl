// Connexion au XRPL Testnet, wallets des acteurs et envoi des transactions.
import { Client, Wallet } from "xrpl";
import "dotenv/config";

const SERVEURS = [
  "wss://s.altnet.rippletest.net:51233",
  "wss://testnet.xrpl-labs.com",
];

export const EXPLORER = "https://testnet.xrpl.org";

// Les trois acteurs de la chaîne. Chaque seed vient du .env (jamais dans Git).
export const ACTEURS = {
  FABRICANT: "Fabricant de cellules",
  CONSTRUCTEUR: "Constructeur automobile",
  RECYCLEUR: "Recycleur",
};

// Organisme d'agrément : il n'agit pas sur les lots, il délivre et révoque les Credentials des acteurs.
export const AUTORITE = "AUTORITE";
export const NOM_AUTORITE = "Autorité d'agrément";

let client;

// Une seule connexion partagée, rouverte si elle tombe.
export async function getClient() {
  if (client?.isConnected()) return client;
  for (const url of SERVEURS) {
    try {
      const c = new Client(url);
      await c.connect();
      console.log("Connecté à", url);
      client = c;
      return client;
    } catch {
      console.log("Échec sur", url, "→ serveur suivant");
    }
  }
  throw new Error("Aucun serveur Testnet joignable");
}

export async function disconnect() {
  if (client?.isConnected()) await client.disconnect();
}

export function getWallet(role) {
  if (!ACTEURS[role] && role !== AUTORITE) throw new Error(`Acteur inconnu : ${role}`);
  const seed = process.env[`${role}_SEED`];
  if (!seed) throw new Error(`${role}_SEED manquant dans .env (lancer npm run setup)`);
  return Wallet.fromSeed(seed);
}

// Rôle correspondant à une adresse (pour afficher l'historique en clair).
export function roleDe(address) {
  for (const role of Object.keys(ACTEURS)) {
    try {
      if (getWallet(role).address === address) return role;
    } catch {
      // seed absente : on ignore
    }
  }
  return null;
}

// Prépare, signe et soumet une transaction ; lève une erreur si elle échoue.
export async function envoyer(wallet, tx) {
  const c = await getClient();
  const prepared = await c.autofill(tx);
  const signed = wallet.sign(prepared);
  const res = await c.submitAndWait(signed.tx_blob);
  const code = res.result.meta.TransactionResult;
  console.log(tx.TransactionType, "→", code, "| hash :", signed.hash);
  if (code !== "tesSUCCESS") throw new Error(`${tx.TransactionType} refusée : ${code}`);
  return { hash: signed.hash, meta: res.result.meta, lien: `${EXPLORER}/transactions/${signed.hash}` };
}
