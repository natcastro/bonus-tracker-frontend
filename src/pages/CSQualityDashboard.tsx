import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import type { CSQualityCase, CSQualityPhoto } from "../types";
import { getCSCases, createCSCase, updateCSCase, deleteCSCase, addCSPhoto, deleteCSPhoto } from "../services/api";

const CATEGORY_COLORS = ["#7c3aed", "#0891b2", "#d97706", "#db2777", "#059669", "#dc2626", "#4f46e5", "#0ea5e9"];

function catColor(cat: string): string {
  if (!cat) return CATEGORY_COLORS[0];
  let h = 0;
  for (const ch of cat) h = (h * 31 + ch.charCodeAt(0)) % 1000;
  return CATEGORY_COLORS[Math.abs(h) % CATEGORY_COLORS.length];
}

const EMPTY_FORM = { title: "", description: "", category: "", warrantyApplies: false };

export default function CSQualityDashboard() {
  const navigate = useNavigate();
  const [cases, setCases] = useState<CSQualityCase[]>([]);
  const [selected, setSelected] = useState<CSQualityCase | null>(null);
  const [search, setSearch] = useState("");
  const [filterWarranty, setFilterWarranty] = useState<"all" | "yes" | "no">("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState(EMPTY_FORM);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [photoCaption, setPhotoCaption] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const data = await getCSCases();
      setCases(data);
      setSelected((prev) => (prev ? (data.find((c) => c.id === prev.id) ?? null) : null));
      setError(null);
    } catch (e: any) {
      setError("Error de base de datos: " + (e?.message ?? String(e)));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const categories = Array.from(new Set(cases.map((c) => c.category).filter(Boolean)));

  const filtered = cases.filter((c) => {
    if (search) {
      const q = search.toLowerCase();
      if (!c.title.toLowerCase().includes(q) && !c.description.toLowerCase().includes(q) && !c.category.toLowerCase().includes(q)) return false;
    }
    if (filterWarranty === "yes" && !c.warrantyApplies) return false;
    if (filterWarranty === "no" && c.warrantyApplies) return false;
    if (filterCategory !== "all" && c.category !== filterCategory) return false;
    return true;
  });

  const handleAddCase = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await createCSCase(addForm);
      setShowAdd(false);
      setAddForm(EMPTY_FORM);
      await load();
    } catch (ex: any) { setError("Error al crear: " + (ex?.message ?? ex)); }
    finally { setSaving(false); }
  };

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

  const handleDeleteCase = async () => {
    if (!selected || !confirm("¿Eliminar este caso del diccionario?")) return;
    try {
      await deleteCSCase(selected.id);
      setSelected(null);
      await load();
    } catch (ex: any) { setError("Error al eliminar: " + (ex?.message ?? ex)); }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selected || !e.target.files?.[0]) return;
    setUploading(true);
    try {
      await addCSPhoto(selected.id, e.target.files[0], photoCaption);
      setPhotoCaption("");
      if (fileRef.current) fileRef.current.value = "";
      await load();
    } catch (ex: any) { setError("Error al subir foto: " + (ex?.message ?? ex)); }
    finally { setUploading(false); }
  };

  const handleDeletePhoto = async (photoId: number) => {
    try { await deleteCSPhoto(photoId); await load(); }
    catch (ex: any) { setError("Error al borrar foto: " + (ex?.message ?? ex)); }
  };

  // ─── Card gradient placeholder ───────────────────────────────────────────────
  const placeholderBg = (warrantyApplies: boolean) =>
    warrantyApplies
      ? "linear-gradient(135deg,#dcfce7 0%,#86efac 100%)"
      : "linear-gradient(135deg,#fee2e2 0%,#fca5a5 100%)";

  return (
    <div style={{ minHeight: "100vh", background: "#f8f7f5" }}>
      {/* ── Nav ────────────────────────────────────────────────────────── */}
      <nav className="top-nav">
        <div className="logo">Bonus Tracker — <span style={{ color: "#7c3aed" }}>CS Quality Dictionary</span></div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <button
            className="btn btn-primary btn-sm"
            style={{ background: "#7c3aed", borderColor: "#7c3aed" }}
            onClick={() => { setShowAdd(true); setAddForm(EMPTY_FORM); }}
          >
            + Agregar Caso
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => { sessionStorage.clear(); navigate("/"); }}>Salir</button>
        </div>
      </nav>

      <main style={{ padding: "1.5rem", maxWidth: 1280, margin: "0 auto" }}>
        {error && (
          <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 10, padding: "0.75rem 1rem", marginBottom: "1.25rem", color: "#dc2626", fontSize: "0.88rem" }}>
            ⚠️ {error}
            <details style={{ marginTop: "0.4rem" }}>
              <summary style={{ cursor: "pointer", fontSize: "0.78rem", opacity: 0.7 }}>Ver SQL para crear tablas</summary>
              <pre style={{ fontSize: "0.72rem", background: "#fff5f5", padding: "0.5rem", borderRadius: 6, marginTop: "0.4rem", whiteSpace: "pre-wrap" }}>{`CREATE TABLE IF NOT EXISTS cs_quality_cases (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'General',
  warranty_applies BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE cs_quality_cases DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS cs_quality_photos (
  id BIGSERIAL PRIMARY KEY,
  case_id BIGINT REFERENCES cs_quality_cases(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  caption TEXT NOT NULL DEFAULT ''
);
ALTER TABLE cs_quality_photos DISABLE ROW LEVEL SECURITY;`}</pre>
            </details>
          </div>
        )}

        {/* ── Hero header ────────────────────────────────────────────── */}
        <div style={{ textAlign: "center", marginBottom: "2.25rem", paddingTop: "0.5rem" }}>
          <div style={{ fontSize: "3rem", lineHeight: 1 }}>📖</div>
          <h1 style={{ margin: "0.4rem 0 0.2rem", fontSize: "2rem", fontWeight: 900, letterSpacing: "-0.03em", color: "#0f172a" }}>
            Diccionario de Calidad CS
          </h1>
          <p style={{ margin: 0, color: "#64748b", fontSize: "0.92rem" }}>
            Referencia rápida de casos — cuándo aplica garantía y cuándo no
          </p>
          <div style={{ display: "flex", justifyContent: "center", gap: "1.5rem", marginTop: "0.75rem", fontSize: "0.82rem", color: "#94a3b8" }}>
            <span>
              <strong style={{ color: "#16a34a" }}>{cases.filter((c) => c.warrantyApplies).length}</strong> aplican garantía
            </span>
            <span>
              <strong style={{ color: "#dc2626" }}>{cases.filter((c) => !c.warrantyApplies).length}</strong> no aplican
            </span>
            <span>
              <strong style={{ color: "#7c3aed" }}>{cases.length}</strong> total
            </span>
          </div>
        </div>

        {/* ── Search + filters ───────────────────────────────────────── */}
        <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem", flexWrap: "wrap", alignItems: "center" }}>
          <input
            type="search"
            placeholder="🔍  Buscar en el diccionario..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              flex: 1, minWidth: 220, padding: "0.6rem 1.1rem", borderRadius: 100,
              border: "1.5px solid #e2e8f0", fontSize: "0.9rem", background: "white",
              outline: "none", boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
            }}
          />
          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
            {(["all", "yes", "no"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setFilterWarranty(v)}
                style={{
                  padding: "0.45rem 1rem", borderRadius: 100, fontSize: "0.8rem", cursor: "pointer",
                  fontWeight: filterWarranty === v ? 700 : 400, border: "1.5px solid",
                  borderColor: filterWarranty === v ? (v === "yes" ? "#16a34a" : v === "no" ? "#dc2626" : "#7c3aed") : "#e2e8f0",
                  background: filterWarranty === v ? (v === "yes" ? "#dcfce7" : v === "no" ? "#fee2e2" : "#ede9fe") : "white",
                  color: filterWarranty === v ? (v === "yes" ? "#16a34a" : v === "no" ? "#dc2626" : "#7c3aed") : "#64748b",
                  transition: "all 0.12s",
                }}
              >
                {v === "all" ? "Todos los casos" : v === "yes" ? "✅ Aplica garantía" : "❌ No aplica"}
              </button>
            ))}
          </div>
        </div>

        {/* ── Category chips ─────────────────────────────────────────── */}
        {categories.length > 0 && (
          <div style={{ display: "flex", gap: "0.4rem", marginBottom: "1.75rem", flexWrap: "wrap" }}>
            <button
              onClick={() => setFilterCategory("all")}
              style={{
                padding: "0.28rem 0.9rem", borderRadius: 100, fontSize: "0.73rem", cursor: "pointer",
                border: "1.5px solid", borderColor: filterCategory === "all" ? "#7c3aed" : "#e2e8f0",
                background: filterCategory === "all" ? "#7c3aed" : "white",
                color: filterCategory === "all" ? "white" : "#64748b", fontWeight: 600,
                transition: "all 0.12s",
              }}
            >
              Todas
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setFilterCategory(cat)}
                style={{
                  padding: "0.28rem 0.9rem", borderRadius: 100, fontSize: "0.73rem", cursor: "pointer",
                  border: "1.5px solid",
                  borderColor: filterCategory === cat ? catColor(cat) : "#e2e8f0",
                  background: filterCategory === cat ? catColor(cat) : "white",
                  color: filterCategory === cat ? "white" : "#64748b", fontWeight: 600,
                  transition: "all 0.12s",
                }}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        {/* ── Card grid ──────────────────────────────────────────────── */}
        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "5rem 2rem", color: "#94a3b8" }}>
            <div style={{ fontSize: "3.5rem" }}>🔍</div>
            <p style={{ marginTop: "0.5rem", fontSize: "1rem" }}>
              {cases.length === 0
                ? "El diccionario está vacío. ¡Agrega el primer caso!"
                : "Sin resultados para esa búsqueda."}
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
                  style={{
                    background: "white", borderRadius: 18, overflow: "hidden",
                    boxShadow: "0 2px 16px rgba(0,0,0,0.07)", cursor: "pointer",
                    transition: "transform 0.15s ease, box-shadow 0.15s ease",
                    display: "flex", flexDirection: "column",
                  }}
                  onMouseEnter={(e) => {
                    const el = e.currentTarget as HTMLDivElement;
                    el.style.transform = "translateY(-5px)";
                    el.style.boxShadow = "0 12px 40px rgba(0,0,0,0.14)";
                  }}
                  onMouseLeave={(e) => {
                    const el = e.currentTarget as HTMLDivElement;
                    el.style.transform = "translateY(0)";
                    el.style.boxShadow = "0 2px 16px rgba(0,0,0,0.07)";
                  }}
                >
                  {/* Cover image */}
                  <div style={{ height: 190, background: cover ? undefined : placeholderBg(c.warrantyApplies), overflow: "hidden", position: "relative", flexShrink: 0 }}>
                    {cover
                      ? <img src={cover} alt={c.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : (
                        <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "0.3rem" }}>
                          <div style={{ fontSize: "3rem", opacity: 0.4 }}>{c.warrantyApplies ? "✅" : "❌"}</div>
                          <div style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.45 }}>Sin foto</div>
                        </div>
                      )
                    }
                    {(c.photos?.length ?? 0) > 0 && (
                      <div style={{ position: "absolute", bottom: 8, right: 8, background: "rgba(0,0,0,0.45)", backdropFilter: "blur(6px)", color: "white", fontSize: "0.68rem", padding: "2px 8px", borderRadius: 100 }}>
                        📷 {c.photos!.length}
                      </div>
                    )}
                    {/* Warranty ribbon */}
                    <div style={{
                      position: "absolute", top: 12, left: -24, width: 110, textAlign: "center",
                      background: c.warrantyApplies ? "#16a34a" : "#dc2626", color: "white",
                      fontSize: "0.62rem", fontWeight: 800, padding: "4px 0",
                      transform: "rotate(-35deg) translateX(10px)",
                      letterSpacing: "0.06em", textTransform: "uppercase",
                      boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
                    }}>
                      {c.warrantyApplies ? "Garantía ✓" : "Sin garantía"}
                    </div>
                  </div>

                  {/* Body */}
                  <div style={{ padding: "1rem 1.1rem 1.2rem", display: "flex", flexDirection: "column", flex: 1 }}>
                    <span style={{
                      display: "inline-block", fontSize: "0.63rem", fontWeight: 800,
                      background: catColor(c.category || "General"), color: "white",
                      padding: "2px 10px", borderRadius: 100, textTransform: "uppercase",
                      letterSpacing: "0.07em", marginBottom: "0.55rem", alignSelf: "flex-start",
                    }}>
                      {c.category || "General"}
                    </span>
                    <h3 style={{ margin: "0 0 0.4rem", fontSize: "1rem", fontWeight: 800, lineHeight: 1.3, color: "#0f172a" }}>
                      {c.title}
                    </h3>
                    <p style={{
                      margin: 0, fontSize: "0.82rem", color: "#64748b", lineHeight: 1.55, flex: 1,
                      display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden",
                    } as React.CSSProperties}>
                      {c.description || "Sin descripción."}
                    </p>
                    <div style={{
                      marginTop: "0.9rem", paddingTop: "0.75rem", borderTop: "1px solid #f1f5f9",
                      display: "flex", alignItems: "center", gap: "0.45rem",
                    }}>
                      <div style={{ width: 9, height: 9, borderRadius: "50%", background: c.warrantyApplies ? "#22c55e" : "#ef4444", flexShrink: 0, boxShadow: `0 0 0 3px ${c.warrantyApplies ? "#dcfce7" : "#fee2e2"}` }} />
                      <span style={{ fontSize: "0.78rem", fontWeight: 700, color: c.warrantyApplies ? "#16a34a" : "#dc2626" }}>
                        {c.warrantyApplies ? "Aplica garantía" : "No aplica garantía"}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* ── Detail panel (slide-in from right) ─────────────────────────────── */}
      {selected && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", zIndex: 1000, display: "flex", justifyContent: "flex-end" }}
          onClick={() => { setSelected(null); setEditMode(false); }}
        >
          <div
            style={{ width: "min(540px,100vw)", height: "100dvh", background: "white", overflowY: "auto", display: "flex", flexDirection: "column", boxShadow: "-6px 0 48px rgba(0,0,0,0.18)" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Photo mosaic header */}
            <div style={{ position: "relative", minHeight: 240, background: placeholderBg(selected.warrantyApplies), flexShrink: 0, overflow: "hidden" }}>
              {(selected.photos?.length ?? 0) > 0 ? (
                <div style={{
                  display: "grid", height: 240,
                  gridTemplateColumns: (selected.photos?.length ?? 0) === 1 ? "1fr" : "repeat(2, 1fr)",
                  gridTemplateRows: (selected.photos?.length ?? 0) >= 3 ? "1fr 1fr" : "1fr",
                  gap: 3,
                }}>
                  {selected.photos!.slice(0, 4).map((ph, idx) => (
                    <div key={ph.id} style={{ position: "relative", overflow: "hidden", gridColumn: idx === 0 && (selected.photos?.length ?? 0) === 3 ? "span 2" : undefined }}>
                      <img src={ph.url} alt={ph.caption} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      {ph.caption && (
                        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "linear-gradient(transparent,rgba(0,0,0,0.55))", color: "white", fontSize: "0.66rem", padding: "1rem 0.5rem 0.35rem", lineHeight: 1.2 }}>{ph.caption}</div>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeletePhoto(ph.id); }}
                        style={{ position: "absolute", top: 5, right: 5, background: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)", color: "white", border: "none", borderRadius: "50%", width: 24, height: 24, fontSize: "0.8rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                        title="Eliminar foto"
                      >×</button>
                      {idx === 3 && (selected.photos?.length ?? 0) > 4 && (
                        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", color: "white", fontSize: "1.5rem", fontWeight: 800 }}>
                          +{(selected.photos?.length ?? 0) - 4}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ height: 240, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "0.4rem" }}>
                  <div style={{ fontSize: "4rem", opacity: 0.3 }}>{selected.warrantyApplies ? "✅" : "❌"}</div>
                  <div style={{ fontSize: "0.78rem", opacity: 0.4, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>Sin fotos todavía</div>
                </div>
              )}
              {/* Back button */}
              <button
                onClick={() => { setSelected(null); setEditMode(false); }}
                style={{ position: "absolute", top: 12, left: 12, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(6px)", color: "white", border: "none", borderRadius: "50%", width: 36, height: 36, fontSize: "1.1rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
              >←</button>
            </div>

            {/* Content area */}
            <div style={{ padding: "1.4rem", flex: 1, overflowY: "auto" }}>
              {/* Badges row */}
              <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "1rem", flexWrap: "wrap" }}>
                <span style={{ fontSize: "0.63rem", fontWeight: 800, background: catColor(selected.category || "General"), color: "white", padding: "3px 11px", borderRadius: 100, textTransform: "uppercase", letterSpacing: "0.07em" }}>
                  {selected.category || "General"}
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: "0.38rem", padding: "3px 11px", borderRadius: 100, background: selected.warrantyApplies ? "#dcfce7" : "#fee2e2" }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: selected.warrantyApplies ? "#22c55e" : "#ef4444" }} />
                  <span style={{ fontSize: "0.72rem", fontWeight: 700, color: selected.warrantyApplies ? "#16a34a" : "#dc2626" }}>
                    {selected.warrantyApplies ? "Aplica garantía" : "No aplica garantía"}
                  </span>
                </div>
              </div>

              {!editMode ? (
                <>
                  <h2 style={{ margin: "0 0 0.9rem", fontSize: "1.35rem", fontWeight: 900, lineHeight: 1.25, color: "#0f172a" }}>{selected.title}</h2>
                  <p style={{ margin: "0 0 1.5rem", fontSize: "0.92rem", color: "#374151", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
                    {selected.description || "Sin descripción."}
                  </p>

                  {/* Extra photos (5+) */}
                  {(selected.photos?.length ?? 0) > 4 && (
                    <div style={{ marginBottom: "1.5rem" }}>
                      <p style={{ margin: "0 0 0.5rem", fontSize: "0.82rem", color: "#94a3b8", fontWeight: 600 }}>Fotos adicionales</p>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6 }}>
                        {selected.photos!.slice(4).map((ph) => (
                          <div key={ph.id} style={{ position: "relative", borderRadius: 10, overflow: "hidden", aspectRatio: "1" }}>
                            <img src={ph.url} alt={ph.caption} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            <button onClick={(e) => { e.stopPropagation(); handleDeletePhoto(ph.id); }} style={{ position: "absolute", top: 4, right: 4, background: "rgba(0,0,0,0.45)", color: "white", border: "none", borderRadius: "50%", width: 20, height: 20, fontSize: "0.72rem", cursor: "pointer" }}>×</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.75rem" }}>
                    <button
                      className="btn btn-primary btn-sm"
                      style={{ background: "#7c3aed", borderColor: "#7c3aed" }}
                      onClick={() => { setEditMode(true); setEditForm({ title: selected.title, description: selected.description, category: selected.category, warrantyApplies: selected.warrantyApplies }); }}
                    >✏️ Editar</button>
                    <button className="btn btn-secondary btn-sm" style={{ color: "#dc2626", borderColor: "#dc2626" }} onClick={handleDeleteCase}>🗑 Eliminar caso</button>
                  </div>

                  {/* Add photo */}
                  <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: "1.25rem" }}>
                    <p style={{ margin: "0 0 0.6rem", fontWeight: 700, fontSize: "0.88rem" }}>📷 Agregar foto al caso</p>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Pie de foto (opcional)"
                      value={photoCaption}
                      onChange={(e) => setPhotoCaption(e.target.value)}
                      style={{ marginBottom: "0.5rem" }}
                    />
                    <label
                      style={{
                        display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem",
                        padding: "0.7rem 1rem", borderRadius: 10, border: "2px dashed #c4b5fd",
                        cursor: uploading ? "not-allowed" : "pointer", background: "#faf5ff",
                        fontSize: "0.88rem", color: "#7c3aed", fontWeight: 600,
                        transition: "background 0.12s",
                      }}
                    >
                      {uploading ? "⏳ Subiendo..." : "📎 Seleccionar imagen para subir"}
                      <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handlePhotoUpload} disabled={uploading} />
                    </label>
                  </div>
                </>
              ) : (
                /* Edit form */
                <div>
                  <p style={{ margin: "0 0 1rem", fontWeight: 700, color: "#7c3aed" }}>✏️ Editar caso</p>
                  <div className="form-group">
                    <label>Título</label>
                    <input type="text" className="form-control" value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label>Categoría</label>
                    <input type="text" className="form-control" value={editForm.category} onChange={(e) => setEditForm({ ...editForm, category: e.target.value })} placeholder="ej. Defecto de producto" />
                  </div>
                  <div className="form-group">
                    <label>Descripción / Criterio</label>
                    <textarea className="form-control" rows={6} value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} style={{ resize: "vertical" }} />
                  </div>
                  <div className="form-group">
                    <label style={{ display: "flex", alignItems: "center", gap: "0.6rem", cursor: "pointer" }}>
                      <input type="checkbox" checked={editForm.warrantyApplies} onChange={(e) => setEditForm({ ...editForm, warrantyApplies: e.target.checked })} />
                      <span style={{ fontWeight: 600, color: "#16a34a" }}>✅ Aplica garantía</span>
                    </label>
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => setEditMode(false)}>Cancelar</button>
                    <button className="btn btn-primary btn-sm" style={{ background: "#7c3aed", borderColor: "#7c3aed" }} onClick={handleEditSave} disabled={saving}>
                      {saving ? "Guardando..." : "Guardar cambios"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Add case modal ───────────────────────────────────────────────────── */}
      {showAdd && (
        <div className="modal-overlay active">
          <div className="modal">
            <div className="modal-header">
              <h3>📖 Agregar Caso al Diccionario</h3>
            </div>
            <form onSubmit={handleAddCase}>
              <div className="form-group">
                <label>Título del caso</label>
                <input
                  type="text" className="form-control" required autoFocus
                  value={addForm.title} onChange={(e) => setAddForm({ ...addForm, title: e.target.value })}
                  placeholder="ej. Producto llegó dañado en caja sellada"
                />
              </div>
              <div className="form-group">
                <label>Categoría</label>
                <input
                  type="text" className="form-control"
                  value={addForm.category} onChange={(e) => setAddForm({ ...addForm, category: e.target.value })}
                  placeholder="ej. Defecto de producto, Daño en envío, Fraude..."
                />
              </div>
              <div className="form-group">
                <label>Descripción / Criterio</label>
                <textarea
                  className="form-control" rows={4}
                  value={addForm.description} onChange={(e) => setAddForm({ ...addForm, description: e.target.value })}
                  placeholder="Describe cuándo aplica este caso, qué evidencia buscar, cómo manejarlo..."
                  style={{ resize: "vertical" }}
                />
              </div>
              <div className="form-group">
                <label style={{ display: "flex", alignItems: "center", gap: "0.6rem", cursor: "pointer", padding: "0.6rem 0.85rem", background: addForm.warrantyApplies ? "#dcfce7" : "#fee2e2", borderRadius: 10, border: `2px solid ${addForm.warrantyApplies ? "#86efac" : "#fca5a5"}`, transition: "all 0.12s" }}>
                  <input type="checkbox" checked={addForm.warrantyApplies} onChange={(e) => setAddForm({ ...addForm, warrantyApplies: e.target.checked })} />
                  <span style={{ fontWeight: 700, color: addForm.warrantyApplies ? "#16a34a" : "#dc2626", fontSize: "0.95rem" }}>
                    {addForm.warrantyApplies ? "✅ Este caso aplica garantía" : "❌ Este caso NO aplica garantía"}
                  </span>
                </label>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => { setShowAdd(false); setAddForm(EMPTY_FORM); }}>Cancelar</button>
                <button type="submit" className="btn btn-primary" style={{ background: "#7c3aed", borderColor: "#7c3aed" }} disabled={saving}>
                  {saving ? "Creando..." : "✅ Crear caso"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
