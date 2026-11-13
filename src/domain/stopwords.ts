/**
 * Versioned word lists used by topic clustering. Changing any list is a
 * rule change: bump STOPWORDS_VERSION and CLUSTERING_RULE_VERSION.
 * Words are stored in normalised form (lower-case, no accents).
 */
export const STOPWORDS_VERSION = '1';

export const STOPWORDS = new Set(
  `
a about above after again against all also am an and any are as at be because been before being below between both
but by can could did do does doing down during each few for from further had has have having he her here hers him his
how i if in into is it its itself just me more most my no nor not now of off on once only or other our ours out over
own same she should so some such than that the their theirs them then there these they this those through to too under
until up very was we were what when where which while who whom why will with would you your yours yet via vs versus
new news says said how what why get gets got make makes made use using used one two first last next
le la les un une des du de d l au aux et ou mais donc or ni car ce cet cette ces se sa son ses leur leurs mon ma mes
ton ta tes notre nos votre vos qui que quoi dont ou il elle ils elles on nous vous je tu en y ne pas plus moins tres
pour par sur sous dans avec sans chez entre vers depuis pendant avant apres selon contre est sont etait ete etre avoir
a ont fait faire peut doit comme aussi tout tous toute toutes quand comment pourquoi encore deja nouveau nouvelle
nouveaux nouvelles annonce annoncent voici
`
    .split(/\s+/)
    .filter(Boolean),
);

/**
 * Terms too broad to justify grouping on their own ("giant cluster" guard).
 * They still count in the Jaccard similarity but never as one of the
 * required shared specific terms.
 */
export const GENERIC_TERMS = new Set(
  `
ai ia llm google apple microsoft meta amazon openai wordpress php javascript python linux android ios web internet
tech technology technologie software logiciel data donnees security securite startup startups update release version
report rapport study etude world monde year annee today aujourd hui week semaine billion million percent canada
quebec usa ukraine russia china chine trump europe france launch lance open source app apps company entreprise
`
    .split(/\s+/)
    .filter(Boolean),
);
