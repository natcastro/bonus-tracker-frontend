import type { HrStore } from "./hrStore";
import { ACCOUNTANT } from "./hrData";
import HistoryTable from "./HistoryTable";
import { PageHeader } from "./ui";

// Erika: read-only history of every person's approved months.
export default function AccountingView({ store }: { store: HrStore }) {
  return (
    <div>
      <PageHeader role="accounting" name={ACCOUNTANT} title={`Hola, ${ACCOUNTANT}`} chip="Contabilidad" subtitle="Historial de cada contratista, mes por mes. Solo aparecen cuentas ya aprobadas por William." />
      <HistoryTable store={store} />
    </div>
  );
}
