# 01 — Architecture

Retour au [plan principal](../../PLAN.md).

Ce document décrit le cœur partagé. Il est à lire avant d'écrire quoi que ce soit dans `src/core/`.

---

## 1. Couches et sens des dépendances

```
        routes/          TanStack — routing, prerender, découpe du bundle
           │
        editors/         un dossier par pilier : image, audio, gif, subtitles, video
           │  │
    ui/ ◄──┘  └──► core/
    design            média, rendu, historique, documents, workers
    system            (aucun import React, Zustand ou TanStack)
```

**Les trois règles qui définissent l'architecture :**

1. `core/` ne connaît pas React. Pas de hook, pas de JSX, pas de store. C'est du TypeScript qui tournerait tel quel dans un worker ou sous Bun, hors navigateur.
2. `ui/` ne connaît pas le métier. Un `Slider` ne sait pas ce qu'est un codec.
3. `editors/` est la seule couche autorisée à connaître les deux.

Ces règles sont appliquées par une règle de lint sur les imports, pas par la discipline — sans quoi elles cèdent au troisième sprint.

**Pourquoi cette discipline paie ici en particulier :** le traitement média doit tourner dans des workers (I5). Du code de traitement contaminé par un import React ne peut pas y être déplacé sans réécriture.

---

## 2. `core/media` — la façade Mediabunny

Point d'entrée unique vers Mediabunny (I3). Aucun autre fichier de l'application n'importe `mediabunny` directement — vérifié par lint.

### Deux chemins, jamais mélangés

Mediabunny offre deux niveaux d'API, et le choix entre les deux dépend d'une seule question : **est-ce qu'on touche aux pixels ou aux échantillons ?**

|         | Chemin `Conversion`                                               | Chemin manuel                                 |
| ------- | ----------------------------------------------------------------- | --------------------------------------------- |
| Quand   | Convertir, optimiser, changer de conteneur, remux, découpe simple | Filtres, texte, crop, burn-in, tout effet     |
| Comment | API `Conversion` de haut niveau, Mediabunny orchestre tout        | `decode → VideoFrame → render graph → encode` |
| Coût    | Faible, très optimisé, parfois du remux sans réencodage           | Élevé, décodage et réencodage complets        |
| Qualité | Aucune perte si remux                                             | Réencodage, donc génération perdue            |

**Règle** : on prend toujours le chemin `Conversion` quand il suffit. Un utilisateur qui convertit un MP4 en MKV sans autre modification ne doit pas subir un réencodage. La façade décide seule, à partir du document : si aucune opération ne touche aux pixels, `Conversion` ; sinon, chemin manuel.

Depuis la v1.51, les conversions sont composables et peuvent cibler une même sortie — ce qui couvre proprement le multipiste.

### Encodage : `quality`, pas `bitrate`

Mediabunny v1.52 a déprécié les champs bitrate au profit d'un champ `quality` unifié adossé au quantizer. **Tout le code s'écrit contre `quality`.** L'UI expose les deux modes de contrôle de débit (qualité constante et débit cible) mais le second passe par les options appropriées, jamais par les champs dépréciés.

### Extensions chargées paresseusement

Les extensions (`ac3`, `dts`, `aac-encoder`, `mp3-encoder`, `flac-encoder`, `prores`) ne sont importées que lorsqu'un codec les réclame. Un utilisateur qui recadre une image ne télécharge pas l'encodeur DTS. Un registre déclaratif fait la correspondance codec → import dynamique.

### Sonder avant de proposer

`WebCodecs` varie fortement selon navigateur, OS et matériel. Avant d'afficher un codec dans l'UI, on interroge `VideoEncoder.isConfigSupported()` / `AudioEncoder.isConfigSupported()`. Un codec indisponible est affiché **désactivé avec la raison**, jamais masqué — l'utilisateur avancé doit comprendre pourquoi HEVC n'est pas là, plutôt que de croire à un oubli.

---

## 3. `core/document` — les modèles de document

Un `Document` décrit **une édition**, jamais le média lui-même. C'est la description déclarative de ce que l'utilisateur a demandé.

```ts
type ImageDocument = {
  readonly kind: "image";
  readonly source: SourceRef; // référence, pas les octets
  readonly crop: CropRegion | null;
  readonly resize: ResizeSpec | null;
  readonly rotation: Rotation;
  readonly filters: FilterParams;
  readonly textLayers: readonly TextLayer[];
  readonly export: ImageExportSpec;
};
```

**Contraintes non négociables (D4) :**

- **Sérialisable en JSON de bout en bout.** Aucune classe, aucune closure, aucun `Map`, `Set`, `Blob` ou `VideoFrame` dans un document. Un document est une valeur, pas un objet vivant.
- **Le média source est une référence**, jamais des octets. Les octets vivent dans `core/resources`, hors du document.
- **Immuable.** Toute modification produit un nouveau document. C'est ce qui rend l'undo trivial et le rendu prévisible.

