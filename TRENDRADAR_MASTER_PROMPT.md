# TRENDRADAR — MASTER PROMPT POUR CLAUDE CODE

> **Cahier des charges et prompt d'exécution autonome — 11 novembre 2026.**
> **Projet indépendant :** TrendRadar, extension Google Chrome Manifest V3 d'agrégation d'actualités et de veille thématique. **Commence par l'audit du dépôt et un plan soumis à validation ; n'écris aucun code et n'installe aucune dépendance avant l'accord explicite de l'utilisateur.** Les étapes de développement ultérieures exigent elles aussi une validation à chaque jalon.

## 0. Ton rôle et l'objectif du produit

Agis comme **Senior Chrome Extension Engineer, TypeScript Architect, Data Engineer, Product Manager technique et QA Lead**. Tu interviens dans le dépôt réellement ouvert, potentiellement non vide. Ne présume ni les dépendances disponibles ni le droit d'accès aux sources externes. Recherche et vérifie les documentations officielles pertinentes pendant la phase d'audit.

**Problème :** l'utilisateur souhaite centraliser des actualités dans plusieurs domaines — technologie, développement web, WordPress/PHP, IA, cybersécurité, startups, économie, SEO, design, emploi, actualité générale et catégories personnalisées — sans parcourir chaque jour de nombreux sites. Il veut distinguer **nouveauté, récurrence, émergence et crédibilité**, conserver les articles utiles, et pouvoir justifier l'architecture de cette extension dans un portfolio technique destiné notamment à des recruteurs canadiens.

**Valeur centrale :** une veille **local-first**, contrôlable, traçable, sans fausse promesse de « temps réel » ni d'intelligence prédictive. Les sujets sont toujours reliés à leurs publications et dates d'origine. La fonction « tendance » n'a de sens que lorsqu'il existe assez d'observations indépendantes dans le temps.

**Sortie finale :** extension Chrome installable, build de production reproductible, code TypeScript typé, tests réels, README, documentation de connecteurs et d'algorithmes, jeu de démonstration explicitement identifié et liste honnête des limites. Il ne s'agit pas d'une maquette.

## 1. Public cible, besoins et indicateurs

### Personnes utilisatrices

1. **Professionnel en veille** : configure sources/catégories, consulte un digest et sauvegarde des liens.
2. **Développeur WordPress/PHP** : suit technologies et marché de l'emploi avec recherche et filtres.
3. **Créateur/analyste de contenu** : cherche à voir des thèmes récurrents, à lire les sources primaires et à éviter les articles périmés.
4. **Utilisateur attaché à la transparence** : veut comprendre d'où vient le contenu et comment est produit un signal de tendance.

### Jobs-to-be-done

