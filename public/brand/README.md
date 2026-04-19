# Vixely — Brand pack

Pack visuel basé sur **Frame** : V évidé en négatif dans un carré arrondi (rx 14/64), gradient `#a78bfa → #7c3aed` (linéaire 135°).

## Fichiers

| Fichier | Usage |
|---|---|
| `logo.svg` | Master 64×64. Source à scaler partout dans l'app. |
| `logo-mono-light.svg` | Version blanche pour fonds sombres. |
| `logo-mono-dark.svg` | Version `#0f0f12` pour fonds clairs. |
| `wordmark.svg` | « Vixely » seul, `currentColor` (hérite de la couleur CSS). |
| `lockup-horizontal.svg` | Icône + Vixely (header, business cards). |
| `lockup-vertical.svg` | Icône au-dessus du wordmark (splash, carte). |
| `og-image.svg` | 1200×630 social. À convertir en PNG (Discord/Twitter ne supporte pas SVG). |
| `apple-touch-icon.svg` | 180×180 source pour PNG iOS. |
| `icon-192.svg` / `icon-512.svg` | PWA standard. |
| `icon-512-maskable.svg` | PWA maskable (V centré dans la zone safe, sans coins arrondis). |
| `preview.html` | Vue d'ensemble, ouvrir via le dev server : `http://localhost:5173/brand/preview.html`. |

## Couleurs

- Gradient principal : `#a78bfa` → `#7c3aed` (= classe CSS `gradient-accent`).
- Mono light : `#fafafa`.
- Mono dark : `#0f0f12`.

## Générer les PNG

Les usages PNG-only (favicon.ico, apple-touch-icon, og-image, PWA icons) nécessitent une conversion. Aucun outil n'est installé localement (`rsvg`, `inkscape`, `sharp`…).

Une fois `@resvg/resvg-js` ajouté en devDep, lancer :

```bash
bun add -D @resvg/resvg-js
bun run scripts/render-brand.ts
```

Ça produit dans `public/` :
- `apple-touch-icon.png` (180)
- `icon-192.png`, `icon-512.png`, `icon-512-maskable.png`
- `og-image.png` (1200×630, remplace l'actuel)
- `favicon-32.png`, `favicon-16.png` (sources pour ICO)

Le `favicon.ico` multi-tailles peut être regénéré avec `png-to-ico` ou un service en ligne à partir des `favicon-{16,32,48}.png`.

## Typographie

Wordmark utilise **DM Sans 700** avec fallback `system-ui, -apple-system, sans-serif`. Pour PNG render, DM Sans doit être installée localement OU le fallback sera utilisé.

## Cohérence avec la home

Le gradient et les radii s'alignent sur `--color-accent`, `--color-accent-dim` et la classe `gradient-accent` de `src/styles.css`. Le V évidé reprend l'idée du chevron du logo précédent en version contemporaine.
