# Vixely — Plan d'implémentation

> **Statut** : plan validé, prêt à exécuter.
> **Stack vérifiée en build réel le 2026-08-18** (voir §9), **passée à Bun 1.4.0 le 2026-08-20** (§9 bis).
> **Document principal.** Les cinq satellites détaillent chaque axe :
> [Architecture](docs/plan/01-architecture.md) ·
> [Design system](docs/plan/02-design-system.md) ·
> [Capacités média](docs/plan/03-media-capabilities.md) ·
> [Tests](docs/plan/04-testing.md) ·
> [Déploiement & sécurité](docs/plan/05-deploy-security.md)

---

## 1. Ce qu'on construit

Une application web qui édite des **images, vidéos, GIF, audios et sous-titres**, entièrement dans le navigateur, sans qu'aucun octet de média ne quitte la machine de l'utilisateur.

L'application doit servir deux publics dans la même interface :

- le **néophyte** qui veut convertir un PNG en WebP en trois secondes ;
- l'**utilisateur avancé** qui réencode une vidéo en HEVC, jongle avec quatre pistes audio, incruste des sous-titres ASS stylés et coupe à la frame près.

La conséquence de conception : chaque éditeur expose un **chemin court par défaut** (déposer → un réglage évident → exporter) et un **chemin profond replié** (panneaux avancés, contrôle codec, réglages par piste). Jamais un utilisateur simple confronté à une matrice de quantizer ; jamais un utilisateur avancé bloqué par un preset.

---

## 2. Anti-objectifs

Ces lignes ne se franchissent pas. Toute PR qui les franchit est refusée, quelle que soit la justification.

| Interdit                                                                        | Pourquoi                                                                                                                   |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Traitement média côté serveur                                                   | Le 100% client-side est la proposition de valeur, pas une contrainte technique                                             |
| Base de données, de quelque nature que ce soit                                  | Aucune donnée utilisateur n'est collectée, donc rien à stocker                                                             |
| SSR au runtime                                                                  | Le conteneur sert des fichiers statiques et rien d'autre (§9)                                                              |
| FFmpeg, ffmpeg.wasm, tout portage                                               | Mediabunny + WebCodecs couvrent le besoin ; FFmpeg.wasm coûte des dizaines de Mo et s'exécute sans accélération matérielle |
| Télémétrie, analytics, tracking tiers                                           | Pas d'exception, pas même « anonymisée »                                                                                   |
| Upload d'un média vers un service tiers                                         | Y compris pour de l'« amélioration IA »                                                                                    |
| Une dépendance qu'on peut écrire en moins de 200 lignes                         | Chaque dépendance est une surface d'attaque et une dette de mise à jour                                                    |
| Un contrôle natif HTML5 visible (`<video controls>`, `<input type=range>` brut) | Exigence explicite : tous les composants sont custom                                                                       |

---

## 3. Décisions verrouillées

Elles ont été arbitrées avec le porteur du projet le 2026-08-18. Elles ne se re-discutent pas sans raison nouvelle et documentée.

### D1 — TanStack Start en mode SPA, sortie 100% statique

**Retenu.** Start en `spa.enabled`, avec prerender des routes marketing.

