import streamDeck, { SingletonAction } from "@elgato/streamdeck";
import { paint } from "./draw.js";
import { t } from "./i18n.js";
import { VolumeAction } from "./volume.js";
import { TwitchChannelAction } from "./twitch.js";
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BIN = path.dirname(fileURLToPath(import.meta.url));

/** Runs a helper exe from bin/ and returns its parsed JSON output. */
function run(exe, args) {
	return new Promise((resolve) => {
		execFile(path.join(BIN, exe), args, { windowsHide: true, timeout: 15000 }, (err, stdout) => {
			try {
				resolve(JSON.parse(String(stdout).trim()));
			} catch {
				resolve({ ok: false, error: err?.message ?? "no output from ddc.exe" });
			}
		});
	});
}

const ddc = (args) => run("ddc.exe", args);


const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/** Short label for the key: custom label, else the first word(s) of the device name. */
function shortLabel(name) {
	const s = String(name || "").replace(/\(.*?\)/g, "").trim();
	return s.length <= 12 ? s : s.split(/\s+/).reduce((acc, w) => ((acc + " " + w).trim().length <= 12 ? (acc + " " + w).trim() : acc), "") || s.slice(0, 12);
}

/** Builds the key image: battery outline filled to `level` percent, device label at the bottom. */
function batteryImage(res, showSpare, label) {
	const W = 144;
	let body;
	const F = `font-family="Segoe UI,Arial" text-anchor="middle"`;
	const name = label ? `<text x="72" y="136" ${F} font-size="16" fill="#999">${esc(label)}</text>` : "";
	if (res.setup) {
		body = `<rect x="22" y="40" width="92" height="46" rx="8" fill="none" stroke="#777" stroke-width="6"/>
			<rect x="114" y="53" width="8" height="20" rx="3" fill="#777"/>
			<text x="72" y="124" ${F} font-size="20" fill="#aaa">${t("Choose device")}</text>`;
	} else if (!res.ok || res.status === "offline") {
		const text = res.ok ? t("Off") : t("Error");
		body = `<rect x="22" y="32" width="92" height="46" rx="8" fill="none" stroke="#777" stroke-width="6"/>
			<rect x="114" y="45" width="8" height="20" rx="3" fill="#777"/>
			<text x="72" y="${label ? 112 : 120}" ${F} font-size="26" fill="#aaa">${text}</text>${name}`;
	} else {
		const lvl = res.level;
		const color = res.status === "charging" ? "#3fa9f5" : lvl <= 25 ? "#e5484d" : lvl <= 50 ? "#f5a524" : "#30a46c";
		const fill = Math.round((80 * lvl) / 100);
		const bolt = res.status === "charging"
			? `<path d="M76 46 L60 66 H72 L66 82 L84 60 H72 Z" fill="#fff"/>` : "";
		// Bottom line: spare battery (Arctis) or the device label.
		const bottom = showSpare && res.spare !== undefined
			? `<text x="72" y="136" ${F} font-size="16" fill="#999">${t("Spare")} ${res.spare}%</text>` : name;
		body = `<rect x="22" y="32" width="92" height="46" rx="8" fill="none" stroke="#ddd" stroke-width="6"/>
			<rect x="114" y="45" width="8" height="20" rx="3" fill="#ddd"/>
			<rect x="28" y="38" width="${fill}" height="34" rx="4" fill="${color}"/>
			${bolt}
			<text x="72" y="${bottom ? 112 : 120}" ${F} font-size="32" font-weight="600" fill="#fff">${lvl}%</text>
			${bottom}`;
	}
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${W}" viewBox="0 0 ${W} ${W}"><rect width="${W}" height="${W}" fill="#111"/>${body}</svg>`;
	return "data:image/svg+xml;charset=utf8," + encodeURIComponent(svg);
}

class HeadsetBatteryAction extends SingletonAction {
	manifestId = "com.lysgarrt.decktoolkit.headset";
	#timers = new Map();
	#settings = new Map();

