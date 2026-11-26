import { Client, Wallet } from "xrpl";
import "dotenv/config";

const SERVERS = [
  "wss://s.altnet.rippletest.net:51233",
  "wss://testnet.xrpl-labs.com",
];

export async function connect() {
  for (const url of SERVERS) {
    try {
      const client = new Client(url);
      await client.connect();
      console.log("Connecté à", url);
      return client;
    } catch (e) {
      console.log("Échec sur", url, "→ serveur suivant");
    }
  }
  throw new Error("Aucun serveur Testnet joignable");
}

export const getWallet = (name) => Wallet.fromSeed(process.env[`${name}_SEED`]);

export async function send(client, wallet, tx) {
  const prepared = await client.autofill(tx);
  const signed = wallet.sign(prepared);
  const res = await client.submitAndWait(signed.tx_blob);
  const code = res.result.meta.TransactionResult;
  console.log(tx.TransactionType, "→", code, "| hash :", signed.hash);
  if (code !== "tesSUCCESS") throw new Error(code);
  return res;
}