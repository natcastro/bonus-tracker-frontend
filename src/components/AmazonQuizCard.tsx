import { useEffect, useState } from "react";
import {
  AMAZON_QUIZ_CRITERIA, AMAZON_QUIZ_STEPS, EMPTY_AMAZON_QUIZ, FULLTIME_AMAZON_PERF_CAP,
  amazonA2cScore, amazonCriterionScore, amazonGradedCount, amazonQuizBonus, amazonQuizPct,
} from "../services/opsBonus";
import type { AmazonQuiz } from "../services/opsBonus";

const STEP_LABEL: Record<number, string> = { 0: "Nada", 25: "Poco", 50: "Medio", 75: "Bien", 100: "Excelente" };
const num = (v: string): number | null => (v.trim() === "" ? null : Math.max(0, Math.floor(Number(v)) || 0));

// The Amazon Performance quiz for one agent: the reviewer grades each area, the percentage and the dollars update live.
export default function AmazonQuizCard({ name, initial, savedAt, onSave }: {
  name: string; initial: AmazonQuiz | null; savedAt: string; onSave: (quiz: AmazonQuiz, pct: number) => Promise<void>;
}) {
  const [quiz, setQuiz] = useState<AmazonQuiz>(initial ?? EMPTY_AMAZON_QUIZ);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { setQuiz(initial ?? EMPTY_AMAZON_QUIZ); }, [initial]);

  const pct = amazonQuizPct(quiz);
  const bonus = amazonQuizBonus(pct);
  const graded = amazonGradedCount(quiz);
  const total = AMAZON_QUIZ_CRITERIA.length;
  const setScore = (key: string, v: number) => setQuiz(q => ({ ...q, scores: { ...q.scores, [key]: v } }));

  const save = async () => {
    setSaving(true); setError("");
    try { await onSave(quiz, pct); setSaved(true); setTimeout(() => setSaved(false), 2000); }
    catch (e: any) { setError(e?.message ?? "No se pudo guardar."); }
    finally { setSaving(false); }
  };

  const stepBtn = (key: string, v: number, current: number | null) => (
    <button key={v} type="button" onClick={() => setScore(key, v)} aria-pressed={current === v} style={{
      flex: 1, minWidth: 64, padding: "0.45rem 0.3rem", borderRadius: 8, cursor: "pointer", fontSize: "0.78rem", fontWeight: 700,
      border: `1.5px solid ${current === v ? "#16a34a" : "#e2e8f0"}`, background: current === v ? "#dcfce7" : "#fff", color: current === v ? "#166534" : "#475569",
      transition: "background .12s, border-color .12s",
    }}>
      {STEP_LABEL[v]}<span style={{ display: "block", fontSize: "0.68rem", fontWeight: 600, opacity: 0.7 }}>{v}%</span>
    </button>
  );

  return (
    <div className="card" style={{ marginBottom: "1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: "1rem" }}>
        <div>
          <h3 style={{ margin: 0 }}>{name}</h3>
          <p style={{ margin: "0.2rem 0 0", fontSize: "0.8rem", color: "var(--text-muted)" }}>{graded} de {total} áreas calificadas{savedAt ? ` · ${savedAt}` : ""}</p>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: "1.9rem", fontWeight: 800, color: "#16a34a", lineHeight: 1 }}>${bonus.toFixed(2)}</div>
          <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: 4 }}>{pct}% de ${FULLTIME_AMAZON_PERF_CAP}.00</div>
        </div>
      </div>
      <div style={{ height: 8, background: "#e2e8f0", borderRadius: 4, overflow: "hidden", marginBottom: "1.25rem" }}>
        <div style={{ width: `${Math.min(100, pct)}%`, height: "100%", background: "#16a34a", transition: "width .3s", borderRadius: 4 }} />
      </div>

      {AMAZON_QUIZ_CRITERIA.map(c => {
        const score = amazonCriterionScore(quiz, c.key);
        return (
          <div key={c.key} style={{ padding: "0.85rem 0", borderTop: "1px solid #eef2f7" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
              <div>
                <strong style={{ fontSize: "0.92rem" }}>{c.label}</strong>
                <span style={{ marginLeft: 8, fontSize: "0.72rem", fontWeight: 700, color: "#0891b2", background: "#ecfeff", borderRadius: 999, padding: "1px 8px" }}>vale {c.weight}%</span>
                <div style={{ fontSize: "0.76rem", color: "var(--text-muted)" }}>{c.hint}</div>
              </div>
              <div style={{ fontSize: "0.82rem", fontWeight: 700, color: score === null ? "#94a3b8" : "#166534" }}>
                {score === null ? "Sin calificar" : `${score}% → $${((FULLTIME_AMAZON_PERF_CAP * c.weight * score) / 10000).toFixed(2)}`}
              </div>
            </div>
            {c.auto ? (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {([["a2cReceived", "A2Cs recibidos"], ["a2cAnswered", "A2Cs respondidos"], ["a2cAffected", "Afectaron cuenta o dinero"]] as const).map(([k, label]) => (
                  <label key={k} style={{ flex: "1 1 150px", fontSize: "0.74rem", fontWeight: 700, color: "#475569" }}>
                    {label}
                    <input type="number" min={0} className="form-control" style={{ marginTop: 4 }} value={quiz[k] ?? ""} onChange={e => setQuiz(q => ({ ...q, [k]: num(e.target.value) }))} />
                  </label>
                ))}
                {quiz.a2cReceived !== null && quiz.a2cAnswered !== null && quiz.a2cReceived > 0 && (
                  <div style={{ alignSelf: "flex-end", fontSize: "0.8rem", color: "#475569", paddingBottom: 8 }}>{quiz.a2cAnswered} de {quiz.a2cReceived} = {amazonA2cScore(quiz)}%</div>
                )}
              </div>
            ) : (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{AMAZON_QUIZ_STEPS.map(v => stepBtn(c.key, v, score))}</div>
            )}
          </div>
        );
      })}

      <div style={{ borderTop: "1px solid #eef2f7", paddingTop: "0.85rem" }}>
        <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "#475569" }}>Notas (opcional): qué pasó con los A2Cs, apelaciones pendientes, etc.</label>
        <textarea className="form-control" rows={3} style={{ marginTop: 4 }} value={quiz.notes} onChange={e => setQuiz(q => ({ ...q, notes: e.target.value }))} />
      </div>
      {error && <p className="error-msg" style={{ marginTop: 8 }}>{error}</p>}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1rem" }}>
        <button className="btn btn-primary" disabled={saving} style={{ background: saved ? "#16a34a" : undefined }} onClick={save}>{saved ? "Guardado ✓" : saving ? "Guardando…" : "Guardar calificación"}</button>
      </div>
    </div>
  );
}
