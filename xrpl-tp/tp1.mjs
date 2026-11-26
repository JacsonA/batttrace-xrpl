import { appendFileSync } from "fs";
import { connect } from "./common.mjs";

const client = await connect();
for (const name of ["ALICE", "BOB"]) {
  const { wallet, balance } = await client.fundWallet();
  console.log(name, "→", wallet.address, "| solde :", balance, "XRP");
  appendFileSync(".env", `${name}_SEED=${wallet.seed}\n`);
}
await client.disconnect();