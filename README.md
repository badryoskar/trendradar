# TrendRadar

Extension Chrome (Manifest V3) de veille d'actualités **local-first** : agrégation de sources autorisées (RSS/Atom, Hacker News), provenance et dates traçables, signaux de tendance uniquement lorsque les données le justifient.

> **État : phase 3 (expérience de veille).** Collecte manuelle depuis Hacker News (API officielle) et des flux RSS/Atom autorisés, déduplication avec provenance, classement par mots-clés explicable et corrigeable, catégories personnalisées, recherche, filtres de dates honnêtes, favoris et lu/non lu, testés aussi sur l'extension réellement installée. Sujets et tendances : phase 4. Voir [`TEST_REPORT.md`](TEST_REPORT.md) et [`SOURCE_REGISTRY.md`](SOURCE_REGISTRY.md).

## Principes

- **Aucun serveur.** Tout est stocké dans IndexedDB, dans l'origine de l'extension. Rien n'est transmis à un tiers.
- **Aucune permission obligatoire.** `permissions: []`. L'accès réseau à un flux est demandé **origine par origine**, au moment où l'utilisateur ajoute la source (`optional_host_permissions`).
- **Dates honnêtes.** La date de publication déclarée par la source (`publishedAt`) n'est jamais remplacée par la date de collecte (`firstSeenAt`). Sans date : « date de publication indisponible ».
- **Pas de tendance inventée.** Sans historique suffisant : « signal indisponible — historique insuffisant ».

## Installation (développement)

Prérequis : Node.js ≥ 20 (testé avec 24.15.0), npm.

```bash
npm ci
npm run build          # typecheck + build dans dist/
```

Puis dans Chrome : `chrome://extensions` → activer le _mode développeur_ → **Charger l'extension non empaquetée** → sélectionner `dist/`.

## Scripts

| Commande                          | Rôle                                                                                                       |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `npm run build`                   | Vérification TypeScript puis build de production dans `dist/`                                              |
| `npm test`                        | Tests unitaires, intégration IndexedDB (fake-indexeddb) et interface (Testing Library)                     |
| `npm run lint`                    | ESLint (interdit `dangerouslySetInnerHTML`, `eval`, `Date.now()` direct)                                   |
| `npm run test:e2e`                | Build puis tests Playwright sur l'extension chargée dans Chromium (`E2E_NETWORK=1` pour l'appel réel à HN) |
| `npm run check`                   | Typecheck + lint + tests + build + `scripts/verify-dist.mjs`                                               |
| `node scripts/generate-icons.mjs` | Régénère les icônes PNG (sans dépendance)                                                                  |

`scripts/verify-dist.mjs` contrôle le build : manifeste MV3, permissions interdites, CSP, fichiers référencés, absence de secrets, de `eval` et d'hôtes externes inattendus.

## Architecture (phase 1)

```text
public/manifest.json        manifeste MV3 (copié tel quel)
src/connectors/             client réseau borné, parseur RSS/Atom (DOMParser), API Hacker News
src/collection/             orchestration du rafraîchissement, ajout de source
src/domain/                 types + schémas zod, dates, URL canoniques, texte inerte, catégories, démo
src/persistence/            IndexedDB (migrations versionnées), repositories validés
src/shared/                 horloge injectable, garde-fous d'URL
src/ui/                     popup + tableau de bord React (Latest, Topics, Saved, Sources, Settings)
tests/                      Vitest
scripts/                    génération d'icônes, vérification du build
```

Choix notables (justifiés dans l'audit de phase 0) :

- **Pas de service worker dans le MVP** : le rafraîchissement est manuel et déclenché depuis le tableau de bord, qui dispose de `DOMParser`. Évite offscreen document et limites de vie du worker.
- **IndexedDB comme stockage unique** : pas de `chrome.storage`, donc pas de permission `storage`.
- **Validation à l'exécution** (zod) à chaque écriture et lecture ; les enregistrements corrompus sont ignorés et signalés.

## Jeu de démonstration

Bouton **Settings → Charger la démo** : 5 articles **fictifs**, badge « Démo », titres préfixés `[Démo]`, liens vers `example.com` (domaine réservé). Il illustre un article sans date et un article ancien découvert récemment. Retirable à tout moment.

## Licence

À décider.
