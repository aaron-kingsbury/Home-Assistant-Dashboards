(() => {
  const CARD_TAG = "housevoice-music-panel";
  const FEATURES = {
    pause: 1,
    seek: 2,
    volumeSet: 4,
    mute: 8,
    previous: 16,
    next: 32,
    stop: 4096,
    play: 16384,
    shuffle: 32768,
    browse: 131072,
    repeat: 262144,
  };

  const NAV_ITEMS = [
    ["home", "mdi:home-outline", "Home", "/parents-room/parents-room"],
    ["alarm", "mdi:shield-star-outline", "Alarm", "/control-panels/alarm-control?housevoice_origin=parents"],
    ["lights", "mdi:lightbulb-outline", "Lights", "/control-panels/lights-control?housevoice_origin=parents"],
    ["locks", "mdi:lock-outline", "Locks", "/control-panels/locks-control?housevoice_origin=parents"],
    ["camera", "mdi:cctv", "Camera", "/control-panels/cameras-control?housevoice_origin=parents"],
    ["thermostat", "mdi:thermometer", "Thermostat", "/control-panels/thermostat-control?housevoice_origin=parents"],
  ];

  const BROWSE_TABS = [
    ["library", "mdi:music-note", "Library"],
    ["playlists", "mdi:playlist-music", "Playlists"],
    ["radio", "mdi:radio-tower", "Radio"],
    ["podcasts", "mdi:podcast", "Podcasts"],
  ];

  const LIBRARY_ROOT = {
    title: "Library",
    media_content_type: "music_assistant",
    media_content_id: "library",
    can_expand: true,
    children: [
      { title: "Artists", media_content_type: "music_assistant", media_content_id: "artists", media_class: "artist", can_expand: true, can_play: false, icon: "mdi:account-music" },
      { title: "Albums", media_content_type: "music_assistant", media_content_id: "albums", media_class: "album", can_expand: true, can_play: false, icon: "mdi:album" },
      { title: "Tracks", media_content_type: "music_assistant", media_content_id: "tracks", media_class: "track", can_expand: true, can_play: false, icon: "mdi:music-box-multiple" },
    ],
  };

  const WEATHER_ICONS = {
    "clear-night": "mdi:weather-night",
    sunny: "mdi:weather-sunny",
    partlycloudy: "mdi:weather-partly-cloudy",
    cloudy: "mdi:weather-cloudy",
    rainy: "mdi:weather-rainy",
    pouring: "mdi:weather-pouring",
    snowy: "mdi:weather-snowy",
    "snowy-rainy": "mdi:weather-snowy-rainy",
    lightning: "mdi:weather-lightning",
    "lightning-rainy": "mdi:weather-lightning-rainy",
    fog: "mdi:weather-fog",
    windy: "mdi:weather-windy",
    "windy-variant": "mdi:weather-windy-variant",
  };

  class HouseVoiceMusicPanel extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this._config = {};
      this._hass = null;
      this._rendered = false;
      this._activeTab = "library";
      this._browseCurrent = null;
      this._browseStack = [];
      this._browseItems = [];
      this._lastTouch = 0;
      this._lastArtwork = "";
      this._interval = null;
      this._updateQueued = false;
    }

    setConfig(config) {
      if (!config?.entity) throw new Error("housevoice-music-panel requires an entity");
      this._config = {
        weather_entity: "weather.forecast_housevoice_weather",
        volume_entity: "number.vaca_a2fc97a76_music_volume",
        ...config,
      };
      if (this._rendered) this._queueUpdate();
    }

    set hass(hass) {
      this._hass = hass;
      if (!this._rendered) this._render();
      this._queueUpdate();
    }

    connectedCallback() {
      if (this._hass && !this._rendered) this._render();
      if (!this._interval) {
        this._interval = window.setInterval(() => {
          this._updateClock();
          this._updateProgress();
        }, 1000);
      }
    }

    disconnectedCallback() {
      if (this._interval) window.clearInterval(this._interval);
      this._interval = null;
    }

    getCardSize() {
      return 6;
    }

    _render() {
      this._rendered = true;
      this.shadowRoot.innerHTML = `
        <style>${this._styles()}</style>
        <main class="music-app" id="app">
          <div class="scene-shade"></div>
          <header class="top-header">
            <div class="brand" aria-label="HouseVoice">
              <img src="/local/housevoice/logo.svg" alt="" />
              <span>HOUSEVOICE</span>
            </div>
            <div class="page-title"><ha-icon icon="mdi:headphones"></ha-icon><span>Music</span></div>
            <div class="status-block">
              <div class="clock"><strong id="clock">--:--</strong><span id="date">---</span></div>
              <div class="weather"><ha-icon id="weather-icon" icon="mdi:weather-cloudy"></ha-icon><strong id="temperature">--°</strong></div>
            </div>
          </header>

          <nav class="side-nav" aria-label="Parents navigation">
            ${NAV_ITEMS.map(([key, icon, label, path]) => `
              <button class="nav-button" data-action="navigate" data-path="${path}" aria-label="${label}">
                <ha-icon icon="${icon}"></ha-icon><span>${label}</span>
              </button>`).join("")}
          </nav>

          <section class="player-panel glass-panel">
            <div class="album-wrap">
              <div class="album-fallback"><ha-icon icon="mdi:music-note"></ha-icon><span>HOUSEVOICE</span></div>
              <img id="album-art" alt="Current album artwork" />
            </div>
            <div class="player-copy">
              <div class="kicker">NOW PLAYING</div>
              <div class="track-title" id="track-title">Ready to Play</div>
              <div class="track-artist" id="track-artist">Choose music from your library</div>
              <div class="progress-wrap">
                <input id="progress" class="gold-range" type="range" min="0" max="100" value="0" aria-label="Playback position" />
                <div class="time-row"><span id="elapsed">0:00</span><span id="duration">0:00</span></div>
              </div>
              <div class="transport" aria-label="Playback controls">
                <button data-action="shuffle" id="shuffle" class="round-control small" aria-label="Shuffle"><ha-icon icon="mdi:shuffle-variant"></ha-icon></button>
                <button data-action="previous" id="previous" class="round-control" aria-label="Previous track"><ha-icon icon="mdi:skip-previous"></ha-icon></button>
                <button data-action="play-pause" id="play-pause" class="round-control play-control" aria-label="Play"><ha-icon id="play-icon" icon="mdi:play"></ha-icon></button>
                <button data-action="next" id="next" class="round-control" aria-label="Next track"><ha-icon icon="mdi:skip-next"></ha-icon></button>
                <button data-action="repeat" id="repeat" class="round-control small" aria-label="Repeat"><ha-icon id="repeat-icon" icon="mdi:repeat"></ha-icon></button>
              </div>
            </div>
          </section>

          <section class="browse-tabs glass-panel" aria-label="Music browsing">
            ${BROWSE_TABS.map(([key, icon, label]) => `
              <button class="browse-tab ${key === "library" ? "active" : ""}" data-action="open-category" data-category="${key}">
                <ha-icon icon="${icon}"></ha-icon><span>${label}</span>
              </button>`).join("")}
          </section>

          <section class="volume-panel glass-panel">
            <button id="mute" class="mute-button" data-action="mute" aria-label="Mute"><ha-icon id="volume-icon" icon="mdi:volume-high"></ha-icon></button>
            <span class="volume-label">Volume</span>
            <input id="volume" class="gold-range" type="range" min="0" max="100" value="0" aria-label="Volume" />
            <strong id="volume-value">0%</strong>
          </section>

          <section id="browser" class="browser-overlay glass-panel" hidden aria-label="Music browser">
            <header class="browser-header">
              <button class="browser-icon" data-action="browse-back" aria-label="Back"><ha-icon icon="mdi:arrow-left"></ha-icon></button>
              <div><span id="browser-kicker">MUSIC ASSISTANT</span><h2 id="browser-title">Library</h2></div>
              <button class="browser-icon" data-action="close-browser" aria-label="Close"><ha-icon icon="mdi:close"></ha-icon></button>
            </header>
            <div id="browser-status" class="browser-status">Loading…</div>
            <div id="browser-grid" class="browser-grid"></div>
          </section>

          <div id="toast" class="toast" hidden></div>
        </main>`;

      this._wireEvents();
      this._queueUpdate();
    }

    _wireEvents() {
      const root = this.shadowRoot;
      root.addEventListener("touchend", (event) => {
        const target = event.target.closest?.("[data-action]");
        if (!target || target.disabled) return;
        event.preventDefault();
        event.stopPropagation();
        this._lastTouch = Date.now();
        this._activate(target);
      }, { passive: false });

      root.addEventListener("click", (event) => {
        if (Date.now() - this._lastTouch < 700) return;
        const target = event.target.closest?.("[data-action]");
        if (!target || target.disabled) return;
        event.preventDefault();
        event.stopPropagation();
        this._activate(target);
      });

      const progress = root.getElementById("progress");
      progress.addEventListener("input", () => this._paintRange(progress));
      progress.addEventListener("change", () => this._seek(Number(progress.value)));

      const volume = root.getElementById("volume");
      volume.addEventListener("input", () => {
        this._paintRange(volume);
        root.getElementById("volume-value").textContent = `${Math.round(Number(volume.value))}%`;
      });
      volume.addEventListener("change", () => this._setVolume(Number(volume.value)));
    }

    _activate(target) {
      const action = target.dataset.action;
      if (action === "navigate") {
        history.pushState(null, "", target.dataset.path);
        window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: false } }));
      }
      else if (action === "play-pause") this._callMedia("media_play_pause");
      else if (action === "previous") this._callMedia("media_previous_track");
      else if (action === "next") this._callMedia("media_next_track");
      else if (action === "shuffle") this._toggleShuffle();
      else if (action === "repeat") this._cycleRepeat();
      else if (action === "mute") this._toggleMute();
      else if (action === "open-category") this._openCategory(target.dataset.category);
      else if (action === "close-browser") this._closeBrowser();
      else if (action === "browse-back") this._browseBack();
      else if (action === "browse-deeper") this._browseDeeper(Number(target.dataset.index));
      else if (action === "play-item") this._playBrowseItem(Number(target.dataset.index));
    }

    _queueUpdate() {
      if (this._updateQueued) return;
      this._updateQueued = true;
      requestAnimationFrame(() => {
        this._updateQueued = false;
        this._update();
      });
    }

    _update() {
      if (!this._rendered || !this._hass) return;
      const state = this._playerState();
      const attrs = state?.attributes || {};
      const features = Number(attrs.supported_features || 0);
      const playing = state?.state === "playing";
      const unavailable = !state || ["unknown", "unavailable"].includes(state.state);

      this.shadowRoot.getElementById("app").classList.toggle("daytime", this._hass.states["sun.sun"]?.state === "above_horizon");
      this.shadowRoot.getElementById("track-title").textContent = attrs.media_title || (unavailable ? "Music Unavailable" : "Ready to Play");
      this.shadowRoot.getElementById("track-artist").textContent = attrs.media_artist || attrs.media_album_name || (unavailable ? "Check the Parents player" : "Choose music from your library");
      this.shadowRoot.getElementById("play-icon").setAttribute("icon", playing ? "mdi:pause" : "mdi:play");
      this.shadowRoot.getElementById("play-pause").setAttribute("aria-label", playing ? "Pause" : "Play");

      const artwork = attrs.entity_picture_local || attrs.entity_picture || "";
      if (artwork !== this._lastArtwork) {
        this._lastArtwork = artwork;
        const image = this.shadowRoot.getElementById("album-art");
        image.classList.toggle("has-art", Boolean(artwork));
        image.src = artwork;
      }

      const setSupported = (id, mask) => {
        const el = this.shadowRoot.getElementById(id);
        const supported = Boolean(features & mask);
        el.disabled = !supported || unavailable;
        el.classList.toggle("unsupported", !supported);
      };
      setSupported("previous", FEATURES.previous);
      setSupported("next", FEATURES.next);
      setSupported("shuffle", FEATURES.shuffle);
      setSupported("repeat", FEATURES.repeat);
      setSupported("mute", FEATURES.mute);
      this.shadowRoot.getElementById("play-pause").disabled = unavailable || !(features & (FEATURES.play | FEATURES.pause));

      const shuffle = Boolean(attrs.shuffle);
      const repeat = attrs.repeat || "off";
      this.shadowRoot.getElementById("shuffle").classList.toggle("active", shuffle);
      this.shadowRoot.getElementById("repeat").classList.toggle("active", repeat !== "off");
      this.shadowRoot.getElementById("repeat-icon").setAttribute("icon", repeat === "one" ? "mdi:repeat-once" : "mdi:repeat");

      const muted = Boolean(attrs.is_volume_muted);
      const nativeVolume = this._hass.states[this._config.volume_entity];
      const nativeMin = Number(nativeVolume?.attributes?.min ?? 0);
      const nativeMax = Number(nativeVolume?.attributes?.max ?? 100);
      const nativeValue = Number(nativeVolume?.state);
      const nativeAvailable = Boolean(nativeVolume) && !["unknown", "unavailable"].includes(nativeVolume.state) && Number.isFinite(nativeValue) && nativeMax > nativeMin;
      const volumeLevel = nativeAvailable
        ? Math.max(0, Math.min(1, (nativeValue - nativeMin) / (nativeMax - nativeMin)))
        : Math.max(0, Math.min(1, Number(attrs.volume_level || 0)));
      const volume = this.shadowRoot.getElementById("volume");
      if (document.activeElement !== volume && this.shadowRoot.activeElement !== volume) volume.value = String(Math.round(volumeLevel * 100));
      volume.disabled = nativeAvailable ? false : unavailable || !(features & FEATURES.volumeSet);
      this._paintRange(volume);
      this.shadowRoot.getElementById("volume-value").textContent = `${Math.round(Number(volume.value))}%`;
      this.shadowRoot.getElementById("volume-icon").setAttribute("icon", muted || volumeLevel === 0 ? "mdi:volume-off" : volumeLevel < 0.45 ? "mdi:volume-medium" : "mdi:volume-high");
      this.shadowRoot.getElementById("mute").classList.toggle("active", muted);

      this._updateClock();
      this._updateProgress();
    }

    _playerState() {
      return this._hass?.states?.[this._config.entity];
    }

    _updateClock() {
      if (!this._hass || !this._rendered) return;
      const dateTime = this._hass.states["sensor.date_time"]?.state || "";
      const [datePart, timePart] = dateTime.split(", ");
      let date = new Date();
      if (datePart && timePart) {
        const parsed = new Date(`${datePart}T${timePart}:00`);
        if (!Number.isNaN(parsed.getTime())) date = parsed;
      }
      this.shadowRoot.getElementById("clock").textContent = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });
      this.shadowRoot.getElementById("date").textContent = date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
      const weather = this._hass.states[this._config.weather_entity];
      this.shadowRoot.getElementById("weather-icon").setAttribute("icon", WEATHER_ICONS[weather?.state] || "mdi:weather-cloudy");
      const temperature = Number(weather?.attributes?.temperature);
      this.shadowRoot.getElementById("temperature").textContent = Number.isFinite(temperature) ? `${Math.round(temperature)}°` : "--°";
    }

    _position() {
      const state = this._playerState();
      const attrs = state?.attributes || {};
      let position = Number(attrs.media_position || 0);
      if (state?.state === "playing" && attrs.media_position_updated_at) {
        position += Math.max(0, (Date.now() - Date.parse(attrs.media_position_updated_at)) / 1000);
      }
      const duration = Number(attrs.media_duration || 0);
      return { position: duration ? Math.min(position, duration) : position, duration };
    }

    _updateProgress() {
      if (!this._hass || !this._rendered) return;
      const { position, duration } = this._position();
      const slider = this.shadowRoot.getElementById("progress");
      if (this.shadowRoot.activeElement !== slider) {
        slider.max = String(Math.max(1, duration));
        slider.value = String(Math.max(0, position));
      }
      const features = Number(this._playerState()?.attributes?.supported_features || 0);
      slider.disabled = !duration || !(features & FEATURES.seek);
      this._paintRange(slider);
      this.shadowRoot.getElementById("elapsed").textContent = this._formatTime(position);
      this.shadowRoot.getElementById("duration").textContent = this._formatTime(duration);
    }

    _paintRange(input) {
      const min = Number(input.min || 0);
      const max = Number(input.max || 100);
      const value = Number(input.value || 0);
      const percentage = max > min ? ((value - min) / (max - min)) * 100 : 0;
      input.style.setProperty("--fill", `${Math.max(0, Math.min(100, percentage))}%`);
    }

    _formatTime(seconds) {
      if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
      const whole = Math.floor(seconds);
      const minutes = Math.floor(whole / 60);
      return `${minutes}:${String(whole % 60).padStart(2, "0")}`;
    }

    async _callMedia(service, data = {}) {
      if (!this._hass) return;
      try {
        await this._hass.callService("media_player", service, data, { entity_id: this._config.entity });
      } catch (error) {
        this._showError(`Unable to ${service.replaceAll("_", " ")}`, error);
      }
    }

    _seek(position) {
      if (Number.isFinite(position)) this._callMedia("media_seek", { seek_position: position });
    }

    async _setVolume(percent) {
      if (!Number.isFinite(percent) || !this._hass) return;
      const nativeVolume = this._hass.states[this._config.volume_entity];
      const nativeMin = Number(nativeVolume?.attributes?.min ?? 0);
      const nativeMax = Number(nativeVolume?.attributes?.max ?? 100);
      const nativeStep = Math.max(Number(nativeVolume?.attributes?.step ?? 1), Number.EPSILON);
      const nativeAvailable = Boolean(nativeVolume) && !["unknown", "unavailable"].includes(nativeVolume.state) && nativeMax > nativeMin;
      if (!nativeAvailable) {
        this._callMedia("volume_set", { volume_level: Math.max(0, Math.min(1, percent / 100)) });
        return;
      }
      const rawValue = nativeMin + (Math.max(0, Math.min(100, percent)) / 100) * (nativeMax - nativeMin);
      const value = Math.max(nativeMin, Math.min(nativeMax, Math.round((rawValue - nativeMin) / nativeStep) * nativeStep + nativeMin));
      try {
        await this._hass.callService("number", "set_value", { value }, { entity_id: this._config.volume_entity });
      } catch (error) {
        this._showError("Unable to set volume", error);
      }
    }

    _toggleMute() {
      const muted = Boolean(this._playerState()?.attributes?.is_volume_muted);
      this._callMedia("volume_mute", { is_volume_muted: !muted });
    }

    _toggleShuffle() {
      const shuffle = Boolean(this._playerState()?.attributes?.shuffle);
      this._callMedia("shuffle_set", { shuffle: !shuffle });
    }

    _cycleRepeat() {
      const current = this._playerState()?.attributes?.repeat || "off";
      const repeat = current === "off" ? "all" : current === "all" ? "one" : "off";
      this._callMedia("repeat_set", { repeat });
    }

    async _openCategory(category) {
      this._activeTab = category;
      this.shadowRoot.querySelectorAll(".browse-tab").forEach((button) => button.classList.toggle("active", button.dataset.category === category));
      this._browseStack = [];
      this.shadowRoot.getElementById("browser").hidden = false;
      if (category === "library") {
        this._browseCurrent = LIBRARY_ROOT;
        this._browseItems = LIBRARY_ROOT.children;
        this._renderBrowse();
      } else {
        await this._loadBrowse({ title: BROWSE_TABS.find(([key]) => key === category)?.[2] || "Browse", media_content_type: "music_assistant", media_content_id: category });
      }
    }

    async _loadBrowse(request) {
      this._setBrowseStatus("Loading…");
      this.shadowRoot.getElementById("browser-title").textContent = request.title || "Browse";
      try {
        const result = await this._hass.callWS({
          type: "media_player/browse_media",
          entity_id: this._config.entity,
          media_content_type: request.media_content_type || "music_assistant",
          media_content_id: request.media_content_id || "",
        });
        this._browseCurrent = result;
        this._browseItems = Array.isArray(result?.children) ? result.children : [];
        this._renderBrowse();
      } catch (error) {
        console.error("HOUSEVOICE music browse failed", error);
        this._browseCurrent = request;
        this._browseItems = [];
        this._setBrowseStatus("Unable to load this section. Check the connection and try again.", true);
      }
    }

    _renderBrowse() {
      const grid = this.shadowRoot.getElementById("browser-grid");
      const title = this._browseCurrent?.title || "Browse";
      this.shadowRoot.getElementById("browser-title").textContent = title;
      grid.replaceChildren();
      if (!this._browseItems.length) {
        this._setBrowseStatus("Nothing is available in this section.", true);
        return;
      }
      this._setBrowseStatus("");
      this._browseItems.forEach((item, index) => {
        const card = document.createElement("article");
        card.className = "media-item";
        const artwork = document.createElement("div");
        artwork.className = "media-artwork";
        const thumbnail = typeof item.thumbnail === "string" && (item.thumbnail.startsWith("https://") || item.thumbnail.startsWith("/")) ? item.thumbnail : "";
        if (thumbnail) {
          const image = document.createElement("img");
          image.alt = "";
          image.loading = "lazy";
          image.decoding = "async";
          image.src = thumbnail;
          artwork.append(image);
        }
        const fallback = document.createElement("ha-icon");
        fallback.setAttribute("icon", item.icon || this._mediaIcon(item.media_class));
        artwork.append(fallback);
        const name = document.createElement("div");
        name.className = "media-name";
        name.textContent = item.title || "Untitled";
        card.append(artwork, name);

        if (item.can_expand) {
          const open = document.createElement("button");
          open.className = "item-open";
          open.dataset.action = "browse-deeper";
          open.dataset.index = String(index);
          open.setAttribute("aria-label", `Open ${item.title || "item"}`);
          open.innerHTML = '<ha-icon icon="mdi:chevron-right"></ha-icon>';
          card.append(open);
        }
        if (item.can_play) {
          const play = document.createElement("button");
          play.className = "item-play";
          play.dataset.action = "play-item";
          play.dataset.index = String(index);
          play.setAttribute("aria-label", `Play ${item.title || "item"}`);
          play.innerHTML = '<ha-icon icon="mdi:play"></ha-icon>';
          card.append(play);
        }
        grid.append(card);
      });
    }

    _mediaIcon(mediaClass) {
      return ({ artist: "mdi:account-music", album: "mdi:album", playlist: "mdi:playlist-music", podcast: "mdi:podcast", track: "mdi:music-note", music: "mdi:radio-tower" })[mediaClass] || "mdi:music-box";
    }

    _setBrowseStatus(message, persistent = false) {
      const status = this.shadowRoot.getElementById("browser-status");
      status.textContent = message;
      status.hidden = !message;
      status.classList.toggle("persistent", persistent);
      if (message) this.shadowRoot.getElementById("browser-grid").replaceChildren();
    }

    async _browseDeeper(index) {
      const item = this._browseItems[index];
      if (!item?.can_expand) return;
      this._browseStack.push(this._browseCurrent);
      await this._loadBrowse(item);
    }

    async _playBrowseItem(index) {
      const item = this._browseItems[index];
      if (!item?.can_play || !item.media_content_id) return;
      try {
        await this._hass.callService("music_assistant", "play_media", {
          media_id: item.media_content_id,
          enqueue: "play",
        }, { entity_id: this._config.entity });
        this._showToast(`Playing ${item.title || "selection"}`);
        this._closeBrowser();
      } catch (error) {
        this._showError(`Unable to play ${item.title || "selection"}`, error);
      }
    }

    _browseBack() {
      if (!this._browseStack.length) {
        this._closeBrowser();
        return;
      }
      const previous = this._browseStack.pop();
      if (previous === LIBRARY_ROOT || previous?.media_content_id === "library") {
        this._browseCurrent = LIBRARY_ROOT;
        this._browseItems = LIBRARY_ROOT.children;
        this._renderBrowse();
      } else {
        this._loadBrowse(previous);
      }
    }

    _closeBrowser() {
      this.shadowRoot.getElementById("browser").hidden = true;
      this._browseStack = [];
    }

    _showError(message, error) {
      console.error(`HOUSEVOICE music panel: ${message}`, error);
      this._showToast(message, true);
    }

    _showToast(message, error = false) {
      const toast = this.shadowRoot.getElementById("toast");
      toast.textContent = message;
      toast.classList.toggle("error", error);
      toast.hidden = false;
      window.clearTimeout(this._toastTimer);
      this._toastTimer = window.setTimeout(() => { toast.hidden = true; }, 3500);
    }

    _styles() {
      return `
        :host { position: fixed; inset: 0; display: block; width: 100vw; height: 100dvh; overflow: hidden; }
        * { box-sizing: border-box; }
        button, input { font: inherit; }
        button { -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
        .music-app { --gold: #f4c35f; --gold-bright: #ffd579; --navy: rgba(3, 19, 32, .89); --line: rgba(132, 169, 190, .38); position: fixed; inset: 0; width: 100vw; height: 100dvh; overflow: hidden; color: #fff; font-family: Georgia, "Times New Roman", serif; background: url('/local/housevoice/banff-music-control-panel-background.png') center center / cover no-repeat; }
        .scene-shade { position: absolute; inset: 0; pointer-events: none; background: linear-gradient(90deg, rgba(0, 10, 20, .35), rgba(0, 13, 24, .05) 45%, rgba(0, 10, 20, .22)), linear-gradient(180deg, rgba(2, 13, 24, .16), rgba(1, 12, 22, .04) 55%, rgba(1, 11, 20, .18)); }
        .music-app:not(.daytime) .scene-shade { background: linear-gradient(90deg, rgba(0, 8, 18, .48), rgba(0, 10, 20, .18) 45%, rgba(0, 8, 18, .36)), linear-gradient(180deg, rgba(0, 7, 17, .28), rgba(0, 8, 18, .12) 55%, rgba(0, 7, 17, .30)); }
        .glass-panel { border: 1px solid var(--line); background: linear-gradient(145deg, rgba(4, 22, 36, .90), rgba(2, 15, 27, .86)); box-shadow: 0 9px 24px rgba(0, 0, 0, .30), inset 0 1px 0 rgba(255, 255, 255, .055); backdrop-filter: blur(10px); }
        .top-header { position: absolute; z-index: 2; left: 14px; right: 17px; top: 8px; height: 72px; display: grid; grid-template-columns: 160px 1fr 248px; align-items: center; }
        .brand { display: flex; flex-direction: column; align-items: center; justify-content: center; width: 142px; height: 68px; font-family: Inter, sans-serif; font-size: 16px; font-weight: 700; letter-spacing: 2.2px; text-shadow: 0 2px 8px #000; }
        .brand img { width: 96px; height: 48px; object-fit: contain; filter: brightness(0) saturate(100%) invert(79%) sepia(50%) saturate(900%) hue-rotate(353deg) brightness(102%) contrast(97%); }
        .brand span { margin-top: -5px; }
        .page-title { justify-self: center; display: flex; align-items: center; gap: 18px; margin-left: 20px; font-size: clamp(43px, 6vw, 61px); line-height: 1; text-shadow: 0 3px 15px rgba(0, 0, 0, .55); }
        .page-title ha-icon { color: var(--gold); --mdc-icon-size: clamp(51px, 6.5vw, 67px); filter: drop-shadow(0 3px 8px rgba(0,0,0,.35)); }
        .status-block { justify-self: end; display: grid; grid-template-columns: 145px 96px; align-items: center; height: 61px; }
        .clock { display: flex; flex-direction: column; align-items: flex-end; padding-right: 17px; border-right: 1px solid rgba(255,255,255,.38); text-shadow: 0 2px 8px #000; }
        .clock strong { font-size: 26px; font-weight: 500; line-height: 1.05; white-space: nowrap; }
        .clock span { margin-top: 5px; font-size: 16px; }
        .weather { display: flex; align-items: center; justify-content: flex-end; gap: 8px; text-shadow: 0 2px 8px #000; }
        .weather ha-icon { --mdc-icon-size: 35px; }
        .weather strong { font-size: 27px; font-weight: 500; }
        .side-nav { position: absolute; z-index: 3; left: 11px; top: 86px; bottom: 18px; width: 148px; display: grid; grid-template-rows: repeat(6, 1fr); gap: 7px; }
        .nav-button { width: 100%; min-width: 0; min-height: 0; display: grid; grid-template-columns: 41px minmax(0, 1fr); align-items: center; overflow: hidden; padding: 0 6px; border: 1px solid rgba(117, 153, 177, .36); border-radius: 16px; color: #fff; background: linear-gradient(145deg, rgba(4, 23, 37, .91), rgba(2, 16, 29, .87)); box-shadow: 0 5px 14px rgba(0,0,0,.24), inset 0 1px 0 rgba(255,255,255,.045); cursor: pointer; }
        .nav-button:active { transform: scale(.97); background: rgba(24, 43, 56, .94); }
        .nav-button ha-icon { color: var(--gold); --mdc-icon-size: 33px; justify-self: center; }
        .nav-button span { min-width: 0; overflow: hidden; font-size: 17px; text-align: left; white-space: nowrap; text-overflow: ellipsis; }
        .player-panel { position: absolute; z-index: 2; left: 170px; right: 17px; top: 86px; height: 320px; border-radius: 25px; padding: 18px; display: grid; grid-template-columns: 242px minmax(0, 1fr); gap: 30px; }
        .album-wrap { position: relative; width: 242px; height: 282px; overflow: hidden; border: 1px solid rgba(244,195,95,.48); border-radius: 20px; background: linear-gradient(160deg, #547fa8, #133a54 52%, #082539); box-shadow: 0 8px 18px rgba(0,0,0,.30); }
        .album-wrap img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0; transition: opacity .25s; }
        .album-wrap img.has-art { opacity: 1; }
        .album-fallback { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 18px; color: rgba(255,255,255,.88); letter-spacing: 5px; font-family: Inter, sans-serif; font-size: 14px; background: radial-gradient(circle at 50% 30%, rgba(113,170,213,.42), transparent 52%), linear-gradient(165deg, rgba(76,128,167,.9), rgba(8,43,65,.98)); }
        .album-fallback ha-icon { color: var(--gold); --mdc-icon-size: 82px; }
        .player-copy { min-width: 0; display: flex; flex-direction: column; padding: 11px 16px 4px 0; }
        .kicker { color: var(--gold-bright); font-family: Inter, sans-serif; font-size: 15px; font-weight: 700; letter-spacing: 5px; }
        .track-title { margin-top: 11px; max-width: 100%; overflow: hidden; color: #fff; font-size: clamp(33px, 4.3vw, 46px); line-height: 1.05; white-space: nowrap; text-overflow: ellipsis; text-shadow: 0 2px 10px rgba(0,0,0,.4); }
        .track-artist { margin-top: 11px; max-width: 100%; overflow: hidden; color: rgba(255,255,255,.92); font-size: clamp(20px, 2.7vw, 29px); font-style: italic; white-space: nowrap; text-overflow: ellipsis; }
        .progress-wrap { margin-top: auto; }
        .gold-range { --fill: 0%; width: 100%; height: 26px; margin: 0; appearance: none; -webkit-appearance: none; background: transparent; cursor: pointer; touch-action: none; }
        .gold-range::-webkit-slider-runnable-track { height: 8px; border-radius: 999px; background: linear-gradient(90deg, var(--gold) 0 var(--fill), rgba(118,146,161,.46) var(--fill) 100%); }
        .gold-range::-webkit-slider-thumb { width: 25px; height: 25px; margin-top: -8.5px; border: 2px solid #e6a82f; border-radius: 50%; appearance: none; -webkit-appearance: none; background: #fff; box-shadow: 0 2px 8px rgba(0,0,0,.32); }
        .gold-range:disabled { cursor: default; opacity: .62; }
        .gold-range:disabled::-webkit-slider-thumb { display: none; }
        .time-row { display: flex; justify-content: space-between; margin-top: -2px; font-size: 17px; font-variant-numeric: tabular-nums; }
        .transport { display: flex; align-items: center; justify-content: center; gap: clamp(15px, 2.6vw, 28px); margin-top: 5px; }
        .round-control { width: 54px; height: 54px; display: grid; place-items: center; border: 1px solid rgba(135,169,190,.34); border-radius: 50%; color: #fff; background: linear-gradient(145deg, rgba(18,41,57,.96), rgba(6,26,40,.94)); box-shadow: inset 0 1px 1px rgba(255,255,255,.08), 0 5px 13px rgba(0,0,0,.25); cursor: pointer; }
        .round-control ha-icon { --mdc-icon-size: 34px; }
        .round-control.small { width: 48px; height: 48px; }
        .round-control.small ha-icon { --mdc-icon-size: 29px; }
        .round-control.play-control { width: 76px; height: 76px; border: 3px solid var(--gold-bright); }
        .round-control.play-control ha-icon { --mdc-icon-size: 47px; }
        .round-control.active { color: #071725; border-color: var(--gold); background: var(--gold); }
        .round-control:active:not(:disabled) { transform: scale(.94); }
        .round-control:disabled { opacity: .32; cursor: default; }
        .round-control.unsupported { visibility: hidden; }
        .browse-tabs { position: absolute; z-index: 2; left: 170px; right: 17px; top: 414px; height: 66px; border-radius: 21px; padding: 0 10px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; align-items: center; }
        .browse-tab { height: 52px; display: flex; align-items: center; justify-content: center; gap: 13px; border: 1px solid rgba(117,153,177,.38); border-radius: 16px; color: #fff; background: linear-gradient(145deg, rgba(18,39,53,.88), rgba(5,25,39,.86)); cursor: pointer; font-size: 20px; }
        .browse-tab ha-icon { --mdc-icon-size: 31px; }
        .browse-tab.active { color: #071624; border-color: #f4c35f; background: linear-gradient(135deg, #ffdc86, #e9ae3f); box-shadow: 0 4px 12px rgba(0,0,0,.22); }
        .browse-tab:active { transform: scale(.98); }
        .volume-panel { position: absolute; z-index: 2; left: 170px; right: 17px; top: 489px; height: 72px; border-radius: 22px; display: grid; grid-template-columns: 55px 110px minmax(120px, 1fr) 86px; align-items: center; gap: 8px; padding: 0 24px; }
        .mute-button { width: 48px; height: 48px; display: grid; place-items: center; border: 0; border-radius: 50%; color: #fff; background: transparent; cursor: pointer; }
        .mute-button ha-icon { --mdc-icon-size: 37px; }
        .mute-button.active { color: var(--gold); background: rgba(244,195,95,.13); }
        .volume-label { font-size: 25px; }
        .volume-panel strong { justify-self: end; font-size: 31px; font-weight: 500; font-variant-numeric: tabular-nums; }
        .browser-overlay { position: absolute; z-index: 30; left: 170px; right: 17px; top: 86px; bottom: 18px; border-radius: 25px; overflow: hidden; background: linear-gradient(145deg, rgba(3,22,36,.98), rgba(1,14,26,.98)); }
        .browser-overlay[hidden] { display: none; }
        .browser-header { height: 68px; display: grid; grid-template-columns: 55px 1fr 55px; align-items: center; padding: 0 17px; border-bottom: 1px solid rgba(126,160,181,.28); }
        .browser-header > div { min-width: 0; }
        .browser-header span { color: var(--gold); font-family: Inter, sans-serif; font-size: 10px; font-weight: 700; letter-spacing: 3px; }
        .browser-header h2 { margin: 1px 0 0; overflow: hidden; font-size: 29px; font-weight: 500; line-height: 1; white-space: nowrap; text-overflow: ellipsis; }
        .browser-icon { width: 45px; height: 45px; display: grid; place-items: center; border: 1px solid rgba(130,165,188,.32); border-radius: 50%; color: #fff; background: rgba(17,41,58,.78); cursor: pointer; }
        .browser-icon ha-icon { --mdc-icon-size: 27px; }
        .browser-status { position: absolute; inset: 68px 0 0; display: grid; place-items: center; padding: 30px; color: rgba(255,255,255,.82); font-size: 20px; text-align: center; }
        .browser-status[hidden] { display: none; }
        .browser-grid { position: absolute; inset: 68px 0 0; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); grid-auto-rows: 139px; gap: 12px; padding: 14px 17px 20px; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; scrollbar-color: var(--gold) rgba(255,255,255,.08); }
        .media-item { position: relative; min-width: 0; overflow: hidden; border: 1px solid rgba(116,153,177,.33); border-radius: 16px; background: linear-gradient(145deg, rgba(18,42,58,.92), rgba(6,25,39,.94)); box-shadow: 0 5px 13px rgba(0,0,0,.22); }
        .media-artwork { position: absolute; inset: 0; overflow: hidden; background: radial-gradient(circle at 50% 36%, rgba(52,104,136,.72), rgba(5,27,42,.95)); }
        .media-artwork img { position: absolute; inset: 0; z-index: 2; width: 100%; height: 100%; object-fit: cover; }
        .media-artwork > ha-icon { position: absolute; left: 50%; top: 43%; transform: translate(-50%,-50%); color: var(--gold); --mdc-icon-size: 55px; }
        .media-name { position: absolute; z-index: 4; left: 0; right: 0; bottom: 0; min-height: 43px; display: flex; align-items: flex-end; padding: 20px 48px 8px 10px; overflow: hidden; color: #fff; font-family: Inter, sans-serif; font-size: 13px; font-weight: 600; line-height: 1.18; text-shadow: 0 2px 5px #000; background: linear-gradient(transparent, rgba(0,9,17,.92)); }
        .item-open, .item-play { position: absolute; z-index: 6; right: 8px; width: 37px; height: 37px; display: grid; place-items: center; border: 1px solid rgba(255,255,255,.34); border-radius: 50%; color: #071624; background: var(--gold-bright); cursor: pointer; }
        .item-open { top: 8px; }
        .item-play { bottom: 8px; }
        .item-open ha-icon, .item-play ha-icon { --mdc-icon-size: 24px; }
        .toast { position: absolute; z-index: 50; left: 50%; bottom: 27px; transform: translateX(-50%); max-width: 70vw; padding: 12px 22px; border: 1px solid rgba(244,195,95,.72); border-radius: 18px; color: #fff; background: rgba(3,20,33,.96); box-shadow: 0 8px 24px rgba(0,0,0,.36); font-family: Inter, sans-serif; font-size: 15px; text-align: center; }
        .toast[hidden] { display: none; }
        .toast.error { border-color: #ff716c; }
        @media (max-width: 820px), (max-height: 530px) {
          .top-header { grid-template-columns: 132px 1fr 215px; height: 64px; }
          .brand { width: 126px; transform: scale(.88); transform-origin: left center; }
          .side-nav { top: 74px; width: 130px; }
          .nav-button { grid-template-columns: 42px 1fr; padding: 0 7px; }
          .nav-button ha-icon { --mdc-icon-size: 30px; }
          .nav-button span { font-size: 18px; }
          .player-panel, .browse-tabs, .volume-panel, .browser-overlay { left: 150px; }
          .player-panel { top: 74px; height: 286px; grid-template-columns: 205px 1fr; gap: 22px; padding: 15px; }
          .album-wrap { width: 205px; height: 254px; }
          .browse-tabs { top: 367px; }
          .volume-panel { top: 441px; }
          .browser-overlay { top: 74px; }
        }
      `;
    }
  }

  if (!customElements.get(CARD_TAG)) customElements.define(CARD_TAG, HouseVoiceMusicPanel);
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: CARD_TAG,
    name: "HOUSEVOICE Music Panel",
    description: "Parents Echo Music Assistant control panel",
  });
})();
