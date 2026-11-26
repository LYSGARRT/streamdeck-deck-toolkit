// Volume key: down / up / mute for the default output, default input or a specific device.
// Keeps one permanent connection to bin/volume.exe (Windows Core Audio) so all keys update
// immediately – also when the volume is changed in Windows.
import streamDeck, { SingletonAction } from "@elgato/streamdeck";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { paint } from "./draw.js";
import { volumeImage, BLINK_MS } from "./volume-image.js";

const BIN = path.dirname(fileURLToPath(import.meta.url));

/** One shared background process for all volume keys. */
class VolumeService {
	#proc;
	#buf = "";
	#subs = new Map(); // target -> Set<fn>
	#state = new Map(); // target -> letzter Status
	#listWaiters = [];
	#restart;

	#ensure() {
		if (this.#proc) return;
		const proc = spawn(path.join(BIN, "volume.exe"), [], { windowsHide: true, stdio: ["pipe", "pipe", "ignore"] });
		this.#proc = proc;
		proc.stdout.setEncoding("utf8");
		proc.stdout.on("data", (d) => {
			this.#buf += d;
			let i;
			while ((i = this.#buf.indexOf("\n")) >= 0) {
				const line = this.#buf.slice(0, i).trim();
				this.#buf = this.#buf.slice(i + 1);
				if (line) this.#onLine(line);
			}
		});
		proc.on("error", (e) => streamDeck.logger.warn("volume.exe", e.message));
		proc.on("exit", (code) => {
			streamDeck.logger.warn(`volume.exe beendet (${code})`);
			this.#proc = undefined;
			this.#buf = "";
			// Neu starten, solange noch Tasten sichtbar sind.
			if (this.#subs.size && !this.#restart) {
				this.#restart = setTimeout(() => {
					this.#restart = undefined;
					if (!this.#subs.size) return;
					this.#ensure();
					for (const t of this.#subs.keys()) this.#send(`watch ${t}`);
				}, 2000);
			}
		});
	}

	#send(line) {
		this.#ensure();
		try {
			this.#proc.stdin.write(line + "\n");
		} catch (e) {
			streamDeck.logger.warn("volume send", e.message);
		}
	}

	#onLine(line) {
		let msg;
		try {
			msg = JSON.parse(line);
		} catch {
			return;
		}
		if (msg.list) {
			for (const fn of this.#listWaiters.splice(0)) fn(msg.list);
			return;
		}
		if (!msg.t) {
			if (msg.error) streamDeck.logger.warn("volume.exe", msg.error);
			return;
		}
		this.#state.set(msg.t, msg);
		for (const fn of this.#subs.get(msg.t) ?? []) fn(msg);
	}

	subscribe(target, fn) {
		let set = this.#subs.get(target);
		if (!set) {
			set = new Set();
			this.#subs.set(target, set);
			this.#send(`watch ${target}`);
		} else if (this.#state.has(target)) {
			fn(this.#state.get(target));
		}
		set.add(fn);
		return () => {
			set.delete(fn);
			if (set.size === 0) {
				this.#subs.delete(target);
				this.#state.delete(target);
				this.#send(`unwatch ${target}`);
			}
		};
	}

	step(target, delta) {
		this.#send(`step ${target} ${delta}`);
	}

	mute(target, how = "toggle") {
		this.#send(`mute ${target} ${how}`);
	}

	list() {
		return new Promise((resolve) => {
			this.#listWaiters.push(resolve);
			this.#send("list");
			setTimeout(() => resolve([]), 3000);
		});
	}
}

const service = new VolumeService();

/** Short name for the key: "Speakers (Realtek(R) Audio)" -> "Realtek", "LINE IN (Realtek…)" -> "Line". */
function shortName(name, target) {
	if (!name) return "";
	const m = /^(.*?)\s*\((.*)\)\s*$/.exec(name);
	// Default devices: the vendor tells which device is active; fixed devices: the endpoint name.
	let s = m ? (target === "out" || target === "in" ? m[2] : m[1]) : name;
	s = s.replace(/\(R\)|\(TM\)|®|™/gi, "").replace(/\b(Audio|High Definition|Definition)\b/gi, "").trim();
	s = s.split(/\s+/)[0] || s;
	if (s === s.toUpperCase() && s.length > 3) s = s[0] + s.slice(1).toLowerCase();
	return s;
}

/** Input device? ("in" or a capture id {0.0.1.…}) */
const isInput = (target) => target === "in" || /^\{0\.0\.1\./.test(target);

export class VolumeAction extends SingletonAction {
	manifestId = "com.lysgarrt.decktoolkit.volume";
	#keys = new Map(); // action.id -> { action, settings, target, unsub, status, pressed, hold, lastImg }

	#cfg(s) {
		const target = (s.target || "out").trim();
		const mode = ["down", "up", "mute"].includes(s.mode) ? s.mode : "up";
		const step = Math.max(1, Math.min(25, Number(s.step) || 5));
		const icon = s.icon && s.icon !== "auto" ? s.icon : isInput(target) ? "mic" : "speaker";
		return { target, mode, step, icon, label: (s.label || "").trim() };
	}

	#draw(entry) {
		const c = this.#cfg(entry.settings);
		const st = entry.status ?? { ok: false };
		const view = { ...st, icon: c.icon, label: c.label || shortName(st.name, c.target) };
		const img = volumeImage(view, c.mode, entry.pressed, entry.blinkOn !== false);
		this.#ensureBlink();
		if (img === entry.lastImg) return;
		entry.lastImg = img;
		return paint(entry.action, img);
	}

	#blink;

	/** Mute keys blink slowly while their device is muted. */
	#blinks(entry) {
		return this.#cfg(entry.settings).mode === "mute" && !!entry.status?.ok && !!entry.status.mute;
	}

