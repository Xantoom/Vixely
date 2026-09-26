/**
 * The text of the pages about the site, in each language. Long prose reads better written out
 * whole than cut into messages.
 */
import { getLocale } from '@/paraglide/runtime.js';
import { analyticsEnabled } from '../analytics';
import { type PageContent, TextLink } from './SitePage';

const ISSUES = 'https://github.com/Xantoom/Vixely/issues';
const SOURCE = 'https://github.com/Xantoom/Vixely';
const UPDATED = { en: 'Last updated September 26, 2026', fr: 'Mis à jour le 26 septembre 2026' };

type Locale = 'en' | 'fr';

function locale(): Locale {
	return getLocale() === 'fr' ? 'fr' : 'en';
}

const CREDITS = [
	['Mediabunny', 'https://mediabunny.dev'],
	['FFmpeg (AC-3, E-AC-3, DTS and AAC coders)', 'https://ffmpeg.org'],
	['RNNoise / nnnoiseless', 'https://github.com/jneem/nnnoiseless'],
	['Whisper / transformers.js / ONNX Runtime', 'https://huggingface.co/docs/transformers.js'],
	['Tesseract / tesseract.js-core', 'https://github.com/naptha/tesseract.js-core'],
	['LAME', 'https://lame.sourceforge.io'],
	['libFLAC', 'https://xiph.org/flac/'],
	['gifski', 'https://gif.ski'],
	['libimagequant', 'https://pngquant.org/lib/'],
	['zenjpeg (jpegli)', 'https://github.com/imazen/zenjpeg'],
	['oxipng', 'https://github.com/shssoichiro/oxipng'],
	['ravif / rav1e', 'https://github.com/kornelski/cavif-rs'],
	['jxl-oxide', 'https://github.com/tirr-c/jxl-oxide'],
	['libheif', 'https://github.com/strukturag/libheif'],
	['JASSUB / libass', 'https://github.com/ThaUnknown/jassub'],
	['ebur128', 'https://github.com/sdroege/ebur128'],
	['image-rs', 'https://github.com/image-rs/image'],
	['jxl-encoder', 'https://github.com/imazen/jxl-encoder'],
	['wasm-bindgen-rayon', 'https://github.com/RReverser/wasm-bindgen-rayon'],
	['Twemoji (CC BY 4.0)', 'https://github.com/jdecked/twemoji'],
	['Geist', 'https://vercel.com/font'],
	['Anton, Bebas Neue, Oswald, Playfair Display, Pacifico, Permanent Marker, Caveat', 'https://fonts.google.com'],
] as const;

function credits() {
	return (
		<ul className="grid list-disc gap-1 pl-5">
			{CREDITS.map(([name, url]) => (
				<li key={name}>
					<TextLink href={url}>{name}</TextLink>
				</li>
			))}
		</ul>
	);
}

