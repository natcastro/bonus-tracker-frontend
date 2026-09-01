import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import type { LogisticsOrder } from "../types";
import {
  getLogisticsOrders, createLogisticsOrder, updateLogisticsOrder,
  markLogisticsOrderDone, markLogisticsOrderPending,
  deleteLogisticsOrder, uploadLogisticsLabel, getLogisticsLabelUrl,
} from "../services/api";

// ── Design tokens ─────────────────────────────────────────────────────────────

const T = {
  bg:        "#ffffff",
  surface:   "#ffffff",
  p1:        "#1d1d1f",
  p2:        "#6e6e73",
  p3:        "#aeaeb2",
  sep:       "rgba(0,0,0,0.08)",
  blue:      "#0071e3",
  blueSoft:  "#e8f1fb",
  green:     "#30d158",
  greenSoft: "#e6f9ed",
  orange:    "#ff9f0a",
  red:       "#ff3b30",
  redSoft:   "rgba(255,59,48,0.06)",
  redDark:   "#c0392b",
  shadow:    "0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04)",
  shadowMd:  "0 2px 8px rgba(0,0,0,0.08), 0 8px 24px rgba(0,0,0,0.06)",
  font:      `-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", Arial, sans-serif`,
  mono:      `"SF Mono", "Menlo", "Monaco", Consolas, monospace`,
};

// ── Store config ──────────────────────────────────────────────────────────────

const STORE_HUE = ["#0071e3","#30d158","#ff9f0a","#8e44ad","#e8415a","#00b5d8","#e74c3c","#1abc9c","#e67e22","#f39c12","#2980b9","#27ae60"];

interface StoreConfig { id: number; name: string; }

function storeColor(id: number, stores: StoreConfig[]): string {
  const idx = stores.findIndex(s => s.id === id);
  return STORE_HUE[(idx >= 0 ? idx : id - 1) % STORE_HUE.length];
}

function loadStores(): StoreConfig[] {
  try {
    const s = localStorage.getItem("logistics_stores");
    if (s) {
      const arr = JSON.parse(s);
      if (Array.isArray(arr) && arr.every((x: unknown) => x && typeof (x as StoreConfig).id === "number" && typeof (x as StoreConfig).name === "string")) return arr;
    }
    // Migrate old string[] format
    const old = localStorage.getItem("logistics_store_names");
    if (old) {
      const arr: string[] = JSON.parse(old);
      if (Array.isArray(arr)) return arr.map((name, i) => ({ id: i + 1, name }));
    }
  } catch { /* ignore */ }
  return [{ id: 1, name: "Tienda 1" }];
}

function saveStoresLocal(stores: StoreConfig[]) {
  localStorage.setItem("logistics_stores", JSON.stringify(stores));
  localStorage.removeItem("logistics_store_names");
}

function nextStoreId(stores: StoreConfig[]): number {
  return stores.length === 0 ? 1 : Math.max(...stores.map(s => s.id)) + 1;
}

// ── Platform config ───────────────────────────────────────────────────────────

type Platform = LogisticsOrder["platform"];
const PLATFORMS: { key: Platform; label: string; color: string }[] = [
  { key: "tiktok",  label: "TikTok",  color: "#000000" },
  { key: "amazon",  label: "Amazon",  color: "#e47911" },
  { key: "shopify", label: "Shopify", color: "#5a8a3c" },
  { key: "other",   label: "Otro",    color: "#8e8e93" },
];
const platformMap = Object.fromEntries(PLATFORMS.map(p => [p.key, p]));

// ── Urgency ───────────────────────────────────────────────────────────────────

type Urgency = "ok" | "warn" | "urgent" | "critical";

function getUrgency(order: LogisticsOrder): Urgency {
  if (order.status === "done") return "ok";
  const ref = order.shipDate
    ? new Date(order.shipDate + "T00:00:00")
    : new Date(order.createdAt);
  const days = Math.floor((Date.now() - ref.getTime()) / 86_400_000);
  if (days < 1) return "ok";
  if (days < 2) return "warn";
  if (days < 3) return "urgent";
  return "critical";
}

type UrgencyInfo = { stripe: string; cardBg: string; dot: string; label: string | null; stripeW: number };
const URGENCY: Record<Urgency, UrgencyInfo> = {
  ok:       { stripe: T.sep,     cardBg: T.surface,    dot: T.green,   label: null,      stripeW: 4 },
  warn:     { stripe: T.orange,  cardBg: T.surface,    dot: T.orange,  label: "1 día",   stripeW: 4 },
  urgent:   { stripe: T.red,     cardBg: T.surface,    dot: T.red,     label: "2 días",  stripeW: 4 },
  critical: { stripe: T.redDark, cardBg: T.redSoft,    dot: T.redDark, label: "+3 días", stripeW: 6 },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function sortKey(o: LogisticsOrder): number {
  return o.shipDate
    ? new Date(o.shipDate + "T00:00:00").getTime()
    : new Date(o.createdAt).getTime();
}

function matches(o: LogisticsOrder, q: string): boolean {
  if (!q.trim()) return true;
  const lq = q.toLowerCase();
  return o.article.toLowerCase().includes(lq) ||
    o.orderNumber.toLowerCase().includes(lq) ||
    (o.trackingNumber ?? "").toLowerCase().includes(lq);
}

function inDateRange(o: LogisticsOrder, from: string, to: string): boolean {
  const ref = o.shipDate ?? o.createdAt.slice(0, 10);
  if (from && ref < from) return false;
  if (to   && ref > to)   return false;
  return true;
}

function fmtDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
}

// ── Small components ──────────────────────────────────────────────────────────

