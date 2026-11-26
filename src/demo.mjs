// Scénario complet en ligne de commande :
// agrément des acteurs → création → constructeur → refus d'un recycleur non agréé → ré-agrément → recycleur → fin de vie.
import { accepterTransfert, cloturerLot, creerLot, historique, proposerTransfert, verifierFiche } from "./lots.mjs";
import { agreer, etatAgrement, revoquer } from "./credentials.mjs";
import { ACTEURS, disconnect } from "./xrpl.mjs";

const numero = `LOT-${Date.now().toString(36).toUpperCase()}`;

try {
  console.log("\n0. L'autorité agrée les acteurs (Credentials XLS-70)");
  for (const role of Object.keys(ACTEURS)) {
    const { agree } = await etatAgrement(role);
    if (agree) console.log(`   ${role} : déjà agréé`);
    else await agreer(role);
  }

  console.log(`\n1. Le fabricant crée le lot ${numero}`);
  const { id } = await creerLot("FABRICANT", {
    numero,
    chimie: "NMC 811",
    capaciteKWh: 75,
    site: "Usine A (fictive)",
    dateFabrication: new Date().toISOString().slice(0, 10),
  });
  console.log("   NFTokenID :", id);

  console.log("\n2. Fabricant → Constructeur");
  await proposerTransfert(id, "FABRICANT", "CONSTRUCTEUR");
  await accepterTransfert(id, "CONSTRUCTEUR");

  console.log("\n3. L'autorité révoque le recycleur, le transfert vers lui est refusé");
  await revoquer("RECYCLEUR");
  try {
    await proposerTransfert(id, "CONSTRUCTEUR", "RECYCLEUR");
    console.log("   ERREUR : le transfert aurait dû être refusé");
  } catch (e) {
    console.log("   Refusé comme attendu :", e.message);
  }

  console.log("\n4. Le recycleur est de nouveau agréé, Constructeur → Recycleur");
  await agreer("RECYCLEUR");
  await proposerTransfert(id, "CONSTRUCTEUR", "RECYCLEUR");
  await accepterTransfert(id, "RECYCLEUR");

  console.log("\n5. Le recycleur clôture le lot");
  await cloturerLot(id, "RECYCLEUR");

  console.log("\n6. Vérification de la fiche off-chain");
  const v = await verifierFiche(id);
  console.log("   Conforme au hash on-chain :", v.conforme);

  console.log("\n7. Historique reconstitué depuis le ledger");
  const h = await historique(id);
  for (const e of h.etapes) console.log(`   - ${e.etape} (par ${e.par}) ${e.lien}`);
  console.log("   Statut :", h.statut);
} finally {
  await disconnect();
}
