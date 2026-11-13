# Rapport de tests

## Phase 2 — 12 novembre 2026

**Environnement :** identique à la phase 1, plus `@types/node` 24.19.2 (tests uniquement).

### Commandes exécutées et résultats observés

| Commande                        | Résultat                                                                                                                           |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`             | OK, 0 erreur                                                                                                                       |
| `npm run lint`                  | OK, 0 erreur (une exception `no-control-regex` justifiée dans `src/domain/text.ts`)                                                |
| `npm test`                      | **12 fichiers, 132 tests, tous réussis**                                                                                           |
| `npm run build` + `verify-dist` | OK : 293,1 Kio, `permissions=[]`, aucun hôte inattendu (ajout autorisé : `news.ycombinator.com`, utilisé seulement pour des liens) |

### Nouveaux tests

- **Client réseau :**
  - aucun cookie ni referrer envoyé ;
  - encodage Latin-1 déclaré dans le prologue XML ;
  - refus de http ;
  - erreurs 401, 403, 404 et 500 → `http` avec le code HTTP ;
  - 429 et `Retry-After` (secondes ou date, plafonné à 7 jours) ;
  - page HTML refusée (`invalid-content-type`) ;
  - taille : par `Content-Length`, puis en cours de lecture (lecture interrompue après moins de 20 blocs) ;
  - délai dépassé, annulation par l'utilisateur ;
  - permission manquante distinguée d'une panne réseau ;
  - redirection vers une origine non autorisée ou vers http bloquée.
- **Parseur :**
  - RSS 2.0, RSS 1.0 (RDF, Latin-1) et Atom (`xml:base`, liens `alternate`, titre xhtml, date de mise à jour seule) ;
  - HTML et `<script>` retirés des titres et extraits ; contenu complet jamais stocké ;
  - liens relatifs résolus ; éléments sans titre, sans lien ou en `javascript:` ignorés ;
  - troncature à `maxItems`.
- **Documents hostiles :** XXE et « billion laughs » rejetés avant parsing ; XML invalide, HTML et RSS sans channel refusés.
- **Dates :**
  - RFC 822 avec décalage, EST/EDT, année sur 2 chiffres, ISO avec fuseau ;
  - aucune devinette si le fuseau est absent ou inconnu, si la date est impossible (30 février), future ou antérieure à 1995.
- **URL canoniques :**
  - paramètres de suivi retirés (`utm_*`, `fbclid`…) ;
  - paramètres utiles, leur ordre, la casse du chemin, la barre finale et `www.` conservés.
- **Hacker News :**
  - éléments `deleted`, `dead`, commentaires et éléments sans titre ignorés ;
  - publication sans URL → lien vers la discussion HN ;
  - URL `javascript:` remplacée par la discussion ;
  - plafond de 30 éléments (31 requêtes pour 500 identifiants) ;
  - un élément en erreur 500 ne fait pas échouer la collecte ; un 429 interrompt la collecte.
- **Ingestion :**
  - **même collecte rejouée 3 fois → 3 articles, 0 doublon** ;
  - fusion par URL canonique entre deux sources, avec les deux provenances conservées ;
  - premier titre et première date conservés ; titres identiques avec des URL différentes **non** fusionnés ;
  - une date manquante est complétée plus tard ; lu et favori jamais modifiés ;
  - métriques horodatées.
- **Collecte :**
  - une source en erreur 500 n'empêche pas les autres et garde ses données ;
  - permission absente → aucune requête ;
  - pause après 429 qui respecte `Retry-After`, puis source ignorée ;
  - sources désactivées et démo ignorées ;
  - un flux invalide n'est pas enregistré ;
  - permission refusée → source « permission requise », jamais contactée ;
  - la suppression d'une source garde les favoris ;
  - Hacker News ne peut être ajouté qu'une fois.
- **Interface :**
  - ajout d'un flux, permission accordée pour cette seule origine, articles affichés ;
  - refus de permission ; refus d'une URL http sans demande de permission ;
  - échec d'actualisation : message d'erreur par source, avertissement « données potentiellement périmées », articles toujours visibles ;
  - suppression confirmée qui révoque la permission ;
  - ajout de Hacker News.

### Contrôle avec données réelles (partiel)

- **Exécuté (Chromium via Playwright, `dist/` servi sur `localhost`) :** ajout de Hacker News, puis « Actualiser » → **30 nouveaux, 0 déjà connu**. Deuxième « Actualiser » → **0 nouveau, 30 déjà connus** (idempotence vérifiée avec l'API réelle). Les cartes affichent la source, le domaine, la date de publication HN, la date de découverte et « Signal HN : N points sur Hacker News (relevé …) ».
- **Non exécuté :**
  - ajout d'un **vrai** flux RSS : depuis `localhost`, hors extension, le CORS bloque la requête. C'est attendu : seule l'extension installée, avec la permission d'hôte, peut le faire ;
  - dialogue de permission Chrome réel, accepté puis révoqué ;
  - installation via `chrome://extensions`.

  Ces trois tests manuels sont à faire dans Chrome.

