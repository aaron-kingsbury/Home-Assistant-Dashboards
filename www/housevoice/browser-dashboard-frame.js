class HouseVoiceBrowserDashboardFrame extends HTMLElement {
  setConfig(config) {
    if (!config.url) {
      throw new Error("A dashboard URL is required.");
    }

    this._config = {
      title: config.title || "HouseVoice dashboard",
      url: config.url,
      virtualHeight: Number(config.virtual_height) || 601,
      virtualWidth: Number(config.virtual_width) || 961,
    };

    if (!this.shadowRoot) {
      this.attachShadow({ mode: "open" });
    }

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          width: 100%;
          height: calc(100dvh - var(--header-height, 56px));
          min-height: 280px;
          overflow: hidden;
          background: var(--primary-background-color);
        }

        .stage {
          position: relative;
          width: 100%;
          height: 100%;
          overflow: hidden;
          background: var(--primary-background-color);
        }

        iframe {
          position: absolute;
          margin: 0;
          border: 0;
          transform-origin: top left;
          background: #000;
        }
      </style>
      <div class="stage">
        <iframe
          title="${this._escapeHtml(this._config.title)}"
          src="${this._escapeHtml(this._config.url)}"
          loading="eager"
          allow="autoplay; fullscreen"
        ></iframe>
      </div>
    `;

    this._stage = this.shadowRoot.querySelector(".stage");
    this._iframe = this.shadowRoot.querySelector("iframe");
    this._iframe.style.width = `${this._config.virtualWidth}px`;
    this._iframe.style.height = `${this._config.virtualHeight}px`;
    this._scheduleLayout();
  }

  connectedCallback() {
    this._resizeObserver = new ResizeObserver(() => this._scheduleLayout());
    this._resizeObserver.observe(this);
    window.addEventListener("resize", this._boundLayout);
    this._scheduleLayout();
  }

  disconnectedCallback() {
    this._resizeObserver?.disconnect();
    window.removeEventListener("resize", this._boundLayout);
    cancelAnimationFrame(this._layoutFrame);
  }

  getCardSize() {
    return 12;
  }

  _boundLayout = () => this._scheduleLayout();

  _scheduleLayout() {
    cancelAnimationFrame(this._layoutFrame);
    this._layoutFrame = requestAnimationFrame(() => this._layout());
  }

  _layout() {
    if (!this._stage || !this._iframe || !this._config) {
      return;
    }

    const availableWidth = this._stage.clientWidth;
    const availableHeight = this._stage.clientHeight;

    if (!availableWidth || !availableHeight) {
      return;
    }

    const scale = Math.min(
      availableWidth / this._config.virtualWidth,
      availableHeight / this._config.virtualHeight,
    );
    const scaledWidth = this._config.virtualWidth * scale;
    const scaledHeight = this._config.virtualHeight * scale;

    this._iframe.style.left = `${Math.max(0, (availableWidth - scaledWidth) / 2)}px`;
    this._iframe.style.top = `${Math.max(0, (availableHeight - scaledHeight) / 2)}px`;
    this._iframe.style.transform = `scale(${scale})`;
  }

  _escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll('"', "&quot;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }
}

if (!customElements.get("housevoice-browser-dashboard-frame")) {
  customElements.define(
    "housevoice-browser-dashboard-frame",
    HouseVoiceBrowserDashboardFrame,
  );
}

window.customCards = window.customCards || [];
window.customCards.push({
  type: "housevoice-browser-dashboard-frame",
  name: "HouseVoice Browser Dashboard Frame",
  description: "Scales a dedicated HouseVoice dashboard inside the HA content area.",
});
