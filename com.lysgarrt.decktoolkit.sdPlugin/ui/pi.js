// Shared helpers for the property inspectors: translation + Stream Deck connection.
//
// Markup is written in English. Elements with data-i18n="key" (text), data-i18n-ph="key"
// (placeholder) or data-i18n-title="key" (tooltip) are replaced with window.STRINGS[lang][key]
// when Stream Deck runs in that language. Pages call PI.connect({ onSettings, onMessage }).
(function () {
  const PI = {
    lang: "en",
    ws: null,
    uuid: null,
    action: null,
    settings: {},

    t(key, fallback) {
      const d = (window.STRINGS || {})[this.lang];
      return d && d[key] != null ? d[key] : fallback;
    },

    apply() {
      for (const el of document.querySelectorAll("[data-i18n]")) {
        if (el._en == null) el._en = el.innerHTML;
        el.innerHTML = this.t(el.dataset.i18n, el._en);
      }
      for (const el of document.querySelectorAll("[data-i18n-ph]")) {
        if (el._enPh == null) el._enPh = el.placeholder;
        el.placeholder = this.t(el.dataset.i18nPh, el._enPh);
      }
      for (const el of document.querySelectorAll("[data-i18n-title]")) {
        if (el._enTitle == null) el._enTitle = el.title;
        el.title = this.t(el.dataset.i18nTitle, el._enTitle);
      }
    },

    save(settings) {
      if (settings) this.settings = settings;
      this.send({ event: "setSettings", context: this.uuid, payload: this.settings });
    },

    sendToPlugin(payload) {
      this.send({ event: "sendToPlugin", action: this.action, context: this.uuid, payload });
    },

    send(msg) {
      if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(msg));
    },

    /** opts: { onSettings(settings), onMessage(payload), onOpen() } */
    connect(opts) {
      window.connectElgatoStreamDeckSocket = (port, uuid, registerEvent, info, actionInfo) => {
        this.uuid = uuid;
        try {
          this.lang = String(JSON.parse(info).application.language || "en").slice(0, 2);
        } catch {}
        this.apply();
        try {
          const a = JSON.parse(actionInfo);
          this.settings = a.payload.settings || {};
          this.action = a.action;
        } catch {
          this.settings = {};
        }
        opts.onSettings && opts.onSettings(this.settings);
        this.ws = new WebSocket("ws://127.0.0.1:" + port);
        this.ws.onopen = () => {
          this.ws.send(JSON.stringify({ event: registerEvent, uuid }));
          opts.onOpen && opts.onOpen();
        };
        this.ws.onmessage = (e) => {
          const msg = JSON.parse(e.data);
          if (msg.event === "didReceiveSettings") {
            this.settings = msg.payload.settings || {};
            opts.onSettings && opts.onSettings(this.settings);
          } else if (msg.event === "sendToPropertyInspector") {
            opts.onMessage && opts.onMessage(msg.payload || {});
          }
        };
      };
    },
  };
  window.PI = PI;
})();