function FilterLabel({ text }: { text: string }) {
  return (
    <div style={{
      fontFamily: T.font, fontSize: 10, fontWeight: 600, letterSpacing: "0.08em",
      textTransform: "uppercase", color: T.p3, marginBottom: 6,
    }}>{text}</div>
  );
}

function NeutralChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} style={{
      fontFamily: T.font, fontSize: 12, fontWeight: active ? 600 : 400, cursor: "pointer",
      padding: "4px 10px", borderRadius: 980,
      border: `1px solid ${active ? "rgba(0,0,0,0.2)" : T.sep}`,
      background: active ? "rgba(0,0,0,0.07)" : "transparent",
      color: active ? T.p1 : T.p2, whiteSpace: "nowrap",
    }}>{children}</button>
  );
}

function ColoredChip({ active, color, onClick, children }: {
  active: boolean; color: string; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} style={{
      fontFamily: T.font, fontSize: 12, fontWeight: active ? 600 : 400, cursor: "pointer",
      padding: "4px 10px", borderRadius: 980,
      border: `1px solid ${active ? color : T.sep}`,
      background: active ? color : "transparent",
      color: active ? "#fff" : T.p2, whiteSpace: "nowrap",
      maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis",
    }}>{children}</button>
  );
}

function SearchBar({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ position: "relative" }}>
      <svg style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", opacity: 0.35, pointerEvents: "none" }}
        width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.p1} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <input value={value} onChange={e => onChange(e.target.value)}
        placeholder="Buscar artículo, orden, tracking…"
        style={{
          fontFamily: T.font, fontSize: 13, width: "100%", boxSizing: "border-box",
          padding: "8px 30px 8px 32px", borderRadius: 10,
          border: `1px solid ${T.sep}`, background: T.surface,
          color: T.p1, outline: "none",
        }} />
      {value && (
        <button onClick={() => onChange("")} style={{
          position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)",
          background: T.p3, border: "none", borderRadius: 50, width: 16, height: 16,
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer", padding: 0, color: "#fff", fontSize: 10,
        }}>✕</button>
      )}
    </div>
  );
}

// ── Settings Modal ────────────────────────────────────────────────────────────

function SettingsModal({ stores, onSave, onClose }: {
  stores: StoreConfig[]; onSave: (s: StoreConfig[]) => void; onClose: () => void;
}) {
  const [draft, setDraft] = useState<StoreConfig[]>(stores.map(s => ({ ...s })));

  const updateName = (id: number, name: string) =>
    setDraft(d => d.map(s => s.id === id ? { ...s, name } : s));

  const addStore = () =>
    setDraft(d => [...d, { id: nextStoreId(d), name: "" }]);

  const removeStore = (id: number) =>
    setDraft(d => d.filter(s => s.id !== id));

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 200,
      display: "flex", alignItems: "center", justifyContent: "center",
      backdropFilter: "blur(4px)",
    }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: T.surface, borderRadius: 20, padding: "28px 28px 24px",
        width: 420, boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
        maxHeight: "80vh", overflowY: "auto",
      }}>
        <div style={{ fontFamily: T.font, fontSize: 17, fontWeight: 600, color: T.p1, marginBottom: 4 }}>
          Tiendas
        </div>
        <div style={{ fontFamily: T.font, fontSize: 13, color: T.p2, marginBottom: 20 }}>
          Agrega, renombra o elimina tiendas. Los cambios solo afectan los nombres.
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
          {draft.map((s, i) => {
            const color = STORE_HUE[i % STORE_HUE.length];
            return (
              <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 8, background: color,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontFamily: T.font, fontSize: 11, fontWeight: 700, color: "#fff", flexShrink: 0,
                }}>{i + 1}</div>
                <input
                  value={s.name}
                  onChange={e => updateName(s.id, e.target.value)}
                  placeholder={`Tienda ${i + 1}`}
                  style={{
                    fontFamily: T.font, fontSize: 13, flex: 1,
                    padding: "8px 12px", borderRadius: 9,
                    border: `1.5px solid ${T.sep}`, borderLeft: `3px solid ${color}`,
                    color: T.p1, outline: "none", boxSizing: "border-box",
                  }}
                />
                <button onClick={() => removeStore(s.id)} title="Eliminar" style={{
                  background: "none", border: "none", cursor: "pointer",
                  color: T.p3, padding: "4px", flexShrink: 0,
                  display: "flex", alignItems: "center",
                }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                  </svg>
                </button>
              </div>
            );
          })}
        </div>

        <button onClick={addStore} style={{
          fontFamily: T.font, fontSize: 13, fontWeight: 600, cursor: "pointer",
          width: "100%", padding: "9px", borderRadius: 10, marginBottom: 20,
          border: `1.5px dashed ${T.sep}`, background: "transparent", color: T.blue,
        }}>+ Agregar tienda</button>

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={onClose} style={{
            fontFamily: T.font, fontSize: 14, fontWeight: 500, cursor: "pointer", flex: 1,
            padding: "10px", borderRadius: 12, border: `1px solid ${T.sep}`, background: T.bg, color: T.p2,
          }}>Cancelar</button>
          <button onClick={() => onSave(draft.filter(s => s.name.trim()))} style={{
            fontFamily: T.font, fontSize: 14, fontWeight: 600, cursor: "pointer", flex: 2,
            padding: "10px", borderRadius: 12, border: "none", background: T.blue, color: "#fff",
          }}>Guardar</button>
        </div>
      </div>
    </div>
  );
}

// ── Form state ────────────────────────────────────────────────────────────────

type FormState = {
  storeId: number; platform: Platform; article: string; orderNumber: string;
  trackingNumber: string; shipDate: string; labelType: "url" | "file";
  labelUrl: string; labelFile: File | null; notes: string;
};
const EMPTY: FormState = {
  storeId: 1, platform: "other", article: "", orderNumber: "",
  trackingNumber: "", shipDate: "", labelType: "url", labelUrl: "", labelFile: null, notes: "",
};

