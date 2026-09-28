/**
 * The words of the home page, in each language. Like the pages about the site, it reads better
 * written out whole than cut into messages.
 */
import type { MediaKind } from '@/editors/registry';
import { getLocale } from '@/paraglide/runtime.js';

interface ShotCopy {
	/** The picture, in public/shots (e2e/screenshots.ts). */
	name: string;
	caption: string;
	alt: string;
}

interface EditorCopy {
	title: string;
	lede: string;
	points: [string, string][];
	open: string;
	shots: ShotCopy[];
}

export interface HomeCopy {
	nav: { label: string; editors: string; tasks: string; formats: string; faq: string; open: string };
	title: string;
	lede: string;
	open: string;
	reading: string;
	dropHint: string;
	heroAlt: string;
	trust: string[];
	editorsTitle: string;
	editors: Record<MediaKind, EditorCopy>;
	tasksTitle: string;
	tasksLede: string;
	formatsTitle: string;
	formats: { kind: MediaKind; title: string; items: string[] }[];
	faqTitle: string;
	faq: [string, string][];
	footer: {
		tagline: string;
		editors: string;
		tasks: string;
		resources: string;
		legal: string;
		source: string;
		system: string;
	};
}

const EN: HomeCopy = {
	nav: {
		label: 'Sections',
		editors: 'Editors',
		tasks: 'Tasks',
		formats: 'Formats',
		faq: 'Questions',
		open: 'Open a file',
	},
	title: 'Edit video, images, GIFs, sound and subtitles in your browser.',
	lede: 'Your files stay on your device: they are read and saved here, never uploaded.',
	open: 'Open a file',
	reading: 'Reading…',
	dropHint: 'or drop it anywhere on the page, or paste it',
	heroAlt:
		'The image editor: a photo of a lake at sunset with the Vivid look, its light and colour settings beside it.',
	trust: ['Nothing is uploaded', 'No account, no ads', 'Open source, AGPL-3.0', 'Works offline'],
	editorsTitle: 'The editors',
	editors: {
		video: {
			title: 'Video',
			lede: 'Trim, crop, compress and convert, with every track kept.',
			points: [
				['Cuts without re-encoding', 'Removed passages are skipped and the rest copied as it is.'],
				['A size you choose', 'Discord, WhatsApp, e-mail: the bitrate is worked out to fit.'],
				['Sound and subtitle tracks', 'Keep, rename, add, set their volume, or burn subtitles in.'],
			],
			open: 'Open the video editor',
			shots: [
				{
					name: 'video-trim',
					caption: 'Trim on the timeline',
					alt: 'The video editor with its timeline of pictures, sound and subtitles.',
				},
				{
					name: 'video-export',
					caption: 'Made for Discord',
					alt: 'The export of a video set up for Discord: MP4, H.264, 720p, within 10 MB.',
				},
				{
					name: 'video-subtitles',
					caption: 'Subtitle tracks',
					alt: 'The subtitle tracks of a video, in English and French.',
				},
			],
		},
		image: {
			title: 'Image',
			lede: 'Crop, adjust, compress and convert, one image or many.',
			points: [
				['jpegli, AVIF, JPEG XL', 'Lighter files at the same quality.'],
				['Settings and looks', 'Light, colour, sharpness, and ready-made looks.'],
				['In batches', 'Fifty photos at once, into a folder or a ZIP.'],
			],
			open: 'Open the image editor',
			shots: [
				{
					name: 'image-looks',
					caption: 'Looks and settings',
					alt: 'A photo with the Vivid look and its light settings.',
				},
				{
					name: 'image-formats',
					caption: 'Formats for every site',
					alt: 'Ready sizes for profile pictures, banners, stories and thumbnails.',
				},
				{
					name: 'image-export',
					caption: 'AVIF, JPEG XL, jpegli',
					alt: 'The export of a photo as AVIF, with its quality.',
				},
			],
		},
		gif: {
			title: 'GIF',
			lede: 'Make a GIF from a video or from images, or make an existing one lighter.',
			points: [
				['gifski', 'GIFs without colour bands, even in gradients.'],
				['A maximum size', 'Discord emoji, sticker, reaction: it fits the limit.'],
				['Frame by frame', 'Reorder, time, remove, extract or reverse frames.'],
			],
			open: 'Open the GIF editor',
			shots: [
				{
					name: 'gif-text',
					caption: 'Text and stickers',
					alt: 'A GIF of a sunset with the caption Golden hour.',
				},
				{
					name: 'gif-frames',
					caption: 'Every frame',
					alt: 'The frames of a GIF, each one to keep, remove or save.',
				},
				{
					name: 'gif-export',
					caption: 'GIF, APNG, WebP, video',
					alt: 'The export of a GIF with gifski, its quality and size limit.',
				},
			],
		},
		audio: {
			title: 'Audio',
			lede: 'Cut, normalise and convert, even a three-hour recording.',
			points: [
				['EBU R128', 'Loudness set to −14, −16 or −23 LUFS, for music, podcasts or broadcast.'],
				['Without re-encoding', 'Cut an MP3 or a FLAC without touching its quality.'],
				['Cleaner sound', 'Noise reduction, equalizer, volume smoothing, speed and pitch.'],
			],
			open: 'Open the audio editor',
			shots: [
				{
					name: 'audio-volume',
					caption: 'Loudness in LUFS',
					alt: 'The volume of a song measured in LUFS and true peak.',
				},
				{
					name: 'audio-sound',
					caption: 'Equalizer and noise reduction',
					alt: 'The Voice equalizer on a song, with its curve.',
				},
				{
					name: 'audio-export',
					caption: 'MP3, AAC, Opus, FLAC, WAV',
					alt: 'The export of a song, as its own format without re-encoding.',
				},
			],
		},
		subtitles: {
			title: 'Subtitles',
			lede: 'Resync, correct, style, translate and convert.',
			points: [
				['From MKV and MP4', 'Every track at once, fonts included, and back into the video.'],
				['Translation by hand', 'The original line beside the one you write.'],
			],
			open: 'Open the subtitle editor',
			shots: [
				{
					name: 'subtitles-editor',
					caption: 'Laid out like Aegisub',
					alt: 'The subtitle editor: the video, the sound around the line, the edit box and the lines.',
				},
				{
					name: 'subtitles-translate',
					caption: 'Translation',
					alt: 'An English track translated into Spanish, the original beside each line.',
				},
				{
					name: 'subtitles-timing',
					caption: 'Timing',
					alt: 'Shifting subtitles, syncing them on two lines, or changing their frame rate.',
				},
			],
		},
	},
	tasksTitle: 'I want to…',
	tasksLede: 'Each task opens its editor already set up.',
	formatsTitle: 'Formats',
	formats: [
		{
			kind: 'video',
			title: 'Video',
			items: ['MP4', 'MKV', 'WebM', 'MOV', 'H.264', 'H.265', 'VP9', 'AV1', 'AC-3', 'DTS'],
		},
		{
			kind: 'image',
			title: 'Image',
			items: ['JPEG', 'PNG', 'WebP', 'AVIF', 'JPEG XL', 'HEIC', 'TIFF', 'BMP', 'ICO'],
		},
		{ kind: 'gif', title: 'Animation', items: ['GIF', 'APNG', 'Animated WebP', 'MP4', 'WebM'] },
		{ kind: 'audio', title: 'Audio', items: ['MP3', 'AAC', 'Opus', 'FLAC', 'WAV', 'Ogg'] },
		{
			kind: 'subtitles',
			title: 'Subtitles',
			items: ['SRT', 'WebVTT', 'ASS', 'SSA', 'PGS (.sup)', 'MP4 timed text'],
		},
	],
	faqTitle: 'Questions',
	faq: [
		[
			'Are my files sent anywhere?',
			'No. Everything happens in your browser: the file never leaves your device. Once the page is loaded you can even cut the network.',
		],
		['Is it free?', 'Yes: no ads, no account, no paid version. The code is open, under the AGPL-3.0 licence.'],
		[
			'Which browsers?',
			'The latest versions of Chrome, Edge, Firefox and Safari, on computers and phones. The System page lists what your browser can decode and encode.',
		],
		[
			'Is there a size limit?',
			'No. Files are read piece by piece, so films of several gigabytes open. Only exports that must fit in memory, like a GIF, depend on your device.',
		],
		[
			'Why won’t my AVI open?',
			'Browsers can’t read old formats such as AVI, WMV, FLV or MPEG-2. Convert it to MP4 first, with HandBrake for example, then open it here.',
		],
		[
			'What if I close the tab?',
			'Your unfinished work is kept in your browser. Come back and it is offered again, undo history included.',
		],
	],
	footer: {
		tagline: 'Media editors in your browser. Nothing is uploaded.',
		editors: 'Editors',
		tasks: 'Tasks',
		resources: 'Resources',
		legal: 'Legal',
		source: 'Source code',
		system: 'Your browser',
	},
};

