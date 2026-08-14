import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { HT, hoursOld } from "../theme";
import { useLogisticsHub } from "../context";
import { PlatformBadge, StatusBadge, LocationTag, AgeChip, DocPill } from "../components/badges";
import DocsModal from "../components/DocsModal";
import type { HubOrder, HubRole, HubLocation } from "../types";

type LogisticsTab = "all" | "attention";

const ROLE_OPTIONS: { key: HubRole; label: string }[] = [
  { key: "admin", label: "Admin" },
  { key: "logistics", label: "Logística" },
  { key: "Belier", label: "Tienda Belier" },
  { key: "Norte", label: "Tienda Norte" },
  { key: "Plaza", label: "Tienda Plaza" },
];

const ALL_STORES: HubLocation[] = ["Belier", "Norte", "Plaza", "Colombia"];

function RoleSwitch({ role, setRole }: { role: HubRole; setRole: (r: HubRole) => void }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10, marginBottom: 20,
      background: HT.warnSoft, border: `1px solid rgba(217,119,6,0.2)`, borderRadius: 10, padding: "10px 14px",
    }}>
      <span style={{ fontFamily: HT.font, fontSize: 12, fontWeight: 700, color: HT.warn, whiteSpace: "nowrap" }}>
        Ver como:
      </span>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {ROLE_OPTIONS.map((o) => (
          <button key={o.key} onClick={() => setRole(o.key)} style={{
            fontFamily: HT.font, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
            padding: "5px 12px", borderRadius: 999,
            background: role === o.key ? HT.text1 : HT.surface,
            color: role === o.key ? "#fff" : HT.text2,
            border: `1px solid ${role === o.key ? HT.text1 : HT.border}`,
          }}>{o.label}</button>
        ))}
      </div>
      <span style={{ fontFamily: HT.font, fontSize: 11.5, color: HT.text2, marginLeft: "auto" }}>
        Demo · en producción esto lo define el usuario en Configuración → Usuarios
      </span>
    </div>
  );
}

function SectionToggle({ section, setSection, storeLabel }: {
  section: "logistics" | "store"; setSection: (s: "logistics" | "store") => void; storeLabel: string;
}) {
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
      {([
        { key: "logistics", label: "Logística" },
        { key: "store", label: storeLabel },
      ] as { key: "logistics" | "store"; label: string }[]).map((t) => (
        <button key={t.key} onClick={() => setSection(t.key)} style={{
          fontFamily: HT.font, fontSize: 13.5, fontWeight: 700, cursor: "pointer",
          padding: "8px 16px", borderRadius: 8,
          background: section === t.key ? HT.text1 : HT.surface,
          color: section === t.key ? "#fff" : HT.text2,
          border: `1px solid ${section === t.key ? HT.text1 : HT.border}`,
        }}>{t.label}</button>
      ))}
    </div>
  );
}

