import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import * as XLSX from "xlsx";
import type { DevolucionesUpload, DevolucionesRow } from "../types";
import { getDevolucionesUploads, getDevolucionesRows, createDevolucionesUpload, deleteDevolucionesUpload } from "../services/api";

const COLOR = "#be123c";

export default function DevolucionesDashboard() {
  const navigate = useNavigate();
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
    try {
      const buf = await file.arrayBuffer();
      // raw:true keeps every cell as its literal text — without it, long numeric IDs
      // (order IDs, SKU IDs) get parsed as JS numbers and lose precision past ~15-16 digits.
      const wb = XLSX.read(buf, { type: "array", raw: true });
      const rawJson: Record<string, unknown>[] = wb.SheetNames.flatMap((name) =>
        XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[name], { defval: "", raw: true })
      );
      if (rawJson.length === 0) { setUploadErr("El archivo no tiene filas."); return; }
      const json: Record<string, string>[] = rawJson.map((row) =>
        Object.fromEntries(Object.entries(row).map(([k, v]) => [k, String(v ?? "").trim()]))
      );
      const columns = Array.from(new Set(json.flatMap((row) => Object.keys(row))));
      await createDevolucionesUpload(file.name, columns, json.map((data) => ({ data })));
      await load();
    } catch {
      setUploadErr("No se pudo leer el archivo. Verifica que sea un Excel (.xlsx/.xls) o CSV válido.");
    } finally {
      setUploading(false);
    }
  };

  const removeUpload = async (id: number) => {
    await deleteDevolucionesUpload(id);
    await load();
  };

  // Union of every column seen across all uploads, in first-seen order.
  const allColumns = useMemo(() => {
    const cols: string[] = [];
    for (const u of uploads) {
      for (const c of u.columns) if (!cols.includes(c)) cols.push(c);
    }
    return cols;
  }, [uploads]);

  const uploadById = useMemo(() => new Map(uploads.map((u) => [u.id, u])), [uploads]);

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
                  <th>Archivo</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((r) => (
                  <tr key={r.id}>
                    {allColumns.map((c) => <td key={c}>{r.data[c] ?? ""}</td>)}
                    <td style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>{uploadById.get(r.uploadId)?.filename ?? "—"}</td>
                  </tr>
                ))}
                {filteredRows.length === 0 && (
                  <tr><td colSpan={allColumns.length + 1} style={{ textAlign: "center", color: "var(--text-muted)" }}>Sin resultados</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  );
}
