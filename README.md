# Deck Toolkit – Stream Deck plugin for Windows

Six Stream Deck keys for things the stock actions can't do: a two-key volume slider with mute,
Twitch live status, switching monitor inputs over DDC/CI, the battery level of your Bluetooth devices,
SwitchBot bots over plain Bluetooth and a shutdown key that can't be pressed by accident.

All texts are available in **English and German** (they follow the language of the Stream Deck app).

*Deutsche Kurzfassung weiter unten.*

## Keys

| Key | What it does | You need |
| --- | --- | --- |
| **Volume** | Volume down / up / mute for the default output, default input or any specific device. Put "down" and "up" of the same device side by side and they form one wide slider with the percentage. Hold to keep changing. The mute key blinks slowly while muted. | – |
| **Twitch Channel** | Round profile picture – in colour with a **LIVE** badge while the channel streams, grey while offline. Press opens the stream. Checked every minute via the public channel page, no login. Optional: jump back to the home screen after pressing (see below). | – |
| **Monitor Input** | Switches a monitor to HDMI / DisplayPort / USB-C via DDC/CI, or toggles between two inputs. All connected monitors are listed (identical models are told apart by position). | DDC/CI enabled in the monitor's menu |
| **SwitchBot Bot** | Presses a SwitchBot Bot directly over the PC's Bluetooth – no hub, no cloud. Optional icon that tracks a light switch (on/off) or a two-way switch (monitor/TV). | Bluetooth LE on the PC |
| **Battery** | Battery level of a Bluetooth headset, controller, mouse … – pick the device in the key settings, the name is shown on the key. Also supports the SteelSeries Arctis Nova Pro Wireless base station via USB (incl. spare battery). | Bluetooth: Windows must show the battery level under Settings → Bluetooth & devices |
| **Safe Shutdown** | Shuts the PC down only if you press a second time within 3 seconds. | – |

## Install

1. Download `com.lysgarrt.decktoolkit.streamDeckPlugin` from the [Releases](../../releases) page.
2. Double-click it – Stream Deck installs the plugin.
3. The keys are in the action list under **Deck Toolkit**.

Requires Windows 10/11 and Stream Deck 7.1 or newer.

## Optional: Twitch key jumps back to the home screen

Stream Deck plugins may only switch to profiles that belong to the plugin. To let the Twitch key jump to the top
level of *your* profile (even from inside folders), mark your profile once:

1. Quit Stream Deck (tray icon → Quit).
2. Open `%APPDATA%\Elgato\StreamDeck\ProfilesV3\`, find the `….sdProfile` folder of your profile
   (its `manifest.json` contains `"Name":"<your profile name>"`) and **make a backup copy of it**.
3. In that `manifest.json` add these two entries next to `"Name"`:
   ```json
   "InstalledByPluginUUID": "com.lysgarrt.decktoolkit",
   "PreconfiguredName": "profiles/Home",
   ```
4. Start Stream Deck again and set **After press → jump to home screen** on the Twitch key.

> ⚠️ Stream Deck now treats that profile as belonging to this plugin. If you ever **uninstall** Deck Toolkit,
> remove the two entries first (or keep your backup) – otherwise Stream Deck may remove the profile together with the plugin.

## Build from source

```powershell
npm install
npm run build:helpers   # compiles the small C# helpers in helper\ into the plugin's bin\ folder
npm run build           # bundles src\ into bin\plugin.js
npm run link            # installs the plugin folder into Stream Deck for development
npm run pack            # creates dist\com.lysgarrt.decktoolkit.streamDeckPlugin
```

The helpers are compiled with the C# compiler that ships with Windows. `switchbot.exe` additionally needs the
Windows 10/11 SDK and the .NET Framework 4.8 Developer Pack.

| Helper | Purpose |
| --- | --- |
| `ddc.exe` | DDC/CI monitor control (VCP 0x60 input select) |
| `volume.exe` | Windows Core Audio: watch / change volume and mute |
| `headset.exe` | Battery of Bluetooth devices (Windows battery property) and of the Arctis Nova Pro via HID |
| `switchbot.exe` | Bluetooth LE scan and press for SwitchBot Bots |
| `avatar.exe` | Renders the round Twitch profile picture (colour / grey) |

## Notes

- Twitch live status is read from the public channel page. If Twitch changes its page, the status may stop updating.
- Monitor input codes differ between brands. If a preset doesn't work, use **Custom value**.
- A monitor is missing from the list? Check Device Manager → Monitors: if its entry is disabled, enable it.
- Bluetooth battery levels come from Windows. Devices that don't report a battery to Windows can't be shown.
- Twitch, SteelSeries and SwitchBot are trademarks of their owners. This project is not affiliated with them.

## License

[MIT](LICENSE)

---

## Deutsch (Kurzfassung)

**Deck Toolkit** bringt sechs Stream-Deck-Tasten für Windows: Lautstärke-Regler über zwei Tasten (mit Stumm-Taste),
Twitch-Live-Status (grau = offline), Monitor-Eingang per DDC/CI umschalten, Akkustand von Bluetooth-Geräten
(Gerät auswählbar, auch SteelSeries Arctis Nova Pro Wireless per USB), SwitchBot Bot direkt per Bluetooth
(optional mit Licht-an/aus-Anzeige) und sicheres Herunterfahren (zweimal drücken).

Alle Texte gibt es auf Deutsch, wenn die Stream-Deck-App auf Deutsch eingestellt ist.

**Installation:** `com.lysgarrt.decktoolkit.streamDeckPlugin` aus den Releases herunterladen und doppelklicken.

**Twitch-Taste springt zum Homescreen (optional):** Stream Deck beenden, in
`%APPDATA%\Elgato\StreamDeck\ProfilesV3\` den Ordner deines Profils sichern und in dessen `manifest.json`
`"InstalledByPluginUUID": "com.lysgarrt.decktoolkit"` und `"PreconfiguredName": "profiles/Home"` ergänzen.
Danach in der Twitch-Taste „Danach → zum Homescreen springen“ wählen.
⚠️ Vor dem Deinstallieren des Plugins die beiden Einträge wieder entfernen, sonst kann Stream Deck das Profil mit löschen.
