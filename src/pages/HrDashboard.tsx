import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { UsersIcon } from "../components/icons";
import type { Contractor, Invoice } from "./hr/hrData";
import {
  SEED_CONTRACTORS, SEED_INVOICES, HR_HEAD, STATUS_LABEL, formatMoney, invoiceFileName, invoiceTotals,
  maskAccount, monthInfo, nextInvoiceNumber, pad4,
} from "./hr/hrData";
import ContractorModal from "./hr/ContractorModal";
import InvoiceEditor from "./hr/InvoiceEditor";
import InvoicePreview from "./hr/InvoicePreview";

const COLOR = "#0f766e";
const STATUS_BADGE: Record<Invoice["status"], string> = { borrador: "badge-warning", con_supervisor: "badge-warning", devuelta: "badge-danger", aprobada: "badge-success" };

type Tab = "contractors" | "invoices";

// PROTOTYPE — fake data, everything lives in memory and disappears on refresh. The real version will
// store contractors/invoices server-side with encrypted bank/tax data (see the HR plan).
export default function HrDashboard() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("contractors");
  const [contractors, setContractors] = useState<Contractor[]>(SEED_CONTRACTORS);
  const [invoices, setInvoices] = useState<Invoice[]>(SEED_INVOICES);
  const [showNew, setShowNew] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editingFor, setEditingFor] = useState<number | null>(null);
  const [viewInvoiceId, setViewInvoiceId] = useState<number | null>(null);
  const [notice, setNotice] = useState("");

  const selected = contractors.find(c => c.id === selectedId) ?? null;
  const editing = contractors.find(c => c.id === editingFor) ?? null;
  const viewInvoice = invoices.find(i => i.id === viewInvoiceId) ?? null;
  const byId = (id: number) => contractors.find(c => c.id === id)!;

  const saveInvoice = (base: Omit<Invoice, "id" | "status">, status: Invoice["status"]) => {
    setInvoices(prev => [...prev, { ...base, id: Math.max(0, ...prev.map(i => i.id)) + 1, status }]);
    setEditingFor(null);
    setTab("invoices");
    setNotice(status === "borrador"
      ? "Borrador guardado."
      : `Enviada para aprobación. En la versión real, ${byId(base.contractorId).supervisor ?? HR_HEAD} recibe un correo con el enlace para revisarla.`);
  };

  const decide = (inv: Invoice, approve: boolean) => {
    setInvoices(prev => prev.map(i => {
      if (i.id !== inv.id) return i;
      if (!approve) return { ...i, status: "devuelta", supervisorNote: "Revisa la descripción y vuelve a enviarla." };
      return { ...i, status: "aprobada", number: nextInvoiceNumber(prev, i.contractorId) };
    }));
    setNotice(approve
      ? `Aprobada. En la versión real se envía el PDF a usahr@formatucuerpo.com, el contratista recibe su copia y ${HR_HEAD} la ve lista para pasarla a Erika.`
      : "Devuelta al contratista con un comentario. Conserva su número consecutivo.");
  };

  return (
    <div>
      <nav className="top-nav">
        <div className="logo">FTC Hub — <span style={{ color: COLOR }}>HR</span></div>
        <ul className="nav-links">
          {([["contractors", "Contratistas"], ["invoices", "Cuentas de cobro"]] as [Tab, string][]).map(([k, l]) => (
            <li key={k} className={tab === k ? "active" : ""} onClick={() => { setTab(k); setEditingFor(null); setSelectedId(null); setViewInvoiceId(null); }}>{l}</li>
          ))}
        </ul>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate("/")}>← Volver al Hub</button>
          <button className="btn btn-secondary btn-sm" onClick={() => { sessionStorage.clear(); navigate("/"); }}>Logout</button>
        </div>
      </nav>

      <main className="content-area">
        <div style={{ background: "#fef3c7", color: "#92400e", borderRadius: 8, padding: "0.6rem 1rem", fontSize: "0.85rem", fontWeight: 600, marginBottom: "1rem" }}>
          🧪 Página de prueba — todos los datos son falsos y no se guardan. Al recargar vuelve al inicio.
        </div>
        {notice && (
          <div style={{ background: "#dcfce7", color: "#166534", borderRadius: 8, padding: "0.6rem 1rem", fontSize: "0.85rem", marginBottom: "1rem", display: "flex", justifyContent: "space-between", gap: 10 }}>
            <span>{notice}</span><button onClick={() => setNotice("")} style={{ background: "none", border: "none", cursor: "pointer", fontWeight: 700 }}>×</button>
          </div>
        )}

        {/* ── Invoice editor ── */}
        {editing && (
          <InvoiceEditor contractor={editing} invoices={invoices} onCancel={() => setEditingFor(null)}
            onSubmit={inv => saveInvoice(inv, "con_supervisor")} onSaveDraft={inv => saveInvoice(inv, "borrador")} />
        )}

        {/* ── Read-only invoice view ── */}
        {!editing && viewInvoice && (
          <div>
            <button className="btn btn-secondary btn-sm" onClick={() => setViewInvoiceId(null)} style={{ marginBottom: 10 }}>← Volver</button>
            <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
              Archivo: <code>{invoiceFileName(byId(viewInvoice.contractorId), viewInvoice.number, viewInvoice.year, viewInvoice.month)}</code> · Estado: {STATUS_LABEL[viewInvoice.status]}
            </p>
            <InvoicePreview c={byId(viewInvoice.contractorId)} inv={viewInvoice} number={viewInvoice.number} />
          </div>
        )}

        {/* ── Contractor profile ── */}
        {!editing && !viewInvoice && tab === "contractors" && selected && (
          <div>
            <button className="btn btn-secondary btn-sm" onClick={() => setSelectedId(null)} style={{ marginBottom: 10 }}>← Todos los contratistas</button>
            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                <h3 style={{ margin: 0 }}>{selected.legalName}</h3>
                <button className="btn btn-primary" onClick={() => setEditingFor(selected.id)}>+ Crear cuenta de cobro</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "0.35rem 1.5rem", marginTop: 14, fontSize: "0.9rem" }}>
                <div><strong>Correo personal:</strong> {selected.email}</div>
                <div><strong>Teléfono:</strong> {selected.phone}</div>
                <div><strong>Dirección:</strong> {selected.address}, {selected.country}</div>
                <div><strong>Tax ID:</strong> {selected.taxId}</div>
                <div><strong>Pago:</strong> {selected.payType === "hourly" ? `Por horas — ${formatMoney(selected.hourlyRate, selected.currency)}/h` : `Monto base — ${formatMoney(selected.baseAmount, selected.currency)}`}</div>
                <div><strong>Supervisor:</strong> {selected.supervisor ?? `Sin supervisor (aprueba ${HR_HEAD})`}</div>
              </div>
              <h4 style={{ margin: "1.25rem 0 0.4rem" }}>Información de pago</h4>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "0.35rem 1.5rem", fontSize: "0.9rem" }}>
                <div><strong>Banco:</strong> {selected.bank.bankName} ({selected.bank.bankCountry})</div>
                <div><strong>SWIFT:</strong> {selected.bank.swift}</div>
                <div><strong>Titular:</strong> {selected.bank.holder}</div>
                <div><strong>Cuenta:</strong> {selected.bank.accountType} {maskAccount(selected.bank.accountNumber)}</div>
              </div>
              <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: 0 }}>🔒 En la versión real estos datos se guardan cifrados y solo se muestran enmascarados.</p>
            </div>
            <div className="card">
              <h4 style={{ marginTop: 0 }}>Historial de cuentas de cobro</h4>
              {invoices.filter(i => i.contractorId === selected.id).length === 0
                ? <p style={{ color: "var(--text-muted)", margin: 0 }}>Todavía no hay cuentas de cobro. La primera será la <strong>{pad4(nextInvoiceNumber(invoices, selected.id))}</strong>.</p>
                : <InvoiceTable rows={invoices.filter(i => i.contractorId === selected.id)} byId={byId} onView={setViewInvoiceId} onDecide={decide} />}
            </div>
          </div>
        )}

        {/* ── Contractors list ── */}
        {!editing && !viewInvoice && tab === "contractors" && !selected && (
          <section>
            <header className="section-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
              <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}><UsersIcon size={22} color={COLOR} /> Contratistas</h2>
              <button className="btn btn-primary" onClick={() => setShowNew(true)}>+ Nuevo contratista</button>
            </header>
            <div className="card" style={{ overflowX: "auto" }}>
              <table className="data-table">
                <thead><tr><th>Nombre</th><th>Pago</th><th>Moneda</th><th>Supervisor</th><th>Próximo #</th><th /></tr></thead>
                <tbody>
                  {contractors.map(c => (
                    <tr key={c.id}>
                      <td><strong>{c.legalName}</strong><div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{c.email}</div></td>
                      <td>{c.payType === "hourly" ? `Por horas (${formatMoney(c.hourlyRate, c.currency)}/h)` : `Fijo (${formatMoney(c.baseAmount, c.currency)})`}</td>
                      <td>{c.currency}</td>
                      <td>{c.supervisor ?? `${HR_HEAD} (sin supervisor)`}</td>
                      <td>{pad4(nextInvoiceNumber(invoices, c.id))}</td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => setSelectedId(c.id)}>Ver perfil</button>{" "}
                        <button className="btn btn-primary btn-sm" onClick={() => setEditingFor(c.id)}>Crear cuenta de cobro</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* ── All invoices ── */}
        {!editing && !viewInvoice && tab === "invoices" && (
          <section>
            <header className="section-header"><h2>Cuentas de cobro</h2></header>
            <div className="card" style={{ overflowX: "auto" }}>
              {invoices.length === 0 ? <p style={{ margin: 0, color: "var(--text-muted)" }}>Aún no hay cuentas de cobro.</p>
                : <InvoiceTable rows={[...invoices].reverse()} byId={byId} onView={setViewInvoiceId} onDecide={decide} showPerson />}
            </div>
          </section>
        )}
      </main>

      {showNew && (
        <ContractorModal onClose={() => setShowNew(false)} onSave={c => {
          setContractors(prev => [...prev, { ...c, id: Math.max(0, ...prev.map(x => x.id)) + 1 }]);
          setShowNew(false);
          setNotice(`Contratista creado: ${c.legalName}. Su primera cuenta de cobro será la 0001.`);
        }} />
      )}
    </div>
  );
}

