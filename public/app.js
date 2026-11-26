// Interface BattTrace : tableau de bord (lots, création, agréments) et détail d'un lot.
let acteurs = [];
let lots = [];
let moi = "FABRICANT";
let lotOuvert = null;

const $ = (sel) => document.querySelector(sel);
const echap = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const nom = (role) => acteurs.find((a) => a.role === role)?.nom ?? role;
const acteur = (role) => acteurs.find((a) => a.role === role);
const court = (adresse) => (adresse ? `${adresse.slice(0, 6)}…${adresse.slice(-6)}` : "");

const ICONES = {
  fleche: '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>',
  plus: '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg>',
  check: '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10"/></svg>',
  recyclage: '<svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>',
  bouclier: '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:1px"><path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/></svg>',
  alerte: '<svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;margin-top:1px"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>',
};

// ---------- API et notifications ----------

async function api(chemin, corps) {
  const r = await fetch(`/api/${chemin}`, corps
    ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corps) }
    : undefined);
  const data = await r.json();
  if (!r.ok) throw new Error(data.erreur);
  return data;
}

let minuterie;
function journal(message, { lien, erreur = false, enCours = false } = {}) {
  const el = $("#journal");
  clearTimeout(minuterie);
  el.className = `visible${erreur ? " erreur" : ""}`;
  el.innerHTML = echap(message) + (lien ? ` · <a href="${echap(lien)}" target="_blank">voir dans l'explorateur</a>` : "");
  if (!enCours) minuterie = setTimeout(() => el.classList.remove("visible"), 10000);
}

// Exécute une action XRPL en bloquant l'interface pendant la validation sur le ledger.
async function action(libelle, fn) {
  document.body.classList.add("occupe");
  journal(`${libelle} : validation sur le ledger…`, { enCours: true });
  try {
    const res = await fn();
    journal(`${libelle} : validé`, { lien: res?.lien });
    await rafraichir();
  } catch (e) {
    journal(`${libelle} : ${e.message}`, { erreur: true });
  } finally {
    document.body.classList.remove("occupe");
  }
}

// ---------- Composants ----------

function pastilleStatut(lot) {
  if (lot.statut === "clôturé") return '<span class="pastille neutre"><span class="point gris"></span>Clôturé</span>';
  if (lot.offreEnAttente) return `<span class="pastille attente"><span class="point" style="background:#f79009"></span>En attente : ${echap(nom(lot.offreEnAttente.vers))}</span>`;
  if (lot.statut === "en circulation") return '<span class="pastille ok"><span class="point"></span>En circulation</span>';
  return `<span class="pastille neutre">${echap(lot.statut)}</span>`;
}

const pastilleAgrement = (a) => `<span class="pastille ${a.agree ? "ok" : "ko"}">${a.agree ? "Agréé" : echap(a.agrement)}</span>`;

function afficherSelecteur() {
  $("#selecteur").innerHTML = acteurs.map((a) => `
    <button aria-pressed="${a.role === moi}" data-role="${a.role}">
      <span class="point ${a.agree ? "" : "ko"}"></span>${echap(a.nom)}
    </button>`).join("");
}

function afficherTableau() {
  const a = acteur(moi);
  $("#salut").textContent = `Bonjour, ${a?.nom ?? ""}`;
  $("#wallet").innerHTML = a
    ? `<span>Wallet</span><a class="mono" href="${echap(a.lien)}" target="_blank">${echap(court(a.address))}</a><span style="color:#d0d5dd">|</span><strong>${a.solde != null ? (Math.floor(a.solde * 100) / 100).toLocaleString("fr-FR") : "?"} XRP</strong>`
    : "";
  $("#nb-circulation").textContent = lots.filter((l) => l.statut === "en circulation").length;
  $("#nb-clotures").textContent = lots.filter((l) => l.statut === "clôturé").length;
  $("#nb-agrees").innerHTML = `${acteurs.filter((x) => x.agree).length} <small>/ ${acteurs.length}</small>`;
  $("#bloc-creation").hidden = moi !== "FABRICANT";

  $("#lots").innerHTML = lots.length ? [...lots].reverse().map((l) => `
    <tr>
      <td><div class="cellule-lot"><strong>${echap(l.numero)}</strong><span class="mono">${echap(l.id.slice(0, 16))}…</span></div></td>
      <td>${l.detenteur ? echap(nom(l.detenteur)) : '<span style="color:#667085">—</span>'}</td>
      <td>${pastilleStatut(l)}</td>
      <td>
        ${l.offreEnAttente?.vers === moi ? `<button class="btn btn-principal" data-accepter="${l.id}">Accepter</button>` : ""}
        <button class="btn btn-lien" data-ouvrir="${l.id}">Voir le lot ${ICONES.fleche}</button>
      </td>
    </tr>`).join("") : '<tr><td colspan="4" class="vide">Aucun lot pour l\'instant.</td></tr>';

  $("#agrements").innerHTML = acteurs.map((x) => `
    <div class="agrement">
      <div class="agrement-nom">${echap(x.nom)}</div>
      <div class="agrement-actions">
        ${pastilleAgrement(x)}
        ${x.agree
          ? `<button class="btn btn-danger" data-revoquer="${x.role}">Révoquer</button>`
          : `<button class="btn btn-second" data-agreer="${x.role}">Agréer</button>`}
      </div>
    </div>`).join("");
}

