# Limites connues

Cette liste est volontairement honnête : TrendRadar fait peu de choses, mais les fait de façon traçable.

## Sources

- **Deux types de sources seulement :** l'API officielle **Hacker News** et des **flux RSS/Atom** ajoutés par l'utilisateur. Reddit, Product Hunt et Google Trends sont désactivés, faute d'accès vérifié ou à cause des conditions d'accès ; voir [`SOURCE_REGISTRY.md`](SOURCE_REGISTRY.md). Il n'y a aucun scraping de pages HTML.
- **Aucune liste de flux fournie :** l'utilisateur doit trouver des flux dont l'usage est permis par l'éditeur.
- **Flux bloqués :** certains flux refusent les requêtes (403, protection anti-robots), redirigent vers un autre domaine (`redirect-blocked`) ou servent du HTML ; ils restent en erreur. Aucun contournement n'est prévu.
- **Hacker News :** API v0, rétrocompatibilité non garantie. Son CORS permissif est **observé, pas documenté**.
- **Redirections :** la requête vers la cible d'une redirection part avant le contrôle de son origine ; seul le résultat est rejeté.

## Collecte et historique

- **Collecte uniquement manuelle :** il n'y a pas de rafraîchissement en arrière-plan (`chrome.alarms` est hors MVP). L'historique local n'est donc que ce que vous avez collecté, quand vous l'avez collecté.
- **Volumes plafonnés :** 50 éléments par flux, 30 pour HN, 2 Mo et 15 s par réponse.
- **Fermeture du tableau de bord pendant une actualisation :** la collecte en cours est interrompue. Les données déjà écrites restent cohérentes.
- **Dates :** une date sans fuseau, impossible ou future est considérée comme **inconnue**. Certains articles réellement datés apparaîtront donc « sans date ».

## Classement, sujets et signaux

- **Classement par mots-clés :** il est littéral et ne comprend ni le sens, ni l'ironie, ni les synonymes.
- **Regroupement en sujets :** il repose sur les mots communs. Les paraphrases et les traductions FR/EN ne sont pas regroupées. Des événements distincts qui partagent plusieurs termes rares peuvent l'être. Seuls le français et l'anglais ont des listes de mots vides.
- **Statut « émergent » rare :** il exige au moins 3 flux RSS couvrant une semaine. Avec peu de sources ou des actualisations espacées, la plupart des sujets restent en « données insuffisantes », et c'est voulu.
- **Ce que mesurent les signaux :** l'activité **des sources suivies**, pas l'intérêt du public ni la popularité sur le web. Aucune « crédibilité » n'est calculée.

## Produit

- **Absent de l'application :**
  - l'export des données, ainsi que la synchronisation entre appareils ou navigateurs ;
  - les résumés par IA, la traduction et les notifications ;
  - les versions Firefox, Safari et mobile.
- **Langue :** l'interface est en français uniquement, même si les noms des catégories par défaut sont en anglais.
- **Tableau de bord :** il charge au plus les 2 000 articles les plus récemment découverts.
- **Stockage :** les données ne sont pas chiffrées par TrendRadar. L'effacement par le navigateur en cas de manque d'espace reste possible si `navigator.storage.persist()` est refusé.

## Tests non automatisés

- **Fenêtre de permission Chrome :** sa vraie boîte de dialogue, pour un flux RSS réel, n'a pas été testée automatiquement : Playwright ne peut pas la piloter. Le parcours est couvert par des tests d'interface avec une permission simulée.
- **Lecteurs d'écran :** ils n'ont pas été testés. L'accessibilité est vérifiée avec axe-core (WCAG 2.2 A/AA), au clavier et sur un écran de 360 px.
- **Statut « émergent » sur données réelles :** il n'a pas encore été observé.
