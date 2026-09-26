/**
 * Questions answered on each task page, in each language: under the drop zone, and in the page's
 * HTML for search engines (scripts/prerender.ts). Every page ends with the same question about
 * privacy.
 */
import { getLocale } from '@/paraglide/runtime.js';

type Locale = 'en' | 'fr';
type Qa = [question: string, answer: string];

const PRIVACY: Record<Locale, Qa> = {
	en: [
		'Is my file uploaded?',
		'No. Vixely works entirely in your browser: the file is read, edited and saved on your device, and never sent anywhere. It is free, with no account and no watermark.',
	],
	fr: [
		'Mon fichier est-il envoyé en ligne ?',
		'Non. Vixely fonctionne entièrement dans votre navigateur : le fichier est lu, modifié et enregistré sur votre appareil, et n’est jamais envoyé. C’est gratuit, sans compte et sans filigrane.',
	],
};

const FAQ: Record<string, Record<Locale, Qa[]>> = {
	'compress-video': {
		en: [
			[
				'How do I make a video smaller?',
				'Open it, then pick a size limit or a bitrate in the export. Vixely works out the bitrate that fits, and can also lower the resolution or the frame rate.',
			],
			[
				'Which codec gives the smallest file?',
				'AV1 and H.265 make the smallest files at the same quality, when your browser can encode them; H.264 plays everywhere. The list only offers what your browser encodes.',
			],
			[
				'Can I keep a constant quality instead?',
				'Yes: choose Constant quality in the export and the size follows the picture, as with a CRF.',
			],
		],
		fr: [
			[
				'Comment réduire le poids d’une vidéo ?',
				'Ouvrez-la, puis choisissez une taille limite ou un débit dans l’export. Vixely calcule le débit qui tient, et peut aussi baisser la résolution ou la fréquence d’images.',
			],
			[
				'Quel codec donne le fichier le plus léger ?',
				'AV1 et H.265 donnent les fichiers les plus légers à qualité égale, si votre navigateur sait les encoder ; H.264 se lit partout. La liste ne propose que ce que votre navigateur encode.',
			],
			[
				'Puis-je garder une qualité constante ?',
				'Oui : choisissez Qualité constante dans l’export, le poids suit alors l’image, comme avec un CRF.',
			],
		],
	},
	'compress-video-for-discord': {
		en: [
			[
				'What size does Discord accept?',
				'Without Nitro, files up to 10 MB; the Discord preset aims just under it. The Discord Nitro preset aims under 500 MB.',
			],
			[
				'Will the video still look good?',
				'The preset brings the picture to 720p on its shorter side and spends the whole size on it; for long videos, cut what you don’t need first to keep more quality.',
			],
			[
				'Does the sound stay?',
				'Yes, as AAC, which Discord plays in its preview. Other sound tracks can be kept or removed in the export.',
			],
		],
		fr: [
			[
				'Quelle taille Discord accepte-t-il ?',
				'Sans Nitro, des fichiers jusqu’à 10 Mo ; le préréglage Discord vise juste en dessous. Le préréglage Discord Nitro vise moins de 500 Mo.',
			],
			[
				'La vidéo restera-t-elle belle ?',
				'Le préréglage ramène l’image à 720p sur son petit côté et y consacre toute la taille ; pour une longue vidéo, coupez d’abord ce qui ne sert pas pour garder plus de qualité.',
			],
			[
				'Le son reste-t-il ?',
				'Oui, en AAC, que Discord lit dans son aperçu. Les autres pistes son peuvent être gardées ou retirées dans l’export.',
			],
		],
	},
	'trim-video': {
		en: [
			[
				'Is the video re-encoded when I cut it?',
				'No. With Original selected, the kept passages are copied as they are, which takes seconds and loses nothing. Cuts then start on the nearest key frame.',
			],
			[
				'Can I remove a passage in the middle?',
				'Yes. Select it on the timeline and delete it; remove as many passages as you like, the rest is joined.',
			],
			[
				'Are subtitles and other tracks kept?',
				'Yes: every sound and subtitle track follows the cuts, fonts and chapters included.',
			],
		],
		fr: [
			[
				'La vidéo est-elle réencodée quand je la coupe ?',
				'Non. Avec Original, les passages gardés sont copiés tels quels : cela prend quelques secondes et ne perd rien. Les coupes commencent alors sur l’image clé la plus proche.',
			],
			[
				'Puis-je retirer un passage au milieu ?',
				'Oui. Sélectionnez-le sur la timeline et supprimez-le ; retirez autant de passages que vous voulez, le reste est raccordé.',
			],
			[
				'Les sous-titres et les autres pistes sont-ils gardés ?',
				'Oui : chaque piste son et sous-titres suit les coupes, polices et chapitres compris.',
			],
		],
	},
	'convert-video': {
		en: [
			[
				'Which formats can I convert to?',
				'MP4, MKV and WebM, with H.264, H.265, VP9 or AV1 pictures and AAC or Opus sound, as far as your browser encodes them.',
			],
			[
				'Can I change the container without re-encoding?',
				'Often, yes: with Original, the pictures and sound are copied into the new file when it can hold them, for instance MKV to MP4.',
			],
			[
				'Why won’t my AVI or WMV open?',
				'Browsers can’t read old formats such as AVI, WMV, FLV or MPEG-2. Convert it to MP4 with a desktop tool such as HandBrake first.',
			],
		],
		fr: [
			[
				'Vers quels formats puis-je convertir ?',
				'MP4, MKV et WebM, avec des images en H.264, H.265, VP9 ou AV1 et un son en AAC ou Opus, selon ce que votre navigateur encode.',
			],
			[
				'Puis-je changer de conteneur sans réencoder ?',
				'Souvent, oui : avec Original, les images et le son sont copiés dans le nouveau fichier quand il peut les contenir, par exemple de MKV vers MP4.',
			],
			[
				'Pourquoi mon AVI ou mon WMV ne s’ouvre pas ?',
				'Les navigateurs ne savent pas lire les vieux formats comme AVI, WMV, FLV ou MPEG-2. Convertissez-le d’abord en MP4 avec un logiciel comme HandBrake.',
			],
		],
	},
	'burn-subtitles': {
		en: [
			[
				'What does burning subtitles mean?',
				'The subtitles are drawn into the pictures themselves, so every player and every site shows them, with no track to switch on.',
			],
			[
				'Are ASS styles kept?',
				'Yes. ASS subtitles are drawn by libass with their fonts, colours, positions and effects; Blu-ray (PGS) pictures are burned as they are.',
			],
			[
				'Can I use a subtitle file of my own?',
				'Yes: add an SRT, ASS or VTT file to the video in the Subtitles tab, then choose it to burn.',
			],
		],
		fr: [
			[
				'Que veut dire incruster des sous-titres ?',
				'Les sous-titres sont dessinés dans les images elles-mêmes : tous les lecteurs et tous les sites les affichent, sans piste à activer.',
			],
			[
				'Les styles ASS sont-ils gardés ?',
				'Oui. Les sous-titres ASS sont dessinés par libass avec leurs polices, couleurs, positions et effets ; les images Blu-ray (PGS) sont incrustées telles quelles.',
			],
			[
				'Puis-je utiliser mon propre fichier de sous-titres ?',
				'Oui : ajoutez un fichier SRT, ASS ou VTT à la vidéo dans l’onglet Sous-titres, puis choisissez-le pour l’incruster.',
			],
		],
	},
	'video-to-gif': {
		en: [
			[
				'How do I get a sharp GIF?',
				'Vixely encodes with gifski, which picks the best colours for each frame, so gradients stay smooth. Keep the GIF short and narrow for a light file.',
			],
			[
				'Can I keep it under a size limit?',
				'Yes: set a maximum size and the width is reduced until the GIF fits, for a Discord emoji or a forum for instance.',
			],
			[
				'Can I add a caption?',
				'Yes, with the Text tool: titles, memes and captions, plus stickers, placed on the picture.',
			],
		],
		fr: [
			[
				'Comment obtenir un GIF net ?',
				'Vixely encode avec gifski, qui choisit les meilleures couleurs pour chaque image : les dégradés restent lisses. Gardez le GIF court et étroit pour un fichier léger.',
			],
			[
				'Puis-je rester sous une taille limite ?',
				'Oui : fixez un poids maximum et la largeur baisse jusqu’à ce que le GIF tienne, pour un emoji Discord ou un forum par exemple.',
			],
			[
				'Puis-je ajouter une légende ?',
				'Oui, avec l’outil Texte : titres, mèmes et légendes, plus des stickers, placés sur l’image.',
			],
		],
	},
	'gif-to-mp4': {
		en: [
			[
				'Why turn a GIF into a video?',
				'The same animation is usually ten times smaller as a video, and plays smoothly everywhere GIFs are too heavy.',
			],
			[
				'Which format does it make?',
				'An H.264 MP4 when your browser encodes it, else a VP9 WebM. Transparent GIFs can be kept transparent as WebM.',
			],
			[
				'Does the timing stay the same?',
				'Yes: each frame keeps its own delay, and the loop can be repeated in the video.',
			],
		],
		fr: [
			[
				'Pourquoi transformer un GIF en vidéo ?',
				'La même animation est en général dix fois plus légère en vidéo, et se lit sans à-coups partout où les GIF sont trop lourds.',
			],
			[
				'Quel format est créé ?',
				'Un MP4 en H.264 si votre navigateur sait l’encoder, sinon un WebM en VP9. Les GIF transparents peuvent rester transparents en WebM.',
			],
			[
				'Le rythme reste-t-il le même ?',
				'Oui : chaque image garde son propre délai, et la boucle peut être répétée dans la vidéo.',
			],
		],
	},
	'optimize-gif': {
		en: [
			[
				'How can a GIF get lighter?',
				'Make it narrower, skip one frame in two, raise the lossy compression, or cut what isn’t needed. A maximum size does it for you.',
			],
			[
				'Can I only trim it without touching the frames?',
				'Yes: with Original, the kept frames are copied as they are, only the first one is rebuilt.',
			],
			[
				'Can I save it as WebP or APNG?',
				'Yes. Animated WebP is often much lighter than GIF; APNG keeps every colour.',
			],
		],
		fr: [
			[
				'Comment alléger un GIF ?',
				'Réduisez sa largeur, sautez une image sur deux, augmentez la compression avec perte, ou coupez ce qui ne sert pas. Un poids maximum s’en charge pour vous.',
			],
			[
				'Puis-je seulement le couper sans toucher aux images ?',
				'Oui : avec Original, les images gardées sont copiées telles quelles, seule la première est reconstruite.',
			],
			[
				'Puis-je l’enregistrer en WebP ou en APNG ?',
				'Oui. Le WebP animé est souvent bien plus léger que le GIF ; l’APNG garde toutes les couleurs.',
			],
		],
	},
	'resize-image': {
		en: [
			[
				'How do I resize to an exact size?',
				'Type the width and height in the export, or pick a ready size in Formats: profile pictures, banners, stories, thumbnails and more.',
			],
			[
				'Will the picture be stretched?',
				'No. A fixed size first crops the picture to its proportions; move the crop to choose what stays.',
			],
			[
				'Can I resize many images at once?',
				'Yes: drop them together, and the same settings apply to all of them, saved into a folder or a ZIP.',
			],
		],
		fr: [
			[
				'Comment redimensionner à une taille exacte ?',
				'Tapez la largeur et la hauteur dans l’export, ou choisissez une taille prête dans Formats : photos de profil, bannières, stories, miniatures et plus.',
			],
			[
				'L’image sera-t-elle déformée ?',
				'Non. Une taille fixe recadre d’abord l’image à ses proportions ; déplacez le cadre pour choisir ce qui reste.',
			],
			[
				'Puis-je redimensionner plusieurs images d’un coup ?',
				'Oui : déposez-les ensemble, les mêmes réglages s’appliquent à toutes, enregistrées dans un dossier ou un ZIP.',
			],
		],
	},
	'compress-image': {
		en: [
			[
				'How much lighter can a photo get?',
				'Often three to ten times. JPEG goes through jpegli, AVIF and JPEG XL go further at the same quality, and PNG can be reduced to a palette.',
			],
			['Can I aim for a file size?', 'Yes: set a target size and the quality is chosen to fit it.'],
			[
				'Is my location removed?',
				'By default the camera details stay but the location is removed; you can also keep everything or remove all metadata.',
			],
		],
		fr: [
			[
				'De combien une photo peut-elle s’alléger ?',
				'Souvent de trois à dix fois. Le JPEG passe par jpegli, l’AVIF et le JPEG XL vont plus loin à qualité égale, et le PNG peut être réduit à une palette.',
			],
			['Puis-je viser un poids de fichier ?', 'Oui : fixez un poids cible, la qualité est choisie pour tenir.'],
			[
				'Ma position est-elle retirée ?',
				'Par défaut, les détails de l’appareil restent mais la position est retirée ; vous pouvez aussi tout garder ou tout retirer.',
			],
		],
	},
	'convert-image': {
		en: [
			[
				'Which formats can I convert between?',
				'JPEG, PNG, WebP, AVIF, JPEG XL, TIFF, BMP and ICO, from any of them and from HEIC photos.',
			],
			[
				'How do I open an iPhone HEIC photo?',
				'Just drop it: Vixely reads HEIC and turns it into JPEG, or any other format.',
			],
			['Is transparency kept?', 'Yes, in the formats that hold it: PNG, WebP, AVIF, JPEG XL, TIFF and ICO.'],
		],
		fr: [
			[
				'Entre quels formats puis-je convertir ?',
				'JPEG, PNG, WebP, AVIF, JPEG XL, TIFF, BMP et ICO, depuis chacun d’eux et depuis les photos HEIC.',
			],
			[
				'Comment ouvrir une photo HEIC d’iPhone ?',
				'Déposez-la simplement : Vixely lit le HEIC et le transforme en JPEG, ou dans n’importe quel autre format.',
			],
			[
				'La transparence est-elle gardée ?',
				'Oui, dans les formats qui la permettent : PNG, WebP, AVIF, JPEG XL, TIFF et ICO.',
			],
		],
	},
	'trim-audio': {
		en: [
			[
				'Is the sound re-encoded when I cut it?',
				'No. With Original, the kept passages are copied as they are: an MP3 stays the same MP3, with no loss.',
			],
			[
				'Can I fade in and out?',
				'Yes, with the Volume tool; fades then need the sound to be encoded again, in the format you choose.',
			],
			[
				'Does it work on long recordings?',
				'Yes: a three-hour recording opens in seconds and is never loaded whole in memory.',
			],
		],
		fr: [
			[
				'Le son est-il réencodé quand je le coupe ?',
				'Non. Avec Original, les passages gardés sont copiés tels quels : un MP3 reste le même MP3, sans perte.',
			],
			[
				'Puis-je ajouter des fondus ?',
				'Oui, avec l’outil Volume ; les fondus demandent alors de réencoder le son, dans le format de votre choix.',
			],
			[
				'Ça marche sur de longs enregistrements ?',
				'Oui : un enregistrement de trois heures s’ouvre en quelques secondes et n’est jamais chargé entier en mémoire.',
			],
		],
	},
	'normalize-audio': {
		en: [
			[
				'Which loudness should I choose?',
				'−14 LUFS for streaming services, −16 LUFS for podcasts, −23 LUFS for broadcast (EBU R128).',
			],
			['Will it clip?', 'No. The true peak is kept under −1 dBTP, so the sound never distorts after encoding.'],
			[
				'Can I normalise several files the same way?',
				'Yes: drop them together, each one is measured and brought to the same loudness.',
			],
		],
		fr: [
			[
				'Quel volume choisir ?',
				'−14 LUFS pour les plateformes de streaming, −16 LUFS pour les podcasts, −23 LUFS pour la diffusion (EBU R128).',
			],
			[
				'Le son va-t-il saturer ?',
				'Non. La crête vraie reste sous −1 dBTP : le son ne distord jamais après l’encodage.',
			],
			[
				'Puis-je normaliser plusieurs fichiers pareil ?',
				'Oui : déposez-les ensemble, chacun est mesuré et amené au même volume.',
			],
		],
	},
	'convert-audio': {
		en: [
			['Which formats can I convert to?', 'MP3, AAC, Opus, FLAC and WAV, at 44.1 or 48 kHz, in mono or stereo.'],
			[
				'Are the title and cover kept?',
				'Yes. The tags are shown and can be edited, and the cover can be kept, removed or replaced.',
			],
			[
				'Is FLAC to MP3 lossless?',
				'No: MP3, AAC and Opus drop what is hardest to hear. FLAC and WAV keep everything.',
			],
		],
		fr: [
			[
				'Vers quels formats puis-je convertir ?',
				'MP3, AAC, Opus, FLAC et WAV, en 44,1 ou 48 kHz, en mono ou en stéréo.',
			],
			[
				'Le titre et la pochette sont-ils gardés ?',
				'Oui. Les étiquettes s’affichent et se modifient, et la pochette peut être gardée, retirée ou remplacée.',
			],
			[
				'Passer de FLAC à MP3 est-il sans perte ?',
				'Non : MP3, AAC et Opus retirent ce qui s’entend le moins. FLAC et WAV gardent tout.',
			],
		],
	},
	'extract-audio': {
		en: [
			[
				'How do I get the sound of a video?',
				'Drop the video here: its sound opens in the audio editor, ready to cut and save.',
			],
			[
				'Is the sound re-encoded?',
				'Not with Original: the track is copied as it is, for instance an AAC track into an M4A file.',
			],
			['Can I choose which track?', 'Yes, when the video has several, such as a commentary or another language.'],
		],
		fr: [
			[
				'Comment récupérer le son d’une vidéo ?',
				'Déposez la vidéo ici : son son s’ouvre dans l’éditeur audio, prêt à être coupé et enregistré.',
			],
			[
				'Le son est-il réencodé ?',
				'Pas avec Original : la piste est copiée telle quelle, par exemple une piste AAC dans un fichier M4A.',
			],
			[
				'Puis-je choisir la piste ?',
				'Oui, quand la vidéo en a plusieurs, comme un commentaire ou une autre langue.',
			],
		],
	},
	'resync-subtitles': {
		en: [
			[
				'My subtitles are late by the same amount all along. What do I do?',
				'Use Shift in the Timing tool and move every line by that amount, earlier or later.',
			],
			[
				'They drift more and more. What then?',
				'Sync on two lines: give the right time of one line near the start and one near the end, and everything in between follows.',
			],
			[
				'What about a 23.976 fps versus 25 fps difference?',
				'Convert the frame rate in the Timing tool: the times are scaled from one rate to the other.',
			],
		],
		fr: [
			[
				'Mes sous-titres ont le même retard du début à la fin. Que faire ?',
				'Utilisez Décaler dans l’outil Synchronisation et déplacez toutes les répliques de ce temps, plus tôt ou plus tard.',
			],
			[
				'Le décalage grandit au fil du film. Et alors ?',
				'Calez sur deux répliques : donnez la bonne heure d’une réplique au début et d’une à la fin, tout le reste suit.',
			],
			[
				'Et un écart entre 23,976 et 25 images/s ?',
				'Convertissez la fréquence dans l’outil Synchronisation : les temps passent d’une fréquence à l’autre.',
			],
		],
	},
	'convert-subtitles': {
		en: [
			[
				'Which subtitle formats are supported?',
				'SRT, WebVTT and ASS/SSA to read and write, plus Blu-ray PGS (.sup) pictures, which text recognition turns into text.',
			],
			[
				'My accents show as strange characters. Why?',
				'The file was saved in an old character set. Vixely guesses it, and you can pick another one; it is saved as UTF-8.',
			],
			[
				'Can I convert many files at once?',
				'Yes: drop them together to shift and convert them all into one format, as a folder or a ZIP.',
			],
		],
		fr: [
			[
				'Quels formats de sous-titres sont pris en charge ?',
				'SRT, WebVTT et ASS/SSA en lecture et en écriture, plus les images Blu-ray PGS (.sup), que la reconnaissance de texte transforme en texte.',
			],
			[
				'Mes accents s’affichent en caractères bizarres. Pourquoi ?',
				'Le fichier a été enregistré dans un ancien jeu de caractères. Vixely le devine, vous pouvez en choisir un autre ; il est enregistré en UTF-8.',
			],
			[
				'Puis-je convertir plusieurs fichiers d’un coup ?',
				'Oui : déposez-les ensemble pour les décaler et les convertir tous dans un format, en dossier ou en ZIP.',
			],
		],
	},
	'extract-subtitles': {
		en: [
			[
				'How do I get the subtitles out of an MKV?',
				'Drop the video: all its subtitle tracks are read at once. Choose one, then save it as a file.',
			],
			[
				'What about Blu-ray (PGS) subtitles?',
				'They are saved as .sup, or turned into editable text by text recognition.',
			],
			[
				'And if the video has no subtitles?',
				'Transcribe its speech with Whisper, on your device, then correct the lines.',
			],
		],
		fr: [
			[
				'Comment extraire les sous-titres d’un MKV ?',
				'Déposez la vidéo : toutes ses pistes de sous-titres sont lues d’un coup. Choisissez-en une, puis enregistrez-la en fichier.',
			],
			[
				'Et les sous-titres Blu-ray (PGS) ?',
				'Ils sont enregistrés en .sup, ou transformés en texte modifiable par la reconnaissance de texte.',
			],
			[
				'Et si la vidéo n’a pas de sous-titres ?',
				'Transcrivez sa parole avec Whisper, sur votre appareil, puis corrigez les répliques.',
			],
		],
	},
};

/** A task page's questions in a language, the one on screen by default. */
export function taskFaq(slug: string, locale: Locale = getLocale() === 'fr' ? 'fr' : 'en'): Qa[] {
	return [...(FAQ[slug]?.[locale] ?? []), PRIVACY[locale]];
}

/** The heading of the questions. */
export function faqTitle(): string {
	return getLocale() === 'fr' ? 'Questions fréquentes' : 'Questions';
}
