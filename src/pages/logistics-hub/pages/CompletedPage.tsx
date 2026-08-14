import { useMemo, useState } from "react";
import { HT, formatDate } from "../theme";
import { useLogisticsHub } from "../context";
import { PlatformBadge, LocationTag } from "../components/badges";
import type { Platform } from "../types";
import { LOCATIONS } from "../mockData";

const PLATFORM_FILTERS: { key: Platform | "all"; label: string }[] = [
  { key: "all", label: "Todas" },
  { key: "tiktok", label: "TikTok" },
  { key: "amazon", label: "Amazon" },
  { key: "shopify", label: "Online" },
];

function processingTime(createdAt: string, completedAt?: string): string {
  if (!completedAt) return "—";
  const h = (new Date(completedAt).getTime() - new Date(createdAt).getTime()) / 3_600_000;
  if (h < 24) return `${Math.round(h)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

function slaOnTime(createdAt: string, completedAt?: string): boolean {
  if (!completedAt) return false;
  return (new Date(completedAt).getTime() - new Date(createdAt).getTime()) / 3_600_000 <= 24;
}

export default function CompletedPage() {
  const { orders, openOrder } = useLogisticsHub();
  const [query, setQuery] = useState("");
  const [platform, setPlatform] = useState<Platform | "all">("all");
  const [loc, setLoc] = useState<string | "all">("all");
  const [asc, setAsc] = useState(false);

  const list = useMemo(() => {
    let l = orders.filter((o) => o.status === "completed");
    if (platform !== "all") l = l.filter((o) => o.platform === platform);
    if (loc !== "all") l = l.filter((o) => o.location === loc);
    if (query) l = l.filter((o) => o.id.toLowerCase().includes(query.toLowerCase()));
    l = [...l].sort((a, b) => {
      const ta = new Date(a.completedAt ?? a.createdAt).getTime();
      const tb = new Date(b.completedAt ?? b.createdAt).getTime();
      return asc ? ta - tb : tb - ta;
    });
    return l;
  }, [orders, query, platform, loc, asc]);

  return (
    <div style={{ maxWidth: 1220, margin: "0 auto", padding: "32px 24px 60px" }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontFamily: HT.font, fontSize: 26, fontWeight: 800, color: HT.text1, margin: 0, letterSpacing: "-0.01em" }}>
          Completados
        </h1>
        <p style={{ fontFamily: HT.font, fontSize: 14, color: HT.text2, margin: "4px 0 0" }}>
          Historial y trazabilidad de órdenes completadas.
        </p>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar Order #…"
          style={{
            flex: "1 1 200px", fontFamily: HT.font, fontSize: 14, padding: "10px 14px",
            border: `1px solid ${HT.border}`, borderRadius: 10, outline: "none", background: HT.surface,
          }}
        />
        <div style={{ display: "flex", gap: 6 }}>
          {PLATFORM_FILTERS.map((p) => (
            <button key={p.key} onClick={() => setPlatform(p.key)} style={{
              fontFamily: HT.font, fontSize: 13, fontWeight: 600, cursor: "pointer",
              padding: "0 14px", borderRadius: 10,
              background: platform === p.key ? HT.text1 : HT.surface,
              color: platform === p.key ? "#fff" : HT.text2,
              border: `1px solid ${platform === p.key ? HT.text1 : HT.border}`, whiteSpace: "nowrap",
            }}>{p.label}</button>
          ))}
        </div>
        <select value={loc} onChange={(e) => setLoc(e.target.value)} style={{
          fontFamily: HT.font, fontSize: 13, fontWeight: 600, color: HT.text2,
          border: `1px solid ${HT.border}`, borderRadius: 10, padding: "0 12px", background: HT.surface,
        }}>
          <option value="all">Todas las tiendas</option>
          {LOCATIONS.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}
        </select>
        <button onClick={() => setAsc(!asc)} style={{
          fontFamily: HT.font, fontSize: 13, fontWeight: 600, cursor: "pointer",
          background: HT.surface, color: HT.text2, border: `1px solid ${HT.border}`, borderRadius: 10, padding: "0 14px",
        }}>{asc ? "↑ Antiguas" : "↓ Recientes"}</button>
      </div>

      <div style={{ background: HT.surface, border: `1px solid ${HT.border}`, borderRadius: HT.radiusLg, boxShadow: HT.shadow, overflow: "hidden" }}>
        <div style={{
          display: "grid", gridTemplateColumns: "100px 76px 80px 90px 1.3fr 110px 110px 90px 90px 90px",
          padding: "10px 18px", borderBottom: `1px solid ${HT.border}`, background: HT.surfaceAlt,
        }}>
          {["Orden", "Plat.", "Shopify#", "Tienda", "Producto", "Asignado por", "Completado por", "Fecha", "Tiempo", "SLA"].map((h, i) => (
            <span key={i} style={{ fontFamily: HT.font, fontSize: 10.5, fontWeight: 700, color: HT.text3, textTransform: "uppercase", letterSpacing: "0.03em" }}>{h}</span>
          ))}
        </div>

        {list.length === 0 ? (
          <div style={{ padding: "44px 0", textAlign: "center", color: HT.text3, fontFamily: HT.font, fontSize: 14 }}>
            Sin resultados.
          </div>
        ) : list.map((o) => {
          const onTime = slaOnTime(o.createdAt, o.completedAt);
          return (
            <div key={o.id} style={{
              display: "grid", gridTemplateColumns: "100px 76px 80px 90px 1.3fr 110px 110px 90px 90px 90px",
              alignItems: "center", padding: "12px 18px", borderBottom: `1px solid ${HT.border}`,
            }}>
              <button onClick={() => openOrder(o.id)} style={{
                fontFamily: HT.mono, fontSize: 12.5, fontWeight: 700, color: HT.primary,
                background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: 0,
              }}>{o.id}</button>
              <div><PlatformBadge platform={o.platform} /></div>
              <div style={{ fontFamily: HT.mono, fontSize: 12, color: HT.text2 }}>{o.shopifyNumber ?? "—"}</div>
              <div><LocationTag location={o.location} /></div>
              <div style={{ fontFamily: HT.font, fontSize: 13, color: HT.text1 }}>{o.product}</div>
              <div style={{ fontFamily: HT.font, fontSize: 12.5, color: HT.text2 }}>{o.assignedBy ?? "—"}</div>
              <div style={{ fontFamily: HT.font, fontSize: 12.5, color: HT.text2 }}>{o.completedBy ?? "—"}</div>
              <div style={{ fontFamily: HT.font, fontSize: 11.5, color: HT.text2 }}>{o.completedAt ? formatDate(o.completedAt) : "—"}</div>
              <div style={{ fontFamily: HT.mono, fontSize: 12.5, color: HT.text2 }}>{processingTime(o.createdAt, o.completedAt)}</div>
              <div>
                <span style={{
                  fontFamily: HT.font, fontSize: 11, fontWeight: 700,
                  color: onTime ? HT.success : HT.warn, background: onTime ? HT.successSoft : HT.warnSoft,
                  borderRadius: 6, padding: "3px 8px",
                }}>{onTime ? "A tiempo" : "Tarde"}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
