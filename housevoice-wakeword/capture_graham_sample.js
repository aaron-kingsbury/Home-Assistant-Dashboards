#!/usr/bin/env node
"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--confirm-recording") {
      args.confirm = true;
    } else if (item.startsWith("--")) {
      args[item.slice(2)] = argv[++index];
    }
  }
  return args;
}

function getJson(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, (response) => {
        let body = "";
        response.on("data", (chunk) => (body += chunk));
        response.on("end", () => {
          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(error);
          }
        });
      })
      .on("error", reject);
  });
}

function sanitizeName(value) {
  if (!/^[a-z0-9][a-z0-9_-]{0,79}$/.test(value)) {
    throw new Error("--name must contain only lowercase letters, digits, _ or -");
  }
  return value;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.confirm) {
    throw new Error("Recording blocked: pass --confirm-recording after informing the room");
  }
  if (!["positive", "negative"].includes(args.label)) {
    throw new Error("--label must be positive or negative");
  }
  const name = sanitizeName(args.name || "");
  const seconds = Number(args.seconds || 3);
  if (!Number.isFinite(seconds) || seconds < 1 || seconds > 300) {
    throw new Error("--seconds must be between 1 and 300");
  }
  const port = Number(args.port || 9225);

  const pages = await getJson(`http://127.0.0.1:${port}/json/list`);
  const page = pages.find(
    (item) =>
      item.type === "page" && item.url.includes("/kids-rooms/grahams-room"),
  );
  if (!page || !String(page.title).includes("Graham")) {
    throw new Error("Graham's verified DevTools target was not found; refusing to record");
  }

  const socket = new WebSocket(page.webSocketDebuggerUrl);
  const pending = new Map();
  let commandId = 0;
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
  };
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const id = ++commandId;
      pending.set(id, resolve);
      socket.send(JSON.stringify({ id, method, params }));
    });

  const expression = `(async () => {
    const seconds = ${JSON.stringify(seconds)};
    let stream;
    let context;
    let processor;
    let source;
    const chunks = [];
    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
      position: 'fixed', inset: '0', zIndex: '2147483647',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.92)', color: 'white',
      font: 'bold 72px sans-serif', textAlign: 'center', padding: '40px'
    });
    document.body.appendChild(overlay);
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    const encodeWav = (samples, sampleRate) => {
      const targetRate = 16000;
      const ratio = sampleRate / targetRate;
      const length = Math.floor(samples.length / ratio);
      const output = new Float32Array(length);
      for (let i = 0; i < length; i++) {
        const position = i * ratio;
        const left = Math.floor(position);
        const right = Math.min(left + 1, samples.length - 1);
        const fraction = position - left;
        output[i] = samples[left] * (1 - fraction) + samples[right] * fraction;
      }
      const buffer = new ArrayBuffer(44 + output.length * 2);
      const view = new DataView(buffer);
      const text = (offset, value) => [...value].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
      text(0, 'RIFF'); view.setUint32(4, 36 + output.length * 2, true);
      text(8, 'WAVE'); text(12, 'fmt '); view.setUint32(16, 16, true);
      view.setUint16(20, 1, true); view.setUint16(22, 1, true);
      view.setUint32(24, targetRate, true); view.setUint32(28, targetRate * 2, true);
      view.setUint16(32, 2, true); view.setUint16(34, 16, true);
      text(36, 'data'); view.setUint32(40, output.length * 2, true);
      for (let i = 0; i < output.length; i++) {
        const sample = Math.max(-1, Math.min(1, output[i]));
        view.setInt16(44 + i * 2, sample < 0 ? sample * 32768 : sample * 32767, true);
      }
      return new Uint8Array(buffer);
    };
    try {
      stream = await navigator.mediaDevices.getUserMedia({audio: {
        echoCancellation: false, noiseSuppression: false, autoGainControl: false
      }});
      context = new AudioContext();
      await context.resume();
      source = context.createMediaStreamSource(stream);
      processor = context.createScriptProcessor(4096, 1, 1);
      const silent = context.createGain();
      silent.gain.value = 0;
      source.connect(processor); processor.connect(silent); silent.connect(context.destination);
      for (let count = 3; count > 0; count--) {
        overlay.textContent = 'Recording starts in ' + count;
        await sleep(1000);
      }
      overlay.textContent = ${JSON.stringify(args.label === "positive" ? "Say HOUSEVOICE now" : "Ambient recording")};
      processor.onaudioprocess = event => chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
      await sleep(seconds * 1000);
      processor.onaudioprocess = null;
      overlay.textContent = 'Recording complete';
      await sleep(500);
      const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      const samples = new Float32Array(total);
      let offset = 0;
      for (const chunk of chunks) { samples.set(chunk, offset); offset += chunk.length; }
      const wav = encodeWav(samples, context.sampleRate);
      let binary = '';
      for (let i = 0; i < wav.length; i += 0x8000) {
        binary += String.fromCharCode(...wav.subarray(i, i + 0x8000));
      }
      return {base64: btoa(binary), inputSampleRate: context.sampleRate, wavBytes: wav.length};
    } finally {
      processor?.disconnect(); source?.disconnect();
      stream?.getTracks().forEach(track => track.stop());
      if (context) await context.close().catch(() => {});
      overlay.remove();
    }
  })()`;

  const response = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  });
  socket.close();
  if (response.result.exceptionDetails) {
    throw new Error(JSON.stringify(response.result.exceptionDetails));
  }
  const result = response.result.result.value;
  const outputDirectory = path.join(__dirname, "samples", args.label);
  fs.mkdirSync(outputDirectory, { recursive: true });
  const outputPath = path.join(outputDirectory, `${name}.wav`);
  fs.writeFileSync(outputPath, Buffer.from(result.base64, "base64"));
  console.log(
    JSON.stringify(
      {
        output: outputPath,
        inputSampleRate: result.inputSampleRate,
        outputSampleRate: 16000,
        bytes: result.wavBytes,
        seconds,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
