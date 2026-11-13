# Méthode des sujets et des signaux

Versions : regroupement **`1+sw1`** (règle 1, mots vides 1), signal **`1`**. Fixées le 12 novembre 2026.
Code : `src/domain/topic-cluster.ts`, `src/domain/trend-signal.ts`, `src/domain/stopwords.ts`, `src/domain/topics.ts`.

TrendRadar n'utilise ni apprentissage automatique ni texte généré. Le calcul est refait à chaque affichage à partir des
données locales : un changement de règle s'applique donc immédiatement, et aucun ancien score n'est conservé.

## 1. Regroupement en sujets

| Étape             | Règle                                                                                                                                                                                                                                                  |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Normalisation     | Titre en NFKD, accents retirés, minuscules, ponctuation remplacée par des espaces                                                                                                                                                                      |
| Tokens            | Mots vides FR/EN retirés (liste versionnée) ; mots de 3 lettres ou plus, nombres de 2 chiffres ou plus ; `s` final retiré sur les mots de 5 lettres ou plus (pluriel simplifié)                                                                        |
| Similarité        | Indice de Jaccard entre les ensembles de tokens                                                                                                                                                                                                        |
| Rattachement      | Un article rejoint un sujet si, **comparé au premier article du sujet** (la graine) : Jaccard ≥ **0,5** **et** au moins **2 termes spécifiques communs** (hors `GENERIC_TERMS`) ; **et** s'il est daté à moins de **72 h** du dernier article du sujet |
| Égalités          | Le sujet le plus similaire l'emporte, puis le plus ancien                                                                                                                                                                                              |
| Libellé           | Titre **réel** du médoïde, c'est-à-dire l'article le plus similaire à l'ensemble des autres (égalité départagée par ancienneté puis par identifiant)                                                                                                   |
| Date de référence | `publishedAt` si elle est déclarée, sinon `firstSeenAt`. Elle ne sert **qu'au regroupement**, jamais aux fenêtres de signal                                                                                                                            |
| Périmètre         | Articles des 14 derniers jours ; seuls les sujets de 2 articles ou plus sont affichés                                                                                                                                                                  |

**Pourquoi comparer à la graine :** en liaison simple, A ressemble à B et B à C, donc A, B et C finissent ensemble. Ce
mécanisme crée des sujets « géants » qui dérivent d'un thème à l'autre. Comparer chaque article à la graine empêche
cette dérive (testé). Le chaînage temporel sur 72 h permet en revanche à un sujet couvert régulièrement de rester un
seul sujet.

**Garde-fou contre les termes génériques :** des termes comme « ai », « google », « wordpress », « update » ou
« ukraine » ne peuvent pas, à eux seuls, justifier un regroupement. Cinq titres « X AI update released » restent cinq
sujets distincts (testé).

**Résultat indépendant de l'ordre :** le même ensemble d'articles produit les mêmes sujets, quel que soit l'ordre
d'entrée (testé avec plusieurs permutations).

## 2. Fenêtres et couverture

- **Fenêtre récente** : `[maintenant − 24 h, maintenant)`.
- **Fenêtre de référence** : les 6 jours précédents, `[maintenant − 7 j, maintenant − 24 h)`. Les deux fenêtres sont en UTC, bornes semi-ouvertes.
- **Comptage :** seules les **dates de publication déclarées** comptent. Les articles sans date sont signalés à part (`undated-excluded:N`), jamais comptés.
- **Couverture d'une source :** on fait l'union des intervalles `[plus ancien élément renvoyé, fin de collecte]` de ses collectes réussies. La source couvre la fenêtre si cette union va du début de la fenêtre jusqu'à `fin − 6 h` (marge de tolérance).
- **Fenêtre couverte :** il faut **au moins 3 sources** qui la couvrent.
- **Sources retenues :** seuls les **flux RSS/Atom** comptent. Un flux est chronologique : tout ce qui a été publié entre son élément le plus ancien et la collecte y figure. Le classement « top stories » de Hacker News n'a pas cette propriété, il ne prouve donc aucune couverture. La démo n'a jamais de collecte.
- **Collectes manuelles :** plusieurs actualisations au fil de la semaine se cumulent. À l'inverse, deux jours sans collecte laissent un trou, et la fenêtre n'est plus couverte (testé).

