import { convertStringToHex } from "xrpl";
import { connect, getWallet, send } from "./common.mjs";

const client = await connect();
const alice = getWallet("ALICE");
const bob = getWallet("BOB");

// 1. Mint du lot (Flags 9 = burnable + transferable)
await send(client, alice, {
  TransactionType: "NFTokenMint",
  Account: alice.address,
  NFTokenTaxon: 0,
  Flags: 9,
  URI: convertStringToHex("lot-batterie-001"),
  Memos: [{ Memo: { MemoData: convertStringToHex("creation-lot") } }],
});

const nfts = await client.request({ command: "account_nfts", account: alice.address });
const nftId = nfts.result.account_nfts.at(-1).NFTokenID;
console.log("NFTokenID :", nftId);

// 2. Offre de transfert à 0 XRP réservée à Bob
await send(client, alice, {
  TransactionType: "NFTokenCreateOffer",
  Account: alice.address,
  NFTokenID: nftId,
  Amount: "0",
  Destination: bob.address,
  Flags: 1, // tfSellNFToken
  Memos: [{ Memo: { MemoData: convertStringToHex("transfert-vers-bob") } }],
});

const offers = await client.request({ command: "nft_sell_offers", nft_id: nftId });
const offerId = offers.result.offers[0].nft_offer_index;

// 3. Bob accepte le transfert de responsabilité
await send(client, bob, {
  TransactionType: "NFTokenAcceptOffer",
  Account: bob.address,
  NFTokenSellOffer: offerId,
});

await client.disconnect();