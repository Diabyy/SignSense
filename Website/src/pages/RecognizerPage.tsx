import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { CameraStage } from "../components/CameraStage";
import { getLetter, isSignMode, referenceAssetUrl } from "../data/alphabet";
import { useSignInference } from "../hooks/useSignInference";
import { MODE_CONFIGS, type SignMode } from "../lib/modes";
import {
  progressFromPracticeSamples,
  type PracticeSample,
} from "../lib/practice";

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
  const [showSkeleton, setShowSkeleton] = useState(true);
  const [copied, setCopied] = useState(false);
  const [practiceActive, setPracticeActive] = useState(false);
  const [targetIndex, setTargetIndex] = useState(0);
  const [holdProgress, setHoldProgress] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const [showSuccess, setShowSuccess] = useState(false);
  const previousPracticeSampleRef = useRef<PracticeSample | null>(null);

  const { status, error, snapshot, startCamera, stopCamera } = useSignInference(
    videoRef,
    canvasRef,
    config,
    (label) => setTranscript((current) => [...current.slice(-15), label]),
    showSkeleton,
  );

  useEffect(() => {
    setTranscript([]);
    setPracticeActive(false);
    setTargetIndex(0);
    setHoldProgress(0);
    setCompletedCount(0);
    setShowSuccess(false);
    previousPracticeSampleRef.current = null;
  }, [mode]);

  const targetLetter = config.staticLetters[targetIndex % config.staticLetters.length] ?? "A";
  const targetEntry = getLetter(mode, targetLetter);

  useEffect(() => {
    if (!practiceActive || status !== "running" || showSuccess) {
      previousPracticeSampleRef.current = null;
      if (!showSuccess) setHoldProgress(0);
      return;
    }

    if (snapshot.processedAt <= 0) return;
    const currentSample: PracticeSample = {
      processedAt: snapshot.processedAt,
      isMatching:
        snapshot.stableLabel === targetLetter && snapshot.stableConfidence >= 0.7,
    };
    const previousSample = previousPracticeSampleRef.current;
    previousPracticeSampleRef.current = currentSample;
    setHoldProgress((previousProgress) =>
      progressFromPracticeSamples(previousProgress, previousSample, currentSample),
    );
  }, [
    practiceActive,
    status,
    snapshot.stableLabel,
    snapshot.stableConfidence,
    snapshot.processedAt,
    targetLetter,
    config.staticLetters.length,
    showSuccess,
  ]);

  useEffect(() => {
    if (holdProgress < 100 || showSuccess) return;
    setShowSuccess(true);
    setCompletedCount((count) => count + 1);
  }, [holdProgress, showSuccess]);

  useEffect(() => {
    if (!showSuccess) return;
    const timer = window.setTimeout(() => {
      setShowSuccess(false);
      setTargetIndex((index) => (index + 1) % config.staticLetters.length);
      setHoldProgress(0);
      previousPracticeSampleRef.current = null;
    }, 800);
    return () => window.clearTimeout(timer);
  }, [config.staticLetters.length, showSuccess]);

  const handleCopyTranscript = () => {
    if (transcript.length === 0) return;
    navigator.clipboard.writeText(transcript.join(" "));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRandomTarget = () => {
    const nextIdx = Math.floor(Math.random() * config.staticLetters.length);
    previousPracticeSampleRef.current = null;
    setTargetIndex(nextIdx);
    setHoldProgress(0);
  };

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
              onToggleSkeleton={() => setShowSkeleton((prev) => !prev)}
              showSkeleton={showSkeleton}
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
              <div className="transcript-header">
                <span>Riwayat stabil</span>
                {transcript.length > 0 && (
                  <div className="transcript-actions">
                    <button
                      className="transcript-action-btn"
                      onClick={handleCopyTranscript}
                      title="Salin transkrip ke clipboard"
                      type="button"
                    >
                      {copied ? "Tersalin ✓" : "Salin"}
                    </button>
                    <button
                      className="transcript-action-btn danger"
                      onClick={() => setTranscript([])}
                      title="Hapus riwayat"
                      type="button"
                    >
                      Hapus
                    </button>
                  </div>
                )}
              </div>
              <strong>{transcript.length ? transcript.join(" ") : "Belum ada"}</strong>
            </div>

            <div className="practice-section">
              <div className="practice-topline">
                <span className="practice-title">
                  <i /> Mode Tantangan Huruf
                </span>
                <button
                  aria-pressed={practiceActive}
                  className={`chip-button ${practiceActive ? "is-active" : ""}`}
                  onClick={() => setPracticeActive((prev) => !prev)}
                  type="button"
                >
                  {practiceActive ? "Aktif" : "Mulai"}
                </button>
              </div>

              {practiceActive && (
                <>
                  <div className="practice-content">
                    {targetEntry && (
                      <img
                        alt={targetEntry.altText}
                        className="practice-thumbnail"
                        src={referenceAssetUrl(targetEntry)}
                      />
                    )}
                    <div className="practice-target-details">
                      <div className="practice-target-row">
                        <span className="practice-target-letter">{targetLetter}</span>
                        <span className="practice-target-badge">
                          {targetEntry?.expectedHands ?? 1} tangan
                        </span>
                        <span className="practice-score">Tercapai: {completedCount}</span>
                      </div>
                      <span className="practice-target-hint" aria-live="polite">
                        {showSuccess
                          ? "Hebat! Pose stabil tercapai ✓"
                          : `Peragakan pose huruf ${targetLetter} dan tahan posisi`}
                      </span>
                      <div
                        aria-label={`Progres pose ${targetLetter}`}
                        aria-valuemax={100}
                        aria-valuemin={0}
                        aria-valuenow={Math.round(holdProgress)}
                        className="practice-progress-bar"
                        role="progressbar"
                      >
                        <div
                          className={`practice-progress-fill ${showSuccess ? "success" : ""}`}
                          style={{ width: `${holdProgress}%` }}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="practice-actions">
                    <button
                      className="transcript-action-btn"
                      disabled={showSuccess}
                      onClick={handleRandomTarget}
                      type="button"
                    >
                      Huruf Acak
                    </button>
                    <button
                      className="transcript-action-btn"
                      disabled={showSuccess}
                      onClick={() => {
                        previousPracticeSampleRef.current = null;
                        setTargetIndex((idx) => (idx + 1) % config.staticLetters.length);
                        setHoldProgress(0);
                      }}
                      type="button"
                    >
                      Lewati
                    </button>
                  </div>
                </>
              )}
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