const ABOUT: Record<Locale, PageContent> = {
	en: {
		title: 'About Vixely',
		description:
			'Vixely edits video, images, GIFs, audio and subtitles in your browser. Free, open source, nothing uploaded.',
		sections: [
			{
				title: 'Everything stays on your device',
				body: (
					<p>
						Vixely edits video, images, GIFs, audio and subtitles right in your browser. Your files are
						read, edited and saved on your device: none is ever sent to a server, and there is no account
						and no size limit.
					</p>
				),
			},
			{
				title: 'The best encoders there are',
				body: (
					<p>
						For each format, Vixely uses the best encoder that runs in a browser: jpegli for JPEG, gifski
						for GIF, libimagequant and oxipng for PNG, rav1e for AVIF, the browser's own hardware encoders
						for video, and libass to draw subtitles exactly as players do.
					</p>
				),
			},
			{
				title: 'Free and open source',
				body: (
					<p>
						Vixely is free, without ads, and its source code is public under the AGPL-3.0 license:{' '}
						<TextLink href={SOURCE}>github.com/Xantoom/Vixely</TextLink>. Found a bug, or missing something?{' '}
						<TextLink href={ISSUES}>Open an issue</TextLink>.
					</p>
				),
			},
			{ title: 'Built with', body: credits() },
		],
	},
	fr: {
		title: 'À propos de Vixely',
		description:
			"Vixely modifie vidéos, images, GIF, sons et sous-titres dans votre navigateur. Gratuit, open source, rien n'est envoyé.",
		sections: [
			{
				title: 'Tout reste sur votre appareil',
				body: (
					<p>
						Vixely modifie vidéos, images, GIF, sons et sous-titres directement dans votre navigateur. Vos
						fichiers sont lus, modifiés et enregistrés sur votre appareil : aucun n'est jamais envoyé à un
						serveur, sans compte et sans limite de taille.
					</p>
				),
			},
			{
				title: 'Les meilleurs encodeurs',
				body: (
					<p>
						Pour chaque format, Vixely utilise le meilleur encodeur qui tourne dans un navigateur : jpegli
						pour le JPEG, gifski pour le GIF, libimagequant et oxipng pour le PNG, rav1e pour l'AVIF, les
						encodeurs matériels du navigateur pour la vidéo, et libass pour dessiner les sous-titres comme
						les lecteurs.
					</p>
				),
			},
			{
				title: 'Gratuit et open source',
				body: (
					<p>
						Vixely est gratuit, sans publicité, et son code source est public sous licence AGPL-3.0 :{' '}
						<TextLink href={SOURCE}>github.com/Xantoom/Vixely</TextLink>. Un bug, un manque ?{' '}
						<TextLink href={ISSUES}>Ouvrez une issue</TextLink>.
					</p>
				),
			},
			{ title: 'Construit avec', body: credits() },
		],
	},
};