## Phase 1 — 12 novembre 2026

**Environnement :** Windows 11 Pro, Node.js v24.15.0, npm 11.12.1, TypeScript 5.9.3, Vite 7.3.8, Vitest 4.1.12 (jsdom 26, fake-indexeddb 6.2.8).

### Commandes exécutées et résultats observés

| Commande                       | Résultat                                                                                                                                                                                                   |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`            | OK, 0 erreur                                                                                                                                                                                               |
| `npm run lint`                 | OK, 0 erreur, 0 avertissement                                                                                                                                                                              |
| `npm test`                     | **5 fichiers, 51 tests, tous réussis**                                                                                                                                                                     |
| `npm run build`                | OK : `dist/` = 11 fichiers, 262,6 Kio                                                                                                                                                                      |
| `node scripts/verify-dist.mjs` | OK : `permissions=[]`, `optional_host_permissions=["https://*/*"]`, CSP stricte, ni secret, ni `eval`, ni hôte externe inattendu                                                                           |
| `npm audit`                    | 1 alerte **modérée**, dépendance de **développement** uniquement (`minimatch` via `typescript-eslint`, ReDoS). Absente du bundle livré. Correctif proposé par npm = rétrogradation cassante, non appliquée |

### Couverture des tests automatisés

- **Schémas :** dates ISO UTC obligatoires ; refus de `javascript:`/`data:` ; une qualité temporelle `unknown` interdit `publishedAt` ; `sourceIds` cohérent avec la provenance ; un extrait exige son origine ; `firstSeenAt` ≤ `lastSeenAt` ; flux en https uniquement.
- **Dates :** un article sans date n'entre jamais dans une fenêtre de publication ; un article ancien découvert aujourd'hui est « découvert » mais pas « publié aujourd'hui » ; minuit local et minuit UTC pour Toronto ; journées de 23 h et de 25 h aux changements d'heure (08/03/2026 et 01/11/2026).
- **URL :** https uniquement pour les flux ; identifiants dans l'URL refusés ; liens sortants en http(s) uniquement, y compris contre `JaVaScRiPt:`.
- **IndexedDB :** migration v1 (stores et catégories par défaut) ; persistance après réouverture ; validation en écriture ; enregistrements corrompus ignorés et comptés ; unicité de l'URL canonique ; tri reproductible.
- **État utilisateur :** une réécriture de l'article (simulant un rafraîchissement) ne modifie ni lu ni favori ; état refusé pour un article inexistant.
- **Rétention et suppression :** la purge conserve les favoris et supprime les liens associés ; effacer l'historique conserve les favoris ; la suppression totale réinitialise les catégories ; la démo se charge 3 fois sans doublon et se retire sans toucher aux vraies données.
- **Interface :** état « Configuration requise » sans contenu fictif ; navigation clavier des onglets (ARIA) ; Topics affiche « historique insuffisant » ; dates distinctes et provenance ; HTML dans les titres rendu comme texte inerte ; favori persistant ; démo chargée uniquement sur demande, avec badge ; suppression totale soumise à confirmation.

### Contrôle dans un navigateur réel (partiel)

- **Exécuté :** `dist/` servi par `vite preview` et ouvert dans Chromium (Playwright). Démo chargée, onglets parcourus, rendu vérifié à 1040 px et 375 px. Le rendu étroit a révélé un défilement horizontal des onglets et un retour à la ligne de « Source : », tous deux corrigés.
- **Seule erreur console :** `favicon.ico` 404, propre au serveur de prévisualisation et sans objet dans l'extension.
- **Non exécuté :** chargement de `dist/` comme **extension** via `chrome://extensions`, popup et `chrome.tabs.create`, persistance après redémarrage de Chrome. C'est à faire manuellement ; l'automatisation n'était pas disponible dans cet environnement.
- **Non exécuté :** lecteur d'écran.
