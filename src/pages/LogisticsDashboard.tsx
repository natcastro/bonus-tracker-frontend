import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import type { LogisticsOrder } from "../types";
import {
  getLogisticsOrders, createLogisticsOrder, updateLogisticsOrder,
  markLogisticsOrderDone, markLogisticsOrderPending,
  deleteLogisticsOrder, uploadLogisticsLabel,
} from "../services/api";

// ── Store config ──────────────────────────────────────────────────────────────

const NUM_STORES = 9;
const STORE_COLORS = [
  "#1e40af","#15803d","#b45309","#7c3aed",
  "#be185d","#0891b2","#dc2626","#065f46","#92400e",
];

// ── Platform config ───────────────────────────────────────────────────────────

type Platform = LogisticsOrder["platform"];

const PLATFORM_LABEL: Record<Platform, string> = {
  tiktok: "TikTok", amazon: "Amazon", shopify: "Shopify", other: "Otro",
};
const PLATFORM_COLOR: Record<Platform, string> = {
  tiktok: "#010101", amazon: "#FF9900", shopify: "#96BF48", other: "#64748b",
};

// ── Urgency ───────────────────────────────────────────────────────────────────

function urgency(order: LogisticsOrder): "fresh" | "warn" | "urgent" | "critical" {
  if (order.status === "done") return "fresh";
  const ref = order.shipDate
    ? new Date(order.shipDate + "T00:00:00")
    : new Date(order.createdAt);
  const days = Math.floor((Date.now() - ref.getTime()) / 86_400_000);
  if (days < 1) return "fresh";
  if (days < 2) return "warn";
  if (days < 3) return "urgent";
  return "critical";
}

const URGENCY_STYLE = {
  fresh:    { bg: "#fff",    border: "#fca5a5", left: "#ef4444", label: null },
  warn:     { bg: "#fff7ed", border: "#fdba74", left: "#f97316", label: "🟠 1 día" },
  urgent:   { bg: "#fee2e2", border: "#fca5a5", left: "#dc2626", label: "🔴 2 días" },
  critical: { bg: "#fef2f2", border: "#f87171", left: "#7f1d1d", label: "🚨 +3 días" },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function sortKey(o: LogisticsOrder): number {
  return o.shipDate
    ? new Date(o.shipDate + "T00:00:00").getTime()
    : new Date(o.createdAt).getTime();
}

function matches(o: LogisticsOrder, q: string): boolean {
  if (!q.trim()) return true;
  const lower = q.toLowerCase();
  return (
    o.article.toLowerCase().includes(lower) ||
    o.orderNumber.toLowerCase().includes(lower) ||
    (o.trackingNumber ?? "").toLowerCase().includes(lower)
  );
}

function inDateRange(o: LogisticsOrder, from: string, to: string): boolean {
  const ref = o.shipDate ?? o.createdAt.slice(0, 10);
  if (from && ref < from) return false;
  if (to   && ref > to)   return false;
  return true;
}

// ── Form state ────────────────────────────────────────────────────────────────

type FormState = {
  storeId: number; platform: Platform; article: string; orderNumber: string; trackingNumber: string;
  shipDate: string; labelType: "url" | "file"; labelUrl: string; labelFile: File | null; notes: string;
};
const EMPTY_FORM: FormState = {
  storeId: 1, platform: "other", article: "", orderNumber: "", trackingNumber: "",
  shipDate: "", labelType: "url", labelUrl: "", labelFile: null, notes: "",
};

// ── SearchBar ─────────────────────────────────────────────────────────────────

function SearchBar({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ position: "relative" }}>
      <span style={{ position: "absolute", left: "0.65rem", top: "50%", transform: "translateY(-50%)", color: "#94a3b8", fontSize: "0.9rem", pointerEvents: "none" }}>🔍</span>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="Buscar artículo, orden, tracking..."
        style={{
          width: "100%", padding: "0.48rem 2rem 0.48rem 2rem",
          border: "1px solid #e2e8f0", borderRadius: 9, fontSize: "0.84rem",
          boxSizing: "border-box", outline: "none", background: "#fff",
        }}
      />
      {value && (
        <button onClick={() => onChange("")} style={{
          position: "absolute", right: "0.5rem", top: "50%", transform: "translateY(-50%)",
          background: "none", border: "none", cursor: "pointer", color: "#94a3b8", fontSize: "1rem", lineHeight: 1,
        }}>✕</button>
      )}
    </div>
  );
}

