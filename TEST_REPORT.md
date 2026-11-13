# Rapport de tests

## Phase 5 — 12 novembre 2026 (livraison)

**Environnement :** Windows 11 Pro, Node.js v24.15.0, npm 11.12.1, TypeScript 5.9.3, Vite 7.3.8, Vitest 4.1.12, Playwright 1.64.1 (Chromium), @axe-core/playwright 4.14.0.

### Commandes exécutées et résultats observés

| Commande                                                    | Résultat                                                                                                                                                                              |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run check`                                             | OK. **21 fichiers, 210 tests réussis.** Build de 324,4 Kio, `permissions=[]`                                                                                                          |
| `E2E_NETWORK=1 npx playwright test`                         | **7 réussis, 1 ignoré** (le script de captures, exécuté séparément)                                                                                                                   |
| `SCREENSHOTS=1 npx playwright test e2e/screenshots.spec.ts` | Réussi : 6 captures dans `docs/screenshots/` (extension installée, données HN réelles)                                                                                                |
| `npm audit`                                                 | **0 vulnérabilité**, dépendances de développement comprises. L'alerte `minimatch` de `typescript-eslint` est corrigée par un `override` vers 11.0.8, et le lint a été vérifié ensuite |
| `npm audit --omit=dev`                                      | 0 vulnérabilité                                                                                                                                                                       |

### Audit de sécurité : constats et corrections

- **Corrigé :** « Supprimer toutes les données » ne révoquait pas les permissions d'accès aux sites déjà accordées. La suppression révoque maintenant **toutes** les origines optionnelles (test d'interface ajouté).
- **Durci :** la CSP passe de `script-src 'self'; object-src 'self'` à `default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; img-src 'self'; connect-src https:`. `verify-dist` vérifie désormais chaque directive. L'extension se charge correctement avec cette CSP (vérifié par les tests E2E).
- **Ajouté :**
  - les erreurs de quota IndexedDB, directes ou portées par une transaction annulée, deviennent un message utilisateur, aussi bien pour les actions que pour les collectes ;
  - Settings affiche l'espace de stockage utilisé, le quota et l'état de protection contre l'effacement.
- **Revu, sans changement nécessaire :**
  - aucun HTML injecté (règle ESLint) ; liens limités à `http(s):` avec `noopener noreferrer` ;
  - texte des flux rendu inerte ; entités XML rejetées ;
  - requêtes sans cookies ni referrer ; journaux sans contenu.

### Accessibilité (extension installée)

- **axe-core, règles WCAG 2.0/2.1/2.2 A et AA :** **0 violation**, en thème **clair** et **sombre**, sur la popup et les 5 onglets. Les données de démo sont chargées, et l'éditeur de catégories ainsi que tous les panneaux dépliables sont ouverts pendant l'analyse.
- **Clavier :** le lien d'évitement reçoit le focus en premier, puis les onglets. Les flèches changent d'onglet et déplacent le focus, et le focus reste visible.
- **Largeur de 360 px :** aucun défilement horizontal sur les 5 onglets.
- **Non exécuté :** test avec un lecteur d'écran réel (NVDA, VoiceOver).

### Performances (2 000 articles synthétiques)

- **Recherche, filtres, classement et tri : 611 ms → 115 ms.** Les mots-clés normalisés sont désormais mis en cache par liste de catégories.
- **Regroupement en sujets et signaux :** 0,7 à 1,7 s. **Ingestion de 500 articles :** 0,3 à 0,5 s, et la rejouer n'insère rien.
- **Budgets vérifiés à chaque exécution** (`tests/perf/budget.test.ts`) : 0,5 s, 3 s et 3 s.

### Toujours non exécuté (voir `KNOWN_LIMITATIONS.md`)

- La vraie fenêtre de permission Chrome pour un flux RSS réel : Playwright ne peut pas la piloter.
- Un lecteur d'écran réel.
- Un statut « émergent » sur données réelles : il faut au moins 3 flux RSS actualisés pendant une semaine.

## Phase 4 — 12 novembre 2026

### Commandes exécutées et résultats observés

| Commande                            | Résultat                                                                     |
| ----------------------------------- | ---------------------------------------------------------------------------- |
| `npm run check`                     | OK. **19 fichiers, 203 tests réussis.** Build de 322,6 Kio, `permissions=[]` |
| `E2E_NETWORK=1 npx playwright test` | **3 tests sur 3 réussis** sur l'extension installée (aucune régression)      |

### Nouveaux tests (données synthétiques signalées comme telles, horloge fixe)

- **Tokenisation :** accents, mots vides FR/EN, numéros de version, pluriels simplifiés.
- **Calibration** (`tests/fixtures/timelines/title-pairs.json`, `"synthetic": true`) : **6 paires sur 6** regroupées, dont des paires en français ; **8 paires sur 8** gardées séparées (termes génériques, homonymes « Mercury », versions différentes, même entreprise sur des sujets différents).
- **Regroupement :**
  - libellé = titre réel d'un article du sujet ;
  - origines et sources distinctes ; termes communs ;
  - **résultat indépendant de l'ordre** (3 permutations) ;
  - **aucun sujet géant** formé à partir de termes génériques ;
  - **ancrage sur la graine** (une chaîne A~B~C ne fusionne pas les trois) ;
  - chaînage temporel : un sujet couvert tous les 2 jours reste un seul sujet, un écart de plus de 72 h le coupe en deux ;
  - un agrégateur compte comme une seule origine.
- **Couverture :**
  - union d'intervalles ; 3 flux requis ; profondeur insuffisante détectée ;
  - les collectes quotidiennes se cumulent, un trou de 2 jours casse la couverture ;
  - collectes en échec, Hacker News et démo ignorés.
- **Signaux :**
  - aucun historique → données insuffisantes, même avec 4 articles ;
  - référence vide, 3 articles et 3 origines → émergent, **ratio 18** ;
  - une seule source qui se répète → jamais émergent ;
  - 2 articles à quelques heures d'écart → pas une tendance ;
  - seuil inclusif à 3, et 2,25 → refusé avec le code de raison ;
  - articles sans date exclus et comptés à part ; date future ignorée ;
  - récurrent : 3 jours et 2 origines, sans exigence de couverture.
- **Interface :**
  - sans couverture : sujet affiché comme « données insuffisantes », avec l'explication « 0/3 flux » ;
  - avec couverture : « Émergent », avec le ratio, les origines et les 3 articles liés.

### Contrôle avec données réelles

- `dist/` servi en local (Chromium), Hacker News actualisé (30 articles), onglet Topics ouvert. Résultat : **1 sujet réel regroupé** (2 articles HN sur le même sujet), affiché « **Signal indisponible — données insuffisantes** », avec une couverture de 0 flux sur 3, puisque Hacker News ne compte pas. C'est le comportement attendu : aucun signal fabriqué.
- **Non exécuté :** un statut « émergent » sur données réelles. Il faudrait au moins 3 flux RSS réels actualisés sur une semaine. Cette preuve reste à constituer à l'usage, et ne sera pas simulée.

## Phase 3 — 12 novembre 2026

**Environnement :** identique aux phases précédentes, plus `@playwright/test` 1.64.1 avec son Chromium.

### Commandes exécutées et résultats observés

| Commande                                                     | Résultat                                                                                       |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `npm run check` (typecheck, lint, tests, build, verify-dist) | OK. **16 fichiers, 163 tests réussis.** Build de 309,4 Kio, `permissions=[]`                   |
| `E2E_NETWORK=1 npx playwright test`                          | **3 tests sur 3 réussis**, sur l'**extension chargée dans Chromium** (`--load-extension=dist`) |

### Tests de bout en bout sur l'extension installée (premiers tests en conditions réelles)

1. **Chargement de l'extension :** elle se charge sans permission obligatoire (`permissions`, `host_permissions` et `permissions.getAll().origins` sont vides). La popup affiche « Configuration requise ». Son bouton ouvre `chrome-extension://<id>/dashboard.html`, ce qui valide `chrome.tabs.create` sans la permission `tabs`.
2. **Persistance après redémarrage complet du navigateur** (même profil, contexte fermé puis relancé) : favori, état lu, correction manuelle de catégorie et réglage de rétention (45 jours) sont toujours là.
3. **Hacker News avec l'API réelle, depuis l'origine `chrome-extension://` :** une collecte stocke entre 1 et 30 articles. La seconde reconnaît les articles déjà présents (moins de nouveaux que d'articles connus). Aucune permission d'hôte n'a été demandée ni accordée.

### Nouveaux tests unitaires et d'intégration

- **Classification :**
  - mots entiers, sans tenir compte des accents ni de la casse (« reaction » ne correspond pas à `react`) ;
  - expressions de plusieurs mots ; mots-clés avec ponctuation (`node.js`) ;
  - plusieurs catégories, triées dans l'ordre des catégories, avec les mots-clés qui les justifient ;
  - prise en compte de l'extrait ; exclusions (`steve jobs`) ;
  - catégories héritées de la source, sans identifiant inconnu ;
  - une correction manuelle remplace tout le calcul ; résultat déterministe.
- **Recherche et filtres :**
  - « publiés aujourd'hui » se calcule sur la journée locale de Toronto (une publication à 06:00Z compte pour aujourd'hui, une à 04:30Z non) ;
  - « découverts aujourd'hui » est indépendant de « publiés aujourd'hui » ;
  - les articles sans date ne sont jamais inclus dans les filtres de publication, mais restent listables avec « Date inconnue » ;
  - la fenêtre « 7 jours » couvre 7 jours locaux ;
  - filtres par catégorie, source, favori et lecture, combinés en ET ;
  - recherche sans accents sur le titre, la source, le domaine et la catégorie.