	#ensureBlink() {
		const need = [...this.#keys.values()].some((e) => this.#blinks(e));
		if (need && !this.#blink) {
			this.#blink = setInterval(() => {
				for (const e of this.#keys.values()) {
					if (this.#blinks(e)) {
						e.blinkOn = e.blinkOn === false;
						this.#draw(e);
					} else if (e.blinkOn === false) {
						e.blinkOn = true;
						this.#draw(e);
					}
				}
			}, BLINK_MS);
		} else if (!need && this.#blink) {
			clearInterval(this.#blink);
			this.#blink = undefined;
			for (const e of this.#keys.values()) e.blinkOn = true;
		}
	}

	#attach(entry) {
		entry.unsub?.();
		const { target } = this.#cfg(entry.settings);
		entry.target = target;
		entry.status = undefined;
		entry.unsub = service.subscribe(target, (st) => {
			entry.status = st;
			this.#draw(entry);
		});
		this.#draw(entry);
	}

	#stopHold(entry) {
		clearTimeout(entry.hold?.delay);
		clearInterval(entry.hold?.repeat);
		entry.hold = undefined;
	}

	onWillAppear(ev) {
		const entry = { action: ev.action, settings: ev.payload.settings ?? {}, pressed: false };
		this.#keys.set(ev.action.id, entry);
		this.#attach(entry);
	}

	onDidReceiveSettings(ev) {
		const entry = this.#keys.get(ev.action.id);
		if (!entry) return;
		entry.settings = ev.payload.settings ?? {};
		entry.lastImg = undefined;
		if (this.#cfg(entry.settings).target !== entry.target) this.#attach(entry);
		else this.#draw(entry);
	}

	onWillDisappear(ev) {
		const entry = this.#keys.get(ev.action.id);
		if (!entry) return;
		this.#stopHold(entry);
		entry.unsub?.();
		this.#keys.delete(ev.action.id);
		this.#ensureBlink();
	}

	onKeyDown(ev) {
		const entry = this.#keys.get(ev.action.id);
		if (!entry) return;
		const c = this.#cfg(entry.settings);
		entry.pressed = true;
		this.#draw(entry);
		if (c.mode === "mute") {
			service.mute(c.target);
			return;
		}
		const delta = c.mode === "down" ? -c.step : c.step;
		service.step(c.target, delta);
		// Holding the key keeps changing (after a short pause, then quickly).
		this.#stopHold(entry);
		entry.hold = { delay: setTimeout(() => {
			entry.hold.repeat = setInterval(() => service.step(c.target, delta), 110);
		}, 380) };
	}

	onKeyUp(ev) {
		const entry = this.#keys.get(ev.action.id);
		if (!entry) return;
		this.#stopHold(entry);
		entry.pressed = false;
		this.#draw(entry);
	}

	async onSendToPlugin(ev) {
		if (ev.payload?.event === "getDevices") {
			const list = await service.list();
			await streamDeck.ui.sendToPropertyInspector({ event: "devices", list });
		}
	}
}
