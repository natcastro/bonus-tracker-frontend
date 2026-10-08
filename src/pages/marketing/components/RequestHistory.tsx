import { MT } from "../theme";
import { normalizeUrl } from "../types";
import type { MarketingRequest } from "../types";

const when = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true });
const whenDate = new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", day: "numeric", month: "short" });

function fileName(url: string): string {
  try {
    const last = decodeURIComponent(new URL(normalizeUrl(url)).pathname.split("/").filter(Boolean).pop() ?? "");
    return last || "Enlace";
  } catch { return "Enlace"; }
}

// Uploaded files can be saved straight to the computer; links to SharePoint etc. just open (the
// browser can't read those files, so the fetch falls back to opening them).
async function download(url: string) {
  const href = normalizeUrl(url);
  try {
    const res = await fetch(href);
    if (!res.ok) throw new Error("bad response");
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = fileName(url);
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  } catch {
    window.open(href, "_blank", "noopener");
  }
}

function FileRow({ url }: { url: string }) {
  const isImage = /\.(png|jpe?g|gif|webp)(\?.*)?$/i.test(url);
  return (
    <div style={{ marginTop: 8 }}>
      {isImage && <img src={normalizeUrl(url)} alt="" style={{ maxWidth: "100%", maxHeight: 160, borderRadius: 8, display: "block", marginBottom: 6 }} />}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, color: MT.text2, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>📎 {fileName(url)}</span>
        <a href={normalizeUrl(url)} target="_blank" rel="noreferrer" style={{ fontSize: 12, fontWeight: 700, color: MT.info, textDecoration: "none" }}>Ver</a>
        <button type="button" onClick={() => download(url)} style={{
          fontFamily: MT.font, fontSize: 12, fontWeight: 700, color: MT.primary, background: "none", border: "none", cursor: "pointer", padding: 0,
        }}>Descargar</button>
      </div>
    </div>
  );
}

interface Entry { at: string; who: "requester" | "diseno"; title: string; note?: string; files: string[]; dateOnly?: boolean }

// Every round of the request in order: what was asked, each delivery, and each answer — with the
// files from every round (the live request only keeps the latest delivery link).
export default function RequestHistory({ request, viewer, designerName }: { request: MarketingRequest; viewer: "requester" | "internal"; designerName: string | null }) {
  const entries: Entry[] = [];
  entries.push({
    at: request.createdAt, who: "requester",
    title: viewer === "requester" ? "Enviaste la solicitud" : `Solicitud enviada por ${request.requesterEmail}`,
    files: request.attachments,
  });

  const delivery = request.stages.find(s => s.key === "delivery");
  const review = request.stages.find(s => s.key === "review");
  let deliveries = delivery?.deliveries ?? [];
  // Requests delivered before history was recorded: show the one delivery we still know about.
  let legacyDelivery = false;
  if (deliveries.length === 0 && delivery?.link && delivery.completedAt) {
    // Only the day is known — never let it sort before the request itself.
    const guess = new Date(`${delivery.completedAt}T23:59:00-05:00`).getTime();
    const afterRequest = new Date(request.createdAt).getTime() + 60_000;
    deliveries = [{ link: delivery.link, at: new Date(Math.max(guess, afterRequest)).toISOString() }];
    legacyDelivery = true;
  }
  deliveries.forEach((d, i) => entries.push({
    at: d.at, who: "diseno", dateOnly: legacyDelivery,
    title: `Entrega de Diseño${deliveries.length > 1 ? ` #${i + 1}` : ""}${designerName ? ` — ${designerName}` : ""}`,
    note: d.note, files: [d.link],
  }));
  (review?.reviews ?? []).forEach(r => entries.push({
    at: r.at, who: "requester",
    title: r.decision === "approved"
      ? (viewer === "requester" ? "Aprobaste la entrega" : "El solicitante aprobó la entrega")
      : (viewer === "requester" ? "Pediste cambios" : "El solicitante pidió cambios"),
    note: r.note, files: [],
  }));
  entries.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()); // newest first, same as a brief's activity history

  return (
    <div style={{ background: MT.surface, border: `1px solid ${MT.border}`, borderRadius: MT.radiusLg, padding: "1rem 1.1rem", marginBottom: "1rem" }}>
      <p style={{ fontWeight: 700, fontSize: 11, color: MT.text2, textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 0.7rem" }}>Historial</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {entries.map((e, i) => {
          const color = e.who === "diseno" ? MT.clay : MT.violet;
          return (
            <div key={i} style={{ borderLeft: `3px solid ${color}`, background: MT.surfaceAlt, borderRadius: 8, padding: "0.6rem 0.8rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: MT.text1 }}>{e.title}</span>
                <span style={{ fontSize: 11.5, color: MT.text3 }}>{(e.dateOnly ? whenDate : when).format(new Date(e.at))}</span>
              </div>
              {e.note && <p style={{ margin: "4px 0 0", fontSize: 12.5, color: MT.text2, whiteSpace: "pre-wrap" }}>{e.note}</p>}
              {e.files.map(f => <FileRow key={f} url={f} />)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
