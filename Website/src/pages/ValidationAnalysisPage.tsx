import { useRef, useState, type ChangeEvent } from "react";

import {
  analyzeValidationSessions,
  isCurrentValidationImport,
  parseValidationReport,
  type ValidationAnalysis,
} from "../lib/validation-analysis";

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatMetric(value: number | null, suffix: string): string {
  return value === null ? "—" : `${value.toFixed(1)} ${suffix}`;
}

export function ValidationAnalysisPage() {
  const [analysis, setAnalysis] = useState<ValidationAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileNames, setFileNames] = useState<string[]>([]);
  const importRequestRef = useRef(0);

  const handleFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const requestId = ++importRequestRef.current;
    const input = event.currentTarget;
    const files = [...(input.files ?? [])];
    setError(null);
    setAnalysis(null);
    setFileNames([]);
    if (files.length === 0) return;

    try {
      const sessions = await Promise.all(
        files.map(async (file) => parseValidationReport(await file.text())),
      );
      if (!isCurrentValidationImport(requestId, importRequestRef.current)) return;
      setAnalysis(analyzeValidationSessions(sessions));
      setFileNames(files.map((file) => file.name));
    } catch (caught) {
      if (!isCurrentValidationImport(requestId, importRequestRef.current)) return;
      setError(
        caught instanceof Error
          ? caught.message
          : "Laporan tidak dapat dianalisis.",
      );
      input.value = "";
    }
  };

  return (
    <div className="page-shell validation-analysis-page">
      <header className="page-heading validation-heading">
        <p className="eyebrow"><span />Evaluasi lokal</p>
        <h1>Analisis validasi multi-signer</h1>
        <p>
          Gabungkan hasil sesi dari beberapa pengguna untuk melihat completion,
          UNKNOWN, detector miss, runtime, dan pola prediksi per huruf.
        </p>
      </header>

      <section className="panel validation-import-panel">
        <div>
          <p className="note-label">IMPOR LAPORAN V1</p>
          <h2>Pilih beberapa file JSON dari mode yang sama.</h2>
          <p>
            File diproses lokal di browser. SignSense tidak mengunggah isi laporan.
          </p>
        </div>
        <label className="button validation-file-button">
          Pilih file JSON
          <input
            accept="application/json,.json"
            multiple
            onChange={handleFiles}
            type="file"
          />
        </label>
      </section>

      {error && (
        <p className="validation-error" role="alert">
          {error}
        </p>
      )}

      {analysis && (
        <>
          <section aria-label="Ringkasan validasi" className="validation-summary-grid">
            <article className="panel validation-metric">
              <span>Sesi</span><strong>{analysis.sessionCount}</strong>
            </article>
            <article className="panel validation-metric">
              <span>Attempt</span><strong>{analysis.totalAttempts}</strong>
            </article>
            <article className="panel validation-metric">
              <span>Completion</span><strong>{formatPercent(analysis.completionRate)}</strong>
            </article>
            <article className="panel validation-metric">
              <span>UNKNOWN</span><strong>{formatPercent(analysis.unknownRate)}</strong>
            </article>
            <article className="panel validation-metric">
              <span>Detector miss</span><strong>{formatPercent(analysis.detectorMissRate)}</strong>
            </article>
            <article className="panel validation-metric">
              <span>Mean inference</span>
              <strong>{formatMetric(analysis.meanInferenceMs, "ms")}</strong>
            </article>
            <article className="panel validation-metric">
              <span>Mean FPS</span>
              <strong>{formatMetric(analysis.meanFps, "FPS")}</strong>
            </article>
          </section>

          <section className="panel validation-table-panel">
            <div className="validation-table-heading">
              <div>
                <p className="note-label">PER HURUF / {analysis.mode.toUpperCase()}</p>
                <h2>Hasil agregat</h2>
              </div>
              <p>{fileNames.length} file tervalidasi</p>
            </div>
            <div className="validation-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Huruf</th>
                    <th>Attempt</th>
                    <th>Selesai</th>
                    <th>Completion</th>
                    <th>Mean selesai</th>
                    <th>Prediksi tercatat</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.perLetter.map((row) => (
                    <tr key={row.letter}>
                      <th scope="row">{row.letter}</th>
                      <td>{row.attempts}</td>
                      <td>{row.completed}</td>
                      <td>{formatPercent(row.completionRate)}</td>
                      <td>{formatMetric(row.meanCompletionMs, "ms")}</td>
                      <td>
                        {Object.entries(row.predictions)
                          .sort(([left], [right]) => left.localeCompare(right))
                          .map(([label, count]) => `${label}: ${count}`)
                          .join(" · ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {!analysis && !error && (
        <section className="info-grid validation-empty-state">
          <article className="panel note-panel">
            <p className="note-label">INTEGRITAS DATA</p>
            <p>ID sesi duplikat ditolak agar satu signer tidak terhitung dua kali.</p>
          </article>
          <article className="panel note-panel">
            <p className="note-label">BATAS INTERPRETASI</p>
            <p>Dashboard tidak membuktikan generalisasi tanpa pengguna baru yang nyata.</p>
          </article>
        </section>
      )}
    </div>
  );
}
