// Twitch channel key: round profile picture, in colour with a LIVE badge while the channel streams,
// grey while it is offline. Pressing opens the channel in the browser.
//
// Optional "jump to home screen": plugins may only switch to profiles that belong to the plugin.
// A user can mark their own Stream Deck profile with PreconfiguredName "profiles/Home" and
// InstalledByPluginUUID "com.lysgarrt.decktoolkit" (see README); switching there on page 0 lands on
// the top level instead of inside the folder.
import streamDeck, { SingletonAction } from "@elgato/streamdeck";
import { execFile } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { paint } from "./draw.js";

const BIN = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(BIN, "..", "cache", "twitch");
const HOME_PROFILE = "profiles/Home";
const POLL_MS = 60_000;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

try {
	mkdirSync(CACHE, { recursive: true });
} catch {}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const norm = (c) => (c || "").trim().replace(/^.*twitch\.tv\//i, "").replace(/[^a-z0-9_]/gi, "").toLowerCase();

/** Polls a channel regularly (public channel page, no login needed). */
class ChannelWatcher {
	#subs = new Map(); // channel -> { fns:Set, state, timer }

	subscribe(ch, fn) {
		let e = this.#subs.get(ch);
		if (!e) {
			e = { fns: new Set(), state: undefined, timer: undefined };
			this.#subs.set(ch, e);
			// Stagger the start so not all channels are fetched at the same moment.
			setTimeout(() => this.#poll(ch), Math.random() * 1500);
		} else if (e.state) fn(e.state);
		e.fns.add(fn);
		return () => {
			e.fns.delete(fn);
			if (!e.fns.size) {
				clearTimeout(e.timer);
				this.#subs.delete(ch);
			}
		};
	}

	async #poll(ch) {
		const e = this.#subs.get(ch);
		if (!e) return;
		try {
			const res = await fetch(`https://www.twitch.tv/${ch}`, { headers: { "User-Agent": UA, "Accept-Language": "de" } });
			const html = await res.text();
			const live = html.includes('"isLiveBroadcast":true');
			const m = /https:\/\/static-cdn\.jtvnw\.net\/jtv_user_pictures\/[^"'\s]*?profile_image-[^"'\s]*?\.(?:png|jpe?g)/i.exec(html);
			let avatar = e.state?.avatar;
			if (m) {
				const url = m[0].replace(/-\d+x\d+\./, "-300x300.");
				const file = path.join(CACHE, `${ch}.img`);
				if (url !== e.state?.avatarUrl || !existsSync(file)) {
					const img = await fetch(url, { headers: { "User-Agent": UA } });
					if (img.ok) {
						writeFileSync(file, Buffer.from(await img.arrayBuffer()));
						avatar = file;
					}
				} else avatar = file;
				e.avatarUrl = url;
			}
			e.state = { ok: true, live, avatar, avatarUrl: e.avatarUrl, at: Date.now() };
		} catch (err) {
			streamDeck.logger.warn(`twitch ${ch}: ${err.message}`);
			// Keep the last known state.
			e.state = e.state ?? { ok: false, live: false };
		}
		for (const fn of e.fns) fn(e.state);
		if (this.#subs.get(ch) === e) e.timer = setTimeout(() => this.#poll(ch), POLL_MS);
	}

	refresh(ch) {
		const e = this.#subs.get(ch);
		if (!e) return;
		clearTimeout(e.timer);
		this.#poll(ch);
	}
}

const watcher = new ChannelWatcher();

/** Renders the key image with bin/avatar.exe and returns a data URL. */
function renderKey(avatar, coords, live, ch) {
	const out = path.join(CACHE, `${ch}_${live ? "live" : "off"}.png`);
	return new Promise((resolve) => {
		execFile(path.join(BIN, "avatar.exe"), [avatar, "-", out, live ? "live" : "off"], { windowsHide: true, timeout: 10000 }, (err) => {
			if (err) {
				streamDeck.logger.warn(`avatar.exe ${ch}: ${err.message}`);
				return resolve(undefined);
			}
			try {
				resolve("data:image/png;base64," + readFileSync(out).toString("base64"));
			} catch {
				resolve(undefined);
			}
		});
	});
}

/** Placeholder until the profile picture has been loaded. */
function placeholder(ch) {
	const name = (ch || "Kanal?").slice(0, 12);
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="144" height="144" viewBox="0 0 144 144">
<rect width="144" height="144" fill="#000"/>
<circle cx="72" cy="66" r="44" fill="none" stroke="#9146FF" stroke-width="5"/>
<path d="M56 46h36v26l-10 10h-8l-6 6v-6h-12z" fill="#9146FF"/>
<text x="72" y="132" font-family="Segoe UI, Arial" font-size="17" font-weight="600" fill="#fff" text-anchor="middle">${name}</text>
</svg>`;
	return "data:image/svg+xml;charset=utf8," + encodeURIComponent(svg);
}

export class TwitchChannelAction extends SingletonAction {
	manifestId = "com.lysgarrt.decktoolkit.twitch";
	#keys = new Map(); // action.id -> { action, settings, ch, unsub, imgKey, busy }

	#attach(entry) {
		entry.unsub?.();
		entry.ch = norm(entry.settings.channel);
		entry.imgKey = undefined;
		if (!entry.ch) {
			paint(entry.action, placeholder(""));
			return;
		}
		paint(entry.action, placeholder(entry.ch));
		entry.unsub = watcher.subscribe(entry.ch, (st) => this.#draw(entry, st));
	}

	async #draw(entry, st) {
		if (!st?.avatar) return;
		const coords = entry.action.coordinates;
		const key = `${st.avatar}|${st.live}|${coords?.column},${coords?.row}|${st.avatarUrl}`;
		if (key === entry.imgKey) return;
		entry.imgKey = key;
		const img = await renderKey(st.avatar, coords, st.live, entry.ch);
		// Key gone or reconfigured in the meantime?
		if (img && this.#keys.get(entry.action.id) === entry && entry.imgKey === key) await entry.action.setImage(img);
	}

	onWillAppear(ev) {
		const entry = { action: ev.action, settings: ev.payload.settings ?? {} };
		this.#keys.set(ev.action.id, entry);
		this.#attach(entry);
	}

	onDidReceiveSettings(ev) {
		const entry = this.#keys.get(ev.action.id);
		if (!entry) return;
		entry.settings = ev.payload.settings ?? {};
		if (norm(entry.settings.channel) !== entry.ch) this.#attach(entry);
	}

	onWillDisappear(ev) {
		const entry = this.#keys.get(ev.action.id);
		entry?.unsub?.();
		this.#keys.delete(ev.action.id);
	}

	async onKeyDown(ev) {
		const entry = this.#keys.get(ev.action.id);
		const ch = entry?.ch;
		if (!ch) return ev.action.showAlert();
		await streamDeck.system.openUrl(`https://www.twitch.tv/${ch}`);
		watcher.refresh(ch);
		if (entry.settings.home !== true) return;
		try {
			const dev = ev.action.device.id;
			// Switching straight to page 0 of the marked profile lands on the top level.
			await streamDeck.profiles.switchToProfile(dev, HOME_PROFILE, 0);
		} catch (err) {
			streamDeck.logger.warn(`twitch home: ${err.message}`);
		}
	}
}