## 3. Statuts

Le premier statut dont toutes les conditions sont remplies l'emporte.

**Émergent** (`emerging`), toutes les conditions suivantes :

- les deux fenêtres sont couvertes ;
- au moins **3 articles** datés dans la fenêtre récente ;
- au moins **3 origines** distinctes parmi ces articles. Une origine est le domaine de publication ; un agrégateur comme Hacker News compte comme **une seule** origine, quels que soient les sites vers lesquels il pointe ;
- `ratio = récents / ((référence + 1) / 6) ≥ 3`. C'est le rythme quotidien récent comparé au rythme quotidien de référence ; le +1 évite la division par zéro et rend un sujet inédit comparable. Le seuil est inclusif.

**Récurrent** (`recurring`) :

- articles publiés sur au moins **3 jours UTC distincts** au cours des 14 derniers jours ;
- par au moins **2 origines**.

Ce statut constate une répétition observée ; il ne compare pas de fenêtres et ne demande donc pas de couverture. Le
manque de couverture ne peut que **sous-estimer** une récurrence.

**Données insuffisantes** (`insufficient-data`) : tous les autres cas. Les codes de raison indiquent la condition manquante :
`recent-not-covered`, `baseline-not-covered`, `too-few-recent-articles`, `too-few-recent-origins`, `ratio-below-threshold`.

Le **score** affiché est le ratio. Il n'apparaît que lorsque les deux fenêtres sont couvertes. Le score Hacker News
n'intervient **jamais**.

## 4. Démonstration sans données inventées

- Les seuils ont été choisis et vérifiés sur des **données synthétiques explicitement marquées** :
  - `tests/fixtures/timelines/title-pairs.json` (`"synthetic": true`) : 6 paires qui doivent être regroupées et 8 qui doivent rester séparées (homonymes, termes génériques, versions différentes, même entreprise mais sujets différents) ;
  - des historiques fabriqués avec une horloge fixe dans `tests/domain/trend-signal.test.ts` et `tests/ui/topics.test.tsx`.
- Ces données servent à **prouver les règles**, pas une popularité réelle.
- Dans l'extension, un statut « émergent » n'apparaît que sur des collectes réelles qui remplissent les conditions. Avec une démo ou un historique trop court, l'interface affiche la couverture manquante et « Signal indisponible — données insuffisantes ».

## 5. Limites connues et biais

- **Faux négatifs :** les paraphrases sans mots communs, et les traductions (un titre FR et un titre EN sur le même sujet), ne sont pas regroupées. Ce choix est assumé : en cas de doute, les sujets restent séparés.
- **Faux positifs possibles :** deux événements distincts qui partagent au moins deux termes rares en moins de 72 h, comme le même produit et la même version.
- **Langues :** seules les listes FR et EN existent. Les autres langues ont moins de mots vides retirés, donc la similarité y est moins fiable.
- **Dépendance au volume :** avec peu de flux suivis, la couverture est rarement atteinte et presque tout reste en « données insuffisantes ». C'est voulu.
- **Dépendance aux flux :** un flux qui ne renvoie que 10 éléments couvre peu de temps. La couverture de la référence exige donc des actualisations régulières, puisque la collecte reste manuelle dans le MVP.
- **Biais de sélection :** les signaux mesurent l'activité **des sources que vous suivez**, pas celle du web.
- **Catégories :** le regroupement ignore les catégories ; un sujet peut en couvrir plusieurs.

## 6. Changer une règle

Toute modification d'un seuil, d'une liste ou d'une étape impose trois choses :

1. incrémenter `CLUSTERING_RULE_VERSION`, `STOPWORDS_VERSION` ou `TREND_RULE_VERSION` ;
2. mettre à jour ce document ;
3. ajuster les fixtures de calibration et les tests.

Comme le calcul est refait à l'affichage, aucune migration de données n'est nécessaire.