const FR: HomeCopy = {
	nav: {
		label: 'Rubriques',
		editors: 'Éditeurs',
		tasks: 'Tâches',
		formats: 'Formats',
		faq: 'Questions',
		open: 'Ouvrir un fichier',
	},
	title: 'Modifiez vidéos, images, GIF, sons et sous-titres dans votre navigateur.',
	lede: 'Vos fichiers restent sur votre appareil : ils sont lus et enregistrés ici, jamais envoyés.',
	open: 'Ouvrir un fichier',
	reading: 'Lecture…',
	dropHint: 'ou déposez-le n’importe où sur la page, ou collez-le',
	heroAlt:
		'L’éditeur d’images : une photo de lac au coucher du soleil avec l’effet Vivid, ses réglages de lumière et de couleur à côté.',
	trust: ['Rien n’est envoyé', 'Sans compte ni publicité', 'Code ouvert, AGPL-3.0', 'Fonctionne hors ligne'],
	editorsTitle: 'Les éditeurs',
	editors: {
		video: {
			title: 'Vidéo',
			lede: 'Couper, recadrer, compresser et convertir, en gardant toutes les pistes.',
			points: [
				['Des coupes sans réencoder', 'Les passages retirés sont sautés et le reste copié tel quel.'],
				['La taille que vous voulez', 'Discord, WhatsApp, e-mail : le débit est calculé pour tenir.'],
				[
					'Pistes son et sous-titres',
					'Garder, renommer, ajouter, régler le volume, ou incruster les sous-titres.',
				],
			],
			open: 'Ouvrir l’éditeur vidéo',
			shots: [
				{
					name: 'video-trim',
					caption: 'Couper sur la timeline',
					alt: 'L’éditeur vidéo avec sa timeline d’images, de son et de sous-titres.',
				},
				{
					name: 'video-export',
					caption: 'Réglé pour Discord',
					alt: 'L’export d’une vidéo réglé pour Discord : MP4, H.264, 720p, sous 10 Mo.',
				},
				{
					name: 'video-subtitles',
					caption: 'Pistes de sous-titres',
					alt: 'Les pistes de sous-titres d’une vidéo, en anglais et en français.',
				},
			],
		},
		image: {
			title: 'Image',
			lede: 'Recadrer, régler, compresser et convertir, une image ou plusieurs.',
			points: [
				['jpegli, AVIF, JPEG XL', 'Des fichiers plus légers à qualité égale.'],
				['Réglages et effets', 'Lumière, couleur, netteté, et des effets prêts.'],
				['Par lots', 'Cinquante photos d’un coup, dans un dossier ou un ZIP.'],
			],
			open: 'Ouvrir l’éditeur d’images',
			shots: [
				{
					name: 'image-looks',
					caption: 'Effets et réglages',
					alt: 'Une photo avec l’effet Vivid et ses réglages de lumière.',
				},
				{
					name: 'image-formats',
					caption: 'Des formats pour chaque site',
					alt: 'Des tailles prêtes pour les photos de profil, bannières, stories et miniatures.',
				},
				{
					name: 'image-export',
					caption: 'AVIF, JPEG XL, jpegli',
					alt: 'L’export d’une photo en AVIF, avec sa qualité.',
				},
			],
		},
		gif: {
			title: 'GIF',
			lede: 'Faire un GIF depuis une vidéo ou des images, ou alléger un GIF existant.',
			points: [
				['gifski', 'Des GIF sans bandes de couleur, même dans les dégradés.'],
				['Un poids maximum', 'Emoji Discord, sticker, réaction : il tient dans la limite.'],
				['Image par image', 'Réordonner, minuter, retirer, extraire ou inverser les images.'],
			],
			open: 'Ouvrir l’éditeur GIF',
			shots: [
				{
					name: 'gif-text',
					caption: 'Texte et stickers',
					alt: 'Un GIF de coucher de soleil avec la légende Heure dorée.',
				},
				{
					name: 'gif-frames',
					caption: 'Chaque image',
					alt: 'Les images d’un GIF, chacune à garder, retirer ou enregistrer.',
				},
				{
					name: 'gif-export',
					caption: 'GIF, APNG, WebP, vidéo',
					alt: 'L’export d’un GIF avec gifski, sa qualité et sa limite de poids.',
				},
			],
		},
		audio: {
			title: 'Audio',
			lede: 'Couper, normaliser et convertir, même un enregistrement de trois heures.',
			points: [
				['EBU R128', 'Le volume réglé à −14, −16 ou −23 LUFS, pour la musique, les podcasts ou la radio.'],
				['Sans réencoder', 'Couper un MP3 ou un FLAC sans toucher à sa qualité.'],
				['Un son plus propre', 'Réduction de bruit, égaliseur, lissage du volume, vitesse et hauteur.'],
			],
			open: 'Ouvrir l’éditeur audio',
			shots: [
				{
					name: 'audio-volume',
					caption: 'Volume en LUFS',
					alt: 'Le volume d’une chanson mesuré en LUFS et en crête vraie.',
				},
				{
					name: 'audio-sound',
					caption: 'Égaliseur et réduction de bruit',
					alt: 'L’égaliseur Voix sur une chanson, avec sa courbe.',
				},
				{
					name: 'audio-export',
					caption: 'MP3, AAC, Opus, FLAC, WAV',
					alt: 'L’export d’une chanson dans son propre format, sans réencoder.',
				},
			],
		},
		subtitles: {
			title: 'Sous-titres',
			lede: 'Resynchroniser, corriger, styliser, traduire et convertir.',
			points: [
				['Depuis un MKV ou un MP4', 'Toutes les pistes d’un coup, polices comprises, et retour dans la vidéo.'],
				['Traduction à la main', 'La réplique d’origine à côté de celle que vous écrivez.'],
			],
			open: 'Ouvrir l’éditeur de sous-titres',
			shots: [
				{
					name: 'subtitles-editor',
					caption: 'Disposé comme Aegisub',
					alt: 'L’éditeur de sous-titres : la vidéo, le son autour de la réplique, la zone d’édition et les répliques.',
				},
				{
					name: 'subtitles-translate',
					caption: 'Traduction',
					alt: 'Une piste anglaise traduite en espagnol, l’original à côté de chaque réplique.',
				},
				{
					name: 'subtitles-timing',
					caption: 'Synchronisation',
					alt: 'Décaler des sous-titres, les caler sur deux répliques ou changer leur fréquence d’images.',
				},
			],
		},
	},
	tasksTitle: 'Je veux…',
	tasksLede: 'Chaque tâche ouvre son éditeur déjà réglé.',
	formatsTitle: 'Formats',
	formats: [
		{
			kind: 'video',
			title: 'Vidéo',
			items: ['MP4', 'MKV', 'WebM', 'MOV', 'H.264', 'H.265', 'VP9', 'AV1', 'AC-3', 'DTS'],
		},
		{
			kind: 'image',
			title: 'Image',
			items: ['JPEG', 'PNG', 'WebP', 'AVIF', 'JPEG XL', 'HEIC', 'TIFF', 'BMP', 'ICO'],
		},
		{ kind: 'gif', title: 'Animation', items: ['GIF', 'APNG', 'WebP animé', 'MP4', 'WebM'] },
		{ kind: 'audio', title: 'Audio', items: ['MP3', 'AAC', 'Opus', 'FLAC', 'WAV', 'Ogg'] },
		{ kind: 'subtitles', title: 'Sous-titres', items: ['SRT', 'WebVTT', 'ASS', 'SSA', 'PGS (.sup)', 'Texte MP4'] },
	],
	faqTitle: 'Questions',
	faq: [
		[
			'Mes fichiers sont-ils envoyés quelque part ?',
			'Non. Tout se passe dans votre navigateur : le fichier ne quitte jamais votre appareil. Une fois la page chargée, vous pouvez même couper le réseau.',
		],
		[
			'C’est gratuit ?',
			'Oui : sans publicité, sans compte, sans version payante. Le code est ouvert, sous licence AGPL-3.0.',
		],
		[
			'Quels navigateurs ?',
			'Les dernières versions de Chrome, Edge, Firefox et Safari, sur ordinateur et sur téléphone. La page Système liste ce que votre navigateur sait décoder et encoder.',
		],
		[
			'Y a-t-il une limite de taille ?',
			'Non. Les fichiers sont lus morceau par morceau : des films de plusieurs gigaoctets s’ouvrent. Seuls les exports qui doivent tenir en mémoire, comme un GIF, dépendent de votre appareil.',
		],
		[
			'Pourquoi mon AVI ne s’ouvre pas ?',
			'Les navigateurs ne savent pas lire les vieux formats comme AVI, WMV, FLV ou MPEG-2. Convertissez-le d’abord en MP4, avec HandBrake par exemple, puis ouvrez-le ici.',
		],
		[
			'Et si je ferme l’onglet ?',
			'Votre travail en cours est gardé dans votre navigateur. Revenez : il vous est proposé à nouveau, historique d’annulation compris.',
		],
	],
	footer: {
		tagline: 'Des éditeurs de médias dans votre navigateur. Rien n’est envoyé.',
		editors: 'Éditeurs',
		tasks: 'Tâches',
		resources: 'Ressources',
		legal: 'Légal',
		source: 'Code source',
		system: 'Votre navigateur',
	},
};

export function homeCopy(): HomeCopy {
	return getLocale() === 'fr' ? FR : EN;
}
