import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { MT, formatDateHuman, formatRelative, ROLE_CFG } from "../theme";
import { useMarketing } from "../context";
import Timeline from "../components/Timeline";
import DeadlineBadge from "../components/DeadlineBadge";
import Avatar from "../components/Avatar";
import StatusPill from "../components/StatusPill";
import { TrashIcon, PencilIcon } from "../../../components/icons";
import { stageLabel, isPastDeadline, deadlineTimestamp, normalizeUrl, PUBLICATION_PLATFORMS, VARIANT_DEFS, variantLabel, variantStatusLabel } from "../types";
import type { PublicationPlatform, StageKey, VariantKey, BriefVariant, MarketingStage } from "../types";
import { uploadMarketingReviewImage, getBriefNotificationTimes } from "../../../services/api";

const ASSIGN_HELP_TEXT = "Elige a quién de Diseño se le asigna — los avisos de este brief (ajustes, aprobación, publicación) le llegarán solo a esa persona.";

const REVIEW_STAGES = new Set(["review1", "review2", "final"]);
const DESIGN_STAGES = new Set(["proposal", "adjustments", "adjustments2"]);
const LINK_STAGES = new Set<StageKey>(["brief", "proposal", "review1", "adjustments", "review2", "adjustments2"]);
const UPLOAD_LABELS: Record<string, string> = {
  proposal: "de la propuesta",
  adjustments: "de los ajustes",
  adjustments2: "de los ajustes (ronda 2)",
};

// Pending/in-review/done dot — per her "debe indicar visualmente cuáles están completas, en
// revisión o pendientes."
function variantDotColor(v: BriefVariant): string {
  if (!v.applicable) return MT.border;
  if (v.status === "completed") return MT.primary;
  const label = variantStatusLabel(v);
  if (label === "Pendiente") return MT.text3;
  if (label === "Cambios solicitados") return MT.danger;
  return MT.moss;
}

// When a stage was really delivered, in Colombia time. Newer stages store the exact moment; older ones
// are reconstructed from that day's "Diseño subió…"/"Laura…" notification.
const bogotaDate = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(d);
const bogotaTimeFmt = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });
function deliveredAt(s: MarketingStage, notifs: { createdAt: string; message: string }[]): { ts: Date; exact: boolean } | null {
  if (s.completedTs) return { ts: new Date(s.completedTs), exact: true };
  if (!s.completedAt) return null;
  const prefix = s.role === "diseno" ? "Diseño subió" : "Laura";
  const match = notifs.filter(n => n.message.startsWith(prefix) && bogotaDate(new Date(n.createdAt)) === s.completedAt).pop();
  return match ? { ts: new Date(match.createdAt), exact: false } : null;
}
function lateExplanation(s: MarketingStage, notifs: { createdAt: string; message: string }[]): string {
  const at = deliveredAt(s, notifs);
  if (!at) return "No quedó guardada la hora exacta de esta entrega.";
  const when = `${bogotaTimeFmt.format(at.ts)} (hora Colombia)${at.exact ? "" : " — según la notificación de ese día"}`;
  if (!s.deadline) return `Entregado: ${when}.`;
  const limitMs = deadlineTimestamp(s.deadline);
  const diffMin = Math.round((at.ts.getTime() - limitMs) / 60000);
  const limit = `${formatDateHuman(s.deadline)}, 5:30 p. m.`;
  if (diffMin <= 0) return `Entregado: ${when}. Límite actual: ${limit}. Con el horario actual estaba a tiempo; se marcó tarde con un horario de corte anterior.`;
  const h = Math.floor(diffMin / 60), m = diffMin % 60;
  return `Entregado: ${when}. Límite: ${limit}. Pasó el límite por ${h > 0 ? `${h} h ` : ""}${m} min.`;
}

