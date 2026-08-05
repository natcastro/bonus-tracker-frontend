import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import type { LogisticsOrder } from "../types";
import {
  getLogisticsOrders, createLogisticsOrder, updateLogisticsOrder,
  markLogisticsOrderDone, markLogisticsOrderPending,
  deleteLogisticsOrder, uploadLogisticsLabel,
} from "../services/api";

const STORE_COLORS = ["#1e40af","#15803d","#b45309","#7c3aed","#be185d","#0891b2"];

function urgency(order: LogisticsOrder): "fresh" | "warn" | "urgent" | "critical" {
  if (order.status === "done") return "fresh";
  const ref = order.shipDate
    ? new Date(order.shipDate + "T00:00:00")
    : new Date(order.createdAt);
  const days = Math.floor((Date.now() - ref.getTime()) / 86_400_000);
  if (days < 1)  return "fresh";
  if (days < 2)  return "warn";
  if (days < 3)  return "urgent";
  return "critical";
}

const URGENCY_STYLE = {
  fresh:    { bg: "#fff",     border: "#fca5a5", left: "#ef4444", label: null },
  warn:     { bg: "#fff7ed",  border: "#fdba74", left: "#f97316", label: "🟠 1 día" },
  urgent:   { bg: "#fee2e2",  border: "#fca5a5", left: "#dc2626", label: "🔴 2 días" },
  critical: { bg: "#fef2f2",  border: "#f87171", left: "#7f1d1d", label: "🚨 +3 días" },
};

type FormState = {
  storeId: number; article: string; orderNumber: string; shipDate: string;
  labelType: "url" | "file"; labelUrl: string; labelFile: File | null; notes: string;
};
const EMPTY_FORM: FormState = {
  storeId: 1, article: "", orderNumber: "", shipDate: "",
  labelType: "url", labelUrl: "", labelFile: null, notes: "",
};

