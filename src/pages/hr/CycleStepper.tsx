import type { Contractor, Cycle } from "./hrData";
import { HR_HEAD, approvalsComplete, monthlyDecisionDone } from "./hrData";

// The path every cycle follows, with a marker on where it is now and who is holding it.
export default function CycleStepper({ c, cy, supervisorName }: { c: Contractor; cy: Cycle; supervisorName: string }) {
  const approved = cy.status === "aprobada";
  const withHr = cy.status === "con_hr";
  const supDone = withHr || approved;
  const steps: { label: string; who: string; state: "done" | "current" | "todo"; detail?: string }[] = [
    { label: "Llena y firma", who: c.legalName.split(" ")[0], state: cy.closed || supDone ? "done" : "current" },
    {
      label: "Aprueba y confirma el bono", who: supervisorName, state: supDone ? "done" : cy.closed ? "current" : "todo",
      detail: !supDone && cy.closed ? `${approvalsComplete(c, cy) ? "✓" : "○"} aprobaciones · ${monthlyDecisionDone(c, cy) ? "✓" : "○"} ${c.payType === "variable" ? "monto variable" : "bono"}` : undefined,
    },
    { label: "Revisión final", who: HR_HEAD, state: approved ? "done" : withHr ? "current" : "todo" },
    { label: "Registrada en el historial", who: "Contabilidad ve el pago", state: approved ? "done" : "todo" },
  ];
  return (
    <ol className="hr-stepper" aria-label="Avance del ciclo">
      {steps.map((s, i) => (
        <li key={i} className={`hr-step hr-step--${s.state}`} aria-current={s.state === "current" ? "step" : undefined}>
          <span className="hr-step__dot">{s.state === "done" ? "✓" : i + 1}</span>
          <span className="hr-step__text">
            <strong>{s.label}</strong>
            <span>{s.who}{s.detail ? ` · ${s.detail}` : ""}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