	async #update(action) {
		const settings = this.#settings.get(action.id) ?? {};
		const dev = settings.device;
		if (!dev) return paint(action, batteryImage({ setup: true }));
		// "arctis" = SteelSeries base station via USB; anything else = Windows device id of a Bluetooth device.
		const res = await run("headset.exe", dev === "arctis" ? [] : ["bt", dev]);
		const label = settings.label?.trim() || shortLabel(dev === "arctis" ? "Arctis" : res.name);
		await paint(action, batteryImage(res, dev === "arctis" && settings.showSpare !== false, label));
		if (!res.ok) streamDeck.logger.warn("headset", res);
	}

	async onSendToPlugin(ev) {
		if (ev.payload?.event === "getDevices") {
			const res = await run("headset.exe", ["list"]);
			await streamDeck.ui.sendToPropertyInspector({ event: "devices", list: res.devices ?? [] });
		}
	}

	#schedule(ev) {
		const settings = ev.payload.settings ?? {};
		this.#settings.set(ev.action.id, settings);
		const minutes = Number(settings.interval) || 1;
		clearInterval(this.#timers.get(ev.action.id));
		this.#timers.set(ev.action.id, setInterval(() => this.#update(ev.action), minutes * 60000));
		return this.#update(ev.action);
	}

	onWillAppear(ev) {
		return this.#schedule(ev);
	}

	onDidReceiveSettings(ev) {
		return this.#schedule(ev);
	}

	onWillDisappear(ev) {
		clearInterval(this.#timers.get(ev.action.id));
		this.#timers.delete(ev.action.id);
		this.#settings.delete(ev.action.id);
	}

	onKeyDown(ev) {
		return this.#update(ev.action);
	}
}

class SwitchInputAction extends SingletonAction {
	manifestId = "com.lysgarrt.decktoolkit.switch";

	/** Reads the input value for target 1 or 2 from the settings. */
	#target(s, n) {
		const sel = n === 2 ? s.input2 : s.input;
		const input = sel === "custom" ? (n === 2 ? s.customValue2 : s.customValue) : sel;
		return { input };
	}

	/** Toggle mode: state 0 = image for input 1, state 1 = image for input 2 (current input). */
	#show(ev, input) {
		const s = ev.payload.settings ?? {};
		if (s.mode !== "toggle") return;
		const state = String(input) === String(this.#target(s, 2).input) ? 1 : 0;
		return ev.action.setState(state);
	}

	onWillAppear(ev) {
		const s = ev.payload.settings ?? {};
		if (s.mode === "toggle") return this.#show(ev, s.lastInput ?? this.#target(s, 1).input);
	}

	onDidReceiveSettings(ev) {
		return this.onWillAppear(ev);
	}

	async onKeyDown(ev) {
		const s = ev.payload.settings ?? {};
		// Toggle mode: alternate between target 1 and 2. On the other input the monitor often can't be
		// read via DDC, so the key remembers the input it set last.
		let t = this.#target(s, 1);
		if (s.mode === "toggle" && String(s.lastInput) === String(t.input)) t = this.#target(s, 2);
		const input = t.input;
		if (!s.device || input === undefined || input === "" || isNaN(Number(input))) {
			streamDeck.logger.warn("Not configured", s);
			await ev.action.showAlert();
			return;
		}
		// monitorId (model + GPU connector) survives reboots; \\.\DISPLAYn does not.
		const target = s.monitorId || s.device;
		const res = await ddc(["set", target, String(s.index ?? 0), "60", String(Number(input)), String(s.retries ?? 5)]);
		streamDeck.logger.info(`set ${target}#${s.index ?? 0} input=${input}`, res);
		if (res.ok && s.mode === "toggle") {
			await ev.action.setSettings({ ...s, lastInput: String(input) });
			await this.#show(ev, input);
		}
		if (res.ok) await ev.action.showOk();
		else await ev.action.showAlert();
	}

	async onSendToPlugin(ev) {
		if (ev.payload?.event === "getMonitors") {
			const res = await ddc(["list"]);
			await streamDeck.ui.sendToPropertyInspector({ event: "monitors", ...res });
		}
	}
}

/* ------------------------------------------------------------------ */
/* Safe shutdown – only after a second press within 3 seconds          */
/* ------------------------------------------------------------------ */

