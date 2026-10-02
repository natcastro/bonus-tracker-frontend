import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { MT, formatDateHuman, ROLE_CFG } from "../theme";
import { useMarketing } from "../context";
import DeadlineBadge from "../components/DeadlineBadge";
import StatusPill from "../components/StatusPill";
import { requestStageLabel } from "../types";

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
  const { requests, disenoDisplayName, authedUser } = useMarketing();
  const navigate = useNavigate();

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
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