function InvoiceTable({ rows, byId, onView, onDecide, showPerson }: {
  rows: Invoice[]; byId: (id: number) => Contractor; onView: (id: number) => void; onDecide: (inv: Invoice, approve: boolean) => void; showPerson?: boolean;
}) {
  return (
    <table className="data-table">
      <thead><tr>{showPerson && <th>Contratista</th>}<th>#</th><th>Mes</th><th>Total</th><th>Estado</th><th /></tr></thead>
      <tbody>
        {rows.map(i => {
          const c = byId(i.contractorId);
          return (
            <tr key={i.id}>
              {showPerson && <td>{c.legalName}</td>}
              <td>{pad4(i.number)}</td>
              <td>{monthInfo(i.year, i.month).name} {i.year}</td>
              <td>{formatMoney(invoiceTotals(c, i).total, c.currency)}</td>
              <td><span className={`badge ${STATUS_BADGE[i.status]}`}>{STATUS_LABEL[i.status]}</span></td>
              <td style={{ whiteSpace: "nowrap" }}>
                <button className="btn btn-secondary btn-sm" onClick={() => onView(i.id)}>Ver</button>
                {i.status === "con_supervisor" && (<>
                  {" "}<button className="btn btn-primary btn-sm" onClick={() => onDecide(i, true)} title="Simula lo que hace el supervisor">Aprobar (como {c.supervisor ?? HR_HEAD})</button>
                  {" "}<button className="btn btn-secondary btn-sm" onClick={() => onDecide(i, false)}>Devolver</button>
                </>)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