function LogisticsView({ tab, setTab }: { tab: LogisticsTab; setTab: (t: LogisticsTab) => void }) {
  const { orders, openOrder, retryAttention } = useLogisticsHub();
  const [docsOrder, setDocsOrder] = useState<HubOrder | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [retryMsg, setRetryMsg] = useState("");

  const base = orders.filter((o) => o.status === "pending_logistics" || o.status === "attention");
  const list = useMemo(() => {
    const filtered = tab === "attention" ? base.filter((o) => o.status === "attention") : base;
    return [...filtered].sort((a, b) => hoursOld(b.createdAt) - hoursOld(a.createdAt));
  }, [base, tab]);

  const attentionCount = base.filter((o) => o.status === "attention").length;

  const handleRetry = async (order: HubOrder) => {
    setRetrying(order.id);
    await retryAttention(order.id, setRetryMsg);
    setRetrying(null);
  };

  return (
    <>
      <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
        {([
          { key: "all", label: "Todas" },
          { key: "attention", label: `Requiere atención${attentionCount ? ` (${attentionCount})` : ""}` },
        ] as { key: LogisticsTab; label: string }[]).map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            fontFamily: HT.font, fontSize: 13, fontWeight: 600, cursor: "pointer",
            padding: "7px 14px", borderRadius: 8,
            background: tab === t.key ? HT.primarySoft : "transparent",
            color: tab === t.key ? HT.primary : HT.text2, border: "none",
          }}>{t.label}</button>
        ))}
      </div>

      <div style={{ background: HT.surface, border: `1px solid ${HT.border}`, borderRadius: HT.radiusLg, boxShadow: HT.shadow, overflow: "hidden" }}>
        <div style={{
          display: "grid", gridTemplateColumns: "100px 84px 1.3fr 100px 90px 80px 90px 90px 70px 160px 130px",
          padding: "10px 18px", borderBottom: `1px solid ${HT.border}`, background: HT.surfaceAlt,
        }}>
          {["Orden", "Plat.", "Producto", "SKU", "Ubicación", "Shopify#", "Factura", "Label", "Edad", "Estado", ""].map((h, i) => (
            <span key={i} style={{ fontFamily: HT.font, fontSize: 10.5, fontWeight: 700, color: HT.text3, textTransform: "uppercase", letterSpacing: "0.03em" }}>{h}</span>
          ))}
        </div>

        {list.length === 0 ? (
          <div style={{ padding: "44px 0", textAlign: "center", color: HT.text3, fontFamily: HT.font, fontSize: 14 }}>
            Nada pendiente aquí. 🎉
          </div>
        ) : list.map((o) => (
          <div key={o.id} style={{
            display: "grid", gridTemplateColumns: "100px 84px 1.3fr 100px 90px 80px 90px 90px 70px 160px 130px",
            alignItems: "center", padding: "12px 18px",
            borderBottom: `1px solid ${HT.border}`,
            background: o.status === "attention" ? HT.dangerSoft : "transparent",
          }}>
            <button onClick={() => openOrder(o.id)} style={{
              fontFamily: HT.mono, fontSize: 12.5, fontWeight: 700, color: HT.primary,
              background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: 0,
            }}>{o.id}</button>
            <div><PlatformBadge platform={o.platform} /></div>
            <div style={{ fontFamily: HT.font, fontSize: 13, color: HT.text1 }}>{o.product}</div>
            <div style={{ fontFamily: HT.mono, fontSize: 12, color: HT.text2 }}>{o.sku}</div>
            <div><LocationTag location={o.location} /></div>
            <div style={{ fontFamily: HT.mono, fontSize: 12.5, color: HT.text2 }}>{o.shopifyNumber ?? "—"}</div>
            <div><DocPill label="" state={o.invoiceStatus} /></div>
            <div><DocPill label="" state={o.labelStatus} /></div>
            <div><AgeChip createdAt={o.createdAt} /></div>
            <div><StatusBadge status={o.status} /></div>
            <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
              {o.status === "attention" ? (
                retrying === o.id ? (
                  <span style={{ fontFamily: HT.font, fontSize: 11.5, color: HT.text2 }}>{retryMsg}</span>
                ) : (
                  <button onClick={() => handleRetry(o)} style={{
                    fontFamily: HT.font, fontSize: 12, fontWeight: 700, cursor: "pointer",
                    background: HT.danger, color: "#fff", border: "none", borderRadius: 7, padding: "6px 12px",
                  }}>Reintentar</button>
                )
              ) : (
                <button onClick={() => setDocsOrder(o)} style={{
                  fontFamily: HT.font, fontSize: 12, fontWeight: 700, cursor: "pointer",
                  background: HT.primary, color: "#fff", border: "none", borderRadius: 7, padding: "6px 12px",
                  whiteSpace: "nowrap",
                }}>{o.location === "Colombia" ? "Cargar docs" : "Agregar Label"}</button>
              )}
            </div>
          </div>
        ))}
      </div>

      {docsOrder && <DocsModal order={docsOrder} onClose={() => setDocsOrder(null)} />}
    </>
  );
}

