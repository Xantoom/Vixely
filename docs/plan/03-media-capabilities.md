# 03 — Capacités média

Retour au [plan principal](../../PLAN.md).

Document de référence : pour chaque fonctionnalité demandée, quelle API l'implémente, dans quel module, et quelle limite connue s'y attache. Vérifié contre Mediabunny 1.55.1.

---

## 1. Ce que Mediabunny apporte

### Conteneurs — lecture et écriture

ISOBMFF (`.mp4`, `.m4v`, `.m4a`) · QuickTime (`.mov`) · MP4 segmenté (`.m4s`) · Matroska (`.mkv`) · WebM (`.webm`) · Ogg (`.ogg`) · MP3 · WAVE (`.wav`) · ADTS (`.aac`) · FLAC · MPEG-TS (`.ts`) · HLS (`.m3u8`)

Variantes utiles : MP4 _fast start_ (métadonnées en tête, indispensable pour la lecture en streaming), MP4 fragmenté, Matroska streamable, WebM à canal alpha.

### Codecs vidéo

| Codec        | Décodage | Encodage | Note                                  |
| ------------ | -------- | -------- | ------------------------------------- |
| AVC / H.264  | ✓        | ✓        | référence de compatibilité            |
| HEVC / H.265 | ✓        | ✓        | dépend fortement du matériel — sonder |
| VP8          | ✓        | ✓        |                                       |
| VP9          | ✓        | ✓        |                                       |
| AV1          | ✓        | ✓        | encodage logiciel souvent lent        |
| ProRes       | ✓        | ✓        | extension `@mediabunny/prores`        |

### Codecs audio

AAC · Opus · MP3 · Vorbis · FLAC · AC-3 · E-AC-3 · **DTS** · PCM (8/16/24/32 bits, entier et flottant)

| Encodeur      | Extension requise          |
| ------------- | -------------------------- |
| AAC           | `@mediabunny/aac-encoder`  |
| MP3           | `@mediabunny/mp3-encoder`  |
| FLAC          | `@mediabunny/flac-encoder` |
| AC-3 / E-AC-3 | `@mediabunny/ac3`          |
| DTS           | `@mediabunny/dts`          |
| PCM           | intégré                    |

DTS est arrivé en v1.55.0 (17 août 2026), avec lecture et écriture dans ISOBMFF, Matroska et MPEG-TS.

### Sous-titres

**Rien d'exploitable.** WebVTT en écriture seule, et **aucune lecture de piste de sous-titres, quel que soit le format**. L'intégralité du pilier repose donc sur `core/container` et `core/subtitles`, écrits par nous — voir [plan §4](../../PLAN.md).

### Ce qu'on exploite au-delà des codecs

| Capacité                    | Version | Usage chez nous                                     |
| --------------------------- | ------- | --------------------------------------------------- |
| API `Conversion`            | —       | conversion et optimisation sans réencodage superflu |
| Conversions composables     | v1.51   | assemblage multipiste vers une sortie unique        |
| Pause et pas-à-pas          | v1.51   | export interruptible et reprenable                  |
| Champ `quality` / quantizer | v1.52   | **remplace les champs bitrate dépréciés**           |
| Lecture/écriture HLS        | v1.42   | **hors périmètre v1** — voir §6 et §8               |
| `computeFrameRateMetrics()` | v1.54   | détecter VFR, framerate réel, cadence non standard  |

---

## 2. Images

Les images ne passent pas par Mediabunny : décodage via `createImageBitmap`, encodage via `OffscreenCanvas.convertToBlob`, traitement par `core/render`.

| Fonctionnalité                                          | Implémentation                       | Limite                              |
| ------------------------------------------------------- | ------------------------------------ | ----------------------------------- |
| Import PNG · JPEG · WebP · AVIF · GIF · BMP · SVG · ICO | `createImageBitmap`                  | AVIF selon navigateur — sonder      |
| Export PNG · JPEG · WebP · AVIF                         | `convertToBlob`                      | l'encodage AVIF n'est pas universel |
| Optimisation, contrôle qualité                          | paramètre de `convertToBlob`         |                                     |
| Crop                                                    | passe du render graph                |                                     |
| Rotation, miroir                                        | passe du render graph                |                                     |
| Redimensionnement                                       | render graph, algorithme au choix    | bilinéaire, bicubique, Lanczos      |
| Upscale                                                 | Lanczos par défaut                   | pas d'IA — voir §8                  |
| Correction colorimétrique et filtres                    | passe couleur unique                 |                                     |
| Calques de texte                                        | rendu 2D composé dans le graphe      |                                     |
| Métadonnées EXIF                                        | lecture, et **suppression au choix** | par défaut : supprimées à l'export  |

