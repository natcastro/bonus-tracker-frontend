import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { HT, hoursOld, formatDate } from "../theme";
import { useLogisticsHub } from "../context";
import { PlatformBadge, AgeChip } from "../components/badges";
import AssignModal from "../components/AssignModal";
import ManualOrderModal from "../components/ManualOrderModal";
import type { HubOrder, Platform } from "../types";

function Kpi({
  value, label, sub, color, bg, onClick,
}: { value: string; label: string; sub: string; color: string; bg: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, minWidth: 180, textAlign: "left", cursor: "pointer",
      background: HT.surface, border: `1px solid ${HT.border}`, borderRadius: HT.radius,
      padding: "18px 18px 16px", boxShadow: HT.shadow, fontFamily: HT.font,
      transition: "transform 0.12s, box-shadow 0.12s",
    }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-1px)"; (e.currentTarget as HTMLButtonElement).style.boxShadow = HT.shadowLg; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)"; (e.currentTarget as HTMLButtonElement).style.boxShadow = HT.shadow; }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontSize: 30, fontWeight: 800, color, letterSpacing: "-0.02em" }}>{value}</span>
      </div>
      <div style={{ fontSize: 13.5, fontWeight: 700, color: HT.text1, marginTop: 4 }}>{label}</div>
      <div style={{ fontSize: 12, color: HT.text3, marginTop: 2 }}>{sub}</div>
      <div style={{ height: 4, borderRadius: 999, background: bg, marginTop: 12, overflow: "hidden" }}>
        <div style={{ height: "100%", width: "45%", background: color, borderRadius: 999 }} />
      </div>
    </button>
  );
}

const PLATFORM_FILTERS: { key: Platform | "all"; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "tiktok", label: "TikTok" },
  { key: "amazon", label: "Amazon" },
  { key: "shopify", label: "Online" },
];

