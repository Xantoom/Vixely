# 04 — Stratégie de tests

Retour au [plan principal](../../PLAN.md).

---

## 1. Le contrainte qui détermine tout

**WebCodecs, WebGL et Web Audio n'existent ni dans jsdom ni dans happy-dom.** Aucun test touchant au décodage, à l'encodage ou au rendu ne peut tourner dans un environnement DOM simulé. Ce n'est pas une préférence, c'est une impossibilité.

Conséquence : la suite est découpée en trois étages, avec des environnements d'exécution différents. Une suite unique « qui teste tout » ne peut pas exister ici.

L'objectif est de pousser **le maximum de logique vers l'étage 1**, qui est rapide, déterministe et exécutable partout. Une architecture où `core/` ne dépend pas de React (voir [Architecture §1](01-architecture.md)) sert directement cet objectif.

---

## 2. Étage 1 — Logique pure, hors navigateur

**Environnement** : Vitest sous Bun, sans DOM. **Vitesse** : la suite entière sous 5 secondes. **Part visée** : le gros du volume de tests.

| Domaine                           | Ce qui est vérifié                                                                                             |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Parsers de sous-titres            | aller-retour parse → sérialise sans perte : SRT, VTT, ASS                                                      |
| PGS                               | display sets décodés, RLE, palette — comparaison au bitmap attendu                                             |
| Parseur EBML                      | structure d'un MKV correctement parcourue, pistes de sous-titres retrouvées                                    |
| Muxeur Matroska                   | fichier produit conforme, relisible par Mediabunny et par un démuxeur de référence                             |
| **Conformité `ContainerBackend`** | suite écrite contre l'interface, pas l'implémentation — rejouable telle quelle sur un futur backend Mediabunny |
| Conversion de sous-titres         | pertes annoncées conformes à la matrice                                                                        |
| Document models                   | `parse(stringify(doc)) === doc` pour chaque type                                                               |
| Command bus                       | apply/invert, fusion par `mergeKey`, plafond d'historique                                                      |
| Construction du plan d'export     | quel chemin (`Conversion` ou manuel), quels réglages                                                           |
| Sélection de codec                | conteneur compatible, extension requise                                                                        |
| Calculs                           | dimensions, ratios, timecodes, tailles, framerates                                                             |
| Tokens de couleur                 | **contraste WCAG de chaque paire de tokens, dans les deux thèmes**                                             |

Le test de contraste mérite d'être souligné : Catppuccin n'est pas conforme AA par construction, certaines paires échouent. Le vérifier à l'œil laisse passer des régressions. Ce test échoue le CI.

---

## 3. Étage 2 — Composants, en navigateur réel

**Environnement** : Vitest browser mode, Chromium et Firefox. **Vitesse** : dizaines de secondes.

| Domaine          | Ce qui est vérifié                                                                       |
| ---------------- | ---------------------------------------------------------------------------------------- |
| Primitives d'UI  | clavier complet, ARIA, gestion du focus                                                  |
| Dialogues        | piégeage du focus, restitution au déclencheur                                            |
| Slider           | double-clic → défaut, Maj → fin, Alt → grossier, une seule entrée d'historique par geste |
| Select, Combobox | flèches, Début/Fin, recherche par frappe, Échap                                          |
| Thème            | bascule des trois positions, persistance au rechargement                                 |
| i18n             | rendu dans les sept langues, aucune clé manquante                                        |
| Canvas           | zoom, pan, ajuster, 1:1, correction `devicePixelRatio`                                   |

---

## 4. Étage 3 — Média, en navigateur réel

**Environnement** : Vitest browser mode et Playwright, Chromium impérativement (couverture codec la plus large). **Vitesse** : minutes. **C'est le seul étage qui prouve que l'application fonctionne.**

