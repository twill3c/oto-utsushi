// =====================================================================
// 録音 — メモリの上だけで完結させる
//
// 録音した音声は保存もアップロードもしない(SPEC スコープ外)。
// MediaRecorder で塊を集め、decodeAudioData で波形へ戻し、
// core の純関数(prepareForRecognition)で 16 kHz モノラルへ揃える。
//
// 変換の中身は src/core/audio.ts にあり、そちらは DOM を知らないので
// 単体で検査できる。ここはブラウザ API との接続だけを持つ。
// =====================================================================
import { prepareForRecognition } from "@/core/audio";

export interface Recording {
  /** 16 kHz モノラル */
  audio: Float32Array;
  /** 元のサンプルレート(表示用) */
  sourceRate: number;
  durationSec: number;
}

export class MicRecorder {
  private stream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];

  get active(): boolean {
    return this.recorder !== null;
  }

  async start(): Promise<void> {
    if (this.recorder !== null) return;
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.chunks = [];
    this.recorder = new MediaRecorder(this.stream);
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.recorder.start();
  }

  /** 録音を止めて 16 kHz モノラルへ整える */
  async stop(): Promise<Recording> {
    const recorder = this.recorder;
    if (recorder === null) throw new Error("録音していない");

    const blob = await new Promise<Blob>((resolve) => {
      recorder.onstop = () => resolve(new Blob(this.chunks, { type: recorder.mimeType }));
      recorder.stop();
    });

    for (const track of this.stream?.getTracks() ?? []) track.stop();
    this.stream = null;
    this.recorder = null;
    this.chunks = [];

    const ctx = new AudioContext();
    try {
      const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
      const channels: Float32Array[] = [];
      for (let c = 0; c < decoded.numberOfChannels; c += 1) {
        channels.push(decoded.getChannelData(c));
      }
      const audio = prepareForRecognition(channels, decoded.sampleRate);
      return {
        audio,
        sourceRate: decoded.sampleRate,
        durationSec: decoded.duration,
      };
    } finally {
      await ctx.close();
    }
  }

  /** 途中でやめる(音声を捨てる) */
  abort(): void {
    if (this.recorder !== null && this.recorder.state !== "inactive") {
      this.recorder.stop();
    }
    for (const track of this.stream?.getTracks() ?? []) track.stop();
    this.stream = null;
    this.recorder = null;
    this.chunks = [];
  }
}