function iconeEtape(type) {
  if (type === "NFTokenMint") return `<div class="frise-icone creation">${ICONES.plus}</div>`;
  if (type === "NFTokenAcceptOffer") return `<div class="frise-icone accepte">${ICONES.check}</div>`;
  if (type === "NFTokenBurn") return `<div class="frise-icone fin">${ICONES.recyclage}</div>`;
  return `<div class="frise-icone">${ICONES.fleche}</div>`;
}

function afficherLot(h) {
  const lot = lots.find((l) => l.id === h.id) ?? { statut: h.statut, offreEnAttente: h.offreEnAttente };
  $("#lot-numero").textContent = h.fiche?.numero ?? "Lot";
  $("#lot-statut").innerHTML = pastilleStatut(lot);
  $("#lot-id").textContent = `${h.id.slice(0, 16)}…`;
  $("#lot-id").title = h.id;
  $("#lot-lien").href = h.lienNft;

  const det = acteur(h.detenteur);
  $("#lot-detenteur").innerHTML = det
    ? `<span>Détenteur actuel</span><strong>${echap(det.nom)}</strong><span class="mono">${echap(court(det.address))}</span>`
    : `<span>Détenteur actuel</span><strong>${h.statut === "clôturé" ? "Lot clôturé" : "—"}</strong>`;

  // Bandeau : transfert en attente
  const offre = h.offreEnAttente;
  if (offre?.vers === moi) {
    $("#lot-bandeau").innerHTML = `<div class="bandeau"><p><strong>${echap(nom(offre.de))}</strong> vous propose ce lot. En l'acceptant, vous en devenez responsable.</p><button class="btn btn-principal" data-accepter="${h.id}">Accepter le transfert</button></div>`;
  } else if (offre) {
    $("#lot-bandeau").innerHTML = `<div class="bandeau"><p>Transfert proposé par <strong>${echap(nom(offre.de))}</strong> à <strong>${echap(nom(offre.vers))}</strong>, en attente de son acceptation.</p></div>`;
  } else {
    $("#lot-bandeau").innerHTML = "";
  }

  $("#lot-etapes").innerHTML = h.etapes.map((e) => `
    <li>
      <div class="frise-rail">${iconeEtape(e.type)}<div class="frise-trait"></div></div>
      <div class="frise-texte">
        <strong>${echap(e.etape)}</strong>
        <span class="sous">par ${echap(nom(e.par))}${e.date ? ` · ${new Date(e.date).toLocaleString("fr-FR")}` : ""}</span>
        <a class="tx" href="${echap(e.lien)}" target="_blank"><b>${echap(e.type)}</b><span class="mono">${echap(e.hash.slice(0, 12))}…</span></a>
      </div>
    </li>`).join("");

  // Carte « Céder le lot » : seulement pour le détenteur, sans offre en cours
  const peutCeder = h.statut === "en circulation" && h.detenteur === moi && !offre;
  $("#lot-ceder").hidden = !peutCeder;
  if (peutCeder) {
    const options = acteurs.filter((a) => a.role !== moi)
      .map((a) => `<option value="${a.role}">${echap(a.nom)} · ${a.agree ? "agréé" : "non agréé"}</option>`).join("");
    $("#lot-ceder").innerHTML = `
      <div class="titre-bloc"><h2>Céder le lot</h2><span class="sous">Le destinataire devra accepter pour en devenir responsable</span></div>
      <label>Destinataire <select id="vers">${options}</select></label>
      <button class="btn btn-principal" data-proposer="${h.id}">Proposer le transfert</button>
      ${moi === "RECYCLEUR" ? `<button class="btn btn-danger" data-cloturer="${h.id}">Clôturer le lot (fin de vie)</button>` : ""}`;
  }

  const f = h.fiche ?? {};
  const champs = [["Chimie", f.chimie], ["Capacité", f.capaciteKWh ? `${f.capaciteKWh} kWh` : null], ["Site", f.site], ["Fabrication", f.dateFabrication ? new Date(f.dateFabrication).toLocaleDateString("fr-FR") : null]];
  $("#lot-fiche").innerHTML = champs.filter(([, v]) => v).map(([k, v]) => `<div><dt>${k}</dt><dd>${echap(v)}</dd></div>`).join("");
}

