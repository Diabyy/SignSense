import { startTransition, useCallback, useEffect, useRef, useState } from "react";

import { buildFeatureHypotheses } from "../lib/features";
import {
  clearOverlay,
  closeHandDetectorSet,
  createHandDetectorSet,
  drawHandOverlay,
  drawPaddedVideoFrame,
  nextVideoTimestamp,
  type HandDetectorSet,
} from "../lib/mediapipe";
import type { SignModeConfig } from "../lib/modes";
import { LandmarkMlp, loadLandmarkMlp, type GesturePrediction } from "../lib/mlp";
import { PredictionSmoother, TranscriptLatch } from "../lib/smoothing";

export type InferenceStatus = "idle" | "loading-model" | "requesting-camera" | "running" | "error";

export interface InferenceSnapshot {
  raw: GesturePrediction;
  stableLabel: string;
  stableConfidence: number;
  detectedHands: number;
  fps: number;
  inferenceMs: number;
}

const EMPTY_PREDICTION: GesturePrediction = {
  label: "UNKNOWN",
  confidence: 0,
  probabilities: new Float32Array(0),
  featureHands: 0,
};

const EMPTY_SNAPSHOT: InferenceSnapshot = {
  raw: EMPTY_PREDICTION,
  stableLabel: "UNKNOWN",
  stableConfidence: 0,
  detectedHands: 0,
  fps: 0,
  inferenceMs: 0,
};

function cameraErrorMessage(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError") {
      return "Izin kamera ditolak. Izinkan kamera dari pengaturan situs lalu coba lagi.";
    }
    if (error.name === "NotFoundError") {
      return "Kamera tidak ditemukan pada perangkat ini.";
    }
    if (error.name === "NotReadableError") {
      return "Kamera sedang digunakan aplikasi lain atau tidak dapat dibaca.";
    }
  }
  return error instanceof Error ? error.message : "Terjadi kesalahan saat membuka kamera.";
}

