import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import type { DevolucionesUpload, DevolucionesRow } from "../types";
import { getDevolucionesUploads, getDevolucionesRows, createDevolucionesUpload, deleteDevolucionesUpload, deleteDevolucionesRows, updateDevolucionesRowCompleted } from "../services/api";
import { useHubAccess } from "../auth/HubAccessContext";

const COLOR = "#be123c";
const UPLOAD_ALLOWED_EMAIL = "amazonassistant@formatucuerpo.com";

// Only these columns are kept from an uploaded file — everything else in the
// source export is dropped on upload.
const WANTED_COLUMNS = ["Return Order ID", "Order ID", "Seller SKU", "Return Logistics Tracking ID"];

// Uploaded exports commonly overlap in date range, so the same return shows up again —
// this is the field that uniquely identifies a return, used to skip re-adding it.
const DEDUPE_KEY = "Return Order ID";

const TAG_LABELS: Record<"devolucion" | "cambio", string> = { devolucion: "Devolución / Reembolso", cambio: "Cambio / Exchange" };
const TAG_COLORS: Record<"devolucion" | "cambio", { bg: string; fg: string }> = {
  devolucion: { bg: "#fee2e2", fg: "#991b1b" },
  cambio: { bg: "#dbeafe", fg: "#1e40af" },
};