// ── ShipForm ──────────────────────────────────────────────────────────────────

function ShipForm({ initial, title, stores, onSave, onCancel, saving, err }: {
  initial: FormState; title: string; stores: StoreConfig[];
  onSave: (f: FormState) => void; onCancel: () => void;
  saving: boolean; err: string;
}) {
  const [f, setF] = useState<FormState>(initial);
  const inp = (extra?: React.CSSProperties): React.CSSProperties => ({
    fontFamily: T.font, fontSize: 14, width: "100%", boxSizing: "border-box",
    padding: "9px 12px", borderRadius: 10, border: `1px solid ${T.sep}`,
    color: T.p1, outline: "none", background: T.surface, ...extra,
  });

  return (
    <div style={{
      background: T.surface, borderRadius: 18, padding: "20px 20px 16px",
      boxShadow: T.shadowMd, marginBottom: 14, border: `1px solid ${T.sep}`,
    }}>
      <div style={{ fontFamily: T.font, fontSize: 15, fontWeight: 600, color: T.p1, marginBottom: 18 }}>{title}</div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div>
          <div style={{ fontFamily: T.font, fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: T.p2, marginBottom: 7 }}>Tienda</div>
          <select value={f.storeId} onChange={e => setF(p => ({ ...p, storeId: Number(e.target.value) }))} required style={{
            ...inp(), paddingLeft: 10, cursor: "pointer", appearance: "none",
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%236e6e73' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`,
            backgroundRepeat: "no-repeat", backgroundPosition: "calc(100% - 10px) center", paddingRight: 28,
            borderLeft: `4px solid ${storeColor(f.storeId, stores)}`,
          }}>
            {stores.map((s, i) => (
              <option key={s.id} value={s.id}>{s.name || `Tienda ${i + 1}`}</option>
            ))}
          </select>
        </div>
        <div>
          <div style={{ fontFamily: T.font, fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: T.p2, marginBottom: 7 }}>Plataforma</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {PLATFORMS.map(p => (
              <button key={p.key} type="button" onClick={() => setF(prev => ({ ...prev, platform: p.key }))} style={{
                fontFamily: T.font, fontSize: 12, fontWeight: 500, cursor: "pointer",
                padding: "5px 10px", borderRadius: 980, whiteSpace: "nowrap",
                border: `1.5px solid ${f.platform === p.key ? p.color : T.sep}`,
                background: f.platform === p.key ? p.color : T.surface,
                color: f.platform === p.key ? "#fff" : T.p2,
              }}>{p.label}</button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div>
          <div style={{ fontFamily: T.font, fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: T.p2, marginBottom: 7 }}>Artículo *</div>
          <input value={f.article} onChange={e => setF(p => ({ ...p, article: e.target.value }))} placeholder="Nombre del artículo" required style={inp()} />
        </div>
        <div>
          <div style={{ fontFamily: T.font, fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: T.p2, marginBottom: 7 }}>No. Orden *</div>
          <input value={f.orderNumber} onChange={e => setF(p => ({ ...p, orderNumber: e.target.value }))} placeholder="ORD-12345" required style={inp()} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div>
          <div style={{ fontFamily: T.font, fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: T.p2, marginBottom: 7 }}>Tracking Number</div>
          <input value={f.trackingNumber} onChange={e => setF(p => ({ ...p, trackingNumber: e.target.value }))} placeholder="Opcional" style={inp({ fontFamily: T.mono, fontSize: 13 })} />
        </div>
        <div>
          <div style={{ fontFamily: T.font, fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: T.p2, marginBottom: 7 }}>Fecha de Envío *</div>
          <input type="date" value={f.shipDate} onChange={e => setF(p => ({ ...p, shipDate: e.target.value }))} required style={inp()} />
        </div>
      </div>

      <div style={{ marginBottom: 12 }}>
        <div style={{ fontFamily: T.font, fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: T.p2, marginBottom: 7 }}>Label de Envío</div>
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          {(["url","file"] as const).map((t, i) => (
            <button key={t} type="button" onClick={() => setF(p => ({ ...p, labelType: t }))} style={{
              fontFamily: T.font, fontSize: 12, fontWeight: 500, cursor: "pointer",
              padding: "4px 11px", borderRadius: 980,
              border: `1.5px solid ${f.labelType === t ? T.blue : T.sep}`,
              background: f.labelType === t ? T.blue : T.surface,
              color: f.labelType === t ? "#fff" : T.p2,
            }}>{i === 0 ? "Link URL" : "Documento"}</button>
          ))}
        </div>
        {f.labelType === "url"
          ? <input type="url" value={f.labelUrl} onChange={e => setF(p => ({ ...p, labelUrl: e.target.value }))} placeholder="https://…" style={inp()} />
          : <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={e => setF(p => ({ ...p, labelFile: e.target.files?.[0] ?? null }))} style={{ fontFamily: T.font, fontSize: 13 }} />
        }
      </div>

      <div style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: T.font, fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: T.p2, marginBottom: 7 }}>Notas</div>
        <input value={f.notes} onChange={e => setF(p => ({ ...p, notes: e.target.value }))} placeholder="Instrucciones adicionales…" style={inp()} />
      </div>

      {err && <div style={{ fontFamily: T.font, fontSize: 13, color: T.red, marginBottom: 10 }}>{err}</div>}

      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" onClick={onCancel} style={{
          fontFamily: T.font, fontSize: 14, fontWeight: 500, cursor: "pointer", flex: 1,
          padding: "10px", borderRadius: 12, border: `1px solid ${T.sep}`, background: T.bg, color: T.p2,
        }}>Cancelar</button>
        <button onClick={() => onSave(f)} type="button" disabled={saving} style={{
          fontFamily: T.font, fontSize: 14, fontWeight: 600, cursor: saving ? "wait" : "pointer", flex: 2,
          padding: "10px", borderRadius: 12, border: "none", background: T.blue, color: "#fff",
          opacity: saving ? 0.6 : 1,
        }}>{saving ? "Guardando…" : "Guardar"}</button>
      </div>
    </div>
  );
}

