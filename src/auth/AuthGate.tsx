import { useMsal, AuthenticatedTemplate, UnauthenticatedTemplate } from "@azure/msal-react";
import { InteractionStatus } from "@azure/msal-browser";
import type { ReactNode } from "react";
import { loginRequest } from "./msalConfig";
import { HubAccessProvider, useHubAccess } from "./HubAccessContext";

const TEAM_LABELS: Record<string, string> = {
  MEX: "FTC México", OPS: "Operations", APT: "Strategy", TKLIVES: "TikTok Lives",
  CSQUALITY: "Operational Tools", MGMT: "Management", LOGISTICS: "Logística", MARKETING: "Marketing", HR: "HR",
};

function viewAsLabel(team: string, role: string): string {
  const teamLabel = TEAM_LABELS[team] ?? team;
  if (team === "MARKETING") {
    const label = role === "admin" ? "Laura" : role === "carol" ? "Karol" : "Diseño";
    return `${teamLabel} — ${label}`;
  }
  if (team === "HR") {
    const label = role === "admin" ? "William (jefe de HR)" : role === "accounting" ? "Contabilidad" : role === "supervisor" ? "Supervisor" : "Contratista";
    return `${teamLabel} — ${label}`;
  }
  return `${teamLabel} — ${role === "admin" ? "Administrador" : "Staff"}`;
}

function ViewAsBanner() {
  const { viewAs, stopViewAs } = useHubAccess();
  if (!viewAs) return null;
  return (
    <div style={{
      position: "sticky", top: 0, zIndex: 9999, background: "#78350F", color: "#fff",
      fontSize: "0.8rem", fontWeight: 500, padding: "0.5rem 1rem",
      display: "flex", alignItems: "center", justifyContent: "center", gap: "0.75rem",
    }}>
      <span>👀 Vista previa — viendo el Hub como: {viewAsLabel(viewAs.team, viewAs.role)}</span>
      <button
        onClick={stopViewAs}
        style={{
          background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.4)", color: "#fff",
          borderRadius: 0, padding: "0.2rem 0.65rem", fontSize: "0.75rem", fontWeight: 700, cursor: "pointer",
        }}
      >
        Salir de vista previa
      </button>
    </div>
  );
}

function LoginScreen() {
  const { instance, inProgress } = useMsal();
  return (
    <div style={{
      minHeight: "100vh", background: "var(--paper)", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", padding: "2rem",
    }}>
      <div className="eyebrow" style={{ marginBottom: "0.75rem" }}>[ Forma tu Cuerpo ]</div>
      <h1 style={{ fontSize: "3.25rem", fontWeight: 600, color: "var(--ink)", letterSpacing: "-0.045em", lineHeight: 1, margin: "0 0 2rem" }}>FTC Hub</h1>
      <button
        onClick={() => {
          const path = window.location.pathname + window.location.search;
          instance.loginRedirect(path && path !== "/" ? { ...loginRequest, state: path } : loginRequest);
        }}
        disabled={inProgress !== InteractionStatus.None}
        className="btn btn-primary"
        style={{ padding: "0.7rem 1.25rem", fontSize: "0.925rem" }}
      >
        {inProgress !== InteractionStatus.None ? "Redirigiendo…" : "Entrar con Microsoft"}
      </button>
      <p style={{ marginTop: "1.25rem", fontSize: "0.8rem", color: "var(--ink-3)" }}>Usa tu correo @formatucuerpo.com</p>
    </div>
  );
}

export default function AuthGate({ children }: { children: ReactNode }) {
  return (
    <>
      <UnauthenticatedTemplate>
        <LoginScreen />
      </UnauthenticatedTemplate>
      <AuthenticatedTemplate>
        <HubAccessProvider>
          <ViewAsBanner />
          {children}
        </HubAccessProvider>
      </AuthenticatedTemplate>
    </>
  );
}
