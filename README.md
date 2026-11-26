# BattTrace

Passeport numérique des lots de batteries sur le XRP Ledger : chaque lot est un NFT, et chaque passage de responsabilité entre acteurs est une transaction signée par les deux parties, visible dans l'explorateur.

PoC réalisé pour le hackathon Blockchain Challenge XRPL (sujet : Traçabilité).

## Le problème

Un lot de batteries passe du fabricant au constructeur, puis au recycleur. Ces entreprises sont indépendantes et aucune n'accepte qu'une autre détienne le registre commun. BattTrace fournit un historique partagé, infalsifiable et consultable par tous, sans tiers de confiance.

## Fonctionnement

| Étape | Qui signe | Transaction XRPL |
| --- | --- | --- |
| Création du lot | Fabricant | `NFTokenMint` (URI = hash SHA-256 de la fiche du lot) |
| Proposition de transfert | Détenteur actuel | `NFTokenCreateOffer` à 0 XRP, réservée au destinataire (`Destination`) |
| Acceptation du transfert | Destinataire | `NFTokenAcceptOffer` |
| Fin de vie | Recycleur | `NFTokenBurn` |

Chaque transaction porte un Memo `batttrace/etape` (étape et numéro de lot, sans donnée personnelle).

**Séparation on-chain / off-chain**

- **On-chain** : le NFT du lot, son détenteur, les transferts et le hash de la fiche.
- **Off-chain** (`data/lots.json`) : la fiche détaillée du lot (chimie, capacité, site, date). Le bouton « Vérifier la fiche » recalcule son hash et le compare à celui inscrit à la création : toute modification de la fiche est détectée.
- **L'historique** est reconstitué en lisant le ledger (`account_tx`), pas depuis une base locale.

## Installation

Prérequis : Node.js 20 ou plus récent.

```bash
npm install
npm run setup   # crée 3 wallets Testnet (faucet) et écrit leurs seeds dans .env
```

`.env` est ignoré par Git : aucune seed n'est publiée. Voir `.env.example` pour le format.

## Lancement

**Interface web**

```bash
npm start       # puis ouvrir http://localhost:3000
```

**Scénario complet en ligne de commande**

```bash
npm run demo
```

## Scénario de démonstration

1. Choisir **Fabricant de cellules**, créer un lot (par exemple `LOT-2026-001`).
2. Le proposer au **Constructeur automobile**.
3. Choisir **Constructeur automobile** et accepter le transfert.
4. Le proposer au **Recycleur**, puis choisir **Recycleur** et accepter.
5. En tant que **Recycleur**, clôturer le lot.
6. Ouvrir l'historique : chaque étape renvoie vers sa transaction sur [testnet.xrpl.org](https://testnet.xrpl.org).
7. Cliquer sur « Vérifier la fiche » : conforme. Modifier la capacité du lot dans `data/lots.json`, revérifier : la falsification est détectée.

## Réseau et comptes de test

- Réseau : **XRPL Testnet** (`wss://s.altnet.rippletest.net:51233`, secours `wss://testnet.xrpl-labs.com`).
- Adresses de test (à mettre à jour après `npm run setup` sur une autre machine) :

| Acteur | Adresse |
| --- | --- |
| Fabricant de cellules | [rhsFHEtNYYAWZBmgf1XMBW6mQcF1nCQudu](https://testnet.xrpl.org/accounts/rhsFHEtNYYAWZBmgf1XMBW6mQcF1nCQudu) |
| Constructeur automobile | [rM3jMEAnWveAFU2UTttx7EBbxy9bPKczTk](https://testnet.xrpl.org/accounts/rM3jMEAnWveAFU2UTttx7EBbxy9bPKczTk) |
| Recycleur | [rJRYBRtfsQ4w2UR6NzBr9j7jBgLYGRGL5x](https://testnet.xrpl.org/accounts/rJRYBRtfsQ4w2UR6NzBr9j7jBgLYGRGL5x) |

## Structure du dépôt

```
src/xrpl.mjs     connexion Testnet, wallets des acteurs, envoi des transactions
src/lots.mjs     création, transfert, clôture, historique, vérification de la fiche
src/server.mjs   API JSON + serveur de l'interface
src/setup.mjs    création des wallets Testnet
src/demo.mjs     scénario complet en ligne de commande
public/          interface web (HTML, CSS, JavaScript)
xrpl-tp/         exercices de prise en main XRPL (TP 1 à 3)
```

## Limites connues

- **Lien physique-numérique** : le ledger ne prouve pas que la batterie réelle correspond au NFT (il faudrait un QR code ou une puce NFC).
- **Garde des clés** : pour le PoC, le serveur signe pour les trois acteurs avec des seeds de test. En production, chaque entreprise garderait sa clé (wallet dédié, multi-signature).
- **Saisie de mauvaise foi** : la blockchain garantit qu'une déclaration ne peut plus être niée ni modifiée, pas qu'elle est vraie.
