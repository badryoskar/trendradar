# Dictionnaire des données

- **Base :** IndexedDB `trendradar`, **schéma v1**, dans l'origine `chrome-extension://<id>`.
- **Format des dates :** toutes au format ISO 8601 UTC (`…Z`), vérifié par zod. L'heure locale n'est produite que par l'interface.
- **Validation :** chaque enregistrement est validé par zod (`src/domain/content.types.ts`) à l'écriture et à la lecture ; un enregistrement invalide est ignoré et compté.

## Magasins (object stores)

| Store                                         | Clé                              | Index                                                                                  | Contenu                                                                                                                                                                                                   |
| --------------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sources`                                     | `id`                             | —                                                                                      | `Source` : type (`hacker-news` ou `feed`), URL https, origine, format détecté, `enabled`, `health`, dates de dernière tentative, succès et erreur, code d'erreur, `backoffUntil`, `categoryIds`, `isDemo` |
| `articles`                                    | `id` (FNV-1a de l'URL canonique) | `byCanonicalUrl` (unique), `byPublishedAt`, `byFirstSeenAt`, `bySourceId` (multiEntry) | `Article` (ci-dessous)                                                                                                                                                                                    |
| `sourceItems`                                 | `[sourceId, externalId]`         | `byArticleId`                                                                          | Correspondance entre l'identifiant d'un élément dans sa source et l'article (première règle de déduplication)                                                                                             |
| `userState`                                   | `articleId`                      | —                                                                                      | `isSaved`/`savedAt`, `isRead`/`readAt`, `categoryOverride`                                                                                                                                                |
| `fetchAttempts`                               | auto-incrémentée                 | `bySourceId`, `byStartedAt`                                                            | Journal des collectes : succès, nombres récupérés et insérés, `oldestItemPublishedAt` (sert à la couverture), code d'erreur, statut HTTP, `retryAfter`                                                    |
| `categories`                                  | `id`                             | —                                                                                      | Libellé, mots-clés, exclusions, `isCustom`, `hidden`, ordre                                                                                                                                               |
| `meta`                                        | `key`                            | —                                                                                      | `schemaVersion`, `settings` (rétention, conservation des favoris, accueil vu)                                                                                                                             |
| `clusters`, `trendSignals`, `dedupCandidates` | —                                | —                                                                                      | Réservés par le schéma v1, **inutilisés** : sujets et signaux sont recalculés à l'affichage                                                                                                               |

## Article : dates et provenance

| Champ                        | Sens                                                                                                                                             | Invariant                                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `publishedAt?`               | Date de publication **déclarée par la source**                                                                                                   | Absente si la source n'en donne pas ou si elle est ambiguë (fuseau absent, date impossible ou future) |
| `updatedAt?`                 | Date de mise à jour déclarée (Atom `updated`)                                                                                                    | —                                                                                                     |
| `temporalQuality`            | `source-published`, `source-updated` ou `unknown`                                                                                                | `unknown` ⇔ ni `publishedAt` ni `updatedAt`                                                           |
| `firstSeenAt`                | Première collecte par TrendRadar                                                                                                                 | ≤ `lastSeenAt` ; **ne remplace jamais** `publishedAt`                                                 |
| `lastSeenAt`                 | Dernière présence dans un flux                                                                                                                   | —                                                                                                     |
| `fetchedAt`                  | Dernière collecte qui a renvoyé l'article                                                                                                        | —                                                                                                     |
| `provenance[]`               | Une entrée par source : `sourceId`, `externalId`, `originalUrl`, première et dernière observation, `metrics` horodatées (par exemple `hn.score`) | Jamais écrasée : une nouvelle source **ajoute** une entrée                                            |
| `sourceIds`                  | Dérivé de `provenance` (index)                                                                                                                   | Égal à l'ensemble des `provenance.sourceId` (vérifié par zod)                                         |
| `autoCategories`             | Catégories héritées des sources                                                                                                                  | Les catégories effectives viennent de `classify.ts`, sauf correction manuelle (`categoryOverride`)    |
| `excerpt?` / `excerptOrigin` | Extrait fourni par le flux, texte brut, 400 caractères maximum                                                                                   | Pas d'extrait sans origine ; le contenu complet n'est jamais stocké                                   |

## Déduplication (`persistence/ingest.ts`)

1. La paire `(sourceId, externalId)` est déjà connue → même article.
2. Même URL canonique : schéma et hôte en minuscules, port par défaut, fragment, identifiants et paramètres de suivi (`utm_*`, `fbclid`…) retirés ; les autres paramètres, leur ordre, la casse du chemin, la barre finale et `www.` sont conservés → même article, avec une provenance ajoutée.
3. Sinon → nouvel article.

Les titres similaires ne sont **jamais fusionnés** : ils sont seulement regroupés en sujets, et c'est réversible. Rejouer
une collecte est idempotent, et l'état lu ou favori n'est jamais modifié par l'ingestion.

## Migrations, suppression, rétention

- Les migrations sont ordonnées et ne se modifient jamais une fois publiées (`MIGRATIONS[n]` fait passer de n−1 à n) ; une version future ajoutera une entrée.
- **Rétention :** suppression des articles dont `firstSeenAt` est plus ancien que N jours (30 par défaut), sauf les favoris ; l'état utilisateur et les correspondances `sourceItems` partent dans la même transaction.
- **Suppression d'une source :** ses articles sont supprimés, sauf les favoris, et les articles partagés perdent seulement sa provenance ; la permission d'origine est révoquée si plus aucune source ne l'utilise.
- **Suppression d'une catégorie personnalisée :** elle est retirée des corrections manuelles, des sources et des articles, en une seule transaction.
- **Suppression totale :** tous les magasins sont vidés, les catégories par défaut restaurées et **toutes les permissions d'origine révoquées**.
- **Désinstallation :** Chrome efface la base de l'origine de l'extension.