const ICON_POWER = "M13 3h-2v10h2V3zm4.83 2.17-1.42 1.42C17.99 7.86 19 9.81 19 12c0 3.87-3.13 7-7 7s-7-3.13-7-7c0-2.19 1.01-4.14 2.58-5.42L6.17 5.17C4.23 6.82 3 9.26 3 12c0 4.97 4.03 9 9 9s9-4.03 9-9c0-2.74-1.23-5.18-3.17-6.83z";

function powerImage(state, secs) {
	const W = 144;
	let body;
	if (state === "armed") {
		body = `<rect width="${W}" height="${W}" fill="#e5484d"/>
			<g transform="translate(46 18) scale(2.2)"><path d="${ICON_POWER}" fill="#fff"/></g>
			<text x="72" y="104" font-family="Segoe UI,Arial" font-size="19" font-weight="700" fill="#fff" text-anchor="middle">${t("Press")}</text>
			<text x="72" y="128" font-family="Segoe UI,Arial" font-size="19" font-weight="700" fill="#fff" text-anchor="middle">${t("again")} (${secs})</text>`;
	} else if (state === "going") {
		body = `<rect width="${W}" height="${W}" fill="#000"/>
			<g transform="translate(42 22) scale(2.5)"><path d="${ICON_POWER}" fill="#e5484d"/></g>
			<text x="72" y="124" font-family="Segoe UI,Arial" font-size="19" font-weight="600" fill="#e5484d" text-anchor="middle">${t("Shutting down…")}</text>`;
	} else {
		body = `<rect width="${W}" height="${W}" fill="#000"/>
			<g transform="translate(30 30) scale(3.5)"><path d="${ICON_POWER}" fill="#fff"/></g>`;
	}
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${W}" viewBox="0 0 ${W} ${W}">${body}</svg>`;
	return "data:image/svg+xml;charset=utf8," + encodeURIComponent(svg);
}

class ShutdownAction extends SingletonAction {
	manifestId = "com.lysgarrt.decktoolkit.shutdown";
	#armed = new Map(); // action.id -> { timer, secs }

	#disarm(action) {
		const a = this.#armed.get(action.id);
		if (a) clearInterval(a.timer);
		this.#armed.delete(action.id);
		return paint(action, powerImage("idle"));
	}

	onWillAppear(ev) {
		return paint(ev.action, powerImage("idle"));
	}

	onWillDisappear(ev) {
		const a = this.#armed.get(ev.action.id);
		if (a) clearInterval(a.timer);
		this.#armed.delete(ev.action.id);
	}

	async onKeyDown(ev) {
		const action = ev.action;
		if (this.#armed.has(action.id)) {
			clearInterval(this.#armed.get(action.id).timer);
			this.#armed.delete(action.id);
			await paint(action, powerImage("going"));
			streamDeck.logger.info("shutdown confirmed");
			execFile("shutdown.exe", ["/s", "/t", "3"], { windowsHide: true }, (err) => {
				if (err) {
					streamDeck.logger.warn("shutdown failed", err.message);
					action.showAlert();
					paint(action, powerImage("idle"));
				}
			});
			return;
		}
		const a = { secs: 3 };
		a.timer = setInterval(() => {
			a.secs--;
			if (a.secs <= 0) this.#disarm(action);
			else paint(action, powerImage("armed", a.secs));
		}, 1000);
		this.#armed.set(action.id, a);
		await paint(action, powerImage("armed", a.secs));
	}
}

/* ------------------------------------------------------------------ */
/* SwitchBot Bot – presses via the PC's own Bluetooth (no hub)         */
/* ------------------------------------------------------------------ */

const ICON_TOUCH = "M9 11.24V7.5C9 6.12 10.12 5 11.5 5S14 6.12 14 7.5v3.74c1.21-.81 2-2.18 2-3.74C16 5.01 13.99 3 11.5 3S7 5.01 7 7.5c0 1.56.79 2.93 2 3.74zm9.84 4.63-4.54-2.26c-.17-.07-.35-.11-.54-.11H13v-6c0-.83-.67-1.5-1.5-1.5S10 6.67 10 7.5v10.74l-3.43-.72c-.08-.01-.15-.03-.24-.03-.31 0-.59.13-.79.33l-.79.8 4.94 4.94c.27.27.65.44 1.06.44h6.79c.75 0 1.33-.55 1.44-1.28l.75-5.27c.01-.07.02-.14.02-.2 0-.62-.38-1.16-.91-1.38z";

