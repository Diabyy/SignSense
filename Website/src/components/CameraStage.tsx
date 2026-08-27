import type { RefObject } from "react";

import type { InferenceSnapshot, InferenceStatus } from "../hooks/useSignInference";

interface CameraStageProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  modeLabel: string;
  status: InferenceStatus;
  error: string | null;
  snapshot: InferenceSnapshot;
  onStart: () => void;
  onStop: () => void;
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4.5 7.5h3l1.4-2h6.2l1.4 2h3A1.5 1.5 0 0 1 21 9v8.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5V9a1.5 1.5 0 0 1 1.5-1.5Z" />
      <circle cx="12" cy="13" r="3.2" />
    </svg>
  );
}

export function CameraStage({
  videoRef,
  canvasRef,
  modeLabel,
  status,
  error,
  snapshot,
  onStart,
  onStop,
}: CameraStageProps) {
  const isRunning = status === "running";
  const isLoading = status === "loading-model" || status === "requesting-camera";
  const loadingCopy =
    status === "loading-model" ? `Menyiapkan model ${modeLabel}` : "Meminta akses kamera";

  return (
    <section className="camera-card" aria-label={`Kamera pengenal ${modeLabel}`}>
      <div className="camera-topline">
        <span className="camera-index">01 / LIVE INPUT</span>
        <span className="local-chip"><i /> FRAME LOCAL</span>
      </div>
      <div className="camera-viewport">
        <video ref={videoRef} className="camera-media" muted playsInline />
        <canvas ref={canvasRef} className="camera-media camera-overlay" />
        <div className="frame-guide" aria-hidden="true">
          <span className="corner corner-tl" />
          <span className="corner corner-tr" />
          <span className="corner corner-bl" />
          <span className="corner corner-br" />
          <span className="frame-guide-copy">POSISIKAN TANGAN DI AREA INI</span>
        </div>

        {!isRunning && (
          <div className="camera-empty">
            {isLoading ? (
              <>
                <span className="loader" />
                <strong>{loadingCopy}</strong>
                <p>Frame kamera akan diproses di perangkat ini.</p>
              </>
            ) : (
              <>
                <span className="camera-icon"><CameraIcon /></span>
                <strong>{status === "error" ? "Kamera belum siap" : "Mulai sesi pengenalan"}</strong>
                <p>{error ?? "Browser akan meminta izin kamera. Tidak ada video yang diunggah."}</p>
                <button className="primary-button" type="button" onClick={onStart}>
                  {status === "error" ? "Coba lagi" : "Aktifkan kamera"}
                </button>
              </>
            )}
          </div>
        )}
      </div>
      <div className="camera-statusbar">
        <span><b>{snapshot.detectedHands}</b> tangan</span>
        <span><b>{snapshot.fps ? snapshot.fps.toFixed(1) : "—"}</b> FPS</span>
        <span><b>{snapshot.inferenceMs ? snapshot.inferenceMs.toFixed(0) : "—"}</b> ms</span>
        {isRunning && (
          <button className="text-button danger" type="button" onClick={onStop}>Matikan kamera</button>
        )}
      </div>
    </section>
  );
}
