const HOUSEVOICE_WALKIE_ROOMS = {
  graham: {
    name: "Graham",
    assist: "assist_satellite.vaca_96ed4d2c4",
    media_player: "media_player.vaca_96ed4d2c4_media_player",
    home_path: "/kids-rooms/graham",
    walkie_path: "/kids-rooms/graham",
    peer_id: "graham",
    enabled: true,
  },
  cora: {
    name: "Cora",
    assist: "assist_satellite.vaca_c958413a0",
    media_player: "media_player.cora_s_room_display_media_player",
    home_path: "/kids-rooms/home",
    walkie_path: "/kids-rooms/home",
    peer_id: "cora",
    enabled: true,
  },
  room3: {
    name: "Room 3",
    assist: null,
    media_player: null,
    home_path: null,
    walkie_path: null,
    peer_id: "room3",
    enabled: false,
  },
  room4: {
    name: "Room 4",
    assist: null,
    media_player: null,
    home_path: null,
    walkie_path: null,
    peer_id: "room4",
    enabled: false,
  },
};

class HouseVoiceWalkie extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._roomId = null;
    this._alwaysVisible = false;
    this._hass = null;
    this._unsubscribe = null;
    this._peer = null;
    this._localStream = null;
    this._pendingCandidates = [];
    this._pendingOffer = null;
    this._call = null;
    this._muted = false;
    this._error = null;
  }

  setConfig(config) {
    const configuredRoom = config?.room_id || config?.room;
    this._roomId = HOUSEVOICE_WALKIE_ROOMS[configuredRoom]
      ? configuredRoom
      : window.location.pathname.includes("graham")
        ? "graham"
        : "cora";
    this._alwaysVisible = config?.always_visible !== false;
    this._render();
    if (this._hass) this._diagnose("room_detected", `room_id=${this._roomId}`);
  }

  getCardSize() {
    return 1;
  }

  set hass(value) {
    this._hass = value;
    this._subscribe();
  }

  get hass() {
    return this._hass;
  }

  disconnectedCallback() {
    this._unsubscribe?.();
    this._unsubscribe = null;
    this._cleanup(false);
  }

  async _subscribe() {
    if (this._unsubscribe || !this._hass?.connection) return;
    this._diagnose("component_loaded", `room_id=${this._roomId}`);
    this._unsubscribe = await this._hass.connection.subscribeEvents(
      (event) => this._receive(event.data),
      "housevoice_walkie_signal",
    );
  }

  _diagnose(stage, detail = "") {
    if (!this._roomId) return;
    console.log(`[HouseVoice Walkie] ${this._roomId} ${stage}`, detail);
    this._hass?.callService("housevoice_walkie", "client_log", {
      room_id: this._roomId,
      stage,
      detail,
    }).catch((error) => console.error("[HouseVoice Walkie] diagnostic failed", error));
  }

  _send(data) {
    if (!this._hass) return;
    this._hass.callService("event", "fire", {
      event_type: "housevoice_walkie_request",
      event_data: {
        ...data,
        from: this._roomId,
      },
    });
  }

  _receive(message) {
    if (!message || message.to !== this._roomId || message.from === this._roomId) return;
    if (message.kind === "offer") {
      this._diagnose("incoming_call_detected", `from=${message.from}`);
      this._receiveOffer(message);
    }
    if (message.kind === "start") {
      this._diagnose("outgoing_call_detected", `to=${message.from}`);
      this._startOutgoing(message.from, message.call_id);
    }
    if (message.kind === "answer") this._receiveAnswer(message);
    if (message.kind === "candidate") this._receiveCandidate(message);
    if (message.kind === "decline" || message.kind === "end") {
      this._diagnose("end", `kind=${message.kind}`);
      if (this._call?.id === message.call_id) this._cleanup(false);
    }
  }

  async _receiveOffer(message) {
    if (this._call) {
      this._send({ kind: "decline", call_id: message.call_id, to: message.from });
      return;
    }
    this._pendingOffer = message;
    this._call = {
      id: message.call_id,
      from: message.from,
      to: this._roomId,
      state: "incoming",
    };
    this._render();
  }

  async _receiveAnswer(message) {
    if (this._call?.id !== message.call_id || !this._peer) return;
    this._diagnose("answer_received");
    await this._peer.setRemoteDescription(message.description);
    await this._flushCandidates();
  }

  async _receiveCandidate(message) {
    if (this._call?.id !== message.call_id) return;
    if (!this._peer || !this._peer.remoteDescription) {
      this._pendingCandidates.push(message.candidate);
      return;
    }
    await this._peer.addIceCandidate(message.candidate);
  }

  async _flushCandidates() {
    for (const candidate of this._pendingCandidates.splice(0)) {
      await this._peer.addIceCandidate(candidate);
    }
  }

  async _makePeer(call, initiator) {
    this._peer = new RTCPeerConnection({ iceServers: [] });
    this._peer.onicecandidate = ({ candidate }) => {
      if (candidate) {
        this._send({
          kind: "candidate",
          call_id: call.id,
          to: call.from === this._roomId ? call.to : call.from,
          candidate,
        });
      }
    };
    this._peer.oniceconnectionstatechange = () => this._diagnose("ice_state", this._peer.iceConnectionState);
    this._peer.ontrack = ({ streams }) => {
      const audio = this.shadowRoot.querySelector("audio");
      if (audio && streams[0]) audio.srcObject = streams[0];
    };
    this._peer.onconnectionstatechange = () => {
      this._diagnose("peer_connection_state", this._peer.connectionState);
      if (["failed", "disconnected", "closed"].includes(this._peer.connectionState)) {
        this._cleanup(false);
      } else if (this._peer.connectionState === "connected" && this._call) {
        this._call.state = "connected";
        this._render();
      }
    };

    this._diagnose("microphone_request", `secure=${window.isSecureContext} mediaDevices=${Boolean(navigator.mediaDevices)} getUserMedia=${Boolean(navigator.mediaDevices?.getUserMedia)}`);
    this._localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this._diagnose("microphone_granted");
    for (const track of this._localStream.getTracks()) {
      this._peer.addTrack(track, this._localStream);
    }
    if (initiator) {
      const offer = await this._peer.createOffer();
      await this._peer.setLocalDescription(offer);
      this._diagnose("offer_created");
      this._send({
        kind: "offer",
        call_id: call.id,
        to: call.to,
        description: this._peer.localDescription,
      });
    }
  }

  async _callRoom(roomId, callId = crypto.randomUUID()) {
    if (this._call) return;
    this._error = null;
    this._call = { id: callId, from: this._roomId, to: roomId, state: "calling" };
    this._render();
    try {
      await this._makePeer(this._call, true);
    } catch (error) {
      this._error = error.message;
      this._diagnose("error", `${error.name}: ${error.message}`);
      this._call.state = "error";
      this._render();
    }
  }

  async _startOutgoing(roomId, callId) {
    if (!this._call) await this._callRoom(roomId, callId);
  }

  async _answer() {
    if (!this._pendingOffer || !this._call) return;
    this._error = null;
    const offer = this._pendingOffer;
    this._pendingOffer = null;
    this._call.state = "answering";
    this._diagnose("answer");
    this._render();
    try {
      await this._makePeer(this._call, false);
      await this._peer.setRemoteDescription(offer.description);
      await this._flushCandidates();
      const answer = await this._peer.createAnswer();
      await this._peer.setLocalDescription(answer);
      this._diagnose("answer_created");
      this._send({
        kind: "answer",
        call_id: this._call.id,
        to: this._call.from,
        description: this._peer.localDescription,
      });
    } catch (error) {
      this._error = error.message;
      this._diagnose("error", `${error.name}: ${error.message}`);
      this._call.state = "error";
      this._render();
    }
  }

  _decline() {
    if (this._pendingOffer && this._call) {
      this._send({ kind: "decline", call_id: this._call.id, to: this._call.from });
    }
    this._cleanup(false);
  }

  _end() {
    if (this._call) {
      this._send({
        kind: "end",
        call_id: this._call.id,
        to: this._call.from === this._roomId ? this._call.to : this._call.from,
      });
    }
    this._cleanup(false);
  }

  _toggleMute() {
    this._muted = !this._muted;
    this._localStream?.getAudioTracks().forEach((track) => {
      track.enabled = !this._muted;
    });
    this._render();
  }

  _cleanup(publishEnd) {
    if (publishEnd && this._call) {
      this._send({ kind: "end", call_id: this._call.id, to: this._call.from === this._roomId ? this._call.to : this._call.from });
    }
    this._peer?.close();
    this._localStream?.getTracks().forEach((track) => track.stop());
    const audio = this.shadowRoot.querySelector("audio");
    if (audio) audio.srcObject = null;
    this._peer = null;
    this._localStream = null;
    this._pendingCandidates = [];
    this._pendingOffer = null;
    this._call = null;
    this._muted = false;
    this._render();
  }

  _render() {
    if (!this.shadowRoot || !this._roomId) return;
    const room = HOUSEVOICE_WALKIE_ROOMS[this._roomId];
    const call = this._call;
    this.toggleAttribute("active", Boolean(call));
    this.toggleAttribute("visible", this._alwaysVisible || Boolean(call));
    const target = call && HOUSEVOICE_WALKIE_ROOMS[call.from === this._roomId ? call.to : call.from];
    const buttons = Object.entries(HOUSEVOICE_WALKIE_ROOMS)
      .filter(([id, item]) => id !== this._roomId && item.enabled)
      .map(([id, item]) => `<button data-call="${id}">CALL ${item.name.toUpperCase()}<small>${item.name}'s Room</small></button>`)
      .join("");
    let panel = `<section class="idle"><strong>WALKIE</strong>${buttons}</section>`;
    if (call) {
      const label = target?.name || "Room";
      if (call.state === "incoming") {
        panel = `<section><div class="eyebrow">INCOMING WALKIE</div><h2>${label}</h2><p>${label} is calling ${room.name}'s Room</p><div class="actions"><button data-answer>ANSWER</button><button class="secondary" data-decline>DECLINE</button></div></section>`;
      } else {
        const state = call.state === "connected" ? "CONNECTED" : call.state === "error" ? "ERROR" : "CALLING";
        panel = `<section><div class="eyebrow">${state}</div><h2>${label}</h2><p>${this._error || (call.state === "connected" ? "Two-way audio is live" : "Waiting for an answer")}</p><div class="actions">${call.state === "connected" ? `<button data-mute>${this._muted ? "UNMUTE" : "MUTE"}</button>` : ""}<button class="secondary" data-end>END CALL</button></div></section>`;
      }
    }
    this.shadowRoot.innerHTML = `<style>
      :host { display: block; width: 1px; height: 1px; overflow: hidden; opacity: 0; pointer-events: none; position: fixed; inset: 0; z-index: 9999; font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      :host([visible]) { width: auto; height: auto; overflow: visible; opacity: 1; pointer-events: auto; }
      .idle { display: flex; gap: 8px; }
      section { min-width: 280px; padding: 26px; color: #f4f8ff; background: linear-gradient(145deg, rgba(6, 23, 48, .98), rgba(11, 5, 28, .98)); border: 1px solid #28658e; border-radius: 20px; box-shadow: 0 18px 70px rgba(0, 0, 0, .6); }
      :host([active]) section { position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(430px, calc(100vw - 40px)); box-sizing: border-box; text-align: center; }
      button { display: block; width: 100%; min-height: 52px; margin-top: 10px; padding: 10px 16px; border: 1px solid #2ea8ff; border-radius: 12px; background: rgba(12, 72, 130, .65); color: #f4f8ff; font-size: 15px; font-weight: 700; letter-spacing: .8px; cursor: pointer; }
      .idle button { width: 190px; margin-top: 0; }
      button small { display: block; margin-top: 3px; color: #8fcfff; font-size: 11px; font-weight: 400; letter-spacing: 0; }
      button.secondary { border-color: #9c65d6; background: rgba(55, 25, 78, .7); }
      .eyebrow { color: #00e9ad; font-size: 12px; letter-spacing: 2px; }
      h2 { margin: 10px 0 4px; font-size: 30px; }
      p { margin: 0 0 16px; color: rgba(217, 237, 255, .75); }
      .actions { display: flex; gap: 10px; }
      .actions button { flex: 1; }
      audio { display: none; }
    </style>${panel}<audio autoplay playsinline></audio>`;
    this.shadowRoot.querySelectorAll("[data-call]").forEach((button) => {
      button.onclick = () => this._callRoom(button.dataset.call);
    });
    this.shadowRoot.querySelector("[data-answer]")?.addEventListener("click", () => this._answer());
    this.shadowRoot.querySelector("[data-decline]")?.addEventListener("click", () => this._decline());
    this.shadowRoot.querySelector("[data-end]")?.addEventListener("click", () => this._end());
    this.shadowRoot.querySelector("[data-mute]")?.addEventListener("click", () => this._toggleMute());
  }
}

if (!customElements.get("housevoice-walkie")) {
  customElements.define("housevoice-walkie", HouseVoiceWalkie);
}

window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === "housevoice-walkie")) {
  window.customCards.push({
    type: "housevoice-walkie",
    name: "HouseVoice Walkie",
    description: "Local HouseVoice room-to-room audio intercom",
    preview: false,
  });
}
