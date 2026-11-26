// Cycle de vie d'un lot de batteries : création, transfert, acceptation, fin de vie, historique.
//
// On-chain  : un NFT par lot (NFTokenMint), dont l'URI contient le hash SHA-256 de la fiche du lot,
//             et des Memos courts qui décrivent chaque étape. Aucune donnée personnelle.
// Off-chain : la fiche détaillée du lot (data/lots.json). Son hash permet de prouver qu'elle n'a pas
//             été modifiée depuis la création du lot.
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { convertStringToHex, convertHexToString } from "xrpl";
import { ACTEURS, EXPLORER, envoyer, getClient, getWallet, roleDe } from "./xrpl.mjs";

const FICHIER = new URL("../data/lots.json", import.meta.url);

// NFT brûlable par l'émetteur (tfBurnable = 1) et transférable (tfTransferable = 8).
const FLAGS_LOT = 1 + 8;
const TF_SELL_NFTOKEN = 1;

// ---------- Stockage off-chain ----------

async function lireLots() {
  try {
    // .replace : ignore le BOM qu'ajoutent certains éditeurs Windows
    return JSON.parse((await readFile(FICHIER, "utf8")).replace(/^﻿/, ""));
  } catch {
    return {};
  }
}

async function ecrireLots(lots) {
  await mkdir(new URL("./", FICHIER), { recursive: true });
  await writeFile(FICHIER, JSON.stringify(lots, null, 2));
}

// Hash stable : clés triées, pour que le même contenu donne toujours le même hash.
export function hashFiche(fiche) {
  const canonique = JSON.stringify(fiche, Object.keys(fiche).sort());
  return createHash("sha256").update(canonique).digest("hex");
}

const memo = (donnees) => ({
  Memo: {
    MemoType: convertStringToHex("batttrace/etape"),
    MemoData: convertStringToHex(JSON.stringify(donnees)),
  },
});

function lireMemo(tx) {
  const m = tx.Memos?.[0]?.Memo;
  if (!m?.MemoData) return null;
  try {
    return JSON.parse(convertHexToString(m.MemoData));
  } catch {
    return null;
  }
}

// ---------- Actions (chacune = une transaction signée par l'acteur concerné) ----------

// Le fabricant crée le lot : mint du NFT, hash de la fiche dans l'URI.
export async function creerLot(role, fiche) {
  if (!fiche?.numero) throw new Error("Le numéro de lot est obligatoire");
  const lots = await lireLots();
  if (Object.values(lots).some((l) => l.fiche.numero === fiche.numero)) {
    throw new Error(`Le lot ${fiche.numero} existe déjà`);
  }
  const wallet = getWallet(role);
  const hash = hashFiche(fiche);
  const res = await envoyer(wallet, {
    TransactionType: "NFTokenMint",
    Account: wallet.address,
    NFTokenTaxon: 0,
    Flags: FLAGS_LOT,
    URI: convertStringToHex(`sha256:${hash}`),
    Memos: [memo({ etape: "creation", lot: fiche.numero })],
  });
  const id = res.meta.nftoken_id;
  lots[id] = { fiche, hash, creePar: role };
  await ecrireLots(lots);
  return { id, ...res };
}

// Le détenteur propose le lot à un autre acteur : offre à 0 XRP réservée à ce destinataire.
export async function proposerTransfert(id, deRole, versRole) {
  const de = getWallet(deRole);
  const vers = getWallet(versRole);
  const lots = await lireLots();
  return envoyer(de, {
    TransactionType: "NFTokenCreateOffer",
    Account: de.address,
    NFTokenID: id,
    Amount: "0",
    Destination: vers.address,
    Flags: TF_SELL_NFTOKEN,
    Memos: [memo({ etape: "transfert-propose", lot: lots[id]?.fiche.numero, vers: versRole })],
  });
}

// Le destinataire accepte : c'est lui qui signe, le transfert de responsabilité est donc consenti.
export async function accepterTransfert(id, role) {
  const wallet = getWallet(role);
  const c = await getClient();
  let offres = [];
  try {
    const r = await c.request({ command: "nft_sell_offers", nft_id: id });
    offres = r.result.offers;
  } catch {
    // aucune offre en cours pour ce NFT
  }
  const offre = offres.find((o) => o.destination === wallet.address);
  if (!offre) throw new Error(`Aucune offre de transfert en attente pour ${role} sur ce lot`);
  const lots = await lireLots();
  return envoyer(wallet, {
    TransactionType: "NFTokenAcceptOffer",
    Account: wallet.address,
    NFTokenSellOffer: offre.nft_offer_index,
    Memos: [memo({ etape: "transfert-accepte", lot: lots[id]?.fiche.numero })],
  });
}