Ces contraintes ne servent pas un autosave qu'on a écarté — elles servent les tests (un document est un littéral qu'on écrit à la main), le débogage (un document se lit dans la console), les presets d'export, et elles laissent la persistance possible plus tard sans toucher au cœur.

Un test générique vérifie pour chaque type de document que `parse(stringify(doc))` redonne exactement `doc`.

---

## 4. `core/history` — le bus de commandes (I2)

L'undo est global aux cinq éditeurs et ne se greffe pas après coup.

```ts
type Command<D> = {
  readonly label: string; // affiché : « Annuler le recadrage »
  readonly apply: (doc: D) => D;
  readonly invert: (doc: D) => D; // ou dérivé du snapshot précédent
  readonly mergeKey?: string; // fusionne les gestes continus
};
```

**Trois points de conception qui comptent :**

**Fusion des gestes continus.** Déplacer un slider ne doit pas produire quarante entrées d'historique. Deux commandes consécutives partageant un `mergeKey` et proches dans le temps fusionnent. Sans ça, l'undo devient inutilisable exactement là où l'utilisateur en a le plus besoin.

**Le label est de l'UI.** Il est traduit, et il apparaît dans le menu et dans les infobulles. Il fait partie du contrat de la commande, pas d'une table annexe.

**Historique borné.** Les documents sont petits (quelques Ko), mais l'historique est plafonné en nombre d'entrées avec éviction des plus anciennes. Le plafond est un token de configuration, pas une constante enfouie.

L'historique n'est pas dans le document : c'est une pile de documents. Un document reste une valeur pure.

---

## 5. `core/render` — le render graph (I1)

**L'invariant central du projet.** La preview et l'export traversent le même graphe, alimentés par la même source de frames. Ce qui change, c'est uniquement la destination.

```
   SOURCE                       GRAPHE                       DESTINATION
   ──────                       ──────                       ───────────
                     ┌────────────────────────────┐   ┌─► canvas à l'écran
  Mediabunny  ──────►│ [crop] [color] [text] [subs] │──┤
  decoder            └────────────────────────────┘   └─► VideoFrame → encoder
  (VideoFrame)              une seule chaîne
```

### La source est un décodeur Mediabunny, pas un élément `<video>`

Décision explicite, et elle contredit ce que faisait l'itération précédente. La preview décode via Mediabunny et alimente le graphe en `VideoFrame`, exactement comme l'export.

Deux raisons, dont une est rédhibitoire :

1. **L'édition à la frame près est impossible via `<video>`.** Positionner `currentTime` ne garantit pas d'atterrir sur une frame donnée : le navigateur choisit, la précision varie selon le codec et le conteneur. Or « éditer la vidéo à la frame près » est une exigence du cahier des charges. Seul un décodeur qui délivre les frames une par une donne cette précision.
2. **Deux sources différentes cassent I1 à la racine.** Un `<video>` décodé par le navigateur et un `VideoFrame` sorti d'un décodeur ne traitent pas l'espace colorimétrique de la même façon. Le test de comparaison pixel comparerait alors deux pipelines qui n'ont jamais été le même — et la tolérance de comparaison masquerait l'écart au lieu de le révéler.

L'élément `<video>` n'est conservé que comme repli dégradé, si le décodage d'un fichier échoue côté WebCodecs alors que le navigateur sait le lire nativement. Ce mode est **signalé à l'utilisateur** : la navigation à la frame y est désactivée, et l'export reste sur le chemin décodeur.

Même règle pour l'audio : les échantillons qui alimentent la visualisation de spectre viennent du décodage Mediabunny, pas d'un `<audio>` branché sur Web Audio.

### Les sous-titres sont une passe du graphe, pas une surcouche

jassub rend dans un canvas hors écran ; ce canvas entre dans le graphe **comme une texture, via une passe `[subs]`**. Preview et export utilisent cette passe à l'identique — seule change la décision de l'inclure ou non (burn-in activé ou non).

Ce point mérite d'être appuyé, parce que la solution intuitive est mauvaise : superposer un canvas jassub par-dessus le canvas de rendu en CSS pour la preview, puis rastériser autrement à l'export, crée **deux chemins de rendu pour le même résultat visuel**. C'est structurellement le bug qui a frappé l'itération précédente avec les filtres CSS doublant la passe WebGL. Une seule passe, un seul chemin.

### Conception

