import type { LocaleModule } from "../types.ts";

export const it: LocaleModule = {
	"app.name": "Vixely",
	"app.tagline": "Modifica i tuoi file nel browser. Niente viene caricato.",
	"app.description":
		"Converti, ritaglia, filtra e ricodifica immagini, video, GIF, audio e sottotitoli. Ogni byte resta sulla tua macchina.",

	"nav.home": "Home",
	"nav.tools": "Strumenti",
	"nav.features": "Funzioni",
	"nav.about": "Informazioni",
	"nav.skipToContent": "Vai al contenuto",
	"nav.openMenu": "Apri il menu",
	"nav.closeMenu": "Chiudi il menu",

	"editor.image": "Immagine",
	"editor.video": "Video",
	"editor.gif": "GIF",
	"editor.audio": "Audio",
	"editor.subtitles": "Sottotitoli",
	"editor.image.description":
		"Converti, ritaglia, ridimensiona, correggi il colore e aggiungi testo alle immagini.",
	"editor.video.description":
		"Taglia al fotogramma esatto, gestisci ogni traccia, applica filtri e ricodifica.",
	"editor.gif.description":
		"Riordina i fotogrammi, regola i ritardi, ottimizza la palette o converti.",
	"editor.audio.description": "Taglia, riorganizza, normalizza, equalizza e converti l’audio.",
	"editor.subtitles.description":
		"Modifica battute, stili e intestazioni in SRT, WebVTT, ASS e PGS.",

	"theme.label": "Tema",
	"theme.system": "Sistema",
	"theme.light": "Chiaro",
	"theme.dark": "Scuro",

	"language.label": "Lingua",

	"action.undo": "Annulla",
	"action.redo": "Ripristina",
	"action.undoAction": "Annulla {action}",
	"action.redoAction": "Ripristina {action}",
	"action.cancel": "Annulla",
	"action.confirm": "Conferma",
	"action.close": "Chiudi",
	"action.reset": "Reimposta",
	"action.resetToDefault": "Torna al valore predefinito",
	"action.export": "Esporta",
	"action.openFile": "Apri file",
	"action.retry": "Riprova",
	"action.compare": "Confronta con l’originale",
	"action.compareHint":
		"Neutralizza il passaggio colore: entrambi i lati vengono dalla stessa catena.",
	"export.formatUnavailable": "Questo browser non sa codificare {format}.",

	"command.crop": "Ritaglio",
	"command.resize": "Ridimensionamento",
	"command.rotate": "Rotazione",
	"command.flip": "Capovolgimento",
	"command.filter": "Regolazione di {name}",
	"command.addText": "Aggiunta di testo",
	"command.editText": "Modifica del testo",
	"command.removeText": "Rimozione del testo",
	"command.reorderFrames": "Riordino dei fotogrammi",
	"command.removeFrame": "Rimozione di un fotogramma",
	"command.frameDelay": "Modifica del ritardo",
	"command.trim": "Taglio",
	"command.trackChange": "Cambio di traccia",
	"command.editCue": "Modifica di una battuta",
	"command.exportSettings": "Modifica delle impostazioni di esportazione",

	"filter.brightness": "Luminosità",
	"filter.contrast": "Contrasto",
	"filter.saturation": "Saturazione",
	"filter.exposure": "Esposizione",
	"filter.temperature": "Temperatura",
	"filter.tint": "Tinta",
	"filter.gamma": "Gamma",
	"filter.highlights": "Alte luci",
	"filter.shadows": "Ombre",
	"filter.vibrance": "Vividezza",
	"filter.hueRotate": "Tonalità",
	"filter.sharpen": "Nitidezza",
	"filter.blur": "Sfocatura",
	"filter.vignette": "Vignettatura",
	"filter.grayscale": "Scala di grigi",
	"filter.sepia": "Seppia",
	"filter.invert": "Inverti",
	"filter.opacity": "Opacità",

	"dropzone.prompt": "Trascina un file qui, oppure sfoglia",
	"dropzone.browse": "Sfoglia i file",
	"dropzone.accepts": "Formati accettati: {formats}",
	"dropzone.rejected": "{name} non è un formato che questo editor sa aprire.",

	"canvas.zoomIn": "Ingrandisci",
	"canvas.zoomOut": "Riduci",
	"canvas.fit": "Adatta allo schermo",
	"canvas.actualSize": "Dimensione reale",
	"canvas.zoomLevel": "Zoom {percent} %",
	"canvas.description": "Area di lavoro di {width} per {height} pixel",

	"player.play": "Riproduci",
	"player.pause": "Pausa",
	"player.mute": "Disattiva l’audio",
	"player.unmute": "Riattiva l’audio",
	"player.volume": "Volume",
	"player.fullscreen": "Schermo intero",
	"player.exitFullscreen": "Esci da schermo intero",
	"player.speed": "Velocità",
	"player.previousFrame": "Fotogramma precedente",
	"player.nextFrame": "Fotogramma successivo",
	"player.previousKeyframe": "Fotogramma chiave precedente",
	"player.nextKeyframe": "Fotogramma chiave successivo",
	"player.precision": "Precisione di navigazione",
	"player.precision.time": "Tempo",
	"player.precision.keyframe": "Fotogramma chiave",
	"player.precision.frame": "Fotogramma",
	"player.trackSelection": "Traccia",

	"export.title": "Esportazione",
	"export.format": "Formato",
	"export.container": "Contenitore",
	"export.codec": "Codec",
	"export.quality": "Qualità",
	"export.rateControl": "Controllo del bitrate",
	"export.rateControl.quality": "Qualità costante",
	"export.rateControl.bitrate": "Bitrate obiettivo",
	"export.estimatedSize": "Dimensione stimata: {size}",
	"export.keepMetadata": "Conserva i metadati",
	"export.keepMetadataHint":
		"I dati EXIF vengono rimossi per impostazione predefinita, coordinate GPS comprese.",
	"export.progress": "Esportazione: {percent} %",
	"export.done": "Esportazione completata",
	"export.failed": "Esportazione fallita: {reason}",
	"export.cancelled": "Esportazione annullata",
	"export.codecUnavailable": "{codec} non è disponibile qui: {reason}",
	"export.gifSuggestion":
		"Un contenitore video sarebbe da cinque a venti volte più leggero a parità di qualità.",
	"export.subtitleLoss": "La conversione in {format} fa perdere: {losses}",

	"environment.noWebCodecsVideo":
		"Questo browser non supporta WebCodecs video, quindi la modifica di video, GIF e immagini non può essere eseguita qui.",
	"environment.noWebCodecsAudio":
		"Questo browser non supporta WebCodecs audio, quindi l’audio non può essere decodificato né ricodificato.",
	"environment.audioPassthroughOnly":
		"Questo browser non sa ricodificare l’audio. Le tracce audio vengono copiate invariate, quindi restano intatte.",
	"environment.noStreamingExport":
		"Questo browser assembla l’intero file in memoria prima di salvarlo. Un’esportazione oltre i 2 GB circa può fallire.",
	"environment.noWebGL2":
		"Questo browser non dispone di WebGL2, quindi la catena di rendering non può essere eseguita.",
	"environment.noOffscreenCanvas":
		"Questo browser non dispone di OffscreenCanvas, quindi l’esportazione gira sul thread principale e l’interfaccia può scattare.",
	"environment.exportTooLarge":
		"L’output stimato è di {size}, vicino a quanto questo browser può tenere in memoria. Abbassa la qualità, dividi l’esportazione oppure usa un browser Chromium.",
	"environment.checkTitle": "Cosa può fare questo browser",

	"error.decodeFailed": "Impossibile decodificare {name}: {reason}",
	"error.unsupportedFormat": "{format} non è supportato qui.",
	"error.fileTooLarge":
		"{name} pesa {size}, oltre ciò che è possibile elaborare in questo browser.",
	"error.generic": "Qualcosa è andato storto: {reason}",

	"audio.waveform": "Forma d’onda",
	"audio.spectrum": "Spettro di frequenza",
	"audio.segments": "Segmenti",
	"audio.split": "Taglia qui",
	"audio.deleteSegment": "Elimina il segmento",
	"audio.gain": "Guadagno",
	"audio.fadeIn": "Dissolvenza in entrata",
	"audio.fadeOut": "Dissolvenza in uscita",
	"audio.equalizer": "Equalizzatore",
	"audio.normalise": "Normalizza il volume percepito",
	"audio.normaliseHint": "Misura il programma secondo EBU R128, poi applica un unico guadagno.",
	"audio.targetLoudness": "Volume percepito obiettivo",
	"audio.measured": "Misurato: {value} LUFS",
	"audio.gainLimited": "Guadagno limitato a {value} dB per evitare il clipping.",
	"audio.noAudioTrack": "{name} non contiene alcuna traccia audio.",
	"audio.channels": "Canali",
	"audio.sampleRate": "Frequenza di campionamento",
	"audio.tooLongToProcess":
		"Questo file è troppo lungo per essere elaborato in memoria. Il remux funziona ancora; taglio, guadagno e normalizzazione no.",
	"audio.remuxOnly": "Nessuna ricodifica necessaria: l’audio viene copiato invariato.",

	"status.loading": "Caricamento",
	"status.decoding": "Decodifica: {percent} %",
	"status.ready": "Pronto",
	"status.working": "Elaborazione",

	"home.hero.title": "Editing di file che non lascia mai la tua macchina",
	"home.hero.body":
		"Vixely converte, taglia, filtra e ricodifica immagini, video, GIF, audio e sottotitoli interamente nel tuo browser. Nessun caricamento, nessun account, nessun server.",
	"home.hero.cta": "Apri un editor",
	"home.privacy.title": "Niente viene caricato",
	"home.privacy.body":
		"Ogni operazione passa da WebCodecs e WebGL sul tuo hardware. Non c’è un backend a cui inviare i file, né un database dietro questo sito.",
	"home.formats.title": "Formati",
	"home.openSource.title": "Open source",

	"footer.privacy": "I tuoi file non lasciano mai il tuo dispositivo.",
	"footer.source": "Codice sorgente",
};