// Fin de vie : le détenteur (le recycleur) détruit le NFT.
export async function cloturerLot(id, role) {
  const wallet = getWallet(role);
  const lots = await lireLots();
  return envoyer(wallet, {
    TransactionType: "NFTokenBurn",
    Account: wallet.address,
    NFTokenID: id,
    Memos: [memo({ etape: "fin-de-vie", lot: lots[id]?.fiche.numero })],
  });
}

// ---------- Lecture de l'historique depuis le ledger ----------

// Toutes les transactions NFT des acteurs, sans doublon (une acceptation apparaît chez les deux).
async function transactionsDesActeurs() {
  const c = await getClient();
  const parHash = new Map();
  for (const role of Object.keys(ACTEURS)) {
    let address;
    try {
      address = getWallet(role).address;
    } catch {
      continue;
    }
    let r;
    try {
      r = await c.request({ command: "account_tx", account: address, limit: 400 });
    } catch {
      continue; // compte pas encore activé
    }
    for (const e of r.result.transactions) {
      const tx = e.tx_json ?? e.tx;
      const hash = e.hash ?? tx.hash;
      if (!tx?.TransactionType?.startsWith("NFToken")) continue;
      if (e.meta?.TransactionResult !== "tesSUCCESS") continue;
      parHash.set(hash, {
        tx,
        meta: e.meta,
        hash,
        ledger: e.ledger_index ?? tx.ledger_index,
        date: e.close_time_iso ?? null,
      });
    }
  }
  return [...parHash.values()].sort((a, b) => a.ledger - b.ledger);
}

const nftDe = ({ tx, meta }) => tx.NFTokenID ?? meta?.nftoken_id;

// Rejoue les transactions dans l'ordre pour reconstituer les étapes et l'état actuel du lot.
function reconstituer(id, transactions) {
  const etapes = [];
  let detenteur = null;
  let offreEnAttente = null;
  for (const t of transactions) {
    if (nftDe(t) !== id) continue;
    const { tx } = t;
    const acteur = roleDe(tx.Account) ?? tx.Account;
    const base = { hash: t.hash, date: t.date, lien: `${EXPLORER}/transactions/${t.hash}`, memo: lireMemo(tx) };
    switch (tx.TransactionType) {
      case "NFTokenMint":
        detenteur = acteur;
        etapes.push({ ...base, etape: "Création du lot", par: acteur, type: tx.TransactionType });
        break;
      case "NFTokenCreateOffer": {
        const vers = roleDe(tx.Destination) ?? tx.Destination;
        offreEnAttente = { de: acteur, vers };
        etapes.push({ ...base, etape: `Transfert proposé à : ${ACTEURS[vers] ?? vers}`, par: acteur, type: tx.TransactionType });
        break;
      }
      case "NFTokenAcceptOffer":
        etapes.push({ ...base, etape: `Transfert accepté (reçu de : ${ACTEURS[detenteur] ?? detenteur})`, par: acteur, type: tx.TransactionType });
        detenteur = acteur;
        offreEnAttente = null;
        break;
      case "NFTokenBurn":
        etapes.push({ ...base, etape: "Fin de vie : lot clôturé", par: acteur, type: tx.TransactionType });
        detenteur = null;
        offreEnAttente = null;
        break;
      default:
        break;
    }
  }
  const statut = !etapes.length ? "introuvable" : detenteur ? "en circulation" : "clôturé";
  return { detenteur, offreEnAttente, statut, etapes };
}

export async function historique(id) {
  const lots = await lireLots();
  const etat = reconstituer(id, await transactionsDesActeurs());
  return { id, fiche: lots[id]?.fiche ?? null, lienNft: `${EXPLORER}/nft/${id}`, ...etat };
}

export async function listerLots() {
  const lots = await lireLots();
  const transactions = await transactionsDesActeurs();
  return Object.entries(lots).map(([id, l]) => {
    const { detenteur, offreEnAttente, statut } = reconstituer(id, transactions);
    return { id, numero: l.fiche.numero, fiche: l.fiche, detenteur, offreEnAttente, statut };
  });
}

// Vérifie que la fiche off-chain correspond toujours au hash inscrit on-chain lors de la création.
export async function verifierFiche(id) {
  const lots = await lireLots();
  const lot = lots[id];
  if (!lot) throw new Error("Lot inconnu dans le stockage off-chain");
  const mint = (await transactionsDesActeurs()).find(
    (t) => t.tx.TransactionType === "NFTokenMint" && t.meta?.nftoken_id === id,
  );
  if (!mint) throw new Error("Transaction de création introuvable sur le ledger");
  const hashOnChain = convertHexToString(mint.tx.URI).replace(/^sha256:/, "");
  const hashActuel = hashFiche(lot.fiche);
  return { conforme: hashOnChain === hashActuel, hashOnChain, hashActuel, lien: `${EXPLORER}/transactions/${mint.hash}` };
}
