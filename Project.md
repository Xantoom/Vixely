# Le projet Vixely

C'est une application web, ayant pour nom de domaine "vixely.app". Hébergé chez Railway, enregistrement DNS chez Cloudflare. Le nom de domaine a été acheté chez Hostinger.
Le but est de faire une application pour éditer des médias (Images, Vidéos, GIF, Audios, Sous titres), le tout en étant 100% client-side. Le but est de remplacer plusieurs applications desktops par 1 interface web rapide et performante. L'application doit s'adresser aussi bien aux néophytes qui veulent juste rapidement changer un format d'image qu'à quelqu'un qui veut réencoder une vidéo et gérer plusieurs pistes audios et de sous titres en appliquant des filtres et en modifiant les pistes.
Aucun traitement côté serveur. Le projet n'a pas pour vocation (en tout cas pour le moment) à être commercialisé. La langue principale sera l'anglais, avec des traductions pour le français, l'espagnol, l'italien, l'allemand, le chinois et le japonais. On récupérera la langue de l'OS de l'utilisateur pour savoir dans quelle langue il est.

## Images :

- Convertir dans un autre format / optimiser.
- Crop.
- Upscale / Donwnscale / Rescale.
- Filtres & color correction & ajouter du texte.

## GIF :

- Convertir dans un autre format / optimiser.
- Extraire et télécharger une ou plusieurs images (et/ou ouvrir dans un nouvel onglet l'image dans l'éditeur d'image).
- Crop.
- Upscale / Downscale / Rescale.
- Supprimer / Réarranger chaque image.
- Filtres & color correction & ajouter du texte.

## Audios :

- Convertir dans un autre format / optimiser.
- Crop.
- Normalizer / Equalizer / Filtres.
- Editer les audios (couper, ajouter, réarranger).

## Sous-titres :

- Convertir dans un autre format / optimiser.
- Editer les sous titres, et les entêtes.

## Vidéos :

- Convertir dans un autre format / optimiser.
- Filtres & color corrections.
- Sélectionner les différentes pistes (vidéos, audios, sous titres) et pouvoir en ajouter / modifier / supprimer.
- Pouvoir éditer les audios et les sous titres.
- Editer la vidéo à la frame près.
- Proposer de l'encodage dans un autre codec pour la vidéo, l'audio et les sous titres.
- Ajouter du textes sur la vidéo.

Pour tout cela, on s'aidera de la bibliothèque "Mediabunny" (et les extensions), qui exploite WebCodecs. On devra toujours avoir un rendu en preview en temps réel, fluide. Avce la possibilité de zoom in et out, et aussi de se déplacer facilement dans le "canva" de travail.
A tout moment, on doit pouvoir revenir en arrière sur une action ou revenir en avant.
Pour les preview, on voudra utiliser Mediabunny directement pour le décodage. On veut des lecteurs (audio, vidéo) 100% customs, avec sélection possible si multipiste, contrôle du volume, plein écran, pause, pour l'audio visualisation de la bande de fréquence, pour la vidéo de la précision au choix keyframe ou frame près ou temps.

Si tu as d'autres propositions à faire pour les fonctionnalités tu peux en recommander.

## Stack technique (on prendra toujours la latest stable version) :

- Dockerfile pour le déploiement sur Railway, via les pipelines de Github.
- Typescript.
- React.
- TailwindCSS.
- Bun.
- Vite si on utilise Tanstack Start/Router.
- La suite Tanstack la où elle est pertinente.
- Zustand si besoin.
- Oxfmt et Oxlint (configuration de qualité).
- Mediabunny (avec les extensions).

Pour Mediabunny : https://mediabunny.dev/
Il faut utiliser tous les codecs supportés par Mediabunny, même les extensions comme le très récent DTS. Je te laisse parcourir la documentation et les releases de Mediabunny pour voir ce qu'il est possible de faire avec.

L'application doit être le plus optimisé possible au niveau des performances et de la sécurité.
Il faudra aussi une suite de tests complètes en Typescript, pour vérifier que l'application n'est pas de comportements indésirables et que tout fonctionne correctement.

Pour le visuel, il faudra un thème light et un thème dark (avec un sélécteur par défaut sur Système, mais avec possibilité de choisir light ou dark, enregistré dans le navigateur). Pour les couleurs, on se basera sur Catppuccin (Latte pour light, Macchiato pour le dark). On devra avoir des composants customs, réutilisables et avec une cohérence. On ne veut aucun visuel natif HTML5 ou du navigateur. On respecte les derniers standards pour l'accessibilité et pour les normes d'UI/UX. On veut une interface moderne, mais en restant assez clean sans trop surcharger. On veut des animations et transitions smooth, qui reste légères en ressources. On évite d'avoir une interface qui ressemble à toutes les autres interfaces vibe codés. On utilise des codes couleurs clairs et intuitifs pour les utilisateurs.
Il faudra créer une identité visuelle propre à Vixely, avec un logo.

L'interface devra être pensé pour un moniteur PC en premier. Mais elle devra être bien adapté pour le mobile et les tablettes également (avec mode tactile). On devra aussi prendre en compte les écrans larges pour que ces écrans puissent profiter de leur place disponibles aussi. Il faudra aussi prendre en compte la résolution de l'écran sur lequel se trouve l'utilisateur et du DPI sur lequel il a réglé sur OS.

Le code doit être propre, maintenable, lisible et facilement upgradable par une IA. La qualité de code doit être le meilleur possible. Le code est hébergé sur Github, en publique. On ne surcharge pas de commentaire. On ne charge une librairie que si elle est nécessaire.
Il faudra écrire un document CLAUDE.md de qualité, selon les recommendations d'Anthropic.
Il faudra écrire un README.md de qualité, pas pour vendre le produit mais simplement pour le présenter de façon, neutre.

Il faut aussi que le site soit sécurisé par Cloudflare, et avoir un rate limite sur tout le site pour éviter les bots.
On autorisera les agents IA avec du rate limit bien sur pour qu'ils découvrent le site et le connaissent.

On aura aucune base de données pour cette application.

Si tu as des propositions pertinentes tu peux les proposer.

Tu DOIS d'abord faire un plan complet (tu es Claude Opus 5 donc suis les recommendations de plan pour Claude Opus 5) dans un document md à la racine du projet. J'exécuterai ensuite ce plan une fois finalisé. Tu peux faire plusieurs documents MD dont 1 principale.

Tu peux poser des questions (autant que tu veux) si tu as besoin.

**Tu peux rechercher sur le web si besoin.**
Quand tu recherches des informations sur le web, essaye toujours de rechercher les informations les plus récentes possibles. Si une informations date de plus de 6 mois, elle peut être considéré comme possiblement outdated.
