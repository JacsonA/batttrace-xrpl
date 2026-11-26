// Agrément des acteurs avec les Credentials XRPL (XLS-70).
//
// L'autorité d'agrément émet un Credential « BATTTRACE_<ROLE> » à un acteur (CredentialCreate),
// l'acteur l'accepte (CredentialAccept), et l'autorité peut le révoquer (CredentialDelete).
// BattTrace refuse toute action sur un lot à un acteur qui ne détient pas un agrément accepté et valide.
import { convertStringToHex } from "xrpl";
import { ACTEURS, AUTORITE, EXPLORER, envoyer, getClient, getWallet } from "./xrpl.mjs";

const LSF_ACCEPTED = 0x00010000;
// Les dates XRPL comptent les secondes depuis le 1er janvier 2000.
const EPOQUE_RIPPLE = 946684800;

const typeDe = (role) => convertStringToHex(`BATTTRACE_${role}`);

// Lit le Credential de l'acteur sur le ledger : absent, en attente d'acceptation, expiré ou valide.
export async function etatAgrement(role) {
  const sujet = getWallet(role).address;
  const emetteur = getWallet(AUTORITE).address;
  const c = await getClient();
  let objets = [];
  try {
    const r = await c.request({ command: "account_objects", account: sujet, type: "credential" });
    objets = r.result.account_objects;
  } catch {
    // compte non activé
  }
  const cred = objets.find((o) => o.Issuer === emetteur && o.CredentialType === typeDe(role));
  if (!cred) return { role, agree: false, etat: "non agréé" };
  if (!(cred.Flags & LSF_ACCEPTED)) return { role, agree: false, etat: "en attente d'acceptation" };
  if (cred.Expiration && cred.Expiration + EPOQUE_RIPPLE < Date.now() / 1000) {
    return { role, agree: false, etat: "agrément expiré" };
  }
  return { role, agree: true, etat: "agréé" };
}

export async function etatAgrements() {
  return Promise.all(Object.keys(ACTEURS).map(etatAgrement));
}

// Garde utilisée avant chaque action sur un lot.
export async function exigerAgrement(role) {
  const { agree, etat } = await etatAgrement(role);
  if (!agree) throw new Error(`${ACTEURS[role]} : ${etat}, action refusée`);
}

// L'autorité émet l'agrément, puis l'acteur l'accepte : deux signatures, deux transactions.
export async function agreer(role) {
  const autorite = getWallet(AUTORITE);
  const acteur = getWallet(role);
  const { etat } = await etatAgrement(role);
  if (etat === "agréé") throw new Error(`${ACTEURS[role]} est déjà agréé`);
  if (etat === "non agréé") {
    await envoyer(autorite, {
      TransactionType: "CredentialCreate",
      Account: autorite.address,
      Subject: acteur.address,
      CredentialType: typeDe(role),
    });
  }
  return envoyer(acteur, {
    TransactionType: "CredentialAccept",
    Account: acteur.address,
    Issuer: autorite.address,
    CredentialType: typeDe(role),
  });
}

// Révocation par l'autorité : le Credential disparaît du ledger.
export async function revoquer(role) {
  const autorite = getWallet(AUTORITE);
  return envoyer(autorite, {
    TransactionType: "CredentialDelete",
    Account: autorite.address,
    Subject: getWallet(role).address,
    CredentialType: typeDe(role),
  });
}

export function infosAutorite() {
  const { address } = getWallet(AUTORITE);
  return { address, lien: `${EXPLORER}/accounts/${address}` };
}
