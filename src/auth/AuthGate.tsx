import { useMsal, AuthenticatedTemplate, UnauthenticatedTemplate } from "@azure/msal-react";
import { InteractionStatus } from "@azure/msal-browser";
import type { ReactNode } from "react";
import { loginRequest } from "./msalConfig";
import { HubAccessProvider, useHubAccess } from "./HubAccessContext";

const TEAM_LABELS: Record<string, string> = {
  MEX: "FTC México", OPS: "Operations", APT: "Strategy", TKLIVES: "TikTok Lives",
  CSQUALITY: "Operational Tools", MGMT: "Management", LOGISTICS: "Logística", MARKETING: "Marketing",
};

function viewAsLabel(team: string, role: string): string {
  const teamLabel = TEAM_LABELS[team] ?? team;
  if (team === "MARKETING") return `${teamLabel} — ${role === "admin" ? "Laura" : "Diseño"}`;
  return `${teamLabel} — ${role === "admin" ? "Administrador" : "Staff"}`;
}

function ViewAsBanner() {
  const { viewAs, stopViewAs } = useHubAccess();
  if (!viewAs) return null;
  return (
    <div style={{
      position: "sticky", top: 0, zIndex: 9999, background: "#78350F", color: "#fff",
      fontFamily: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`,
      fontSize: "0.8rem", fontWeight: 600, padding: "0.5rem 1rem",
      display: "flex", alignItems: "center", justifyContent: "center", gap: "0.75rem",
    }}>
      <span>👀 Vista previa — viendo el Hub como: {viewAsLabel(viewAs.team, viewAs.role)}</span>
      <button
        onClick={stopViewAs}
        style={{
          background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.4)", color: "#fff",
          borderRadius: 6, padding: "0.2rem 0.65rem", fontSize: "0.75rem", fontWeight: 700, cursor: "pointer",
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
      minHeight: "100vh", background: "#F8F9FA", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", padding: "2rem",
      fontFamily: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`,
    }}>
      <div style={{ fontSize: "0.8rem", fontWeight: 700, letterSpacing: "0.15em", color: "#3E8C54", textTransform: "uppercase", marginBottom: "0.5rem" }}>
        Forma tu Cuerpo
      </div>
      <h1 style={{ fontSize: "2.25rem", fontWeight: 800, color: "#0F172A", letterSpacing: "-0.03em", margin: "0 0 1.75rem" }}>FTC Hub</h1>
      <button
        onClick={() => instance.loginRedirect(loginRequest)}
        disabled={inProgress !== InteractionStatus.None}
        style={{
          display: "flex", alignItems: "center", gap: "0.6rem", fontSize: "0.95rem", fontWeight: 700,
          background: "#fff", color: "#1F2937", border: "1px solid #E5E7EB", borderRadius: 10,
          padding: "0.85rem 1.6rem", cursor: inProgress !== InteractionStatus.None ? "not-allowed" : "pointer",
          boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
        }}
      >
        {inProgress !== InteractionStatus.None ? "Redirigiendo..." : "🔑 Entrar con Microsoft"}
      </button>
      <p style={{ marginTop: "1.25rem", fontSize: "0.8rem", color: "#6B7280" }}>Usa tu correo @formatucuerpo.com</p>
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
