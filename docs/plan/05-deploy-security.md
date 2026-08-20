# 05 — Déploiement et sécurité

Retour au [plan principal](../../PLAN.md).

---

## 1. Ce qui est déployé

Le build produit **des fichiers statiques, et rien d'autre** :

```
dist/client/
├── _shell.html              shell SPA — sert les cinq éditeurs
├── index.html               accueil, prerendue
├── features/*.html          pages SEO, prerendues
├── assets/*.js  *.css       chunks
└── jassub/                  WASM
```

`dist/server/` est produit par le build mais **n'est pas embarqué dans l'image** : il ne sert qu'au prerender, à la construction. Aucun processus JavaScript ne tourne en production.

Cette propriété est la conséquence directe de D1 et elle porte tout le reste de ce document : une surface d'attaque réduite à un serveur de fichiers statiques, aucune exécution de code côté serveur, aucun secret à protéger, aucune dépendance runtime à mettre à jour en urgence.

---

## 2. Image Docker

Multi-étage : Bun pour construire, Caddy pour servir.

La version de Bun est un argument de build, pour qu'une montée de version soit un changement d'une ligne, validé par la procédure du [plan §9 bis](../../PLAN.md) :

```dockerfile
ARG BUN_VERSION=1.4.0
FROM oven/bun:${BUN_VERSION}-alpine AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist/client /srv
```

**Pourquoi Caddy** : compression Zstandard et Brotli intégrées, en-têtes déclaratifs, réécriture SPA en une ligne, image finale de quelques dizaines de mégaoctets, aucun runtime JavaScript en production.

Le `Caddyfile` prend en charge :

- la réécriture des 404 vers `_shell.html` — **sans écraser les pages prerendues**, qui doivent être servies telles quelles, sans quoi le SEO de D1 est perdu ;
- le cache immuable d'un an sur `assets/*` (noms avec empreinte), et `no-cache` sur les HTML ;
- `application/wasm` sur les fichiers WASM — un mauvais type MIME empêche l'instanciation streamée ;
- les en-têtes de sécurité de §3.

---

## 3. En-têtes de sécurité

### Content-Security-Policy

C'est le point le plus délicat de la configuration, parce qu'une application média a des besoins qu'une politique restrictive standard bloque. Écrite explicitement plutôt que laissée à « durcir plus tard » :

```
default-src 'self';
script-src 'self' 'wasm-unsafe-eval';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
media-src 'self' blob:;
font-src 'self';
worker-src 'self' blob:;
connect-src 'self' blob:;
object-src 'none';
base-uri 'none';
form-action 'none';
frame-ancestors 'none';
upgrade-insecure-requests
```

Justification des directives non évidentes :

| Directive                             | Pourquoi                                                          |
| ------------------------------------- | ----------------------------------------------------------------- |
| `'wasm-unsafe-eval'`                  | jassub et le WASM interne de Mediabunny ne s'instancient pas sans |
| `blob:` dans `worker-src`             | les workers sont instanciés depuis des blobs par le bundler       |
| `blob:` dans `media-src` et `img-src` | toutes les previews sont des URL de blob                          |
| `object-src 'none'`                   | aucun plugin, jamais                                              |
| `form-action 'none'`                  | l'application ne soumet aucun formulaire                          |
| `frame-ancestors 'none'`              | pas d'embarquement en iframe — anti-clickjacking                  |

**`connect-src 'self'` est une garantie, pas un réglage par défaut.** Tant que cette directive reste fermée, aucune donnée ne peut sortir du navigateur, même si une faille XSS était exploitée via un nom de fichier ou un contenu de sous-titre. C'est la raison pour laquelle l'import HLS depuis une URL arbitraire a été écarté du périmètre v1 (ADR 012) : l'activer imposerait d'ouvrir cette directive. Toute demande future d'élargissement doit être arbitrée à ce niveau, pas dans une PR de fonctionnalité.

`'unsafe-inline'` sur `style-src` est requis par Tailwind et par les styles inline de React. À reprendre en phase 6 avec des nonces si le rapport coût/bénéfice le justifie ; à ne pas laisser passer silencieusement.

**Vérification en CI** : un test charge chaque route avec la CSP de production active et échoue sur toute violation. Une CSP écrite et jamais vérifiée finit désactivée au premier incident.

### Autres en-têtes

```
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Resource-Policy: same-origin
```

### Décision : pas de cross-origin isolation

**COEP n'est pas activé.** L'isolation cross-origin donne accès à `SharedArrayBuffer`, dont nous n'avons pas besoin : le parallélisme passe par des workers et des transferables (I5), et `@mediabunny/server` — qui exploiterait le multithreading — est un paquet Node/Bun/Deno sans rapport avec le build navigateur.

C'est consigné comme un **non** explicite (ADR 008). Sans ça, une session future risque de l'activer « pour la performance » et de casser au passage le chargement de ressources tierces, pour un gain nul.

---

## 4. Railway

- Déploiement depuis GitHub Actions, à chaque merge sur `main`.
- Un seul service, pas de base de données, pas de volume, pas de variable d'environnement contenant un secret.
- Vérification de santé sur `/` ; Railway attend une réponse HTTP, Caddy la fournit.
- Redéploiement instantané et retour arrière en un clic — l'image est immuable et légère.

Railway sert d'origine ; Cloudflare est devant et absorbe l'essentiel du trafic (§5).