| Domaine                    | Ce qui est vérifié                                                                                                         |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Sondage                    | `isConfigSupported()` cohérent avec ce que propose l'UI                                                                    |
| Dégradation par navigateur | l'absence d'écriture en flux, d'`AudioEncoder` ou de WebCodecs produit le bon avertissement, avant le travail et non après |
| Décodage                   | chaque conteneur des fixtures s'ouvre, pistes correctement listées                                                         |
| Encodage                   | chaque codec disponible produit un fichier relisible                                                                       |
| Aller-retour               | encoder puis redécoder redonne des dimensions, une durée et un nombre de pistes corrects                                   |
| **Passe-plat du muxeur**   | démuxer puis remuxer un MKV redonne des pistes vidéo et audio **bit-identiques**                                           |
| Sous-titres embarqués      | une piste ASS et une piste PGS réinjectées restent lisibles par VLC et mpv                                                 |
| **Preview = export**       | comparaison pixel — le cœur de I1, détaillé en §6                                                                          |
| Navigation à la frame      | atteindre la frame _n_ donne bien la frame _n_, vérifié sur une fixture à frames numérotées                                |
| **Fuites mémoire**         | compteur d'allocation/libération de `VideoFrame` et `AudioData` équilibré                                                  |
| Workers                    | annulation coopérative, libération effective des ressources                                                                |
| Parcours complets          | déposer → éditer → exporter, pour chacun des cinq éditeurs                                                                 |
| Accessibilité              | `@axe-core/playwright` sur chaque route                                                                                    |

---

## 5. Fixtures

Des médias réels, courts, commités dans le dépôt. **Contrainte : quelques kilooctets à quelques centaines de kilooctets chacun** — un dépôt public dont le clone pèse 200 Mo de fixtures est un dépôt qu'on cesse de cloner.

```
tests/fixtures/
├── video/
│   ├── h264-1080p-2s.mp4          conteneur et codec de référence
│   ├── h264-aac-multitrack.mkv    3 pistes audio, 2 sous-titres
│   ├── vp9-opus-alpha.webm        canal alpha
│   ├── hevc-1s.mp4                sondage conditionnel
│   ├── av1-1s.mp4
│   ├── vfr-screencap.mp4          framerate variable — cas piège
│   └── no-audio.mp4               absence de piste
├── audio/
│   ├── stereo-44k.wav  mono-48k.flac  cbr.mp3  vbr.mp3
│   ├── ac3-5.1.ac3     dts.dts        opus.ogg
│   └── clipping.wav               teste la normalisation
├── image/
│   ├── srgb.png  p3.png  exif-gps.jpg  transparent.webp
│   ├── animated.gif  cmyk.jpg  huge-8000x6000.png  1x1.png
├── gif/
│   ├── 500-frames.gif  variable-delay.gif  single-frame.gif
└── subtitles/
    ├── basic.srt  styled.ass  positioned.vtt
    ├── overlapping.srt  bom-utf8.srt  cp1252.srt
    └── karaoke.ass
```

Les fixtures « pièges » (`vfr-screencap`, `cmyk.jpg`, `cp1252.srt`, `clipping.wav`, `no-audio.mp4`) valent plus que les fixtures nominales : elles couvrent ce qui casse réellement en production. Un script documenté régénère l'ensemble, pour qu'un ajout ultérieur reste reproductible.

---

## 6. Comparaison pixel — comment on prouve I1

C'est le test le plus important du projet, et il est délicat pour une raison précise : **la sortie GPU n'est pas identique au bit près d'une machine à l'autre.** Pilotes, versions, précision des flottants diffèrent. Un test d'égalité stricte est vert sur le poste du développeur et rouge en CI, pour de mauvaises raisons.

**Méthode** :

1. Charger une fixture, appliquer un document d'édition non trivial (filtres, crop, texte, sous-titres).
2. Capturer la frame _n_ du canvas de preview — alimenté par le décodeur Mediabunny, pas par un `<video>`.
3. Exporter, redécoder la sortie, extraire la frame _n_.
4. Comparer en distance perceptuelle, pas en égalité d'octets.

Le point 2 conditionne la validité du test. Si la preview était alimentée par un élément `<video>` décodé par le navigateur, on comparerait deux pipelines partant de sources différentes, avec des traitements d'espace colorimétrique différents — et la tolérance ci-dessous absorberait l'écart au lieu de le révéler. Le test ne prouverait alors plus rien. Voir [Architecture §5](01-architecture.md).

