// Proxy to Muse Voice Transcribe realtime. The API key stays on the backend.
import WebSocket from "ws";
import { API_KEY, MODELS } from "./meta.ts";

export type AsrEvents = { onPartial: (text: string) => void; onFinal: (text: string) => void; onError: (e: string) => void };

export class AsrStream {
  private ws: WebSocket | null = null;
  private ready = false;

  constructor(private readonly events: AsrEvents) {}

  // PCM signed 16-bit LE, mono, 24 kHz, paced in real time by the phone.
  push(pcm: Buffer) {
    if (!this.ws) this.connect();
    if (this.ready) this.ws!.send(pcm);
  }

  close() {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ type: "endStream" }));
    this.ws = null;
    this.ready = false;
  }

  private connect() {
    const ws = new WebSocket("wss://api.meta.ai/v1/asr/realtime");
    this.ws = ws;
    ws.on("open", () => ws.send(JSON.stringify({
      authorization: { accessToken: `Bearer ${API_KEY}` },
      audioEncoding: "PCM_24KHZ",
      model: MODELS.asr,
      mode: "ENDPOINTING",
      partialMode: "CUMULATIVE",
      emitAudioProgress: false,
    })));
    ws.on("message", (data, isBinary) => {
      if (isBinary) return;
      const ev = JSON.parse(data.toString());
      if (!ev.type && ev.sessionId) this.ready = true;
      else if (ev.type === "transcript") this.events.onPartial(ev.transcript);
      else if (ev.type === "speechComplete") this.events.onFinal(ev.transcript);
      else if (ev.type === "error") this.events.onError(ev.message);
    });
    // the server closes idle or 60 min sessions: reconnect on the next audio frame
    ws.on("close", () => { if (this.ws === ws) { this.ws = null; this.ready = false; } });
    ws.on("error", (e) => this.events.onError(e.message));
  }
}
