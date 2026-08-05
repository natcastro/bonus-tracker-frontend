import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import type { LogisticsOrder } from "../types";
import {
  getLogisticsOrders, createLogisticsOrder,
  markLogisticsOrderDone, markLogisticsOrderPending,
  deleteLogisticsOrder, uploadLogisticsLabel,
} from "../services/api";

const STORE_COLORS = ["#1e40af","#15803d","#b45309","#7c3aed","#be185d","#0891b2"];
const STORE_LABELS = ["Tienda 1","Tienda 2","Tienda 3","Tienda 4","Tienda 5","Tienda 6"];

// ── Order card ────────────────────────────────────────────────────────────────
function OrderCard({ order, onDone, onUndo, onDelete }: {
  order: LogisticsOrder;
  onDone?: () => void;
  onUndo?: () => void;
  onDelete: () => void;
}) {
  const isDone = order.status === "done";
  const color = STORE_COLORS[order.storeId - 1] ?? "#64748b";
  const daysOld = Math.floor((Date.now() - new Date(order.createdAt).getTime()) / 86_400_000);
  const overdue = !isDone && daysOld >= 2;

  return (
    <div style={{
      background: isDone ? "#f0fdf4" : overdue ? "#fff7ed" : "#fff",
      border: `1px solid ${isDone ? "#86efac" : overdue ? "#fed7aa" : "#fca5a5"}`,
      borderLeft: `5px solid ${isDone ? "#22c55e" : overdue ? "#ea580c" : "#ef4444"}`,
      borderRadius: 12,
      padding: "1rem 1.1rem",
      marginBottom: "0.75rem",
    }}>
      {/* Top row */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.5rem", flexWrap: "wrap" }}>
        <span style={{ background: color, color: "#fff", borderRadius: 6, padding: "0.15rem 0.55rem", fontSize: "0.7rem", fontWeight: 700 }}>
          {STORE_LABELS[order.storeId - 1]}
        </span>
        {overdue && (
          <span style={{ background: "#7c2d12", color: "#fff", borderRadius: 6, padding: "0.15rem 0.55rem", fontSize: "0.68rem", fontWeight: 700 }}>
            ⚠️ +2 días
          </span>
        )}
        {isDone && (
          <span style={{ background: "#dcfce7", color: "#15803d", borderRadius: 6, padding: "0.15rem 0.55rem", fontSize: "0.68rem", fontWeight: 700 }}>
            ✓ Completado
          </span>
        )}
      </div>

      {/* Article + order number */}
      <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "#0f172a", marginBottom: "0.2rem" }}>{order.article}</div>
      <div style={{ fontSize: "0.8rem", color: "#64748b", marginBottom: "0.15rem" }}>
        Orden: <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#334155" }}>{order.orderNumber}</span>
      </div>
      {order.notes && (
        <div style={{ fontSize: "0.78rem", color: "#64748b", fontStyle: "italic", marginBottom: "0.15rem" }}>{order.notes}</div>
      )}
      <div style={{ fontSize: "0.7rem", color: "#94a3b8", marginBottom: "0.6rem" }}>
        {isDone && order.doneAt
          ? `✓ ${new Date(order.doneAt).toLocaleDateString("es-CO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}`
          : `Creado ${new Date(order.createdAt).toLocaleDateString("es-CO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}`}
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
        {order.labelUrl && (
          <a href={order.labelUrl} target="_blank" rel="noopener noreferrer" style={{
            background: "#0ea5e9", color: "#fff", borderRadius: 7, padding: "0.35rem 0.8rem",
            fontSize: "0.78rem", fontWeight: 700, textDecoration: "none",
          }}>
            📎 Ver Label
          </a>
        )}
        {!isDone && onDone && (
          <button onClick={onDone} style={{
            background: "#16a34a", color: "#fff", border: "none", borderRadius: 7,
            padding: "0.35rem 0.9rem", fontSize: "0.78rem", fontWeight: 700, cursor: "pointer",
          }}>
            ✓ Listo
          </button>
        )}
        {isDone && onUndo && (
          <button onClick={onUndo} style={{
            background: "#f8fafc", color: "#64748b", border: "1px solid #e2e8f0",
            borderRadius: 7, padding: "0.35rem 0.8rem", fontSize: "0.78rem", fontWeight: 600, cursor: "pointer",
          }}>
            ↩ Reabrir
          </button>
        )}
        <button onClick={onDelete} style={{
          background: "#fff0f0", color: "#dc2626", border: "1px solid #fca5a5",
          borderRadius: 7, padding: "0.35rem 0.65rem", fontSize: "0.78rem", cursor: "pointer",
        }}>🗑</button>
      </div>
    </div>
  );
}