const ICON_MONITOR = "M20 2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h7v2H8v2h8v-2h-3v-2h7c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H4V4h16v12z";
const ICON_BULB = "M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7z";
const ICON_TV = "M21 6h-7.59l3.29-3.29L16 2l-4 4-4-4-.71.71L10.59 6H3c-1.1 0-2 .89-2 2v12c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-1.11-.9-2-2-2zm0 14H3V8h18v12zM9 10v8l7-4z";

/** Finger icon, or – in a two-state display mode – the current state (monitor/TV, light on/off). */
function botImage(state, s = {}) {
	const busy = state === "busy", nomac = state === "nomac";
	let icon = ICON_TOUCH, color = "#fff";
	if (s.display === "output") icon = s.output === "tv" ? ICON_TV : ICON_MONITOR;
	if (s.display === "light") {
		icon = ICON_BULB;
		color = s.light === "on" ? "#FFD54F" : "#6b6b6b";
	}
	if (busy) color = "#f5a524";
	if (nomac) color = "#4a4a4a";
	const name = s.name ? `<text x="72" y="134" font-family="Segoe UI,Arial" font-size="16" fill="#999" text-anchor="middle">${esc(s.name.slice(0, 14))}</text>` : "";
	const g = name ? `translate(36 20) scale(3)` : `translate(30 30) scale(3.5)`;
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
		<rect width="144" height="144" fill="#000"/>
		<g transform="${g}"><path d="${icon}" fill="${color}"/></g>${name}</svg>`;
	return "data:image/svg+xml;charset=utf8," + encodeURIComponent(svg);
}

/** One Bluetooth press at a time per bot; extra presses queue up behind it. */
const botQueue = new Map();
function pressBot(mac) {
	const prev = botQueue.get(mac) ?? Promise.resolve();
	const next = prev.then(() => run("switchbot.exe", ["press", mac]));
	botQueue.set(mac, next.catch(() => {}));
	return next;
}

class SwitchBotAction extends SingletonAction {
	manifestId = "com.lysgarrt.decktoolkit.bot";

	#show(action, s) {
		return paint(action, botImage(s?.mac ? "idle" : "nomac", s));
	}

	onWillAppear(ev) {
		return this.#show(ev.action, ev.payload.settings);
	}

	onDidReceiveSettings(ev) {
		return this.#show(ev.action, ev.payload.settings);
	}

	async onKeyDown(ev) {
		const s = ev.payload.settings ?? {};
		if (!s.mac) return ev.action.showAlert();
		await paint(ev.action, botImage("busy", s));
		const times = Math.max(1, Math.min(5, Number(s.times) || 1));
		let res = { ok: true };
		let pressed = 0;
		for (let i = 0; i < times && res.ok; i++) {
			res = await pressBot(s.mac);
			if (res.ok) pressed++;
		}
		streamDeck.logger.info(`bot ${s.mac} x${pressed}/${times}`, res.ok ? "ok" : res.error);
		let next = s;
		// Every successful press flips a two-state display (monitor/TV or light on/off).
		if (pressed % 2 === 1 && s.display === "output") next = { ...s, output: s.output === "tv" ? "monitor" : "tv" };
		if (pressed % 2 === 1 && s.display === "light") next = { ...s, light: s.light === "on" ? "off" : "on" };
		if (next !== s) await ev.action.setSettings(next);
		await this.#show(ev.action, next);
		return res.ok ? ev.action.showOk() : ev.action.showAlert();
	}

	async onSendToPlugin(ev) {
		if (ev.payload?.event !== "scan") return;
		const res = await run("switchbot.exe", ["scan", "10"]);
		await streamDeck.ui.sendToPropertyInspector({ event: "bots", ...res });
	}
}

streamDeck.logger.setLevel("info");
streamDeck.actions.registerAction(new ShutdownAction());
streamDeck.actions.registerAction(new SwitchBotAction());
streamDeck.actions.registerAction(new SwitchInputAction());
streamDeck.actions.registerAction(new HeadsetBatteryAction());
streamDeck.actions.registerAction(new VolumeAction());
streamDeck.actions.registerAction(new TwitchChannelAction());
streamDeck.connect();