function privacy(lang: Locale): PageContent {
	const counting: Record<Locale, PageContent['sections'][number]> = {
		en: {
			title: 'Visit counting',
			body: (
				<p>
					To know which pages are used, each page shown is counted with{' '}
					<TextLink href="https://www.goatcounter.com">GoatCounter</TextLink>: its address, the site you came
					from, your screen width, and the browser and system your browser reports. No cookie is set and
					nothing is stored on your device; GoatCounter stores no IP address and cannot follow a visitor from
					one site or one day to another.
				</p>
			),
		},
		fr: {
			title: 'Comptage des visites',
			body: (
				<p>
					Pour savoir quelles pages servent, chaque page affichée est comptée avec{' '}
					<TextLink href="https://www.goatcounter.com">GoatCounter</TextLink> : son adresse, le site d'où vous
					venez, la largeur de votre écran, et le navigateur et le système que votre navigateur annonce. Aucun
					cookie n'est déposé et rien n'est enregistré sur votre appareil ; GoatCounter n'enregistre aucune
					adresse IP et ne peut pas suivre un visiteur d'un site ou d'un jour à l'autre.
				</p>
			),
		},
	};
	const pages: Record<Locale, PageContent> = {
		en: {
			title: 'Privacy',
			description: 'Your files never leave your device: how Vixely handles your data.',
			lede: UPDATED.en,
			sections: [
				{
					title: 'Your files',
					body: (
						<p>
							Vixely works entirely in your browser. The files you open are read, edited and saved on your
							device and are never sent anywhere. Large exports may be written for a moment to your
							browser's private storage before they are saved; they are deleted afterwards.
						</p>
					),
				},
				{
					title: 'On your device',
					body: (
						<p>
							Vixely remembers your theme and your language in your browser's local storage. It sets no
							cookie. You can clear this at any time from your browser's settings.
						</p>
					),
				},
				{
					title: 'Downloaded when needed',
					body: (
						<p>
							Two tools need data too large to come with the site, downloaded the first time they are used
							and then kept by your browser: speech recognition models (Whisper, from{' '}
							<TextLink href="https://huggingface.co">Hugging Face</TextLink>) and text recognition
							languages (Tesseract, from <TextLink href="https://www.jsdelivr.com">jsDelivr</TextLink>).
							These servers see a download, like any web request; your files and what is said or written
							in them stay on your device.
						</p>
					),
				},
				...(analyticsEnabled ? [counting.en] : []),
				{
					title: 'Hosting',
					body: (
						<p>
							The site is served by Railway, whose servers, like any web server, see the IP address of
							each request and may keep it in their logs for a short time for security and operation.
						</p>
					),
				},
				{
					title: 'Your rights',
					body: (
						<p>
							Under the GDPR you may ask to access or delete data concerning you. As Vixely holds none
							beyond what is described above, questions can be asked on{' '}
							<TextLink href={ISSUES}>GitHub</TextLink>. You may also contact the French data protection
							authority, the <TextLink href="https://www.cnil.fr">CNIL</TextLink>.
						</p>
					),
				},
			],
		},
		fr: {
			title: 'Confidentialité',
			description: 'Vos fichiers ne quittent jamais votre appareil : comment Vixely traite vos données.',
			lede: UPDATED.fr,
			sections: [
				{
					title: 'Vos fichiers',
					body: (
						<p>
							Vixely fonctionne entièrement dans votre navigateur. Les fichiers que vous ouvrez sont lus,
							modifiés et enregistrés sur votre appareil, et ne sont jamais envoyés nulle part. Les gros
							exports peuvent passer un instant par le stockage privé de votre navigateur avant d'être
							enregistrés ; ils y sont ensuite effacés.
						</p>
					),
				},
				{
					title: 'Sur votre appareil',
					body: (
						<p>
							Vixely retient votre thème et votre langue dans le stockage local de votre navigateur. Il ne
							dépose aucun cookie. Vous pouvez effacer ces réglages à tout moment depuis votre navigateur.
						</p>
					),
				},
				{
					title: 'Téléchargé au besoin',
					body: (
						<p>
							Deux outils ont besoin de données trop lourdes pour venir avec le site, téléchargées à leur
							première utilisation puis gardées par votre navigateur : les modèles de reconnaissance de la
							parole (Whisper, depuis <TextLink href="https://huggingface.co">Hugging Face</TextLink>) et
							les langues de reconnaissance de texte (Tesseract, depuis{' '}
							<TextLink href="https://www.jsdelivr.com">jsDelivr</TextLink>). Ces serveurs voient un
							téléchargement, comme toute requête web ; vos fichiers et ce qui s'y dit ou s'y lit restent
							sur votre appareil.
						</p>
					),
				},
				...(analyticsEnabled ? [counting.fr] : []),
				{
					title: 'Hébergement',
					body: (
						<p>
							Le site est servi par Railway, dont les serveurs, comme tout serveur web, voient l'adresse
							IP de chaque requête et peuvent la garder peu de temps dans leurs journaux, pour la sécurité
							et le fonctionnement.
						</p>
					),
				},
				{
					title: 'Vos droits',
					body: (
						<p>
							Le RGPD vous permet de demander l'accès aux données vous concernant ou leur effacement.
							Vixely n'en détenant pas d'autres que celles décrites ici, vos questions peuvent être posées
							sur <TextLink href={ISSUES}>GitHub</TextLink>. Vous pouvez aussi saisir la{' '}
							<TextLink href="https://www.cnil.fr">CNIL</TextLink>.
						</p>
					),
				},
			],
		},
	};
	return pages[lang];
}

