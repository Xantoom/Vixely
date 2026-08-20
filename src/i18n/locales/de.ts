import type { LocaleModule } from "../types.ts";

export const de: LocaleModule = {
	"app.name": "Vixely",
	"app.tagline": "Medien im Browser bearbeiten. Nichts wird hochgeladen.",
	"app.description":
		"Bilder, Videos, GIFs, Audio und Untertitel konvertieren, zuschneiden, filtern und neu kodieren. Jedes Byte bleibt auf Ihrem Rechner.",

	"nav.home": "Start",
	"nav.tools": "Werkzeuge",
	"nav.features": "Funktionen",
	"nav.about": "Über",
	"nav.skipToContent": "Zum Inhalt springen",
	"nav.openMenu": "Menü öffnen",
	"nav.closeMenu": "Menü schließen",

	"editor.image": "Bild",
	"editor.video": "Video",
	"editor.gif": "GIF",
	"editor.audio": "Audio",
	"editor.subtitles": "Untertitel",
	"editor.image.description":
		"Bilder konvertieren, zuschneiden, skalieren, farbkorrigieren und beschriften.",
	"editor.video.description":
		"Framegenau schneiden, alle Spuren verwalten, Filter anwenden und neu kodieren.",
	"editor.gif.description":
		"Frames neu anordnen, Verzögerungen einstellen, Palette optimieren oder umwandeln.",
	"editor.audio.description":
		"Audio schneiden, neu anordnen, normalisieren, entzerren und konvertieren.",
	"editor.subtitles.description":
		"Zeilen, Stile und Kopfdaten in SRT, WebVTT, ASS und PGS bearbeiten.",

	"theme.label": "Design",
	"theme.system": "System",
	"theme.light": "Hell",
	"theme.dark": "Dunkel",

	"language.label": "Sprache",

	"action.undo": "Rückgängig",
	"action.redo": "Wiederholen",
	"action.undoAction": "{action} rückgängig machen",
	"action.redoAction": "{action} wiederholen",
	"action.cancel": "Abbrechen",
	"action.confirm": "Bestätigen",
	"action.close": "Schließen",
	"action.reset": "Zurücksetzen",
	"action.resetToDefault": "Auf Standardwert zurücksetzen",
	"action.export": "Exportieren",
	"action.openFile": "Datei öffnen",
	"action.retry": "Erneut versuchen",
	"action.compare": "Mit dem Original vergleichen",
	"action.compareHint":
		"Neutralisiert den Farbdurchgang, damit beide Seiten aus derselben Kette stammen.",
	"export.formatUnavailable": "Dieser Browser kann {format} nicht kodieren.",

	"command.crop": "Zuschnitt",
	"command.resize": "Skalierung",
	"command.rotate": "Drehung",
	"command.flip": "Spiegelung",
	"command.filter": "{name} anpassen",
	"command.addText": "Text hinzufügen",
	"command.editText": "Text bearbeiten",
	"command.removeText": "Text entfernen",
	"command.reorderFrames": "Frames neu anordnen",
	"command.removeFrame": "Frame entfernen",
	"command.frameDelay": "Verzögerung ändern",
	"command.trim": "Schnitt",
	"command.trackChange": "Spurwechsel",
	"command.editCue": "Zeile bearbeiten",
	"command.exportSettings": "Exporteinstellungen ändern",

	"filter.brightness": "Helligkeit",
	"filter.contrast": "Kontrast",
	"filter.saturation": "Sättigung",
	"filter.exposure": "Belichtung",
	"filter.temperature": "Temperatur",
	"filter.tint": "Farbstich",
	"filter.gamma": "Gamma",
	"filter.highlights": "Lichter",
	"filter.shadows": "Schatten",
	"filter.vibrance": "Dynamik",
	"filter.hueRotate": "Farbton",
	"filter.sharpen": "Schärfe",
	"filter.blur": "Weichzeichnen",
	"filter.vignette": "Vignette",
	"filter.grayscale": "Graustufen",
	"filter.sepia": "Sepia",
	"filter.invert": "Invertieren",
	"filter.opacity": "Deckkraft",

	"dropzone.prompt": "Datei hier ablegen oder durchsuchen",
	"dropzone.browse": "Dateien durchsuchen",
	"dropzone.accepts": "Zulässige Formate: {formats}",
	"dropzone.rejected": "{name} ist kein Format, das dieser Editor öffnen kann.",

	"canvas.zoomIn": "Vergrößern",
	"canvas.zoomOut": "Verkleinern",
	"canvas.fit": "An Bildschirm anpassen",
	"canvas.actualSize": "Originalgröße",
	"canvas.zoomLevel": "Zoom {percent} %",
	"canvas.description": "Arbeitsfläche mit {width} mal {height} Pixeln",

	"player.play": "Wiedergabe",
	"player.pause": "Pause",
	"player.mute": "Stummschalten",
	"player.unmute": "Ton einschalten",
	"player.volume": "Lautstärke",
	"player.fullscreen": "Vollbild",
	"player.exitFullscreen": "Vollbild beenden",
	"player.speed": "Geschwindigkeit",
	"player.previousFrame": "Vorheriges Frame",
	"player.nextFrame": "Nächstes Frame",
	"player.previousKeyframe": "Vorheriges Keyframe",
	"player.nextKeyframe": "Nächstes Keyframe",
	"player.precision": "Navigationsgenauigkeit",
	"player.precision.time": "Zeit",
	"player.precision.keyframe": "Keyframe",
	"player.precision.frame": "Frame",
	"player.trackSelection": "Spur",

	"export.title": "Export",
	"export.format": "Format",
	"export.container": "Container",
	"export.codec": "Codec",
	"export.quality": "Qualität",
	"export.rateControl": "Ratensteuerung",
	"export.rateControl.quality": "Konstante Qualität",
	"export.rateControl.bitrate": "Zielbitrate",
	"export.estimatedSize": "Geschätzte Größe: {size}",
	"export.keepMetadata": "Metadaten behalten",
	"export.keepMetadataHint":
		"EXIF-Daten werden standardmäßig entfernt, GPS-Koordinaten eingeschlossen.",
	"export.progress": "Export: {percent} %",
	"export.done": "Export abgeschlossen",
	"export.failed": "Export fehlgeschlagen: {reason}",
	"export.cancelled": "Export abgebrochen",
	"export.codecUnavailable": "{codec} ist hier nicht verfügbar: {reason}",
	"export.gifSuggestion":
		"Ein Video-Container wäre bei gleicher Qualität fünf- bis zwanzigmal kleiner.",
	"export.subtitleLoss": "Die Umwandlung nach {format} verliert: {losses}",

	"environment.noWebCodecsVideo":
		"Dieser Browser unterstützt kein WebCodecs-Video, daher lässt sich die Video-, GIF- und Bildbearbeitung hier nicht ausführen.",
	"environment.noWebCodecsAudio":
		"Dieser Browser unterstützt kein WebCodecs-Audio, daher kann Audio weder dekodiert noch neu kodiert werden.",
	"environment.audioPassthroughOnly":
		"Dieser Browser kann Audio nicht neu kodieren. Audiospuren werden unverändert kopiert und bleiben damit intakt.",
	"environment.noStreamingExport":
		"Dieser Browser baut die ganze Datei im Arbeitsspeicher auf, bevor er sie speichert. Ein Export über rund 2 GB kann fehlschlagen.",
	"environment.noWebGL2":
		"Dieser Browser hat kein WebGL2, daher kann die Render-Kette nicht laufen.",
	"environment.noOffscreenCanvas":
		"Dieser Browser hat kein OffscreenCanvas, daher läuft der Export im Haupt-Thread und die Oberfläche kann stocken.",
	"environment.exportTooLarge":
		"Die geschätzte Ausgabe beträgt {size} und liegt nahe an dem, was dieser Browser im Speicher halten kann. Senken Sie die Qualität, teilen Sie den Export auf, oder nutzen Sie einen Chromium-Browser.",
	"environment.checkTitle": "Was dieser Browser leisten kann",

	"error.decodeFailed": "{name} konnte nicht dekodiert werden: {reason}",
	"error.unsupportedFormat": "{format} wird hier nicht unterstützt.",
	"error.fileTooLarge":
		"{name} ist {size} groß und liegt über dem, was in diesem Browser verarbeitet werden kann.",
	"error.generic": "Etwas ist schiefgelaufen: {reason}",

	"status.loading": "Wird geladen",
	"status.decoding": "Dekodierung: {percent} %",
	"status.ready": "Bereit",
	"status.working": "Wird verarbeitet",

	"home.hero.title": "Medienbearbeitung, die Ihren Rechner nie verlässt",
	"home.hero.body":
		"Vixely konvertiert, schneidet, filtert und kodiert Bilder, Videos, GIFs, Audio und Untertitel vollständig in Ihrem Browser. Kein Upload, kein Konto, kein Server.",
	"home.hero.cta": "Editor öffnen",
	"home.privacy.title": "Nichts wird hochgeladen",
	"home.privacy.body":
		"Jede Operation läuft über WebCodecs und WebGL auf Ihrer eigenen Hardware. Es gibt kein Backend, an das Dateien gehen könnten, und keine Datenbank hinter dieser Seite.",
	"home.formats.title": "Formate",
	"home.openSource.title": "Open Source",

	"footer.privacy": "Ihre Dateien verlassen Ihr Gerät nie.",
	"footer.source": "Quellcode",
};