// ── Main dashboard ─────────────────────────────────────────────────────────────
export default function LogisticsDashboard() {
  const navigate = useNavigate();
  const [orders, setOrders] = useState<LogisticsOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [storeFilter, setStoreFilter] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState("");

  const [form, setForm] = useState({
    storeId: 1,
    article: "",
    orderNumber: "",
    labelType: "url" as "url" | "file",
    labelUrl: "",
    labelFile: null as File | null,
    notes: "",
  });

  const load = async () => {
    setLoading(true);
    try { setOrders(await getLogisticsOrders()); }
    catch { setOrders([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const logout = () => { sessionStorage.removeItem("team"); navigate("/"); };

  const filtered = storeFilter ? orders.filter(o => o.storeId === storeFilter) : orders;
  const pending = [...filtered.filter(o => o.status === "pending")]
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  const done = [...filtered.filter(o => o.status === "done")]
    .sort((a, b) => new Date(b.doneAt ?? b.createdAt).getTime() - new Date(a.doneAt ?? a.createdAt).getTime());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.article.trim() || !form.orderNumber.trim()) {
      setFormErr("Artículo y número de orden son obligatorios."); return;
    }
    setSaving(true); setFormErr("");
    try {
      let labelUrl: string | undefined;
      if (form.labelType === "url" && form.labelUrl.trim()) {
        labelUrl = form.labelUrl.trim();
      } else if (form.labelType === "file" && form.labelFile) {
        labelUrl = await uploadLogisticsLabel(form.labelFile);
      }
      await createLogisticsOrder({
        storeId: form.storeId, article: form.article.trim(),
        orderNumber: form.orderNumber.trim(), labelUrl, notes: form.notes.trim(),
        status: "pending",
      });
      setForm({ storeId: 1, article: "", orderNumber: "", labelType: "url", labelUrl: "", labelFile: null, notes: "" });
      setShowForm(false);
      await load();
    } catch (err) {
      setFormErr(String(err));
    } finally { setSaving(false); }
  };

  const colStyle: React.CSSProperties = { flex: 1, minWidth: 0 };

  return (
    <div style={{ minHeight: "100vh", background: "#f1f5f9" }}>
      {/* Header */}
      <header style={{
        background: "#fff", borderBottom: "1px solid #e2e8f0",
        padding: "0 1.25rem", height: 58,
        display: "flex", alignItems: "center", gap: "1rem", justifyContent: "space-between",
        position: "sticky", top: 0, zIndex: 50,
      }}>
        <div style={{ fontWeight: 800, fontSize: "1.05rem", color: "#0f172a", whiteSpace: "nowrap" }}>📦 Logística</div>

        {/* Store filter */}
        <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap", alignItems: "center" }}>
          <button onClick={() => setStoreFilter(null)} style={{
            padding: "0.28rem 0.7rem", borderRadius: 20,
            border: "1px solid #e2e8f0",
            background: storeFilter === null ? "#0f172a" : "#fff",
            color: storeFilter === null ? "#fff" : "#374151",
            fontWeight: 700, cursor: "pointer", fontSize: "0.75rem",
          }}>Todas</button>
          {[1,2,3,4,5,6].map(n => (
            <button key={n} onClick={() => setStoreFilter(storeFilter === n ? null : n)} style={{
              padding: "0.28rem 0.7rem", borderRadius: 20,
              border: `1.5px solid ${STORE_COLORS[n-1]}`,
              background: storeFilter === n ? STORE_COLORS[n-1] : "#fff",
              color: storeFilter === n ? "#fff" : STORE_COLORS[n-1],
              fontWeight: 700, cursor: "pointer", fontSize: "0.75rem",
            }}>T{n}</button>
          ))}
        </div>

        <button onClick={logout} style={{
          padding: "0.28rem 0.8rem", borderRadius: 8, border: "1px solid #e2e8f0",
          background: "#fff", cursor: "pointer", fontSize: "0.78rem", color: "#64748b", whiteSpace: "nowrap",
        }}>Salir</button>
      </header>

      {/* Two-column layout */}
      <div style={{ display: "flex", gap: "1rem", padding: "1.25rem", maxWidth: 1300, margin: "0 auto", alignItems: "flex-start" }}>

        {/* ── PENDIENTE ── */}
        <div style={colStyle}>
          {/* Column header */}
          <div style={{
            background: "#fee2e2", borderRadius: 12, padding: "0.85rem 1.1rem",
            marginBottom: "1rem", display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span style={{ fontWeight: 800, color: "#991b1b", fontSize: "1rem" }}>🔴 Pendiente</span>
              <span style={{
                background: "#fca5a5", color: "#7f1d1d", borderRadius: 9999,
                padding: "0.05rem 0.55rem", fontSize: "0.75rem", fontWeight: 700,
              }}>{pending.length}</span>
            </div>
            <button onClick={() => { setShowForm(!showForm); setFormErr(""); }} style={{
              background: "#dc2626", color: "#fff", border: "none", borderRadius: 8,
              padding: "0.38rem 0.9rem", cursor: "pointer", fontWeight: 700, fontSize: "0.82rem",
            }}>
              {showForm ? "✕ Cancelar" : "+ Agregar"}
            </button>
          </div>

          {/* Add form */}
          {showForm && (
            <form onSubmit={handleSubmit} style={{
              background: "#fff", borderRadius: 12, padding: "1.1rem 1.25rem",
              marginBottom: "1rem", border: "2px solid #fca5a5",
              display: "flex", flexDirection: "column", gap: "0.8rem",
            }}>
              <div style={{ fontWeight: 700, color: "#0f172a" }}>Nuevo envío</div>

              {/* Store selector */}
              <div>
                <div style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 700, marginBottom: "0.35rem", letterSpacing: "0.05em" }}>TIENDA</div>
                <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
                  {[1,2,3,4,5,6].map(n => (
                    <button key={n} type="button" onClick={() => setForm(f => ({ ...f, storeId: n }))} style={{
                      padding: "0.38rem 0.8rem", borderRadius: 8,
                      border: `2px solid ${STORE_COLORS[n-1]}`,
                      background: form.storeId === n ? STORE_COLORS[n-1] : "#fff",
                      color: form.storeId === n ? "#fff" : STORE_COLORS[n-1],
                      fontWeight: 700, cursor: "pointer", fontSize: "0.8rem",
                    }}>T{n}</button>
                  ))}
                </div>
              </div>

              {/* Article + Order */}
              <div style={{ display: "flex", gap: "0.65rem" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 700, marginBottom: "0.3rem", letterSpacing: "0.05em" }}>ARTÍCULO *</div>
                  <input
                    value={form.article}
                    onChange={e => setForm(f => ({ ...f, article: e.target.value }))}
                    placeholder="Nombre del artículo"
                    required
                    style={{ width: "100%", padding: "0.5rem 0.7rem", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: "0.88rem", boxSizing: "border-box" }}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 700, marginBottom: "0.3rem", letterSpacing: "0.05em" }}>No. ORDEN *</div>
                  <input
                    value={form.orderNumber}
                    onChange={e => setForm(f => ({ ...f, orderNumber: e.target.value }))}
                    placeholder="Ej: ORD-12345"
                    required
                    style={{ width: "100%", padding: "0.5rem 0.7rem", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: "0.88rem", boxSizing: "border-box" }}
                  />
                </div>
              </div>

              {/* Label */}
              <div>
                <div style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 700, marginBottom: "0.35rem", letterSpacing: "0.05em" }}>LABEL DE ENVÍO</div>
                <div style={{ display: "flex", gap: "0.35rem", marginBottom: "0.5rem" }}>
                  {(["url","file"] as const).map((t, i) => (
                    <button key={t} type="button" onClick={() => setForm(f => ({ ...f, labelType: t }))} style={{
                      padding: "0.3rem 0.75rem", borderRadius: 7, cursor: "pointer", fontSize: "0.78rem", fontWeight: 600,
                      border: "1px solid #e2e8f0",
                      background: form.labelType === t ? "#0f172a" : "#fff",
                      color: form.labelType === t ? "#fff" : "#64748b",
                    }}>{i === 0 ? "🔗 Link" : "📎 Documento"}</button>
                  ))}
                </div>
                {form.labelType === "url" ? (
                  <input
                    type="url"
                    value={form.labelUrl}
                    onChange={e => setForm(f => ({ ...f, labelUrl: e.target.value }))}
                    placeholder="https://..."
                    style={{ width: "100%", padding: "0.5rem 0.7rem", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: "0.88rem", boxSizing: "border-box" }}
                  />
                ) : (
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp"
                    onChange={e => setForm(f => ({ ...f, labelFile: e.target.files?.[0] ?? null }))}
                    style={{ fontSize: "0.85rem" }}
                  />
                )}
              </div>

              {/* Notes */}
              <div>
                <div style={{ fontSize: "0.72rem", color: "#64748b", fontWeight: 700, marginBottom: "0.3rem", letterSpacing: "0.05em" }}>NOTAS (opcional)</div>
                <input
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Instrucciones especiales..."
                  style={{ width: "100%", padding: "0.5rem 0.7rem", border: "1px solid #e2e8f0", borderRadius: 8, fontSize: "0.88rem", boxSizing: "border-box" }}
                />
              </div>

              {formErr && <div style={{ color: "#dc2626", fontSize: "0.82rem", fontWeight: 600 }}>{formErr}</div>}

              <button type="submit" disabled={saving} style={{
                background: "#dc2626", color: "#fff", border: "none", borderRadius: 8,
                padding: "0.6rem", cursor: saving ? "wait" : "pointer",
                fontWeight: 700, fontSize: "0.9rem",
              }}>
                {saving ? "Guardando..." : "📦 Crear Envío"}
              </button>
            </form>
          )}

          {/* Pending list */}
          {loading ? (
            <div style={{ textAlign: "center", color: "#94a3b8", padding: "2rem" }}>Cargando...</div>
          ) : pending.length === 0 ? (
            <div style={{
              textAlign: "center", color: "#94a3b8", padding: "2.5rem 1rem",
              background: "#fff", borderRadius: 12, border: "1px dashed #e2e8f0",
            }}>
              <div style={{ fontSize: "2.5rem" }}>✅</div>
              <div style={{ marginTop: "0.5rem", fontSize: "0.9rem" }}>Sin envíos pendientes</div>
            </div>
          ) : pending.map(o => (
            <OrderCard
              key={o.id} order={o}
              onDone={async () => { await markLogisticsOrderDone(o.id); load(); }}
              onDelete={async () => { if (confirm("¿Eliminar este envío?")) { await deleteLogisticsOrder(o.id); load(); } }}
            />
          ))}
        </div>

        {/* ── COMPLETADO ── */}
        <div style={colStyle}>
          <div style={{
            background: "#dcfce7", borderRadius: 12, padding: "0.85rem 1.1rem",
            marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem",
          }}>
            <span style={{ fontWeight: 800, color: "#166534", fontSize: "1rem" }}>🟢 Completado</span>
            <span style={{
              background: "#86efac", color: "#14532d", borderRadius: 9999,
              padding: "0.05rem 0.55rem", fontSize: "0.75rem", fontWeight: 700,
            }}>{done.length}</span>
          </div>

          {loading ? (
            <div style={{ textAlign: "center", color: "#94a3b8", padding: "2rem" }}>Cargando...</div>
          ) : done.length === 0 ? (
            <div style={{
              textAlign: "center", color: "#94a3b8", padding: "2.5rem 1rem",
              background: "#fff", borderRadius: 12, border: "1px dashed #e2e8f0",
            }}>
              <div style={{ fontSize: "2.5rem" }}>📦</div>
              <div style={{ marginTop: "0.5rem", fontSize: "0.9rem" }}>Sin envíos completados</div>
            </div>
          ) : done.map(o => (
            <OrderCard
              key={o.id} order={o}
              onUndo={async () => { await markLogisticsOrderPending(o.id); load(); }}
              onDelete={async () => { if (confirm("¿Eliminar este envío?")) { await deleteLogisticsOrder(o.id); load(); } }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
