# Registre des sources

Statuts : **approved** (intégrée), **conditional** (autorisée sous conditions vérifiées au cas par cas), **disabled** (non intégrée).
L'absence de droit explicite n'est jamais compensée par une astuce technique (proxy, scraping, contournement).

Dernière vérification : **12 novembre 2026**.

| Source                                  | Statut          | Référence                                                                            | Méthode                                                             | Permissions Chrome                                                     | Quotas                                                                                                                       | Données conservées                                                               |
| --------------------------------------- | --------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Hacker News                             | **approved**    | https://github.com/HackerNews/API                                                    | API Firebase officielle v0, `topstories.json` puis `item/<id>.json` | Aucune (CORS permissif observé)                                        | Aucune limite documentée (« no rate limit ») ; TrendRadar se limite à 30 éléments, 6 requêtes simultanées, collecte manuelle | Titre, URL, date, auteur, score, nombre de commentaires                          |
| Flux RSS/Atom ajoutés par l'utilisateur | **conditional** | Conditions propres à chaque éditeur                                                  | HTTPS uniquement, flux fourni par l'éditeur                         | Permission optionnelle limitée à l'origine du flux, demandée à l'ajout | 50 éléments, 2 Mo, délai de 15 s par collecte ; pause après 429/5xx                                                          | Titre, URL, dates, auteur, extrait fourni par le flux (tronqué à 400 caractères) |
| Reddit                                  | **disabled**    | https://support.reddithelp.com/hc/en-us/articles/16160319875092-Reddit-Data-API-Wiki | —                                                                   | —                                                                      | —                                                                                                                            | —                                                                                |
| Product Hunt                            | **disabled**    | https://www.producthunt.com/v2/docs                                                  | —                                                                   | —                                                                      | —                                                                                                                            | —                                                                                |
| Google Trends                           | **disabled**    | https://developers.google.com/search/apis/trends                                     | —                                                                   | —                                                                      | —                                                                                                                            | —                                                                                |

## Hacker News

- **Finalité :** proposer une source de démarrage documentée.
- **Constats de l'audit (12/11/2026) :**
  - `topstories` renvoie jusqu'à 500 identifiants (test réel : 500).
  - Le README annonce « There is currently no rate limit ».
  - Le dépôt de documentation est sous licence MIT ; aucune condition d'utilisation spécifique à l'API n'est publiée.
  - Les réponses renvoient `access-control-allow-origin` égal à l'origine de l'appelant (observé avec curl, non documenté).
- **Garde-fous :**
  - Le score est stocké comme métrique `hn.score` de la source et affiché « Signal HN : N points sur Hacker News (relevé à H) ». Il n'est jamais présenté comme une popularité générale ni mélangé au volume RSS.
  - Les éléments `deleted`, `dead`, les commentaires et les éléments sans titre sont ignorés.
  - Les publications sans URL externe (Ask HN) pointent vers la discussion HN ; aucune URL n'est inventée.
  - Le texte des publications et les commentaires (contenu des utilisateurs) ne sont pas importés.
- **Retrait :** supprimer la source dans l'onglet Sources efface ses articles (sauf les favoris).
- **Risques :**
  - L'API est en version v0 : sa compatibilité ascendante n'est pas garantie.
  - Le CORS permissif n'est pas un engagement documenté. S'il disparaît, la source passera en erreur `permission` ou `network`, sans aucun contournement.

## Flux RSS/Atom

- **Responsabilité :** l'utilisateur n'ajoute que des flux dont l'éditeur autorise l'usage. TrendRadar n'embarque aucune liste de flux.
- **Méthode :**
  - L'URL doit être en https et sans identifiants.
  - Chrome demande l'accès à cette seule origine (`chrome.permissions.request`), au moment du clic.
  - Une collecte de test bornée a lieu avant l'enregistrement : un flux invalide n'est pas stocké.
  - Si l'accès est refusé, la source est enregistrée comme « permission requise » et n'est jamais interrogée.
- **Attribution :** chaque article affiche sa source, le domaine de l'éditeur et un lien vers la publication d'origine.
- **Conservation :**
  - Seul l'extrait (`description` ou `summary`) est conservé, converti en texte et tronqué à 400 caractères.
  - Le contenu complet (`content`, `content:encoded`) n'est jamais stocké.
  - La rétention est configurable ; la suppression de la source efface ses données et révoque la permission d'origine si aucune autre source ne l'utilise.
- **Redirections :** une redirection vers une autre origine non autorisée, ou vers http, est refusée (`redirect-blocked`).
- **Limite :** la requête vers la cible de la redirection est déjà partie au moment du contrôle.
- **Sécurité :** les documents contenant des déclarations d'entités ou un sous-ensemble DTD interne sont rejetés avant le parsing.

## Sources désactivées

- **Reddit :** la page officielle a renvoyé 403 lors de l'audit, donc les conditions n'ont **pas été vérifiées**. Selon des sources tierces : OAuth obligatoire, approbation manuelle, environ 100 requêtes par minute, usage commercial sous contrat. Une extension sans backend ne peut pas protéger un secret OAuth confidentiel.
- **Product Hunt :** jeton obligatoire. La documentation indique que l'API « must not be used for commercial purposes » sans accord, et un secret ne peut pas être embarqué dans le client.
- **Google Trends :** l'API est en alpha, accessible sur candidature uniquement. Aucune API non officielle n'est utilisée.

Toute réactivation exige une nouvelle vérification documentée et une validation explicite.
