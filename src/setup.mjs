// Crée un wallet Testnet (alimenté par le faucet) pour chaque acteur absent du .env.
import { appendFileSync } from "node:fs";
import { ACTEURS, EXPLORER, disconnect, getClient } from "./xrpl.mjs";

const client = await getClient();
try {
  for (const role of Object.keys(ACTEURS)) {
    if (process.env[`${role}_SEED`]) {
      console.log(`${role} : déjà présent dans .env`);
      continue;
    }
    const { wallet, balance } = await client.fundWallet();
    appendFileSync(".env", `${role}_SEED=${wallet.seed}\n`);
    console.log(`${role} → ${wallet.address} | solde : ${balance} XRP | ${EXPLORER}/accounts/${wallet.address}`);
  }
} finally {
  await disconnect();
}
