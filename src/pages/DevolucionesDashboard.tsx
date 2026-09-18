import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import type { DevolucionesUpload, DevolucionesRow } from "../types";
import { getDevolucionesUploads, getDevolucionesRows, createDevolucionesUpload, deleteDevolucionesUpload, updateDevolucionesRowStatus } from "../services/api";
import { useHubAccess } from "../auth/HubAccessContext";

const COLOR = "#be123c";
const UPLOAD_ALLOWED_EMAIL = "amazonassistant@formatucuerpo.com";

// Only these columns are kept from an uploaded file — everything else in the
// source export is dropped on upload.
const WANTED_COLUMNS = ["Return Order ID", "Order ID", "Seller SKU", "Return Logistics Tracking ID"];

export default function DevolucionesDashboard() {
  const navigate = useNavigate();
  const { email } = useHubAccess();
  const canUpload = email.toLowerCase() === UPLOAD_ALLOWED_EMAIL;
  const [uploads, setUploads] = useState<DevolucionesUpload[]>([]);
  const [rows, setRows] = useState<DevolucionesRow[]>([]);
  const [search, setSearch] = useState("");
  const [uploadErr, setUploadErr] = useState("");
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    const [u, r] = await Promise.all([getDevolucionesUploads(), getDevolucionesRows()]);
    setUploads(u);
    setRows(r);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleFile = async (file: File) => {
    setUploadErr("");
    setUploading(true);
    let columns: string[] = [];
    let json: Record<string, string>[] = [];
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
      json = trimmed.map((row) => Object.fromEntries(columns.map((c) => [c, row[c] ?? ""])));
    } catch (err: any) {
      setUploadErr(`No se pudo leer el archivo. Verifica que sea un Excel (.xlsx/.xls) o CSV válido. (${err?.message ?? "error desconocido"})`);
      setUploading(false);
      return;
    }
    try {
      await createDevolucionesUpload(file.name, columns, json.map((data) => ({ data })));
      await load();
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

  // Click cycles a row through: none → green → red → none.
  const cycleRowStatus = async (row: DevolucionesRow) => {
    const next: "green" | "red" | null = row.status === null ? "green" : row.status === "green" ? "red" : null;
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, status: next } : r)));
    try {
      await updateDevolucionesRowStatus(row.id, next);
    } catch {
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, status: row.status } : r)));
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
    if (!q) return rows;
    return rows.filter((r) => Object.values(r.data).some((v) => String(v ?? "").toLowerCase().includes(q)));
  }, [rows, search]);

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
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              disabled={uploading}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
            />
            {uploading && <p style={{ marginTop: "0.5rem", color: "var(--text-muted)", fontSize: "0.85rem" }}>Subiendo…</p>}
            {uploadErr && <p className="error-msg">{uploadErr}</p>}

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
                  {allColumns.map((c) => <th key={c}>{c}</th>)}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => cycleRowStatus(r)}
                    title="Click para marcar: verde → rojo → sin marcar"
                    style={{
                      cursor: "pointer",
                      background: r.status === "green" ? "#dcfce7" : r.status === "red" ? "#fee2e2" : undefined,
                    }}
                  >
                    {allColumns.map((c) => <td key={c}>{r.data[c] ?? ""}</td>)}
                  </tr>
                ))}
                {filteredRows.length === 0 && (
                  <tr><td colSpan={allColumns.length} style={{ textAlign: "center", color: "var(--text-muted)" }}>Sin resultados</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  );
}
