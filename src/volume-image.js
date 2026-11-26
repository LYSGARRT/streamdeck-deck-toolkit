import { t } from "./i18n.js";
// Key images for the volume keys: two-key slider, mute key and the speaker icon.

// Material icons (24×24)
export const ICONS = {
	speaker: "M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z",
	speakerOff: "M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z",
	mic: "M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.48 6-3.3 6-6.72h-1.7z",
	micOff: "M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z",
	gamepad: "M21.58 16.09l-1.09-7.66C20.21 6.46 18.52 5 16.53 5H7.47C5.48 5 3.79 6.46 3.51 8.43l-1.09 7.66C2.2 17.63 3.39 19 4.94 19c.68 0 1.32-.27 1.8-.75L9 16h6l2.25 2.25c.48.48 1.13.75 1.8.75 1.56 0 2.75-1.37 2.53-2.91zM11 11H9v2H8v-2H6v-1h2V8h1v2h2v1zm4-1c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm2 3c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z",
	headphones: "M12 3a9 9 0 0 0-9 9v7c0 1.1.9 2 2 2h4v-8H5v-1c0-3.87 3.13-7 7-7s7 3.13 7 7v1h-4v8h4c1.1 0 2-.9 2-2v-7a9 9 0 0 0-9-9z",
};

const PINK = "#FF5C93";
const PINK_LIGHT = "#FFC2D7";
const MUTED = "#8E8A8D";
const RED = "#FF4D5E";

/** Mute key: white = sound on, muted = blinks red/white, no device = grey. */
function muteImage(view, blinkOn) {
	const state = !view?.ok ? "offline" : view.mute ? "muted" : "on";
	return audioImage(state, blinkOn);
}

/** Blink interval (ms) for the mute keys. */
export const BLINK_MS = 2500;

/** Speaker key image used by the mute key. */
// Material icons "volume_up" / "volume_off" (24×24).
const ICON_VOLUME_UP = "M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z";
const ICON_VOLUME_OFF = "M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z";

/**
 * Black background, plain icon, no text.
 * playing = white speaker; muted/off = crossed out, blinks red; unreachable = grey.
 */
