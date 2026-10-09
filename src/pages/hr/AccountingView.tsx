import type { HrStore } from "./hrStore";
import { ACCOUNTANT } from "./hrData";
import HistoryTable from "./HistoryTable";

// Erika: read-only history of every person's approved months.
export default function AccountingView({ store }: { store: HrStore }) {
  return (
    <div>
      <h2 style={{ marginTop: 0 }}>Hola, {ACCOUNTANT}</h2>
      <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginTop: 0 }}>Historial de cada contratista, mes por mes. Solo aparecen cuentas ya aprobadas por William.</p>
      <HistoryTable store={store} />
    </div>
  );
}