// ---------- Chargement ----------

async function rafraichir() {
  [acteurs, lots] = await Promise.all([api("acteurs"), api("lots")]);
  afficherSelecteur();
  afficherTableau();
  if (lotOuvert) afficherLot(await api(`lots/${lotOuvert}/historique`));
}

async function ouvrirLot(id) {
  lotOuvert = id;
  $("#lot-verif").innerHTML = "";
  afficherLot(await api(`lots/${id}/historique`));
  $("#vue-tableau").hidden = true;
  $("#vue-lot").hidden = false;
  window.scrollTo(0, 0);
}

function fermerLot() {
  lotOuvert = null;
  $("#vue-lot").hidden = true;
  $("#vue-tableau").hidden = false;
}

// ---------- Événements ----------

$("#selecteur").addEventListener("click", async (ev) => {
  const b = ev.target.closest("[data-role]");
  if (!b) return;
  moi = b.dataset.role;
  afficherSelecteur();
  afficherTableau();
  if (lotOuvert) afficherLot(await api(`lots/${lotOuvert}/historique`));
});

$("#form-creation").addEventListener("submit", (ev) => {
  ev.preventDefault();
  const f = Object.fromEntries(new FormData(ev.target));
  f.capaciteKWh = Number(f.capaciteKWh);
  f.dateFabrication = new Date().toISOString().slice(0, 10);
  action(`Création du lot ${f.numero}`, async () => {
    const r = await api("lots", { acteur: moi, fiche: f });
    ev.target.numero.value = "";
    return r;
  });
});

// Un seul écouteur pour tous les boutons d'action (tableau, agréments, détail du lot).
document.body.addEventListener("click", (ev) => {
  const b = ev.target.closest("button");
  if (!b) return;
  const d = b.dataset;
  if (d.ouvrir) ouvrirLot(d.ouvrir);
  if (d.accepter) action("Acceptation du transfert", () => api(`lots/${d.accepter}/accepter`, { acteur: moi }));
  if (d.cloturer) action("Clôture du lot", () => api(`lots/${d.cloturer}/cloturer`, { acteur: moi }));
  if (d.proposer) {
    const vers = $("#vers").value;
    action(`Proposition à ${nom(vers)}`, () => api(`lots/${d.proposer}/proposer`, { de: moi, vers }));
  }
  if (d.agreer) action(`Agrément de ${nom(d.agreer)}`, () => api(`agrements/${d.agreer}`, {}));
  if (d.revoquer) action(`Révocation de ${nom(d.revoquer)}`, () => api(`agrements/${d.revoquer}/revoquer`, {}));
});

$("#retour").addEventListener("click", fermerLot);
$("#rafraichir").addEventListener("click", () => action("Actualisation", async () => null));

$("#verifier").addEventListener("click", async () => {
  try {
    const v = await api(`lots/${lotOuvert}/verifier`);
    $("#lot-verif").innerHTML = v.conforme
      ? `<div class="verif ok">${ICONES.bouclier}<div><strong>Fiche conforme</strong><span>Son hash SHA-256 correspond à celui inscrit sur le ledger à la création. <a href="${echap(v.lien)}" target="_blank">Voir la transaction</a></span></div></div>`
      : `<div class="verif ko">${ICONES.alerte}<div><strong>Fiche modifiée</strong><span>Son hash ne correspond plus à celui inscrit sur le ledger : la fiche a été altérée hors chaîne.</span></div></div>`;
  } catch (e) {
    journal(`Vérification : ${e.message}`, { erreur: true });
  }
});

(async () => {
  try {
    api("autorite").then((a) => { $("#autorite-adresse").textContent = court(a.address); }).catch(() => {});
    await rafraichir();
  } catch (e) {
    journal(`Démarrage impossible : ${e.message}`, { erreur: true });
  }
})();
