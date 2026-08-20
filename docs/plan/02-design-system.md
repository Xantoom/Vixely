# 02 — Design system et identité visuelle

Retour au [plan principal](../../PLAN.md).

---

## 1. Direction esthétique

L'exigence formulée est double et un peu inhabituelle : **moderne, mais qui ne ressemble pas à toutes les interfaces générées.** Ça se traduit en interdits concrets, parce que « moderne » sans contrainte produit exactement l'interface qu'on cherche à éviter.

**Ce qu'on ne fait pas** — la signature visuelle du générique :

- dégradé violet→rose en fond de héros ;
- glassmorphism (`backdrop-blur` + bordure blanche translucide) appliqué partout ;
- cartes flottantes à coins très arrondis avec ombre portée diffuse, empilées sans hiérarchie ;
- emoji en guise d'icônes ;
- une police variable étirée en 800 pour tous les titres ;
- l'accent de couleur posé sur tout ce qui est cliquable, jusqu'à ne plus rien signaler.

**Ce qu'on fait à la place** — un outil, pas une landing page :

- **Densité assumée.** Vixely remplace des applications desktop. Un éditeur affiche beaucoup de contrôles, et c'est normal. On travaille la lisibilité de la densité au lieu de la fuir dans du vide.
- **Rayons contenus.** 4 px pour les contrôles, 8 px pour les conteneurs. Pas de 24 px.
- **Hiérarchie par la surface, pas par l'ombre.** Trois niveaux d'élévation obtenus par les paliers `base` / `mantle` / `surface0` de Catppuccin. Les ombres sont réservées à ce qui flotte réellement au-dessus du contenu — menus, dialogues.
- **L'accent est rare.** Il marque l'action primaire et l'état actif. Un panneau où quatre éléments sont accentués n'en signale aucun.
- **Le média domine.** Le canvas de travail occupe la place ; le chrome de l'interface se retire. En plein écran, il disparaît.
- **Typographie sobre.** Une graisse pour le corps, une pour les titres. Les valeurs numériques en chiffres tabulaires : un timecode qui gigote pendant la lecture est un défaut visible.

---

## 2. Couleur — Catppuccin

**Latte** en clair, **Macchiato** en sombre. Sélecteur à trois positions : Système (défaut) · Clair · Sombre, mémorisé en préférence.

### Palettes de référence

| Rôle        | Latte (clair) | Macchiato (sombre) |
| ----------- | ------------- | ------------------ |
| `base`      | `#eff1f5`     | `#24273a`          |
| `mantle`    | `#e6e9ef`     | `#1e2030`          |
| `crust`     | `#dce0e8`     | `#181926`          |
| `surface0`  | `#ccd0da`     | `#363a4f`          |
| `surface1`  | `#bcc0cc`     | `#494d64`          |
| `surface2`  | `#acb0be`     | `#5b6078`          |
| `overlay0`  | `#9ca0b0`     | `#6e738d`          |
| `overlay1`  | `#8c8fa1`     | `#8087a2`          |
| `overlay2`  | `#7c7f93`     | `#939ab7`          |
| `subtext0`  | `#6c6f85`     | `#a5adcb`          |
| `subtext1`  | `#5c5f77`     | `#b8c0e0`          |
| `text`      | `#4c4f69`     | `#cad3f5`          |
| `blue`      | `#1e66f5`     | `#8aadf4`          |
| `mauve`     | `#8839ef`     | `#c6a0f6`          |
| `green`     | `#40a02b`     | `#a6da95`          |
| `peach`     | `#fe640b`     | `#f5a97f`          |
| `teal`      | `#179299`     | `#8bd5ca`          |
| `red`       | `#d20f39`     | `#ed8796`          |
| `yellow`    | `#df8e1d`     | `#eed49f`          |
| `sky`       | `#04a5e5`     | `#91d7e3`          |
| `lavender`  | `#7287fd`     | `#b7bdf8`          |
| `sapphire`  | `#209fb5`     | `#7dc4e4`          |
| `pink`      | `#ea76cb`     | `#f5bde6`          |
| `flamingo`  | `#dd7878`     | `#f0c6c6`          |
| `rosewater` | `#dc8a78`     | `#f4dbd6`          |
| `maroon`    | `#e64553`     | `#ee99a0`          |

### Tokens sémantiques

Le code n'utilise **jamais** `blue` ou `mauve` directement. Il utilise des tokens de rôle, redéfinis par thème :

```
--bg              base            fond de l'application
--bg-sunken       mantle          rails, barres latérales
--bg-raised       surface0        cartes, panneaux
--bg-overlay      surface1        menus, dialogues
--border          surface1/0      séparateurs
--text            text
--text-muted      subtext0        libellés secondaires
--text-subtle     overlay1        texte désactivé
--accent          par éditeur     voir ci-dessous
--danger          red             destructif
--warning         yellow          perte de qualité, format non standard
--success         green           opération terminée
```