// ── OrderCard ─────────────────────────────────────────────────────────────────

function OrderCard({ order, storeName, stores, labelViewed, onLabelView, onDone, onUndo, onDelete, onEdit }: {
  order: LogisticsOrder; storeName: string; stores: StoreConfig[];
  labelViewed: boolean; onLabelView: () => void;
  onDone?: () => void; onUndo?: () => void;
  onDelete: () => void; onEdit: () => void;
}) {
  const isDone   = order.status === "done";
  const urg      = getUrgency(order);
  const u        = isDone ? { stripe: T.green, cardBg: T.surface, dot: T.green, label: null, stripeW: 4 } : URGENCY[urg];
  const plat     = platformMap[order.platform];
  const sc       = storeColor(order.storeId, stores);

  return (
    <div style={{
      background: u.cardBg, borderRadius: 14, overflow: "hidden",
      boxShadow: urg === "critical" ? `0 2px 10px rgba(192,57,43,0.15), 0 6px 24px rgba(192,57,43,0.10)` : T.shadow,
      marginBottom: 10, display: "flex",
      outline: urg === "critical" ? `1px solid rgba(192,57,43,0.2)` : "none",
    }}>
      <div style={{ width: u.stripeW, background: u.stripe, flexShrink: 0 }} />

      <div style={{ flex: 1, padding: "14px 14px 12px" }}>
        {/* Badges row */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
          <span style={{
            fontFamily: T.font, fontSize: 11, fontWeight: 700,
            background: sc, color: "#fff",
            borderRadius: 980, padding: "2px 9px",
          }}>{storeName}</span>

          <span style={{
            fontFamily: T.font, fontSize: 11, fontWeight: 600,
            border: `1.5px solid ${plat.color}`, color: plat.color,
            borderRadius: 980, padding: "1px 8px",
          }}>{plat.label}</span>

          {u.label && !isDone && (
            <span style={{
              fontFamily: T.font, fontSize: 11, fontWeight: 700,
              background: u.dot, color: "#fff",
              borderRadius: 980, padding: "2px 9px",
              ...(urg === "critical" ? { animation: "none", letterSpacing: "0.02em" } : {}),
            }}>⚠ {u.label}</span>
          )}
          {isDone && (
            <span style={{
              fontFamily: T.font, fontSize: 11, fontWeight: 600,
              background: T.greenSoft, color: "#1a7a3a",
              borderRadius: 980, padding: "2px 8px",
            }}>Completado</span>
          )}

          {order.shipDate && (
            <span style={{ marginLeft: "auto", fontFamily: T.font, fontSize: 12, color: T.p2 }}>
              📅 {fmtDate(order.shipDate)}
            </span>
          )}
        </div>

        <div style={{ fontFamily: T.font, fontSize: 15, fontWeight: 600, color: T.p1, marginBottom: 4 }}>
          {order.article}
        </div>

        <div style={{ display: "flex", gap: 16, marginBottom: order.notes ? 6 : 10, flexWrap: "wrap" }}>
          <span style={{ fontFamily: T.font, fontSize: 12, color: T.p2 }}>
            Orden <span style={{ fontFamily: T.mono, fontWeight: 600, color: T.p1 }}>{order.orderNumber}</span>
          </span>
          {order.trackingNumber && (
            <span style={{ fontFamily: T.font, fontSize: 12, color: T.p2 }}>
              Tracking <span style={{ fontFamily: T.mono, fontWeight: 600, color: T.blue }}>{order.trackingNumber}</span>
            </span>
          )}
        </div>

        {order.notes && (
          <div style={{ fontFamily: T.font, fontSize: 12, color: T.p2, fontStyle: "italic", marginBottom: 10 }}>
            {order.notes}
          </div>
        )}

        <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>
          {order.labelUrl && (
            <button onClick={async () => {
              try {
                window.open(await getLogisticsLabelUrl(order.labelUrl!), "_blank", "noopener,noreferrer");
                onLabelView();
              } catch { alert("No se pudo abrir el label."); }
            }} style={{
              fontFamily: T.font, fontSize: 12, fontWeight: 600, cursor: "pointer",
              background: labelViewed ? T.greenSoft : T.blueSoft,
              color: labelViewed ? "#1a7a3a" : T.blue,
              borderRadius: 8, padding: "5px 11px", border: "none",
            }}>{labelViewed ? "✓ Label visto" : "Ver Label"}</button>
          )}
          {!isDone && onDone && (() => {
            const needsLabel = !!order.labelUrl && !labelViewed;
            return (
              <button onClick={needsLabel ? undefined : onDone} disabled={needsLabel} style={{
                fontFamily: T.font, fontSize: 12, fontWeight: 600,
                cursor: needsLabel ? "not-allowed" : "pointer",
                background: needsLabel ? T.bg : T.green,
                color: needsLabel ? T.p3 : "#fff",
                border: needsLabel ? `1px solid ${T.sep}` : "none",
                borderRadius: 8, padding: "5px 13px",
                title: needsLabel ? "Ver el label primero" : undefined,
              } as React.CSSProperties}>
                {needsLabel ? "Ver label primero" : "Completado"}
              </button>
            );
          })()}
          {isDone && onUndo && (
            <button onClick={onUndo} style={{
              fontFamily: T.font, fontSize: 12, fontWeight: 500, cursor: "pointer",
              background: T.bg, color: T.p2, border: `1px solid ${T.sep}`, borderRadius: 8, padding: "5px 11px",
            }}>Reabrir</button>
          )}
          <button onClick={onEdit} style={{
            fontFamily: T.font, fontSize: 12, fontWeight: 500, cursor: "pointer",
            background: T.bg, color: T.p2, border: `1px solid ${T.sep}`, borderRadius: 8, padding: "5px 11px",
          }}>Editar</button>
          <button onClick={onDelete} style={{
            fontFamily: T.font, fontSize: 12, cursor: "pointer", marginLeft: "auto",
            background: "none", color: T.p3, border: "none", padding: "4px 6px",
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// ── KPI Banner ────────────────────────────────────────────────────────────────

function hoursOld(o: LogisticsOrder): number {
  const ref = o.shipDate ? new Date(o.shipDate + "T00:00:00") : new Date(o.createdAt);
  return (Date.now() - ref.getTime()) / 3_600_000;
}

type KpiKey = "all_pending" | "within24h" | "over24h" | "ontime";

function KPIBanner({ orders, loading, activeKpi, onFilter }: {
  orders: LogisticsOrder[]; loading: boolean;
  activeKpi: KpiKey | null; onFilter: (k: KpiKey) => void;
}) {
  const pending    = orders.filter(o => o.status === "pending");
  const within24h  = pending.filter(o => hoursOld(o) < 24).length;
  const over24h    = pending.filter(o => hoursOld(o) >= 24).length;
  const done       = orders.filter(o => o.status === "done" && o.doneAt);
  const onTime     = done.filter(o => {
    const ref = o.shipDate ? new Date(o.shipDate + "T00:00:00") : new Date(o.createdAt);
    return (new Date(o.doneAt!).getTime() - ref.getTime()) / 3_600_000 <= 24;
  }).length;

  const tiles: { key: KpiKey; label: string; value: number; sub: string; color: string }[] = [
    { key: "all_pending", label: "Pendientes",           value: pending.length, sub: "órdenes activas",            color: "#b45309" },
    { key: "within24h",  label: "Enviar < 24 h",        value: within24h,      sub: "aún en tiempo",              color: "#0891b2" },
    { key: "over24h",    label: "Llevan > 24 h",        value: over24h,        sub: "requieren atención",         color: T.red     },
    { key: "ontime",     label: "Completadas a tiempo",  value: onTime,         sub: "dentro de las primeras 24 h", color: T.green  },
  ];

  return (
    <div style={{ maxWidth: 1260, margin: "0 auto", padding: "16px 20px 0" }}>
      <div style={{
        background: T.surface, borderRadius: 14, overflow: "hidden",
        boxShadow: T.shadow, display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
        border: `1px solid ${T.sep}`,
      }}>
        {tiles.map((t, i) => {
          const isActive = activeKpi === t.key;
          return (
            <button key={t.key} onClick={() => onFilter(t.key)} style={{
              padding: "16px 20px", textAlign: "left", cursor: "pointer",
              borderRight: i < 3 ? `1px solid ${T.sep}` : "none",
              background: isActive ? t.color + "0d" : T.surface,
              border: "none", outline: isActive ? `2px solid ${t.color}` : "none",
              outlineOffset: -2, transition: "background 0.12s",
            }}>
              <div style={{
                fontFamily: T.font, fontSize: "1.6rem", fontWeight: 800,
                color: loading ? T.p3 : t.color, lineHeight: 1,
                fontVariantNumeric: "tabular-nums",
              }}>{loading ? "—" : t.value}</div>
              <div style={{ fontFamily: T.font, fontSize: 13, fontWeight: 600, color: T.p1, marginTop: 5 }}>{t.label}</div>
              <div style={{ fontFamily: T.font, fontSize: 11, color: T.p3, marginTop: 2 }}>{t.sub}</div>
              <div style={{ marginTop: 8, height: 3, borderRadius: 2, background: t.color, opacity: isActive ? 0.6 : 0.2 }} />
            </button>
          );
        })}
      </div>
      {activeKpi && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
          <span style={{ fontFamily: T.font, fontSize: 12, color: T.p2 }}>
            Mostrando: <strong>{tiles.find(t => t.key === activeKpi)?.label}</strong>
          </span>
          <button onClick={() => onFilter(activeKpi)} style={{
            fontFamily: T.font, fontSize: 12, fontWeight: 500, cursor: "pointer",
            background: "none", border: "none", color: T.blue, padding: 0,
          }}>× Limpiar filtro KPI</button>
        </div>
      )}
    </div>
  );
}

// ── Empty ─────────────────────────────────────────────────────────────────────

function Empty({ text }: { text: string }) {
  return (
    <div style={{
      textAlign: "center", color: T.p3, padding: "40px 20px",
      background: T.surface, borderRadius: 14, boxShadow: T.shadow,
      fontFamily: T.font, fontSize: 13,
    }}>{text}</div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function LogisticsDashboard() {
  const navigate = useNavigate();
  const [orders, setOrders]   = useState<LogisticsOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView]       = useState<"both" | "pending" | "done">("both");

  const [stores, setStores]             = useState<StoreConfig[]>(loadStores);
  const [showSettings, setShowSettings] = useState(false);
  const [kpiFilter, setKpiFilter]       = useState<KpiKey | null>(null);
  const [labelViewed, setLabelViewed]   = useState<Set<number>>(new Set());
  const [pendingFiltersOpen, setPendingFiltersOpen] = useState(false);
  const [doneFiltersOpen, setDoneFiltersOpen]       = useState(false);

  const [pendingSearch, setPendingSearch]     = useState("");
  const [doneSearch, setDoneSearch]           = useState("");
  const [pendingSortAsc, setPendingSortAsc]   = useState(true);
  const [doneSortAsc, setDoneSortAsc]         = useState(true);
  const [pendingPlatform, setPendingPlatform] = useState<Platform | null>(null);
  const [donePlatform, setDonePlatform]       = useState<Platform | null>(null);
  const [pendingStore, setPendingStore]       = useState<number | null>(null);
  const [doneStore, setDoneStore]             = useState<number | null>(null);
  const [pendingFrom, setPendingFrom]         = useState("");
  const [pendingTo, setPendingTo]             = useState("");
  const [doneFrom, setDoneFrom]               = useState("");
  const [doneTo, setDoneTo]                   = useState("");

  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<LogisticsOrder | null>(null);
  const [saving, setSaving]   = useState(false);
  const [formErr, setFormErr] = useState("");

  const load = async () => {
    setLoading(true);
    try { setOrders(await getLogisticsOrders()); } catch { setOrders([]); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const logout = () => { sessionStorage.removeItem("team"); navigate("/"); };

  const handleKpiFilter = (k: KpiKey) => {
    if (kpiFilter === k) { setKpiFilter(null); return; }
    setKpiFilter(k);
    if (k === "ontime") setView("done");
    else setView("pending");
    setShowAdd(false); setEditing(null);
  };

  const markLabelViewed = (id: number) =>
    setLabelViewed(prev => new Set(prev).add(id));

  const handleSaveStores = (updated: StoreConfig[]) => {
    setStores(updated);
    saveStoresLocal(updated);
    setShowSettings(false);
  };

  const pendingOrders = useMemo(() => {
    let list = orders.filter(o => o.status === "pending");
    if (kpiFilter === "within24h") list = list.filter(o => hoursOld(o) < 24);
    if (kpiFilter === "over24h")   list = list.filter(o => hoursOld(o) >= 24);
    if (pendingStore)    list = list.filter(o => o.storeId === pendingStore);
    if (pendingPlatform) list = list.filter(o => o.platform === pendingPlatform);
    list = list.filter(o => matches(o, pendingSearch) && inDateRange(o, pendingFrom, pendingTo));
    list.sort((a, b) => pendingSortAsc ? sortKey(a) - sortKey(b) : sortKey(b) - sortKey(a));
    return list;
  }, [orders, kpiFilter, pendingStore, pendingPlatform, pendingSearch, pendingSortAsc, pendingFrom, pendingTo]);

  const doneOrders = useMemo(() => {
    let list = orders.filter(o => o.status === "done");
    if (kpiFilter === "ontime") list = list.filter(o => {
      if (!o.doneAt) return false;
      const ref = o.shipDate ? new Date(o.shipDate + "T00:00:00") : new Date(o.createdAt);
      return (new Date(o.doneAt).getTime() - ref.getTime()) / 3_600_000 <= 24;
    });
    if (doneStore)    list = list.filter(o => o.storeId === doneStore);
    if (donePlatform) list = list.filter(o => o.platform === donePlatform);
    list = list.filter(o => matches(o, doneSearch) && inDateRange(o, doneFrom, doneTo));
    list.sort((a, b) => {
      const ka = new Date(a.doneAt ?? a.createdAt).getTime();
      const kb = new Date(b.doneAt ?? b.createdAt).getTime();
      return doneSortAsc ? ka - kb : kb - ka;
    });
    return list;
  }, [orders, kpiFilter, doneStore, donePlatform, doneSearch, doneSortAsc, doneFrom, doneTo]);

  const save = async (f: FormState, isEdit: boolean) => {
    setSaving(true); setFormErr("");
    try {
      let labelUrl: string | undefined = isEdit ? editing?.labelUrl : undefined;
      if (f.labelType === "url")  labelUrl = f.labelUrl.trim() || undefined;
      else if (f.labelFile)       labelUrl = await uploadLogisticsLabel(f.labelFile);
      const payload = {
        storeId: f.storeId, platform: f.platform, article: f.article.trim(),
        orderNumber: f.orderNumber.trim(), trackingNumber: f.trackingNumber.trim() || undefined,
        labelUrl, shipDate: f.shipDate || undefined, notes: f.notes.trim(), status: "pending" as const,
      };
      if (isEdit && editing) {
        await updateLogisticsOrder(editing.id, payload);
        setEditing(null);
      } else {
        await createLogisticsOrder(payload);
        setShowAdd(false);
      }
      await load();
    } catch (err) { setFormErr(String(err)); }
    finally { setSaving(false); }
  };

  const openEdit = (o: LogisticsOrder) => { setShowAdd(false); setFormErr(""); setEditing(o); };
  const markDone    = async (id: number) => { await markLogisticsOrderDone(id);    load(); };
  const markPending = async (id: number) => { await markLogisticsOrderPending(id); load(); };
  const remove      = async (id: number) => {
    if (!confirm("¿Eliminar este envío?")) return;
    await deleteLogisticsOrder(id); load();
  };

  const editInitial: FormState | undefined = editing ? {
    storeId: editing.storeId, platform: editing.platform, article: editing.article,
    orderNumber: editing.orderNumber, trackingNumber: editing.trackingNumber ?? "",
    shipDate: editing.shipDate ?? "", labelType: "url",
    labelUrl: editing.labelUrl ?? "", labelFile: null, notes: editing.notes ?? "",
  } : undefined;

  const renderColumn = (side: "pending" | "done") => {
    const isPending   = side === "pending";
    const colOrders   = isPending ? pendingOrders : doneOrders;
    const search      = isPending ? pendingSearch : doneSearch;
    const setSearch   = isPending ? setPendingSearch : setDoneSearch;
    const sortAsc     = isPending ? pendingSortAsc : doneSortAsc;
    const toggleSort  = isPending ? () => setPendingSortAsc(v => !v) : () => setDoneSortAsc(v => !v);
    const platform    = isPending ? pendingPlatform : donePlatform;
    const setPlatform = isPending ? setPendingPlatform : setDonePlatform;
    const store       = isPending ? pendingStore : doneStore;
    const setStore    = isPending ? setPendingStore : setDoneStore;
    const dateFrom    = isPending ? pendingFrom : doneFrom;
    const dateTo      = isPending ? pendingTo   : doneTo;
    const setFrom     = isPending ? setPendingFrom : setDoneFrom;
    const setTo       = isPending ? setPendingTo   : setDoneTo;
    const totalCount  = orders.filter(o => o.status === (isPending ? "pending" : "done")).length;
    const hasFilters    = !!(search || store !== null || platform !== null || dateFrom || dateTo);
    const clearAll      = () => { setSearch(""); setStore(null); setPlatform(null); setFrom(""); setTo(""); };
    const filtersOpen   = isPending ? pendingFiltersOpen : doneFiltersOpen;
    const setFiltersOpen = isPending ? setPendingFiltersOpen : setDoneFiltersOpen;
    const activeFilterCount = [search, store !== null, platform !== null, dateFrom || dateTo].filter(Boolean).length;

    return (
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Section header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontFamily: T.font, fontSize: 17, fontWeight: 600, color: T.p1 }}>
              {isPending ? "Pendiente" : "Completado"}
            </span>
            <span style={{
              fontFamily: T.font, fontSize: 12, fontWeight: 600,
              background: isPending ? "#fee4e2" : T.greenSoft,
              color: isPending ? T.red : "#1a7a3a",
              borderRadius: 980, padding: "2px 8px", minWidth: 22, textAlign: "center",
            }}>{totalCount}</span>
          </div>
          {isPending && (
            <button onClick={() => { setShowAdd(!showAdd); setEditing(null); setFormErr(""); }} style={{
              fontFamily: T.font, fontSize: 13, fontWeight: 600, cursor: "pointer",
              background: showAdd ? T.bg : T.blue, color: showAdd ? T.p2 : "#fff",
              border: showAdd ? `1px solid ${T.sep}` : "none",
              borderRadius: 980, padding: "6px 16px",
            }}>{showAdd ? "Cancelar" : "+ Agregar"}</button>
          )}
        </div>

        {/* Search + Sort */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
          <div style={{ flex: 1 }}><SearchBar value={search} onChange={setSearch} /></div>
          <button onClick={toggleSort} style={{
            fontFamily: T.font, fontSize: 12, fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap",
            background: T.surface, color: T.p2, border: `1px solid ${T.sep}`, borderRadius: 8, padding: "7px 12px",
          }}>{sortAsc ? "↑ Antiguo" : "↓ Reciente"}</button>
        </div>

        {/* Filter toggle button */}
        <button onClick={() => setFiltersOpen(!filtersOpen)} style={{
          fontFamily: T.font, fontSize: 12, fontWeight: 600, cursor: "pointer",
          display: "flex", alignItems: "center", gap: 6, marginBottom: filtersOpen ? 8 : 14,
          background: filtersOpen ? T.blueSoft : "rgba(0,0,0,0.04)",
          color: filtersOpen ? T.blue : T.p2,
          border: `1px solid ${filtersOpen ? "rgba(0,113,227,0.25)" : T.sep}`,
          borderRadius: 980, padding: "5px 14px",
        }}>
          <span style={{ fontSize: 10 }}>{filtersOpen ? "▲" : "▼"}</span>
          Filtrar
          {activeFilterCount > 0 && (
            <span style={{
              background: T.blue, color: "#fff", borderRadius: 980,
              fontSize: 10, fontWeight: 700, padding: "1px 6px", minWidth: 16, textAlign: "center",
            }}>{activeFilterCount}</span>
          )}
        </button>

        {/* Filter block (collapsible) */}
        {filtersOpen && (
        <div style={{
          background: "rgba(0,0,0,0.025)", borderRadius: 12,
          padding: "12px 14px", marginBottom: 14, border: `1px solid ${T.sep}`,
        }}>
          {/* Filter header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <span style={{
              fontFamily: T.font, fontSize: 10, fontWeight: 600, letterSpacing: "0.08em",
              textTransform: "uppercase", color: T.p3,
            }}>Filtros</span>
            {hasFilters && (
              <button onClick={clearAll} style={{
                fontFamily: T.font, fontSize: 12, fontWeight: 500, cursor: "pointer",
                background: "none", border: "none", color: T.blue, padding: 0,
              }}>Limpiar todo</button>
            )}
          </div>

          {/* Tienda */}
          <div style={{ marginBottom: 12 }}>
            <FilterLabel text="Tienda" />
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              <NeutralChip active={store === null} onClick={() => setStore(null)}>Todas</NeutralChip>
              {stores.map((s, i) => (
                <ColoredChip key={s.id} active={store === s.id} color={STORE_HUE[i % STORE_HUE.length]}
                  onClick={() => setStore(store === s.id ? null : s.id)}>
                  {s.name || `Tienda ${i + 1}`}
                </ColoredChip>
              ))}
            </div>
          </div>

          {/* Plataforma */}
          <div style={{ marginBottom: 12 }}>
            <FilterLabel text="Plataforma" />
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              <NeutralChip active={platform === null} onClick={() => setPlatform(null)}>Todas</NeutralChip>
              {PLATFORMS.map(p => (
                <ColoredChip key={p.key} active={platform === p.key} color={p.color}
                  onClick={() => setPlatform(platform === p.key ? null : p.key)}>
                  {p.label}
                </ColoredChip>
              ))}
            </div>
          </div>

          {/* Fechas */}
          <div>
            <FilterLabel text="Fechas" />
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input type="date" value={dateFrom} onChange={e => setFrom(e.target.value)} style={{
                fontFamily: T.font, fontSize: 12, flex: 1, padding: "5px 8px",
                border: `1px solid ${dateFrom ? T.blue : T.sep}`, borderRadius: 8,
                color: T.p1, background: T.surface, minWidth: 0, outline: "none",
              }} />
              <span style={{ color: T.p3, fontSize: 12, flexShrink: 0 }}>→</span>
              <input type="date" value={dateTo} onChange={e => setTo(e.target.value)} style={{
                fontFamily: T.font, fontSize: 12, flex: 1, padding: "5px 8px",
                border: `1px solid ${dateTo ? T.blue : T.sep}`, borderRadius: 8,
                color: T.p1, background: T.surface, minWidth: 0, outline: "none",
              }} />
            </div>
          </div>
        </div>
        )}

        {/* Forms */}
        {isPending && showAdd && (
          <ShipForm initial={{ ...EMPTY, storeId: stores[0]?.id ?? 1 }} title="Nuevo envío" stores={stores}
            onSave={f => save(f, false)} onCancel={() => { setShowAdd(false); setFormErr(""); }}
            saving={saving} err={formErr} />
        )}
        {editing && editInitial && (
          <ShipForm initial={editInitial} title="Editar envío" stores={stores}
            onSave={f => save(f, true)} onCancel={() => { setEditing(null); setFormErr(""); }}
            saving={saving} err={formErr} />
        )}

        {/* Cards */}
        {loading ? (
          <div style={{ textAlign: "center", color: T.p3, padding: "32px 0", fontFamily: T.font, fontSize: 13 }}>Cargando…</div>
        ) : colOrders.length === 0 ? (
          <Empty text={isPending ? "Sin envíos pendientes" : "Sin envíos completados"} />
        ) : colOrders.map(o => (
          <OrderCard key={o.id} order={o} stores={stores}
            storeName={stores.find(s => s.id === o.storeId)?.name ?? `T${o.storeId}`}
            labelViewed={labelViewed.has(o.id)} onLabelView={() => markLabelViewed(o.id)}
            onDone={isPending ? () => markDone(o.id) : undefined}
            onUndo={!isPending ? () => markPending(o.id) : undefined}
            onDelete={() => remove(o.id)} onEdit={() => openEdit(o)}
          />
        ))}
      </div>
    );
  };

  const tabStyle = (active: boolean): React.CSSProperties => ({
    fontFamily: T.font, fontSize: 14, fontWeight: active ? 600 : 400,
    color: active ? T.p1 : T.p2, cursor: "pointer", background: "none", border: "none",
    padding: "12px 4px", borderBottom: `2px solid ${active ? T.p1 : "transparent"}`,
  });

  return (
    <div style={{ minHeight: "100vh", background: T.bg }}>
      {showSettings && (
        <SettingsModal stores={stores} onSave={handleSaveStores} onClose={() => setShowSettings(false)} />
      )}

      {/* Header */}
      <header style={{
        background: "rgba(255,255,255,0.85)", backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)", boxShadow: "0 1px 0 rgba(17,24,39,0.06)", height: 52,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 20px", position: "sticky", top: 0, zIndex: 100,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {view !== "both" && (
            <button onClick={() => setView("both")} style={{
              background: "none", border: "none", cursor: "pointer",
              color: T.blue, fontFamily: T.font, fontSize: 14, fontWeight: 500, padding: "4px 0",
            }}>← Volver</button>
          )}
          {view === "both" && (
            <span style={{ fontFamily: T.font, fontSize: 17, fontWeight: 600, color: T.p1 }}>Logística</span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => setShowSettings(true)} title="Configurar tiendas" style={{
            background: "none", border: "none", cursor: "pointer", color: T.p2,
            display: "flex", alignItems: "center", padding: "4px",
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
          <button onClick={logout} style={{
            fontFamily: T.font, fontSize: 13, fontWeight: 500, cursor: "pointer",
            color: T.blue, background: "none", border: "none",
          }}>Salir</button>
        </div>
      </header>

      {/* Tabs */}
      <div style={{ maxWidth: 1260, margin: "0 auto", padding: "0 20px" }}>
        <div style={{ display: "flex", gap: 20, borderBottom: `1px solid ${T.sep}` }}>
          <button style={tabStyle(view === "both")} onClick={() => { setView("both"); setShowAdd(false); setEditing(null); }}>
            Todos
          </button>
          <button style={tabStyle(view === "pending")} onClick={() => { setView("pending"); setShowAdd(false); setEditing(null); }}>
            Pendiente
            <span style={{
              fontFamily: T.font, fontSize: 11, fontWeight: 600, marginLeft: 6,
              background: "#fee4e2", color: T.red, borderRadius: 980, padding: "1px 7px",
            }}>{orders.filter(o => o.status === "pending").length}</span>
          </button>
          <button style={tabStyle(view === "done")} onClick={() => { setView("done"); setShowAdd(false); setEditing(null); }}>
            Completado
            <span style={{
              fontFamily: T.font, fontSize: 11, fontWeight: 600, marginLeft: 6,
              background: T.greenSoft, color: "#1a7a3a", borderRadius: 980, padding: "1px 7px",
            }}>{orders.filter(o => o.status === "done").length}</span>
          </button>
        </div>
      </div>

      {/* KPI Banner */}
      <KPIBanner orders={orders} loading={loading} activeKpi={kpiFilter} onFilter={handleKpiFilter} />

      {/* Columns */}
      <div style={{
        maxWidth: 1260, margin: "0 auto", padding: "20px 20px 40px",
        display: "flex", gap: 20, alignItems: "flex-start",
      }}>
        {(view === "both" || view === "pending") && renderColumn("pending")}
        {(view === "both" || view === "done")    && renderColumn("done")}
      </div>
    </div>
  );
}
