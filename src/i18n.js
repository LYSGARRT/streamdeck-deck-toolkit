// Texts drawn on the keys. The English text is the key; other languages map it to a translation.
// The language follows the Stream Deck app (Preferences → General → Language).
import streamDeck from "@elgato/streamdeck";

const STRINGS = {
	de: {
		"Off": "Aus",
		"Error": "Fehler",
		"Spare": "Ersatz",
		"Choose device": "Gerät wählen",
		"Press": "Nochmal",
		"again": "drücken",
		"Shutting down…": "Fährt runter…",
		"No device": "Kein Gerät",
		"Muted": "Stumm",
		"Sound on": "Ton an",
	},
};

let lang;

/** Translates an English UI text into the Stream Deck app language (falls back to English). */
export function t(en) {
	if (lang === undefined) {
		try {
			lang = String(streamDeck.info?.application?.language || "en").slice(0, 2);
		} catch {
			lang = "en";
		}
	}
	return STRINGS[lang]?.[en] ?? en;
}
