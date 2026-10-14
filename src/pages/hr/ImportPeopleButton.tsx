import { useRef, useState } from "react";
import type { HrStore } from "./hrStore";

// Loads HR's Excel into this browser tab (nothing is sent anywhere or saved in the code).
export default function ImportPeopleButton({ store, label, primary, onDone }: { store: HrStore; label: string; primary?: boolean; onDone?: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async (f: File) => {
    setErr("");
    if (store.imported && !window.confirm("Esto reemplaza a las personas cargadas ahora. ¿Continuar?")) return;
    setBusy(true);
    try {
      const [XLSX, { parseContractorsSheet }] = await Promise.all([import("xlsx"), import("./hrImport")]);
      const r = parseContractorsSheet(XLSX, XLSX.read(await f.arrayBuffer(), { type: "array" }));
      store.loadPeople(r.contractors, r.supervisors, r.report);
      onDone?.();
    } catch (e: any) {
      setErr(e?.message ?? "No pude leer ese archivo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <span>
      <button className={`btn ${primary ? "btn-primary" : "btn-secondary"}`} disabled={busy} onClick={() => ref.current?.click()}>{busy ? "Leyendo el Excel…" : label}</button>
      <input ref={ref} type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) load(f); e.target.value = ""; }} />
      {err && <div className="error-msg" style={{ marginTop: 6 }}>{err}</div>}
    </span>
  );
}
