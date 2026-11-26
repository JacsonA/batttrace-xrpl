// Interface BattTrace : on choisit l'acteur qui agit, puis on agit sur les lots.
let acteurs = [];
let moi = "FABRICANT";
let lotOuvert = null;

const $ = (sel) => document.querySelector(sel);
const nom = (role) => acteurs.find((a) => a.role === role)?.nom ?? role;
const echap = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

async function api(chemin, corps) {
  const r = await fetch(`/api/${chemin}`, corps
    ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corps) }
    : undefined);
  const data = await r.json();
  if (!r.ok) throw new Error(data.erreur);
  return data;
}

let minuterie;
function journal(message, lien, erreur = false) {
  const el = $("#journal");
  clearTimeout(minuterie);
  if (!message.endsWith(")")) minuterie = setTimeout(() => el.classList.remove("visible"), 10000);
  el.className = erreur ? "erreur visible" : "visible";
  el.innerHTML = echap(message) + (lien ? ` — <a href="${echap(lien)}" target="_blank">voir dans l'explorateur</a>` : "");
}

// Exécute une action XRPL en bloquant les boutons pendant la validation (~4 s).
async function action(libelle, fn) {
  document.body.classList.add("occupe");
  journal(`${libelle}… (validation sur le ledger)`);
  try {
    const res = await fn();
    journal(`${libelle} : validé`, res?.lien);
    await rafraichir();
    if (lotOuvert) await ouvrirHistorique(lotOuvert);
  } catch (e) {
    journal(`${libelle} : ${e.message}`, null, true);
  } finally {
    document.body.classList.remove("occupe");
  }
}

function afficherActeurs() {
  $("#acteurs").innerHTML = acteurs.map((a) => `
    <button class="acteur ${a.role === moi ? "actif" : ""}" data-role="${a.role}">
      <strong>${echap(a.nom)}</strong>
      <span class="adresse">${echap(a.address)}</span>
      <span>${a.solde ?? "?"} XRP</span>
    </button>`).join("");
  $("#bloc-creation").hidden = moi !== "FABRICANT";
}

function actionsPour(lot) {
  const boutons = [`<button class="secondaire" data-historique="${lot.id}">Historique</button>`];
  if (lot.statut !== "en circulation") return boutons.join("");
  if (lot.offreEnAttente?.vers === moi) {
    boutons.push(`<button data-accepter="${lot.id}">Accepter le transfert</button>`);
  }
  if (lot.detenteur === moi && !lot.offreEnAttente) {
    const options = acteurs.filter((a) => a.role !== moi)
      .map((a) => `<option value="${a.role}">${echap(a.nom)}</option>`).join("");
    boutons.push(`<select data-vers="${lot.id}">${options}</select><button data-proposer="${lot.id}">Proposer</button>`);
    if (moi === "RECYCLEUR") boutons.push(`<button class="danger" data-cloturer="${lot.id}">Clôturer</button>`);
  }
  return boutons.join(" ");
}

function afficherLots(lots) {
  $("#lots").innerHTML = lots.length ? lots.map((l) => `
    <tr>
      <td><strong>${echap(l.numero)}</strong><br><span class="adresse">${echap(l.id.slice(0, 16))}…</span></td>
      <td>${l.detenteur ? echap(nom(l.detenteur)) : "—"}</td>
      <td>${echap(l.statut)}${l.offreEnAttente ? `<br><small>en attente : ${echap(nom(l.offreEnAttente.vers))}</small>` : ""}</td>
      <td class="actions">${actionsPour(l)}</td>
    </tr>`).join("") : `<tr><td colspan="4">Aucun lot pour l'instant.</td></tr>`;
}

async function rafraichir() {
  const [a, lots] = await Promise.all([api("acteurs"), api("lots")]);
  acteurs = a;
  afficherActeurs();
  afficherLots(lots);
}

async function ouvrirHistorique(id) {
  lotOuvert = id;
  const h = await api(`lots/${id}/historique`);
  $("#bloc-historique").hidden = false;
  $("#hist-numero").textContent = h.fiche?.numero ?? "";
  $("#hist-verif").textContent = "";
  $("#hist-etapes").innerHTML = h.etapes.map((e) => `
    <li>
      <strong>${echap(e.etape)}</strong>
      <span>par ${echap(nom(e.par))}${e.date ? ` · ${new Date(e.date).toLocaleString("fr-FR")}` : ""}</span>
      <a href="${echap(e.lien)}" target="_blank">${echap(e.type)} · ${echap(e.hash.slice(0, 12))}…</a>
    </li>`).join("");
}

// ---------- Événements ----------

$("#acteurs").addEventListener("click", async (ev) => {
  const b = ev.target.closest("[data-role]");
  if (!b) return;
  moi = b.dataset.role;
  afficherActeurs();
  await rafraichir();
});

$("#form-creation").addEventListener("submit", (ev) => {
  ev.preventDefault();
  const f = Object.fromEntries(new FormData(ev.target));
  f.capaciteKWh = Number(f.capaciteKWh);
  f.dateFabrication = new Date().toISOString().slice(0, 10);
  action(`Création du lot ${f.numero}`, () => api("lots", { acteur: moi, fiche: f }));
});

$("#lots").addEventListener("click", (ev) => {
  const d = ev.target.dataset;
  if (d.historique) ouvrirHistorique(d.historique);
  if (d.accepter) action("Acceptation du transfert", () => api(`lots/${d.accepter}/accepter`, { acteur: moi }));
  if (d.cloturer) action("Clôture du lot", () => api(`lots/${d.cloturer}/cloturer`, { acteur: moi }));
  if (d.proposer) {
    const vers = document.querySelector(`select[data-vers="${d.proposer}"]`).value;
    action(`Proposition à ${nom(vers)}`, () => api(`lots/${d.proposer}/proposer`, { de: moi, vers }));
  }
});

$("#rafraichir").addEventListener("click", rafraichir);

$("#verifier").addEventListener("click", async () => {
  const v = await api(`lots/${lotOuvert}/verifier`);
  const el = $("#hist-verif");
  el.className = v.conforme ? "ok" : "ko";
  el.innerHTML = (v.conforme
    ? "Fiche conforme : son hash correspond à celui inscrit sur le ledger à la création."
    : "Fiche modifiée : son hash ne correspond plus à celui inscrit sur le ledger.")
    + ` <a href="${echap(v.lien)}" target="_blank">transaction de création</a>`;
});

(async () => {
  try {
    await rafraichir();
  } catch (e) {
    journal(`Démarrage impossible : ${e.message}`, null, true);
  }
})();