---

## 5. Cloudflare

**À configurer dans le tableau de bord, pas dans le code de l'application.** Distinction importante : rien de cette section ne consomme du temps d'ingénierie applicative, et rien ne doit fuiter dans le code.

DNS chez Cloudflare, domaine acheté chez Hostinger — les serveurs de noms Hostinger pointent vers Cloudflare.

### Réglages

| Réglage          | Valeur                          |
| ---------------- | ------------------------------- |
| Proxy            | activé sur l'apex et `www`      |
| SSL/TLS          | Full (strict)                   |
| TLS minimum      | 1.2                             |
| HTTP/3           | activé                          |
| Always Use HTTPS | activé                          |
| Brotli / Zstd    | activé                          |
| Cache des assets | respecte les en-têtes d'origine |

### Limitation de débit

L'application n'a aucune API : la limitation protège contre le grattage massif et l'abus de bande passante, pas contre l'abus d'un point d'entrée métier.

| Règle                 | Seuil          | Action         |
| --------------------- | -------------- | -------------- |
| Global par IP         | 300 req / min  | challenge géré |
| Rafale sur les assets | 1000 req / min | challenge géré |
| Bots non vérifiés     | 60 req / min   | challenge géré |

**Challenge, pas blocage.** Un blocage sec sur un faux positif rend le site inaccessible à un utilisateur légitime sans recours ; le challenge géré laisse une porte de sortie.

### Agents IA — autorisés, avec mesure

Exigence explicite du projet : les agents IA doivent pouvoir découvrir et comprendre le site.

- **Les bots vérifiés Cloudflare sont autorisés avant toute autre règle.** Cette précédence compte : une règle WAF ou de gestion de bots s'applique _avant_ que `robots.txt` ne soit consulté, donc un `robots.txt` permissif ne suffit pas — le crawler serait bloqué sans jamais le lire.
- Ne **pas** activer les règles gérées « bloquer les crawlers IA » ni la fonctionnalité AIndependence, qui bloqueraient exactement ce qu'on veut autoriser.
- Limitation dédiée aux crawlers IA vérifiés : plus généreuse que celle des bots non vérifiés, mais non illimitée.

`robots.txt` :

```
User-agent: *
Allow: /
Crawl-delay: 1

Sitemap: https://vixely.app/sitemap.xml
```

Aucune section `Disallow` visant les agents IA. Le site est public, entièrement client-side, et ne contient aucune donnée utilisateur : il n'y a rien à protéger d'un crawler.

Un `llms.txt` à la racine décrit en texte structuré ce que fait Vixely, quels formats sont pris en charge et quelles routes existent — pour qu'un agent comprenne le produit sans avoir à exécuter le JavaScript.

---

## 6. Sécurité applicative

Les vecteurs classiques d'une application web disparaissent en grande partie ici : **pas de serveur, pas de base, pas d'authentification, pas de session, pas de cookie, aucune donnée utilisateur transmise.** Il ne reste ni injection SQL, ni CSRF, ni fuite de secret côté serveur, ni escalade de privilèges.

Ce qui reste réellement à traiter :

| Risque                           | Traitement                                                                                                                                                                                                                                                   |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| XSS via un nom de fichier        | Le nom de fichier est du contenu non fiable. Échappé partout, jamais injecté en HTML                                                                                                                                                                         |
| XSS via un contenu de sous-titre | Un `.ass` contient des balises. Le contenu est rendu comme du texte ou via jassub, jamais interprété en HTML                                                                                                                                                 |
| SVG malveillant à l'import       | Un SVG peut contenir du script. Rastérisé dans un contexte isolé, jamais inséré dans le DOM                                                                                                                                                                  |
| Média malformé                   | Toute erreur de décodage est attrapée et présentée ; jamais de plantage d'onglet non expliqué                                                                                                                                                                |
| Épuisement mémoire               | Estimation du besoin avant traitement, avertissement au-delà d'un seuil, annulation possible                                                                                                                                                                 |
| Dépendance compromise            | `bun.lock` commité (empreintes SHA-512 depuis Bun 1.4), installation `--frozen-lockfile`, `bun audit` automatisé, `trustedDependencies` restreint au registre npm, `ignoreScripts` sur les paquets à script de cycle de vie, mises à jour groupées et relues |
| Fuite d'EXIF                     | Métadonnées supprimées par défaut à l'export                                                                                                                                                                                                                 |

La suppression d'EXIF par défaut mérite d'être répétée ici : c'est le seul endroit où l'application pourrait faire fuiter une donnée personnelle — la position GPS d'une photo republiée — et le défaut doit protéger.

---

## 7. Ce que le déploiement ne fait pas

- **Aucune analytique**, aucun pixel, aucun script tiers. La CSP l'interdit structurellement, et pas seulement par intention.
- **Aucun service worker, et donc pas de PWA** (ADR 015). Ce n'est pas une conséquence de la règle ci-dessus, qui ne vise que les tiers : c'est une décision distincte, motivée par le coût d'invalidation du cache et le risque de servir une version périmée.
- **Aucun CDN tiers.** Polices, WASM et bibliothèques sont auto-hébergés — la CSP limite tout à `'self'`.
- **Aucune variable d'environnement secrète.** Il n'y a rien à garder secret dans une application entièrement client-side ; toute clé embarquée serait publique par construction.