function StoreView({ location }: { location: HubLocation }) {
  const { orders, viewLabel, viewInvoice, completeOrder, openOrder } = useLogisticsHub();

  const list = useMemo(() => {
    return orders
      .filter((o) => o.status === "pending_store" && o.location === location)
      .sort((a, b) => hoursOld(b.createdAt) - hoursOld(a.createdAt));
  }, [orders, location]);

  const byLabel = `Usuario ${location}`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {list.length === 0 && (
        <div style={{
          background: HT.surface, border: `1px solid ${HT.border}`, borderRadius: HT.radiusLg,
          padding: "48px 0", textAlign: "center", color: HT.text3, fontFamily: HT.font, fontSize: 14,
        }}>No hay órdenes pendientes para {location}. 🎉</div>
      )}
      {list.map((o) => {
        const canComplete = !!o.labelViewedAt && !!o.invoiceViewedAt;
        const invoiceUrl = `https://odoo.internal/invoices/${o.id}.pdf`;
        return (
          <div key={o.id} style={{
            background: HT.surface, border: `1px solid ${HT.border}`, borderRadius: HT.radiusLg,
            boxShadow: HT.shadow, padding: "18px 22px", display: "flex", alignItems: "center", gap: 18,
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button onClick={() => openOrder(o.id)} style={{
                  fontFamily: HT.mono, fontSize: 15, fontWeight: 700, color: HT.text1,
                  background: "none", border: "none", cursor: "pointer", padding: 0,
                }}>{o.id}</button>
                <PlatformBadge platform={o.platform} />
                <AgeChip createdAt={o.createdAt} />
              </div>
              <div style={{ fontFamily: HT.font, fontSize: 14, color: HT.text1, marginTop: 6 }}>{o.product}</div>
              <div style={{ fontFamily: HT.font, fontSize: 12.5, color: HT.text2, marginTop: 2 }}>Cantidad: {o.qty}</div>
            </div>

            <a
              href={o.labelUrl} target="_blank" rel="noreferrer"
              onClick={() => viewLabel(o.id, byLabel)}
              style={{
                fontFamily: HT.font, fontSize: 13, fontWeight: 700, textDecoration: "none", textAlign: "center",
                color: o.labelViewedAt ? HT.success : HT.text1,
                background: o.labelViewedAt ? HT.successSoft : HT.surfaceAlt,
                border: "none", borderRadius: 8, padding: "9px 14px", whiteSpace: "nowrap",
              }}
            >{o.labelViewedAt ? "✓ Label visto" : "Ver Label"}</a>

            <a
              href={invoiceUrl} target="_blank" rel="noreferrer"
              onClick={() => viewInvoice(o.id, byLabel)}
              style={{
                fontFamily: HT.font, fontSize: 13, fontWeight: 700, textDecoration: "none", textAlign: "center",
                color: o.invoiceViewedAt ? HT.success : HT.text1,
                background: o.invoiceViewedAt ? HT.successSoft : HT.surfaceAlt,
                border: "none", borderRadius: 8, padding: "9px 14px", whiteSpace: "nowrap",
              }}
            >{o.invoiceViewedAt ? "✓ Factura vista" : "Ver Factura"}</a>

            <button
              disabled={!canComplete}
              onClick={() => completeOrder(o.id, byLabel)}
              title={!canComplete ? "Ver label y factura primero" : undefined}
              style={{
                fontFamily: HT.font, fontSize: 13, fontWeight: 700, cursor: canComplete ? "pointer" : "not-allowed",
                color: canComplete ? "#fff" : HT.text3,
                background: canComplete ? HT.success : HT.surfaceAlt,
                border: "none", borderRadius: 8, padding: "9px 16px", whiteSpace: "nowrap",
              }}
            >{canComplete ? "✓ Completar" : "Completar"}</button>
          </div>
        );
      })}
    </div>
  );
}

function StorePicker({ store, setStore }: { store: HubLocation; setStore: (l: HubLocation) => void }) {
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
      {ALL_STORES.map((s) => (
        <button key={s} onClick={() => setStore(s)} style={{
          fontFamily: HT.font, fontSize: 13, fontWeight: 600, cursor: "pointer",
          padding: "7px 14px", borderRadius: 8,
          background: store === s ? HT.primarySoft : "transparent",
          color: store === s ? HT.primary : HT.text2, border: "none",
        }}>{s}</button>
      ))}
    </div>
  );
}

export default function PendingPage() {
  const { role, setRole } = useLogisticsHub();
  const routeLocation = useLocation();
  const initialFilter = (routeLocation.state as { filter?: string } | null)?.filter;
  const [tab, setTab] = useState<LogisticsTab>(initialFilter === "attention" ? "attention" : "all");
  const [section, setSection] = useState<"logistics" | "store">("logistics");
  const [adminStore, setAdminStore] = useState<HubLocation>("Belier");

  useEffect(() => {
    if (initialFilter === "attention") setTab("attention");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isStoreRole = role === "Belier" || role === "Norte" || role === "Plaza";

  const subtitle = isStoreRole
    ? `Órdenes listas para preparar en ${role}.`
    : role === "logistics"
      ? section === "store" ? "Órdenes listas para preparar en Colombia." : "Órdenes asignadas que requieren preparación documental."
      : section === "store" ? `Órdenes listas para preparar en ${adminStore}.` : "Órdenes asignadas que requieren preparación documental.";

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", padding: "32px 24px 60px" }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontFamily: HT.font, fontSize: 26, fontWeight: 800, color: HT.text1, margin: 0, letterSpacing: "-0.01em" }}>
          Pendientes
        </h1>
        <p style={{ fontFamily: HT.font, fontSize: 14, color: HT.text2, margin: "4px 0 0" }}>
          {subtitle}
        </p>
      </div>

      <RoleSwitch role={role} setRole={setRole} />

      {isStoreRole ? (
        <StoreView location={role as HubLocation} />
      ) : role === "logistics" ? (
        <>
          <SectionToggle section={section} setSection={setSection} storeLabel="Tienda Colombia" />
          {section === "logistics" ? <LogisticsView tab={tab} setTab={setTab} /> : <StoreView location="Colombia" />}
        </>
      ) : (
        <>
          <SectionToggle section={section} setSection={setSection} storeLabel="Tiendas" />
          {section === "logistics" ? (
            <LogisticsView tab={tab} setTab={setTab} />
          ) : (
            <>
              <StorePicker store={adminStore} setStore={setAdminStore} />
              <StoreView location={adminStore} />
            </>
          )}
        </>
      )}
    </div>
  );
}