export default function DevolucionesDashboard() {
  const navigate = useNavigate();
  const { email } = useHubAccess();
  const canUpload = email.toLowerCase() === UPLOAD_ALLOWED_EMAIL;
  const [uploads, setUploads] = useState<DevolucionesUpload[]>([]);
  const [rows, setRows] = useState<DevolucionesRow[]>([]);
  const [view, setView] = useState<"pending" | "completed">("pending");
  const [search, setSearch] = useState("");
  const [uploadTag, setUploadTag] = useState<"devolucion" | "cambio" | "">("");
  const [uploadErr, setUploadErr] = useState("");
  const [uploadInfo, setUploadInfo] = useState("");
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    const [u, r] = await Promise.all([getDevolucionesUploads(), getDevolucionesRows()]);
    setUploads(u);
    setRows(r);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleFile = async (file: File) => {
    if (!uploadTag) { setUploadErr("Elige si este archivo es de Devolución/Reembolso o Cambio/Exchange antes de subirlo."); return; }
    setUploadErr("");
    setUploadInfo("");
    setUploading(true);
    let columns: string[] = [];
    let newRows: { data: Record<string, string>; completed?: boolean }[] = [];
    let replacedIds: number[] = [];
    let skippedCount = 0;
    try {
      const buf = await file.arrayBuffer();
      // raw:true keeps every cell as its literal text — without it, long numeric IDs
      // (order IDs, SKU IDs) get parsed as JS numbers and lose precision past ~15-16 digits.
      const wb = XLSX.read(buf, { type: "array", raw: true });
      const rawJson: Record<string, unknown>[] = wb.SheetNames.flatMap((name) =>
        XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[name], { defval: "", raw: true })
      );
      if (rawJson.length === 0) { setUploadErr("El archivo no tiene filas."); setUploading(false); return; }
      const trimmed: Record<string, string>[] = rawJson.map((row) =>
        Object.fromEntries(Object.entries(row).map(([k, v]) => [k, String(v ?? "").trim()]))
      );
      columns = WANTED_COLUMNS.filter((c) => trimmed.some((row) => c in row));
      if (columns.length === 0) { setUploadErr(`El archivo no tiene ninguna de las columnas esperadas: ${WANTED_COLUMNS.join(", ")}.`); setUploading(false); return; }
      const allRows = trimmed.map((row) => Object.fromEntries(columns.map((c) => [c, row[c] ?? ""])));
      // A row whose key already exists WITHOUT a tag (uploaded before tags existed) gets
      // replaced by this new tagged row, carrying over its completed status. A row whose key
      // already has a tag is a real duplicate and gets skipped, same as within this same file.
      const existingByKey = new Map(rows.filter((r) => r.data[DEDUPE_KEY]).map((r) => [r.data[DEDUPE_KEY], r]));
      const seenInFile = new Set<string>();
      newRows = [];
      allRows.forEach((row) => {
        const key = row[DEDUPE_KEY];
        if (!key) { newRows.push({ data: row }); return; }
        if (seenInFile.has(key)) { skippedCount++; return; }
        const existing = existingByKey.get(key);
        if (existing) {
          if (existing.tag) { skippedCount++; return; }
          replacedIds.push(existing.id);
          newRows.push({ data: row, completed: existing.completed });
        } else {
          newRows.push({ data: row });
        }
        seenInFile.add(key);
      });
      if (newRows.length === 0) { setUploadErr("Todas las filas de este archivo ya estaban cargadas (duplicados)."); setUploading(false); return; }
    } catch (err: any) {
      setUploadErr(`No se pudo leer el archivo. Verifica que sea un Excel (.xlsx/.xls) o CSV válido. (${err?.message ?? "error desconocido"})`);
      setUploading(false);
      return;
    }
    try {
      if (replacedIds.length > 0) await deleteDevolucionesRows(replacedIds);
      await createDevolucionesUpload(file.name, columns, newRows, uploadTag);
      await load();
      const parts = [`Se agregaron ${newRows.length} filas nuevas con el tag "${TAG_LABELS[uploadTag]}".`];
      if (replacedIds.length > 0) parts.push(`${replacedIds.length} reemplazaron filas antiguas sin tag.`);
      if (skippedCount > 0) parts.push(`Se omitieron ${skippedCount} duplicadas.`);
      setUploadInfo(parts.join(" "));
    } catch (err: any) {
      setUploadErr(`El archivo se leyó bien, pero no se pudo guardar en la base de datos: ${err?.message ?? "error desconocido"}`);
    } finally {
      setUploading(false);
    }
  };

  const removeUpload = async (id: number) => {
    await deleteDevolucionesUpload(id);
    await load();
  };

  // Checking a row moves it out of Pendientes and into Completados (and back if unchecked).
  const toggleRowCompleted = async (row: DevolucionesRow, completed: boolean) => {
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, completed } : r)));
    try {
      await updateDevolucionesRowCompleted(row.id, completed);
    } catch {
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, completed: row.completed } : r)));
    }
  };

  // Union of every column seen across all uploads, in first-seen order.
  const allColumns = useMemo(() => {
    const cols: string[] = [];
    for (const u of uploads) {
      for (const c of u.columns) if (!cols.includes(c)) cols.push(c);
    }
    return cols;
  }, [uploads]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((r) => (view === "completed" ? r.completed : !r.completed))
      .filter((r) => !q || Object.values(r.data).some((v) => String(v ?? "").toLowerCase().includes(q)))
      // Devolución/Reembolso rows are urgent — surface them first.
      .sort((a, b) => (a.tag === "devolucion" ? 0 : 1) - (b.tag === "devolucion" ? 0 : 1));
  }, [rows, search, view]);

  const pendingCount = useMemo(() => rows.filter((r) => !r.completed).length, [rows]);
  const completedCount = useMemo(() => rows.filter((r) => r.completed).length, [rows]);

  return (
    <div>
      <nav className="top-nav">
        <div className="logo">Bonus Tracker — <span style={{ color: COLOR }}>Devoluciones</span></div>
        <div />
        <button className="btn btn-secondary btn-sm" onClick={() => { sessionStorage.clear(); navigate("/"); }}>Logout</button>
      </nav>

      <main className="content-area">
        <header className="section-header"><h2>Devoluciones</h2></header>

        {canUpload && (
          <div className="card">
            <h3 style={{ marginBottom: "0.75rem" }}>Subir archivo</h3>
            <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "1rem" }}>
              Sube un Excel (.xlsx/.xls) o CSV. Las columnas se detectan automáticamente y se agregan a la tabla de abajo.
            </p>
            <div style={{ marginBottom: "0.75rem" }}>
              <label style={{ fontSize: "0.85rem", fontWeight: 600, display: "block", marginBottom: "0.35rem" }}>Tipo de archivo</label>
              <select className="form-control" style={{ maxWidth: 280 }} value={uploadTag} onChange={(e) => setUploadTag(e.target.value as any)}>
                <option value="">Selecciona un tipo...</option>
                <option value="devolucion">{TAG_LABELS.devolucion}</option>
                <option value="cambio">{TAG_LABELS.cambio}</option>
              </select>
            </div>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              disabled={uploading}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
            />
            {uploading && <p style={{ marginTop: "0.5rem", color: "var(--text-muted)", fontSize: "0.85rem" }}>Subiendo…</p>}
            {uploadErr && <p className="error-msg">{uploadErr}</p>}
            {uploadInfo && <p style={{ marginTop: "0.5rem", color: "var(--text-muted)", fontSize: "0.85rem" }}>{uploadInfo}</p>}

            {uploads.length > 0 && (
              <div style={{ marginTop: "1rem" }}>
                <h4 style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "0.5rem" }}>Archivos subidos</h4>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                  {uploads.map((u) => (
                    <div key={u.id} className="badge" style={{ background: "#f1f5f9", color: "#334155", border: "none", display: "flex", alignItems: "center", gap: 8, padding: "0.4rem 0.75rem" }}>
                      <span>{u.filename} ({new Date(u.uploadedAt).toLocaleDateString()})</span>
                      <button
                        onClick={() => removeUpload(u.id)}
                        title="Eliminar este archivo y sus filas"
                        style={{ background: "none", border: "none", cursor: "pointer", color: "#991b1b", fontWeight: 700, lineHeight: 1 }}
                      >×</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem" }}>
          <button className={`btn btn-sm ${view === "pending" ? "btn-primary" : "btn-secondary"}`}
            style={view === "pending" ? { background: COLOR } : {}}
            onClick={() => setView("pending")}>
            Pendientes ({pendingCount})
          </button>
          <button className={`btn btn-sm ${view === "completed" ? "btn-primary" : "btn-secondary"}`}
            style={view === "completed" ? { background: COLOR } : {}}
            onClick={() => setView("completed")}>
            Completados ({completedCount})
          </button>
        </div>

        <div className="card" style={{ overflowX: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem", flexWrap: "wrap", gap: "0.5rem" }}>
            <h3>Registros ({filteredRows.length})</h3>
            <input
              type="text"
              className="form-control"
              placeholder="Buscar por nombre, número de orden, tracking, caja..."
              style={{ maxWidth: 360 }}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {allColumns.length === 0 ? (
            <p style={{ textAlign: "center", color: "var(--text-muted)", padding: "2rem 0" }}>Sube un archivo para ver los registros aquí.</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th></th>
                  <th>Tipo</th>
                  {allColumns.map((c) => <th key={c}>{c}</th>)}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r) => (
                  <tr key={r.id} style={r.tag === "devolucion" && !r.completed ? { background: "#fef2f2" } : undefined}>
                    <td>
                      <input
                        type="checkbox"
                        checked={r.completed}
                        onChange={(e) => toggleRowCompleted(r, e.target.checked)}
                        title={view === "pending" ? "Marcar como completado" : "Devolver a pendientes"}
                      />
                    </td>
                    <td>
                      {r.tag ? (
                        r.tag === "devolucion" ? (
                          <span className="badge" title="Urgente — atender lo antes posible" style={{ background: "#fecaca", color: "#7f1d1d", border: "none", fontSize: "0.72rem", fontWeight: 700 }}>
                            ⚠️ {TAG_LABELS.devolucion} — URGENTE
                          </span>
                        ) : (
                          <span className="badge" style={{ background: TAG_COLORS[r.tag].bg, color: TAG_COLORS[r.tag].fg, border: "none", fontSize: "0.72rem" }}>
                            {TAG_LABELS[r.tag]}
                          </span>
                        )
                      ) : (
                        <span style={{ color: "var(--text-muted)", fontSize: "0.72rem" }}>—</span>
                      )}
                    </td>
                    {allColumns.map((c) => <td key={c}>{r.data[c] ?? ""}</td>)}
                  </tr>
                ))}
                {filteredRows.length === 0 && (
                  <tr><td colSpan={allColumns.length + 2} style={{ textAlign: "center", color: "var(--text-muted)" }}>Sin resultados</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  );
}
