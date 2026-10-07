import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MT, formatDateHuman, ROLE_CFG } from "../theme";
import { useMarketing } from "../context";
import DeadlineBadge from "../components/DeadlineBadge";
import StatusPill from "../components/StatusPill";
import { requestStageLabel } from "../types";
import type { MarketingRequest } from "../types";

function CopyLinkButton() {
  const [copied, setCopied] = useState(false);
  const publicUrl = `${window.location.origin}/marketing/nueva-solicitud`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      prompt("Copia este enlace:", publicUrl);
    }
  };

  return (
    <button onClick={copy} style={{
      fontFamily: MT.font, fontSize: 13, fontWeight: 700, cursor: "pointer",
      background: copied ? MT.primary : MT.surfaceAlt, color: copied ? "#fff" : MT.text1,
      border: `1px solid ${copied ? MT.primary : MT.border}`, borderRadius: 8, padding: "9px 16px",
      display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap",
    }}>{copied ? "✓ Copiado" : "🔗 Copiar enlace para solicitudes"}</button>
  );
}

export default function RequestsPage() {
  const { requests, disenoDisplayName, disenoEmailList, authedUser, assignRequest, editRequest, deleteRequest } = useMarketing();
  const navigate = useNavigate();

  // ⋮ menu per row (Laura and Karol): edit, reassign, delete.
  const canManage = authedUser?.role === "laura" || authedUser?.role === "carol";
  const [menuFor, setMenuFor] = useState<number | null>(null);
  // The list card clips its overflow, so the menu is positioned against the viewport instead.
  const [menuPos, setMenuPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 });
  const [editing, setEditing] = useState<MarketingRequest | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [reassigning, setReassigning] = useState<MarketingRequest | null>(null);
  const [reassignEmail, setReassignEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (menuFor === null) return;
    const close = () => setMenuFor(null);
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => { window.removeEventListener("click", close); window.removeEventListener("scroll", close, true); window.removeEventListener("resize", close); };
  }, [menuFor]);

  const run = async (fn: () => Promise<void>, done: () => void) => {
    setBusy(true); setError("");
    try { await fn(); done(); }
    catch (e: any) { setError(e?.message ?? "Ocurrió un error."); }
    finally { setBusy(false); }
  };
  const fieldStyle: React.CSSProperties = { width: "100%", fontFamily: MT.font, fontSize: 13.5, padding: "9px 11px", border: `1px solid ${MT.border}`, borderRadius: 8, outline: "none", boxSizing: "border-box" };

  // Diseño can hand out the public link too, but the full list — and assigning/reassigning
  // requests from it — stays Laura/Karol's job.
  if (authedUser?.role === "diseno") {
    return (
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "1.25rem 1.5rem", fontFamily: MT.font }}>
        <h1 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: MT.text1 }}>Solicitudes</h1>
        <p style={{ margin: "0.4rem 0 1.25rem", fontSize: 12.5, color: MT.text2 }}>
          Comparte este enlace con quien necesite pedirte algo — no necesita rol en Marketing, solo su correo corporativo. Tus propias solicitudes asignadas aparecen en To Do.
        </p>
        <CopyLinkButton />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: "1.25rem 1.5rem", fontFamily: MT.font }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem", gap: 10, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: MT.text1 }}>Solicitudes</h1>
          <p style={{ margin: "0.15rem 0 0", fontSize: 12.5, color: MT.text2 }}>
            Comparte el enlace con quien necesite pedirle algo a Diseño — no necesita rol en Marketing, solo su correo corporativo.
          </p>
        </div>
        <CopyLinkButton />
      </div>

      <div style={{ background: MT.surface, border: `1px solid ${MT.border}`, borderRadius: MT.radiusLg, overflow: "hidden", boxShadow: MT.shadow }}>
        {requests.length === 0 ? (
          <p style={{ padding: "2rem", textAlign: "center", color: MT.text3, fontSize: 13, margin: 0 }}>No hay solicitudes todavía.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {requests.map((r, i) => {
              const stage = r.stages.find(s => s.key === r.currentStage);
              return (
                <div
                  key={r.id}
                  onClick={() => navigate(`/marketing/request/${r.id}`)}
                  style={{
                    display: "flex", alignItems: "center", gap: 12, padding: "0.75rem 1.1rem", cursor: "pointer",
                    borderTop: i === 0 ? "none" : `1px solid ${MT.border}`,
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = MT.surfaceAlt)}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: MT.text1 }}>{r.title}</span>
                  <span style={{ fontSize: 11.5, color: MT.text3, minWidth: 140 }}>{r.requesterEmail}</span>
                  <span style={{ fontSize: 11.5, color: MT.text3, minWidth: 90 }}>{r.assignedDisenoEmail ? disenoDisplayName(r.assignedDisenoEmail) : "Sin asignar"}</span>
                  <StatusPill
                    solid={r.status === "completed"}
                    color={r.status === "completed" ? MT.primary : stage ? ROLE_CFG[stage.role].color : MT.text2}
                    label={r.status === "completed" ? "✓ Completada" : requestStageLabel(r.currentStage)}
                  />
                  {stage?.deadline && <DeadlineBadge deadline={stage.deadline} compact />}
                  <span style={{ fontSize: 11, color: MT.text3, minWidth: 70, textAlign: "right" }}>{formatDateHuman(r.createdAt.slice(0, 10))}</span>
                  {canManage && (
                    <div style={{ position: "relative" }} onClick={e => e.stopPropagation()}>
                      <button aria-label="Acciones" title="Acciones" onClick={e => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
                        setMenuFor(menuFor === r.id ? null : r.id);
                      }} style={{
                        background: "none", border: "none", cursor: "pointer", fontSize: 20, lineHeight: 1, color: MT.text2, padding: "2px 8px", borderRadius: 6,
                      }}>⋮</button>
                      {menuFor === r.id && (
                        <div style={{ position: "fixed", right: menuPos.right, top: menuPos.top, zIndex: 1000, background: MT.surface, border: `1px solid ${MT.border}`, borderRadius: 8, boxShadow: MT.shadowLg, minWidth: 150, overflow: "hidden" }}>
                          {[
                            { label: "Editar", color: MT.text1, act: () => { setEditing(r); setEditTitle(r.title); setEditDesc(r.description); setError(""); } },
                            { label: "Reasignar", color: MT.text1, act: () => { setReassigning(r); setReassignEmail(""); setError(""); } },
                            { label: "Eliminar", color: MT.danger, act: () => {
                              if (window.confirm(`¿Eliminar la solicitud "${r.title}"? Esta acción no se puede deshacer.`)) {
                                deleteRequest(r.id).catch(e => window.alert(e?.message ?? "No se pudo eliminar."));
                              }
                            } },
                          ].map(item => (
                            <button key={item.label} onClick={() => { setMenuFor(null); item.act(); }} style={{
                              display: "block", width: "100%", textAlign: "left", fontFamily: MT.font, fontSize: 13, fontWeight: 600,
                              color: item.color, background: "none", border: "none", cursor: "pointer", padding: "9px 14px",
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = MT.surfaceAlt)}
                            onMouseLeave={e => (e.currentTarget.style.background = "none")}>{item.label}</button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {editing && (
        <div onClick={() => setEditing(null)} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: MT.surface, borderRadius: MT.radiusLg, maxWidth: 520, width: "100%", padding: "1.25rem 1.4rem", fontFamily: MT.font }}>
            <h2 style={{ margin: "0 0 12px", fontSize: 16, fontWeight: 800, color: MT.text1 }}>Editar solicitud</h2>
            <label style={{ fontSize: 12, fontWeight: 700, color: MT.text2 }}>Título</label>
            <input style={{ ...fieldStyle, margin: "4px 0 10px" }} value={editTitle} onChange={e => setEditTitle(e.target.value)} />
            <label style={{ fontSize: 12, fontWeight: 700, color: MT.text2 }}>Qué se necesita</label>
            <textarea style={{ ...fieldStyle, margin: "4px 0 10px", minHeight: 110, resize: "vertical" }} value={editDesc} onChange={e => setEditDesc(e.target.value)} />
            {error && <p style={{ color: MT.danger, fontSize: 12.5, margin: "0 0 8px" }}>{error}</p>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button onClick={() => setEditing(null)} style={{ fontFamily: MT.font, fontSize: 13, fontWeight: 600, cursor: "pointer", background: "none", border: `1px solid ${MT.border}`, borderRadius: 8, padding: "8px 14px", color: MT.text2 }}>Cancelar</button>
              <button disabled={busy || !editTitle.trim()} onClick={() => run(() => editRequest(editing.id, { title: editTitle, description: editDesc }), () => setEditing(null))} style={{ fontFamily: MT.font, fontSize: 13, fontWeight: 700, cursor: "pointer", background: MT.primary, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px" }}>{busy ? "..." : "Guardar"}</button>
            </div>
          </div>
        </div>
      )}

      {reassigning && (
        <div onClick={() => setReassigning(null)} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
          <div onClick={e => e.stopPropagation()} style={{ background: MT.surface, borderRadius: MT.radiusLg, maxWidth: 440, width: "100%", padding: "1.25rem 1.4rem", fontFamily: MT.font }}>
            <h2 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 800, color: MT.text1 }}>Reasignar solicitud</h2>
            <p style={{ margin: "0 0 12px", fontSize: 12.5, color: MT.text2 }}>{reassigning.title} — actualmente: {reassigning.assignedDisenoEmail ? disenoDisplayName(reassigning.assignedDisenoEmail) : "Sin asignar"}</p>
            <select style={fieldStyle} value={reassignEmail} onChange={e => setReassignEmail(e.target.value)}>
              <option value="">Elige a quién asignar…</option>
              {disenoEmailList.filter(e => e.toLowerCase() !== (reassigning.assignedDisenoEmail ?? "").toLowerCase()).map(e => <option key={e} value={e}>{disenoDisplayName(e)}</option>)}
            </select>
            {error && <p style={{ color: MT.danger, fontSize: 12.5, margin: "8px 0 0" }}>{error}</p>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
              <button onClick={() => setReassigning(null)} style={{ fontFamily: MT.font, fontSize: 13, fontWeight: 600, cursor: "pointer", background: "none", border: `1px solid ${MT.border}`, borderRadius: 8, padding: "8px 14px", color: MT.text2 }}>Cancelar</button>
              <button disabled={busy || !reassignEmail} onClick={() => run(() => assignRequest(reassigning.id, reassignEmail), () => setReassigning(null))} style={{ fontFamily: MT.font, fontSize: 13, fontWeight: 700, cursor: "pointer", background: MT.primary, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px" }}>{busy ? "..." : "Reasignar"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