// ── OrderCard ─────────────────────────────────────────────────────────────────
function OrderCard({ order, onDone, onUndo, onDelete, onEdit }: {
  order: LogisticsOrder;
  onDone?: () => void; onUndo?: () => void;
  onDelete: () => void; onEdit: () => void;
}) {
  const isDone = order.status === "done";
  const color  = STORE_COLORS[order.storeId - 1] ?? "#64748b";
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
      {/* Badges row */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", flexWrap: "wrap", marginBottom: "0.45rem" }}>
        <span style={{ background: color, color: "#fff", borderRadius: 6, padding: "0.12rem 0.5rem", fontSize: "0.68rem", fontWeight: 700 }}>
          Tienda {order.storeId}
        </span>
        {s.label && !isDone && (
          <span style={{ background: s.left, color: "#fff", borderRadius: 6, padding: "0.12rem 0.5rem", fontSize: "0.68rem", fontWeight: 700 }}>
            {s.label}
          </span>
        )}
        {isDone && (
          <span style={{ background: "#dcfce7", color: "#15803d", borderRadius: 6, padding: "0.12rem 0.5rem", fontSize: "0.68rem", fontWeight: 700 }}>
            ✓ Completado
          </span>
        )}
      </div>

      {/* Content */}
      <div style={{ fontWeight: 700, fontSize: "0.93rem", color: "#0f172a", marginBottom: "0.15rem" }}>{order.article}</div>
      <div style={{ fontSize: "0.8rem", color: "#64748b", marginBottom: "0.4rem" }}>
        Orden: <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#334155" }}>{order.orderNumber}</span>
      </div>

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

// ── ShipForm (shared add / edit form) ─────────────────────────────────────────
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
        <div style={{ fontSize: "0.7rem", color: "#64748b", fontWeight: 700, marginBottom: "0.35rem", letterSpacing: "0.05em" }}>TIENDA</div>
        <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap" }}>
          {[1,2,3,4,5,6].map(n => (
            <button key={n} type="button" onClick={() => setF(p => ({ ...p, storeId: n }))} style={{
              padding: "0.35rem 0.75rem", borderRadius: 8,
              border: `2px solid ${STORE_COLORS[n-1]}`,
              background: f.storeId === n ? STORE_COLORS[n-1] : "#fff",
              color: f.storeId === n ? "#fff" : STORE_COLORS[n-1],
              fontWeight: 700, cursor: "pointer", fontSize: "0.8rem",
            }}>T{n}</button>
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
  const [storeFilter, setStoreFilter] = useState<number | null>(null);
  const [view, setView]       = useState<"both" | "pending" | "done">("both");
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

  const filtered = storeFilter ? orders.filter(o => o.storeId === storeFilter) : orders;
  const pending  = [...filtered.filter(o => o.status === "pending")]
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const done     = [...filtered.filter(o => o.status === "done")]
    .sort((a, b) => new Date(b.doneAt ?? b.createdAt).getTime() - new Date(a.doneAt ?? a.createdAt).getTime());

  const handleAdd = async (f: FormState) => {
    setSaving(true); setFormErr("");
    try {
      let labelUrl: string | undefined;
      if (f.labelType === "url" && f.labelUrl.trim()) labelUrl = f.labelUrl.trim();
      else if (f.labelType === "file" && f.labelFile)  labelUrl = await uploadLogisticsLabel(f.labelFile);
      await createLogisticsOrder({
        storeId: f.storeId, article: f.article.trim(), orderNumber: f.orderNumber.trim(),
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
      if (f.labelType === "url")        labelUrl = f.labelUrl.trim() || undefined;
      else if (f.labelFile)             labelUrl = await uploadLogisticsLabel(f.labelFile);
      await updateLogisticsOrder(editing.id, {
        storeId: f.storeId, article: f.article.trim(), orderNumber: f.orderNumber.trim(),
        labelUrl, shipDate: f.shipDate || undefined, notes: f.notes.trim(),
      });
      setEditing(null);
      await load();
    } catch (err) { setFormErr(String(err)); }
    finally { setSaving(false); }
  };

  const openEdit = (o: LogisticsOrder) => {
    setShowAdd(false);
    setFormErr("");
    setEditing(o);
  };

  const markDone    = async (id: number) => { await markLogisticsOrderDone(id);    load(); };
  const markPending = async (id: number) => { await markLogisticsOrderPending(id); load(); };
  const remove      = async (id: number) => {
    if (!confirm("¿Eliminar este envío?")) return;
    await deleteLogisticsOrder(id); load();
  };

  const showBoth = view === "both";

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

        {/* Store filter */}
        <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap", alignItems: "center" }}>
          <button onClick={() => setStoreFilter(null)} style={{
            padding: "0.25rem 0.65rem", borderRadius: 20,
            border: "1px solid #e2e8f0",
            background: storeFilter === null ? "#0f172a" : "#fff",
            color: storeFilter === null ? "#fff" : "#374151",
            fontWeight: 700, cursor: "pointer", fontSize: "0.73rem",
          }}>Todas</button>
          {[1,2,3,4,5,6].map(n => (
            <button key={n} onClick={() => setStoreFilter(storeFilter === n ? null : n)} style={{
              padding: "0.25rem 0.65rem", borderRadius: 20,
              border: `1.5px solid ${STORE_COLORS[n-1]}`,
              background: storeFilter === n ? STORE_COLORS[n-1] : "#fff",
              color: storeFilter === n ? "#fff" : STORE_COLORS[n-1],
              fontWeight: 700, cursor: "pointer", fontSize: "0.73rem",
            }}>T{n}</button>
          ))}
        </div>

        <button onClick={logout} style={{
          padding: "0.25rem 0.75rem", borderRadius: 8, border: "1px solid #e2e8f0",
          background: "#fff", cursor: "pointer", fontSize: "0.76rem", color: "#64748b", whiteSpace: "nowrap",
        }}>Salir</button>
      </header>

      {/* ── Tab bar ── */}
      <div style={{
        display: "flex", gap: "0.5rem", padding: "0.9rem 1.25rem 0",
        maxWidth: 1300, margin: "0 auto",
      }}>
        <button onClick={() => { setView("pending"); setShowAdd(false); setEditing(null); }} style={{
          padding: "0.45rem 1.1rem", borderRadius: "10px 10px 0 0",
          border: "1px solid #e2e8f0", borderBottom: "none",
          background: view === "pending" ? "#fee2e2" : view === "both" ? "#fff8f8" : "#fff",
          color: view === "pending" ? "#991b1b" : "#64748b",
          fontWeight: 700, cursor: "pointer", fontSize: "0.82rem",
          boxShadow: view === "pending" ? "inset 0 -3px 0 #ef4444" : "none",
        }}>
          🔴 Pendiente <span style={{
            background: "#fca5a5", color: "#7f1d1d", borderRadius: 9999,
            padding: "0.02rem 0.45rem", fontSize: "0.7rem", fontWeight: 700, marginLeft: "0.2rem",
          }}>{pending.length}</span>
        </button>
        <button onClick={() => { setView("done"); setShowAdd(false); setEditing(null); }} style={{
          padding: "0.45rem 1.1rem", borderRadius: "10px 10px 0 0",
          border: "1px solid #e2e8f0", borderBottom: "none",
          background: view === "done" ? "#dcfce7" : view === "both" ? "#f0fdf4" : "#fff",
          color: view === "done" ? "#166534" : "#64748b",
          fontWeight: 700, cursor: "pointer", fontSize: "0.82rem",
          boxShadow: view === "done" ? "inset 0 -3px 0 #22c55e" : "none",
        }}>
          🟢 Completado <span style={{
            background: "#86efac", color: "#14532d", borderRadius: 9999,
            padding: "0.02rem 0.45rem", fontSize: "0.7rem", fontWeight: 700, marginLeft: "0.2rem",
          }}>{done.length}</span>
        </button>
      </div>

      {/* ── Content ── */}
      <div style={{
        display: "flex", gap: "1rem", padding: "0 1.25rem 1.5rem",
        maxWidth: 1300, margin: "0 auto", alignItems: "flex-start",
        borderTop: "1px solid #e2e8f0", paddingTop: "1rem",
      }}>

        {/* PENDIENTE column — show when view is "both" or "pending" */}
        {(view === "both" || view === "pending") && (
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              background: "#fee2e2", borderRadius: 12, padding: "0.8rem 1rem",
              marginBottom: "0.9rem", display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <span style={{ fontWeight: 800, color: "#991b1b", fontSize: "0.95rem" }}>🔴 Pendiente ({pending.length})</span>
              <button onClick={() => { setShowAdd(!showAdd); setEditing(null); setFormErr(""); }} style={{
                background: "#dc2626", color: "#fff", border: "none", borderRadius: 8,
                padding: "0.35rem 0.85rem", cursor: "pointer", fontWeight: 700, fontSize: "0.8rem",
              }}>{showAdd ? "✕ Cancelar" : "+ Agregar"}</button>
            </div>

            {showAdd && (
              <ShipForm
                initial={EMPTY_FORM}
                onSave={handleAdd}
                onCancel={() => { setShowAdd(false); setFormErr(""); }}
                saving={saving}
                err={formErr}
              />
            )}

            {editing && (
              <ShipForm
                initial={{
                  storeId: editing.storeId, article: editing.article,
                  orderNumber: editing.orderNumber, shipDate: editing.shipDate ?? "",
                  labelType: "url", labelUrl: editing.labelUrl ?? "", labelFile: null,
                  notes: editing.notes ?? "",
                }}
                onSave={handleEdit}
                onCancel={() => { setEditing(null); setFormErr(""); }}
                saving={saving}
                err={formErr}
              />
            )}

            {loading ? (
              <div style={{ textAlign: "center", color: "#94a3b8", padding: "2rem" }}>Cargando...</div>
            ) : pending.length === 0 ? (
              <Empty icon="✅" text="Sin envíos pendientes" />
            ) : pending.map(o => (
              <OrderCard key={o.id} order={o}
                onDone={() => markDone(o.id)}
                onDelete={() => remove(o.id)}
                onEdit={() => openEdit(o)}
              />
            ))}
          </div>
        )}

        {/* COMPLETADO column — show when view is "both" or "done" */}
        {(view === "both" || view === "done") && (
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              background: "#dcfce7", borderRadius: 12, padding: "0.8rem 1rem",
              marginBottom: "0.9rem", display: "flex", alignItems: "center", gap: "0.5rem",
            }}>
              <span style={{ fontWeight: 800, color: "#166534", fontSize: "0.95rem" }}>🟢 Completado ({done.length})</span>
            </div>

            {loading ? (
              <div style={{ textAlign: "center", color: "#94a3b8", padding: "2rem" }}>Cargando...</div>
            ) : done.length === 0 ? (
              <Empty icon="📦" text="Sin envíos completados" />
            ) : done.map(o => (
              <OrderCard key={o.id} order={o}
                onUndo={() => markPending(o.id)}
                onDelete={() => remove(o.id)}
                onEdit={() => openEdit(o)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