Cette indirection est ce qui permet de changer un thème sans toucher un composant.

### Accent par éditeur

Le code couleur doit être « clair et intuitif ». Chaque pilier porte son accent, constant sur tout le parcours — l'utilisateur sait où il est sans lire :

| Éditeur     | Accent  | Pourquoi                                       |
| ----------- | ------- | ---------------------------------------------- |
| Image       | `teal`  | froid, neutre, statique                        |
| Vidéo       | `blue`  | l'ancre du produit, la couleur la plus lisible |
| GIF         | `peach` | chaud, ludique, cohérent avec l'usage          |
| Audio       | `mauve` | franchement distinct des trois visuels         |
| Sous-titres | `green` | associé au texte et à la validation            |

Porté par un attribut `data-editor` sur la racine, qui redéfinit `--accent`. Un composant ne connaît jamais l'éditeur dans lequel il se trouve.

### Contraste

Toutes les paires texte/fond atteignent **WCAG AA** au minimum, AAA pour le corps de texte. Catppuccin n'est pas conforme par construction — certaines paires (`overlay0` sur `base` en Latte) échouent. **Un test automatisé vérifie chaque paire de tokens** et échoue le CI en cas de régression. C'est le seul moyen fiable : la vérification à l'œil laisse passer.

---

## 3. Typographie

| Usage                           | Police         | Note                                           |
| ------------------------------- | -------------- | ---------------------------------------------- |
| Interface                       | Inter Variable | auto-hébergée, sous-ensemble latin + latin-ext |
| Chiffres, timecodes, dimensions | JetBrains Mono | `font-variant-numeric: tabular-nums`           |
| CJK                             | repli système  | Noto Sans CJK pèse trop pour être livré        |

Échelle sur base 4 px : 11 · 12 · 13 · 14 · 16 · 20 · 24 · 32. L'interface d'un outil vit entre 12 et 14 ; les tailles supérieures sont pour les pages marketing.

Auto-hébergement des polices : aucune requête vers un tiers, ce qui sert autant la vie privée que la CSP (voir [Déploiement](05-deploy-security.md)).

---

## 4. Composants

Aucun contrôle natif visible. Cette exigence est absolue et concerne aussi ce qu'on oublie : `<select>`, `<input type="range">`, `<input type="color">`, `<input type="file">`, les barres de défilement, les infobulles natives, `<dialog>` non stylé, les contrôles de `<video>`.

**Mais** : chaque composant custom réimplémente la sémantique et le clavier de son équivalent natif. Un `Select` custom qui ne répond pas aux flèches, à Début/Fin, à la recherche par frappe et à Échap est une régression, pas un composant.

### Primitives — phase 0

`Button` · `IconButton` · `Toggle` · `Slider` · `NumberInput` · `Select` · `Combobox` · `Tabs` · `Tooltip` · `Popover` · `Dialog` · `ContextMenu` · `Toast` · `Progress` · `Spinner` · `Field` · `Scrollable` · `CollapsibleSection` · `SegmentedControl` · `ColorPicker`

**Base retenue : `react-aria-components` 1.20.0.** Elle fournit le comportement — focus, clavier, ARIA, verrouillage de défilement, positionnement flottant, gestion de la locale et du RTL — sans imposer de style. C'est le point où réécrire soi-même coûte le plus cher : une gestion du focus subtilement fausse ne se voit pas à l'usage courant et ne se découvre qu'au lecteur d'écran.

Le partage est explicite : `react-aria-components` porte les primitives où l'accessibilité est difficile (`Dialog`, `Select`, `Combobox`, `Slider`, `Menu`, `Tabs`, `Popover`, `Tooltip`) ; les composants triviaux (`Button`, `Toggle`, `Field`, `SegmentedControl`) sont écrits en interne, parce qu'y ajouter une dépendance ne rapporte rien. Tout est habillé par nos tokens : aucun style de la bibliothèque n'est visible.

### Composants métier — au fil des phases

`MediaCanvas` (zoom, pan, ajuster, 1:1) · `Timeline` · `FrameStrip` · `Waveform` · `SpectrumAnalyzer` · `TrackList` · `CodecPicker` · `ExportPanel` · `DropZone` · `CueEditor` · `HistoryMenu` · `PlayerTransport`

Le `PlayerTransport` est commun aux lecteurs audio et vidéo, et couvre l'intégralité de ce qui est demandé au cahier des charges : lecture/pause, position, **plein écran**, contrôle du volume avec coupure, sélection de piste quand le média est multipiste, vitesse de lecture, et — côté vidéo — la bascule entre les trois précisions de navigation (temps, keyframe, frame). En plein écran, les contrôles se retirent après inactivité et reviennent au moindre mouvement ou à la moindre touche.

### Sliders — un cas qui mérite d'être traité une fois