- Ajouter des flux RSS/Atom **autorisés** et consulter une source de démarrage documentée (Hacker News, si l'API est disponible et conforme à la date de l'audit).
- Rafraîchir explicitement les flux, visualiser les échecs et l'heure de la **dernière collecte réussie**.
- Consulter articles récents, recherche, catégories, favoris et historique de lecture local.
- Retrouver les références originales et voir clairement `publishedAt` (source) et `fetchedAt` (collecte) sans les confondre.
- Identifier des **sujets récurrents ou potentiellement émergents** uniquement lorsqu'un historique et des preuves suffisants sont disponibles ; sinon afficher « données insuffisantes ».
- Comprendre pourquoi un sujet est signalé (fenêtres de comparaison, nombre d'articles, diversité de sources, dates, règles calculées).

### Mesures de succès vérifiables

- Rafraîchissement idempotent : deux collectes d'un même article n'ajoutent pas deux entrées.
- Une source défaillante ne bloque ni le tableau de bord ni les autres sources.
- Tous les articles affichent une provenance et un lien source ; les dates absentes restent explicitement inconnues.
- Sauvegardes, paramètres et lectures persistent après relance Chrome.
- Les erreurs réseau, HTTP, parsing, quota, permissions et délais sont visibles et testables.
- Aucun score de tendance sans preuve minimale ni « popularité » fabriquée à partir de la simple nouveauté.

## 2. Décisions produit et périmètre MVP **fermé**

### MVP à livrer

**A. Collecte et connecteurs**

- Connecteur **Hacker News officiel** pour un sous-ensemble borné de `topstories`/`newstories`, après validation de la documentation/API ; afficher le score HN uniquement comme **signal HN** avec son origine, jamais comme intérêt général sur le web.
- Connecteur **RSS/Atom configurable** : ajout utilisateur d'URL HTTPS, édition/suppression/désactivation, validation de l'URL et permission d'hôte demandée à l'action requise. Tester uniquement avec des flux dont l'usage est permis, et documenter licence, attribution et limites. Ne pas embarquer une liste de flux non vérifiés.
- Contrat `SourceConnector` extensible ; connecteurs indépendants, pagination/limites raisonnables, protection contre l'échec partiel, timeout, backoff et journal de statut minimal.
- Rafraîchissement **manuel à la demande** dans le MVP. Aucun collecteur permanent ni promesse de mise à jour hors ligne. L'actualisation planifiée via `chrome.alarms` est une évolution distincte, non implicite.
- Importer seulement les éléments nécessaires et autorisés (titre, URL, date, auteur/source si permis, extrait si fourni par le flux, métadonnées de score propres à l'API). Ne pas télécharger automatiquement le texte intégral d'articles payants ou soumis à copyright.

**B. Normalisation, historique et déduplication**

- Normaliser URLs, dates, titres, langue déclarée si disponible, catégorie/source, liens canoniques et métadonnées minimales.
- Dédupliquer d'abord par **identifiant stable de la source** et URL canonique, puis générer des **candidats** de similarité de titre/liens sans fusion irréversible ; conserver toutes les provenances d'un même article.
- Historique local structuré ; enregistrer pour chaque article `publishedAt?: string` et `firstSeenAt`, `lastSeenAt`, `fetchedAt` séparément. Un article sans date de publication ne doit jamais être étiqueté « aujourd'hui » sur la seule base de la collecte.
- Maintenir la santé des sources : dernier succès, dernier échec, erreur affichable, compteur, date/heure de tentative, éventuel backoff.
- Prévoir une politique de rétention configurable, suppression manuelle et purge sans perte des favoris par défaut ; documenter le volume et les limites de stockage.

**C. Catégories, exploration et lecture**

- Catégories de départ : Technology, Web Development, WordPress/PHP, AI, Cybersecurity, Startups, Business/Economy, Marketing/SEO, Design, Jobs, General ; utilisateurs pouvant ajouter, renommer, masquer ou supprimer les catégories personnelles.
- Classement déterministe simple par mots-clés explicites et règles configurables ; un article peut avoir plusieurs catégories ; permettre correction manuelle et catégorie « Unclassified ».
- Tableau de bord d'extension plein format : `Latest`, `Topics`, `Saved`, `Sources`, `Settings` (ou information architecture équivalente démontrée par le PM/UX). Une popup concise peut ouvrir ce tableau de bord.
- Recherche par titre/source/catégorie, filtres par date de publication **connue**, date de collecte, domaine/source et statut sauvegardé ; tri défini et reproductible.
- Favoris, lu/non lu, historique de consultation **uniquement lors des actions dans l'extension**, possibilité d'effacer l'historique. **Ne pas** utiliser l'historique du navigateur.
- Ouvrir les liens dans l'onglet à l'action de l'utilisateur, avec validation de schémas `https:`/`http:` autorisés ; protection contre les URL `javascript:`/`data:`.

**D. Sujets récurrents et signaux de tendance modestes mais réels**

- Regroupement de titres proches avec méthode **déterministe, transparente et testée** (normalisation, tokenisation, stopwords versionnés, similarité bornée ; prise en charge initiale documentée de l'anglais et du français si les fixtures le prouvent).
- Afficher `TopicCluster` : titre représentatif non inventé, articles liés, sources distinctes, période observée, nombre d'articles, raisons du regroupement.
- **Tendance émergente** : n'afficher ce libellé que si les seuils d'historique et de variété de sources sont atteints. Un signal doit comparer des fenêtres temporelles non vides et suffisamment représentées ; exposer valeur de référence, valeur récente, diversité, volume et règle appliquée. Si la comparaison n'est pas possible : « signal indisponible — historique insuffisant ».
- Résumés MVP : **pas de paraphrase automatique prétendant représenter un article complet**. Afficher l'extrait fourni/licencié par la source, étiqueté « extrait du flux », et une synthèse des **métadonnées observées** pour les clusters (articles, sources, période). Les résumés éditoriaux/IA de contenus complets sont hors MVP.
- Les zones « tendances du jour », « tendances de la semaine » et « émergentes » doivent expliciter leur fenêtre et leur couverture de données, et présenter un état vide informatif plutôt que de faux résultats.

**E. Sécurité, qualité et présentation**

- Interface accessible (clavier, focus, texte alternatif pertinent, contrastes WCAG AA visés, messages non dépendants de la couleur), responsive et utilisable sans connexion à un service payant.
- États de chargement et d'erreur détaillés, source inactive, flux invalide, absence d'accès réseau, absence de permission, données vides, aucun résultat filtré.
- Attribution/lien d'origine systématique ; pas de bannière ni de contenus publicitaires intégrés par défaut.

### Hors MVP — ne pas développer sans nouvelle validation

- Connecteurs Reddit, Product Hunt ou Google Trends, sauf si **autorisation, quotas, CORS, flux d'authentification et conditions de publication** sont vérifiés, documentés et approuvés dans une phase ultérieure.
- Backend, proxy distant, compte utilisateur, authentification sociale, synchronisation multiappareils, collecte centralisée.
- Scraping de Google Search, de réseaux sociaux, paywalls ou sites de presse, crawling de pages HTML, contournement anti-bot.
- IA générative, synthèses de contenus payants/complets, analyse de sentiment, « fact checking » automatique, prédiction de viralité, notifications et alarmes récurrentes.
- Scoring global de crédibilité, notation de vérité des médias, classement unique qui confond vote, fraîcheur et fiabilité.
- Extension Safari/Firefox, traduction automatique, extension mobile.

## 3. Matrice initiale des sources et conformité (audit obligatoire)

| Source | Position MVP | Canal | Risque / garde-fou |
|---|---|---|---|
| **Hacker News** | Oui, après test réel | API publique Firebase officielle | Données propres à HN, limites réelles à revérifier, pas d'interprétation de score universel |
| **RSS/Atom** | Oui, source par source | URL HTTPS ajoutée par l'utilisateur | CORS, permission d'hôte Chrome, publication et licence, format imparfait, ne pas afficher le flux complet sans droit |
| **Reddit** | Non | Data API OAuth sous accès/conditions | Accès et approbation, consentement, limites/effacement du contenu supprimé, interdiction d'extraction non autorisée |
| **Product Hunt** | Non | API GraphQL, token | Conditions d'usage notamment commerciales, autorisation d'API, quotas et secrets OAuth |
| **Google Trends** | Non | API alpha / autre accès autorisé | Disponibilité restreinte, accès non garanti ; aucune API « non officielle » présumée stable |
| **Médias généralistes** | Via flux autorisés seulement | RSS/Atom officiel ou API contractuelle | Licence, attribution, limites de reproduction, blocages réseau |

Références à vérifier, au minimum :

- HN API : https://github.com/HackerNews/API
- Reddit Data API : https://support.reddithelp.com/hc/en-us/articles/16160319875092-Reddit-Data-API-Wiki
- Reddit Responsible Builder Policy : https://support.reddithelp.com/hc/en-us/articles/16471395473812-Moderation-Bots-Tooling
- Product Hunt API : https://www.producthunt.com/v2/docs
- Google Trends API : https://developers.google.com/search/apis/trends

**Obligation :** rédiger `SOURCE_REGISTRY.md` lors du projet avec statut `approved / conditional / disabled`, URL de référence, date de vérification, domaine, finalité, méthode, permissions, quotas, licence, contraintes de conservation, mécanisme de retrait. L'absence de droit explicite ne peut pas être compensée par une astuce technique.

## 4. Stack et architecture de référence

**Stack proposée**, à justifier pendant l'audit : Manifest V3, TypeScript `strict`, React, Vite et packaging MV3 compatible, Vitest, React Testing Library, ESLint, Prettier, tests E2E Chrome si environnement adapté. Aucune dépendance ajoutée pour le seul effet de mode.

**Stockage :** IndexedDB dans l'origine de l'extension pour les articles, clusters, bookmarks, états de lecture et historique ; `chrome.storage.local` pour préférences légères et registre de sources. Si un seul mécanisme simplifie le projet sans compromettre volumétrie/migrations, l'architecte peut l'argumenter. Prévoir migrations, erreurs de quota, exports futurs et suppression des données.

**Réseau :** effectuer le `fetch` depuis le service worker ou une page d'extension, pas depuis un content script hérité des règles CORS du site. Justifier `host_permissions` pour le domaine officiel HN et `optional_host_permissions` pour les sources RSS ajoutées ; ne jamais activer un accès large sans une demande d'origine par origine et une explication claire. Sur absence de permission, proposer un état « source non autorisée » et non un contournement.

**XML RSS/Atom :** `DOMParser` n'est pas disponible dans le service worker MV3. Soit parser dans un contexte d'extension doté du DOM via une architecture contrôlée, soit choisir une petite bibliothèque de parsing XML sûre et compatible avec le worker. Vérifier protections anti-XXE, entités, limites en taille/profondeur et incompatibilités ; ne pas créer un document caché/offscreen si un choix plus simple existe.

**Cycle de vie MV3 :** le service worker peut être arrêté ; les appels réseau doivent être bornés, persistés de façon atomique et repris sans duplication. Aucun état essentiel dans un singleton mémoire. Limiter concurrence et coût d'actualisation ; préserver données valides si une source échoue.

### Architecture indicative (à adapter après audit)

```text
src/
  background/
    index.ts                  # messages; collectes courtes, contrôlées
  connectors/
    source-connector.ts       # contrat, statut, politique accès
    hacker-news.ts           # API officielle, mapping
    rss-atom.ts              # parsing strict et mapping
    network-client.ts        # timeout, backoff, réponses, erreurs
  domain/
    content.types.ts
    normalize.ts
    canonicalize-url.ts
    deduplicate.ts
    classify.ts
    topic-cluster.ts
    trend-signal.ts
    freshness.ts
  persistence/
    db.ts                    # IndexedDB, versions et transactions
    repositories.ts
    source-settings.ts
  ui/
    popup/
    dashboard/
    components/
  shared/
    api-messages.ts
    failures.ts
  tests/
    fixtures/
      rss/
      atom/
      hn/
      timelines/
```

**Pipeline :** ajout de source/autorisation → clic « Refresh » → collecteur de source → validation et parsing → normalisation → déduplication transactionnelle → classification → persistance → mise à jour des clusters/signaux → affichage avec provenance, date et état de santé de source. Les erreurs sont par source, non un échec global.

## 5. Contrats et modèles de données TypeScript

Produire des interfaces au moins équivalentes aux suivantes (adapter les noms si argumenté ; conserver les informations et invariants) :

```ts
type SourceKind = 'hacker-news' | 'rss' | 'atom';
type SourceStatus = 'enabled' | 'disabled' | 'permission-needed' | 'error';
type TemporalQuality = 'source-published' | 'source-updated' | 'unknown';

interface Source {
  id: string; kind: SourceKind; name: string; origin: string;
  feedUrl?: string; status: SourceStatus; enabled: boolean;
  attributionUrl: string; categoryIds: string[];
  termsCheckedAt?: string; lastAttemptAt?: string;
  lastSuccessAt?: string; lastErrorCode?: string;
}
interface Article {
  id: string; sourceItemRefs: Array<{ sourceId: string; externalId?: string }>;
  title: string; originalUrl: string; canonicalUrl: string;
  sourceIds: string[]; sourceNames: string[];
  publishedAt?: string; updatedAt?: string;
  firstSeenAt: string; lastSeenAt: string; fetchedAt: string;
  temporalQuality: TemporalQuality; categories: string[];
  excerpt?: string; excerptOrigin?: 'feed' | 'api';
  byline?: string; language?: string;
  sourceMetrics?: Array<{ sourceId: string; metric: string; value: number; capturedAt: string }>;
}
interface ArticleUserState {
  articleId: string; isSaved: boolean; isRead: boolean;
  readAt?: string; savedAt?: string; assignedCategories?: string[];
}
interface FetchAttempt {
  sourceId: string; startedAt: string; endedAt?: string;
  success: boolean; fetchedCount: number; insertedCount: number;
  errorCode?: 'http' | 'permission' | 'timeout' | 'parse' | 'rate-limit' | 'network' | 'other';
  statusCode?: number; retryAfter?: string;
}
interface TopicCluster {
  id: string; label: string; articleIds: string[];
  firstObservedAt: string; lastObservedAt: string;
  distinctSourceIds: string[]; clusteringRuleVersion: string;
}
interface TrendSignal {
  clusterId: string; measuredAt: string; ruleVersion: string;
  status: 'emerging' | 'recurring' | 'insufficient-data';
  recentWindow: { start: string; end: string; count: number };
  baselineWindow: { start: string; end: string; count: number };
  distinctSources: number; reasonCodes: string[];
  score?: number; // uniquement avec preuve et formule documentée
}
interface Category { id: string; label: string; keywords: string[]; isCustom: boolean; }
```

**Invariants importants :** identifiant de source stable ; URL `https:` validée avant requête ; dates en ISO UTC stockées, heure locale seulement dans l'interface ; *source published* non substituée par *fetch time* ; identités fusionnées sans écraser la provenance ; `isRead` ne change pas au simple rafraîchissement ; intégrité relationnelle entre articles, clusters et favoris lors des migrations/suppressions ; données externes validées à l'exécution, même si TypeScript compile.

### Contrat de connecteur

Propose une interface explicite du type :

```ts
interface SourceConnector {
  kind: SourceKind;
  checkConfiguration(source: Source): Promise<{ ok: boolean; issues: string[] }>;
  fetchLatest(
    source: Source,
    options: { signal: AbortSignal; maxItems: number; previousFetchAt?: string }
  ): Promise<{ items: unknown[]; fetchedAt: string; warnings: string[] }>;
  normalize(raw: unknown, source: Source): ArticleDraft | null;
}
```

Les connecteurs renvoient des **données validées** ou des erreurs typées ; ne jamais supposer la forme complète des éléments HN/RSS. Conserver les diagnostics de parsing sans exposer la totalité du contenu potentiellement privé dans les logs. Le modèle final `ArticleDraft` est validé par la logique métier avant stockage.

## 6. Déduplication, classement et actualité : spécification vérifiable

### Déduplication

1. Exactitude sur `(sourceId, externalId)` si identifiant fourni par une API.
2. Normalisation URL contrôlée : protocole/hôte, redirections **sans les suivre en masse**, tracking connu retiré avec prudence, fragment non-identifiant retiré ; conserver les paramètres de requête sémantiques, URLs originales et de canonicalisation.
3. Correspondance d'URL canonique entre sources ; préserver toutes les références et métadonnées distinctes.
4. Similarité titre + proximité temporelle = **candidat** de regroupement. Ne pas fusionner des articles différents sur le simple thème ni écraser l'attribution.
5. Rejouer la même collecte et la même séquence de mise à jour doit être idempotent ; test obligatoire.

### Fraîcheur et dates

- Toute carte indique source, titre et date publiée si déclarée ; sinon « date de publication indisponible » et éventuellement date de découverte distincte.
- Les filtres `Today`/`This week` ne doivent pas utiliser `firstSeenAt` comme substitut silencieux.
- Les éléments anciennement publiés mais nouvellement découverts peuvent apparaître dans « récemment découverts » **et non** « publiés aujourd'hui ».
- Clocks et fuseaux : stocker UTC ; tester passages minuit et changement d'heure ; comparer des fenêtres UTC définies, afficher fuseau local.
- Rafraîchissement échoué : garder les entrées valides mais signaler un état « données potentiellement périmées ».

### Clusters et tendances — algorithme simple sans pseudo-IA

- Normaliser titres (Unicode, casse, espaces, ponctuation), exclure des mots-outils français/anglais, conserver les termes importants et dates pertinentes, calculer similarité déterministe (p.ex. tokens + Jaccard, n-grammes) avec seuil réglé sur fixtures positives/négatives.
- Protéger contre le « regroupement géant » de thèmes génériques (« AI », « Ukraine », « WordPress »). En cas d'incertitude, conserver des clusters distincts.
- Un cluster de deux articles publiés à quelques heures d'intervalle n'est **pas** automatiquement une tendance. Le statut `emerging` requiert une base comparée non vide et suffisante, un nombre minimal d'articles et une diversité minimale de sources ; **proposer des valeurs chiffrées à la phase 0** sur jeu de test puis les verrouiller dans `TREND_METHOD.md` avec version.
- Si l'historique n'inclut pas deux fenêtres couvertes, `insufficient-data` obligatoire même si la liste « latest » est remplie.
- **Aucun mélange silencieux** de score HN et nombre d'articles RSS : ce sont des signaux différents. Exposer les dimensions, les sources et les limites. Ne pas afficher « viral », « confirmé », « fiable » sans preuve.
- Documenter faux positifs/faux négatifs, dépendance au volume, biais linguistiques, catégories et changements de règles. Prévoir re-calcul et versioning du signal.

## 7. Expérience utilisateur et flux critiques

**Au premier lancement** : expliquer traitement local et besoin de source ; proposer HN (si confirmé) puis ajout de flux RSS. Aucune collecte avant action explicite. Afficher l'état « configuration requise » si aucune source utilisable.

**Ajout RSS** : utilisateur saisit URL, contrôle format HTTPS/domaine et destination, demande permission Chrome d'hôte si nécessaire, teste une récupération bornée, montre succès et attribution. Si refus, la source peut être enregistrée comme `permission-needed`, non automatiquement interrogée.

**Actualisation** : bouton `Refresh` avec suivi par source, date du dernier succès et erreur/action recommandée. Aucun faux spinner infini ; impossibilité de faire un fetch derrière CORS = diagnostic, pas usage d'un proxy opaque.

**Lecture** : liste de cartes compacte (titre, éditeur/source, dates distinguées, catégories, favori, état lu). Vue détail = extrait de la source s'il est permis, liens originaux et sources associées. Le clic du lien sort vers la publication, sans prétendre héberger le contenu complet.

**Topics / trends** : clusters avec période, articles supports, compteurs par sources distinctes, méthode visible ; afficher clairement `insufficient-data`, `recurring`, `emerging`. Prévoir explication textuelle consultable, pas seulement un score.

**Préférences** : sources, catégories, rétention, langue d'interface si retenue, export éventuel ; destruction des données avec confirmation. Ne jamais activer automatiquement des sources non approuvées.

**UX** : thème cohérent, composants réutilisables, textes explicites, skeletons mesurés, responsive, clavier et lecteur d'écran ; le « dashboard » n'est pas un écran rempli artificiellement de cartes vides.

## 8. Permissions, sécurité, données et éthique

### Manifest initial indicatif — à vérifier, pas à copier aveuglément

```json
{
  "manifest_version": 3,
  "permissions": ["storage"],
  "host_permissions": ["https://hacker-news.firebaseio.com/*"],
  "optional_host_permissions": ["https://*/*"],
  "action": { "default_popup": "popup.html" }
}
```

- Le motif optionnel large **n'est pas une autorisation globale** : il sert à **demander l'accès à une seule origine RSS saisie par l'utilisateur**, avec consentement ; mesurer son impact sur la validation du Chrome Web Store et proposer une alternative moins large si meilleure.
- Si les préférences et l'interface réseau sont implémentées sans `chrome.storage`, retirer la permission inutile ; idem HN si non inclus en phase 0.
- Ne pas demander `history`, `tabs`, `webRequest`, `cookies`, `scripting`, `<all_urls>` en hôtes obligatoires, ni `unlimitedStorage` par défaut. `alarms` et `notifications` uniquement lors d'une phase ultérieure approuvée.
- Valider `https:` et redirections : si une URL RSS redirige vers une origine non autorisée, ne pas la suivre automatiquement sans autorisation spécifique ; limiter protocoles, taille de réponse, nombre de redirects, timeout, types MIME/tailles acceptables.
- Parser XML **sans entités externes actives ni injection de DOM/HTML** ; supprimer/neutraliser les balises HTML des titres/extraits non fiables lors de l'affichage. Pas de `eval`, de code distant ou de JS chargé par les sources.
- Les extraits peuvent être protégés par des droits : conserver seulement ce qui est permis, mettre un lien et attribution, offrir suppression ; ne pas copier la totalité d'un article depuis un site tiers.
- Pas de transmission de données de veille personnelles à un backend ni analytics tiers. Chiffrement local **non garanti** ; avertir que le profil navigateur / les sauvegardes de données restent sensibles.
- Pas de secrets d'API embarqués en dur. Une API nécessitant un **secret confidentiel** ne peut pas être sécurisée uniquement dans le code client d'une extension ; reporter l'intégration à une architecture approuvée, avec OAuth adapté ou backend si autorisé.
- Journaux non intrusifs : horodatage et codes d'échec, pas de contenu personnel complet ni tokens.
- Politique de confidentialité exacte si publication sur le Chrome Web Store ; documenter finalité et conservation.

## 9. Tests obligatoires et fixtures représentatives

### Unitaires — Vitest

- HN : liste ID, items supprimés ou `dead`, titre/URL manquants, timestamps Unix, scores changeants, throttling, JSON incomplet.
- RSS 2.0 / Atom : namespaces, encodage, CDATA, entities sûres, date RFC822/ISO, absence de `pubDate`, URL relative et balises HTML dans titre, flux XML invalide, Doctype malveillant, énormes flux tronqués.
- URL : paramètres de tracking vs paramètres sémantiques ; identifiant différent, casse d'hôte, redirection non permise.
- Déduplication : identifiant stable, canonical, sources multiples, faux doublons proches, rejeu 3 fois ; conservation des favoris et provenance.
- Fraîcheur : date publiée inconnue, erreur de fuseau, source ancienne collectée aujourd'hui, résultat après passage au lendemain, source injoignable.
- Classification : mots-clés positifs, ambiguïtés, multiclasse, exclusions, corrections utilisateur.
- Clustering : deux titres identiques, sujet paraphrasé, homonymes, sujets très génériques, mélange français/anglais, seuils.
- Trend : fenêtres insuffisantes, zéro baseline, unique source répétitive, diversification réelle, date hors plage, données historiques fictives explicitement marquées en fixtures.
- Sûreté : XSS dans titre/extrait, URL `javascript:`, document malveillant, trop de données, pas de clés secrets dans bundle.

### Intégration

- Connecteurs alimentés par serveur mock/fixtures déterministes ; erreurs HTTP `401`, `403`, `429`, `500`, timeout, rupture réseau et réponse vide.
- `fetch` d'une source échouant pendant qu'une autre réussit : les nouvelles données valides doivent rester visibles.
- IndexedDB : transactions, migrations, filtres, persistance de favoris, état lu, purge et retour arrière sur erreur.
- Permissions optionnelles acceptées/refusées, source en attente, UI de rafraîchissement et statut de source.
- Interface React : recherche, filtrage, catégorie ajoutée, résultat vide, lien original, historique local et suppression.
- Calcul historique avec snapshots fixés par horloge injectée ; **aucune utilisation implicite de `Date.now()` dans les tests de tendances** si une fixture peut stabiliser le temps.

### Tests manuels avec Chrome réel

- Installer `dist/` depuis `chrome://extensions`; vérifier permissions et fonctionnement de la page.
- Actualiser HN si autorisé et accès réseau disponible ; ne pas déclarer ce test réussi si indisponible.
- Ajouter un flux RSS de test sous contrôle du projet ; accepter puis révoquer la permission et vérifier états.
- Rafraîchir deux fois puis comparer nombre d'articles/doublons, fermer et rouvrir Chrome, vérifier favoris et persistance.
- Couper le réseau : UI continue d'afficher cache + avertissement ; aucun contenu fictif.
- Examiner DevTools/Network : aucun proxy, tracker, requête inattendue ; vérifier règles et manifest.
- Tester clavier, affichage étroit, lecteur d'écran si possible et textes d'état.

Écrire les **commandes réellement exécutées**, versions, résultats et captures/rapport. Les tests non exécutés doivent être explicitement « non exécutés ».

## 10. Critères d'acceptation et définition de terminé

- [ ] Le build est chargeable comme extension Chrome MV3 autonome.
- [ ] HN officiel (si API revalidée) et RSS/Atom autorisés fonctionnent sans backend obligatoire.
- [ ] Les sources peuvent être ajoutées, désactivées et supprimées, avec consentement pour les hôtes.
- [ ] Collecte robuste face aux erreurs, sans perte des données d'une source saine.
- [ ] Déduplication exacte éprouvée et provenance des sources préservée.
- [ ] Toutes les dates présentées distinguent publication et collecte ; état de fraîcheur explicite.
- [ ] Recherche, filtres, catégories, favoris et état lu/non lu persistent.
- [ ] Les clusters sont reproductibles, justifiés par articles et limites.
- [ ] « Emerging » n'apparaît pas sans historique de référence, volume et diversité minimum ; sinon « données insuffisantes ».
- [ ] Aucun connecteur non autorisé ni faux résumé de contenu complet.
- [ ] Aucun secret d'API, aucune injection de code, aucune requête externe cachée.
- [ ] Tests unitaires/intégration et contrôle Chrome réellement exécutés, ou limites signalées sans masquer l'état.
- [ ] README, méthode de tendance, registre de sources, architecture, tests et limitations livrés.

## 11. Développement progressif — **arrêt après chaque phase**

### Phase 0 — Audit préalable : ZÉRO modification de fichiers

1. Lire structure et état du dépôt, branche, dépendances, lockfile, Node, TypeScript, build/test existants ; identifier conflits/réutilisable.
2. Vérifier **au jour de l'audit** documentation Chrome MV3 et les politiques/conditions HN, RSS envisagés, Reddit, Product Hunt, Google Trends ; noter dates et inconnues.
3. Tester sur papier la faisabilité CORS/permissions, parsing XML, quotas et MV3 éphémère ; produire matrice conformité et alternatif sans backend.
4. Proposer architecture, manifeste minimal, tables IndexedDB, types, contrat des connecteurs, budgets taille/temps, règles de stockage et vie privée.
5. Proposer seuils de clusters/tendances et **comment ils seront démontrés** sans données inventées ; distinguer snapshots synthétiques de preuve réelle de popularité.
6. Définir UX, MVP, exclusions, matrice fonctionnalité → test, risques et plan de phases.
7. Présenter la proposition à l'utilisateur et demander **explicitement l'approbation** ; ne rien coder avant.

### Phase 1 — Fondation et données locales

Configurer MV3, TypeScript strict, React, Vite, tests, IndexedDB, modèles, migrations et UI de base ; produire un build chargeable. Démontrer avec fixtures clairement étiquetées. **Stop → compte rendu → validation.**

### Phase 2 — Connecteurs HN et RSS/Atom

Implémenter HN, source manager, permission RSS opt-in, network client, erreurs bornées, parseurs et tests. Vérifier conformité et absence de proxy. **Stop → compte rendu → validation.**

### Phase 3 — Normalisation, expérience de veille

Consolider déduplication, catégories, recherche, filtres, favoris, lu/non lu, dates et source health, stockage stable. Tests de persistance et e2e. **Stop → compte rendu → validation.**

### Phase 4 — Topics et signaux conditionnels

Implémenter clusters, signaux avec seuils approuvés, état insuffisant, transparence de méthode, simulations/fixtures, preuves et régressions. Ne pas annoncer de résultat « tendance du jour » réel sans historique réel. **Stop → compte rendu → validation.**

### Phase 5 — Livraison portfolio

Audit sécurité, tests, UI/accessibilité, performances et gestion des quotas, build production, démo vraie et fixture, docs, limites, screenshots authentiques. **Stop → validation finale.**

**Compte rendu obligatoire en fin de chaque phase :** objectif atteint/non atteint, changements précis par fichier, décisions, commandes/tests exécutés et résultat réel, comportements non couverts, risques, recommandations de la prochaine phase. La phrase « les tests devraient passer » ne vaut pas résultat. Ne poursuivre qu'après accord.

## 12. Livrables de dépôt et documentation portfolio

- `README.md` : problèmes résolus, cas d'usage, captures réelles, installation, scripts, données locales et restrictions.
- `ARCHITECTURE.md` : pipeline, connecteurs, permissions, stockage, classes et flux, limites MV3.
- `SOURCE_REGISTRY.md` : source, licence, permission, statut, date d'audit, accès, quotas, politique d'effacement.
- `TREND_METHOD.md` : règles versionnées, seuils, fenêtres, couverture, biais, données insuffisantes, fixtures.
- `DATA_DICTIONARY.md` : tables/types, dates, provenance, déduplication, migrations.
- `PRIVACY.md` : ce qui est stocké, supprimé, exporté, transmis et **non transmis**.
- `TEST_REPORT.md` : commandes de test, succès/échecs observés, date, environnement, Chrome réel, limites.
- `KNOWN_LIMITATIONS.md` : sources non prises en charge, feeds bloqués, histoire locale incomplète, fausses similitudes, langue, absence de backend et résumés IA.
- `dist/` reconstructible, fichier licence décidé avec l'utilisateur ; ne pas inclure de faux témoignages, faux graphiques ni faux chiffres de diffusion.

## 13. Documentation officielle de départ à revérifier

- Permissions Chrome : https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions
- Permissions optionnelles : https://developer.chrome.com/docs/extensions/reference/api/permissions
- Accès réseau : https://developer.chrome.com/docs/extensions/develop/security-privacy/stay-secure
- Cycle de vie MV3 : https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle
- Stockage : https://developer.chrome.com/docs/extensions/reference/api/storage
- Chrome Web Store : https://developer.chrome.com/docs/webstore/program-policies/policies
- HN API officielle : https://github.com/HackerNews/API
- Reddit Data API / responsable : https://support.reddithelp.com/hc/en-us/articles/16160319875092-Reddit-Data-API-Wiki
- Product Hunt API GraphQL : https://www.producthunt.com/v2/docs
- Google Trends API : https://developers.google.com/search/apis/trends

## 14. TA PREMIÈRE RÉPONSE OBLIGATOIRE DANS CLAUDE CODE

Réponds **uniquement** par un **audit de phase 0** : état constaté du dépôt, risque produit et sources, MVP/exclusions, architecture et manifest, contrats des connecteurs, modèles, UX, règles de tendance proposées, tests et critères d'acceptation, plan jalonné, éventuels choix alternatifs justifiés. Signale ce qui reste non vérifié. Termine par une question précise : **« Validez-vous l'audit et l'architecture de la phase 0 pour commencer la phase 1 ? »** Puis arrête-toi.

**Interdits :** développer avant validation, scraping/API non autorisée, présenter scores fictifs comme réels, masquer une erreur de collecte, appeler « tendance » un simple nouvel article, inventer des dates de publication, embarquer des tokens, promettre une couverture globale d'Internet, envoyer des contenus à un service tiers sans accord ou déclarer un test réussi sans exécution.
