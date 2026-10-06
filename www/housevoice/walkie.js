const HOUSEVOICE_WALKIE_PARTICIPANTS = {
  graham: {
    id: "graham",
    name: "Graham",
    assist: "assist_satellite.vaca_96ed4d2c4",
    media_player: "media_player.vaca_96ed4d2c4_media_player",
    home_path: "/kids-rooms/grahams-room",
    walkie_path: "/kids-rooms/grahams-room",
    peer_id: "graham",
    available: true,
    presence_entity: "assist_satellite.vaca_96ed4d2c4",
    browser_id: "browser_mod_9dc10b6c_933f892f",
  },
  cora: {
    id: "cora",
    name: "Cora",
    assist: "assist_satellite.vaca_c958413a0",
    media_player: "media_player.cora_s_room_display_media_player",
    home_path: "/kids-rooms/home",
    walkie_path: "/kids-rooms/home",
    peer_id: "cora",
    available: true,
    presence_entity: "assist_satellite.vaca_c958413a0",
    browser_id: "browser_mod_6ed46135_9e8ea402",
  },
  parents: {
    id: "parents",
    name: "Parents",
    assist: null,
    media_player: null,
    home_path: null,
    walkie_path: null,
    peer_id: "parents",
    available: false,
    presence_entity: null,
    browser_id: null,
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
    this._clientId = this._createCallId();
    this._alwaysVisible = false;
    this._hass = null;
    this._unsubscribe = null;
    this._subscribePromise = null;
    this._peer = null;
    this._localStream = null;
    this._remoteStream = null;
    this._pendingCandidates = [];
    this._pendingOffer = null;
    this._call = null;
    this._muted = false;
    this._error = null;
    this._errorDetail = null;
    this._errorTimer = null;
    this._requestPending = false;
    this._portal = null;
    this._portalRoot = null;
  }

  setConfig(config) {
    const configuredRoom = config?.room_id || config?.room;
    this._roomId = HOUSEVOICE_WALKIE_PARTICIPANTS[configuredRoom]
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
    this._cleanup(Boolean(this._call));
    this._removePortal();
  }

  async _subscribe() {
    if (this._unsubscribe || this._subscribePromise || !this._hass?.connection) return;
    const connection = this._hass.connection;
    this._diagnose(
      "component_loaded",
      `room_id=${this._roomId} client_id=${this._clientId} secure=${window.isSecureContext} mediaDevices=${Boolean(navigator.mediaDevices)} getUserMedia=${Boolean(navigator.mediaDevices?.getUserMedia)}`,
    );
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
        client_id: this._clientId,
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

  _pauseAutoRefresh() {
    window.__housevoiceWalkieActive = true;
    clearTimeout(window.__housevoiceAutoRefresh);
    window.__housevoiceAutoRefresh = -1;
  }

  _resumeAutoRefresh() {
    window.__housevoiceWalkieActive = false;
    if (window.__housevoiceAutoRefresh !== -1 || !this.isConnected) return;
    window.__housevoiceAutoRefresh = setTimeout(() => window.location.reload(), 30000);
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
    if (["caller_selected", "accepted_elsewhere"].includes(message.kind)) {
      if (this._call?.id === message.call_id && message.winner_client_id !== this._clientId) {
        this._diagnose("duplicate_client_released", `kind=${message.kind}`);
        this._cleanup(false);
      }
      return;
    }
    if (message.kind === "busy") {
      this._requestPending = false;
      this._error = "Walkie is busy";
      this._errorDetail = "Another Walkie call is already in progress.";
      this._diagnose("busy", `call_id=${message.call_id}`);
      this._render();
      this._scheduleErrorClear();
      return;
    }
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
    if (this._call) return;
    this._pauseAutoRefresh();
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
    peer.ontrack = ({ track, streams }) => {
      if (!this._isCurrentCall(call, peer)) return;
      const remoteStream = streams[0] || new MediaStream([track]);
      this._remoteStream = remoteStream;
      const audio = this.shadowRoot.querySelector("audio");
      if (audio) audio.srcObject = remoteStream;
      this._diagnose("remote_track", `${track.kind}:${track.readyState}:muted=${track.muted}`);
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
    this._pauseAutoRefresh();
    callId ||= this._createCallId();
    this._error = null;
    this._errorDetail = null;
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
      this._errorDetail = "Please try again.";
      this._diagnose("error", `${error.name}: ${error.message}`);
      this._call.state = "error";
      this._render();
      return false;
    }
  }

  async _requestCall(roomId) {
    const target = HOUSEVOICE_WALKIE_PARTICIPANTS[roomId];
    if (this._call || this._requestPending || !target?.available || !this._claimRoomOwnership()) return;
    this._requestPending = true;
    this._error = null;
    this._errorDetail = null;
    this._render();
    const callId = this._createCallId();
    try {
      await this._hass.callService("housevoice_walkie", "call", {
        from: this._roomId,
        to: roomId,
        call_id: callId,
      });
    } catch (error) {
      this._requestPending = false;
      this._error = error.message;
      this._errorDetail = "The call could not connect.";
      this._diagnose("request_error", `${error.name}: ${error.message}`);
      this._render();
    }
  }

  async _startOutgoing(roomId, callId) {
    this._requestPending = false;
    if (this._call || !this._ownsRoom()) return;
    return this._callRoom(roomId, callId);
  }

  async _answer() {
    if (!this._pendingOffer || !this._call) return;
    this._error = null;
    this._errorDetail = null;
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
      this._errorDetail = "The call could not be answered.";
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
    this._remoteStream = null;
    this._pendingCandidates = [];
    this._pendingOffer = null;
    this._call = null;
    this._requestPending = false;
    if (this._ownsRoom()) HOUSEVOICE_WALKIE_OWNERS.delete(this._roomId);
    if (peer?.signalingState !== "closed") peer?.close();
    localStream?.getTracks().forEach((track) => track.stop());
    const audio = this.shadowRoot.querySelector("audio");
    if (audio) audio.srcObject = null;
    this._muted = false;
    this._error = null;
    this._errorDetail = null;
    clearTimeout(this._errorTimer);
    this._errorTimer = null;
    this._render();
    this._resumeAutoRefresh();
  }

  _scheduleErrorClear() {
    clearTimeout(this._errorTimer);
    this._errorTimer = setTimeout(() => {
      this._error = null;
      this._errorDetail = null;
      this._render();
    }, 4500);
  }

  _dismissError() {
    clearTimeout(this._errorTimer);
    this._errorTimer = null;
    this._error = null;
    this._errorDetail = null;
    this._render();
  }

  _ensurePortal() {
    if (this._portal?.isConnected) return this._portal;
    const portal = document.createElement("dialog");
    portal.dataset.housevoiceWalkieOverlay = this._clientId;
    portal.style.cssText = "position:fixed;inset:0;width:100vw;height:100dvh;max-width:none;max-height:none;margin:0;padding:0;border:0;background:transparent;overflow:visible";
    const surface = document.createElement("div");
    surface.attachShadow({ mode: "open" });
    portal.appendChild(surface);
    portal.addEventListener("cancel", (event) => event.preventDefault());
    document.body.appendChild(portal);
    portal.showModal();
    this._portal = portal;
    this._portalRoot = surface.shadowRoot;
    return portal;
  }

  _removePortal() {
    if (this._portal?.open) this._portal.close();
    this._portal?.remove();
    this._portal = null;
    this._portalRoot = null;
  }

  _escapeHtml(value) {
    const text = document.createElement("span");
    text.textContent = String(value ?? "");
    return text.innerHTML;
  }

  _render() {
    if (!this.shadowRoot || !this._roomId) return;
    const room = HOUSEVOICE_WALKIE_PARTICIPANTS[this._roomId];
    const call = this._call;
    this.toggleAttribute("active", Boolean(call));
    this.toggleAttribute("visible", this._alwaysVisible || Boolean(call));
    const target = call && HOUSEVOICE_WALKIE_PARTICIPANTS[call.from === this._roomId ? call.to : call.from];
    const label = this._escapeHtml(target?.name || "Room");
    const buttons = Object.entries(HOUSEVOICE_WALKIE_PARTICIPANTS)
      .filter(([id]) => id !== this._roomId)
      .map(([id, item]) => `<button class="target" data-call="${id}" ${item.available ? "" : "disabled"}><span>${this._escapeHtml(item.name)}</span><small>${item.available ? "Available" : "Unavailable"}</small></button>`)
      .join("");
    let panel = `<section class="modal chooser"><div class="eyebrow">WALKIE</div><h2>Who do you want to call?</h2><div class="targets">${buttons}</div>${this._requestPending ? "<p class=\"progress\">Starting call…</p>" : ""}</section>`;
    if (this._error && !call) {
      panel = `<section class="modal error-state"><div class="eyebrow">WALKIE</div><h2>${this._escapeHtml(this._error)}</h2><p>${this._escapeHtml(this._errorDetail || "Please try again.")}</p><button data-dismiss-error>OK</button></section>`;
    } else if (call?.state === "incoming") {
      panel = `<section class="modal incoming"><div class="eyebrow">INCOMING WALKIE</div><h2>📡 ${label} is calling</h2><p>Walkie call from ${label}</p><div class="actions"><button data-answer>ANSWER</button><button class="secondary" data-decline>DECLINE</button></div></section>`;
    } else if (call?.state === "connected") {
      panel = `<section class="modal connected"><div class="eyebrow">WALKIE</div><h2>📡 Talking with ${label}</h2><p class="status"><span class="dot"></span>${this._muted ? "Connected · Microphone muted" : "Connected"}</p><div class="actions"><button data-mute>${this._muted ? "UNMUTE" : "MUTE"}</button><button class="secondary danger" data-end>END CALL</button></div></section>`;
    } else if (call?.state === "error") {
      panel = `<section class="modal error-state"><div class="eyebrow">WALKIE ERROR</div><h2>Could not call ${label}</h2><p>${this._escapeHtml(this._errorDetail || this._error || "Please try again.")}</p><button class="secondary" data-end>DISMISS</button></section>`;
    } else if (call) {
      panel = `<section class="modal outgoing"><div class="eyebrow">OUTGOING WALKIE</div><h2>📡 Calling ${label}</h2><p>Waiting for ${label} to answer…</p><button class="secondary danger" data-end>CANCEL</button></section>`;
    }
    if (!this.shadowRoot.querySelector("audio")) {
      this.shadowRoot.innerHTML = `<style>:host { display: block; width: 1px; height: 1px; overflow: hidden; opacity: 0; pointer-events: none; } audio { display: none; }</style><audio autoplay playsinline></audio>`;
    }
    const audio = this.shadowRoot.querySelector("audio");
    if (audio && this._remoteStream) audio.srcObject = this._remoteStream;

    const showOverlay = this._alwaysVisible || Boolean(call) || this._requestPending || Boolean(this._error);
    if (!showOverlay) {
      this._removePortal();
      return;
    }
    this._ensurePortal();
    const portalRoot = this._portalRoot;
    portalRoot.innerHTML = `<style>
      :host { all: initial; position: fixed; inset: 0; z-index: 2147483000; display: block; pointer-events: auto; }
      .overlay { position: fixed; inset: 0; z-index: 2147483000; display: flex; align-items: center; justify-content: center; box-sizing: border-box; padding: 16px; background: rgba(0, 4, 14, .58); backdrop-filter: blur(2px); -webkit-backdrop-filter: blur(2px); font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
      .modal { width: min(390px, calc(100vw - 32px)); max-height: calc(100dvh - 32px); overflow: auto; box-sizing: border-box; padding: 22px; color: #f4f8ff; text-align: center; background: linear-gradient(145deg, rgba(6, 23, 48, .98), rgba(20, 7, 38, .98)); border: 1px solid #346f9d; border-radius: 20px; box-shadow: 0 18px 70px rgba(0, 0, 0, .72), inset 0 1px 0 rgba(255, 255, 255, .05); }
      .chooser { border-color: #7043ad; }
      .outgoing { border-color: #347fc0; }
      .incoming { border-color: #9d56d6; box-shadow: 0 18px 70px rgba(0, 0, 0, .72), 0 0 24px rgba(157, 86, 214, .22); }
      .connected { border-color: #00b98f; }
      .error-state { border-color: #d4678e; }
      .eyebrow { color: #75caff; font-size: 12px; font-weight: 700; letter-spacing: 2.2px; }
      .incoming .eyebrow { color: #d49aff; }
      .connected .eyebrow { color: #55e4bd; }
      h2 { margin: 10px 0 6px; overflow-wrap: anywhere; color: #f7f9ff; font-size: clamp(22px, 5.2vw, 30px); line-height: 1.16; }
      p { margin: 0 0 17px; overflow-wrap: anywhere; color: rgba(217, 237, 255, .78); font-size: 15px; line-height: 1.35; }
      .targets { display: grid; gap: 10px; margin-top: 17px; }
      button { display: block; width: 100%; min-height: 56px; box-sizing: border-box; margin: 0; padding: 10px 16px; border: 1px solid #2ea8ff; border-radius: 13px; background: rgba(12, 72, 130, .72); color: #f4f8ff; font: inherit; font-size: 16px; font-weight: 750; letter-spacing: .6px; cursor: pointer; touch-action: manipulation; }
      button.target { display: flex; align-items: center; justify-content: space-between; gap: 12px; text-align: left; }
      button small { flex: 0 0 auto; color: #8fcfff; font-size: 12px; font-weight: 500; letter-spacing: 0; }
      button:disabled { border-color: #535b72; background: rgba(42, 45, 63, .74); color: #939bad; cursor: not-allowed; }
      button:disabled small { color: #9aa1ae; }
      button.secondary { border-color: #8a55c7; background: rgba(63, 28, 91, .76); }
      button.danger { border-color: #bd527d; background: rgba(88, 24, 55, .76); }
      .actions { display: flex; gap: 10px; }
      .actions button { flex: 1 1 0; min-width: 0; }
      .status { display: flex; align-items: center; justify-content: center; gap: 8px; color: #8de8ce; }
      .dot { width: 9px; height: 9px; flex: 0 0 auto; border-radius: 50%; background: #35e0ae; box-shadow: 0 0 10px rgba(53, 224, 174, .7); }
      .progress { margin: 12px 0 0; }
      @media (max-height: 420px) { .modal { padding: 17px 19px; } h2 { margin-top: 7px; } .targets { margin-top: 12px; } button { min-height: 50px; } }
    </style><div class="overlay" role="dialog" aria-modal="true">${panel}</div>`;
    portalRoot.querySelectorAll("[data-call]").forEach((button) => {
      button.onclick = () => this._requestCall(button.dataset.call);
    });
    portalRoot.querySelector("[data-answer]")?.addEventListener("click", () => this._answer());
    portalRoot.querySelector("[data-decline]")?.addEventListener("click", () => this._decline());
    portalRoot.querySelector("[data-end]")?.addEventListener("click", () => this._end());
    portalRoot.querySelector("[data-mute]")?.addEventListener("click", () => this._toggleMute());
    portalRoot.querySelector("[data-dismiss-error]")?.addEventListener("click", () => this._dismissError());
  }
}

const registeredWalkieV19 = customElements.get("housevoice-walkie-v19");
if (registeredWalkieV19) {
  for (const name of Object.getOwnPropertyNames(HouseVoiceWalkie.prototype)) {
    if (name === "constructor") continue;
    Object.defineProperty(
      registeredWalkieV19.prototype,
      name,
      Object.getOwnPropertyDescriptor(HouseVoiceWalkie.prototype, name),
    );
  }
} else {
  customElements.define("housevoice-walkie-v19", HouseVoiceWalkie);
}

window.customCards = window.customCards || [];
if (!window.customCards.some((card) => card.type === "housevoice-walkie-v19")) {
  window.customCards.push({
    type: "housevoice-walkie-v19",
    name: "HouseVoice Walkie",
    description: "Local HouseVoice room-to-room audio intercom",
    preview: false,
  });
}