export default function BriefDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const {
    authedUser, briefs, notifications, submitDesignStage, lauraReview, requestExtraRevision, confirmPublish,
    submitVariantProposal, variantLauraReview, variantRequestExtraRevision, variantConfirmPublish, markVariantNotApplicable,
    updateStageLink, updatePublicationLink, approvePublicationLinks, assignBrief, publishBrief, disenoEmailList, disenoDisplayName, deleteBrief,
  } = useMarketing();
  const brief = briefs.find(b => b.id === Number(id));
  const [linkInput, setLinkInput] = useState("");
  const [noteInput, setNoteInput] = useState("");
  const [reviewLinkInput, setReviewLinkInput] = useState("");
  const [uploadingReviewImage, setUploadingReviewImage] = useState(false);
  const [reviewImageError, setReviewImageError] = useState("");
  const [publishAssignEmail, setPublishAssignEmail] = useState("");
  const [draftLinkInput, setDraftLinkInput] = useState(() => brief?.stages.find(s => s.key === "brief")?.link ?? "");
  const [savingDraftLink, setSavingDraftLink] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [deleteError, setDeleteError] = useState("");
  const [editingStage, setEditingStage] = useState<StageKey | null>(null);
  const [lateOpen, setLateOpen] = useState<StageKey | null>(null);
  const [briefNotifTimes, setBriefNotifTimes] = useState<{ createdAt: string; message: string }[]>([]);
  useEffect(() => {
    if (brief?.id) getBriefNotificationTimes(brief.id).then(setBriefNotifTimes).catch(() => setBriefNotifTimes([]));
  }, [brief?.id]);
  const [editValue, setEditValue] = useState("");
  const [showReassign, setShowReassign] = useState(false);
  const [linkDrafts, setLinkDrafts] = useState<Partial<Record<PublicationPlatform, string>>>({});
  const [savingLink, setSavingLink] = useState<PublicationPlatform | null>(null);
  const [approvingLinks, setApprovingLinks] = useState(false);
  const [selectedVariantKey, setSelectedVariantKey] = useState<VariantKey | null>(null);
  // null = "untouched, use the default (just the currently selected variant)" — kept distinct
  // from an explicit empty array (every checkbox unchecked), which must block submission.
  const [coSubmitKeys, setCoSubmitKeys] = useState<VariantKey[] | null>(null);

  if (!brief) {
    return (
      <div style={{ maxWidth: 900, margin: "3rem auto", textAlign: "center", fontFamily: MT.font, color: MT.text2 }}>
        Brief no encontrado. <button onClick={() => navigate("/marketing/home")} style={{ color: MT.primary, background: "none", border: "none", cursor: "pointer", fontWeight: 700 }}>Volver</button>
      </div>
    );
  }

  const isVariantMode = !!brief.variants;
  const applicableVariants = brief.variants?.filter(v => v.applicable) ?? [];
  const activeVariantKey = selectedVariantKey ?? applicableVariants[0]?.key ?? null;
  const activeVariant = isVariantMode ? brief.variants!.find(v => v.key === activeVariantKey) ?? null : null;

  // In variant mode, everything below reads from the selected variant's own pipeline instead of
  // the brief's — in plain mode these are simply the brief's own fields, unchanged behavior.
  const activeStages = isVariantMode ? (activeVariant?.stages ?? []) : brief.stages;
  const activeCurrentStage = isVariantMode ? (activeVariant?.currentStage ?? "completed") : brief.currentStage;
  const activeCompletedAt = isVariantMode ? (activeVariant?.completedAt ?? null) : brief.completedAt;
  const activeInProgress = isVariantMode ? activeVariant?.status === "in_progress" : brief.status === "in_progress";
  const currentStage = activeStages.find(s => s.key === activeCurrentStage);
  const myRole = authedUser?.role;
  // A Diseño person can only act on briefs assigned specifically to them, never a colleague's.
  const isMyDisenoAssignment = myRole !== "diseno" || !brief.assignedDisenoEmail
    || brief.assignedDisenoEmail.toLowerCase() === authedUser?.email.toLowerCase();
  const canAct = activeInProgress && currentStage?.role === myRole && isMyDisenoAssignment;
  const isFinal = activeCurrentStage === "final";
  const isPublish = activeCurrentStage === "publish";
  // Only Laura or Carol can assign — Diseño no longer picks itself. Independent of canAct/turn,
  // since assignment needs to happen as soon as possible, not just when it's Diseño's turn.
  const canAssign = myRole === "laura" || myRole === "carol";
  const showAssignPanel = brief.status === "in_progress" && canAssign;

  // Other applicable variants currently at this exact same stage — Diseño can cover several at
  // once with one delivery, per her spec ("la persona... debe poder seleccionar una o varias variantes").
  const coDeliverableVariants = isVariantMode && activeVariant
    ? applicableVariants.filter(v => v.status === "in_progress" && v.currentStage === activeVariant.currentStage)
    : [];
  // What this delivery will actually be applied to — defaults to just the selected variant until
  // the person explicitly changes the checklist (including emptying it, which must block submit).
  const effectiveCoSubmitKeys: VariantKey[] = isVariantMode
    ? (coSubmitKeys ?? (activeVariantKey ? [activeVariantKey] : []))
    : [];

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError("");
    try { await fn(); setLinkInput(""); setNoteInput(""); setReviewLinkInput(""); setCoSubmitKeys([]); }
    catch (err: any) { setError(err?.message ?? "Ocurrió un error."); }
    finally { setBusy(false); }
  };

  const doSubmitDesign = (link: string, note?: string) => isVariantMode
    ? submitVariantProposal(brief.id, effectiveCoSubmitKeys, link, note)
    : submitDesignStage(brief.id, link, note);

  const doLauraReview = (action: "approve" | "request_changes", opts?: { link?: string; note?: string }) => isVariantMode
    ? variantLauraReview(brief.id, activeVariantKey!, action, opts)
    : lauraReview(brief.id, action, opts);

  const doExtraRevision = (note?: string) => isVariantMode
    ? variantRequestExtraRevision(brief.id, activeVariantKey!, note)
    : requestExtraRevision(brief.id, note);

  const doConfirmPublish = (note?: string) => isVariantMode
    ? variantConfirmPublish(brief.id, activeVariantKey!, note)
    : confirmPublish(brief.id, note);

  const handleMarkNotApplicable = async (key: VariantKey) => {
    const reason = prompt(`¿Por qué "${variantLabel(key)}" no aplica para este brief?`);
    if (reason === null) return;
    if (!reason.trim()) { alert("Necesitas escribir una justificación."); return; }
    try { await markVariantNotApplicable(brief.id, key, reason.trim()); }
    catch (err: any) { alert(err?.message ?? "No se pudo actualizar."); }
  };

  const handleDelete = async () => {
    if (!confirm(`¿Eliminar el brief ${brief.reference}? Esta acción no se puede deshacer.`)) return;
    setBusy(true); setDeleteError("");
    try { await deleteBrief(brief.id); navigate("/marketing/home"); }
    catch (err: any) { setDeleteError(err?.message ?? "No se pudo eliminar."); setBusy(false); }
  };

  const handleReviewImage = async (file: File) => {
    setReviewImageError("");
    setUploadingReviewImage(true);
    try {
      const url = await uploadMarketingReviewImage(brief.id, activeCurrentStage, file);
      setReviewLinkInput(url);
    } catch (err: any) {
      setReviewImageError(err?.message ?? "No se pudo subir la imagen.");
    } finally {
      setUploadingReviewImage(false);
    }
  };

  const startEdit = (stageKey: StageKey, currentLink: string | null) => {
    setEditingStage(stageKey);
    setEditValue(currentLink ?? "");
  };

  const saveEdit = async () => {
    if (!editingStage) return;
    setBusy(true);
    try { await updateStageLink(brief.id, editingStage, editValue.trim()); setEditingStage(null); }
    finally { setBusy(false); }
  };

  const fieldStyle: React.CSSProperties = {
    width: "100%", fontFamily: MT.font, fontSize: 13.5, padding: "9px 11px",
    border: `1px solid ${MT.border}`, borderRadius: 8, outline: "none", boxSizing: "border-box",
  };

  const noteField = (
    <div style={{ marginBottom: 12 }}>
      <label style={{ fontSize: 11.5, fontWeight: 700, color: MT.text2, display: "block", marginBottom: 5 }}>
        Nota para el correo (opcional)
      </label>
      <textarea
        value={noteInput} onChange={e => setNoteInput(e.target.value)} rows={2}
        placeholder="Algo que quieras que la otra persona vea en el correo..."
        style={{ ...fieldStyle, resize: "vertical", fontFamily: MT.font }}
      />
    </div>
  );

  // The variant sidebar — fixed while navigating between variants, per her "menú lateral fijo".
  const variantSidebar = isVariantMode && (
    <div style={{ width: 200, flexShrink: 0 }}>
      <div style={{ background: MT.surface, border: `1px solid ${MT.border}`, borderRadius: MT.radiusLg, padding: "0.6rem", position: "sticky", top: 60 }}>
        <p style={{ fontSize: 10.5, fontWeight: 700, color: MT.text3, textTransform: "uppercase", letterSpacing: "0.05em", padding: "0.3rem 0.4rem" }}>Variantes</p>
        {VARIANT_DEFS.map(def => {
          const v = brief.variants!.find(x => x.key === def.key)!;
          const isSelected = activeVariantKey === def.key;
          return (
            <button key={def.key} onClick={() => { setSelectedVariantKey(def.key); setCoSubmitKeys(null); }} style={{
              display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left",
              fontFamily: MT.font, fontSize: 12.5, fontWeight: isSelected ? 800 : 600, cursor: "pointer",
              padding: "0.55rem 0.5rem", borderRadius: 8, border: "none",
              background: isSelected ? MT.primarySoft : "transparent",
              color: v.applicable ? (isSelected ? MT.primary : MT.text1) : MT.text3,
              marginBottom: 2,
            }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: variantDotColor(v), flexShrink: 0 }} />
              <span style={{ flex: 1 }}>{def.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );

  const variantStatusHeader = isVariantMode && activeVariant && (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: "0.75rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: MT.text1 }}>{variantLabel(activeVariant.key)}</h2>
        <StatusPill solid color={activeVariant.status === "completed" ? MT.primary : MT.moss} label={variantStatusLabel(activeVariant)} />
      </div>
      {activeVariant.applicable && activeVariant.status === "in_progress" && (myRole === "laura" || myRole === "carol") && (
        <button onClick={() => handleMarkNotApplicable(activeVariant.key)} style={{
          fontFamily: MT.font, fontSize: 11.5, fontWeight: 700, cursor: "pointer",
          background: "none", border: "none", color: MT.text3, padding: 0,
        }}>Marcar como no aplica</button>
      )}
      {!activeVariant.applicable && activeVariant.naReason && (
        <span style={{ fontSize: 11.5, color: MT.text3 }}>No aplica — {activeVariant.naReason}</span>
      )}
    </div>
  );

  const content = (
    <>
      {showAssignPanel && (
        brief.assignedDisenoEmail && !showReassign ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: MT.surfaceAlt, borderRadius: MT.radiusLg, padding: "0.6rem 1rem", marginBottom: "1rem" }}>
            <span style={{ fontSize: 12.5, color: MT.text2 }}>Asignado a <strong style={{ color: MT.text1 }}>{disenoDisplayName(brief.assignedDisenoEmail)}</strong></span>
            <button onClick={() => setShowReassign(true)} style={{
              fontFamily: MT.font, fontSize: 12, fontWeight: 700, cursor: "pointer",
              background: "none", border: "none", color: MT.info, padding: 0,
            }}>Reasignar</button>
          </div>
        ) : (
          <div style={{ background: MT.surface, border: `2px solid ${MT.info}`, borderRadius: MT.radiusLg, padding: "1rem", marginBottom: "1rem" }}>
            <p style={{ fontWeight: 800, fontSize: 13.5, color: MT.text1, margin: "0 0 6px" }}>
              {brief.assignedDisenoEmail ? "Reasignar a Diseño" : "Asignar a Diseño"}
            </p>
            <p style={{ fontSize: 12, color: MT.text2, margin: "0 0 12px" }}>
              {brief.assignedDisenoEmail
                ? "Por si alguien no puede seguir con esta tarea — elige a quién más se le asigna."
                : ASSIGN_HELP_TEXT}
            </p>
            {error && <p style={{ color: MT.danger, fontSize: 12.5, marginBottom: 10 }}>{error}</p>}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {disenoEmailList.map(email => {
                const isCurrent = brief.assignedDisenoEmail === email;
                return (
                  <button key={email} disabled={busy || isCurrent} onClick={() => run(async () => { await assignBrief(brief.id, email); setShowReassign(false); })} style={{
                    fontFamily: MT.font, fontSize: 13, fontWeight: 700, cursor: busy || isCurrent ? "not-allowed" : "pointer",
                    background: isCurrent ? MT.primarySoft : MT.surfaceAlt, color: isCurrent ? MT.primary : MT.text1,
                    border: `1px solid ${isCurrent ? MT.primary : MT.border}`, borderRadius: 8, padding: "9px 14px",
                  }}>{isCurrent && "✓ "}{disenoDisplayName(email)}</button>
                );
              })}
              {brief.assignedDisenoEmail && (
                <button onClick={() => setShowReassign(false)} style={{
                  fontFamily: MT.font, fontSize: 13, fontWeight: 600, cursor: "pointer",
                  background: "none", border: "none", color: MT.text2, padding: "9px 4px",
                }}>Cancelar</button>
              )}
            </div>
          </div>
        )
      )}

      {variantStatusHeader}

      {isVariantMode && !activeVariant?.applicable ? (
        <div style={{ background: MT.surfaceAlt, borderRadius: MT.radiusLg, padding: "1.5rem", textAlign: "center", color: MT.text2, fontSize: 12.5 }}>
          Esta variante no aplica para este brief.
        </div>
      ) : (
      <>
      <div style={{ background: MT.surface, border: `1px solid ${MT.border}`, borderRadius: MT.radiusLg, padding: "1rem 1.1rem", marginBottom: "1rem" }}>
        <Timeline brief={{ stages: activeStages, currentStage: activeCurrentStage, status: activeInProgress ? "in_progress" : "completed" }} />
      </div>

      {/* Stage links history */}
      <div style={{ background: MT.surface, border: `1px solid ${MT.border}`, borderRadius: MT.radiusLg, padding: "1rem 1.1rem", marginBottom: "1rem" }}>
        <p style={{ fontWeight: 700, fontSize: 11, color: MT.text2, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.6rem" }}>Enlaces por etapa</p>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          {activeStages.map(s => {
            const isCurrent = activeInProgress && s.key === activeCurrentStage;
            const canEdit = !isVariantMode && LINK_STAGES.has(s.key) && s.role === myRole && isMyDisenoAssignment;
            const isEditing = editingStage === s.key;
            return (
              <div key={s.key} style={{
                display: "flex", alignItems: "center", flexWrap: "wrap", padding: "0.6rem 0.75rem",
                background: isCurrent ? MT.mossSoft : MT.surfaceAlt,
                border: isCurrent ? `1px solid ${MT.moss}50` : "1px solid transparent",
                borderRadius: 8, gap: 10,
              }}>
                <Avatar role={s.role} size={18} />
                <div style={{ fontSize: 12, color: MT.text1, fontWeight: 600, minWidth: 100 }}>{s.label}</div>
                <StatusPill
                  color={s.status === "done" ? MT.primary : isCurrent ? MT.moss : MT.text3}
                  label={s.status === "done" ? `✓ ${formatDateHuman(s.completedAt)}` : formatDateHuman(s.deadline)}
                />
                {s.status === "done" && s.late && (
                  <button type="button" onClick={() => setLateOpen(lateOpen === s.key ? null : s.key)}
                    title="Ver a qué hora se entregó" style={{
                    fontFamily: MT.font, fontSize: 10.5, fontWeight: 700, color: MT.danger, background: `${MT.danger}18`,
                    border: "none", cursor: "pointer", borderRadius: 999, padding: "2px 7px", flexShrink: 0,
                  }}>⚠ tarde {lateOpen === s.key ? "▴" : "▾"}</button>
                )}
                {s.status === "done" && s.late && lateOpen === s.key && (
                  <div style={{ flexBasis: "100%", order: 99, fontSize: 12, color: MT.text1, background: `${MT.danger}0F`, border: `1px solid ${MT.danger}30`, borderRadius: 6, padding: "6px 10px", lineHeight: 1.5 }}>
                    {lateExplanation(s, briefNotifTimes)}
                  </div>
                )}
                {isEditing ? (
                  <div style={{ flex: 1, display: "flex", gap: 6, alignItems: "center" }}>
                    <input
                      autoFocus value={editValue} onChange={e => setEditValue(e.target.value)}
                      placeholder="https://formatucuerpo.sharepoint.com/..."
                      style={{ flex: 1, fontFamily: MT.font, fontSize: 12.5, padding: "5px 8px", border: `1px solid ${MT.border}`, borderRadius: 6, outline: "none" }}
                    />
                    <button disabled={busy} onClick={saveEdit} style={{
                      fontFamily: MT.font, fontSize: 11.5, fontWeight: 700, cursor: "pointer",
                      background: MT.primary, color: "#fff", border: "none", borderRadius: 6, padding: "5px 10px",
                    }}>Guardar</button>
                    <button onClick={() => setEditingStage(null)} style={{
                      fontFamily: MT.font, fontSize: 11.5, fontWeight: 600, cursor: "pointer",
                      background: "none", color: MT.text2, border: "none", padding: "5px 4px",
                    }}>Cancelar</button>
                  </div>
                ) : (
                  <>
                    {s.link ? (
                      <a href={normalizeUrl(s.link)} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, color: MT.primary, fontWeight: 600, textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                        {s.link}
                      </a>
                    ) : (
                      <span style={{ fontSize: 12, color: MT.text3, flex: 1 }}>Sin enlace todavía</span>
                    )}
                    {canEdit && (
                      <button onClick={() => startEdit(s.key, s.link)} title="Editar enlace" style={{
                        background: "none", border: "none", cursor: "pointer", color: MT.text3, padding: 4,
                        display: "flex", alignItems: "center", flexShrink: 0,
                      }}>
                        <PencilIcon size={14} />
                      </button>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Activity history — every action taken on this brief, including delay/late markers and notes */}
      <div style={{ background: MT.surface, border: `1px solid ${MT.border}`, borderRadius: MT.radiusLg, padding: "1rem 1.1rem", marginBottom: "1rem" }}>
        <p style={{ fontWeight: 700, fontSize: 11, color: MT.text2, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.6rem" }}>Historial de actividad</p>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {notifications.filter(n => n.briefId === brief.id).length === 0 ? (
            <p style={{ fontSize: 12.5, color: MT.text3 }}>Sin actividad registrada todavía.</p>
          ) : (
            [...notifications].filter(n => n.briefId === brief.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(n => (
              <div key={n.id} style={{ fontSize: 12.5, color: MT.text1, lineHeight: 1.5, borderBottom: `1px solid ${MT.border}`, paddingBottom: "0.5rem" }}>
                <div>{n.message}</div>
                <div style={{ fontSize: 11, color: MT.text3, marginTop: 2 }}>{formatRelative(n.createdAt)} — {formatDateHuman(n.createdAt.slice(0, 10))}</div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Action panel — in plain (non-variant) mode, the overall "brief completado" state is
          shown once at the bottom alongside publication links, not duplicated here. */}
      {!activeInProgress && isVariantMode ? (
        <div style={{ background: MT.primarySoft, border: `1px solid ${MT.primary}30`, borderRadius: MT.radiusLg, padding: "1rem", textAlign: "center" }}>
          <p style={{ margin: 0, fontWeight: 800, color: MT.primary, fontSize: 14 }}>✓ Variante completada</p>
          <p style={{ margin: "0.3rem 0 0", fontSize: 12, color: MT.text2 }}>Cerrado el {formatDateHuman(activeCompletedAt)}</p>
        </div>
      ) : !activeInProgress ? null : !canAct ? (
        <div style={{ background: MT.surfaceAlt, borderRadius: MT.radiusLg, padding: "1rem", textAlign: "center", color: MT.text2, fontSize: 12.5 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
            {currentStage && <Avatar role={currentStage.role} size={18} />}
            <span>
              {currentStage?.role === "diseno" && myRole === "diseno" && !isMyDisenoAssignment
                ? <>Asignado a {disenoDisplayName(brief.assignedDisenoEmail)} — no es tu tarea</>
                : <>Esperando a {currentStage?.role === "laura" ? "Laura" : "Diseño"} — etapa actual: <strong>{stageLabel(activeCurrentStage)}</strong></>}
            </span>
          </div>
          {currentStage?.deadline && <div style={{ display: "flex", justifyContent: "center", marginTop: 10 }}><DeadlineBadge deadline={currentStage.deadline} /></div>}
        </div>
      ) : isPublish ? (
        <div style={{ background: MT.surface, border: `2px solid ${MT.clay}`, borderRadius: MT.radiusLg, padding: "1rem" }}>
          <p style={{ fontWeight: 800, fontSize: 13.5, color: MT.text1, margin: "0 0 10px" }}>
            Tu turno — Confirmar publicación
          </p>
          {currentStage?.deadline && <div style={{ marginBottom: "1rem" }}><DeadlineBadge deadline={currentStage.deadline} /></div>}
          {noteField}
          {error && <p style={{ color: MT.danger, fontSize: 12.5, marginBottom: 10 }}>{error}</p>}
          <button disabled={busy} onClick={() => run(() => doConfirmPublish(noteInput.trim() || undefined))} style={{
            fontFamily: MT.font, fontSize: 13.5, fontWeight: 700, cursor: busy ? "not-allowed" : "pointer",
            background: MT.primary, color: "#fff", border: "none", borderRadius: 8, padding: "10px 18px",
          }}>✓ Confirmar que ya se publicó</button>
          <p style={{ fontSize: 11.5, color: MT.text3, marginTop: 10 }}>
            Laura ya aprobó — esto cierra {isVariantMode ? "esta variante" : "el brief"} como completad{isVariantMode ? "a" : "o"}.
          </p>
        </div>
      ) : (
        <div style={{ background: MT.surface, border: `2px solid ${MT.clay}`, borderRadius: MT.radiusLg, padding: "1rem" }}>
          <p style={{ fontWeight: 800, fontSize: 13.5, color: MT.text1, margin: "0 0 10px" }}>
            Tu turno — {stageLabel(activeCurrentStage)}
          </p>
          {currentStage?.deadline && <div style={{ marginBottom: "1rem" }}><DeadlineBadge deadline={currentStage.deadline} /></div>}

          {DESIGN_STAGES.has(activeCurrentStage) && (
            <>
              {isVariantMode && coDeliverableVariants.length > 1 && (
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 12, fontWeight: 700, color: MT.text2, display: "block", marginBottom: 6 }}>
                    ¿A qué variantes aplica esta entrega? (obligatorio)
                  </label>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {coDeliverableVariants.map(v => {
                      const checked = effectiveCoSubmitKeys.includes(v.key);
                      return (
                        <label key={v.key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: MT.text1, cursor: "pointer" }}>
                          <input type="checkbox" checked={checked} onChange={() => {
                            setCoSubmitKeys(checked ? effectiveCoSubmitKeys.filter(k => k !== v.key) : [...effectiveCoSubmitKeys, v.key]);
                          }} />
                          {variantLabel(v.key)}
                        </label>
                      );
                    })}
                  </div>
                  {effectiveCoSubmitKeys.length === 0 && (
                    <p style={{ fontSize: 11.5, color: MT.danger, margin: "6px 0 0" }}>Selecciona al menos una variante.</p>
                  )}
                </div>
              )}
              <label style={{ fontSize: 12, fontWeight: 700, color: MT.text2, display: "block", marginBottom: 6 }}>
                Link de SharePoint {UPLOAD_LABELS[activeCurrentStage] ?? ""}
              </label>
              <input style={{ ...fieldStyle, marginBottom: 12 }} value={linkInput} onChange={e => setLinkInput(e.target.value)} placeholder="https://formatucuerpo.sharepoint.com/..." />
              {noteField}
              {error && <p style={{ color: MT.danger, fontSize: 12.5, marginTop: 8 }}>{error}</p>}
              <button
                disabled={busy || !linkInput.trim() || (isVariantMode && effectiveCoSubmitKeys.length === 0)}
                onClick={() => run(() => doSubmitDesign(linkInput.trim(), noteInput.trim() || undefined))}
                style={{
                  fontFamily: MT.font, fontSize: 13.5, fontWeight: 700, cursor: busy ? "not-allowed" : "pointer",
                  background: MT.primary, color: "#fff", border: "none", borderRadius: 8, padding: "10px 18px",
                }}>{busy ? "Enviando..." : "Subir y continuar"}</button>
            </>
          )}

          {REVIEW_STAGES.has(activeCurrentStage) && (
            <>
              <label style={{ fontSize: 12, fontWeight: 700, color: MT.text2, display: "block", marginBottom: 6 }}>
                Enlace o imagen con comentarios de ajuste (opcional)
              </label>
              <input style={{ ...fieldStyle, marginBottom: 8 }} value={reviewLinkInput} onChange={e => setReviewLinkInput(e.target.value)} placeholder="https://formatucuerpo.sharepoint.com/..." />
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <input
                  type="file"
                  accept="image/*"
                  disabled={uploadingReviewImage}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleReviewImage(f); e.target.value = ""; }}
                  style={{ fontSize: 12 }}
                />
                {uploadingReviewImage && <span style={{ fontSize: 12, color: MT.text3 }}>Subiendo…</span>}
              </div>
              {reviewLinkInput && /^https?:\/\/.*\.(png|jpe?g|gif|webp)(\?.*)?$/i.test(reviewLinkInput) && (
                <img src={reviewLinkInput} alt="Comentario de ajuste" style={{ maxWidth: "100%", maxHeight: 220, borderRadius: 8, marginBottom: 12, display: "block" }} />
              )}
              {reviewImageError && <p style={{ color: MT.danger, fontSize: 12.5, marginBottom: 10 }}>{reviewImageError}</p>}
              {noteField}
              {error && <p style={{ color: MT.danger, fontSize: 12.5, marginBottom: 10 }}>{error}</p>}
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
                {!isFinal && (
                  <button disabled={busy} onClick={() => run(() => doLauraReview("request_changes", { link: reviewLinkInput.trim() || undefined, note: noteInput.trim() || undefined }))} style={{
                    fontFamily: MT.font, fontSize: 13.5, fontWeight: 700, cursor: busy ? "not-allowed" : "pointer",
                    background: MT.clay, color: "#fff", border: "none", borderRadius: 8, padding: "10px 18px",
                  }}>Solicitar ajustes / continuar</button>
                )}

                {isFinal && (
                  <button disabled={busy} onClick={() => run(() => doExtraRevision(noteInput.trim() || undefined))} style={{
                    fontFamily: MT.font, fontSize: 13.5, fontWeight: 700, cursor: busy ? "not-allowed" : "pointer",
                    background: MT.clay, color: "#fff", border: "none", borderRadius: 8, padding: "10px 18px",
                  }}>Solicitar revisión adicional</button>
                )}

                <button disabled={busy} onClick={() => run(() => doLauraReview("approve", { note: noteInput.trim() || undefined }))} style={{
                  fontFamily: MT.font, fontSize: 13.5, fontWeight: 700, cursor: busy ? "not-allowed" : "pointer",
                  background: MT.surface, color: MT.primary, border: `1px solid ${MT.primary}`, borderRadius: 8, padding: "10px 18px",
                }}>✓ Aprobar sin cambios</button>
              </div>
              <p style={{ fontSize: 11.5, color: MT.text3, marginTop: 10 }}>
                {isFinal
                  ? "Aprobar envía a Diseño para confirmar la publicación. Solicitar revisión adicional reabre otra ronda de ajustes."
                  : "Aprobar sin cambios envía directo a Diseño para confirmar la publicación. Solicitar ajustes lo envía de vuelta a Diseño."}
              </p>
            </>
          )}
        </div>
      )}

      {activeInProgress && currentStage?.deadline && isPastDeadline(currentStage.deadline) && (
        <p style={{ marginTop: 12, fontSize: 12, color: MT.danger, fontWeight: 600 }}>
          ⚠ Esta etapa está atrasada — venció el {formatDateHuman(currentStage.deadline)}.
        </p>
      )}
      </>
      )}
    </>
  );

  return (
    <div style={{ maxWidth: isVariantMode ? 1180 : 980, margin: "0 auto", padding: "1.25rem 1.5rem", fontFamily: MT.font }}>
      <button onClick={() => navigate(-1)} style={{
        background: "none", border: "none", color: MT.text2, cursor: "pointer", fontSize: 12.5, marginBottom: 12, padding: 0,
      }}>← Volver</button>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10, marginBottom: "0.5rem" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 3 }}>
            <h1 style={{ margin: 0, fontSize: 21, fontWeight: 800, color: MT.text1 }}>{brief.reference}</h1>
            <StatusPill
              solid
              color={brief.status === "completed" ? MT.primary : brief.status === "draft" ? MT.text3 : currentStage ? ROLE_CFG[currentStage.role].color : MT.text2}
              label={brief.status === "completed" ? "✓ Completado" : brief.status === "draft" ? "Pendiente (privada)" : isVariantMode ? "Con variantes" : stageLabel(brief.currentStage)}
            />
          </div>
          <p style={{ margin: 0, fontSize: 12.5, color: MT.text2 }}>
            {brief.productLine && <>{brief.productLine} · </>}
            {brief.status === "draft" ? <>Inicio estimado: {formatDateHuman(brief.estimatedStartDate)}</> : <>Inicio: {formatDateHuman(brief.startDate)}</>}
            {brief.status === "in_progress" && brief.assignedDisenoEmail && <> · Asignado a {disenoDisplayName(brief.assignedDisenoEmail)}</>}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {brief.shiftDays > 0 && (
            <div style={{ fontSize: 11.5, color: MT.warn, background: MT.warnSoft, borderRadius: 8, padding: "0.35rem 0.65rem", fontWeight: 600 }}>
              ⏱ Deadlines de Diseño desplazados +{brief.shiftDays} día{brief.shiftDays !== 1 ? "s" : ""} por revisiones de Laura
            </div>
          )}
          {(myRole === "laura" || myRole === "carol") && (
            <button onClick={handleDelete} disabled={busy} style={{
              fontFamily: MT.font, fontSize: 11.5, fontWeight: 700, cursor: busy ? "not-allowed" : "pointer",
              background: MT.surface, color: MT.danger, border: `1px solid ${MT.danger}50`, borderRadius: 7, padding: "0.35rem 0.65rem",
              display: "flex", alignItems: "center", gap: 5,
            }}><TrashIcon size={14} color={MT.danger} /> Eliminar</button>
          )}
        </div>
      </div>

      {deleteError && <p style={{ color: MT.danger, fontSize: 12.5, marginBottom: 10 }}>{deleteError}</p>}

      {brief.status === "draft" ? (
        <div style={{ background: MT.surface, border: `2px solid ${MT.info}`, borderRadius: MT.radiusLg, padding: "1rem" }}>
          <p style={{ fontWeight: 800, fontSize: 13.5, color: MT.text1, margin: "0 0 6px" }}>Tarea pendiente (privada)</p>
          <p style={{ fontSize: 12, color: MT.text2, margin: "0 0 14px" }}>
            Nadie más ha sido notificado todavía. Cuando la publiques empieza el flujo normal — si no asignas a nadie, se le avisa a Karol.
          </p>
          {myRole === "laura" ? (
            <>
              <label style={{ fontSize: 12, fontWeight: 700, color: MT.text2, display: "block", marginBottom: 6 }}>Link de SharePoint del brief (opcional)</label>
              <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <input
                  style={fieldStyle} value={draftLinkInput} onChange={e => setDraftLinkInput(e.target.value)}
                  placeholder="https://formatucuerpo.sharepoint.com/..."
                />
                <button disabled={savingDraftLink} onClick={async () => {
                  setSavingDraftLink(true);
                  try { await updateStageLink(brief.id, "brief", draftLinkInput.trim()); }
                  finally { setSavingDraftLink(false); }
                }} style={{
                  fontFamily: MT.font, fontSize: 13, fontWeight: 700, cursor: savingDraftLink ? "not-allowed" : "pointer",
                  background: MT.surfaceAlt, color: MT.text1, border: `1px solid ${MT.border}`, borderRadius: 8, padding: "0 16px", whiteSpace: "nowrap",
                }}>{savingDraftLink ? "..." : "Guardar enlace"}</button>
              </div>

              <label style={{ fontSize: 12, fontWeight: 700, color: MT.text2, display: "block", marginBottom: 6 }}>Asignar a Diseño (opcional)</label>
              <select style={{ ...fieldStyle, marginBottom: 12 }} value={publishAssignEmail} onChange={e => setPublishAssignEmail(e.target.value)}>
                <option value="">Sin asignar — avisar a Karol</option>
                {disenoEmailList.map(email => <option key={email} value={email}>{disenoDisplayName(email)}</option>)}
              </select>
              {error && <p style={{ color: MT.danger, fontSize: 12.5, marginBottom: 10 }}>{error}</p>}
              <button disabled={busy} onClick={() => run(async () => {
                const currentLink = brief.stages.find(s => s.key === "brief")?.link ?? "";
                if (draftLinkInput.trim() !== currentLink) await updateStageLink(brief.id, "brief", draftLinkInput.trim());
                await publishBrief(brief.id, publishAssignEmail || undefined);
              })} style={{
                fontFamily: MT.font, fontSize: 13.5, fontWeight: 700, cursor: busy ? "not-allowed" : "pointer",
                background: MT.primary, color: "#fff", border: "none", borderRadius: 8, padding: "10px 18px",
              }}>{busy ? "Publicando..." : "Publicar ahora"}</button>
            </>
          ) : (
            <p style={{ fontSize: 12.5, color: MT.text3 }}>Solo Laura puede publicar esta tarea.</p>
          )}
        </div>
      ) : isVariantMode ? (
        <div style={{ display: "flex", gap: "1.25rem", alignItems: "flex-start" }}>
          {variantSidebar}
          <div style={{ flex: 1, minWidth: 0 }}>{content}</div>
        </div>
      ) : (
        content
      )}

      {brief.status === "completed" && (
        <div style={{ marginTop: "1.25rem" }}>
          <div style={{ background: MT.primarySoft, border: `1px solid ${MT.primary}30`, borderRadius: MT.radiusLg, padding: "1rem", textAlign: "center", marginBottom: "1rem" }}>
            <p style={{ margin: 0, fontWeight: 800, color: MT.primary, fontSize: 14 }}>✓ Brief completado</p>
            <p style={{ margin: "0.3rem 0 0", fontSize: 12, color: MT.text2 }}>Cerrado el {formatDateHuman(brief.completedAt)}</p>
          </div>

          {(() => {
            const filledCount = PUBLICATION_PLATFORMS.filter(p => (brief.publicationLinks[p.key] ?? "").trim()).length;
            const allFilled = filledCount === PUBLICATION_PLATFORMS.length;
            return (
              <div style={{ background: MT.surface, border: `2px solid ${brief.linksApprovedByKarol ? MT.primary : MT.info}`, borderRadius: MT.radiusLg, padding: "1rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <p style={{ fontWeight: 800, fontSize: 13.5, color: MT.text1, margin: 0 }}>Enlaces de publicación</p>
                  <StatusPill
                    solid={brief.linksApprovedByKarol}
                    color={brief.linksApprovedByKarol ? MT.primary : allFilled ? MT.info : MT.text3}
                    label={brief.linksApprovedByKarol ? "✓ Aprobado" : `${filledCount}/${PUBLICATION_PLATFORMS.length}`}
                  />
                </div>
                <p style={{ fontSize: 12, color: MT.text2, margin: "0 0 14px" }}>
                  Enlace de cada canal donde ya quedó publicado el producto.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
                  {PUBLICATION_PLATFORMS.map(({ key, label }) => {
                    const saved = brief.publicationLinks[key] ?? "";
                    const draft = linkDrafts[key] ?? saved;
                    const dirty = draft.trim() !== saved.trim();
                    return (
                      <div key={key}>
                        <label style={{ fontSize: 11.5, fontWeight: 700, color: MT.text2, display: "block", marginBottom: 4 }}>
                          {saved.trim() ? "✓ " : ""}{label}
                        </label>
                        <div style={{ display: "flex", gap: 6 }}>
                          <input
                            style={fieldStyle} value={draft} placeholder="https://..."
                            onChange={e => setLinkDrafts(prev => ({ ...prev, [key]: e.target.value }))}
                          />
                          {dirty && (
                            <button disabled={savingLink === key} onClick={async () => {
                              setSavingLink(key);
                              try { await updatePublicationLink(brief.id, key, draft.trim()); }
                              finally { setSavingLink(null); }
                            }} style={{
                              fontFamily: MT.font, fontSize: 12.5, fontWeight: 700, cursor: "pointer",
                              background: MT.primary, color: "#fff", border: "none", borderRadius: 8, padding: "0 14px", whiteSpace: "nowrap",
                            }}>{savingLink === key ? "..." : "Guardar"}</button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {brief.linksApprovedByKarol ? (
                  <p style={{ fontSize: 12.5, color: MT.primary, fontWeight: 700, margin: 0 }}>✓ Karol ya aprobó los enlaces de publicación.</p>
                ) : myRole === "carol" ? (
                  allFilled ? (
                    <button disabled={approvingLinks} onClick={async () => {
                      setApprovingLinks(true);
                      try { await approvePublicationLinks(brief.id); }
                      finally { setApprovingLinks(false); }
                    }} style={{
                      fontFamily: MT.font, fontSize: 13.5, fontWeight: 700, cursor: "pointer",
                      background: MT.primary, color: "#fff", border: "none", borderRadius: 8, padding: "10px 18px",
                    }}>{approvingLinks ? "..." : "✓ Aprobar"}</button>
                  ) : (
                    <p style={{ fontSize: 12, color: MT.text3, margin: 0 }}>Todavía faltan enlaces — Diseño se encarga del resto.</p>
                  )
                ) : null}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