const TERMS: Record<Locale, PageContent> = {
	en: {
		title: 'Terms of use',
		description: 'The terms of use of Vixely, a free media editor that runs in your browser.',
		lede: UPDATED.en,
		sections: [
			{
				title: 'Use',
				body: (
					<p>
						Vixely is free to use, for personal or professional purposes, without an account. Using it means
						accepting these terms.
					</p>
				),
			},
			{
				title: 'Your content',
				body: (
					<p>
						Your files remain yours: Vixely never receives them and claims no right over them. You are
						responsible for having the right to edit and share what you process with it.
					</p>
				),
			},
			{
				title: 'No warranty',
				body: (
					<p>
						Vixely is provided as it is, without warranty of any kind. What it can do depends on your
						browser and your device. Keep your original files: the publisher cannot be held liable for a
						failed or incomplete export, or for any loss of data.
					</p>
				),
			},
			{
				title: 'Source code',
				body: (
					<p>
						The source code of Vixely is published under the{' '}
						<TextLink href="https://www.gnu.org/licenses/agpl-3.0.html">GNU AGPL-3.0</TextLink> license at{' '}
						<TextLink href={SOURCE}>github.com/Xantoom/Vixely</TextLink>.
					</p>
				),
			},
			{ title: 'Applicable law', body: <p>These terms are governed by French law.</p> },
		],
	},
	fr: {
		title: "Conditions d'utilisation",
		description:
			"Les conditions d'utilisation de Vixely, un éditeur de médias gratuit qui fonctionne dans votre navigateur.",
		lede: UPDATED.fr,
		sections: [
			{
				title: 'Utilisation',
				body: (
					<p>
						Vixely s'utilise gratuitement, à titre personnel ou professionnel, sans compte. L'utiliser vaut
						acceptation de ces conditions.
					</p>
				),
			},
			{
				title: 'Vos contenus',
				body: (
					<p>
						Vos fichiers restent les vôtres : Vixely ne les reçoit jamais et ne revendique aucun droit
						dessus. Vous êtes responsable d'avoir le droit de modifier et de diffuser ce que vous traitez
						avec lui.
					</p>
				),
			},
			{
				title: 'Absence de garantie',
				body: (
					<p>
						Vixely est fourni en l'état, sans garantie d'aucune sorte. Ce qu'il sait faire dépend de votre
						navigateur et de votre appareil. Gardez vos fichiers d'origine : l'éditeur ne peut être tenu
						responsable d'un export raté ou incomplet, ni d'une perte de données.
					</p>
				),
			},
			{
				title: 'Code source',
				body: (
					<p>
						Le code source de Vixely est publié sous licence{' '}
						<TextLink href="https://www.gnu.org/licenses/agpl-3.0.html">GNU AGPL-3.0</TextLink> sur{' '}
						<TextLink href={SOURCE}>github.com/Xantoom/Vixely</TextLink>.
					</p>
				),
			},
			{ title: 'Droit applicable', body: <p>Ces conditions sont régies par le droit français.</p> },
		],
	},
};

function host(lang: Locale) {
	return (
		<ul className="grid gap-1">
			<li>Railway Corporation</li>
			<li>548 Market St, PMB 68915, San Francisco, CA 94104, {lang === 'fr' ? 'États-Unis' : 'USA'}</li>
			<li>
				<TextLink href="https://railway.com">railway.com</TextLink>
			</li>
		</ul>
	);
}

const LEGAL: Record<Locale, PageContent> = {
	en: {
		title: 'Legal notice',
		description: 'Legal notice of Vixely.',
		lede: 'As required by article 6 of French law no. 2004-575 (LCEN).',
		sections: [
			{
				title: 'Publisher',
				body: (
					<p>
						Vixely is published by an individual, on a non-professional basis, who has chosen to remain
						anonymous as article 6-III-2 of the LCEN allows; their identity has been given to the host.
						Contact: <TextLink href={ISSUES}>github.com/Xantoom/Vixely/issues</TextLink>.
					</p>
				),
			},
			{ title: 'Host', body: host('en') },
			{
				title: 'Intellectual property',
				body: (
					<p>
						The source code of Vixely is published under the AGPL-3.0 license. The files you process remain
						the property of their owners.
					</p>
				),
			},
		],
	},
	fr: {
		title: 'Mentions légales',
		description: 'Mentions légales de Vixely.',
		lede: "Conformément à l'article 6 de la loi n° 2004-575 pour la confiance dans l'économie numérique (LCEN).",
		sections: [
			{
				title: 'Éditeur',
				body: (
					<p>
						Vixely est édité par un particulier, à titre non professionnel, qui a choisi de rester anonyme
						comme le permet l'article 6-III-2 de la LCEN ; son identité a été communiquée à l'hébergeur.
						Contact : <TextLink href={ISSUES}>github.com/Xantoom/Vixely/issues</TextLink>.
					</p>
				),
			},
			{ title: 'Hébergeur', body: host('fr') },
			{
				title: 'Propriété intellectuelle',
				body: (
					<p>
						Le code source de Vixely est publié sous licence AGPL-3.0. Les fichiers que vous traitez restent
						la propriété de leurs auteurs.
					</p>
				),
			},
		],
	},
};

export const PAGES = {
	about: () => ABOUT[locale()],
	privacy: () => privacy(locale()),
	terms: () => TERMS[locale()],
	legal: () => LEGAL[locale()],
};