- **WebGL2**, une passe unique méga-shader pour toute la correction colorimétrique. Enchaîner une passe par réglage coûte des allers-retours de framebuffer pour rien.
- **Chemin identité court-circuité.** Quand les filtres sont aux valeurs par défaut, le graphe fait une seule passe de copie. C'est ce qui permet de garder le pipeline actif en permanence sans le conditionner à un `hasFilters` — et ce conditionnel est précisément ce qui a produit le bug de double application dans l'itération précédente.
- **Coalescence des rendus** via `requestAnimationFrame`. Dix changements de paramètres dans la même frame produisent un rendu, pas dix.
- **Aucun filtre CSS sur le canvas, jamais.** Le seul rendu est celui du graphe.

### Mode comparaison

Le canvas filtré est découpé au `clip-path` pour laisser apparaître en dessous un second rendu du graphe **avec les filtres neutralisés** — pas une source brute d'origine différente. Le mode comparaison compare deux états du même pipeline, ce qui est la seule façon qu'il soit honnête.

## 5 bis. `core/container` — le conteneur pour les sous-titres

Mediabunny ne lit ni n'écrit de pistes de sous-titres autres que WebVTT, et n'offre aucun point d'extension pour y remédier (constat détaillé et sourcé dans [plan §4](../../PLAN.md#4-les-sous-titres-sont-une-couche-maison--ce-que-ça-veut-dire-exactement)). Ce module comble ce manque, **sans forker Mediabunny ni attendre une évolution amont**.

Il fait deux choses, et se garde d'en faire une troisième.

### Ce qu'il fait

**Lecture.** Un parseur EBML en lecture seule descend l'arbre Matroska, retient les `TrackEntry` dont le type est « sous-titre », lit `CodecID` et `CodecPrivate`, puis collecte les blocs correspondants dans les Clusters. Il ignore délibérément la vidéo et l'audio : Mediabunny lit le même fichier en parallèle pour ce qui le concerne.

**Écriture.** Un multiplexeur Matroska assemble un fichier complet à partir de paquets déjà encodés. Les pistes vidéo et audio y entrent **inchangées**, octet pour octet ; nos pistes de sous-titres s'y ajoutent.

### Ce qu'il ne fait pas

Il ne connaît **rien** aux formats de sous-titres. Pour lui, un cue ASS et un display set PGS sont des octets horodatés. Toute la sémantique — parsing, styles, RLE — vit dans `core/subtitles`. Cette séparation est ce qui garde le module petit et testable : un muxeur qui comprendrait l'ASS mélangerait deux problèmes sans rapport.

### La brique qui rend le montage possible

`EncodedPacketSink` fournit les paquets encodés d'une piste d'entrée **sans les décoder**, et `EncodedPacket` porte `data`, `type`, `timestamp` et `duration` — exactement le contrat qu'attend un multiplexeur. C'est ce qui permet de faire transiter vidéo et audio à travers notre muxeur sans réencodage et sans perte.

Conséquence pratique, et elle est importante pour l'utilisateur : **ajouter une piste de sous-titres à un film ne réencode rien**. L'opération est rapide et n'altère pas l'image.

### Module temporaire, par construction

Ce module est destiné à disparaître : dès que Mediabunny gérera les sous-titres, on bascule sur lui et on le supprime (décision du porteur du projet, ADR 004e). Trois conséquences immédiates sur la façon de l'écrire :

- **Il n'est atteignable que par l'interface `ContainerBackend`.** Une règle de lint interdit tout import de ses fichiers internes depuis `editors/`. Sans cette barrière, le module s'infiltre et devient inextricable en quelques mois.
- **Il ne partage aucune structure interne avec `core/subtitles`.** Ce dernier survivra au retrait — Mediabunny fournira le transport, jamais le modèle de cue ni les styles ASS.
- **Ses tests portent sur l'interface.** La même suite validera l'implémentation Mediabunny le jour de la bascule.

Le coût de cette discipline est faible ; celui de son absence se paie au moment du retrait, quand il est trop tard.

### Périmètre : Matroska seulement

Le muxeur cible MKV, et lui seul. Écrire aussi un muxeur ISOBMFF doublerait le travail pour un gain nul : MP4 ne standardise ni ASS ni PGS. Un export MP4 passe donc par Mediabunny tel quel, avec sous-titres en VTT ou en fichier séparé.

## 6. `core/resources` — cycle de vie (I4)

`VideoFrame` et `AudioData` sont à libération explicite. Une frame oubliée pendant un scrub fait exploser la mémoire de l'onglet en quelques secondes, et le symptôme (onglet qui meurt) ne pointe pas vers la cause.

**La règle** : tout `VideoFrame` a un propriétaire unique et identifié, et ce propriétaire appelle `.close()`.

Plutôt que de compter sur la vigilance, le cœur fournit des primitives qui rendent la fuite difficile :

