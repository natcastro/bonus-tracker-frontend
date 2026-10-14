import { useMemo, useState } from "react";
import { MT } from "../theme";
import { useMarketing } from "../context";
import { PRODUCT_LINES, todayIso, VARIANT_DEFS, normalizeSku, variantsTakenFor } from "../types";
import type { VariantKey } from "../types";

// forReview = Karol proposing a brief: it goes to Laura as a pending draft; Laura reviews, assigns Diseño and publishes it.
export default function NewBriefModal({ onClose, forReview = false }: { onClose: () => void; forReview?: boolean }) {
  const { createBrief, createBriefForReview, createDraftBrief, disenoEmailList, disenoDisplayName, briefs } = useMarketing();
  const [mode, setMode] = useState<"public" | "draft">("public");
  const [reference, setReference] = useState("");
  const [productLine, setProductLine] = useState("");
  const [startDate, setStartDate] = useState(todayIso());
  const [briefLink, setBriefLink] = useState("");
  const [assignedDisenoEmail, setAssignedDisenoEmail] = useState("");
  const [variantKeys, setVariantKeys] = useState<VariantKey[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // One variant per brief: picking one greys out the rest; picking it again frees them.
  const toggleVariant = (key: VariantKey) => setVariantKeys(prev => (prev[0] === key ? [] : [key]));

  // SKU autocomplete: every reference already used in a brief, most recent first.
  const [showSuggest, setShowSuggest] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const knownSkus = useMemo(() => {
    const seen = new Map<string, string>();
    [...briefs].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).forEach(b => { const k = normalizeSku(b.reference); if (k && !seen.has(k)) seen.set(k, b.reference.trim()); });
    return [...seen.values()];
  }, [briefs]);
  const q = normalizeSku(reference);
  const suggestions = knownSkus.filter(r => normalizeSku(r) !== q && (q === "" || normalizeSku(r).includes(q))).slice(0, 6);
  const taken = useMemo(() => variantsTakenFor(briefs, reference), [briefs, reference]);
  const pickSku = (r: string) => { setReference(r); setShowSuggest(false); setActiveIdx(-1); setVariantKeys([]); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reference.trim()) { setError("La referencia del producto es obligatoria."); return; }
    if (!productLine) { setError("La línea de producto es obligatoria."); return; }
    setSaving(true);
    try {
      if (forReview) {
        await createBriefForReview(reference.trim(), productLine, startDate, briefLink.trim(), variantKeys);
      } else if (mode === "draft") {
        await createDraftBrief(reference.trim(), productLine, startDate, briefLink.trim());
      } else {
        await createBrief(reference.trim(), productLine, startDate, briefLink.trim(), assignedDisenoEmail || undefined, variantKeys);
      }
      onClose();
    } catch (err: any) {
      setError(err?.message ?? "No se pudo crear el brief.");
    } finally { setSaving(false); }
  };

  const inputStyle: React.CSSProperties = {
    width: "100%", fontFamily: MT.font, fontSize: 13.5, padding: "9px 11px",
    border: `1px solid ${MT.border}`, borderRadius: 8, outline: "none", boxSizing: "border-box",
  };
  const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: MT.text2, display: "block", marginBottom: 6 };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: MT.font }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(44,42,32,0.35)" }} />
      <div style={{
        position: "relative", width: 460, maxWidth: "92vw", background: MT.surface,
        borderRadius: MT.radiusLg, boxShadow: MT.shadowLg, padding: 26,
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: MT.text3, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
          Nuevo brief
        </div>
        <h3 style={{ margin: "0 0 14px", color: MT.text1, fontSize: 18 }}>{forReview ? "Enviar brief a Laura" : "Crear brief de producto"}</h3>

        {!forReview && <div style={{ display: "flex", gap: 6, marginBottom: 18, background: MT.surfaceAlt, borderRadius: 8, padding: 3 }}>
          {([["public", "Tarea pública"], ["draft", "Tarea pendiente (privada)"]] as const).map(([m, label]) => (
            <button key={m} type="button" onClick={() => setMode(m)} style={{
              flex: 1, fontFamily: MT.font, fontSize: 12.5, fontWeight: 700, cursor: "pointer",
              padding: "8px 10px", borderRadius: 6, border: "none",
              background: mode === m ? MT.surface : "transparent",
              color: mode === m ? MT.text1 : MT.text2,
              boxShadow: mode === m ? MT.shadow : "none",
            }}>{label}</button>
          ))}
        </div>}

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label style={labelStyle}>Referencia del producto</label>
            <div style={{ position: "relative" }}>
              <input
                style={inputStyle} value={reference} placeholder="C-054" autoFocus required autoComplete="off"
                role="combobox" aria-expanded={showSuggest && suggestions.length > 0} aria-autocomplete="list"
                onChange={e => { setReference(e.target.value); setShowSuggest(true); setActiveIdx(-1); setVariantKeys(k => k.filter(x => !variantsTakenFor(briefs, e.target.value).has(x))); }}
                onFocus={() => setShowSuggest(true)}
                onBlur={() => setShowSuggest(false)}
                onKeyDown={e => {
                  if (!showSuggest || suggestions.length === 0) return;
                  if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx(i => (i + 1) % suggestions.length); }
                  else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIdx(i => (i <= 0 ? suggestions.length - 1 : i - 1)); }
                  else if (e.key === "Enter" && activeIdx >= 0) { e.preventDefault(); pickSku(suggestions[activeIdx]); }
                  else if (e.key === "Escape") { e.stopPropagation(); setShowSuggest(false); }
                }}
              />
              {showSuggest && suggestions.length > 0 && (
                <ul role="listbox" style={{ position: "absolute", left: 0, right: 0, top: "calc(100% + 4px)", zIndex: 5, margin: 0, padding: 4, listStyle: "none", background: MT.surface, border: `1px solid ${MT.border}`, borderRadius: 10, boxShadow: MT.shadowLg, maxHeight: 220, overflowY: "auto" }}>
                  {suggestions.map((r, i) => {
                    const n = variantsTakenFor(briefs, r).size;
                    return (
                      <li key={r} role="option" aria-selected={i === activeIdx}
                        onMouseDown={e => { e.preventDefault(); pickSku(r); }}
                        onMouseEnter={() => setActiveIdx(i)}
                        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 7, cursor: "pointer", fontSize: 13, color: MT.text1, background: i === activeIdx ? MT.surfaceAlt : "transparent" }}>
                        <span style={{ fontWeight: 600 }}>{r}</span>
                        {n > 0 && <span style={{ fontSize: 11, color: MT.text3 }}>{n} variante{n === 1 ? "" : "s"} con brief</span>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
          <div>
            <label style={labelStyle}>Línea de producto</label>
            <select style={inputStyle} value={productLine} onChange={e => setProductLine(e.target.value)} required>
              <option value="" disabled>Selecciona una línea...</option>
              {PRODUCT_LINES.map(line => <option key={line} value={line}>{line}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>{mode === "draft" ? "Fecha estimada de inicio" : "Fecha de inicio (Día 1)"}</label>
            <input type="date" style={inputStyle} value={startDate} onChange={e => setStartDate(e.target.value)} required />
          </div>
          <div>
            <label style={labelStyle}>Link de SharePoint del brief</label>
            <input style={inputStyle} value={briefLink} onChange={e => setBriefLink(e.target.value)} placeholder="https://formatucuerpo.sharepoint.com/..." />
          </div>
          {mode === "public" ? (
            <>
              {!forReview && <div>
                <label style={labelStyle}>Asignar a Diseño (opcional)</label>
                <select style={inputStyle} value={assignedDisenoEmail} onChange={e => setAssignedDisenoEmail(e.target.value)}>
                  <option value="">Sin asignar — avisar a Karol</option>
                  {disenoEmailList.map(email => <option key={email} value={email}>{disenoDisplayName(email)}</option>)}
                </select>
              </div>}
              {forReview && <p style={{ fontSize: 12, color: MT.text3, margin: 0 }}>Laura recibe un aviso, revisa el brief y lo publica asignándolo a Diseño. Hasta entonces no corre ningún plazo.</p>}
              <div>
                <label style={labelStyle}>Variante (opcional — una por brief; déjala vacía si el producto no tiene variantes)</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.45rem" }}>
                  {VARIANT_DEFS.map(v => {
                    const isTaken = taken.has(v.key);
                    const selected = variantKeys[0] === v.key;
                    const greyed = !isTaken && variantKeys.length > 0 && !selected;
                    const disabled = isTaken || greyed;
                    return (
                      <button key={v.key} type="button" disabled={disabled} aria-pressed={selected} onClick={() => toggleVariant(v.key)}
                        title={isTaken ? "Esta variante ya tiene un brief" : greyed ? "Ya elegiste otra variante — deselecciónala para cambiar" : undefined}
                        style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, textAlign: "left",
                          fontFamily: MT.font, fontSize: 12.5, fontWeight: 600, padding: "9px 11px", borderRadius: 8,
                          cursor: disabled ? "not-allowed" : "pointer",
                          border: `1.5px solid ${selected ? MT.primary : isTaken ? "#86c79a" : MT.border}`,
                          background: selected ? MT.primarySoft : isTaken ? "#eef8f1" : MT.surface,
                          color: isTaken ? "#2f7a4b" : greyed ? MT.text3 : MT.text1,
                          opacity: greyed ? 0.5 : 1, transition: "opacity .15s, border-color .15s, background .15s",
                        }}>
                        <span>{v.label}</span>
                        {isTaken ? <span style={{ fontSize: 11, fontWeight: 700 }}>✓ ya tiene brief</span> : selected ? <span aria-hidden>●</span> : null}
                      </button>
                    );
                  })}
                </div>
                <p style={{ fontSize: 11.5, color: MT.text3, margin: "6px 0 0" }}>
                  {taken.size > 0
                    ? "Las que tienen ✓ ya tienen su brief. Para otra variante, crea un brief aparte."
                    : "Cada brief lleva una sola variante. Si necesitas otra, crea un brief aparte."}
                </p>
              </div>
            </>
          ) : (
            <p style={{ fontSize: 12, color: MT.text3, margin: 0 }}>
              Nadie es notificado todavía. La podrás publicar cuando quieras desde el detalle del brief.
            </p>
          )}

          {error && <div style={{ fontSize: 12.5, color: MT.danger, background: MT.dangerSoft, borderRadius: 8, padding: "8px 12px" }}>{error}</div>}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 6 }}>
            <button type="button" onClick={onClose} style={{
              fontFamily: MT.font, fontSize: 13.5, fontWeight: 600, cursor: "pointer",
              background: "transparent", color: MT.text2, border: "none", padding: "10px 16px",
            }}>Cancelar</button>
            <button type="submit" disabled={saving} style={{
              fontFamily: MT.font, fontSize: 13.5, fontWeight: 700, cursor: saving ? "not-allowed" : "pointer",
              background: MT.primary, color: "#fff", border: "none", borderRadius: 8, padding: "10px 18px",
            }}>{saving ? "Creando..." : forReview ? "Enviar a Laura" : mode === "draft" ? "Crear tarea pendiente" : "Crear brief"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
