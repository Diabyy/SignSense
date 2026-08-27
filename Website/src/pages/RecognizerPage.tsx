import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { CameraStage } from "../components/CameraStage";
import { isSignMode } from "../data/alphabet";
import { useSignInference } from "../hooks/useSignInference";
import { MODE_CONFIGS, type SignMode } from "../lib/modes";

export default function RecognizerPage() {
  const { mode: requestedMode } = useParams();
  if (!isSignMode(requestedMode)) {
    return <Navigate replace to="/kamera/bisindo" />;
  }
  return <Recognizer mode={requestedMode} />;
}

function Recognizer({ mode }: { mode: SignMode }) {
  const config = MODE_CONFIGS[mode];
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [transcript, setTranscript] = useState<string[]>([]);
  const { status, error, snapshot, startCamera, stopCamera } = useSignInference(
    videoRef,
    canvasRef,
    config,
    (label) => setTranscript((current) => [...current.slice(-7), label]),
  );

  useEffect(() => {
    setTranscript([]);
  }, [mode]);

  const statusLabel =
    status === "running"
      ? "LIVE"
      : status === "loading-model"
        ? "LOADING MODEL"
        : status === "requesting-camera"
          ? "REQUESTING CAMERA"
          : status.toUpperCase();

  const tip =
    mode === "bisindo"
      ? "BISINDO: jaga kedua tangan dan wrist terlihat untuk huruf dua tangan."
      : "ASL: beri jarak ekstra untuk pose kepalan dan jaga wrist tetap terlihat.";

  return (
    <div className="recognizer-page page-shell">
      <header className="recognizer-intro">
        <div>
          <p className="eyebrow"><span />Kamera lokal</p>
          <h1>Latihan alfabet {config.label}</h1>
          <p>{config.description}</p>
        </div>
        <Link className="back-link" to={`/belajar?mode=${mode}`}>
          Lihat referensi huruf
        </Link>
      </header>

      <div className="recognizer-mode-switch" aria-label="Pilih model alfabet">
        {(["bisindo", "asl"] as const).map((item) => (
          <Link
            aria-current={mode === item ? "page" : undefined}
            className={mode === item ? "is-active" : ""}
            key={item}
            to={`/kamera/${item}`}
          >
            {MODE_CONFIGS[item].label}
          </Link>
        ))}
      </div>

      <main className="app-shell recognizer-shell">
        <section className="status-strip" aria-live="polite">
          <span className={`status-pill ${status === "running" || status === "idle" ? "active" : ""}`}>
            <span className="status-dot" />
            {statusLabel}
          </span>
          <span>FPS {snapshot.fps.toFixed(1)}</span>
          <span>MODE {config.modelMode}</span>
          <span>POLICY {config.modelInferencePolicy ?? "artifact-default"}</span>
          <span className="local-only">LOCAL PROCESSING</span>
        </section>

        <section className="dashboard-grid" aria-label={`Dashboard pengenalan ${config.label}`}>
          <article className="panel camera-panel">
            <CameraStage
              canvasRef={canvasRef}
              error={error}
              modeLabel={config.label}
              onStart={startCamera}
              onStop={stopCamera}
              snapshot={snapshot}
              status={status}
              videoRef={videoRef}
            />
          </article>

          <article className="panel prediction-panel" aria-live="polite">
            <div className="panel-heading">
              <p>Prediksi stabil</p>
              <span>{config.modelMode} / MLP</span>
            </div>
            <div className={`prediction-value ${snapshot.stableLabel === "UNKNOWN" ? "unknown" : ""}`}>
              {snapshot.stableLabel}
            </div>
            <div className="confidence-track" aria-label={`Confidence ${snapshot.stableConfidence.toFixed(2)}`}>
              <span style={{ width: `${Math.min(snapshot.stableConfidence * 100, 100)}%` }} />
            </div>
            <p className="confidence-copy">CONFIDENCE {snapshot.stableConfidence.toFixed(2)}</p>
            <dl className="diagnostics">
              <div><dt>Prediksi mentah</dt><dd>{snapshot.raw.label} / {snapshot.raw.confidence.toFixed(2)}</dd></div>
              <div><dt>Tangan terdeteksi</dt><dd>{snapshot.detectedHands}</dd></div>
              <div><dt>Waktu inferensi</dt><dd>{snapshot.inferenceMs.toFixed(0)} ms</dd></div>
              <div><dt>Huruf dinamis</dt><dd>{config.dynamicLetters.join(" / ")} ditunda</dd></div>
            </dl>
            <div className="transcript-line">
              <span>Riwayat stabil</span>
              <strong>{transcript.length ? transcript.join(" ") : "Belum ada"}</strong>
            </div>
          </article>
        </section>

        <section className="info-grid">
          <article className="panel note-panel">
            <p className="note-label">CATATAN MODE</p>
            <p>{config.warning}</p>
            <p>{config.deferredCopy}</p>
          </article>
          <article className="panel note-panel">
            <p className="note-label">FRAME CHECK</p>
            <p>{tip}</p>
            <p>UNKNOWN berarti model belum cukup yakin atau jumlah tangan tidak cocok.</p>
          </article>
        </section>

      </main>

      <aside className="camera-privacy-note">
        <strong>Tidak ada rekaman yang diunggah.</strong>
        <span>Track kamera dan detector ditutup saat Anda meninggalkan halaman ini.</span>
      </aside>
    </div>
  );
}