**Décision par défaut : l'EXIF est retiré à l'export.** Un export contenant des coordonnées GPS que l'utilisateur n'a pas conscience de publier est un problème de vie privée, pas une fonctionnalité. La conservation est proposée explicitement.

---

## 3. Audio

| Fonctionnalité                                               | Implémentation                 | Limite                                 |
| ------------------------------------------------------------ | ------------------------------ | -------------------------------------- |
| Import de tous les conteneurs audio                          | `Input` Mediabunny             |                                        |
| Conversion et optimisation                                   | API `Conversion`               | remux sans perte quand c'est possible  |
| Encodage MP3 · AAC · FLAC · Opus · Vorbis · AC-3 · DTS · PCM | extensions                     | chargées à la demande                  |
| Crop, découpe                                                | opérations sur le document     |                                        |
| Réarrangement, concaténation                                 | conversions composables        | v1.51                                  |
| Normalisation                                                | analyse **EBU R128** puis gain | deux passes : mesure, puis application |
| Égaliseur                                                    | Web Audio `BiquadFilterNode`   |                                        |
| Filtres (passe-haut, passe-bas, compression)                 | chaîne Web Audio               |                                        |
| Fondus                                                       | courbes de gain                |                                        |
| Visualisation du spectre                                     | `AnalyserNode`                 | pour la preview uniquement             |
| Forme d'onde                                                 | pics précalculés en worker     |                                        |
| Multipiste, sélection                                        | `Input.getAudioTracks()`       |                                        |

