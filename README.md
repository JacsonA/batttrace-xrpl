# BattTrace

Passeport numérique des lots de batteries sur le XRP Ledger : chaque lot est un NFT, et chaque passage de responsabilité entre acteurs est une transaction signée par les deux parties, visible dans l'explorateur.

PoC réalisé pour le hackathon Blockchain Challenge XRPL (sujet : Traçabilité).

## Équipe

| Membre | Rôle | Responsabilités principales |
| --- | --- | --- |
| Espoir Hessou | Chef de projet et architecte | Cadrage, architecture on/off-chain, justification blockchain, dépôt GitHub (issues, jalons), README, soutenance |
| Aurélien Jacson | Développeur XRPL | Scripts xrpl.js : wallets Testnet, mint NFT, offres de transfert, burn, Memos ; sécurité des clés |
| Alexandre Gao | Développeur XRPL, prototypage | TP 1 à 3 (`xrpl-tp/`) : connexion Testnet avec serveur de secours, wallets, paiements, premier mint et transfert de NFT ; module `common.mjs` qui a servi de base au PoC |

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

**Agrément des acteurs (Credentials XLS-70)**

Une autorité d'agrément (organisme de certification fictif) habilite chaque acteur. BattTrace refuse toute action (création, cession, réception, clôture) à un acteur qui ne détient pas un agrément accepté et valide : on ne peut pas confier un lot à un recycleur non habilité.

| Étape | Qui signe | Transaction XRPL |
| --- | --- | --- |
| Délivrance de l'agrément | Autorité | `CredentialCreate` (type `BATTTRACE_<ROLE>`) |
| Acceptation de l'agrément | Acteur | `CredentialAccept` |
| Révocation | Autorité | `CredentialDelete` |

L'agrément est lu directement sur le ledger (`account_objects`, type `credential`) avant chaque action.

**Séparation on-chain / off-chain**

- **On-chain** : le NFT du lot, son détenteur, les transferts et le hash de la fiche.
- **Off-chain** (`data/lots.json`) : la fiche détaillée du lot (chimie, capacité, site, date). Le bouton « Vérifier la fiche » recalcule son hash et le compare à celui inscrit à la création : toute modification de la fiche est détectée.
- **L'historique** est reconstitué en lisant le ledger (`account_tx`), pas depuis une base locale.

**Éco-crédits de recyclage (MPT)**

Le règlement européen sur les batteries fixe des objectifs de recyclage : BattTrace récompense la bonne fin de vie d'un lot. Quand le recycleur clôture un lot, l'autorité lui verse **1 éco-crédit (ECO) par kWh recyclé**. ECO est un jeton XRPL natif (Multi-Purpose Token), transférable et négociable sur le DEX.

| Étape | Qui signe | Transaction XRPL |
| --- | --- | --- |
| Création du jeton ECO (une fois) | Autorité | `MPTokenIssuanceCreate` |
| Acceptation de détenir le jeton | Recycleur | `MPTokenAuthorize` |
| Versement des crédits | Autorité | `Payment` en MPT, avec un Memo qui référence le lot |

La capacité retenue est celle de la fiche **vérifiée contre le hash inscrit à la création**. Gonfler la capacité hors chaîne pour toucher plus de crédits est détecté et le versement est refusé : la falsification a un mobile, et le système la bloque.

**Passeport scannable**

Chaque lot a un QR code qui pointe vers la page publique de son NFT sur testnet.xrpl.org. N'importe qui peut le scanner avec un téléphone et vérifier l'historique du lot sans passer par BattTrace : c'est l'étiquette qui serait collée sur la batterie physique.

## Installation

Prérequis : Node.js 20 ou plus récent.

```bash
npm install
npm run setup   # crée 4 wallets Testnet (3 acteurs + autorité) et écrit leurs seeds dans .env
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

1. Dans **Autorité d'agrément**, agréer les trois acteurs (s'ils ne le sont pas déjà).
2. Choisir **Fabricant de cellules**, créer un lot (par exemple `LOT-2026-001`).
3. Le proposer au **Constructeur automobile**.
4. Choisir **Constructeur automobile** et accepter le transfert.
5. **Révoquer** le recycleur, puis tenter de lui proposer le lot : le transfert est refusé.
6. **Agréer** de nouveau le recycleur, lui proposer le lot, puis choisir **Recycleur** et accepter.
7. En tant que **Recycleur**, clôturer le lot : l'autorité lui verse aussitôt ses éco-crédits (1 ECO par kWh), visibles dans son solde, dans l'historique du lot et dans le compteur « kWh recyclés ».
8. Ouvrir l'historique : chaque étape renvoie vers sa transaction sur [testnet.xrpl.org](https://testnet.xrpl.org). Afficher le passeport en plein écran et le faire scanner au jury.
9. La fiche est vérifiée à l'ouverture du lot : conforme. Cliquer sur « Simuler une falsification » : la capacité est gonflée de 20 % dans la fiche hors chaîne, et BattTrace affiche aussitôt les deux empreintes côte à côte (celle du ledger et celle de la fiche actuelle), caractères différents surlignés. « Restaurer la fiche d'origine » la rend de nouveau conforme.

## Réseau et comptes de test

- Réseau : **XRPL Testnet** (`wss://s.altnet.rippletest.net:51233`, secours `wss://testnet.xrpl-labs.com`).
- Adresses de test (à mettre à jour après `npm run setup` sur une autre machine) :

| Acteur | Adresse |
| --- | --- |
| Fabricant de cellules | [rhsFHEtNYYAWZBmgf1XMBW6mQcF1nCQudu](https://testnet.xrpl.org/accounts/rhsFHEtNYYAWZBmgf1XMBW6mQcF1nCQudu) |
| Constructeur automobile | [rM3jMEAnWveAFU2UTttx7EBbxy9bPKczTk](https://testnet.xrpl.org/accounts/rM3jMEAnWveAFU2UTttx7EBbxy9bPKczTk) |
| Recycleur | [rJRYBRtfsQ4w2UR6NzBr9j7jBgLYGRGL5x](https://testnet.xrpl.org/accounts/rJRYBRtfsQ4w2UR6NzBr9j7jBgLYGRGL5x) |
| Autorité d'agrément | [rBdD61kSFeHbRtY5yTszWMQV46xu3vxjMJ](https://testnet.xrpl.org/accounts/rBdD61kSFeHbRtY5yTszWMQV46xu3vxjMJ) |

## Structure du dépôt

```
src/xrpl.mjs     connexion Testnet, wallets des acteurs, envoi des transactions
src/lots.mjs     création, transfert, clôture, historique, vérification de la fiche
src/credentials.mjs  agrément des acteurs (CredentialCreate / Accept / Delete)
src/ecocredits.mjs   jeton ECO (MPT) : émission, autorisation, versement, soldes
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
- **Contrôle d'agrément applicatif** : l'agrément est vérifié par BattTrace avant chaque transaction. Le ledger, lui, n'empêche pas un acteur non agréé d'accepter une offre NFT envoyée en dehors de l'application.
