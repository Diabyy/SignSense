import generatedCatalog from "./alphabet.generated.json";
import type { SignMode } from "../lib/modes";

export type SignForm = "static" | "dynamic";

export interface AlphabetEntry {
  mode: SignMode;
  letter: string;
  form: SignForm;
  expectedHands: number;
  modelStatus: "recognized" | "deferred";
  reviewStatus: "provisional";
  regionStatus: "not-documented";
  frameOnly: boolean;
  assetPath: string;
  assetSha256: string;
  sampleId: string;
  originalPath: string;
  originalSha256: string;
  sourceId: string;
  sourceName: string;
  sourceAuthors: string[];
  sourceUrl: string;
  sourceDoi: string | null;
  license: string;
  licenseUrl: string;
  cropBox: [number, number, number, number];
  transformation: string;
  altText: string;
}

interface AlphabetCatalog {
  schemaVersion: number;
  generatedAt: string;
  modes: Record<SignMode, AlphabetEntry[]>;
}

export const alphabetCatalog = generatedCatalog as AlphabetCatalog;

export function isSignMode(value: string | undefined): value is SignMode {
  return value === "bisindo" || value === "asl";
}

export function getAlphabet(mode: SignMode): AlphabetEntry[] {
  return alphabetCatalog.modes[mode];
}

export function getLetter(mode: SignMode, letter: string | undefined): AlphabetEntry | undefined {
  return getAlphabet(mode).find((entry) => entry.letter === letter?.toUpperCase());
}

export function referenceAssetUrl(entry: AlphabetEntry): string {
  return `${import.meta.env.BASE_URL}${entry.assetPath}`;
}
