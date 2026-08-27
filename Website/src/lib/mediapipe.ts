import {
  FilesetResolver,
  HandLandmarker,
  type HandLandmarkerResult,
} from "@mediapipe/tasks-vision";

import handLandmarkerModelUrl from "../../../models/mediapipe/hand_landmarker.task?url";
import type { DetectorConfig } from "./modes";

export interface HandDetectorSet {
  primary: HandLandmarker;
  fallback: HandLandmarker | null;
  padding: HandLandmarker | null;
  paddingRatio: number | null;
}

export interface PaddedFrameGeometry {
  sourceWidth: number;
  sourceHeight: number;
  offsetX: number;
  offsetY: number;
}

async function createDetector(
  vision: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>,
  confidence: number,
  runningMode: "IMAGE" | "VIDEO",
): Promise<HandLandmarker> {
  return HandLandmarker.createFromOptions(vision, {
    baseOptions: { modelAssetPath: handLandmarkerModelUrl },
    runningMode,
    numHands: 2,
    minHandDetectionConfidence: confidence,
    minHandPresenceConfidence: confidence,
    minTrackingConfidence: 0.5,
  });
}

export async function createHandDetectorSet(config: DetectorConfig): Promise<HandDetectorSet> {
  const wasmPath = `${import.meta.env.BASE_URL}mediapipe`;
  const vision = await FilesetResolver.forVisionTasks(wasmPath);
  const primary = await createDetector(vision, config.primaryConfidence, "VIDEO");
  let fallback: HandLandmarker | null = null;
  try {
    fallback = config.fallbackConfidence
      ? await createDetector(vision, config.fallbackConfidence, "IMAGE")
      : null;
    const padding = config.paddingRatio
      ? await createDetector(
          vision,
          config.paddingConfidence ?? config.primaryConfidence,
          "IMAGE",
        )
      : null;
    return { primary, fallback, padding, paddingRatio: config.paddingRatio ?? null };
  } catch (error) {
    primary.close();
    fallback?.close();
    throw error;
  }
}

export function closeHandDetectorSet(detectors: HandDetectorSet): void {
  detectors.primary.close();
  detectors.fallback?.close();
  detectors.padding?.close();
}

export function nextVideoTimestamp(lastTimestamp: number | null, requestedTimestamp: number): number {
  const nextTimestamp = Math.ceil(requestedTimestamp);
  return lastTimestamp === null ? nextTimestamp : Math.max(nextTimestamp, lastTimestamp + 1);
}

export function drawPaddedVideoFrame(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  ratio: number,
): PaddedFrameGeometry {
  const width = video.videoWidth;
  const height = video.videoHeight;
  const border = Math.max(1, Math.round(Math.max(width, height) * ratio));
  const paddedWidth = width + border * 2;
  const paddedHeight = height + border * 2;
  if (canvas.width !== paddedWidth || canvas.height !== paddedHeight) {
    canvas.width = paddedWidth;
    canvas.height = paddedHeight;
  }
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Canvas fallback detector tidak tersedia.");

  context.drawImage(video, 0, 0, 1, 1, 0, 0, border, border);
  context.drawImage(video, width - 1, 0, 1, 1, border + width, 0, border, border);
  context.drawImage(video, 0, height - 1, 1, 1, 0, border + height, border, border);
  context.drawImage(
    video,
    width - 1,
    height - 1,
    1,
    1,
    border + width,
    border + height,
    border,
    border,
  );
  context.drawImage(video, 0, 0, width, 1, border, 0, width, border);
  context.drawImage(video, 0, height - 1, width, 1, border, border + height, width, border);
  context.drawImage(video, 0, 0, 1, height, 0, border, border, height);
  context.drawImage(video, width - 1, 0, 1, height, border + width, border, border, height);
  context.drawImage(video, border, border, width, height);

  return {
    sourceWidth: paddedWidth,
    sourceHeight: paddedHeight,
    offsetX: border,
    offsetY: border,
  };
}

const HAND_CONNECTIONS = HandLandmarker.HAND_CONNECTIONS;
const HAND_COLORS = ["#d9ff68", "#ff8066"];

export function drawHandOverlay(
  canvas: HTMLCanvasElement,
  result: HandLandmarkerResult,
  width: number,
  height: number,
  transform?: PaddedFrameGeometry,
): void {
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const context = canvas.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, width, height);
  context.lineCap = "round";
  context.lineJoin = "round";

  const pointX = (x: number) =>
    transform ? x * transform.sourceWidth - transform.offsetX : x * width;
  const pointY = (y: number) =>
    transform ? y * transform.sourceHeight - transform.offsetY : y * height;

  result.landmarks.forEach((hand, handIndex) => {
    const color = HAND_COLORS[handIndex % HAND_COLORS.length]!;
    context.strokeStyle = color;
    context.lineWidth = Math.max(2, width / 320);
    context.globalAlpha = 0.85;
    for (const connection of HAND_CONNECTIONS) {
      const start = hand[connection.start];
      const end = hand[connection.end];
      if (!start || !end) continue;
      context.beginPath();
      context.moveTo(pointX(start.x), pointY(start.y));
      context.lineTo(pointX(end.x), pointY(end.y));
      context.stroke();
    }
    context.fillStyle = color;
    context.globalAlpha = 1;
    hand.forEach((point, pointIndex) => {
      context.beginPath();
      context.arc(
        pointX(point.x),
        pointY(point.y),
        pointIndex === 0 ? Math.max(4, width / 150) : Math.max(2.5, width / 240),
        0,
        Math.PI * 2,
      );
      context.fill();
    });
  });
}

export function clearOverlay(canvas: HTMLCanvasElement): void {
  canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
}