export function audioImage(state, blinkOn) {
	const W = 144;
	let icon, color;
	if (state === "on") {
		icon = ICON_VOLUME_UP;
		color = "#ffffff";
	} else if (state === "muted" || state === "off") {
		icon = ICON_VOLUME_OFF;
		color = blinkOn ? "#e5484d" : "#ffffff";
	} else {
		icon = ICON_VOLUME_UP;
		color = "#4a4a4a";
	}
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${W}" viewBox="0 0 ${W} ${W}">
		<rect width="${W}" height="${W}" fill="#000"/>
		<g transform="translate(30 30) scale(3.5)"><path d="${icon}" fill="${color}"/></g>
	</svg>`;
	return "data:image/svg+xml;charset=utf8," + encodeURIComponent(svg);
}

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/**
 * view: { ok, vol, mute, label, icon }   icon = key of ICONS ("speaker" | "mic" | "gamepad" | "headphones")
 * mode: "down" | "up" | "mute"
 * pressed: key currently held -> button lights up
 */
export function volumeImage(view, mode, pressed = false, blinkOn = true) {
	if (mode === "mute") return muteImage(view, blinkOn);
	return sliderImage(view, mode === "down" ? 0 : 1, pressed);
}

/**
 * Down + up together form ONE slider across two keys:
 * the image is designed 288×144 wide, the down key shows the left half, the up key the right half.
 * Top left: device, top right: percent, continuous bar in the middle, − and + at the bottom.
 */
function sliderImage(view, half, pressed) {
	const W = 144;
	const F = `font-family="Segoe UI Variable Display,Segoe UI,Arial"`;
	const ok = !!view?.ok;
	const muted = ok && view.mute;
	const vol = ok ? Math.max(0, Math.min(100, Math.round(view.vol))) : 0;
	const iconKey = view?.icon && ICONS[view.icon] ? view.icon : "speaker";
	const offKey = iconKey === "mic" ? "micOff" : iconKey === "speaker" ? "speakerOff" : iconKey;
	const accent = !ok ? MUTED : muted ? RED : PINK;

	// bar across both keys
	const x0 = 20, x1 = 268, by = 82, bh = 16;
	const fillW = ((x1 - x0) * vol) / 100;
	const kx = x0 + fillW;

	let g = "";
	// readability veil across the full width
	g += `<rect x="6" y="10" width="276" height="124" rx="30" fill="url(#veil)"/>`;

	// top left: device icon + name (or "Muted")
	const label = !ok ? t("No device") : muted ? t("Muted") : String(view.label || "").slice(0, 9);
	g += `<g transform="translate(18 20) scale(1.3)"><path d="${ICONS[muted || !ok ? offKey : iconKey]}" fill="${muted ? RED : ok ? "#FFFFFF" : MUTED}"/></g>`;
	g += `<text x="56" y="45" ${F} font-size="19" font-weight="700" fill="${muted ? RED : ok ? PINK_LIGHT : MUTED}">${esc(label)}</text>`;

	// Oben rechts: Prozent
	if (ok) g += `<text x="270" y="48" ${F} text-anchor="end" font-size="36" font-weight="700" fill="${muted ? MUTED : "#FFFFFF"}">${vol}<tspan font-size="18" font-weight="600" fill="${muted ? MUTED : PINK_LIGHT}">%</tspan></text>`;

	// track, glowing fill, knob
	g += `<rect x="${x0}" y="${by - bh / 2}" width="${x1 - x0}" height="${bh}" rx="${bh / 2}" fill="#FFFFFF" fill-opacity="0.14"/>`;
	if (ok && vol > 0) {
		const fill = muted ? MUTED : "url(#gBar)";
		if (!muted) g += `<rect x="${x0 - 4}" y="${by - bh / 2 - 4}" width="${fillW + 8}" height="${bh + 8}" rx="${bh / 2 + 4}" fill="${PINK}" fill-opacity="0.22"/>`;
		g += `<rect x="${x0}" y="${by - bh / 2}" width="${Math.max(bh, fillW)}" height="${bh}" rx="${bh / 2}" fill="${fill}"/>`;
		g += `<circle cx="${Math.max(x0 + bh / 2, kx)}" cy="${by}" r="12" fill="#FFFFFF"${muted ? ' fill-opacity="0.75"' : ""}/>`;
	}

	// bottom: − (left key) and + (right key) as round buttons
	const btn = (cx, plus, active) => {
		const fg = active ? "#1A0710" : accent === PINK ? PINK_LIGHT : accent;
		return `<circle cx="${cx}" cy="118" r="17" fill="${accent}" fill-opacity="${active ? 1 : 0.18}" stroke="${accent}" stroke-opacity="${active ? 1 : 0.6}" stroke-width="1.5"/>
			<rect x="${cx - 9}" y="116" width="18" height="4" rx="2" fill="${fg}"/>` +
			(plus ? `<rect x="${cx - 2}" y="109" width="4" height="18" rx="2" fill="${fg}"/>` : "");
	};
	g += btn(72, false, pressed && half === 0) + btn(216, true, pressed && half === 1);

	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${W}" viewBox="0 0 ${W} ${W}">
		<defs>
			<linearGradient id="gBar" x1="${x0}" y1="0" x2="${x1}" y2="0" gradientUnits="userSpaceOnUse">
				<stop offset="0" stop-color="${PINK_LIGHT}"/><stop offset="1" stop-color="${PINK}"/>
			</linearGradient>
			<linearGradient id="veil" x1="0" y1="0" x2="0" y2="1">
				<stop offset="0" stop-color="#0B0609" stop-opacity="0.55"/><stop offset="1" stop-color="#0B0609" stop-opacity="0.35"/>
			</linearGradient>
		</defs>
		<rect width="${W}" height="${W}" fill="#000"/>
		<g transform="translate(${-half * W} 0)">${g}</g>
	</svg>`;
	return "data:image/svg+xml;charset=utf8," + encodeURIComponent(svg);
}

/** Older single-key ring design (unused, kept as an alternative). */
export function ringImage(view, mode, pressed = false) {
	const W = 144, cx = 72, cy = 62, r = 43, sw = 9;
	const C = 2 * Math.PI * r;
	const F = `font-family="Segoe UI Variable Display,Segoe UI,Arial" text-anchor="middle"`;
	const ok = !!view?.ok;
	const muted = ok && view.mute;
	const vol = ok ? Math.max(0, Math.min(100, Math.round(view.vol))) : 0;
	const iconKey = view?.icon && ICONS[view.icon] ? view.icon : "speaker";
	const offKey = iconKey === "mic" ? "micOff" : iconKey === "speaker" ? "speakerOff" : iconKey;

	const defs = `<defs>
		<linearGradient id="gPink" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0" stop-color="${PINK_LIGHT}"/><stop offset="1" stop-color="${PINK}"/>
		</linearGradient>
		<radialGradient id="veil" cx="50%" cy="50%" r="50%">
			<stop offset="0.55" stop-color="#0B0609" stop-opacity="0.78"/><stop offset="1" stop-color="#0B0609" stop-opacity="0"/>
		</radialGradient>
	</defs>`;

	// full black background
	let body = `<rect width="${W}" height="${W}" fill="#000"/>`;
	// dark veil behind the ring for readability
	body += `<circle cx="${cx}" cy="${cy}" r="${r + 20}" fill="url(#veil)"/>`;
	// Spur
	body += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#FFFFFF" stroke-opacity="0.14" stroke-width="${sw}"/>`;

	if (ok && vol > 0) {
		const color = muted ? MUTED : "url(#gPink)";
		const len = Math.max(0.01, (C * vol) / 100);
		const arc = (stroke, width, opacity) =>
			`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" opacity="${opacity}"
				stroke-dasharray="${len} ${C}" transform="rotate(-90 ${cx} ${cy})"/>`;
		if (!muted) body += arc(PINK, sw + 9, 0.22); // Leuchtsaum
		body += arc(color, sw, 1);
		// Knopf am Ende des Bogens
		const a = (vol / 100) * 2 * Math.PI - Math.PI / 2;
		const kx = cx + r * Math.cos(a), ky = cy + r * Math.sin(a);
		body += `<circle cx="${kx.toFixed(1)}" cy="${ky.toFixed(1)}" r="6.5" fill="#FFFFFF"${muted ? ' fill-opacity="0.7"' : ""}/>`;
	}

	// Mitte: Prozentzahl bzw. Stumm-Symbol
	if (!ok) {
		body += `<g transform="translate(${cx - 19} ${cy - 21}) scale(1.6)" opacity="0.55"><path d="${ICONS[offKey]}" fill="${MUTED}"/></g>`;
	} else if (muted) {
		body += `<g transform="translate(${cx - 17} ${cy - 24}) scale(1.45)"><path d="${ICONS[offKey]}" fill="${RED}"/></g>`;
		body += `<text x="${cx}" y="${cy + 24}" ${F} font-size="15" font-weight="600" fill="${MUTED}">${vol}%</text>`;
	} else {
		const big = vol === 100 ? 27 : 33;
		body += `<text x="${cx}" y="${cy + 9}" ${F} font-size="${big}" font-weight="700" fill="#FFFFFF">${vol}<tspan font-size="${vol === 100 ? 14 : 16}" font-weight="600" fill="${PINK_LIGHT}">%</tspan></text>`;
		if (view.label) {
			const label = String(view.label).slice(0, 9);
			body += `<text x="${cx}" y="${cy + 26}" ${F} font-size="${label.length > 7 ? 10.5 : 11.5}" font-weight="600" fill="${PINK_LIGHT}" fill-opacity="0.85">${esc(label)}</text>`;
		}
	}

	// pill at the bottom: device icon + direction (− / +) or mute state
	const pillY = 115, pillH = 25;
	let pillColor = PINK, content = "", pillW = 64;
	const ico = (d, x, color) => `<g transform="translate(${x} ${pillY + 3.5}) scale(0.75)"><path d="${d}" fill="${color}"/></g>`;
	if (mode === "mute") {
		const label = !ok ? "–" : muted ? t("Muted") : t("Sound on");
		pillColor = !ok ? MUTED : muted ? RED : PINK;
		pillW = 92;
		content = ico(ICONS[muted || !ok ? offKey : iconKey], cx - 40, pressed ? "#1A0710" : pillColor) +
			`<text x="${cx + 12}" y="${pillY + 18}" ${F} font-size="15" font-weight="700" fill="${pressed ? "#1A0710" : pillColor}">${label}</text>`;
	} else {
		if (!ok || muted) pillColor = muted ? RED : MUTED;
		const fg = pressed ? "#1A0710" : pillColor === PINK ? PINK_LIGHT : pillColor;
		// minus/plus drawn as bars so they are centred regardless of the font
		const gx = cx + 13, gy = pillY + pillH / 2;
		const sign = `<rect x="${gx - 8}" y="${gy - 2}" width="16" height="4" rx="2" fill="${fg}"/>` +
			(mode === "up" ? `<rect x="${gx - 2}" y="${gy - 8}" width="4" height="16" rx="2" fill="${fg}"/>` : "");
		content = ico(ICONS[muted ? offKey : iconKey], cx - 25, fg) + sign;
	}
	body += `<rect x="${cx - pillW / 2}" y="${pillY}" width="${pillW}" height="${pillH}" rx="${pillH / 2}"
		fill="${pillColor}" fill-opacity="${pressed ? 1 : 0.2}" stroke="${pillColor}" stroke-opacity="${pressed ? 1 : 0.55}" stroke-width="1.5"/>` + content;

	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${W}" viewBox="0 0 ${W} ${W}">${defs}${body}</svg>`;
	return "data:image/svg+xml;charset=utf8," + encodeURIComponent(svg);
}
