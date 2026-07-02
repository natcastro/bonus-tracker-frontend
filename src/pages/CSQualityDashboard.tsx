import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import type { CSQualityCase } from "../types";
import { getCSCases, createCSCase, updateCSCase, approveCSCase, rejectCSCase, addCSPhoto, deleteCSPhoto } from "../services/api";

const ADMIN_PASSWORD = "Calidad2026!";
const CATEGORY_COLORS = ["#7c3aed", "#0891b2", "#d97706", "#db2777", "#059669", "#dc2626", "#4f46e5", "#0ea5e9"];

function catColor(cat: string): string {
  if (!cat) return CATEGORY_COLORS[0];
  let h = 0;
  for (const ch of cat) h = (h * 31 + ch.charCodeAt(0)) % 1000;
  return CATEGORY_COLORS[Math.abs(h) % CATEGORY_COLORS.length];
}

const EMPTY_FORM = { title: "", description: "", category: "", warrantyApplies: false, code: "" };

const placeholderBg = (w: boolean) =>
  w ? "linear-gradient(135deg,#dcfce7 0%,#86efac 100%)" : "linear-gradient(135deg,#fee2e2 0%,#fca5a5 100%)";

export default function CSQualityDashboard() {
  const navigate = useNavigate();

  // ── Data ───────────────────────────────────────────────────────────────────
  const [cases, setCases] = useState<CSQualityCase[]>([]);
  const [pending, setPending] = useState<CSQualityCase[]>([]);

  // ── UI state ───────────────────────────────────────────────────────────────
  const [selected, setSelected] = useState<CSQualityCase | null>(null);
  const [search, setSearch] = useState("");
  const [filterWarranty, setFilterWarranty] = useState<"all" | "yes" | "no">("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ── Submit new case (anyone) ───────────────────────────────────────────────
  const [showSubmit, setShowSubmit] = useState(false);
  const [submitForm, setSubmitForm] = useState(EMPTY_FORM);
  const [submitPhotos, setSubmitPhotos] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const submitFileRef = useRef<HTMLInputElement>(null);

  // ── Admin ──────────────────────────────────────────────────────────────────
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminPwInput, setAdminPwInput] = useState("");
  const [adminPwError, setAdminPwError] = useState("");
  const [showPendingPanel, setShowPendingPanel] = useState(false);

  // Admin: approve flow
  const [approveCodes, setApproveCodes] = useState<Record<number, string>>({});

  // Admin: edit non-warranty case
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // Admin: add photo to existing case
  const [uploading, setUploading] = useState(false);
  const [photoCaption, setPhotoCaption] = useState("");
  const photoFileRef = useRef<HTMLInputElement>(null);

  // ── Load ───────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    try {
      const [approved, pend] = await Promise.all([
        getCSCases("approved"),
        isAdmin ? getCSCases("pending") : Promise.resolve([]),
      ]);
      setCases(approved);
      setPending(pend);
      setSelected((prev) => (prev ? (approved.find((c) => c.id === prev.id) ?? null) : null));
      setError(null);
    } catch (e: any) {
      setError("Error de base de datos: " + (e?.message ?? String(e)));
    }
  }, [isAdmin]);

  useEffect(() => { load(); }, [load]);

  // ── Filters ────────────────────────────────────────────────────────────────
  const categories = Array.from(new Set(cases.map((c) => c.category).filter(Boolean)));
  const filtered = cases.filter((c) => {
    if (search) {
      const q = search.toLowerCase();
      if (!c.title.toLowerCase().includes(q) && !c.description.toLowerCase().includes(q) && !c.category.toLowerCase().includes(q) && !c.code.toLowerCase().includes(q)) return false;
    }
    if (filterWarranty === "yes" && !c.warrantyApplies) return false;
    if (filterWarranty === "no" && c.warrantyApplies) return false;
    if (filterCategory !== "all" && c.category !== filterCategory) return false;
    return true;
  });

  // ── Submit case (anyone → pending) ────────────────────────────────────────
  const handleSubmitCase = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const created = await createCSCase(submitForm, "pending");
      for (const file of submitPhotos) await addCSPhoto(created.id, file, "");
      setSubmitSuccess(true);
      setShowSubmit(false);
      setSubmitForm(EMPTY_FORM);
      setSubmitPhotos([]);
      setTimeout(() => setSubmitSuccess(false), 3000);
    } catch (ex: any) { setError("Error al enviar: " + (ex?.message ?? ex)); }
    finally { setSubmitting(false); }
  };

  const handleSubmitPhotoPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    setSubmitPhotos((prev) => [...prev, ...Array.from(e.target.files!)]);
    if (submitFileRef.current) submitFileRef.current.value = "";
  };

  // ── Admin login ────────────────────────────────────────────────────────────
  const handleAdminLogin = () => {
    if (adminPwInput === ADMIN_PASSWORD) {
      setIsAdmin(true);
      setShowAdminLogin(false);
      setAdminPwInput("");
      setAdminPwError("");
    } else {
      setAdminPwError("Contraseña incorrecta.");
    }
  };

  // ── Admin: approve pending case ────────────────────────────────────────────
  const handleApprove = async (id: number) => {
    try {
      await approveCSCase(id, approveCodes[id] ?? "");
      setApproveCodes((prev) => { const n = { ...prev }; delete n[id]; return n; });
      await load();
    } catch (ex: any) { setError("Error al aprobar: " + (ex?.message ?? ex)); }
  };

  const handleReject = async (id: number) => {
    if (!confirm("¿Rechazar y eliminar esta solicitud?")) return;
    try { await rejectCSCase(id); await load(); }
    catch (ex: any) { setError("Error al rechazar: " + (ex?.message ?? ex)); }
  };

  // ── Admin: edit non-warranty case ─────────────────────────────────────────
  const handleEditSave = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await updateCSCase(selected.id, editForm);
      setEditMode(false);
      await load();
    } catch (ex: any) { setError("Error al guardar: " + (ex?.message ?? ex)); }
    finally { setSaving(false); }
  };

  // ── Admin: add photo ───────────────────────────────────────────────────────
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selected || !e.target.files?.[0]) return;
    setUploading(true);
    try {
      await addCSPhoto(selected.id, e.target.files[0], photoCaption);
      setPhotoCaption("");
      if (photoFileRef.current) photoFileRef.current.value = "";
      await load();
    } catch (ex: any) { setError("Error al subir foto: " + (ex?.message ?? ex)); }
    finally { setUploading(false); }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f8f7f5" }}>
      {/* ── Nav ──────────────────────────────────────────────────────────────── */}
      <nav className="top-nav">
        <div className="logo">Bonus Tracker — <span style={{ color: "#7c3aed" }}>CS Quality Dictionary</span></div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          {isAdmin && pending.length > 0 && (
            <button
              className="btn btn-sm"
              style={{ background: "#f59e0b", borderColor: "#f59e0b", color: "white", fontWeight: 700 }}
              onClick={() => setShowPendingPanel(true)}
            >
              ⏳ {pending.length} pendiente{pending.length > 1 ? "s" : ""}
            </button>
          )}
          {isAdmin
            ? <button className="btn btn-secondary btn-sm" onClick={() => { setIsAdmin(false); setPending([]); }}>🔓 Cerrar sesión admin</button>
            : <button className="btn btn-secondary btn-sm" onClick={() => { setShowAdminLogin(true); setAdminPwInput(""); setAdminPwError(""); }}>🔑 Admin</button>
          }
          <button className="btn btn-secondary btn-sm" onClick={() => { sessionStorage.clear(); navigate("/"); }}>Salir</button>
        </div>
      </nav>

      <main style={{ padding: "1.5rem", maxWidth: 1280, margin: "0 auto" }}>
        {/* Error banner */}
        {error && (
          <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 10, padding: "0.75rem 1rem", marginBottom: "1.25rem", color: "#dc2626", fontSize: "0.88rem" }}>
            ⚠️ {error}
            <details style={{ marginTop: "0.4rem" }}>
              <summary style={{ cursor: "pointer", fontSize: "0.78rem", opacity: 0.7 }}>Ver SQL para crear tablas</summary>
              <pre style={{ fontSize: "0.72rem", background: "#fff5f5", padding: "0.5rem", borderRadius: 6, marginTop: "0.4rem", whiteSpace: "pre-wrap" }}>{`CREATE TABLE IF NOT EXISTS cs_quality_cases (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  code TEXT NOT NULL DEFAULT '',
  warranty_applies BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE cs_quality_cases DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS cs_quality_photos (
  id BIGSERIAL PRIMARY KEY,
  case_id BIGINT REFERENCES cs_quality_cases(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  caption TEXT NOT NULL DEFAULT ''
);
ALTER TABLE cs_quality_photos DISABLE ROW LEVEL SECURITY;

-- If tables already exist, add new columns:
ALTER TABLE cs_quality_cases ADD COLUMN IF NOT EXISTS code TEXT NOT NULL DEFAULT '';
ALTER TABLE cs_quality_cases ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'approved';`}</pre>
            </details>
          </div>
        )}

        {submitSuccess && (
          <div style={{ background: "#dcfce7", border: "1px solid #86efac", borderRadius: 10, padding: "0.75rem 1rem", marginBottom: "1rem", color: "#16a34a", fontWeight: 600 }}>
            ✅ Tu caso fue enviado y está pendiente de aprobación. ¡Gracias!
          </div>
        )}

        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <div style={{ textAlign: "center", marginBottom: "2rem", paddingTop: "0.5rem" }}>
          <div style={{ fontSize: "3rem", lineHeight: 1 }}>📖</div>
          <h1 style={{ margin: "0.4rem 0 0.2rem", fontSize: "2rem", fontWeight: 900, letterSpacing: "-0.03em", color: "#0f172a" }}>
            Diccionario de Calidad CS
          </h1>
          <p style={{ margin: "0 0 0.75rem", color: "#64748b", fontSize: "0.92rem" }}>
            Referencia de casos — cuándo aplica garantía y cuándo no
          </p>
          <div style={{ display: "flex", justifyContent: "center", gap: "1.5rem", marginBottom: "1rem", fontSize: "0.82rem", color: "#94a3b8" }}>
            <span><strong style={{ color: "#16a34a" }}>{cases.filter((c) => c.warrantyApplies).length}</strong> aplican garantía</span>
            <span><strong style={{ color: "#dc2626" }}>{cases.filter((c) => !c.warrantyApplies).length}</strong> no aplican</span>
          </div>
          <button
            className="btn btn-primary"
            style={{ background: "#7c3aed", borderColor: "#7c3aed", borderRadius: 100, padding: "0.55rem 1.4rem" }}
            onClick={() => { setShowSubmit(true); setSubmitForm(EMPTY_FORM); setSubmitPhotos([]); }}
          >
            + Enviar nuevo caso
          </button>
        </div>

        {/* ── Search + filters ──────────────────────────────────────────────── */}
        <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem", flexWrap: "wrap", alignItems: "center" }}>
          <input
            type="search"
            placeholder="🔍  Buscar por título, código, categoría..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1, minWidth: 220, padding: "0.6rem 1.1rem", borderRadius: 100, border: "1.5px solid #e2e8f0", fontSize: "0.9rem", background: "white", outline: "none", boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}
          />
          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
            {(["all", "yes", "no"] as const).map((v) => (
              <button key={v} onClick={() => setFilterWarranty(v)} style={{
                padding: "0.45rem 1rem", borderRadius: 100, fontSize: "0.8rem", cursor: "pointer",
                fontWeight: filterWarranty === v ? 700 : 400, border: "1.5px solid",
                borderColor: filterWarranty === v ? (v === "yes" ? "#16a34a" : v === "no" ? "#dc2626" : "#7c3aed") : "#e2e8f0",
                background: filterWarranty === v ? (v === "yes" ? "#dcfce7" : v === "no" ? "#fee2e2" : "#ede9fe") : "white",
                color: filterWarranty === v ? (v === "yes" ? "#16a34a" : v === "no" ? "#dc2626" : "#7c3aed") : "#64748b",
              }}>
                {v === "all" ? "Todos" : v === "yes" ? "✅ Aplica garantía" : "❌ No aplica"}
              </button>
            ))}
          </div>
        </div>

        {/* Category chips */}
        {categories.length > 0 && (
          <div style={{ display: "flex", gap: "0.4rem", marginBottom: "1.75rem", flexWrap: "wrap" }}>
            <button onClick={() => setFilterCategory("all")} style={{ padding: "0.28rem 0.9rem", borderRadius: 100, fontSize: "0.73rem", cursor: "pointer", border: "1.5px solid", borderColor: filterCategory === "all" ? "#7c3aed" : "#e2e8f0", background: filterCategory === "all" ? "#7c3aed" : "white", color: filterCategory === "all" ? "white" : "#64748b", fontWeight: 600 }}>Todas</button>
            {categories.map((cat) => (
              <button key={cat} onClick={() => setFilterCategory(cat)} style={{ padding: "0.28rem 0.9rem", borderRadius: 100, fontSize: "0.73rem", cursor: "pointer", border: "1.5px solid", borderColor: filterCategory === cat ? catColor(cat) : "#e2e8f0", background: filterCategory === cat ? catColor(cat) : "white", color: filterCategory === cat ? "white" : "#64748b", fontWeight: 600 }}>{cat}</button>
            ))}
          </div>
        )}

        {/* ── Card grid ─────────────────────────────────────────────────────── */}
        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "5rem 2rem", color: "#94a3b8" }}>
            <div style={{ fontSize: "3.5rem" }}>🔍</div>
            <p style={{ marginTop: "0.5rem", fontSize: "1rem" }}>
              {cases.length === 0 ? "El diccionario está vacío. ¡Envía el primer caso!" : "Sin resultados para esa búsqueda."}
            </p>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(270px, 1fr))", gap: "1.25rem" }}>
            {filtered.map((c) => {
              const cover = c.photos?.[0]?.url;
              return (
                <div
                  key={c.id}
                  onClick={() => { setSelected(c); setEditMode(false); }}
                  style={{ background: "white", borderRadius: 18, overflow: "hidden", boxShadow: "0 2px 16px rgba(0,0,0,0.07)", cursor: "pointer", transition: "transform 0.15s ease, box-shadow 0.15s ease", display: "flex", flexDirection: "column" }}
                  onMouseEnter={(e) => { const el = e.currentTarget as HTMLDivElement; el.style.transform = "translateY(-5px)"; el.style.boxShadow = "0 12px 40px rgba(0,0,0,0.14)"; }}
                  onMouseLeave={(e) => { const el = e.currentTarget as HTMLDivElement; el.style.transform = "translateY(0)"; el.style.boxShadow = "0 2px 16px rgba(0,0,0,0.07)"; }}
                >
                  {/* Cover */}
                  <div style={{ height: 190, background: cover ? undefined : placeholderBg(c.warrantyApplies), overflow: "hidden", position: "relative", flexShrink: 0 }}>
                    {cover
                      ? <img src={cover} alt={c.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "3rem", opacity: 0.35 }}>{c.warrantyApplies ? "✅" : "❌"}</div>
                    }
                    {(c.photos?.length ?? 0) > 0 && (
                      <div style={{ position: "absolute", bottom: 8, right: 8, background: "rgba(0,0,0,0.45)", backdropFilter: "blur(6px)", color: "white", fontSize: "0.68rem", padding: "2px 8px", borderRadius: 100 }}>
                        📷 {c.photos!.length}
                      </div>
                    )}
                    {/* Warranty ribbon */}
                    <div style={{ position: "absolute", top: 12, left: -24, width: 110, textAlign: "center", background: c.warrantyApplies ? "#16a34a" : "#dc2626", color: "white", fontSize: "0.62rem", fontWeight: 800, padding: "4px 0", transform: "rotate(-35deg) translateX(10px)", letterSpacing: "0.06em", textTransform: "uppercase", boxShadow: "0 2px 6px rgba(0,0,0,0.2)" }}>
                      {c.warrantyApplies ? "Garantía ✓" : "Sin garantía"}
                    </div>
                  </div>
                  {/* Body */}
                  <div style={{ padding: "1rem 1.1rem 1.2rem", display: "flex", flexDirection: "column", flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.55rem", flexWrap: "wrap" }}>
                      <span style={{ fontSize: "0.63rem", fontWeight: 800, background: catColor(c.category || "General"), color: "white", padding: "2px 10px", borderRadius: 100, textTransform: "uppercase", letterSpacing: "0.07em" }}>{c.category || "General"}</span>
                      {c.code && <span style={{ fontSize: "0.63rem", fontWeight: 800, background: "#0f172a", color: "white", padding: "2px 10px", borderRadius: 100, letterSpacing: "0.06em", fontFamily: "monospace" }}>{c.code}</span>}
                    </div>
                    <h3 style={{ margin: "0 0 0.4rem", fontSize: "1rem", fontWeight: 800, lineHeight: 1.3, color: "#0f172a" }}>{c.title}</h3>
                    <p style={{ margin: 0, fontSize: "0.82rem", color: "#64748b", lineHeight: 1.55, flex: 1, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" } as React.CSSProperties}>
                      {c.description || "Sin descripción."}
                    </p>
                    <div style={{ marginTop: "0.9rem", paddingTop: "0.75rem", borderTop: "1px solid #f1f5f9", display: "flex", alignItems: "center", gap: "0.45rem" }}>
                      <div style={{ width: 9, height: 9, borderRadius: "50%", background: c.warrantyApplies ? "#22c55e" : "#ef4444", flexShrink: 0, boxShadow: `0 0 0 3px ${c.warrantyApplies ? "#dcfce7" : "#fee2e2"}` }} />
                      <span style={{ fontSize: "0.78rem", fontWeight: 700, color: c.warrantyApplies ? "#16a34a" : "#dc2626" }}>{c.warrantyApplies ? "Aplica garantía" : "No aplica garantía"}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* ── Detail panel ─────────────────────────────────────────────────────── */}
      {selected && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", zIndex: 1000, display: "flex", justifyContent: "flex-end" }} onClick={() => { setSelected(null); setEditMode(false); }}>
          <div style={{ width: "min(540px,100vw)", height: "100dvh", background: "white", overflowY: "auto", display: "flex", flexDirection: "column", boxShadow: "-6px 0 48px rgba(0,0,0,0.18)" }} onClick={(e) => e.stopPropagation()}>
            {/* Photo mosaic */}
            <div style={{ position: "relative", background: placeholderBg(selected.warrantyApplies), flexShrink: 0, overflow: "hidden" }}>
              {(selected.photos?.length ?? 0) > 0 ? (
                <div style={{ display: "grid", height: 260, gridTemplateColumns: (selected.photos?.length ?? 0) === 1 ? "1fr" : "repeat(2,1fr)", gridTemplateRows: (selected.photos?.length ?? 0) >= 3 ? "1fr 1fr" : "1fr", gap: 3 }}>
                  {selected.photos!.slice(0, 4).map((ph, idx) => (
                    <div key={ph.id} style={{ position: "relative", overflow: "hidden", gridColumn: idx === 0 && (selected.photos?.length ?? 0) === 3 ? "span 2" : undefined }}>
                      <img src={ph.url} alt={ph.caption} style={{ width: "100%", height: "100%", objectFit: "cover", cursor: "zoom-in" }} onClick={(e) => { e.stopPropagation(); setLightboxUrl(ph.url); }} />
                      {ph.caption && <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "linear-gradient(transparent,rgba(0,0,0,0.55))", color: "white", fontSize: "0.66rem", padding: "1rem 0.5rem 0.35rem" }}>{ph.caption}</div>}
                      {isAdmin && (
                        <button
                          onClick={async (e) => { e.stopPropagation(); if (!confirm("¿Eliminar esta foto?")) return; try { await deleteCSPhoto(ph.id); await load(); } catch (ex: any) { setError("Error al eliminar foto: " + (ex?.message ?? ex)); } }}
                          style={{ position: "absolute", top: 6, right: 6, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)", color: "white", border: "none", borderRadius: "50%", width: 26, height: 26, fontSize: "0.85rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}
                        >×</button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ height: 200, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "0.4rem" }}>
                  <div style={{ fontSize: "4rem", opacity: 0.3 }}>{selected.warrantyApplies ? "✅" : "❌"}</div>
                  <div style={{ fontSize: "0.78rem", opacity: 0.4, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>Sin fotos</div>
                </div>
              )}
              <button onClick={() => { setSelected(null); setEditMode(false); }} style={{ position: "absolute", top: 12, left: 12, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(6px)", color: "white", border: "none", borderRadius: "50%", width: 36, height: 36, fontSize: "1.1rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>←</button>
            </div>

            <div style={{ padding: "1.4rem", flex: 1 }}>
              {/* Code badge — prominent */}
              {selected.code && (
                <div style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", background: "#0f172a", color: "white", borderRadius: 10, padding: "0.5rem 1rem", marginBottom: "1rem" }}>
                  <span style={{ fontSize: "0.7rem", opacity: 0.6, textTransform: "uppercase", letterSpacing: "0.08em" }}>Código</span>
                  <span style={{ fontFamily: "monospace", fontWeight: 800, fontSize: "1.1rem", letterSpacing: "0.05em" }}>{selected.code}</span>
                </div>
              )}

              {/* Badges row */}
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap" }}>
                <span style={{ fontSize: "0.63rem", fontWeight: 800, background: catColor(selected.category || "General"), color: "white", padding: "3px 11px", borderRadius: 100, textTransform: "uppercase", letterSpacing: "0.07em" }}>{selected.category || "General"}</span>
                <div style={{ display: "flex", alignItems: "center", gap: "0.38rem", padding: "3px 11px", borderRadius: 100, background: selected.warrantyApplies ? "#dcfce7" : "#fee2e2" }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: selected.warrantyApplies ? "#22c55e" : "#ef4444" }} />
                  <span style={{ fontSize: "0.72rem", fontWeight: 700, color: selected.warrantyApplies ? "#16a34a" : "#dc2626" }}>{selected.warrantyApplies ? "Aplica garantía" : "No aplica garantía"}</span>
                </div>
                {selected.warrantyApplies && <span style={{ fontSize: "0.68rem", background: "#fef3c7", color: "#92400e", padding: "2px 8px", borderRadius: 100, fontWeight: 600 }}>🔒 Caso protegido</span>}
              </div>

              {!editMode ? (
                <>
                  <h2 style={{ margin: "0 0 0.9rem", fontSize: "1.35rem", fontWeight: 900, lineHeight: 1.25, color: "#0f172a" }}>{selected.title}</h2>
                  <p style={{ margin: "0 0 1.5rem", fontSize: "0.92rem", color: "#374151", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{selected.description || "Sin descripción."}</p>

                  {/* Extra photos */}
                  {(selected.photos?.length ?? 0) > 4 && (
                    <div style={{ marginBottom: "1.5rem" }}>
                      <p style={{ margin: "0 0 0.5rem", fontSize: "0.82rem", color: "#94a3b8", fontWeight: 600 }}>Más fotos</p>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6 }}>
                        {selected.photos!.slice(4).map((ph) => (
                          <div key={ph.id} style={{ borderRadius: 10, overflow: "hidden", aspectRatio: "1", position: "relative" }}>
                            <img src={ph.url} alt={ph.caption} style={{ width: "100%", height: "100%", objectFit: "cover", cursor: "zoom-in" }} onClick={() => setLightboxUrl(ph.url)} />
                            {isAdmin && (
                              <button
                                onClick={async (e) => { e.stopPropagation(); if (!confirm("¿Eliminar esta foto?")) return; try { await deleteCSPhoto(ph.id); await load(); } catch (ex: any) { setError("Error al eliminar foto: " + (ex?.message ?? ex)); } }}
                                style={{ position: "absolute", top: 4, right: 4, background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)", color: "white", border: "none", borderRadius: "50%", width: 22, height: 22, fontSize: "0.75rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}
                              >×</button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Admin actions */}
                  {isAdmin && (
                    <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
                      {/* Add photo */}
                      <div style={{ background: "#faf5ff", borderRadius: 12, padding: "1rem", border: "2px dashed #c4b5fd" }}>
                        <p style={{ margin: "0 0 0.55rem", fontWeight: 700, fontSize: "0.88rem", color: "#7c3aed" }}>📷 Agregar foto</p>
                        <input type="text" className="form-control" placeholder="Pie de foto (opcional)" value={photoCaption} onChange={(e) => setPhotoCaption(e.target.value)} style={{ marginBottom: "0.5rem", background: "white" }} />
                        <label style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", padding: "0.65rem 1rem", borderRadius: 8, border: "1.5px solid #c4b5fd", cursor: uploading ? "not-allowed" : "pointer", background: "white", fontSize: "0.88rem", color: "#7c3aed", fontWeight: 700 }}>
                          {uploading ? "⏳ Subiendo..." : "📎 Seleccionar imagen"}
                          <input ref={photoFileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handlePhotoUpload} disabled={uploading} />
                        </label>
                      </div>

                      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                        {/* Edit (only non-warranty) */}
                        {!selected.warrantyApplies && (
                          <button className="btn btn-primary btn-sm" style={{ background: "#7c3aed", borderColor: "#7c3aed" }}
                            onClick={() => { setEditMode(true); setEditForm({ title: selected.title, description: selected.description, category: selected.category, warrantyApplies: selected.warrantyApplies, code: selected.code }); }}>
                            ✏️ Editar caso
                          </button>
                        )}
                        {/* Delete (admin always) */}
                        <button className="btn btn-secondary btn-sm" style={{ color: "#dc2626", borderColor: "#dc2626" }}
                          onClick={async () => {
                            if (!confirm("¿Eliminar este caso del diccionario? Esta acción no se puede deshacer.")) return;
                            try { await rejectCSCase(selected.id); setSelected(null); await load(); }
                            catch (ex: any) { setError("Error al eliminar: " + (ex?.message ?? ex)); }
                          }}>
                          🗑 Eliminar caso
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div>
                  <p style={{ margin: "0 0 1rem", fontWeight: 700, color: "#7c3aed" }}>✏️ Editar caso</p>
                  <div className="form-group"><label>Título</label><input type="text" className="form-control" value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} /></div>
                  <div className="form-group"><label>Categoría</label><input type="text" className="form-control" value={editForm.category} onChange={(e) => setEditForm({ ...editForm, category: e.target.value })} /></div>
                  <div className="form-group"><label>Descripción</label><textarea className="form-control" rows={5} value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} style={{ resize: "vertical" }} /></div>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => setEditMode(false)}>Cancelar</button>
                    <button className="btn btn-primary btn-sm" style={{ background: "#7c3aed", borderColor: "#7c3aed" }} onClick={handleEditSave} disabled={saving}>{saving ? "Guardando..." : "Guardar"}</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Submit case modal (anyone) ────────────────────────────────────────── */}
      {showSubmit && (
        <div className="modal-overlay active">
          <div className="modal">
            <div className="modal-header"><h3>📝 Enviar caso al diccionario</h3></div>
            <p style={{ margin: "0 0 1rem", fontSize: "0.85rem", color: "#64748b" }}>Tu solicitud será revisada antes de aparecer en el diccionario.</p>
            <form onSubmit={handleSubmitCase}>
              <div className="form-group"><label>Título del caso</label><input type="text" className="form-control" required autoFocus value={submitForm.title} onChange={(e) => setSubmitForm({ ...submitForm, title: e.target.value })} placeholder="ej. Descostura en área de la corona" /></div>
              <div className="form-group"><label>Categoría</label><input type="text" className="form-control" value={submitForm.category} onChange={(e) => setSubmitForm({ ...submitForm, category: e.target.value })} placeholder="ej. Short Luxury, Defecto de fábrica..." /></div>
              <div className="form-group"><label>Descripción</label><textarea className="form-control" rows={4} value={submitForm.description} onChange={(e) => setSubmitForm({ ...submitForm, description: e.target.value })} placeholder="Describe el problema, evidencia, contexto..." style={{ resize: "vertical" }} /></div>
              <div className="form-group">
                <label style={{ display: "flex", alignItems: "center", gap: "0.6rem", cursor: "pointer", padding: "0.6rem 0.85rem", background: submitForm.warrantyApplies ? "#dcfce7" : "#fee2e2", borderRadius: 10, border: `2px solid ${submitForm.warrantyApplies ? "#86efac" : "#fca5a5"}`, transition: "all 0.12s" }}>
                  <input type="checkbox" checked={submitForm.warrantyApplies} onChange={(e) => setSubmitForm({ ...submitForm, warrantyApplies: e.target.checked })} />
                  <span style={{ fontWeight: 700, color: submitForm.warrantyApplies ? "#16a34a" : "#dc2626" }}>{submitForm.warrantyApplies ? "✅ Creo que aplica garantía" : "❌ Creo que no aplica garantía"}</span>
                </label>
              </div>
              <div className="form-group">
                <label>📷 Fotos de referencia (opcional)</label>
                <label style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", padding: "0.7rem 1rem", borderRadius: 10, border: "2px dashed #c4b5fd", cursor: "pointer", background: "#faf5ff", fontSize: "0.88rem", color: "#7c3aed", fontWeight: 600 }}>
                  📎 Seleccionar fotos
                  <input ref={submitFileRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={handleSubmitPhotoPick} />
                </label>
                {submitPhotos.length > 0 && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(72px, 1fr))", gap: 7, marginTop: "0.6rem" }}>
                    {submitPhotos.map((f, i) => (
                      <div key={i} style={{ position: "relative", borderRadius: 8, overflow: "hidden", aspectRatio: "1" }}>
                        <img src={URL.createObjectURL(f)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        <button type="button" onClick={() => setSubmitPhotos((p) => p.filter((_, j) => j !== i))} style={{ position: "absolute", top: 3, right: 3, background: "rgba(0,0,0,0.55)", color: "white", border: "none", borderRadius: "50%", width: 20, height: 20, fontSize: "0.7rem", cursor: "pointer" }}>×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => { setShowSubmit(false); setSubmitForm(EMPTY_FORM); setSubmitPhotos([]); }}>Cancelar</button>
                <button type="submit" className="btn btn-primary" style={{ background: "#7c3aed", borderColor: "#7c3aed" }} disabled={submitting}>
                  {submitting ? "Enviando..." : `📨 Enviar solicitud${submitPhotos.length > 0 ? ` (${submitPhotos.length} foto${submitPhotos.length > 1 ? "s" : ""})` : ""}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Pending panel (admin) ─────────────────────────────────────────────── */}
      {showPendingPanel && isAdmin && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", zIndex: 1000, display: "flex", justifyContent: "flex-end" }} onClick={() => setShowPendingPanel(false)}>
          <div style={{ width: "min(560px,100vw)", height: "100dvh", background: "white", overflowY: "auto", display: "flex", flexDirection: "column", boxShadow: "-6px 0 48px rgba(0,0,0,0.18)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: "1.25rem 1.4rem", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h2 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 800 }}>⏳ Solicitudes pendientes ({pending.length})</h2>
              <button onClick={() => setShowPendingPanel(false)} style={{ background: "none", border: "none", fontSize: "1.3rem", cursor: "pointer", color: "#64748b" }}>×</button>
            </div>
            <div style={{ padding: "1rem 1.4rem", flex: 1 }}>
              {pending.length === 0 && <p style={{ color: "#94a3b8", textAlign: "center", marginTop: "2rem" }}>No hay solicitudes pendientes.</p>}
              {pending.map((c) => (
                <div key={c.id} style={{ background: "#f8f7f5", borderRadius: 14, padding: "1rem", marginBottom: "1rem", border: "1px solid #e2e8f0" }}>
                  <div style={{ display: "flex", gap: "0.4rem", marginBottom: "0.5rem", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "0.65rem", fontWeight: 800, background: catColor(c.category || "General"), color: "white", padding: "2px 9px", borderRadius: 100, textTransform: "uppercase" }}>{c.category || "General"}</span>
                    <span style={{ fontSize: "0.65rem", fontWeight: 700, background: c.warrantyApplies ? "#dcfce7" : "#fee2e2", color: c.warrantyApplies ? "#16a34a" : "#dc2626", padding: "2px 9px", borderRadius: 100 }}>{c.warrantyApplies ? "✅ Propone garantía" : "❌ Propone sin garantía"}</span>
                  </div>
                  <p style={{ margin: "0 0 0.3rem", fontWeight: 700, fontSize: "0.95rem" }}>{c.title}</p>
                  <p style={{ margin: "0 0 0.75rem", fontSize: "0.83rem", color: "#64748b", lineHeight: 1.5 }}>{c.description}</p>
                  {c.photos && c.photos.length > 0 && (
                    <div style={{ display: "flex", gap: 5, marginBottom: "0.75rem", flexWrap: "wrap" }}>
                      {c.photos.map((ph) => (
                        <img key={ph.id} src={ph.url} alt="" style={{ width: 60, height: 60, objectFit: "cover", borderRadius: 7, cursor: "zoom-in" }} onClick={() => setLightboxUrl(ph.url)} />
                      ))}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end", flexWrap: "wrap" }}>
                    {c.warrantyApplies && (
                      <div style={{ flex: 1, minWidth: 140 }}>
                        <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "#374151", marginBottom: 3, display: "block" }}>Código de garantía</label>
                        <input
                          type="text"
                          className="form-control"
                          placeholder="ej. QC-001"
                          value={approveCodes[c.id] ?? ""}
                          onChange={(e) => setApproveCodes((prev) => ({ ...prev, [c.id]: e.target.value }))}
                          style={{ fontFamily: "monospace", fontWeight: 700 }}
                        />
                      </div>
                    )}
                    <button className="btn btn-primary btn-sm" style={{ background: "#16a34a", borderColor: "#16a34a" }} onClick={() => handleApprove(c.id)}>✅ Aprobar</button>
                    <button className="btn btn-secondary btn-sm" style={{ color: "#dc2626", borderColor: "#dc2626" }} onClick={() => handleReject(c.id)}>🗑 Rechazar</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Admin login modal ─────────────────────────────────────────────────── */}
      {showAdminLogin && (
        <div className="modal-overlay active" style={{ zIndex: 3000 }}>
          <div className="modal" style={{ maxWidth: 340 }}>
            <div className="modal-header"><h3>🔑 Acceso Admin</h3></div>
            <input type="password" className="form-control" placeholder="Contraseña" autoFocus value={adminPwInput} onChange={(e) => { setAdminPwInput(e.target.value); setAdminPwError(""); }} onKeyDown={(e) => { if (e.key === "Enter") handleAdminLogin(); }} style={{ marginBottom: "0.5rem" }} />
            {adminPwError && <p style={{ color: "#dc2626", fontSize: "0.82rem", margin: "0 0 0.5rem" }}>{adminPwError}</p>}
            <div className="modal-actions">
              <button className="btn btn-secondary" onClick={() => setShowAdminLogin(false)}>Cancelar</button>
              <button className="btn btn-primary" style={{ background: "#7c3aed", borderColor: "#7c3aed" }} onClick={handleAdminLogin}>Entrar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Lightbox ──────────────────────────────────────────────────────────── */}
      {lightboxUrl && (
        <div onClick={() => setLightboxUrl(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", cursor: "zoom-out" }}>
          <img src={lightboxUrl} alt="" style={{ maxWidth: "92vw", maxHeight: "92vh", objectFit: "contain", borderRadius: 10, boxShadow: "0 8px 60px rgba(0,0,0,0.6)" }} onClick={(e) => e.stopPropagation()} />
          <button onClick={() => setLightboxUrl(null)} style={{ position: "absolute", top: 18, right: 20, background: "rgba(255,255,255,0.15)", backdropFilter: "blur(6px)", color: "white", border: "none", borderRadius: "50%", width: 40, height: 40, fontSize: "1.3rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
        </div>
      )}
    </div>
  );
}