export default function HomePage() {
  const { orders } = useLogisticsHub();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [platform, setPlatform] = useState<Platform | "all">("all");
  const [assigning, setAssigning] = useState<HubOrder | null>(null);
  const [showManualAdd, setShowManualAdd] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);

  const kpis = useMemo(() => {
    const unassigned = orders.filter((o) => o.status === "unassigned").length;
    const managing = orders.filter((o) => o.status === "pending_logistics").length;
    const active = orders.filter((o) => o.status !== "completed");
    const nearSla = active.filter((o) => {
      const h = hoursOld(o.createdAt);
      return h >= 12 && h < 24;
    }).length;
    const completed = orders.filter((o) => o.status === "completed");
    const onTime = completed.filter((o) => o.completedAt && (new Date(o.completedAt).getTime() - new Date(o.createdAt).getTime()) / 3_600_000 <= 24);
    const onTimePct = completed.length ? Math.round((onTime.length / completed.length) * 100) : 0;
    const problems = orders.filter((o) => o.status === "attention" || (o.status !== "completed" && hoursOld(o.createdAt) >= 24)).length;
    return { unassigned, managing, nearSla, onTimePct, completedCount: completed.length, problems };
  }, [orders]);

  const list = useMemo(() => {
    return orders
      .filter((o) => o.status === "unassigned")
      .filter((o) => (platform === "all" ? true : o.platform === platform))
      .filter((o) => (query ? o.id.toLowerCase().includes(query.toLowerCase()) || o.product.toLowerCase().includes(query.toLowerCase()) : true))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [orders, query, platform]);

  const scrollToTable = () => tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "32px 24px 60px" }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontFamily: HT.font, fontSize: 26, fontWeight: 800, color: HT.text1, margin: 0, letterSpacing: "-0.01em" }}>
          Home
        </h1>
        <p style={{ fontFamily: HT.font, fontSize: 14, color: HT.text2, margin: "4px 0 0" }}>
          Vista general del proceso operativo de órdenes.
        </p>
      </div>

      {/* KPIs */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 28 }}>
        <Kpi
          value={String(kpis.unassigned)} label="Pendientes por asignar" sub="órdenes sin tienda/bodega"
          color={HT.info} bg={HT.infoSoft}
          onClick={scrollToTable}
        />
        <Kpi
          value={String(kpis.managing)} label="Pendientes de gestionar" sub="requieren factura o label"
          color={HT.primary} bg={HT.primarySoft}
          onClick={() => navigate("/logistics/hub/pending", { state: { filter: "pending_logistics" } })}
        />
        <Kpi
          value={String(kpis.nearSla)} label="Menos de 24h restantes" sub="acercándose al límite SLA"
          color={HT.warn} bg={HT.warnSoft}
          onClick={() => navigate("/logistics/hub/pending", { state: { filter: "near_sla" } })}
        />
        <Kpi
          value={`${kpis.onTimePct}%`} label="Completadas a tiempo" sub={`${kpis.completedCount} completadas en total`}
          color={HT.success} bg={HT.successSoft}
          onClick={() => navigate("/logistics/hub/completed")}
        />
        <Kpi
          value={String(kpis.problems)} label="Problemas / Vencidas" sub="requieren atención inmediata"
          color={HT.danger} bg={HT.dangerSoft}
          onClick={() => navigate("/logistics/hub/pending", { state: { filter: "attention" } })}
        />
      </div>

      {/* Pendientes por asignar */}
      <div ref={tableRef} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 16, scrollMarginTop: 20 }}>
        <div>
          <h2 style={{ fontFamily: HT.font, fontSize: 17, fontWeight: 800, color: HT.text1, margin: 0 }}>
            Pendientes por asignar
          </h2>
          <p style={{ fontFamily: HT.font, fontSize: 13, color: HT.text2, margin: "3px 0 0" }}>
            Órdenes que todavía no tienen tienda/bodega asignada.
          </p>
        </div>
        <button onClick={() => setShowManualAdd(true)} style={{
          fontFamily: HT.font, fontSize: 13, fontWeight: 700, cursor: "pointer",
          background: HT.surface, color: HT.text1, border: `1px dashed ${HT.borderStrong}`,
          borderRadius: 8, padding: "9px 16px", whiteSpace: "nowrap",
        }}>+ Agregar orden</button>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 18 }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por número de orden o producto…"
          style={{
            flex: 1, fontFamily: HT.font, fontSize: 14, padding: "10px 14px",
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
      </div>

      <div style={{
        background: HT.surface, border: `1px solid ${HT.border}`, borderRadius: HT.radiusLg,
        boxShadow: HT.shadow, overflow: "hidden",
      }}>
        <div style={{
          display: "grid", gridTemplateColumns: "110px 90px 1.6fr 110px 60px 90px 100px 100px",
          padding: "10px 20px", borderBottom: `1px solid ${HT.border}`, background: HT.surfaceAlt,
        }}>
          {["Orden", "Plataforma", "Producto", "SKU", "Cant.", "Creada", "Edad", ""].map((h, i) => (
            <span key={i} style={{ fontFamily: HT.font, fontSize: 11, fontWeight: 700, color: HT.text3, textTransform: "uppercase", letterSpacing: "0.04em" }}>{h}</span>
          ))}
        </div>

        {list.length === 0 ? (
          <div style={{ padding: "48px 0", textAlign: "center", color: HT.text3, fontFamily: HT.font, fontSize: 14 }}>
            No hay órdenes pendientes por asignar.
          </div>
        ) : list.map((o) => (
          <div key={o.id} style={{
            display: "grid", gridTemplateColumns: "110px 90px 1.6fr 110px 60px 90px 100px 100px",
            alignItems: "center", padding: "14px 20px", borderBottom: `1px solid ${HT.border}`,
          }}>
            <span style={{ fontFamily: HT.mono, fontSize: 13, fontWeight: 700, color: HT.text1 }}>{o.id}</span>
            <div><PlatformBadge platform={o.platform} /></div>
            <div>
              <div style={{ fontFamily: HT.font, fontSize: 13.5, color: HT.text1, fontWeight: 500 }}>{o.product}</div>
              {o.customer && <div style={{ fontFamily: HT.font, fontSize: 12, color: HT.text3, marginTop: 1 }}>{o.customer}</div>}
            </div>
            <div style={{ fontFamily: HT.mono, fontSize: 12.5, color: HT.text2 }}>{o.sku}</div>
            <div style={{ fontFamily: HT.font, fontSize: 13, color: HT.text2 }}>{o.qty}</div>
            <div style={{ fontFamily: HT.font, fontSize: 12, color: HT.text2 }}>{formatDate(o.createdAt)}</div>
            <div><AgeChip createdAt={o.createdAt} /></div>
            <button onClick={() => setAssigning(o)} style={{
              fontFamily: HT.font, fontSize: 12.5, fontWeight: 700, cursor: "pointer",
              background: HT.primary, color: "#fff", border: "none", borderRadius: 8, padding: "7px 14px",
            }}>Asignar</button>
          </div>
        ))}
      </div>

      {assigning && <AssignModal order={assigning} onClose={() => setAssigning(null)} />}
      {showManualAdd && <ManualOrderModal onClose={() => setShowManualAdd(false)} />}
    </div>
  );
}
