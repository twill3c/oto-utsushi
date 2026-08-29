"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_MODEL_ID,
  type Device,
  MODELS,
  formatBytes,
  getModel,
  threadingState,
} from "@/core/models";
import { MicRecorder } from "@/lib/recorder";
import {
  WhisperRecognizer,
  detectDevice,
  isCrossOriginIsolated,
} from "@/lib/whisper";

type Phase = "idle" | "loading" | "ready" | "recording" | "working" | "error";

interface Props {
  /**
   * 認識結果を受け取る。
   *
   * **課題文は渡ってこない。** このコンポーネントは何を読むべきかを知らないし、
   * 知る必要もない(SPEC N-06)。
   */
  onTranscript: (text: string, durationSec: number, engine: string) => void;
}

export default function Listener({ onTranscript }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [modelId, setModelId] = useState(DEFAULT_MODEL_ID);
  const [device, setDevice] = useState<Device | null>(null);
  const [progress, setProgress] = useState<{ file: string; ratio: number | null } | null>(
    null,
  );
  const [message, setMessage] = useState("");
  const [elapsed, setElapsed] = useState(0);

  const recognizer = useRef<WhisperRecognizer | null>(null);
  const recorder = useRef<MicRecorder | null>(null);

  useEffect(() => {
    let alive = true;
    detectDevice().then((d) => {
      if (alive) setDevice(d);
    });
    return () => {
      alive = false;
      recorder.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (phase !== "recording") return;
    const started = performance.now();
    const timer = window.setInterval(
      () => setElapsed((performance.now() - started) / 1000),
      100,
    );
    return () => window.clearInterval(timer);
  }, [phase]);

  const model = getModel(modelId);
  const size =
    model !== undefined && device !== null ? model.bytes[device] : null;

  const load = useCallback(async () => {
    if (device === null) return;
    setPhase("loading");
    setMessage("");
    try {
      const r = new WhisperRecognizer(modelId, device);
      await r.load((p) => setProgress(p));
      recognizer.current = r;
      setProgress(null);
      setPhase("ready");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  }, [device, modelId]);

  const startRecording = useCallback(async () => {
    try {
      const rec = new MicRecorder();
      await rec.start();
      recorder.current = rec;
      setElapsed(0);
      setPhase("recording");
    } catch (e) {
      setMessage(
        e instanceof Error
          ? `マイクを使えない: ${e.message}`
          : "マイクを使えない",
      );
      setPhase("error");
    }
  }, []);

  const stopAndRecognize = useCallback(async () => {
    const rec = recorder.current;
    const r = recognizer.current;
    if (rec === null || r === null) return;
    setPhase("working");
    try {
      const recording = await rec.stop();
      recorder.current = null;
      const result = await r.recognize({
        audio: recording.audio,
        sampleRate: 16000,
        language: "ja",
      });
      onTranscript(result.text, result.durationSec, result.engine);
      setPhase("ready");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  }, [onTranscript]);

  return (
    <div className="listener">
      {phase === "idle" || phase === "loading" || phase === "error" ? (
        <>
          <label className="field">
            <span>使う模型</span>
            <select
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              disabled={phase === "loading"}
              aria-label="使う模型"
            >
              {MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <p className="lede">
            {model?.note}
            <br />
            実行系は
            <strong>
              {device === null
                ? "調べている…"
                : threadingState(isCrossOriginIsolated(), device)}
            </strong>
            。初回に落とす重みは
            <strong>{size === null ? "—" : formatBytes(size)}</strong>
            （二度目からはブラウザのキャッシュが効く）。
            重みは Hugging Face から直接落ちてきて、
            <strong>音声はどこへも出ない</strong>。
          </p>
          <button
            type="button"
            onClick={load}
            disabled={phase === "loading" || device === null}
          >
            {phase === "loading" ? "落としている…" : "模型を読み込む"}
          </button>
          {progress !== null ? (
            <p className="lede">
              {progress.file}{" "}
              {progress.ratio === null
                ? ""
                : `${Math.round(progress.ratio * 100)}%`}
            </p>
          ) : null}
          {phase === "error" ? <p className="error">{message}</p> : null}
        </>
      ) : null}

      {phase === "ready" ? (
        <button type="button" onClick={startRecording}>
          音読をはじめる
        </button>
      ) : null}

      {phase === "recording" ? (
        <>
          <button type="button" onClick={stopAndRecognize} className="recording">
            ● 録音中 {elapsed.toFixed(1)} 秒 — 押して止める
          </button>
          <p className="lede">課題文を声に出して読む。読み終わったら止める。</p>
        </>
      ) : null}

      {phase === "working" ? <p className="lede">聞き取っている…</p> : null}
    </div>
  );
}
