import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { MT, formatDateHuman, ROLE_CFG } from "../theme";
import { useMarketing } from "../context";
import { useHubAccess } from "../../../auth/HubAccessContext";
import DeadlineBadge from "../components/DeadlineBadge";
import StatusPill from "../components/StatusPill";
import { requestStageLabel, normalizeUrl } from "../types";
import { uploadMarketingRequestFile } from "../../../services/api";

// Reachable two ways: internally (Laura/Diseño/Karol, from the Solicitudes tab) and via the
// public request link (anyone with a company Microsoft login, no Marketing role needed) — so
// identity here comes straight from the Hub login, not from a Marketing role that may not exist.
export default function RequestDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { authedUser, requests, disenoEmailList, disenoDisplayName, assignRequest, submitRequestDelivery, requesterReview } = useMarketing();
  const { email: rawEmail } = useHubAccess();
  const request = requests.find(r => r.id === Number(id));
  const [linkInput, setLinkInput] = useState("");
  const [noteInput, setNoteInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const [assignEmail, setAssignEmail] = useState("");
  const [showReassign, setShowReassign] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const header = (
    <div style={{ fontSize: 14, fontWeight: 800, color: MT.text1, letterSpacing: "-0.01em", marginBottom: "1.5rem" }}>
      FTC Hub — <span style={{ color: MT.primary }}>Marketing</span>
    </div>
  );

  if (!request) {
    return (
      <div style={{ maxWidth: 820, margin: "0 auto", padding: "1.25rem 1.5rem", fontFamily: MT.font }}>
        {header}
        <div style={{ textAlign: "center", color: MT.text2, marginTop: "2rem" }}>Solicitud no encontrada.</div>
      </div>
    );
  }

  const myRole = authedUser?.role;
  const myEmail = rawEmail.toLowerCase();
  const isRequester = request.requesterEmail.toLowerCase() === myEmail;
  const isSharedViewer = request.sharedWithEmails.some(e => e.toLowerCase() === myEmail);
  // Internal roles (Laura/Diseño/Karol) can see every request, like Briefs/To Do — someone with
  // no Marketing role at all can only see requests they created or were explicitly shared.
  const canView = !!myRole || isRequester || isSharedViewer;
  const currentStage = request.stages.find(s => s.key === request.currentStage);
  const isMyDisenoAssignment = myRole !== "diseno" || !request.assignedDisenoEmail || request.assignedDisenoEmail.toLowerCase() === myEmail;
  const canDeliver = request.status === "in_progress" && currentStage?.role === "diseno" && myRole === "diseno" && isMyDisenoAssignment;
  const canReview = request.status === "in_progress" && currentStage?.role === "requester" && isRequester;
  const canAssign = myRole === "laura" || myRole === "carol";

  const fieldStyle: React.CSSProperties = {
    width: "100%", fontFamily: MT.font, fontSize: 13.5, padding: "9px 11px",
    border: `1px solid ${MT.border}`, borderRadius: 8, outline: "none", boxSizing: "border-box",
  };

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError("");
    try { await fn(); setLinkInput(""); setNoteInput(""); }
    catch (err: any) { setError(err?.message ?? "Ocurrió un error."); }
    finally { setBusy(false); }
  };

  const handleFile = async (file: File) => {
    setUploading(true); setError("");
    try { setLinkInput(await uploadMarketingRequestFile(request.requesterEmail, file)); }
    catch (err: any) { setError(err?.message ?? "No se pudo subir el archivo."); }
    finally { setUploading(false); }
  };

  if (!canView) {
    return (
      <div style={{ maxWidth: 820, margin: "0 auto", padding: "1.25rem 1.5rem", fontFamily: MT.font }}>
        {header}
        <div style={{ textAlign: "center", color: MT.text2, marginTop: "2rem" }}>No tienes acceso a esta solicitud.</div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "1.25rem 1.5rem", fontFamily: MT.font }}>
      {header}
      {myRole && (
        <button onClick={() => navigate("/marketing/requests")} style={{
          background: "none", border: "none", color: MT.text2, cursor: "pointer", fontSize: 12.5, marginBottom: 12, padding: 0,
        }}>← Volver a Solicitudes</button>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 3 }}>
        <h1 style={{ margin: 0, fontSize: 21, fontWeight: 800, color: MT.text1 }}>{request.title}</h1>
        <StatusPill
          solid
          color={request.status === "completed" ? MT.primary : currentStage ? ROLE_CFG[currentStage.role].color : MT.text2}
          label={request.status === "completed" ? "✓ Completada" : requestStageLabel(request.currentStage)}
        />
      </div>
      <p style={{ margin: "0 0 1rem", fontSize: 12.5, color: MT.text2 }}>
        Solicitada por {request.requesterEmail} · {formatDateHuman(request.createdAt.slice(0, 10))}
        {request.assignedDisenoEmail && <> · Asignado a {disenoDisplayName(request.assignedDisenoEmail)}</>}
        {request.revisionRounds > 0 && <> · {request.revisionRounds} ronda{request.revisionRounds !== 1 ? "s" : ""} de cambios</>}
      </p>

      <div style={{ background: MT.surface, border: `1px solid ${MT.border}`, borderRadius: MT.radiusLg, padding: "1rem", marginBottom: "1rem", boxShadow: MT.shadow }}>
        <h3 style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 800, color: MT.text1 }}>Qué se necesita</h3>
        <p style={{ margin: "0 0 10px", fontSize: 13, color: MT.text2, whiteSpace: "pre-wrap" }}>{request.description}</p>
        {request.attachments.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {request.attachments.map((url, i) => (
              <a key={url} href={url} target="_blank" rel="noreferrer" style={{
                fontSize: 11.5, fontWeight: 700, color: MT.info, background: MT.infoSoft, borderRadius: 999, padding: "4px 10px", textDecoration: "none",
              }}>📎 Archivo {i + 1}</a>
            ))}
          </div>
        )}
        {request.sharedWithEmails.length > 0 && (
          <p style={{ margin: "10px 0 0", fontSize: 11.5, color: MT.text3 }}>Compartido con: {request.sharedWithEmails.join(", ")}</p>
        )}
      </div>

      {/* Simple 2-step timeline */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "0.75rem 0", marginBottom: "1rem" }}>
        {request.stages.map((s, i) => {
          const done = s.status === "done";
          const isCurrent = s.key === request.currentStage;
          const color = done || isCurrent ? MT.primary : MT.text3;
          return (
            <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{
                  width: isCurrent ? 36 : 28, height: isCurrent ? 36 : 28, borderRadius: 999,
                  background: done || isCurrent ? MT.primarySoft : MT.surfaceAlt, color,
                  display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13,
                  border: isCurrent ? `2px solid ${MT.primary}` : "1px solid transparent",
                }}>{done ? "✓" : i + 1}</div>
                <div style={{ fontSize: 11, fontWeight: isCurrent ? 800 : 600, color: isCurrent ? MT.text1 : MT.text3, marginTop: 5 }}>{s.label}</div>
                <div style={{ fontSize: 9.5, color: MT.text3 }}>{formatDateHuman(done ? s.completedAt : s.deadline)}</div>
              </div>
              {i < request.stages.length - 1 && <div style={{ width: 22, height: 2, background: done ? MT.primary : MT.border }} />}
            </div>
          );
        })}
        {request.status === "completed" && (
          <div style={{ marginLeft: 6, fontSize: 11.5, fontWeight: 800, color: MT.primary, background: MT.primarySoft, padding: "0.25rem 0.6rem", borderRadius: 999 }}>✓ Completada</div>
        )}
      </div>

      {canAssign && request.status === "in_progress" && (
        request.assignedDisenoEmail && !showReassign ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: MT.surfaceAlt, borderRadius: MT.radiusLg, padding: "0.6rem 1rem", marginBottom: "1rem" }}>
            <span style={{ fontSize: 12.5, color: MT.text2 }}>Asignado a <strong style={{ color: MT.text1 }}>{disenoDisplayName(request.assignedDisenoEmail)}</strong></span>
            <button onClick={() => setShowReassign(true)} style={{ fontFamily: MT.font, fontSize: 12, fontWeight: 700, cursor: "pointer", background: "none", border: "none", color: MT.info, padding: 0 }}>Reasignar</button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8, marginBottom: "1rem" }}>
            <select style={fieldStyle} value={assignEmail} onChange={e => setAssignEmail(e.target.value)}>
              <option value="">Elegir Diseño...</option>
              {disenoEmailList.map(email => <option key={email} value={email}>{disenoDisplayName(email)}</option>)}
            </select>
            <button disabled={!assignEmail || busy} onClick={() => run(async () => { await assignRequest(request.id, assignEmail); setShowReassign(false); setAssignEmail(""); })} style={{
              fontFamily: MT.font, fontSize: 13, fontWeight: 700, cursor: "pointer",
              background: MT.primary, color: "#fff", border: "none", borderRadius: 8, padding: "0 16px", whiteSpace: "nowrap",
            }}>Asignar</button>
          </div>
        )
      )}

      {error && <p style={{ color: MT.danger, fontSize: 12.5, marginBottom: 10 }}>{error}</p>}

      {canDeliver && (
        <div style={{ background: MT.surface, border: `2px solid ${MT.clay}`, borderRadius: MT.radiusLg, padding: "1rem" }}>
          <p style={{ fontWeight: 800, fontSize: 13.5, color: MT.text1, margin: "0 0 10px" }}>Entregar</p>
          <label style={{ fontSize: 11.5, fontWeight: 700, color: MT.text2, display: "block", marginBottom: 5 }}>Link o archivo de la entrega</label>
          <input style={{ ...fieldStyle, marginBottom: 8 }} value={linkInput} onChange={e => setLinkInput(e.target.value)} placeholder="https://..." />
          <input type="file" style={{ ...fieldStyle, marginBottom: 12, padding: "6px" }} onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
          <label style={{ fontSize: 11.5, fontWeight: 700, color: MT.text2, display: "block", marginBottom: 5 }}>Nota (opcional)</label>
          <textarea style={{ ...fieldStyle, marginBottom: 12, resize: "vertical" }} rows={2} value={noteInput} onChange={e => setNoteInput(e.target.value)} />
          <button disabled={busy || uploading || !linkInput.trim()} onClick={() => run(async () => {
            await submitRequestDelivery(request.id, normalizeUrl(linkInput.trim()), noteInput.trim() || undefined);
          })} style={{
            fontFamily: MT.font, fontSize: 13.5, fontWeight: 700, cursor: "pointer",
            background: MT.clay, color: "#fff", border: "none", borderRadius: 8, padding: "10px 18px",
          }}>{uploading ? "Subiendo..." : busy ? "Entregando..." : "Entregar"}</button>
        </div>
      )}

      {canReview && (
        <div style={{ background: MT.surface, border: `2px solid ${MT.violet}`, borderRadius: MT.radiusLg, padding: "1rem" }}>
          <p style={{ fontWeight: 800, fontSize: 13.5, color: MT.text1, margin: "0 0 10px" }}>Revisar entrega</p>
          {currentStage?.link && (
            <a href={currentStage.link} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, fontWeight: 700, color: MT.info, display: "block", marginBottom: 12 }}>Ver entrega →</a>
          )}
          <label style={{ fontSize: 11.5, fontWeight: 700, color: MT.text2, display: "block", marginBottom: 5 }}>Nota (opcional)</label>
          <textarea style={{ ...fieldStyle, marginBottom: 12, resize: "vertical" }} rows={2} value={noteInput} onChange={e => setNoteInput(e.target.value)} />
          <div style={{ display: "flex", gap: 8 }}>
            <button disabled={busy} onClick={() => run(async () => { await requesterReview(request.id, "approve", { note: noteInput.trim() || undefined }); })} style={{
              fontFamily: MT.font, fontSize: 13.5, fontWeight: 700, cursor: "pointer",
              background: MT.primary, color: "#fff", border: "none", borderRadius: 8, padding: "10px 18px",
            }}>✓ Aprobar</button>
            <button disabled={busy} onClick={() => run(async () => { await requesterReview(request.id, "request_changes", { note: noteInput.trim() || undefined }); })} style={{
              fontFamily: MT.font, fontSize: 13.5, fontWeight: 700, cursor: "pointer",
              background: MT.surfaceAlt, color: MT.text1, border: `1px solid ${MT.border}`, borderRadius: 8, padding: "10px 18px",
            }}>Pedir cambios</button>
          </div>
        </div>
      )}

      {currentStage?.link && !canDeliver && !canReview && (
        <p style={{ fontSize: 12.5, color: MT.text2 }}>Última entrega: <a href={currentStage.link} target="_blank" rel="noreferrer" style={{ color: MT.info, fontWeight: 700 }}>Ver →</a></p>
      )}

      {currentStage?.deadline && request.status === "in_progress" && (
        <div style={{ marginTop: "1rem" }}><DeadlineBadge deadline={currentStage.deadline} /></div>
      )}
    </div>
  );
}
