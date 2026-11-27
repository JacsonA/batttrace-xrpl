// Éco-crédits de recyclage : un jeton XRPL natif (MPT, Multi-Purpose Token) émis par l'autorité.
//
// Quand un lot est clôturé en fin de vie, l'autorité verse au recycleur 1 éco-crédit (ECO) par kWh
// recyclé. La capacité retenue est celle de la fiche VÉRIFIÉE contre le hash inscrit à la création :
// gonfler la capacité hors chaîne pour toucher plus de crédits est détecté, et le versement refusé.
import { convertStringToHex, convertHexToString } from "xrpl";
import { ACTEURS, AUTORITE, EXPLORER, envoyer, getClient, getWallet } from "./xrpl.mjs";

export const TICKER = "ECO";
const TF_MPT_CAN_TRANSFER = 0x20; // les crédits restent échangeables entre acteurs
const TF_MPT_CAN_TRADE = 0x10; // et négociables sur le DEX XRPL

const METADONNEES = {
  ticker: TICKER,
  name: "Éco-crédit BattTrace",
  desc: "1 ECO = 1 kWh de batterie recyclé, vérifié contre l'empreinte de la fiche inscrite sur le ledger",
  icon: "https://raw.githubusercontent.com/JacsonA/batttrace-xrpl/main/public/eco.svg",
  asset_class: "rwa",
  asset_subclass: "other",
  issuer_name: "Autorité d'agrément BattTrace (fictive)",
};

let issuanceId = null;

// Retrouve l'émission ECO de l'autorité sur le ledger, ou la crée au premier besoin.
export async function emission({ creer = false } = {}) {
  if (issuanceId) return issuanceId;
  const autorite = getWallet(AUTORITE);
  const c = await getClient();
  let objets = [];
  try {
    const r = await c.request({ command: "account_objects", account: autorite.address, type: "mpt_issuance" });
    objets = r.result.account_objects;
  } catch {
    // compte non activé
  }
  const existante = objets.find((o) => {
    try {
      return JSON.parse(convertHexToString(o.MPTokenMetadata ?? "")).ticker === TICKER;
    } catch {
      return false;
    }
  });
  if (existante) {
    issuanceId = existante.mpt_issuance_id ?? existante.index;
    return issuanceId;
  }
  if (!creer) return null;
  const res = await envoyer(autorite, {
    TransactionType: "MPTokenIssuanceCreate",
    Account: autorite.address,
    AssetScale: 0,
    Flags: TF_MPT_CAN_TRANSFER | TF_MPT_CAN_TRADE,
    MPTokenMetadata: convertStringToHex(JSON.stringify(METADONNEES)),
  });
  issuanceId = res.meta.mpt_issuance_id;
  return issuanceId;
}

async function detention(address, id) {
  const c = await getClient();
  try {
    const r = await c.request({ command: "account_objects", account: address, type: "mptoken" });
    return r.result.account_objects.find((o) => o.MPTokenIssuanceID === id) ?? null;
  } catch {
    return null;
  }
}

// Solde ECO d'un acteur (0 s'il n'a jamais reçu de crédits).
export async function solde(role) {
  const id = await emission();
  if (!id) return 0;
  const d = await detention(getWallet(role).address, id);
  return Number(d?.MPTAmount ?? 0);
}

// Total émis par l'autorité = kWh recyclés depuis le début.
export async function totalEmis() {
  const id = await emission();
  if (!id) return { total: 0, issuanceId: null };
  const c = await getClient();
  const r = await c.request({ command: "ledger_entry", mpt_issuance: id });
  return { total: Number(r.result.node.OutstandingAmount ?? 0), issuanceId: id, lien: `${EXPLORER}/mpt/${id}` };
}

// Verse des éco-crédits à un acteur. Le bénéficiaire doit d'abord accepter de détenir le jeton
// (MPTokenAuthorize, signé par lui) : personne ne reçoit un jeton qu'il n'a pas accepté.
export async function verser(role, kWh, lot) {
  if (!ACTEURS[role]) throw new Error(`Acteur inconnu : ${role}`);
  const id = await emission({ creer: true });
  const beneficiaire = getWallet(role);
  if (!(await detention(beneficiaire.address, id))) {
    await envoyer(beneficiaire, {
      TransactionType: "MPTokenAuthorize",
      Account: beneficiaire.address,
      MPTokenIssuanceID: id,
    });
  }
  const autorite = getWallet(AUTORITE);
  return envoyer(autorite, {
    TransactionType: "Payment",
    Account: autorite.address,
    Destination: beneficiaire.address,
    Amount: { mpt_issuance_id: id, value: String(kWh) },
    Memos: [{
      Memo: {
        MemoType: convertStringToHex("batttrace/etape"),
        MemoData: convertStringToHex(JSON.stringify({ etape: "eco-credits", lot: lot.numero, nft: lot.id, kWh })),
      },
    }],
  });
}