export function useSignInference(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  mode: SignModeConfig,
  onCommit: (label: string) => void,
) {
  const [status, setStatus] = useState<InferenceStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<InferenceSnapshot>(EMPTY_SNAPSHOT);
  const activeDetectorsRef = useRef<HandDetectorSet | null>(null);
  const classifierCacheRef = useRef(new Map<string, LandmarkMlp>());
  const paddingCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRequestRef = useRef<number | null>(null);
  const fallbackFrameRef = useRef<number | null>(null);
  const sessionRef = useRef(0);
  const lastVideoTimestampRef = useRef<number | null>(null);
  const onCommitRef = useRef(onCommit);
  const smootherRef = useRef(new PredictionSmoother());
  const latchRef = useRef(new TranscriptLatch());
  onCommitRef.current = onCommit;

  const cancelFrameLoop = useCallback(() => {
    const video = videoRef.current;
    if (video && frameRequestRef.current !== null && "cancelVideoFrameCallback" in video) {
      video.cancelVideoFrameCallback(frameRequestRef.current);
    }
    if (fallbackFrameRef.current !== null) cancelAnimationFrame(fallbackFrameRef.current);
    frameRequestRef.current = null;
    fallbackFrameRef.current = null;
  }, [videoRef]);

  const closeActiveDetectors = useCallback(() => {
    if (!activeDetectorsRef.current) return;
    closeHandDetectorSet(activeDetectorsRef.current);
    activeDetectorsRef.current = null;
  }, []);

  const stopCamera = useCallback(() => {
    sessionRef.current += 1;
    cancelFrameLoop();
    closeActiveDetectors();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    lastVideoTimestampRef.current = null;
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }
    if (canvasRef.current) clearOverlay(canvasRef.current);
    smootherRef.current.reset();
    latchRef.current.reset();
    setSnapshot(EMPTY_SNAPSHOT);
    setStatus("idle");
  }, [cancelFrameLoop, canvasRef, closeActiveDetectors, videoRef]);

  const startCamera = useCallback(async () => {
    stopCamera();
    const currentSession = sessionRef.current + 1;
    sessionRef.current = currentSession;
    setError(null);

    try {
      setStatus("loading-model");
      const detectors = await createHandDetectorSet(mode.detector);
      if (sessionRef.current !== currentSession) {
        closeHandDetectorSet(detectors);
        return;
      }
      activeDetectorsRef.current = detectors;
      let classifier = classifierCacheRef.current.get(mode.id);
      if (!classifier) {
        const loaded = await loadLandmarkMlp(mode.modelUrl, {
          mode: mode.modelMode,
          classes: [...mode.staticLetters, "UNKNOWN"],
          inferencePolicy: mode.modelInferencePolicy,
          detectorProfile: mode.modelDetectorProfile,
        });
        if (sessionRef.current !== currentSession) return;
        classifierCacheRef.current.set(mode.id, loaded);
        classifier = loaded;
      }
      const activeDetectors = detectors;
      const activeClassifier = classifier;

      setStatus("requesting-camera");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30, max: 30 },
        },
      });
      if (sessionRef.current !== currentSession) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const video = videoRef.current;
      if (!video) throw new Error("Elemen video belum tersedia.");
      streamRef.current = stream;
      video.srcObject = stream;
      await video.play();
      if (sessionRef.current !== currentSession) return;
      setStatus("running");

      let lastProcessedAt = 0;
      let measuredFrom = performance.now();
      let processedFrames = 0;
      let currentFps = 0;

      const schedule = (callback: (timestamp: number) => void) => {
        if ("requestVideoFrameCallback" in video) {
          frameRequestRef.current = video.requestVideoFrameCallback((timestamp) => callback(timestamp));
        } else {
          fallbackFrameRef.current = requestAnimationFrame(callback);
        }
      };

      const processFrame = (timestamp: number) => {
        if (sessionRef.current !== currentSession) return;
        schedule(processFrame);
        if (timestamp - lastProcessedAt < 42 || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
          return;
        }
        lastProcessedAt = timestamp;
        const canvas = canvasRef.current;
        if (!canvas || !video.videoWidth || !video.videoHeight) return;

        try {
          const startedAt = performance.now();
          const videoTimestamp = nextVideoTimestamp(lastVideoTimestampRef.current, startedAt);
          lastVideoTimestampRef.current = videoTimestamp;
          let result = activeDetectors.primary.detectForVideo(video, videoTimestamp);
          let featureWidth = video.videoWidth;
          let featureHeight = video.videoHeight;
          let overlayTransform;
          if (result.landmarks.length === 0 && activeDetectors.fallback) {
            result = activeDetectors.fallback.detect(video);
          }
          if (
            result.landmarks.length === 0 &&
            activeDetectors.paddingRatio &&
            activeDetectors.padding
          ) {
            const paddingCanvas = paddingCanvasRef.current ?? document.createElement("canvas");
            paddingCanvasRef.current = paddingCanvas;
            const geometry = drawPaddedVideoFrame(
              video,
              paddingCanvas,
              activeDetectors.paddingRatio,
            );
            result = activeDetectors.padding.detect(paddingCanvas);
            if (result.landmarks.length > 0) {
              featureWidth = geometry.sourceWidth;
              featureHeight = geometry.sourceHeight;
              overlayTransform = geometry;
            }
          }
          const hypotheses = buildFeatureHypotheses(
            result.landmarks,
            featureWidth,
            featureHeight,
          );
          const prediction = activeClassifier.predictHypotheses(hypotheses);
          const stable = smootherRef.current.update(prediction, startedAt);
          const committed = latchRef.current.update(stable, startedAt);
          if (committed) onCommitRef.current(committed);
          drawHandOverlay(
            canvas,
            result,
            video.videoWidth,
            video.videoHeight,
            overlayTransform,
          );

          processedFrames += 1;
          const elapsed = startedAt - measuredFrom;
          if (elapsed >= 1000) {
            currentFps = (processedFrames * 1000) / elapsed;
            processedFrames = 0;
            measuredFrom = startedAt;
          }
          const inferenceMs = performance.now() - startedAt;
          startTransition(() => {
            setSnapshot({
              raw: prediction,
              stableLabel: stable.label,
              stableConfidence: stable.confidence,
              detectedHands: result.landmarks.length,
              fps: currentFps,
              inferenceMs,
            });
          });
        } catch (frameError) {
          if (sessionRef.current !== currentSession) return;
          stopCamera();
          setError(cameraErrorMessage(frameError));
          setStatus("error");
        }
      };
      schedule(processFrame);
    } catch (startError) {
      if (sessionRef.current !== currentSession) return;
      closeActiveDetectors();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      lastVideoTimestampRef.current = null;
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.srcObject = null;
      }
      if (canvasRef.current) clearOverlay(canvasRef.current);
      smootherRef.current.reset();
      latchRef.current.reset();
      setSnapshot(EMPTY_SNAPSHOT);
      setError(cameraErrorMessage(startError));
      setStatus("error");
    }
  }, [canvasRef, closeActiveDetectors, mode, stopCamera, videoRef]);

  useEffect(() => {
    stopCamera();
    setError(null);
  }, [mode.id, stopCamera]);

  useEffect(() => {
    return () => {
      sessionRef.current += 1;
      cancelFrameLoop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      closeActiveDetectors();
      classifierCacheRef.current.clear();
    };
  }, [cancelFrameLoop, closeActiveDetectors]);

  return { status, error, snapshot, startCamera, stopCamera };
}
