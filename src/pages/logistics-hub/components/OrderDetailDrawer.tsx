import { HT, formatDate, formatAge } from "../theme";
import { useLogisticsHub } from "../context";
import { PlatformBadge, StatusBadge, DocPill } from "./badges";
import ActivityTimeline from "./ActivityTimeline";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{
        fontFamily: HT.font, fontSize: 11, fontWeight: 700, letterSpacing: "0.06em",
        textTransform: "uppercase", color: HT.text3, marginBottom: 10,
      }}>{title}</div>
      {children}
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${HT.border}` }}>
      <span style={{ fontFamily: HT.font, fontSize: 13, color: HT.text2 }}>{label}</span>
      <span style={{ fontFamily: HT.font, fontSize: 13, fontWeight: 600, color: HT.text1, textAlign: "right" }}>{value}</span>
    </div>
  );
}

export default function OrderDetailDrawer() {
  const { selectedOrderId, closeOrder, getOrder } = useLogisticsHub();
  const order = selectedOrderId ? getOrder(selectedOrderId) : undefined;

  if (!order) return null;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", justifyContent: "flex-end" }}>
      <div onClick={closeOrder} style={{ position: "absolute", inset: 0, background: "rgba(15,23,42,0.35)" }} />
      <div style={{
        position: "relative", width: 440, maxWidth: "92vw", height: "100%",
        background: HT.surface, boxShadow: HT.shadowLg, overflowY: "auto",
        padding: "24px 24px 40px", fontFamily: HT.font,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <div style={{ fontFamily: HT.mono, fontSize: 19, fontWeight: 700, color: HT.text1 }}>{order.id}</div>
            <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
              <PlatformBadge platform={order.platform} />
              <StatusBadge status={order.status} />
            </div>
          </div>
          <button onClick={closeOrder} style={{
            width: 30, height: 30, borderRadius: 8, border: "none", background: HT.surfaceAlt,
            color: HT.text2, cursor: "pointer", fontSize: 16, lineHeight: 1,
          }}>×</button>
        </div>

        {order.status === "attention" && order.attentionReason && (
          <div style={{
            background: HT.dangerSoft, border: `1px solid rgba(220,38,38,0.2)`, borderRadius: 10,
            padding: "12px 14px", marginBottom: 20,
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: HT.danger, marginBottom: 6 }}>Requiere atención</div>
            <div style={{ fontSize: 12.5, color: HT.text1, marginBottom: order.failedSteps ? 8 : 0 }}>{order.attentionReason}</div>
            {order.failedSteps?.map((s, i) => (
              <div key={i} style={{ fontFamily: HT.mono, fontSize: 11.5, color: HT.text2 }}>• {s}</div>
            ))}
          </div>
        )}

        <Section title="Información de la orden">
          <Field label="Order #" value={order.id} />
          <Field label="Plataforma" value={<PlatformBadge platform={order.platform} />} />
          <Field label="Shopify #" value={order.shopifyNumber ?? "—"} />
          <Field label="Cliente" value={order.customer ?? "—"} />
          <Field label="Fecha" value={formatDate(order.createdAt)} />
          <Field label="Antigüedad" value={formatAge(order.createdAt)} />
        </Section>

        <Section title="Producto">
          <Field label="Producto" value={order.product} />
          <Field label="SKU" value={<span style={{ fontFamily: HT.mono }}>{order.sku}</span>} />
          <Field label="Cantidad" value={order.qty} />
        </Section>

        <Section title="Despacho">
          <Field label="Ubicación asignada" value={order.location ?? "Sin asignar"} />
          <Field label="Asignado por" value={order.assignedBy ?? "—"} />
          <Field label="Fecha de asignación" value={order.assignedAt ? formatDate(order.assignedAt) : "—"} />
        </Section>

        <Section title="Documentos">
          <div style={{ display: "flex", gap: 24 }}>
            <DocPill label="Factura" state={order.invoiceStatus} />
            <DocPill label="Label" state={order.labelStatus} />
          </div>
        </Section>

        <Section title="Actividad">
          <ActivityTimeline entries={order.activity} />
        </Section>
      </div>
    </div>
  );
}