- **Tri :** reproductible (égalités départagées par identifiant) ; articles sans date en dernier pour le tri par publication ; tri alphabétique selon la langue.
- **Catégories :**
  - création avec identifiant unique, insérée avant « Unclassified », doublon refusé ;
  - renommage, modification des mots-clés et masquage ; identifiant non modifiable ;
  - la suppression d'une catégorie personnalisée la retire des corrections, des sources et des articles en une seule transaction ; les catégories intégrées ne peuvent pas être supprimées ;
  - une correction manuelle n'affecte pas l'état favori.
- **Interface :**
  - recherche avec compteur « N sur M » ; filtre par catégorie ;
  - « Date inconnue » ; état vide expliqué et réinitialisation ;
  - explication « Pourquoi ces catégories ? » ;
  - correction manuelle, puis retour au classement automatique ;
  - nouvelle catégorie appliquée immédiatement ; catégorie masquée absente des cartes et des filtres.

### Toujours non exécuté

- **Fenêtre de permission Chrome réelle** pour un flux RSS : Playwright ne peut pas cliquer dans cette fenêtre du navigateur. Le parcours est couvert par les tests d'interface avec une permission simulée. **À tester à la main** : ajouter un vrai flux, accepter, puis révoquer depuis `chrome://extensions`.
- **Lecteur d'écran.**

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