**Preview et export doivent produire le même son** (I1 appliqué à l'audio) : le graphe Web Audio de la preview et le traitement d'export dérivent de la même description. On ne réécrit pas la chaîne deux fois.

---

## 4. GIF

| Fonctionnalité                              | Implémentation                                          | Limite                          |
| ------------------------------------------- | ------------------------------------------------------- | ------------------------------- |
| Décodage en frames + délais                 | décodeur GIF dédié                                      |                                 |
| Timeline de frames                          | document + `FrameStrip`                                 |                                 |
| Suppression, réarrangement, délais          | commandes du document                                   |                                 |
| Crop, redimensionnement, rotation           | `core/render`                                           |                                 |
| Filtres, correction colorimétrique          | `core/render`                                           | mutualisé avec l'image          |
| Calques de texte                            | `core/render`                                           |                                 |
| Extraction de frames                        | encodage image par frame                                | export unitaire ou groupé       |
| Ouvrir une frame dans l'éditeur d'images    | passage en mémoire entre routes                         |                                 |
| Encodage GIF                                | quantification + LZW                                    | 256 couleurs — limite du format |
| Dithering                                   | Floyd–Steinberg, Bayer, aucun                           |                                 |
| Optimisation                                | palette globale ou par frame, différentiel inter-frames |                                 |
| Conversion vers WebP animé, APNG, MP4, WebM | Mediabunny pour les sorties vidéo                       |                                 |

**À dire à l'utilisateur, clairement :** convertir un GIF en WebM ou MP4 divise le poids par cinq à vingt à qualité égale. Beaucoup d'utilisateurs arrivent avec un GIF parce qu'ils croient ne pas avoir le choix. La suggestion s'affiche au moment de l'export, sans imposer.

---

## 5. Sous-titres

Aucune ligne de ce pilier ne vient de Mediabunny, à l'exception du muxing VTT.

| Fonctionnalité                                | Implémentation                             | Limite                                        |
| --------------------------------------------- | ------------------------------------------ | --------------------------------------------- |
| **Démux : extraire les pistes d'un MKV**      | `core/container` — parseur EBML            | Mediabunny n'en lit aucune                    |
| **Mux : écrire des pistes dans un MKV**       | `core/container` — muxeur Matroska         | vidéo et audio en passe-plat, sans réencodage |
| Parsing et sérialisation SRT                  | notre code                                 |                                               |
| Parsing et sérialisation WebVTT               | notre code                                 | cue settings, régions, styles                 |
| Parsing et sérialisation ASS/SSA              | notre code                                 | en-têtes, styles V4+, balises inline          |
| Lecture PGS                                   | notre code — display sets, RLE, palette    | format bitmap                                 |
| Édition des cues                              | modèle unifié                              | pas de texte en PGS                           |
| Édition des en-têtes et styles                | modèle de style ASS                        | SRT n'a pas d'en-tête — désactivé             |
| Timings, position, ordre, suppression         | commandes du document                      | **les trois formats, PGS compris**            |
| Détection de chevauchements                   | validation du document                     |                                               |
| Contrôle de lisibilité (CPS)                  | calcul, avertissement                      | seuil configurable                            |
| Décalage global, étirement, resynchronisation | commandes                                  |                                               |
| Conversion entre formats                      | matrice de conversion                      | **pertes annoncées** — voir ci-dessous        |
| Rendu ASS en preview et à l'export            | jassub → texture → passe `[subs]`          | chemin unique                                 |
| Rendu PGS en preview et à l'export            | décodage RLE → texture → passe `[subs]`    | chemin unique                                 |
| Export sidecar                                | téléchargement direct                      |                                               |
| Export embarqué SRT · ASS · PGS               | `core/container`, conteneur MKV            |                                               |
| Export embarqué VTT                           | Mediabunny                                 | MP4 et MKV                                    |
| Export burn-in                                | la passe `[subs]` est incluse à l'encodage | irréversible                                  |

### Pertes de conversion, à énoncer avant l'action

| Depuis → vers         | Ce qui est perdu                                               |
| --------------------- | -------------------------------------------------------------- |
| ASS → SRT             | tous les styles, positionnement, effets, karaoké               |
| ASS → VTT             | styles avancés, positionnement partiellement conservé          |
| VTT → SRT             | positionnement, styles inline, régions                         |
| SRT → ASS             | rien ; des styles par défaut sont générés                      |
| PGS → texte (SRT/ASS) | **impossible sans OCR** — écarté ; l'action n'est pas proposée |
| texte → PGS           | hors périmètre — nécessiterait un encodeur RLE                 |

L'avertissement s'affiche dans le dialogue de conversion, avec la liste exacte de ce qui disparaît pour _ce fichier_ — pas un message générique.

---

## 6. Vidéo

| Fonctionnalité                                            | Implémentation                                        | Limite                                  |
| --------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------- |
| Import de tous les conteneurs                             | `Input` Mediabunny                                    |                                         |
| Sondage : pistes, codecs, durée, framerate                | `Input` + `computeFrameRateMetrics()`                 | détecte le VFR                          |
| Conversion, optimisation                                  | API `Conversion`                                      | remux sans réencodage si possible       |
| Réencodage AVC · HEVC · VP8 · VP9 · AV1 · ProRes          | `Conversion` ou chemin manuel                         | disponibilité sondée                    |
| Contrôle de qualité                                       | champ `quality` / quantizer                           | **jamais les champs bitrate dépréciés** |
| Redimensionnement, changement de framerate                | chemin manuel                                         |                                         |
| Filtres, correction colorimétrique                        | `core/render`                                         |                                         |
| Calques de texte                                          | `core/render`                                         |                                         |
| Découpe à la frame près                                   | recherche de keyframe + décodage jusqu'à la frame     | réencodage du GOP concerné              |
| Découpe à la keyframe                                     | remux                                                 | sans perte, instantané                  |
| Multipiste vidéo et audio : lister, sélectionner          | `Input.getTracks()`                                   |                                         |
| **Multipiste sous-titres : lister, sélectionner**         | `core/container`                                      | Mediabunny ne les voit pas              |
| Multipiste vidéo et audio : ajouter, retirer, réordonner  | conversions composables (v1.51)                       |                                         |
| **Multipiste sous-titres : ajouter, retirer, réordonner** | `core/container`                                      | sortie MKV                              |
| Édition audio depuis l'éditeur vidéo                      | réutilise le pilier audio                             |                                         |
| Édition des sous-titres depuis l'éditeur vidéo            | réutilise le pilier sous-titres                       |                                         |
| Sous-titres à l'export                                    | embarqué (SRT · ASS · PGS en MKV) · burn-in · sidecar | MP4 : VTT ou sidecar                    |
| Export interruptible et reprenable                        | pause / pas-à-pas (v1.51)                             |                                         |
| Navigation frame · keyframe · temps                       | trois modes de transport                              |                                         |

### HLS : pourquoi c'est hors périmètre

Mediabunny sait lire du HLS depuis une URL depuis la v1.42, et c'était tentant. Mais cette fonctionnalité **n'est pas au cahier des charges**, et elle a un coût qui n'est pas dans le code : charger un `.m3u8` et ses segments depuis un hôte arbitraire impose d'ouvrir la directive `connect-src` de la politique de sécurité, aujourd'hui limitée à `'self'`. Cette directive est ce qui rend l'exfiltration impossible en cas de XSS — et l'application manipule justement des contenus non fiables (noms de fichiers, sous-titres, SVG).

Ouvrir une brèche structurelle dans la CSP pour une fonctionnalité non demandée est un mauvais échange. HLS reste une proposition (§8), à arbitrer en connaissance de cause.

### Deux points que l'utilisateur doit comprendre

**Découpe sans perte contre découpe précise.** Couper sur une keyframe est instantané et sans perte, mais les points de coupe sont contraints. Couper à la frame exacte impose de réencoder au moins le groupe d'images concerné. L'interface propose les deux et affiche la keyframe la plus proche du point demandé, pour que le choix soit informé.

**Le VFR est un piège.** Beaucoup d'enregistrements d'écran et de vidéos de téléphone sont à framerate variable. Traiter du VFR comme du CFR décale l'audio progressivement, et le symptôme n'apparaît qu'en fin de fichier. `computeFrameRateMetrics()` sert à le détecter à l'import et à prévenir, avec proposition de conversion en CFR.

---

## 7. Sondage des capacités

`WebCodecs` varie selon navigateur, système et matériel. Un codec listé plus haut n'est pas garanti disponible sur la machine de l'utilisateur.

**Règle** : avant d'afficher un codec, on appelle `isConfigSupported()`. Un codec indisponible est **affiché désactivé, avec la raison** — jamais masqué. Masquer laisse croire à un oubli ; désactiver avec une explication (« HEVC nécessite une accélération matérielle absente sur cet appareil ») permet à l'utilisateur avancé de comprendre et d'agir.

Les résultats du sondage sont mis en cache pour la session, pas au-delà : le matériel peut changer entre deux visites, notamment sur configuration à GPU commutable.

---

## 7 bis. Estimation de la taille de sortie — requis, pas optionnel

Cette fonctionnalité n'est pas une amélioration de confort : elle est **exigée par la décision sur les navigateurs** (ADR 014). Sur Firefox et Safari, le fichier de sortie doit être assemblé en mémoire, et l'utilisateur doit être averti _avant_ de lancer un export qui fera mourir son onglet. Sans estimation, l'avertissement est impossible.

**Méthode** : encoder un échantillon court avec les réglages demandés, extrapoler sur la durée totale, majorer d'une marge. La précision n'a pas besoin d'être excellente — il s'agit de distinguer « 200 Mo » de « 8 Go », pas de prédire l'octet près.

**Propriétaire** : la première phase capable de produire une sortie de plusieurs gigaoctets. Concrètement **phase 1** pour les images de très grande taille, et surtout **phase 5** pour la vidéo, où le risque est réel. Elle ne peut pas être repoussée après la phase 5.

Effet secondaire utile : elle supprime aussi le cycle « exporter, découvrir que c'est trop lourd, recommencer », sur tous les navigateurs.

## 8. Propositions au-delà de la spec

Formulées pour arbitrage, aucune n'est engagée. Classées par rapport valeur/coût.

### À forte valeur, coût modéré

- **Traitement par lot.** Déposer trente images, appliquer le même traitement, télécharger un ZIP. C'est le cas d'usage qui remplace le plus sûrement un outil desktop, et l'infrastructure (documents sérialisables, workers) est déjà là.
- **Comparaison avant/après par volet**, déjà nécessaire côté rendu (I1), à généraliser aux cinq éditeurs.
- **Presets d'export exportables et importables**, en JSON. Gratuit, puisque les documents sont déjà sérialisables (D4).
- **Palette de commandes** (Ctrl+K). Dans une application dense, c'est le meilleur rapport découvrabilité/encombrement.
- **Ouverture d'un média dans un autre éditeur** sans repasser par le disque : extraire la piste audio d'une vidéo et l'ouvrir dans l'éditeur audio.

### À arbitrer, avec une contrepartie de sécurité

- **Import HLS depuis une URL.** Techniquement gratuit (Mediabunny le fait depuis la v1.42), mais impose d'élargir `connect-src` au-delà de `'self'` — donc de renoncer à la garantie qu'aucune donnée ne peut sortir en cas de XSS. À n'activer que si le besoin est réel. Le contournement sans coût : l'utilisateur télécharge le flux avec son propre outil et dépose le fichier.

### À forte valeur, coût élevé

- **Extraction et gravure de chapitres**, en MP4 et MKV.
- **Détection de silences** en audio, avec découpe assistée.
- **Suggestion de sous-titres depuis la piste audio**, via l'API `SpeechRecognition` du navigateur là où elle existe — sans service tiers, ce qui respecte l'anti-objectif.
- **Comparateur de codecs** : encoder un échantillon de dix secondes en trois configurations et présenter poids et qualité côte à côte.

### Écarté

- **Upscale par IA.** Coût de modèle incompatible avec un chargement web raisonnable, résultats inégaux, et une forte pression à externaliser vers un service — ce qui viole l'anti-objectif fondateur. Lanczos correctement implémenté couvre le besoin réel.
- **Édition collaborative.** Suppose un serveur.
- **Bibliothèque de projets.** Suppose une persistance qu'on a écartée (D4).
- **PWA installable et hors ligne** (ADR 015). Techniquement séduisant pour une application 100 % client-side, mais un service worker impose de gérer le cache et son invalidation — et une invalidation ratée sert une version périmée de l'application à des utilisateurs qui n'ont aucun moyen de s'en rendre compte. Écarté au profit d'un site classique.
- **File Handling API** (double-clic sur un fichier → ouvre Vixely). Dépend d'une PWA installée, donc tombe avec elle.