Le build produit un `_shell.html` pour les éditeurs plus une page HTML complète par route marketing. Aucun runtime JavaScript en production : le conteneur sert `dist/client/` en statique. On obtient le SEO des pages de présentation (que l'itération précédente cherchait déjà à construire) sans payer un serveur.

**Écarté** : TanStack Router seul — un unique `index.html` vide, SEO entièrement dépendant de l'exécution JS par les crawlers.

### D2 — Sous-titres : SRT, ASS et PGS, en couche entièrement maison

**Retenu.** Les trois formats les plus répandus sont pris en charge de bout en bout : lecture depuis un conteneur, édition, écriture dans un conteneur. **Tout le code sous-titres est le nôtre**, y compris le démultiplexage et le multiplexage des pistes.

**Explicitement écarté** : forker Mediabunny ou soumettre une PR en amont. Le projet ne dépendra pas d'un travail tiers dont le calendrier ne nous appartient pas, et n'aura pas de fork à maintenir ni à défaire si le support arrive nativement.

Ce que ça implique concrètement est détaillé en §4. En résumé : Mediabunny reste responsable de tout ce qu'il sait faire (démux et mux vidéo/audio, décodage, encodage, transcodage), et une couche `core/container` maison prend en charge la seule chose qu'il ne fait pas — les pistes de sous-titres.

### D3 — Ordre de livraison : Image → Audio → GIF → Sous-titres → Vidéo

**Retenu.** Chaque éditeur valide une partie du cœur partagé avant que le suivant s'appuie dessus. La vidéo, qui consomme absolument tout, arrive quand tout est éprouvé. Détail et critères de sortie en §6.

### D4 — Persistance : préférences uniquement

**Retenu.** `localStorage` conserve thème, langue et presets d'export. Rien d'autre. Un onglet fermé perd le travail en cours, et c'est assumé : l'application n'écrit pas de gigaoctets dans l'espace privé du navigateur sans que l'utilisateur l'ait demandé.

**Nuance qui engage le code** : les `*Document` restent **sérialisables en JSON de bout en bout** malgré tout. Ça ne coûte presque rien à l'écriture, ça sert immédiatement aux tests, au débogage et à l'export/import de presets, et ça laisse la porte ouverte à un autosave ultérieur sans refactor du cœur. Aucune classe, aucune closure, aucun `Map` non sérialisable dans un document model — voir [Architecture §3](docs/plan/01-architecture.md).

---

## 4. Les sous-titres sont une couche maison — ce que ça veut dire exactement

**À lire avant d'écrire la première ligne du pilier Sous-titres.**

### Ce que Mediabunny ne fait pas

Vérifié en lisant les types et le code du paquet 1.55.1, pas la documentation :

| Constat                                    | Preuve                                                                                                            |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Un seul codec de sous-titres connu         | `SUBTITLE_CODECS = ["webvtt"]`                                                                                    |
| **Aucune lecture de piste de sous-titres** | `getSubtitleTracks` : zéro occurrence dans toute l'API ; aucun `InputSubtitleTrack`                               |
| Le démuxeur MKV ignore ces pistes          | branches `if (type === 'video')` … `else if (type === 'audio')`, rien d'autre                                     |
| Écriture limitée au VTT                    | mapping EBML : `'webvtt': 'S_TEXT/WEBVTT'`                                                                        |
| Pas de passe-plat de paquets               | `EncodedVideoPacketSource` et `EncodedAudioPacketSource` existent, sans équivalent sous-titres                    |
| Pas d'extension possible                   | `registerDecoder` / `registerEncoder` n'acceptent que vidéo et audio ; `SubtitleSource` a un constructeur interne |

**Portée du constat, au-delà du pilier Sous-titres** : l'éditeur vidéo doit permettre de sélectionner, ajouter, modifier et supprimer les pistes de sous-titres d'une vidéo. Cette fonctionnalité repose donc sur la même couche maison. La phase 5 en dépend autant que la phase 4 — l'ordre retenu en D3 place heureusement les sous-titres avant la vidéo, ce qui est exactement ce qu'il faut.

### Ce qu'on construit à la place

Un module `core/container`, indépendant de Mediabunny, qui fait deux choses et rien d'autre :

**1. Lire les pistes de sous-titres d'un fichier.** Un parseur EBML en lecture seule parcourt l'arbre Matroska, retient les `TrackEntry` de type sous-titre, lit leur `CodecID` et leur `CodecPrivate` (où ASS range l'en-tête de son script), puis collecte les blocs correspondants dans les Clusters. Il ne touche ni à la vidéo ni à l'audio : Mediabunny s'en charge en parallèle sur le même fichier.

**2. Écrire un conteneur complet.** Un multiplexeur Matroska maison assemble les pistes vidéo et audio **telles quelles**, plus nos pistes de sous-titres.

Le point qui rend ce montage praticable, et qui a été vérifié : `EncodedPacketSink` donne accès aux paquets déjà encodés d'une piste, **sans les décoder**, et `EncodedPacket` expose `data`, `type`, `timestamp` et `duration` — précisément ce qu'un multiplexeur attend. Les pistes vidéo et audio traversent donc notre muxeur sans être touchées, sans réencodage et sans perte.

```
   AJOUT DE SOUS-TITRES À UNE VIDÉO EXISTANTE (cas le plus courant)

   source.mkv ──► Mediabunny Input
                  └─ EncodedPacketSink ──► paquets vidéo + audio ─┐
                                                                  ├──► muxeur maison ──► sortie.mkv
   sous-titres édités ─────────────────────────────────────────────┘
                                            aucun réencodage

   EXPORT AVEC RÉENCODAGE

   source ──► Mediabunny : décodage → render graph → encodage ──► conteneur intermédiaire
                                                                        │
                                    EncodedPacketSink ◄─────────────────┘
                                            └─► paquets ─┐
                                                         ├──► muxeur maison ──► sortie.mkv
                          sous-titres édités ────────────┘
```

Sur le premier chemin, ajouter une piste de sous-titres à un film ne réencode rien et ne dégrade rien. Sur le second, la seule surcharge est une passe de copie du fichier — pas un réencodage.

### Ce qui reste contraint par les formats

**Le conteneur de référence pour les sous-titres est MKV.** MP4 ne transporte ni ASS ni PGS : son standard ne connaît que `tx3g` et `wvtt`. Ce n'est pas une limite de notre outillage, c'est le format. Pour un export MP4, les sous-titres partent en fichier séparé ou en VTT, et l'interface le dit au moment du choix.

### Les trois formats, et ce que « éditer » veut dire pour chacun

|                          | SRT           | ASS/SSA                      | PGS                              |
| ------------------------ | ------------- | ---------------------------- | -------------------------------- |
| Nature                   | texte         | texte + styles               | **images**                       |
| CodecID Matroska         | `S_TEXT/UTF8` | `S_TEXT/ASS`                 | `S_HDMV/PGS`                     |
| Éditer le texte          | ✓             | ✓                            | **impossible** — voir ci-dessous |
| Éditer les styles        | —             | ✓ en-têtes et `[V4+ Styles]` | palette et fenêtre               |
| Timings, position, ordre | ✓             | ✓                            | ✓                                |
| Rendu en preview         | notre moteur  | jassub                       | décodage RLE                     |
| Mux et démux             | ✓             | ✓                            | ✓                                |

**PGS n'est pas du texte.** Ce sont des images compressées en RLE avec une palette, découpées en display sets (PCS, WDS, PDS, ODS). Le texte n'existe nulle part dans le fichier. On peut donc tout éditer sauf les mots : timings, position, ordre, suppression, sélection de piste — et on affiche correctement les sous-titres en décodant le RLE.

Changer les mots d'un PGS exigerait de la reconnaissance optique de caractères. **Écarté** (décision prise avec le porteur du projet) : cela ajouterait 10 à 15 Mo de données d'entraînement par langue et produirait un résultat à relire ligne à ligne. Le besoin réel — garder les sous-titres d'un disque Blu-ray intacts en changeant de conteneur — est couvert sans OCR.

### Conçu pour être retiré

Intention explicite du porteur du projet : **le jour où Mediabunny gérera les sous-titres nativement, on bascule dessus et on supprime notre code.** Ce n'est pas une remarque de couloir, c'est une contrainte de conception — un module écrit sans cette perspective devient impossible à extraire proprement.

**Ce qui sera supprimable, et ce qui ne le sera pas.** Mediabunny est une bibliothèque de conteneurs et de codecs, pas un éditeur de sous-titres. S'il ajoute le support, il fournira le transport — pas le modèle de cue, pas les styles ASS, pas le rendu.

| Module                                                                | Le jour où Mediabunny gère les sous-titres |
| --------------------------------------------------------------------- | ------------------------------------------ |
| `core/container` — EBML + muxeur Matroska (~1400 lignes)              | **supprimé**                               |
| `core/subtitles` — parsers, modèle, styles, PGS, rendu (~1600 lignes) | **conservé** — rien ne le remplace         |

**Les trois règles qui rendent le retrait possible**, et qui s'appliquent dès la première ligne :

1. **Une frontière unique et étroite.** Le reste de l'application ne connaît qu'une interface, jamais l'implémentation. Aucun appel direct à l'EBML ou au muxeur ne fuit dans un éditeur.

```ts
export interface ContainerBackend {
  readSubtitleTracks(file: MediaFile): Promise<SubtitleTrackInfo[]>;
  readSubtitlePayload(file: MediaFile, trackId: number): Promise<RawSubtitlePayload>;
  write(spec: ContainerWriteSpec): Promise<Blob>;
}
```

Deux implémentations sont prévues dès le départ : `MatroskaBackend` aujourd'hui, `MediabunnyBackend` le jour venu. Le basculement est un changement de fabrique, pas une refonte.

2. **Le conteneur ignore les formats.** Il ne manipule que des octets horodatés. C'est ce qui garantit que `core/subtitles` survit intact au retrait — les deux modules ne partagent aucune structure interne.

3. **Les tests visent l'interface, pas l'implémentation.** La suite de conformité écrite pour `MatroskaBackend` s'exécute telle quelle contre `MediabunnyBackend`. C'est le filet qui rend la migration sûre : si les mêmes tests passent, la bascule est validée.

**Signaux à surveiller** pour savoir que le moment est venu, dans cet ordre d'importance : apparition d'un `getSubtitleTracks` ou d'un `InputSubtitleTrack` dans l'API, élargissement de `SUBTITLE_CODECS` au-delà de `"webvtt"`, ou ajout d'un `EncodedSubtitlePacketSource`. Le premier suffit à déclencher une réévaluation ; les trois réunis rendent le retrait immédiat.

### Volume de travail à prévoir

Ce pilier est le plus coûteux du projet, et l'essentiel est du code pur, sans I/O ni navigateur, donc entièrement testable hors navigateur, sous Bun.

| Composant                                                     | Ordre de grandeur |
| ------------------------------------------------------------- | ----------------- |
| Parseur EBML en lecture, extraction des pistes de sous-titres | ~500 lignes       |
| Multiplexeur Matroska en écriture                             | ~900 lignes       |
| Parseurs et sérialiseurs SRT et ASS/SSA                       | ~800 lignes       |
| PGS : display sets, décodage RLE                              | ~500 lignes       |
| Intégration du rendu (jassub, PGS → texture)                  | ~300 lignes       |

## 5. Invariants d'architecture

Cinq règles qui ne peuvent pas être rattrapées après coup. Elles existent avant l'éditeur n°1.

### I1 — La preview et l'export traversent le même render graph

Un seul chemin de rendu. Si la preview applique les filtres en WebGL et que l'export les réapplique ailleurs, le WYSIWYG casse — et il casse silencieusement, en mode comparaison ou sur un cas limite, des semaines après. _(L'itération précédente du projet a rencontré exactement ce bug : les filtres étaient appliqués deux fois en mode comparaison, une passe CSS doublant la passe WebGL.)_

L'export n'est pas « le rendu, en plus lent » : c'est **le même graphe, alimenté par la même source, drainé vers un encodeur au lieu d'un écran**.

La source est un décodeur Mediabunny dans les deux cas — y compris en preview, conformément au cahier des charges. Un élément `<video>` ne permet pas d'atteindre une frame précise et ne traite pas l'espace colorimétrique comme un `VideoFrame` décodé : l'utiliser en preview casserait I1 à la racine et rendrait l'édition à la frame près inatteignable. Détail en [Architecture §5](docs/plan/01-architecture.md).

### I2 — Un seul bus de commandes pour l'undo/redo

« À tout moment on doit pouvoir revenir en arrière » vaut pour les cinq éditeurs. L'undo est le cas d'école de ce qui ne se greffe pas après coup. Le command bus et les document models existent dans `core/` avant le premier éditeur.

### I3 — Un seul cœur média

Un module `core/media/` enveloppe Mediabunny (Input, Output, décodage, encodage, muxing). Les cinq éditeurs l'appellent. Pas cinq intégrations parallèles qui divergent.

### I4 — Discipline de cycle de vie sur `VideoFrame` et `AudioData`

Ce sont des ressources à libération explicite. Une frame non fermée pendant un scrub fait exploser la mémoire de l'onglet en quelques secondes. Règle : **tout `VideoFrame` a un propriétaire unique et documenté, qui appelle `.close()`**. Le cœur fournit des helpers qui rendent la fuite difficile plutôt que de compter sur la vigilance.

### I5 — Le décodage et l'encodage vivent dans des workers

La preview fluide en temps réel est impossible si le décodage occupe le thread principal. Transferts via transferables, orchestration via Comlink.

---

## 6. Phases

Chaque phase est **livrable indépendamment** et se termine sur des critères vérifiables. Une phase n'est pas close parce que le code est écrit : elle est close quand ses critères passent.

### Phase 0 — Socle

Aucun média n'est traité dans cette phase. On construit ce sur quoi tout le reste s'appuie.

- Projet TanStack Start en mode SPA, TypeScript 7, Vite 8, **Bun 1.4.0** (seul runtime de la chaîne, aucun Node — §9 bis)
- oxlint + oxfmt configurés strictement, CI qui échoue sur la moindre violation
- Design system : tokens Catppuccin, thèmes light/dark/système, primitives (voir [Design system](docs/plan/02-design-system.md))
- i18n : 7 langues, détection depuis la locale de l'OS, extraction typée
- `core/history` : command bus et undo/redo, testé sur un document jouet
- `core/document` : contrat de sérialisation
- `core/environment` : détection des capacités du navigateur — WebCodecs vidéo et audio, écriture en flux, codecs disponibles
- Dockerfile, pipeline GitHub Actions, déploiement Railway, Cloudflare devant
- `CLAUDE.md` et `README.md`

**Critères de sortie**

- `bun run ci` vert : typecheck TS7, lint, format, tests unitaires
- vixely.app sert une page d'accueil réelle, en HTTPS, derrière Cloudflare
- Le basculement de thème et de langue fonctionne et survit à un rechargement
- Undo/redo prouvé par des tests sur un document jouet
- **La détection d'environnement produit le bon message sur les cinq configurations du tableau §10** — c'est une brique de socle : tous les chemins d'export en dépendent, et l'écrire en phase 5 serait la découvrir trop tard
- Lighthouse ≥ 95 en Performance et Accessibilité sur la page d'accueil

### Phase 1 — Éditeur d'images

Le plus simple des cinq, et pourtant il exerce le cœur en entier **sauf la dimension temporelle**. C'est exactement pour ça qu'il vient en premier.

- `core/render` : render graph WebGL2, chaîne de filtres, chemin identité court-circuité, source de frames abstraite (une image aujourd'hui, un décodeur en phase 2)
- Décodage/encodage image, conversion de formats, optimisation
- Crop, rotation, redimensionnement avec choix de l'algorithme de rééchantillonnage
- Correction colorimétrique et filtres
- Couche texte
- Canvas de travail : zoom, pan, ajuster à l'écran, zoom natif 1:1

**Critères de sortie**

- L'export est **pixel-identique à la preview**, prouvé par un test de comparaison avec tolérance documentée (I1)
- Undo/redo couvre toutes les opérations de l'éditeur
- Une image de 8000×6000 reste fluide au pan et au zoom
- Aucune fuite mémoire après 200 opérations enchaînées (test instrumenté)

### Phase 2 — Éditeur audio

Introduit le temps, le décodage Mediabunny et les workers.

- `core/media` : Input/Output Mediabunny, décodage en worker
- Lecteur audio custom : transport, volume, plein écran, sélection de piste, visualisation du spectre
- Conversion de formats et optimisation, via l'API `Conversion` de haut niveau
- Crop, découpe, réarrangement, concaténation
- Normalisation, égaliseur, filtres

**Critères de sortie**

- Lecture fluide et scrub réactif sur un fichier d'une heure
- Extensions d'encodage branchées et testées : MP3, AAC, FLAC, AC-3, DTS
- Le graphe de traitement audio produit un rendu identique en preview et à l'export (I1 appliqué à l'audio)
- Aucun `AudioData` fuité, vérifié par compteur instrumenté (I4)

### Phase 3 — Éditeur GIF

Première timeline discrète, réutilise le render graph de la phase 1.

- Décodage GIF en frames, timeline de frames
- Suppression, réarrangement, réglage des délais
- Crop, redimensionnement, filtres, texte — via `core/render`
- Extraction de frames, avec ouverture directe dans l'éditeur d'images
- Encodage GIF, quantification de palette, dithering
- Conversion vers WebP animé / APNG / vidéo

**Critères de sortie**

- Un GIF de 500 frames se charge et s'édite sans blocage de l'UI
- Le réarrangement de frames est couvert par l'undo/redo
- La qualité de quantification est comparée à une référence sur des fixtures

### Phase 4 — Sous-titres : conteneur et éditeur

La phase la plus lourde, et celle dont la phase 5 dépend directement. Elle se déroule en deux temps.

**4a — La couche conteneur (`core/container`)**

- Parseur EBML en lecture : extraction des pistes de sous-titres d'un MKV, `CodecID` et `CodecPrivate` compris
- Multiplexeur Matroska en écriture : pistes vidéo et audio en passe-plat via `EncodedPacketSink`, plus nos pistes de sous-titres
- Chemin sans réencodage : ajouter une piste de sous-titres à une vidéo existante ne touche pas aux pixels

**4b — Les formats et l'éditeur**

- Parseurs et sérialiseurs SRT, WebVTT, ASS/SSA — modèle de cue unifié, modèle de style ASS
- PGS : lecture des display sets, décodage RLE, palette, fenêtre
- Éditeur de cues : timings, texte, chevauchements, contrôle de lisibilité (CPS)
- Éditeur d'en-têtes et de styles ASS
- Conversion entre formats, avec pertes annoncées explicitement
- Rendu : jassub pour l'ASS, décodage RLE pour le PGS, les deux entrant dans le graphe par la passe `[subs]`

**Critères de sortie**

- Aller-retour parse → sérialise **sans perte** sur un corpus de fixtures réelles, pour SRT, VTT et ASS
- Aller-retour démux → mux d'un MKV **bit-identique** sur les pistes vidéo et audio : le passe-plat ne dégrade rien
- Une piste PGS extraite d'un MKV Blu-ray, réinjectée dans un autre conteneur, s'affiche correctement dans VLC et mpv
- Les pertes de conversion sont énumérées et affichées avant l'action
- Le rendu est synchronisé sur l'horloge du lecteur, pour les trois formats

### Phase 5 — Éditeur vidéo

Assemble tout ce qui précède.

- Lecteur vidéo custom : transport complet, plein écran, volume, vitesse, navigation à la frame / à la keyframe / au temps
- Multipiste : sélection, ajout, modification, suppression des pistes vidéo, audio et sous-titres — **les pistes de sous-titres passent par `core/container` livré en phase 4**
- Filtres et correction colorimétrique via `core/render`
- Couche texte, incrustation de sous-titres
- Découpe à la frame près
- Contrôle d'encodage : codec, conteneur, `quality` / quantizer, résolution, framerate
- Les trois modes d'export de sous-titres de §4

**Critères de sortie**

- Preview fluide sur du 1080p, avec dégradation contrôlée et annoncée sur du 4K
- L'export respecte I1 : comparaison pixel entre une frame de preview et la frame encodée correspondante
- Multipiste vérifié sur un MKV réel à plusieurs pistes audio et sous-titres, ASS et PGS compris
- Un export d'une heure ne fait pas exploser la mémoire

### Phase 6 — Finition et lancement

- Audit d'accessibilité complet, navigation clavier de bout en bout, lecteur d'écran
- Passe de performance : budget de bundle, code splitting par éditeur, chargement paresseux des extensions Mediabunny
- Traductions relues pour les 7 langues
- Passe responsive : mobile, tablette, mode tactile, écrans larges, DPI élevé
- Identité visuelle finalisée, logo, favicon, Open Graph
- Revue de sécurité, CSP durcie, en-têtes vérifiés en production

---

## 7. Arborescence cible

```
vixely/
├── .github/workflows/
│   ├── ci.yml                    # typecheck · lint · fmt · tests
│   └── deploy.yml                # build image · push · Railway
├── docs/
│   ├── plan/                     # les cinq satellites de ce plan
│   └── adr/                      # décisions prises en cours de route
├── public/
│   ├── jassub/                   # WASM jassub (livré par le package)
│   ├── fonts/
│   └── robots.txt
├── src/
│   ├── routes/                   # file-based routing TanStack
│   │   ├── __root.tsx
│   │   ├── index.tsx             # accueil — prerendue
│   │   ├── (marketing)/          # pages SEO — prerendues
│   │   └── tools/
│   │       ├── image.tsx  audio.tsx  gif.tsx
│   │       ├── subtitles.tsx  video.tsx
│   ├── core/                     # aucun import React ici
│   │   ├── media/                # unique façade Mediabunny (I3)
│   │   │   ├── input.ts  output.ts  codecs.ts  probe.ts
│   │   ├── render/               # render graph WebGL2 (I1)
│   │   │   ├── graph.ts  passes/  shaders/
│   │   ├── history/              # command bus undo/redo (I2)
│   │   ├── document/             # document models sérialisables (D4)
│   │   ├── resources/            # cycle de vie VideoFrame/AudioData (I4)
│   │   ├── workers/              # workers décode/encode (I5)
│   │   ├── container/            # EBML/Matroska maison : démux + mux sous-titres (§4)
│   │   │   ├── ebml-reader.ts  matroska-muxer.ts  packets.ts
│   │   └── subtitles/            # SRT · VTT · ASS/SSA · PGS (§4)
│   │       ├── srt.ts  vtt.ts  ass.ts  pgs.ts  model.ts
│   ├── editors/
│   │   ├── image/  audio/  gif/  subtitles/  video/
│   │   └── shared/               # panneaux et logique communs aux éditeurs
│   ├── ui/                       # design system, agnostique du métier
│   ├── i18n/
│   │   ├── config.ts
│   │   └── locales/{en,fr,es,it,de,zh,ja}/
│   ├── stores/                   # Zustand — état UI uniquement
│   └── styles/
├── tests/
│   ├── fixtures/                 # médias courts commités (§ Tests)
│   ├── unit/                     # hors navigateur — logique pure
│   ├── browser/                  # Vitest browser mode — WebCodecs, WebGL
│   └── e2e/                      # Playwright
├── Dockerfile
├── Caddyfile
├── CLAUDE.md
├── README.md
└── PLAN.md
```

**Règle de dépendance** : `core/` ne connaît ni React, ni Zustand, ni TanStack. `editors/` importe `core/` et `ui/`. `ui/` n'importe ni `core/` ni `editors/`. Cette règle est vérifiée par une règle de lint, pas par la discipline.

---

## 8. Journal de décisions

À compléter au fil du projet dans `docs/adr/`. Les entrées initiales :

| #    | Décision                                                                           | Raison                                                                                                      |
| ---- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 001  | TanStack Start mode SPA plutôt que Router seul                                     | SEO prerendu sans runtime serveur — D1                                                                      |
| 002  | Sortie statique servie par Caddy, aucun runtime JS en prod                         | Surface d'attaque minimale, image légère                                                                    |
| 003  | Toute la chaîne sous-titres écrite en interne                                      | Mediabunny ne lit aucune piste de sous-titres et n'écrit que du VTT — §4                                    |
| 004  | Muxeur et démuxeur Matroska maison                                                 | Seule façon de porter SRT, ASS et PGS sans dépendre d'un tiers                                              |
| 004b | Ni fork de Mediabunny ni PR en amont                                               | Pas de calendrier tiers sur le chemin critique, pas de fork à maintenir ni à défaire                        |
| 004c | Pas d'OCR sur le PGS                                                               | 10–15 Mo par langue pour un résultat à relire ; le besoin réel est couvert sans                             |
| 004d | MKV pour les sous-titres embarqués, MP4 en VTT ou sidecar                          | MP4 ne standardise ni ASS ni PGS                                                                            |
| 004e | `core/container` conçu pour être retiré, derrière une interface                    | Bascule vers Mediabunny prévue dès qu'il gérera les sous-titres                                             |
| 014  | Tous navigateurs servis, limites détectées et annoncées                            | Ne jamais laisser découvrir une limite après le travail — §10                                               |
| 015  | Pas de PWA, pas de service worker                                                  | Cache et invalidation à maintenir ; risque de servir une version périmée                                    |
| 016  | Aucun mécanisme de diagnostic ni rapport d'erreur                                  | Cohérence avec l'absence totale de télémétrie — §10                                                         |
| 017  | Bun 1.4 seul runtime de la chaîne, absent de la production ; aucun Node nulle part | Un seul runtime à installer et à épingler ; une régression Bun ne peut pas atteindre la production — §9 bis |
| 005  | Un seul render graph pour preview et export                                        | Le double chemin a déjà produit un bug de double application — I1                                           |
| 006  | Documents sérialisables sans autosave                                              | Ouvre la porte à la persistance sans refactor — D4                                                          |
| 007  | `quality` / quantizer plutôt que bitrate                                           | Mediabunny v1.52 déprécie les champs bitrate                                                                |
| 008  | Pas de cross-origin isolation (COOP/COEP)                                          | `SharedArrayBuffer` inutile côté navigateur ici — voir Déploiement                                          |
| 009  | oxfmt en beta, épinglé à l'exact                                                   | 0.x : une montée mineure peut reformater tout le dépôt                                                      |
| 010  | Preview décodée par Mediabunny, pas par `<video>`                                  | Frame près inatteignable via `currentTime` ; deux sources casseraient I1                                    |
| 011  | jassub entre dans le graphe comme texture                                          | Un overlay CSS recréerait le double chemin de rendu                                                         |
| 012  | Import HLS depuis une URL hors périmètre v1                                        | Exigerait d'ouvrir `connect-src` ; non demandé au cahier des charges                                        |
| 013  | react-aria-components pour les primitives complexes                                | WCAG 2.2 AA exigé ; réécrire focus et clavier perd l'accessibilité silencieusement                          |

---

## 9. Versions — vérifiées, pas recopiées

Le tableau est scindé selon ce qui a réellement été éprouvé — la distinction compte, parce qu'un numéro de version relevé sur npm ne dit rien de l'intégration.

Le premier groupe a été installé et construit ensemble le 2026-08-18 — avec Bun 1.3.14, la 1.4.0 n'existant pas encore ce jour-là ; c'est la seule ligne du tableau qui n'a pas été exercée telle quelle (§9 bis) : le build produit bien `_shell.html` plus les pages prerendues, `tsc --noEmit` passe, et le CSS Tailwind est généré. Le second groupe est la dernière version stable publiée, sans plus.

### Vérifiées ensemble, dans un build réel

Installées dans un même projet, construites, et le résultat inspecté.

| Paquet                  | Version    | Note                                                                                                                                                                                                             |
| ----------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bun                     | **1.4.0**  | gestionnaire de paquets, lanceur de scripts et runtime de la chaîne — voir §9 bis. **Le build du 2026-08-18 a été fait en 1.3.14** ; la 1.4.0 est la version retenue, exercée par le premier build de la phase 0 |
| TypeScript              | **7.0.2**  | compilateur natif ; `tsc --noEmit` passe sur l'arbre de routes généré                                                                                                                                            |
| Vite                    | **8.2.1**  | Rolldown                                                                                                                                                                                                         |
| React / React DOM       | 19.2.8     |                                                                                                                                                                                                                  |
| @tanstack/react-start   | 1.168.47   | **RC** — build SPA + prerender vérifié                                                                                                                                                                           |
| @tanstack/react-router  | 1.170.30   |                                                                                                                                                                                                                  |
| @tanstack/router-plugin | 1.168.33   | déclare `vite >=8.0.0` en peer                                                                                                                                                                                   |
| Tailwind CSS            | 4.3.3      | via `@tailwindcss/vite` — CSS généré, aucun conflit Rolldown                                                                                                                                                     |
| Mediabunny              | 1.55.1     | import dynamique vérifié : sort dans un chunk séparé de 306 Ko                                                                                                                                                   |
| @mediabunny/dts         | 1.55.1     | l'extension se résout et se bundle                                                                                                                                                                               |
| oxlint                  | 1.79.0     | exécuté sur du code réel ; **règle de frontières de couches confirmée** (§ ci-dessous)                                                                                                                           |
| oxfmt                   | **0.64.0** | beta — épingler à l'exact, pas de `^`                                                                                                                                                                            |

**Points vérifiés qui conditionnent le pilier Sous-titres** : `SUBTITLE_CODECS` ne contient que `"webvtt"` ; `getSubtitleTracks` n'existe nulle part dans l'API ; le démuxeur Matroska ne branche que sur `video` et `audio`. À l'inverse, `EncodedPacketSink` donne bien accès aux paquets encodés sans décodage, `EncodedPacket` expose `data` / `type` / `timestamp` / `duration`, et `StreamTarget` permet l'écriture en flux — les trois briques dont dépend le montage décrit en §4.

**Point vérifié qui conditionne un invariant** : la règle de couches de [Architecture §1](docs/plan/01-architecture.md) est réellement applicable. `no-restricted-imports` avec `patterns` et `overrides` par chemin fonctionne dans oxlint 1.79 — un `import { useState } from 'react'` placé dans `src/core/` est signalé, le même import dans `src/routes/` ne l'est pas. L'invariant est donc outillé, pas seulement conventionnel.

### Bun : politique de version

**État au 2026-08-20** : **Bun 1.4.0 est publié** — sur npm le 2026-08-20 (`dist-tags.latest = 1.4.0`), image `oven/bun:1.4.0-alpine` disponible. C'est **la** version du projet, épinglée à l'exact dans le Dockerfile.

**Bun est le seul runtime JavaScript de la chaîne. Node n'intervient nulle part** — ni pour installer, ni pour construire, ni pour tester, ni en production. Un seul runtime à installer, à épingler et à connaître.

| Où                    | Quoi                                                                |
| --------------------- | ------------------------------------------------------------------- |
| `bun install`         | résolution et installation des dépendances, `bun.lock`              |
| `bun run`             | lancement des scripts, y compris Vite, Vitest, Playwright et oxlint |
| Image Docker de build | étape de construction uniquement                                    |

Bun n'est **pas** dans le runtime de production : le conteneur final sert des fichiers statiques via Caddy, sans aucun processus JavaScript. Il n'est pas non plus le bundler (c'est Vite/Rolldown), ni le moteur de tests (c'est Vitest, lancé par `bun run`, exécuté par le runtime Bun). **Une régression de Bun ne peut donc casser que la chaîne de construction, jamais le site en ligne.**

**Repli en cas de régression** : réépingler la version Bun stable précédente (1.3.14, vérifiée en build réel le 2026-08-18) le temps d'un correctif amont. Un changement d'une ligne dans le `ARG BUN_VERSION` du Dockerfile et dans le workflow CI. Il n'y a pas de repli Node : c'est un choix, pas un oubli.

#### Ce que la 1.4 apporte à ce projet

Notre exposition à Bun est étroite — install, `bun run`, étape de build. Ce qui suit est donc court par construction, et c'est normal.

| Apport                                                  | Usage ici                                                                                                                                                                                                                     |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun run --parallel`                                    | `bun run ci` fait éclater typecheck, lint, format et tests unitaires en parallèle, sortie préfixée par nom de script — voir [Tests §9](docs/plan/04-testing.md). `--sequential` et `--no-exit-on-error` complètent            |
| `bun audit fix`                                         | remédiation, plus seulement détection. En CI on lance `bun audit`, qui ne fait que rapporter ; `fix` se lance à la main, `fix --dry-run` pour voir avant, `fix --latest` seulement si un correctif exige un changement majeur |
| `bun pm licenses --prod --json`                         | inventaire de licences vérifiable en CI — apport net, le plan n'avait rien là-dessus                                                                                                                                          |
| `bun dedupe --check`                                    | échoue le CI sur une duplication de version dans `bun.lock`                                                                                                                                                                   |
| `ignoreScripts`, `nativeDependencies` en `package.json` | coupe les scripts de cycle de vie paquet par paquet                                                                                                                                                                           |
| `trustedDependencies` restreint au registre npm         | une dépendance `git:`, `github:`, `file:` ou `link:` homonyme n'hérite plus d'aucune confiance                                                                                                                                |
| `bun update` sur les dépendances transitives            | mises à jour groupées réellement complètes                                                                                                                                                                                    |

Les deux premières lignes sont confirmées sur la documentation CLI de Bun ; les autres proviennent de l'annonce 1.4 et se vérifient au premier usage.

**À essayer en phase 0, sans engagement** : `linker = "isolated"` dans `bunfig.toml` (store global symlinké, annoncé 7× plus rapide en CI à cache chaud). Un `node_modules` symlinké est exactement ce qui met en défaut les outils qui résolvent des chemins d'assets — plugins Vite 8/Rolldown, téléchargement des navigateurs Playwright, WASM de jassub, extensions `@mediabunny/*`. Si ça résiste, on revient au linker par défaut sans discussion.

**Ce qui, dans Bun, ne nous concerne pas** — à savoir pour éviter une fausse bonne idée :

- `Bun.Image`, `Bun.WebView`, `Bun.markdown`, `Bun.cron`, `Bun.Terminal`, HTTP/3 dans `Bun.serve()` : toutes des API serveur, exclues par l'anti-objectif « aucun traitement média côté serveur ». Aucune API Bun de manipulation de média n'a d'usage ici, quelle que soit la version.
- `bun test` et ses nouveautés (`--parallel`, `--shard`, `--isolate`, `--changed`) : le moteur de tests est Vitest, et le mode navigateur est obligatoire pour WebCodecs et WebGL2 — voir [Tests §1](docs/plan/04-testing.md).

#### À vérifier au premier build de la phase 0

La 1.4 n'a pas été exercée dans le build du 2026-08-18, qui tournait en 1.3.14. Le premier build vert de la phase 0 **est** la procédure de validation ; il n'y a pas de projet à valider avant lui.

```bash
bun --version                     # 1.4.0
bun install                       # résolution des peers TanStack + Vite 8
bun run typecheck                 # tsc --noEmit
bun run lint && bun run fmt --check
bun run build                     # _shell.html + pages prerendues présents ?
bun run test                      # Vitest sous Bun, étage 1 puis mode navigateur
```

Trois points de vigilance en particulier :

- **Vitest et Playwright sous le runtime Bun.** L'annonce 1.4 les cite parmi les outils désormais compatibles ; ce n'est pas vérifié ici. C'est le seul risque sérieux de la bascule, parce que c'est le seul endroit où Bun exécute autre chose que le lancement d'un binaire. Si Vitest browser mode résiste, le problème se traite en amont, pas en réintroduisant Node.
- **Le format de `bun.lock`.** Il gagne des empreintes SHA-512 pour les dépendances GitHub et tarball ; le fichier se met à jour à la première installation et doit être committé tel quel.
- **La résolution des peer dependencies**, dont dépend l'assemblage TanStack + Vite 8 validé plus haut.

### Dernière stable, intégration non encore exercée

Relevées sur npm le 2026-08-18, mais pas installées ni construites avec le reste. À valider en phase 0.

| Paquet                                                          | Version | Usage                                                                        |
| --------------------------------------------------------------- | ------- | ---------------------------------------------------------------------------- |
| Zustand                                                         | 5.0.15  | état d'interface                                                             |
| Vitest + @vitest/browser                                        | 4.1.11  | étages de test 1 à 3                                                         |
| Playwright                                                      | 1.62.1  | e2e et audit d'accessibilité                                                 |
| @axe-core/playwright                                            | 4.13.0  | accessibilité automatisée                                                    |
| jassub                                                          | 2.5.14  | rendu ASS/SSA                                                                |
| react-aria-components                                           | 1.20.0  | primitives headless — voir [Design system §4](docs/plan/02-design-system.md) |
| @mediabunny/ac3, aac-encoder, mp3-encoder, flac-encoder, prores | 1.55.1  | extensions de codec                                                          |
| Comlink                                                         | 4.4.2   | frontière typée des workers                                                  |
| @tanstack/react-virtual                                         | 3.14.10 | listes longues                                                               |

**Points de vigilance**

- `@tanstack/react-start` est en RC. Si un blocage survient, le repli est TanStack Router seul, en acceptant la perte du prerender (D1 devient caduque).
- TypeScript 7 est le compilateur natif. Repli documenté : TypeScript 5.9.x, sans changement de code.
- L'export du routeur s'appelle **`getRouter`**, pas `createRouter` — l'API v1 l'exige, et l'erreur est cryptique si on se trompe.

---

## 10. Navigateurs cibles et limites d'environnement

**Décision : tous les navigateurs sont servis, et l'application dit ce qu'elle ne peut pas faire là où elle tourne.** Aucun visiteur ne se voit refuser l'entrée ; en revanche il n'apprend jamais une limite en perdant son travail.

### Ce que chaque navigateur permet, vérifié le 2026-08-18

|                                       | Chrome · Edge | Firefox desktop | Safari 26+ | Safari < 26 | Firefox Android |
| ------------------------------------- | ------------- | --------------- | ---------- | ----------- | --------------- |
| WebCodecs vidéo                       | ✓             | ✓ (130+)        | ✓          | ✓ (16.4+)   | **✗**           |
| WebCodecs audio                       | ✓             | ✓               | ✓          | **✗**       | **✗**           |
| Écriture fichier en flux              | ✓             | **✗**           | **✗**      | **✗**       | **✗**           |
| Taille d'export praticable            | illimitée     | ~2–4 Go         | ~2–4 Go    | ~2–4 Go     | —               |
| Audio en passe-plat (sans réencodage) | ✓             | ✓               | ✓          | **✓**       | ✗               |

### La conséquence qui compte : la taille des exports

`showSaveFilePicker` n'existe que sur Chromium. Ailleurs, le fichier de sortie doit être **entièrement assemblé en mémoire** avant d'être proposé au téléchargement — un export de 10 Go tue l'onglet.

Ce n'est pas un détail de confort : c'est une différence de capacité fonctionnelle entre navigateurs, sur une application dont le cœur de métier est le réencodage vidéo.

**Traitement retenu** :

- Sur Chromium, l'export écrit directement sur le disque, en flux. Pas de plafond pratique.
- Ailleurs, l'application **estime la taille de sortie avant de lancer l'export** et prévient si elle approche du seuil, en proposant les recours réels : réduire la qualité, découper en segments, ou passer sur un navigateur Chromium.
- L'avertissement arrive **avant** le travail, jamais après quarante minutes d'encodage.

### Les autres écarts

- **Safari antérieur à 26** n'a ni `AudioEncoder` ni `AudioDecoder`. L'éditeur audio y est indisponible et les pistes audio ne peuvent pas être **réencodées**. En revanche le **passe-plat audio reste possible** : `EncodedPacketSink` lit les paquets déjà encodés sans rien décoder, et ils sont réécrits tels quels. Un utilisateur sur Safari 25 peut donc découper une vidéo, la recadrer ou la filtrer **en conservant sa bande son intacte** — la dégradation est bien plus douce que « pas d'audio du tout », et l'interface doit le formuler ainsi.
- **Firefox sur Android** ne supporte WebCodecs dans aucune version. L'application affiche un message d'incompatibilité explicite, plutôt qu'une interface qui échoue sans raison lisible.
- Le sondage par `isConfigSupported()` reste la règle générale : ce que la machine ne sait pas faire n'est jamais proposé (voir [Capacités média §7](docs/plan/03-media-capabilities.md)).

### Pas de mécanisme de diagnostic

Décision assumée : aucun rapport d'erreur, aucun envoi, aucune collecte. Un plantage chez un utilisateur ne remontera pas.

La compensation n'est pas un outil de diagnostic mais deux choix de conception déjà actés : le **sondage préalable**, qui empêche la plupart des échecs de se produire, et des **messages d'erreur auto-descriptifs** — nommant le codec, l'étape et l'environnement — pour que quelqu'un qui ouvre une issue de sa propre initiative ait l'information sous les yeux.

À noter, sans revenir sur la décision : les tests ne couvrent pas cette classe de problème. Le CI tourne sur une configuration ; la variabilité des pilotes et des implémentations WebCodecs entre machines lui échappe par construction.

## 11. Une note sur la mémoire du projet

`~/.claude/.../memory/MEMORY.md` décrit une architecture (`src/routes/tools/video.tsx`, `shared-core`, encodeur gifenc, système ToolRail) dont **le code n'existe plus** : il a été supprimé au commit `0b4cb71 « Projet reset »`. Une session future qui irait chercher ces fichiers ne les trouvera pas.

Ce qui mérite d'être conservé de cette itération, et qui est déjà intégré au présent plan : la convergence vers un type `FilterParams` unifié partagé par tous les éditeurs, le chemin identité court-circuité dans le pipeline WebGL, le bug de double application des filtres en mode comparaison (I1), et le fait que Mediabunny seul suffit — aucun FFmpeg n'a jamais été nécessaire.
