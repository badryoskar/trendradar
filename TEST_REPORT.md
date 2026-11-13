# Rapport de tests

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
