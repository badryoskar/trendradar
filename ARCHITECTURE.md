# Architecture

## Vue d'ensemble

TrendRadar est une extension Chrome Manifest V3 **sans backend** : toutes les données sont stockées et traitées dans le navigateur.

```text
            Popup (popup.html) ── chrome.tabs.create ──▶ Tableau de bord (dashboard.html)
                                                               │  clic « Actualiser »
                                                               ▼
  ┌──────────────── collection/refresh.ts (4 sources en parallèle, une par une isolée) ─────────────────┐
  │  permission d'origine ? ─▶ connecteur ─▶ network-client ─▶ parseur ─▶ validation zod ─▶ ingestion │
  │  (chrome.permissions)      HN / RSS    (https, 15 s, 2 Mo,  (DOMParser, (ArticleDraft)  (transaction│
  │                                         redirections)        sans entités)               IndexedDB)│
  └─────────────────────────────────────────────────────────────────────────────────────────────────────┘
                                                               │
                         IndexedDB « trendradar » (origine de l'extension, v1)
                                                               │
          lecture + revalidation ─▶ classify / query / topic-cluster / trend-signal (fonctions pures) ─▶ React
```

Pipeline : ajout de source (permission) → « Actualiser » → collecte par source → validation et parsing → normalisation
(URL canonique, dates UTC, texte inerte) → déduplication transactionnelle → persistance → classement, sujets et signaux
calculés à l'affichage → rendu avec provenance, dates et santé des sources. Une erreur reste **propre à sa source**.

## Décisions clés

| Décision                                                              | Raison                                                                                                                                                                                                   | Alternative écartée                                                                                                         |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Pas de service worker** dans le MVP                                 | Le rafraîchissement est manuel et lancé depuis le tableau de bord, une page d'extension qui a accès à `DOMParser` et `fetch`. On évite l'arrêt du service worker (30 s d'inactivité, 5 min par requête). | Service worker + document offscreen `DOM_PARSER` : prévus seulement avec une collecte planifiée (`chrome.alarms`, hors MVP) |
| **IndexedDB comme stockage unique**                                   | Aucune permission `storage` ; migrations et suppression unifiées ; volume supérieur aux 10 Mo de `chrome.storage.local`                                                                                  | `chrome.storage.local` pour les préférences                                                                                 |
| **`permissions: []`** et `optional_host_permissions: ["https://*/*"]` | L'accès est demandé **origine par origine**, au clic, pour chaque flux ajouté. HN n'en a pas besoin (CORS permissif observé).                                                                            | Permissions d'hôte obligatoires                                                                                             |
| **Validation zod** à chaque frontière                                 | Données réseau, lectures de base, fixtures : TypeScript ne protège rien à l'exécution                                                                                                                    | Simple typage TypeScript                                                                                                    |
| **Calcul à l'affichage** (classement, sujets, signaux)                | Une règle modifiée s'applique immédiatement, sans score périmé ni migration                                                                                                                              | Résultats précalculés en base                                                                                               |
| **Horloge et `fetch` injectés**                                       | Tests déterministes ; `Date.now()` interdit par ESLint                                                                                                                                                   | Horloge globale                                                                                                             |

## Modules

| Dossier            | Rôle                                                                                                                                                                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/domain/`      | Modèle et schémas (`content.types.ts`), dates et fenêtres locales (`freshness.ts`, `dates.ts`), URL canoniques, texte inerte, classement, recherche, regroupement en sujets, signaux. **Fonctions pures, sans entrée/sortie.** |
| `src/connectors/`  | Contrat `SourceConnector`, client réseau borné, parseur RSS/Atom, API Hacker News                                                                                                                                              |
| `src/collection/`  | Orchestration du rafraîchissement, ajout de source avec collecte de test                                                                                                                                                       |
| `src/persistence/` | Schéma IndexedDB et migrations, dépôts validés, ingestion transactionnelle, démo                                                                                                                                               |
| `src/shared/`      | Horloge, erreurs typées, garde-fous d'URL, permissions (adaptateur Chrome ou mémoire)                                                                                                                                          |
| `src/ui/`          | React : popup, tableau de bord, composants accessibles                                                                                                                                                                         |

Les dépendances ne vont que dans un sens : `ui → collection → connectors/persistence → domain/shared`. `domain`
n'importe jamais `ui`, `persistence` ni `connectors`.

## Réseau et sécurité

- **Client réseau :**
  - `https:` uniquement ; requêtes sans cookie ni referrer (`credentials: 'omit'`, `referrerPolicy: 'no-referrer'`) ;
  - délai de 15 s (`AbortSignal.timeout`, combinable avec une annulation par l'utilisateur) ;
  - réponse lue en flux et coupée à 2 Mo ; type MIME vérifié ;
  - origine finale vérifiée après redirection : l'accès doit être autorisé, et la cible doit rester en `https:`.
- **Limite de MV3 :** `fetch` suit lui-même les redirections. La requête vers la cible d'une redirection part donc avant le contrôle ; le résultat, lui, est rejeté (`redirect-blocked`).
- **Parseur XML :** tout document contenant `<!ENTITY` ou un sous-ensemble DTD interne est refusé avant le parsing.
- **Texte des sources :** titres et extraits passent par un `DOMParser` en mode HTML, qui produit un document inerte : aucun script ne s'exécute, aucune ressource n'est chargée. On n'en garde que `textContent`, et React l'affiche comme du texte. `dangerouslySetInnerHTML` est interdit par ESLint.
- **Liens :** seuls les liens `http(s):` sont ouverts (`rel="noopener noreferrer"`).
- **CSP des pages :** `default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; img-src 'self'; connect-src https:`. Aucune image distante n'est chargée.
- **`scripts/verify-dist.mjs` contrôle chaque build :** permissions interdites, CSP, absence de secrets, d'`eval` et d'hôtes inattendus.

## Cycle de vie et robustesse

- **Fermeture du tableau de bord pendant une collecte :** chaque source est persistée dans sa propre transaction. Les données déjà écrites restent cohérentes, et la source interrompue garde son dernier état valide.
- **Après une erreur :** la source passe à `error`, `permission-needed`, `backoff` ou `interrupted`. Les erreurs 429 et 5xx déclenchent une attente croissante (1 h, 4 h, 24 h), ou celle demandée par `Retry-After` si elle est plus longue.
- **Stockage plein :** l'erreur de quota IndexedDB est traduite en message utilisateur. Le navigateur est prié de ne pas effacer les données (`navigator.storage.persist()`), et la place utilisée s'affiche dans Settings.

## Performances mesurées

Tests sur 2 000 articles synthétiques, soit le maximum chargé en mémoire, avec Vitest et jsdom :

| Opération                                    | Durée        |
| -------------------------------------------- | ------------ |
| Recherche, filtres, classement et tri        | ~115 ms      |
| Regroupement en sujets et calcul des signaux | ~0,7 à 1,7 s |
| Ingestion de 500 articles (une transaction)  | ~0,3 à 0,5 s |

Les budgets vérifiés par `tests/perf/budget.test.ts` sont de 0,5 s, 3 s et 3 s.

Voir aussi [`DATA_DICTIONARY.md`](DATA_DICTIONARY.md), [`TREND_METHOD.md`](TREND_METHOD.md) et [`SOURCE_REGISTRY.md`](SOURCE_REGISTRY.md).
