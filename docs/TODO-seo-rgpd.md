# TODO — SEO, RGPD & Conformité EU

Ce document liste les tâches restantes après la refonte homepage SEO et la mise en conformité RGPD/LCEN.

---

## Obligatoire (à faire avant mise en production)

### Mentions légales (`/legal`)
- [ ] Remplacer `[Your Name]` par ton vrai nom (obligatoire LCEN, Art. 6)
- [ ] Remplacer `contact@vixely.app` par ton vrai email de contact
- [ ] Vérifier l'adresse de Railway (hébergeur) si elle a changé

### Privacy Policy (`/privacy`)
- [ ] Vérifier que l'email de contact est correct
- [ ] Si tu utilises un nom de domaine email différent, le mettre à jour partout

---

## Google Analytics (quand tu l'ajouteras)

### Intégration technique
- [ ] Installer le script GA (gtag.js) **conditionné** au consentement :
  ```tsx
  const { analyticsAllowed } = useCookieConsent();
  useEffect(() => {
    if (analyticsAllowed) {
      // Charger dynamiquement le script GA
    }
  }, [analyticsAllowed]);
  ```
- [ ] Ne **jamais** charger GA avant le consentement (violation RGPD = amende)
- [ ] Activer l'anonymisation IP dans GA (`anonymize_ip: true`)
- [ ] Configurer la durée de rétention des données dans GA (14 mois max recommandé par la CNIL)

### Privacy Policy
- [ ] Mettre à jour la section "Google Analytics" dans `/privacy` — retirer "When enabled" et décrire les données collectées concrètement
- [ ] Ajouter l'ID de mesure GA dans la cookie policy si nécessaire

---

## Google AdSense (quand tu l'ajouteras)

### Prérequis RGPD
- [ ] Utiliser un **CMP certifié Google** (Consent Management Platform) compatible avec le **TCF v2.2** (IAB Transparency and Consent Framework)
  - Options : Cookiebot, Quantcast Choice, Usercentrics
  - Le CookieBanner actuel est une base mais AdSense exige un CMP certifié
- [ ] Conditionner le chargement d'AdSense au consentement `advertisingAllowed` :
  ```tsx
  const { advertisingAllowed } = useCookieConsent();
  useEffect(() => {
    if (advertisingAllowed) {
      // Charger dynamiquement le script AdSense
    }
  }, [advertisingAllowed]);
  ```
- [ ] S'inscrire à Google AdSense et obtenir l'ID éditeur
- [ ] Ajouter les balises `ads.txt` dans `/public/ads.txt`

### Privacy Policy
- [ ] Mettre à jour la section "Google AdSense" dans `/privacy`
- [ ] Lister les cookies publicitaires spécifiques utilisés par Google

---

## SEO — Améliorations supplémentaires

### Google Search Console
- [ ] Créer un compte Google Search Console pour `vixely.app`
- [ ] Ajouter la balise `<meta name="google-site-verification" content="...">` dans `index.html`
- [ ] Soumettre le sitemap (`https://vixely.app/sitemap.xml`)
- [ ] Vérifier l'indexation des pages

### Open Graph Image
- [ ] Créer une image OG (`/public/og-image.png`) de qualité — 1200x630px
- [ ] Inclure le logo Vixely, le tagline, et un aperçu de l'interface
- [ ] Tester avec https://www.opengraph.xyz/

### Performance (Core Web Vitals)
- [ ] Mesurer LCP, INP, CLS avec Lighthouse ou PageSpeed Insights
- [ ] Objectifs : LCP < 2.5s, INP < 200ms, CLS < 0.1
- [ ] Optimiser les fonts (preload, font-display: swap)
- [ ] Vérifier que les images sont en WebP/AVIF avec lazy loading

### Contenu SEO additionnel (optionnel mais recommandé)
- [ ] Ajouter des pages dédiées par outil pour le SEO long-tail :
  - `/video-editor` — "Free Online Video Editor"
  - `/image-editor` — "Free Online Image Editor"
  - `/gif-editor` — "Free Online GIF Editor"
- [ ] Ajouter un blog ou des guides (ex : "How to trim a video online", "How to resize an image for Discord")
- [ ] Ajouter des `<meta>` keywords spécifiques par page outil (video.tsx, image.tsx, gif.tsx)

### Structured Data
- [ ] Tester les JSON-LD avec [Google Rich Results Test](https://search.google.com/test/rich-results)
- [ ] Ajouter un schema `HowTo` si tu crées des pages tutoriels
- [ ] Vérifier que le schema `FAQPage` s'affiche dans les résultats enrichis

---

## Accessibilité (European Accessibility Act — EAA)

L'EAA est en vigueur depuis juin 2025. Les obligations s'appliquent progressivement.

- [ ] Vérifier la conformité WCAG 2.1 AA :
  - Contraste texte 4.5:1 minimum
  - Tous les éléments interactifs atteignables au clavier
  - `aria-label` sur les boutons icônes
  - `alt` sur toutes les images
- [ ] Tester avec un lecteur d'écran (NVDA, VoiceOver)
- [ ] Ajouter une page `/accessibility` (déclaration d'accessibilité) — de plus en plus attendu par les régulateurs EU
- [ ] Respecter `prefers-reduced-motion` (déjà fait dans `styles.css`)

---

## Sécurité & Headers

- [ ] Vérifier les headers de sécurité sur Railway :
  - `Strict-Transport-Security` (HSTS)
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Content-Security-Policy` (CSP) — attention aux scripts inline
  - `Cross-Origin-Opener-Policy` (COOP) — déjà en place pour WASM
  - `Cross-Origin-Embedder-Policy` (COEP) — déjà en place pour WASM

---

## Résumé des priorités

| Priorité | Tâche | Impact |
|----------|-------|--------|
| **P0** | Remplir les mentions légales (nom + email) | Obligatoire par la loi |
| **P1** | Google Search Console + soumettre sitemap | SEO fondamental |
| **P1** | Image OG de qualité | Partage social |
| **P2** | Intégrer GA avec consentement conditionnel | Analytics |
| **P2** | Core Web Vitals < seuils | SEO ranking |
| **P3** | CMP certifié pour AdSense | Quand AdSense sera ajouté |
| **P3** | Pages SEO dédiées par outil | Long-tail SEO |
| **P3** | Audit accessibilité WCAG 2.1 AA | Conformité EAA |