// ── SortToggle ────────────────────────────────────────────────────────────────

function SortToggle({ asc, onToggle }: { asc: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle} title={asc ? "Más temprano primero" : "Más reciente primero"} style={{
      background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 8,
      padding: "0.3rem 0.65rem", cursor: "pointer", fontSize: "0.76rem",
      color: "#374151", fontWeight: 600, display: "flex", alignItems: "center", gap: "0.25rem",
      whiteSpace: "nowrap", flexShrink: 0,
    }}>
      {asc ? "↑ Antiguo" : "↓ Reciente"}
    </button>
  );
}

// ── OrderCard ─────────────────────────────────────────────────────────────────

function OrderCard({ order, onDone, onUndo, onDelete, onEdit }: {
  order: LogisticsOrder;
  onDone?: () => void; onUndo?: () => void;
  onDelete: () => void; onEdit: () => void;
}) {
  const isDone = order.status === "done";
  const pColor = PLATFORM_COLOR[order.platform];
  const urg    = urgency(order);
  const s      = isDone
    ? { bg: "#f0fdf4", border: "#86efac", left: "#22c55e", label: null }
    : URGENCY_STYLE[urg];

  return (
    <div style={{
      background: s.bg, border: `1px solid ${s.border}`,
      borderLeft: `5px solid ${s.left}`,
      borderRadius: 12, padding: "0.9rem 1.05rem", marginBottom: "0.7rem",
    }}>
      {/* Top badges */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", flexWrap: "wrap", marginBottom: "0.45rem" }}>
        <span style={{ background: STORE_COLORS[(order.storeId - 1) % STORE_COLORS.length], color: "#fff", borderRadius: 6, padding: "0.12rem 0.55rem", fontSize: "0.68rem", fontWeight: 700 }}>
          T{order.storeId}
        </span>
        <span style={{
          background: pColor,
          color: order.platform === "amazon" ? "#78350f" : "#fff",
          borderRadius: 6, padding: "0.12rem 0.55rem", fontSize: "0.68rem", fontWeight: 700,
        }}>
          {PLATFORM_LABEL[order.platform]}
        </span>
        {s.label && !isDone && (
          <span style={{ background: s.left, color: "#fff", borderRadius: 6, padding: "0.12rem 0.5rem", fontSize: "0.68rem", fontWeight: 700 }}>{s.label}</span>
        )}
        {isDone && (
          <span style={{ background: "#dcfce7", color: "#15803d", borderRadius: 6, padding: "0.12rem 0.5rem", fontSize: "0.68rem", fontWeight: 700 }}>✓ Completado</span>
        )}
      </div>

      {/* Article + order */}
      <div style={{ fontWeight: 700, fontSize: "0.93rem", color: "#0f172a", marginBottom: "0.15rem" }}>{order.article}</div>
      <div style={{ fontSize: "0.8rem", color: "#64748b", marginBottom: order.trackingNumber ? "0.2rem" : "0.4rem" }}>
        Orden: <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#334155" }}>{order.orderNumber}</span>
      </div>
      {order.trackingNumber && (
        <div style={{ fontSize: "0.78rem", color: "#64748b", marginBottom: "0.4rem" }}>
          Tracking: <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#1e40af" }}>{order.trackingNumber}</span>
        </div>
      )}

      {/* Date badges */}
      <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap", marginBottom: "0.45rem" }}>
        {order.shipDate ? (
          <span style={{
            background: isDone ? "#d1fae5" : urg === "fresh" ? "#e0f2fe" : urg === "warn" ? "#ffedd5" : "#fee2e2",
            color: isDone ? "#065f46" : urg === "fresh" ? "#0369a1" : urg === "warn" ? "#7c2d12" : "#991b1b",
            borderRadius: 6, padding: "0.15rem 0.55rem", fontSize: "0.73rem", fontWeight: 700,
          }}>
            📅 {new Date(order.shipDate + "T00:00:00").toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" })}
          </span>
        ) : (
          <span style={{ color: "#94a3b8", fontSize: "0.7rem" }}>
            Creado: {new Date(order.createdAt).toLocaleDateString("es-CO", { day: "2-digit", month: "short", year: "numeric" })}
          </span>
        )}
        {isDone && order.doneAt && (
          <span style={{ background: "#dcfce7", color: "#166534", borderRadius: 6, padding: "0.15rem 0.55rem", fontSize: "0.73rem", fontWeight: 700 }}>
            ✓ {new Date(order.doneAt).toLocaleDateString("es-CO", { day: "2-digit", month: "short" })}
          </span>
        )}
      </div>

      {order.notes && (
        <div style={{ fontSize: "0.76rem", color: "#64748b", fontStyle: "italic", marginBottom: "0.45rem" }}>{order.notes}</div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
        {order.labelUrl && (
          <a href={order.labelUrl} target="_blank" rel="noopener noreferrer" style={{
            background: "#0ea5e9", color: "#fff", borderRadius: 7,
            padding: "0.32rem 0.75rem", fontSize: "0.76rem", fontWeight: 700, textDecoration: "none",
          }}>📎 Ver Label</a>
        )}
        {!isDone && onDone && (
          <button onClick={onDone} style={{
            background: "#16a34a", color: "#fff", border: "none", borderRadius: 7,
            padding: "0.32rem 0.8rem", fontSize: "0.76rem", fontWeight: 700, cursor: "pointer",
          }}>✓ Listo</button>
        )}
        {isDone && onUndo && (
          <button onClick={onUndo} style={{
            background: "#f8fafc", color: "#64748b", border: "1px solid #e2e8f0",
            borderRadius: 7, padding: "0.32rem 0.75rem", fontSize: "0.76rem", fontWeight: 600, cursor: "pointer",
          }}>↩ Reabrir</button>
        )}
        <button onClick={onEdit} style={{
          background: "#f8fafc", color: "#374151", border: "1px solid #e2e8f0",
          borderRadius: 7, padding: "0.32rem 0.75rem", fontSize: "0.76rem", fontWeight: 600, cursor: "pointer",
        }}>✏️ Editar</button>
        <button onClick={onDelete} style={{
          background: "#fff0f0", color: "#dc2626", border: "1px solid #fca5a5",
          borderRadius: 7, padding: "0.32rem 0.6rem", fontSize: "0.76rem", cursor: "pointer",
        }}>🗑</button>
      </div>
    </div>
  );
}

// ── ShipForm ──────────────────────────────────────────────────────────────────

function ShipForm({ initial, onSave, onCancel, saving, err }: {
  initial: FormState;
  onSave: (f: FormState) => void;
  onCancel: () => void;
  saving: boolean;
  err: string;
}) {
  const [f, setF] = useState<FormState>(initial);
  return (
    <form onSubmit={e => { e.preventDefault(); onSave(f); }} style={{
      background: "#fff", borderRadius: 12, padding: "1.1rem 1.2rem",
      marginBottom: "1rem", border: "2px solid #fca5a5",
      display: "flex", flexDirection: "column", gap: "0.75rem",
    }}>
      {/* Store */}
      <div>
        <div style={{ fontSize: "0.7rem", color: "#64748b", fontWeight: 700, marginBottom: "0.28rem", letterSpacing: "0.05em" }}>TIENDA *</div>
        <select value={f.storeId} onChange={e => setF(p => ({ ...p, storeId: Number(e.target.value) }))} required style={{
          width: "100%", padding: "0.48rem 0.65rem", border: "1px solid #e2e8f0", borderRadius: 8,
          fontSize: "0.86rem", background: "#fff", cursor: "pointer",
          borderLeft: `5px solid ${STORE_COLORS[(f.storeId - 1) % STORE_COLORS.length]}`,
          fontWeight: 700, color: "#0f172a",
        }}>
          {Array.from({ length: NUM_STORES }, (_, i) => i + 1).map(n => (
            <option key={n} value={n}>Tienda {n}</option>
          ))}
        </select>
      </div>

      {/* Platform */}
      <div>
        <div style={{ fontSize: "0.7rem", color: "#64748b", fontWeight: 700, marginBottom: "0.35rem", letterSpacing: "0.05em" }}>PLATAFORMA *</div>
        <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap" }}>
          {(["tiktok","amazon","shopify","other"] as Platform[]).map(p => (
            <button key={p} type="button" onClick={() => setF(prev => ({ ...prev, platform: p }))} style={{
              padding: "0.35rem 0.85rem", borderRadius: 8,
              border: `2px solid ${PLATFORM_COLOR[p]}`,
              background: f.platform === p ? PLATFORM_COLOR[p] : "#fff",
              color: f.platform === p ? (p === "amazon" ? "#78350f" : "#fff") : PLATFORM_COLOR[p],
              fontWeight: 700, cursor: "pointer", fontSize: "0.8rem",
            }}>{PLATFORM_LABEL[p]}</button>
          ))}
        </div>
      </div>

      {/* Article + Order */}
      <div style={{ display: "flex", gap: "0.6rem" }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "0.7rem", color: "#64748b", fontWeight: 700, marginBottom: "0.28rem", letterSpacing: "0.05em" }}>ARTÍCULO *</div>
          <input value={f.article} onChange={e => setF(p => ({ ...p, article: e.target.value }))}
            placeholder="Nombre del artículo" required
            style={{ width: "100%", padding: "0.48rem 0.65rem", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: "0.86rem", boxSizing: "border-box" }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "0.7rem", color: "#64748b", fontWeight: 700, marginBottom: "0.28rem", letterSpacing: "0.05em" }}>No. ORDEN *</div>
          <input value={f.orderNumber} onChange={e => setF(p => ({ ...p, orderNumber: e.target.value }))}
            placeholder="Ej: ORD-12345" required
            style={{ width: "100%", padding: "0.48rem 0.65rem", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: "0.86rem", boxSizing: "border-box" }} />
        </div>
      </div>

      {/* Tracking Number */}
      <div>
        <div style={{ fontSize: "0.7rem", color: "#64748b", fontWeight: 700, marginBottom: "0.28rem", letterSpacing: "0.05em" }}>
          TRACKING NUMBER <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(opcional)</span>
        </div>
        <input value={f.trackingNumber} onChange={e => setF(p => ({ ...p, trackingNumber: e.target.value }))}
          placeholder="Ej: 1Z999AA10123456784"
          style={{ width: "100%", padding: "0.48rem 0.65rem", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: "0.86rem", boxSizing: "border-box", fontFamily: "monospace" }} />
      </div>

      {/* Date */}
      <div>
        <div style={{ fontSize: "0.7rem", color: "#64748b", fontWeight: 700, marginBottom: "0.28rem", letterSpacing: "0.05em" }}>FECHA DE ENVÍO *</div>
        <input type="date" value={f.shipDate} onChange={e => setF(p => ({ ...p, shipDate: e.target.value }))} required
          style={{ width: "100%", padding: "0.48rem 0.65rem", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: "0.86rem", boxSizing: "border-box" }} />
      </div>

      {/* Label */}
      <div>
        <div style={{ fontSize: "0.7rem", color: "#64748b", fontWeight: 700, marginBottom: "0.32rem", letterSpacing: "0.05em" }}>LABEL DE ENVÍO</div>
        <div style={{ display: "flex", gap: "0.3rem", marginBottom: "0.45rem" }}>
          {(["url","file"] as const).map((t, i) => (
            <button key={t} type="button" onClick={() => setF(p => ({ ...p, labelType: t }))} style={{
              padding: "0.28rem 0.7rem", borderRadius: 7, cursor: "pointer", fontSize: "0.76rem", fontWeight: 600,
              border: "1px solid #e2e8f0",
              background: f.labelType === t ? "#0f172a" : "#fff",
              color: f.labelType === t ? "#fff" : "#64748b",
            }}>{i === 0 ? "🔗 Link" : "📎 Documento"}</button>
          ))}
        </div>
        {f.labelType === "url" ? (
          <input type="url" value={f.labelUrl} onChange={e => setF(p => ({ ...p, labelUrl: e.target.value }))}
            placeholder="https://..."
            style={{ width: "100%", padding: "0.48rem 0.65rem", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: "0.86rem", boxSizing: "border-box" }} />
        ) : (
          <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp"
            onChange={e => setF(p => ({ ...p, labelFile: e.target.files?.[0] ?? null }))}
            style={{ fontSize: "0.83rem" }} />
        )}
      </div>

      {/* Notes */}
      <div>
        <div style={{ fontSize: "0.7rem", color: "#64748b", fontWeight: 700, marginBottom: "0.28rem", letterSpacing: "0.05em" }}>NOTAS (opcional)</div>
        <input value={f.notes} onChange={e => setF(p => ({ ...p, notes: e.target.value }))}
          placeholder="Instrucciones especiales..."
          style={{ width: "100%", padding: "0.48rem 0.65rem", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: "0.86rem", boxSizing: "border-box" }} />
      </div>

      {err && <div style={{ color: "#dc2626", fontSize: "0.8rem", fontWeight: 600 }}>{err}</div>}

      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button type="button" onClick={onCancel} style={{
          flex: 1, background: "#f8fafc", color: "#64748b", border: "1px solid #e2e8f0",
          borderRadius: 8, padding: "0.55rem", cursor: "pointer", fontWeight: 600, fontSize: "0.86rem",
        }}>Cancelar</button>
        <button type="submit" disabled={saving} style={{
          flex: 2, background: "#dc2626", color: "#fff", border: "none",
          borderRadius: 8, padding: "0.55rem", cursor: saving ? "wait" : "pointer",
          fontWeight: 700, fontSize: "0.88rem",
        }}>{saving ? "Guardando..." : "📦 Guardar"}</button>
      </div>
    </form>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function Empty({ icon, text }: { icon: string; text: string }) {
  return (
    <div style={{
      textAlign: "center", color: "#94a3b8", padding: "2.5rem 1rem",
      background: "#fff", borderRadius: 12, border: "1px dashed #e2e8f0",
    }}>
      <div style={{ fontSize: "2.5rem" }}>{icon}</div>
      <div style={{ marginTop: "0.5rem", fontSize: "0.88rem" }}>{text}</div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function LogisticsDashboard() {
  const navigate = useNavigate();
  const [orders, setOrders]   = useState<LogisticsOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView]       = useState<"both" | "pending" | "done">("both");

  // Per-column state
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

  // Derived lists
  const pendingOrders = useMemo(() => {
    let list = orders.filter(o => o.status === "pending");
    if (pendingStore)   list = list.filter(o => o.storeId === pendingStore);
    if (pendingPlatform) list = list.filter(o => o.platform === pendingPlatform);
    list = list.filter(o => matches(o, pendingSearch));
    list = list.filter(o => inDateRange(o, pendingFrom, pendingTo));
    list.sort((a, b) => pendingSortAsc ? sortKey(a) - sortKey(b) : sortKey(b) - sortKey(a));
    return list;
  }, [orders, pendingStore, pendingPlatform, pendingSearch, pendingSortAsc, pendingFrom, pendingTo]);

  const doneOrders = useMemo(() => {
    let list = orders.filter(o => o.status === "done");
    if (doneStore)   list = list.filter(o => o.storeId === doneStore);
    if (donePlatform) list = list.filter(o => o.platform === donePlatform);
    list = list.filter(o => matches(o, doneSearch));
    list = list.filter(o => inDateRange(o, doneFrom, doneTo));
    list.sort((a, b) => {
      const ka = new Date(a.doneAt ?? a.createdAt).getTime();
      const kb = new Date(b.doneAt ?? b.createdAt).getTime();
      return doneSortAsc ? ka - kb : kb - ka;
    });
    return list;
  }, [orders, doneStore, donePlatform, doneSearch, doneSortAsc, doneFrom, doneTo]);

  const handleAdd = async (f: FormState) => {
    setSaving(true); setFormErr("");
    try {
      let labelUrl: string | undefined;
      if (f.labelType === "url" && f.labelUrl.trim()) labelUrl = f.labelUrl.trim();
      else if (f.labelType === "file" && f.labelFile)  labelUrl = await uploadLogisticsLabel(f.labelFile);
      await createLogisticsOrder({
        storeId: f.storeId, platform: f.platform, article: f.article.trim(), orderNumber: f.orderNumber.trim(),
        trackingNumber: f.trackingNumber.trim() || undefined,
        labelUrl, shipDate: f.shipDate || undefined, notes: f.notes.trim(), status: "pending",
      });
      setShowAdd(false);
      await load();
    } catch (err) { setFormErr(String(err)); }
    finally { setSaving(false); }
  };

  const handleEdit = async (f: FormState) => {
    if (!editing) return;
    setSaving(true); setFormErr("");
    try {
      let labelUrl: string | undefined = editing.labelUrl;
      if (f.labelType === "url")  labelUrl = f.labelUrl.trim() || undefined;
      else if (f.labelFile)       labelUrl = await uploadLogisticsLabel(f.labelFile);
      await updateLogisticsOrder(editing.id, {
        storeId: f.storeId, platform: f.platform, article: f.article.trim(), orderNumber: f.orderNumber.trim(),
        trackingNumber: f.trackingNumber.trim() || undefined,
        labelUrl, shipDate: f.shipDate || undefined, notes: f.notes.trim(),
      });
      setEditing(null);
      await load();
    } catch (err) { setFormErr(String(err)); }
    finally { setSaving(false); }
  };

  const openEdit = (o: LogisticsOrder) => {
    setShowAdd(false); setFormErr("");
    setEditing(o);
  };

  const markDone    = async (id: number) => { await markLogisticsOrderDone(id);    load(); };
  const markPending = async (id: number) => { await markLogisticsOrderPending(id); load(); };
  const remove      = async (id: number) => {
    if (!confirm("¿Eliminar este envío?")) return;
    await deleteLogisticsOrder(id); load();
  };

  const showBoth = view === "both";

  const editInitial: FormState | undefined = editing ? {
    storeId: editing.storeId, platform: editing.platform, article: editing.article,
    orderNumber: editing.orderNumber, trackingNumber: editing.trackingNumber ?? "",
    shipDate: editing.shipDate ?? "", labelType: "url",
    labelUrl: editing.labelUrl ?? "", labelFile: null, notes: editing.notes ?? "",
  } : undefined;

  // ── Column renderer ──
  const renderColumn = (side: "pending" | "done") => {
    const isPending = side === "pending";
    const colOrders  = isPending ? pendingOrders : doneOrders;
    const search     = isPending ? pendingSearch : doneSearch;
    const setSearch  = isPending ? setPendingSearch : setDoneSearch;
    const sortAsc    = isPending ? pendingSortAsc : doneSortAsc;
    const toggleSort = isPending ? () => setPendingSortAsc(v => !v) : () => setDoneSortAsc(v => !v);
    const platform    = isPending ? pendingPlatform : donePlatform;
    const setPlatform = isPending ? setPendingPlatform : setDonePlatform;
    const store       = isPending ? pendingStore : doneStore;
    const setStore    = isPending ? setPendingStore : setDoneStore;
    const dateFrom   = isPending ? pendingFrom : doneFrom;
    const dateTo     = isPending ? pendingTo   : doneTo;
    const setFrom    = isPending ? setPendingFrom : setDoneFrom;
    const setTo      = isPending ? setPendingTo   : setDoneTo;
    const hasDateFilter = !!(dateFrom || dateTo);
    const totalCount = orders.filter(o => o.status === (isPending ? "pending" : "done")).length;

    return (
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Column header */}
        <div style={{
          background: isPending ? "#fee2e2" : "#dcfce7",
          borderRadius: 12, padding: "0.8rem 1rem", marginBottom: "0.75rem",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span style={{ fontWeight: 800, fontSize: "0.95rem", color: isPending ? "#991b1b" : "#166534" }}>
            {isPending ? "🔴 Pendiente" : "🟢 Completado"} ({totalCount})
          </span>
          {isPending && (
            <button onClick={() => { setShowAdd(!showAdd); setEditing(null); setFormErr(""); }} style={{
              background: "#dc2626", color: "#fff", border: "none", borderRadius: 8,
              padding: "0.35rem 0.85rem", cursor: "pointer", fontWeight: 700, fontSize: "0.8rem",
            }}>{showAdd ? "✕ Cancelar" : "+ Agregar"}</button>
          )}
        </div>

        {/* Search + sort */}
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.6rem" }}>
          <div style={{ flex: 1 }}>
            <SearchBar value={search} onChange={setSearch} />
          </div>
          <SortToggle asc={sortAsc} onToggle={toggleSort} />
        </div>

        {/* Store chips */}
        <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
          <button onClick={() => setStore(null)} style={{
            padding: "0.2rem 0.6rem", borderRadius: 20, fontSize: "0.72rem", fontWeight: 700, cursor: "pointer",
            border: "1px solid #e2e8f0",
            background: store === null ? "#0f172a" : "#fff",
            color: store === null ? "#fff" : "#374151",
          }}>Todas</button>
          {Array.from({ length: NUM_STORES }, (_, i) => i + 1).map(n => (
            <button key={n} onClick={() => setStore(store === n ? null : n)} style={{
              padding: "0.2rem 0.55rem", borderRadius: 20, fontSize: "0.72rem", fontWeight: 700, cursor: "pointer",
              border: `1.5px solid ${STORE_COLORS[(n - 1) % STORE_COLORS.length]}`,
              background: store === n ? STORE_COLORS[(n - 1) % STORE_COLORS.length] : "#fff",
              color: store === n ? "#fff" : STORE_COLORS[(n - 1) % STORE_COLORS.length],
            }}>T{n}</button>
          ))}
        </div>

        {/* Platform chips */}
        <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap", marginBottom: "0.75rem" }}>
          <button onClick={() => setPlatform(null)} style={{
            padding: "0.2rem 0.6rem", borderRadius: 20, fontSize: "0.72rem", fontWeight: 700, cursor: "pointer",
            border: "1px solid #e2e8f0",
            background: platform === null ? "#0f172a" : "#fff",
            color: platform === null ? "#fff" : "#374151",
          }}>Todas</button>
          {(["tiktok","amazon","shopify","other"] as Platform[]).map(p => (
            <button key={p} onClick={() => setPlatform(platform === p ? null : p)} style={{
              padding: "0.2rem 0.6rem", borderRadius: 20, fontSize: "0.72rem", fontWeight: 700, cursor: "pointer",
              border: `1.5px solid ${PLATFORM_COLOR[p]}`,
              background: platform === p ? PLATFORM_COLOR[p] : "#fff",
              color: platform === p ? (p === "amazon" ? "#78350f" : "#fff") : PLATFORM_COLOR[p],
            }}>{PLATFORM_LABEL[p]}</button>
          ))}
        </div>

        {/* Date range filter */}
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginBottom: "0.75rem", flexWrap: "wrap" }}>
          <span style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 700, whiteSpace: "nowrap" }}>📅 Fecha:</span>
          <div style={{ display: "flex", gap: "0.3rem", alignItems: "center", flex: 1 }}>
            <input type="date" value={dateFrom} onChange={e => setFrom(e.target.value)}
              style={{ flex: 1, padding: "0.3rem 0.5rem", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: "0.78rem", minWidth: 0 }} />
            <span style={{ color: "#94a3b8", fontSize: "0.76rem" }}>→</span>
            <input type="date" value={dateTo} onChange={e => setTo(e.target.value)}
              style={{ flex: 1, padding: "0.3rem 0.5rem", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: "0.78rem", minWidth: 0 }} />
          </div>
          {hasDateFilter && (
            <button onClick={() => { setFrom(""); setTo(""); }} style={{
              background: "#fee2e2", color: "#dc2626", border: "1px solid #fca5a5",
              borderRadius: 7, padding: "0.25rem 0.55rem", cursor: "pointer", fontSize: "0.72rem", fontWeight: 700, whiteSpace: "nowrap",
            }}>✕ Limpiar</button>
          )}
        </div>

        {/* Forms */}
        {isPending && showAdd && (
          <ShipForm initial={EMPTY_FORM} onSave={handleAdd}
            onCancel={() => { setShowAdd(false); setFormErr(""); }}
            saving={saving} err={formErr} />
        )}
        {isPending && editing && editInitial && (
          <ShipForm initial={editInitial} onSave={handleEdit}
            onCancel={() => { setEditing(null); setFormErr(""); }}
            saving={saving} err={formErr} />
        )}
        {!isPending && editing && editInitial && (
          <ShipForm initial={editInitial} onSave={handleEdit}
            onCancel={() => { setEditing(null); setFormErr(""); }}
            saving={saving} err={formErr} />
        )}

        {/* Orders */}
        {loading ? (
          <div style={{ textAlign: "center", color: "#94a3b8", padding: "2rem" }}>Cargando...</div>
        ) : colOrders.length === 0 ? (
          <Empty icon={isPending ? "✅" : "📦"} text={isPending ? "Sin envíos pendientes" : "Sin envíos completados"} />
        ) : colOrders.map(o => (
          <OrderCard key={o.id} order={o}
            onDone={isPending ? () => markDone(o.id) : undefined}
            onUndo={!isPending ? () => markPending(o.id) : undefined}
            onDelete={() => remove(o.id)}
            onEdit={() => openEdit(o)}
          />
        ))}
      </div>
    );
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f1f5f9" }}>
      {/* ── Header ── */}
      <header style={{
        background: "#fff", borderBottom: "1px solid #e2e8f0",
        padding: "0 1.25rem", height: 58,
        display: "flex", alignItems: "center", gap: "0.75rem", justifyContent: "space-between",
        position: "sticky", top: 0, zIndex: 50,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          {!showBoth && (
            <button onClick={() => setView("both")} title="Ver ambas columnas" style={{
              background: "#f1f5f9", border: "1px solid #e2e8f0", borderRadius: 8,
              padding: "0.3rem 0.6rem", cursor: "pointer", fontSize: "1rem", color: "#374151",
              fontWeight: 700, lineHeight: 1,
            }}>←</button>
          )}
          <div style={{ fontWeight: 800, fontSize: "1.05rem", color: "#0f172a", whiteSpace: "nowrap" }}>📦 Logística</div>
        </div>
        <button onClick={logout} style={{
          padding: "0.25rem 0.75rem", borderRadius: 8, border: "1px solid #e2e8f0",
          background: "#fff", cursor: "pointer", fontSize: "0.76rem", color: "#64748b", whiteSpace: "nowrap",
        }}>Salir</button>
      </header>

      {/* ── Tab bar ── */}
      <div style={{ display: "flex", gap: "0.5rem", padding: "0.9rem 1.25rem 0", maxWidth: 1300, margin: "0 auto" }}>
        <button onClick={() => { setView("pending"); setShowAdd(false); setEditing(null); }} style={{
          padding: "0.45rem 1.1rem", borderRadius: "10px 10px 0 0",
          border: "1px solid #e2e8f0", borderBottom: "none",
          background: view === "pending" ? "#fee2e2" : view === "both" ? "#fff8f8" : "#fff",
          color: view === "pending" ? "#991b1b" : "#64748b",
          fontWeight: 700, cursor: "pointer", fontSize: "0.82rem",
          boxShadow: view === "pending" ? "inset 0 -3px 0 #ef4444" : "none",
        }}>
          🔴 Pendiente <span style={{ background: "#fca5a5", color: "#7f1d1d", borderRadius: 9999, padding: "0.02rem 0.45rem", fontSize: "0.7rem", fontWeight: 700, marginLeft: "0.2rem" }}>
            {orders.filter(o => o.status === "pending").length}
          </span>
        </button>
        <button onClick={() => { setView("done"); setShowAdd(false); setEditing(null); }} style={{
          padding: "0.45rem 1.1rem", borderRadius: "10px 10px 0 0",
          border: "1px solid #e2e8f0", borderBottom: "none",
          background: view === "done" ? "#dcfce7" : view === "both" ? "#f0fdf4" : "#fff",
          color: view === "done" ? "#166534" : "#64748b",
          fontWeight: 700, cursor: "pointer", fontSize: "0.82rem",
          boxShadow: view === "done" ? "inset 0 -3px 0 #22c55e" : "none",
        }}>
          🟢 Completado <span style={{ background: "#86efac", color: "#14532d", borderRadius: 9999, padding: "0.02rem 0.45rem", fontSize: "0.7rem", fontWeight: 700, marginLeft: "0.2rem" }}>
            {orders.filter(o => o.status === "done").length}
          </span>
        </button>
      </div>

      {/* ── Content ── */}
      <div style={{
        display: "flex", gap: "1rem", padding: "0 1.25rem 1.5rem",
        maxWidth: 1300, margin: "0 auto", alignItems: "flex-start",
        borderTop: "1px solid #e2e8f0", paddingTop: "1rem",
      }}>
        {(view === "both" || view === "pending") && renderColumn("pending")}
        {(view === "both" || view === "done")    && renderColumn("done")}
      </div>
    </div>
  );
}
