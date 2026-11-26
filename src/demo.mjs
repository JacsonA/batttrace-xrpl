// Scénario complet en ligne de commande : création → constructeur → recycleur → fin de vie.
import { accepterTransfert, cloturerLot, creerLot, historique, proposerTransfert, verifierFiche } from "./lots.mjs";
import { disconnect } from "./xrpl.mjs";

const numero = `LOT-${Date.now().toString(36).toUpperCase()}`;

try {
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

  console.log("\n3. Constructeur → Recycleur");
  await proposerTransfert(id, "CONSTRUCTEUR", "RECYCLEUR");
  await accepterTransfert(id, "RECYCLEUR");

  console.log("\n4. Le recycleur clôture le lot");
  await cloturerLot(id, "RECYCLEUR");

  console.log("\n5. Vérification de la fiche off-chain");
  const v = await verifierFiche(id);
  console.log("   Conforme au hash on-chain :", v.conforme);

  console.log("\n6. Historique reconstitué depuis le ledger");
  const h = await historique(id);
  for (const e of h.etapes) console.log(`   - ${e.etape} (par ${e.par}) ${e.lien}`);
  console.log("   Statut :", h.statut);
} finally {
  await disconnect();
}