**Seuils** :

| Mesure               | Seuil                         |
| -------------------- | ----------------------------- |
| Différence par canal | ≤ 2/255 sur 99,5 % des pixels |
| Pixels au-delà       | ≤ 0,5 % du total              |
| Différence maximale  | ≤ 8/255                       |

Ces seuils absorbent le bruit GPU et l'encodage avec perte, tout en restant très en dessous du seuil de perception. Un bug de double application de filtre produit un écart d'un ordre de grandeur supérieur : le test le détecte sans ambiguïté.

En cas d'échec, le test écrit les trois images (preview, export, carte de différence) en artefacts CI. Un échec sans image à regarder ne se diagnostique pas.

---

## 7. Détection de fuites

Instrumentation en développement et en test : chaque `VideoFrame` et `AudioData` alloué par `core/resources` incrémente un compteur, chaque `.close()` le décrémente.

**Forme du test** : exécuter 200 opérations (scrub, changement de filtre, changement de piste), forcer le nettoyage, vérifier que le compteur est revenu à zéro. Ce test conditionne la clôture de plusieurs phases (voir [plan §6](../../PLAN.md#6-phases)).

C'est le seul moyen de détecter une fuite avant qu'elle ne se manifeste chez l'utilisateur — sous la forme d'un onglet qui meurt, symptôme qui ne désigne pas sa cause.

---

## 8. Ce qu'on ne teste pas

Dire explicitement ce qui est hors périmètre évite d'écrire des tests qui coûtent cher et ne prouvent rien.

- **La qualité perçue d'un encodage.** Vérifier qu'AV1 « rend mieux » que H.264 n'est pas automatisable de façon utile.
- **Le comportement de Mediabunny.** C'est sa propre suite de tests. On teste notre usage.
- **Les captures d'écran de rendu visuel.** Trop instables entre plateformes et versions de navigateur pour le rapport coût/bénéfice. L'accessibilité et le comportement sont testés ; l'apparence est revue à l'œil.
- **Les codecs indisponibles sur la machine de CI.** Les tests concernés sont conditionnés au sondage et se sautent proprement, avec un message explicite. Un test sauté silencieusement est un test qu'on croit avoir.

---

## 9. Intégration continue

**Bun est épinglé à la version exacte `1.4.0`** dans le workflow CI comme dans le Dockerfile ([plan §9 bis](../../PLAN.md)) — jamais une plage. Les deux environnements construisent avec le même binaire, sans quoi le repli décrit dans le plan ne veut rien dire.

```
bun run ci
│
├─ bun run --parallel checks        les quatre rapides, en parallèle, sortie préfixée
│  ├── typecheck     tsc --noEmit           TypeScript 7
│  ├── lint          oxlint                 zéro avertissement toléré
│  ├── format        oxfmt --check
│  └── test:unit     vitest run             étage 1
│
├─ build             vite build             + vérification du budget de bundle
└─ test:browser      vitest run --browser   étages 2 et 3 — en série, des minutes
```

Le `--parallel` de Bun 1.4 ne s'applique qu'aux quatre vérifications rapides et indépendantes : le retour d'erreur passe de leur somme à leur maximum. Le build et l'étage navigateur restent en série — le second dure des minutes et n'est de toute façon lancé que sur `main`.

**Hygiène des dépendances**, dans le même `ci` ou dans un job dédié :

```
bun audit                           vulnérabilités connues, rapport seul ; `bun audit fix` à la main
bun dedupe --check                  échoue sur une version dupliquée dans bun.lock
bun pm licenses --prod --json       inventaire de licences, archivé en artefact CI
```

**Sur pull request** : étages 1 et 2, plus le build. Quelques minutes.
**Sur `main` et avant chaque release** : les trois étages, plus l'audit d'accessibilité et le budget de bundle. La suite complète.

Le budget de bundle échoue le CI en cas de dépassement : sans plafond automatique, la taille du bundle ne fait que croître, et le constat arrive toujours trop tard.