Le slider est le contrôle le plus manipulé de l'application. Il doit avoir, dès la première version :

- saisie numérique directe à côté du curseur ;
- **double-clic pour revenir au défaut** ;
- Maj pour l'ajustement fin, Alt pour le pas grossier ;
- un repère visible sur la valeur par défaut ;
- une zone tactile d'au moins 44 px sur mobile, indépendante de la taille visuelle ;
- l'émission d'une commande fusionnable (`mergeKey`) pour que le geste continu produise une entrée d'historique et non quarante.

---

## 5. Accessibilité

Cible : **WCAG 2.2 niveau AA**, vérifiée, pas déclarée.

- **Tout au clavier.** Chaque fonction est atteignable sans souris. Les raccourcis sont documentés dans un panneau d'aide et personnalisables plus tard.
- **Focus visible partout**, avec un anneau à fort contraste. `:focus-visible`, jamais `outline: none` sec.
- **Piégeage du focus** dans les dialogues, restitution au déclencheur à la fermeture.
- **Régions live** pour les états asynchrones : « Export terminé », « Décodage 40 % ». Un utilisateur de lecteur d'écran doit savoir qu'un export a réussi.
- **`prefers-reduced-motion`** respecté : les transitions tombent à 0 ms, les animations décoratives disparaissent.
- **Cibles de 44×44 px minimum** en tactile.
- **La couleur n'est jamais le seul porteur d'information** : une piste désactivée porte une icône, pas seulement une teinte.
- Le canvas média expose une description textuelle de ce qu'il montre.

Vérification automatisée avec `@axe-core/playwright` sur chaque route en CI, et audit manuel au lecteur d'écran en phase 6.

---

## 6. Mouvement

Les animations sont fonctionnelles : elles expliquent d'où vient un élément, elles ne décorent pas.

| Type                            | Durée      | Courbe                      |
| ------------------------------- | ---------- | --------------------------- |
| Micro-retour (survol, pression) | 80–120 ms  | `ease-out`                  |
| Panneau, accordéon              | 180–220 ms | `ease-out`                  |
| Dialogue, feuille               | 220–280 ms | `cubic-bezier(.32,.72,0,1)` |

Uniquement `transform` et `opacity` — ce sont les seules propriétés composées par le GPU. Animer `height`, `top` ou `width` provoque du layout à chaque frame, ce qui est exactement ce qu'on ne peut pas se permettre à côté d'un décodage vidéo.

Une bibliothèque d'animation n'est pas nécessaire pour ça. Si un besoin réel de gestes ou de spring apparaît, `motion` est le candidat — pas avant.

---

## 7. Adaptation à l'écran

**Desktop d'abord**, mais réellement adapté ailleurs.

| Palier       | Disposition                                                                  |
| ------------ | ---------------------------------------------------------------------------- |
| < 640 px     | Canvas plein écran, outils en feuille inférieure, rail d'icônes horizontal   |
| 640–1024 px  | Canvas + un panneau escamotable, rail latéral                                |
| 1024–1600 px | Disposition de référence : rail + panneau + canvas                           |
| > 1600 px    | Second panneau permanent (inspecteur, historique) au lieu d'étirer le canvas |
| > 2400 px    | Largeur de contenu plafonnée, canvas centré                                  |

**Écrans larges** : la place gagnée sert à révéler des panneaux, pas à distendre les mêmes éléments. Un slider de 900 px de large est moins précis, pas plus.

**Tactile** : détection par `pointer: coarse` plutôt que par largeur — une tablette large reste tactile. Le mode tactile agrandit les cibles, remplace le survol par des appuis explicites, et active les gestes de pincement et de déplacement sur le canvas.

**Densité de pixels** : le canvas est dimensionné en tenant compte de `devicePixelRatio` — sans quoi la preview est floue sur un écran HiDPI, ce qui est rédhibitoire pour un éditeur d'images. `devicePixelRatio` est réévalué au changement d'écran, cas réel sur configuration multi-moniteurs à DPI différents.

---

## 8. Identité

**Nom** : Vixely. **Domaine** : vixely.app.

**Piste de logo** — à valider avant la phase 6 : un monogramme construit sur le V, où les deux branches se lisent comme deux pistes convergeant vers un point. La forme évoque à la fois le chevron de lecture et la fusion de pistes — ce que fait le produit. Géométrique, une seule couleur, lisible à 16 px pour le favicon comme à 512 px.

À produire : SVG monochrome, favicon (16/32/180), icône de raccourci, image Open Graph, et une déclinaison animée discrète pour l'écran de chargement — utilisable comme indicateur de progression réel plutôt que comme spinner décoratif.

**Ton** : direct et factuel. « Vos fichiers ne quittent jamais votre appareil » plutôt que « Confidentialité de niveau militaire ». Le produit se vend sur ce qu'il fait ; le README est neutre par consigne, l'interface l'est aussi.