- un helper de portée qui ferme automatiquement en sortie, y compris sur exception ;
- un pool de frames pour les boucles de décodage, qui recycle au lieu d'allouer ;
- **en développement, un compteur d'allocations/libérations** qui avertit bruyamment dès qu'un déséquilibre apparaît.

Ce compteur est instrumenté dans les tests : plusieurs critères de sortie de phase en dépendent (voir [Tests](04-testing.md)).

---

## 7. `core/workers` — parallélisme (I5)

Le décodage et l'encodage vivent hors du thread principal. Sans ça, la preview fluide est hors d'atteinte.

- **Comlink** pour l'appel typé à travers la frontière du worker — sans lui, on écrit du passage de messages à la main et des unions de types à la main.
- **Transferables partout.** Un `ArrayBuffer` se transfère, il ne se copie pas. Une copie de 200 Mo à chaque message annule le bénéfice du worker.
- **Un pool dimensionné sur `navigator.hardwareConcurrency`**, plafonné pour laisser respirer le système.
- **Annulation coopérative.** Un export annulé libère immédiatement encodeurs et frames. L'annulation fait partie du contrat de chaque tâche longue, elle n'est pas un ajout ultérieur.

**Ce qui reste sur le thread principal :** le rendu WebGL destiné à l'écran, et lui seul. Le contexte WebGL n'est pas transférable entre workers de façon portable ; le rendu d'export utilise donc un contexte dédié, dans le worker, alimenté par le même code de graphe.

---

## 8. État de l'interface — Zustand

Zustand porte **l'état de l'interface**, pas les documents.

| Dans Zustand                | Dans les documents     |
| --------------------------- | ---------------------- |
| Panneau ouvert, outil actif | Réglages d'édition     |
| Zoom et position du canvas  | Crop, filtres, calques |
| Progression d'export        | Spec d'export          |
| Thème, langue               | —                      |

Confondre les deux, c'est perdre l'undo : annuler ne doit pas replier un panneau ni remettre le zoom à zéro. La frontière est explicite dès la phase 0.

Un store par éditeur, plus un store applicatif pour thème, langue et préférences (D4). Pas de store monolithique.

---

## 9. Routing et découpe du bundle

Routing par fichiers, TanStack. Deux familles de routes qui ne se ressemblent pas :

- **Routes marketing** — prerendues au build en HTML complet, légères, sans aucun code d'éditeur dans le bundle. C'est ce qui donne le SEO (D1).
- **Routes d'éditeurs** — servies par le shell SPA, chargées à la demande.

**Budget** : arriver sur la page d'accueil ne doit charger ni WebGL, ni Mediabunny, ni jassub. Chaque éditeur est un chunk séparé, et les extensions de codec sont des chunks à part encore (§2).

---

## 9 bis. Détail de configuration vérifié

Le `tsconfig.json` doit déclarer `"types": ["vite/client"]`. Sans lui, TypeScript 7 échoue sur tout import à effet de bord d'une feuille de style (`TS2882: Cannot find module or type declarations for side-effect import`) — donc dès le premier `import './app.css'`. Constaté en conditions réelles lors de la validation de la stack, et trivial à corriger si on sait d'où ça vient.

## 10. Internationalisation

Sept langues : anglais (source), français, espagnol, italien, allemand, chinois, japonais.

- Détection depuis `navigator.languages`, qui reflète la configuration de l'OS. Choix manuel possible, conservé en préférence (D4).
- **Clés typées** : une clé manquante ou une variable d'interpolation absente est une erreur de typecheck, pas un `undefined` découvert en production.
- Les locales sont des chunks séparés — on ne télécharge pas les sept.
- `Intl` natif pour dates, nombres, durées et tailles de fichiers. Aucune bibliothèque de formatage.
- **Le chinois et le japonais imposent des contraintes de mise en page** : pas de largeur fixe sur les libellés, pas de troncature calculée en caractères latins. Vérifié dans la passe responsive de la phase 6.

---

## 11. Performance — ce qui est structurel

Ces points ne sont pas des optimisations tardives : ce sont des choix de conception.

| Sujet                             | Décision                                                    |
| --------------------------------- | ----------------------------------------------------------- |
| Décodage                          | En worker, jamais sur le thread principal                   |
| Filtres                           | Une passe GPU unique, pas une par réglage                   |
| Rendu                             | Coalescé sur `requestAnimationFrame`                        |
| Frames                            | Recyclées via un pool, pas réallouées                       |
| Transferts                        | Transferables, jamais de copie structurée sur du volumineux |
| Extensions codec                  | Import dynamique à la demande                               |
| Locales                           | Chunks séparés                                              |
| Éditeurs                          | Un chunk par pilier                                         |
| Listes longues (frames GIF, cues) | Virtualisation via `@tanstack/react-virtual`                |
| Grandes images                    | Tuilage pour le rendu à fort zoom                           |
