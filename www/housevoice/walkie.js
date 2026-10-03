const HOUSEVOICE_WALKIE_ROOMS = {
  graham: {
    name: "Graham",
    assist: "assist_satellite.vaca_96ed4d2c4",
    media_player: "media_player.vaca_96ed4d2c4_media_player",
    home_path: "/kids-rooms/grahams-room",
    walkie_path: "/kids-rooms/grahams-room",
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

const HOUSEVOICE_WALKIE_OWNERS = new Map();
const HOUSEVOICE_WALKIE_SEEN_SIGNALS = new Map();
const HOUSEVOICE_WALKIE_SEEN_SIGNAL_LIMIT = 128;

class HouseVoiceWalkie extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._roomId = null;
    this._alwaysVisible = false;
    this._hass = null;
    this._unsubscribe = null;
    this._subscribePromise = null;
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

  connectedCallback() {
    if (this._hass) this._subscribe();
  }

  disconnectedCallback() {
    this._unsubscribe?.();
    this._unsubscribe = null;
    this._cleanup(false);
  }

  async _subscribe() {
    if (this._unsubscribe || this._subscribePromise || !this._hass?.connection) return;
    const connection = this._hass.connection;
    this._diagnose("component_loaded", `room_id=${this._roomId}`);
    const subscribePromise = connection.subscribeEvents(
      (event) => this._receive(event),
      "housevoice_walkie_signal",
    );
    this._subscribePromise = subscribePromise;
    try {
      const unsubscribe = await subscribePromise;
      if (!this.isConnected || this._hass?.connection !== connection) {
        unsubscribe();
        return;
      }
      this._unsubscribe = unsubscribe;
    } catch (error) {
      console.error("[HouseVoice Walkie] signaling subscription failed", error);
    } finally {
      if (this._subscribePromise === subscribePromise) this._subscribePromise = null;
    }
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
    if (!this._hass?.connection) {
      console.error("[HouseVoice Walkie] signaling unavailable");
      return;
    }
    this._hass.connection.sendMessagePromise({
      type: "fire_event",
      event_type: "housevoice_walkie_request",
      event_data: {
        ...data,
        from: this._roomId,
      },
    }).catch((error) => {
      console.error("[HouseVoice Walkie] signaling send failed", error);
    });
  }

  _claimRoomOwnership() {
    if (!this._roomId) return false;
    const owner = HOUSEVOICE_WALKIE_OWNERS.get(this._roomId);
    if (owner === this) return true;
    if (owner?.isConnected) return false;
    HOUSEVOICE_WALKIE_OWNERS.set(this._roomId, this);
    return true;
  }

  _claimSignalOwnership(message) {
    const owner = HOUSEVOICE_WALKIE_OWNERS.get(this._roomId);
    if (owner === this) return true;
    if (owner?.isConnected) return false;
    if (!["offer", "start"].includes(message.kind)) return false;
    HOUSEVOICE_WALKIE_OWNERS.set(this._roomId, this);
    return true;
  }

  _ownsRoom() {
    return HOUSEVOICE_WALKIE_OWNERS.get(this._roomId) === this;
  }

  _signalKey(event, message) {
    if (event?.context?.id) return `context:${event.context.id}`;
    return `payload:${event?.time_fired || ""}:${JSON.stringify(message)}`;
  }

  _hasSeenSignal(key) {
    return HOUSEVOICE_WALKIE_SEEN_SIGNALS.get(this._roomId)?.keys.has(key) === true;
  }

  _rememberSignal(key) {
    let seen = HOUSEVOICE_WALKIE_SEEN_SIGNALS.get(this._roomId);
    if (!seen) {
      seen = { keys: new Set(), order: [] };
      HOUSEVOICE_WALKIE_SEEN_SIGNALS.set(this._roomId, seen);
    }
    if (seen.keys.has(key)) return;
    seen.keys.add(key);
    seen.order.push(key);
    while (seen.order.length > HOUSEVOICE_WALKIE_SEEN_SIGNAL_LIMIT) {
      seen.keys.delete(seen.order.shift());
    }
  }

  _isCurrentCall(call, peer = null) {
    return Boolean(
      call &&
      this._call === call &&
      this._ownsRoom() &&
      (!peer || this._peer === peer),
    );
  }

  _discardPeer(peer, localStream = null) {
    localStream?.getTracks().forEach((track) => track.stop());
    if (this._peer === peer) this._peer = null;
    if (peer.signalingState !== "closed") peer.close();
  }

  _receive(event) {
    const message = event?.data || event;
    if (!message || message.to !== this._roomId || message.from === this._roomId) return;
    const signalKey = this._signalKey(event, message);
    if (this._hasSeenSignal(signalKey) || !this._claimSignalOwnership(message)) return;
    this._rememberSignal(signalKey);
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
    if (!this._ownsRoom() && !this._claimRoomOwnership()) return;
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
    const call = this._call;
    const peer = this._peer;
    if (call?.id !== message.call_id || !peer || !this._isCurrentCall(call, peer)) return;
    this._diagnose("answer_received");
    await peer.setRemoteDescription(message.description);
    if (!this._isCurrentCall(call, peer)) return;
    await this._flushCandidates(peer, call);
  }

  async _receiveCandidate(message) {
    const call = this._call;
    if (call?.id !== message.call_id || !this._isCurrentCall(call)) return;
    const peer = this._peer;
    if (!peer || !peer.remoteDescription) {
      this._pendingCandidates.push(message.candidate);
      return;
    }
    await peer.addIceCandidate(message.candidate);
    if (!this._isCurrentCall(call, peer)) return;
  }

  async _flushCandidates(peer = this._peer, call = this._call) {
    if (!peer || !this._isCurrentCall(call, peer)) return;
    for (const candidate of this._pendingCandidates.splice(0)) {
      if (!this._isCurrentCall(call, peer)) return;
      await peer.addIceCandidate(candidate);
      if (!this._isCurrentCall(call, peer)) return;
    }
  }

  _createCallId() {
    const cryptoApi = globalThis.crypto;
    if (typeof cryptoApi?.randomUUID === "function") {
      return cryptoApi.randomUUID();
    }
    if (typeof cryptoApi?.getRandomValues === "function") {
      const bytes = new Uint8Array(16);
      cryptoApi.getRandomValues(bytes);
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      return [...bytes]
        .map((byte, index) =>
          `${[4, 6, 8, 10].includes(index) ? "-" : ""}${byte.toString(16).padStart(2, "0")}`,
        )
        .join("");
    }
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  async _makePeer(call, initiator) {
    if (!this._isCurrentCall(call)) return false;
    const peer = new RTCPeerConnection({ iceServers: [] });
    this._peer = peer;
    peer.onicecandidate = ({ candidate }) => {
      if (candidate && this._isCurrentCall(call, peer)) {
        this._send({
          kind: "candidate",
          call_id: call.id,
          to: call.from === this._roomId ? call.to : call.from,
          candidate,
        });
      }
    };
    peer.oniceconnectionstatechange = () => this._diagnose("ice_state", peer.iceConnectionState);
    peer.ontrack = ({ streams }) => {
      if (!this._isCurrentCall(call, peer)) return;
      const audio = this.shadowRoot.querySelector("audio");
      if (audio && streams[0]) audio.srcObject = streams[0];
    };
    peer.onconnectionstatechange = () => {
      this._diagnose("peer_connection_state", peer.connectionState);
      if (["failed", "disconnected", "closed"].includes(peer.connectionState)) {
        if (this._isCurrentCall(call, peer)) this._cleanup(false);
      } else if (peer.connectionState === "connected" && this._isCurrentCall(call, peer)) {
        this._call.state = "connected";
        this._render();
      }
    };

    this._diagnose("microphone_request", `secure=${window.isSecureContext} mediaDevices=${Boolean(navigator.mediaDevices)} getUserMedia=${Boolean(navigator.mediaDevices?.getUserMedia)}`);
    const localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (!this._isCurrentCall(call, peer)) {
      this._discardPeer(peer, localStream);
      return false;
    }
    this._localStream = localStream;
    this._diagnose("microphone_granted");
    for (const track of localStream.getTracks()) {
      peer.addTrack(track, localStream);
    }
    if (initiator) {
      const offer = await peer.createOffer();
      if (!this._isCurrentCall(call, peer)) {
        this._discardPeer(peer, localStream);
        return false;
      }
      await peer.setLocalDescription(offer);
      if (!this._isCurrentCall(call, peer)) {
        this._discardPeer(peer, localStream);
        return false;
      }
      this._diagnose("offer_created");
      this._send({
        kind: "offer",
        call_id: call.id,
        to: call.to,
        description: peer.localDescription,
      });
    }
    return true;
  }

  async _callRoom(roomId, callId) {
    if (this._call || !this._claimRoomOwnership()) return false;
    callId ||= this._createCallId();
    this._error = null;
    const call = { id: callId, from: this._roomId, to: roomId, state: "calling" };
    this._call = call;
    this._render();
    try {
      const ready = await this._makePeer(call, true);
      if (!ready || !this._isCurrentCall(call)) return false;
      return true;
    } catch (error) {
      if (!this._isCurrentCall(call)) return false;
      this._error = error.message;
      this._diagnose("error", `${error.name}: ${error.message}`);
      this._call.state = "error";
      this._render();
      return false;
    }
  }

  async _startOutgoing(roomId, callId) {
    if (this._call || !this._ownsRoom()) return;
    return this._callRoom(roomId, callId);
  }

  async _answer() {
    if (!this._pendingOffer || !this._call) return;
    this._error = null;
    const offer = this._pendingOffer;
    this._pendingOffer = null;
    this._call.state = "answering";
    const call = this._call;
    this._diagnose("answer");
    this._render();
    try {
      const ready = await this._makePeer(call, false);
      if (!ready || !this._isCurrentCall(call) || !this._peer) return;
      const peer = this._peer;
      await peer.setRemoteDescription(offer.description);
      if (!this._isCurrentCall(call, peer)) return;
      await this._flushCandidates(peer, call);
      if (!this._isCurrentCall(call, peer)) return;
      const answer = await peer.createAnswer();
      if (!this._isCurrentCall(call, peer)) return;
      await peer.setLocalDescription(answer);
      if (!this._isCurrentCall(call, peer)) return;
      this._diagnose("answer_created");
      this._send({
        kind: "answer",
        call_id: this._call.id,
        to: this._call.from,
        description: peer.localDescription,
      });
    } catch (error) {
      if (!this._isCurrentCall(call)) return;
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
    const call = this._call;
    const peer = this._peer;
    const localStream = this._localStream;
    if (publishEnd && call) {
      this._send({ kind: "end", call_id: call.id, to: call.from === this._roomId ? call.to : call.from });
    }
    this._peer = null;
    this._localStream = null;
    this._pendingCandidates = [];
    this._pendingOffer = null;
    this._call = null;
    if (this._ownsRoom()) HOUSEVOICE_WALKIE_OWNERS.delete(this._roomId);
    if (peer?.signalingState !== "closed") peer?.close();
    localStream?.getTracks().forEach((track) => track.stop());
    const audio = this.shadowRoot.querySelector("audio");
    if (audio) audio.srcObject = null;
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
