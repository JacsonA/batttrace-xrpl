import { xrpToDrops, convertStringToHex } from "xrpl";
import { connect, getWallet, send } from "./common.mjs";

const client = await connect();

try {
  const alice = getWallet("ALICE");
  const bob = getWallet("BOB");

  await send(client, alice, {
    TransactionType: "Payment",
    Account: alice.address,
    Destination: bob.address,
    Amount: xrpToDrops("10"),
    Memos: [
      {
        Memo: {
          MemoData: convertStringToHex("demo-001")
        }
      }
    ]
  });
} finally {
  await client.disconnect();
}