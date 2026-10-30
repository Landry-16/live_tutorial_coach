// Camera frames, mic PCM and the coach's voice.

export async function openCamera(video: HTMLVideoElement) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: "environment", width: { ideal: 1280 } },
    audio: false,
  });
  video.srcObject = stream;
  await video.play();
  return () => stream.getTracks().forEach((t) => t.stop());
}

const canvas = document.createElement("canvas");

export function grabFrame(video: HTMLVideoElement, width = 640): string {
  canvas.width = width;
  canvas.height = Math.round((video.videoHeight / video.videoWidth) * width);
  canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.7);
}

// Float32 -> PCM 16-bit, sent every 80 ms (1920 samples at 24 kHz).
const WORKLET = `
class Pcm extends AudioWorkletProcessor {
  buf = new Int16Array(1920); n = 0;
  process([input]) {
    const ch = input[0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      this.buf[this.n++] = Math.max(-1, Math.min(1, ch[i])) * 0x7fff;
      if (this.n === this.buf.length) { this.port.postMessage(this.buf.slice().buffer, []); this.n = 0; }
    }
    return true;
  }
}
registerProcessor("pcm", Pcm);`;

export async function openMic(onChunk: (pcm: ArrayBuffer) => void) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
  });
  const ctx = new AudioContext({ sampleRate: 24000 }); // the browser resamples the mic
  await ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([WORKLET], { type: "text/javascript" })));
  const node = new AudioWorkletNode(ctx, "pcm");
  node.port.onmessage = (e) => onChunk(e.data);
  ctx.createMediaStreamSource(stream).connect(node);
  return () => { stream.getTracks().forEach((t) => t.stop()); void ctx.close(); };
}

// Speaks in order; an urgent line interrupts. Lowers the tutorial while speaking.
export class Voice {
  speaking = false;
  constructor(private readonly duck: (on: boolean) => void) {}

  say(text: string, urgent: boolean) {
    if (urgent) speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-US";
    u.rate = 1.02;
    u.onstart = () => { this.speaking = true; this.duck(true); };
    u.onend = u.onerror = () => {
      if (speechSynthesis.pending || speechSynthesis.speaking) return;
      this.speaking = false;
      this.duck(false);
    };
    speechSynthesis.speak(u);
  }

  stop() {
    speechSynthesis.cancel();
    this.speaking = false;
    this.duck(false);
  }
}
