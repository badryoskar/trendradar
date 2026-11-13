# Confidentialité

_Dernière mise à jour : 12 novembre 2026._

TrendRadar est une extension **local-first**. Elle n'a ni serveur, ni compte, ni outil d'analyse d'audience, ni publicité.

## Ce qui est stocké, et où

Toutes les données restent dans **votre profil Chrome**, dans la base IndexedDB de l'extension :

- les sources que vous ajoutez (URL des flux, nom, état de collecte) ;
- les articles collectés : titre, lien, dates, auteur, extrait court fourni par le flux, score Hacker News ;
- vos actions **dans TrendRadar** : favoris, articles marqués comme lus, corrections de catégories, catégories personnalisées, préférences ;
- un journal technique des collectes : dates, nombres d'éléments, codes d'erreur. Il ne contient aucun contenu d'article.

TrendRadar **ne lit pas** l'historique de navigation, les onglets, les cookies ni le contenu des pages que vous visitez.
L'extension ne demande aucune de ces permissions.

## Ce qui est transmis

- **Requêtes de collecte**, uniquement quand vous cliquez « Actualiser » ou ajoutez une source : `GET` vers l'API officielle Hacker News (`hacker-news.firebaseio.com`) et vers les URL de flux que **vous** avez ajoutées. Elles partent **sans cookies ni referrer**. Comme toute requête web, elles révèlent votre adresse IP et l'heure de la requête au serveur contacté.
- **Rien d'autre** : aucune donnée de veille, aucun identifiant, aucune statistique n'est envoyé à TrendRadar ni à un tiers. Les images des articles ne sont pas chargées (CSP `img-src 'self'`).

## Permissions

- **Aucune permission obligatoire.**
- L'accès réseau à un site de flux est demandé **site par site**, au moment où vous ajoutez le flux. Vous pouvez le refuser ou le révoquer depuis `chrome://extensions`. TrendRadar le révoque aussi quand vous supprimez la dernière source de ce site, ou toutes vos données.

## Durée de conservation et suppression

- **Rétention :** les articles sont conservés 30 jours par défaut (réglable), les favoris étant gardés.
- **Settings** permet :
  - d'effacer l'historique de lecture ;
  - de purger les articles expirés ;
  - de **supprimer toutes les données**, ce qui révoque aussi les accès aux sites.
- **Désinstallation :** désinstaller l'extension efface sa base.

## Sécurité

- **Pas de chiffrement propre :** TrendRadar ne chiffre pas ses données. Elles sont protégées comme le reste de votre profil Chrome, et les sauvegardes ou synchronisations de profil gérées par votre système peuvent en contenir une copie.
- **Pas de code distant :** aucun code distant n'est exécuté (CSP `script-src 'self'`).

## Export

L'export des données n'est pas encore proposé : c'est une évolution prévue, voir [`KNOWN_LIMITATIONS.md`](KNOWN_LIMITATIONS.md).

## Chrome Web Store

Si TrendRadar est publiée, cette page servira de politique de confidentialité.

- **Finalité des données :** uniquement l'agrégation de flux choisis par l'utilisateur.
- **Ce que TrendRadar ne fait pas :** aucune vente, aucun transfert, aucun usage sans rapport avec cette finalité.
