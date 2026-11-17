import { useState } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useHubAccess } from "../auth/HubAccessContext";
import { useMsal } from "@azure/msal-react";
import AccessAdminPanel from "../auth/AccessAdminPanel";
import { GlobeIcon, ToolsIcon, ChartIcon, PaletteIcon, HeadsetIcon, WaveIcon, BookIcon, GearIcon, UsersIcon } from "../components/icons";
import { Illustration } from "../components/Illustrations";
import type { IllustrationKind } from "../components/Illustrations";
import fcSymbol from "../assets/brand/fc-symbol.png";

type Team = "MEX" | "OPS" | "APT" | "TKLIVES" | "CSQUALITY" | "MGMT" | "LOGISTICS" | "MARKETING" | "DEVOLUCIONES" | "HR";
type View = "hub" | "ftc-usa" | "ops-tools";

const ROUTES: Record<Team, string> = {
  MEX: "/mexico", OPS: "/operations",
  APT: "/strategy", TKLIVES: "/tiktok-lives", CSQUALITY: "/cs-quality",
  MGMT: "/management", LOGISTICS: "/logistics", MARKETING: "/marketing",
  DEVOLUCIONES: "/devoluciones", HR: "/hr",
};

const CS_TEAMS: { key: Team; label: string; desc: string; color: string }[] = [
  { key: "OPS",  label: "Operations Team",  desc: "Handling Time & TikTok",  color: "#1F1E1C" },
  { key: "APT",  label: "Strategy Team",    desc: "Afiliados & CS",          color: "#1F1E1C" },
];

// ── Card component ────────────────────────────────────────────────────────────
const KIND: Record<string, IllustrationKind> = { "FTC USA": "dots", "FTC México": "grid", "Operational Tools": "rings", Management: "line", Marketing: "layers", HR: "rings", "Customer Service": "dots", Lives: "line", "CS Quality Dictionary": "grid" };

function HubCard({
  eyebrow, title, subtitle, onClick, active,
}: {
  icon?: ReactNode; eyebrow: string; title: string; subtitle: string;
  color?: string; onClick: () => void; active?: boolean;
}) {
  return (
    <button onClick={onClick} className={`hub-card${active ? " active" : ""}`} style={{ minWidth: 250, maxWidth: 340, flex: "1 1 250px" }}>
      <div className="hub-card__top">
        <span className="eyebrow">{eyebrow}</span>
      </div>
      <div style={{ display: "flex", justifyContent: "center", color: "var(--ink)" }}><Illustration kind={KIND[title] ?? "dots"} size={104} /></div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "0.75rem" }}>
        <div>
          <div className="hub-card__title">{title}</div>
          <div className="hub-card__sub">{subtitle}</div>
        </div>
        <span className="hub-card__arrow" aria-hidden>→</span>
      </div>
    </button>
  );
}

// ── Main Landing ──────────────────────────────────────────────────────────────
export default function Landing() {
  const navigate = useNavigate();
  const { instance } = useMsal();
  const { hasTeam, getRole, loading: accessLoading, access, email, name, viewAs } = useHubAccess();
  const [view, setView] = useState<View>("hub");
  const [csSelected, setCsSelected] = useState<Team | null>(null);
  const [showAdminPanel, setShowAdminPanel] = useState(false);

  const directGo = (team: Team, role: string = "admin") => {
    sessionStorage.setItem("team", team);
    sessionStorage.setItem("role", role);
    navigate(ROUTES[team]);
  };

  const logout = () => instance.logoutRedirect();

  if (accessLoading) {
    return (
      <div style={{ minHeight: "100vh", background: "#FFFFFF", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ink-3)" }}>
        Cargando…
      </div>
    );
  }

  if (!access) {
    return (
      <div style={{ minHeight: "100vh", background: "#FFFFFF", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "2rem", textAlign: "center" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 600, color: "var(--ink)", marginBottom: "0.5rem" }}>Sin acceso todavía</h1>
        <p style={{ color: "var(--ink-3)", maxWidth: 420, marginBottom: "1.5rem" }}>
          Tu cuenta <strong>{email}</strong> inició sesión correctamente, pero todavía no tiene un equipo asignado en FTC Hub. Pide a un administrador que te dé acceso.
        </p>
        <button onClick={logout} className="btn btn-secondary btn-sm">Cerrar sesión</button>
      </div>
    );
  }

  // ── Hub view ──────────────────────────────────────────────────────────────
  if (view === "hub") {
    return (
      <div style={{
        minHeight: "100vh",
        background: "#FFFFFF",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem 1.5rem",
        position: "relative",
        overflow: "hidden",
      }}>
        <div style={{ position: "absolute", top: "1.25rem", right: "1.5rem", display: "flex", alignItems: "center", gap: "0.75rem", zIndex: 1 }}>
          <span style={{ fontSize: "0.8rem", color: "var(--ink-3)" }}>{name}</span>
          {access.isAdmin && !viewAs && (
            <button
              onClick={() => setShowAdminPanel(true)}
              title="Administrar accesos"
              className="btn btn-secondary btn-sm"
              style={{ display: "flex", alignItems: "center", padding: "0.4rem 0.6rem" }}
            >
              <GearIcon size={16} />
            </button>
          )}
          <button onClick={logout} className="btn btn-secondary btn-sm">Salir</button>
        </div>
        {showAdminPanel && <AccessAdminPanel onClose={() => setShowAdminPanel(false)} />}
        {/* Logo + title */}
        <div style={{ textAlign: "center", marginBottom: "3rem", position: "relative", zIndex: 1 }}>
          <img src={fcSymbol} alt="" aria-hidden style={{ height: 44, marginBottom: "1.25rem" }} />
          <div className="eyebrow" style={{ marginBottom: "0.75rem" }}>[ Forma tu Cuerpo ]</div>
          <h1 style={{
            fontSize: "3.25rem",
            fontWeight: 600,
            color: "var(--ink)",
            letterSpacing: "-0.045em",
            lineHeight: 1,
            margin: 0,
          }}>FTC Hub</h1>
          <p style={{ color: "var(--ink-3)", marginTop: "0.85rem", fontSize: "1rem" }}>
            Selecciona tu equipo para continuar
          </p>
        </div>

        {/* 3 main cards */}
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", justifyContent: "center", maxWidth: 1100, position: "relative", zIndex: 1 }}>
          {(hasTeam("OPS") || hasTeam("APT") || hasTeam("TKLIVES")) && (
            <HubCard
              icon={<GlobeIcon color="#1e40af" />}
              eyebrow="Región"
              title="FTC USA"
              subtitle="Customer Service & TikTok Lives"
              color="#1e40af"
              onClick={() => setView("ftc-usa")}
            />
          )}
          {hasTeam("MEX") && (
            <HubCard
              icon={<GlobeIcon color="#15803d" />}
              eyebrow="Región"
              title="FTC México"
              subtitle="Ventas, Asistencia & Horarios"
              color="#15803d"
              onClick={() => directGo("MEX", getRole("MEX") ?? "staff")}
            />
          )}
          {hasTeam("CSQUALITY") && (
            <HubCard
              icon={<ToolsIcon color="#57564F" />}
              eyebrow="Herramientas"
              title="Operational Tools"
              subtitle="Herramientas internas del equipo"
              color="#57564F"
              onClick={() => setView("ops-tools")}
            />
          )}
          {hasTeam("MGMT") && (
            <HubCard
              icon={<ChartIcon color="#6F6E67" />}
              eyebrow="Gestión"
              title="Management"
              subtitle="Historial y datos del equipo"
              color="#6F6E67"
              onClick={() => directGo("MGMT")}
            />
          )}
          {hasTeam("MARKETING") && (
            <HubCard
              icon={<PaletteIcon color="#3E6B45" />}
              eyebrow="Equipo"
              title="Marketing"
              subtitle="Briefs de producto — Laura & Diseño"
              color="#3E6B45"
              onClick={() => directGo("MARKETING")}
            />
          )}
          {hasTeam("HR") && (
            <HubCard
              icon={<UsersIcon color="#0f766e" />}
              eyebrow="Equipo"
              title="HR"
              subtitle="Recursos humanos"
              color="#0f766e"
              onClick={() => directGo("HR")}
            />
          )}
        </div>
        {!hasTeam("OPS") && !hasTeam("APT") && !hasTeam("TKLIVES") && !hasTeam("MEX") && !hasTeam("CSQUALITY") && !hasTeam("MGMT") && !hasTeam("MARKETING") && !hasTeam("HR") && (
          <p style={{ color: "var(--ink-3)", marginTop: "1.5rem", position: "relative", zIndex: 1 }}>No tienes ningún equipo asignado todavía.</p>
        )}

      </div>
    );
  }

  // ── FTC USA sub-view ──────────────────────────────────────────────────────
  if (view === "ftc-usa") {
    return (
      <div style={{
        minHeight: "100vh",
        background: "#FFFFFF",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "4rem 1.5rem",
      }}>
        {/* Breadcrumb */}
        <button
          onClick={() => { setView("hub"); setCsSelected(null); }}
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: "var(--ink-3)", fontSize: "0.85rem", fontWeight: 500,
            marginBottom: "1.5rem", display: "flex", alignItems: "center", gap: "0.4rem",
            alignSelf: "flex-start", maxWidth: 1100, width: "100%",
            padding: "0 0.25rem",
          }}
        >
          ← FTC Hub
        </button>

        <div style={{ textAlign: "center", marginBottom: "2.5rem", width: "100%" }}>
          <div className="eyebrow" style={{ marginBottom: "0.6rem" }}>[ FTC USA ]</div>
          <h2 style={{ fontSize: "2.25rem", fontWeight: 600, color: "var(--ink)", letterSpacing: "-0.04em", lineHeight: 1.05, margin: 0 }}>
            Selecciona tu área
          </h2>
        </div>

        {/* 2 sub-cards */}
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", justifyContent: "center", maxWidth: 1100 }}>
          {(hasTeam("OPS") || hasTeam("APT")) && (
            <HubCard
              icon={<HeadsetIcon color="#1e40af" />}
              eyebrow="Agentes"
              title="Customer Service"
              subtitle="Operations · Strategy"
              color="#1e40af"
              active={csSelected !== null && csSelected !== "TKLIVES"}
              onClick={() => setCsSelected(csSelected && csSelected !== "TKLIVES" ? null : "OPS")}
            />
          )}
          {hasTeam("TKLIVES") && (
            <HubCard
              icon={<WaveIcon color="#e91e8c" />}
              eyebrow="Equipo"
              title="Lives"
              subtitle="TikTok Lives USA — Horarios y turnos"
              color="#e91e8c"
              onClick={() => directGo("TKLIVES")}
            />
          )}
        </div>

        {/* CS team picker — click a team to go straight in, no password */}
        {csSelected && csSelected !== "TKLIVES" && (
          <div style={{ marginTop: "2rem", display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem", width: "100%" }}>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", justifyContent: "center" }}>
              {CS_TEAMS.filter((t) => hasTeam(t.key)).map((t) => (
                <button
                  key={t.key}
                  onClick={() => directGo(t.key)}
                  className="btn btn-secondary fx-card"
                  style={{ padding: "0.85rem 1.75rem", fontSize: "0.95rem", borderColor: "var(--ink)", transition: "background-color 0.18s" }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Operational Tools sub-view ────────────────────────────────────────────
  return (
    <div style={{
      minHeight: "100vh",
      background: "#FFFFFF",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      padding: "4rem 1.5rem",
    }}>
      <button
        onClick={() => setView("hub")}
        style={{
          background: "none", border: "none", cursor: "pointer",
          color: "var(--ink-3)", fontSize: "0.85rem", fontWeight: 500,
          marginBottom: "1.5rem", display: "flex", alignItems: "center", gap: "0.4rem",
          alignSelf: "flex-start", maxWidth: 1100, width: "100%",
          padding: "0 0.25rem",
        }}
      >
        ← FTC Hub
      </button>

      <div style={{ textAlign: "center", marginBottom: "2.5rem" }}>
        <div className="eyebrow" style={{ marginBottom: "0.6rem" }}>[ Operational Tools ]</div>
        <h2 style={{ fontSize: "2.25rem", fontWeight: 600, color: "var(--ink)", letterSpacing: "-0.04em", lineHeight: 1.05, margin: 0 }}>
          Herramientas internas
        </h2>
      </div>

      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", justifyContent: "center" }}>
        <HubCard
          icon={<BookIcon color="#57564F" />}
          eyebrow="Herramienta"
          title="CS Quality Dictionary"
          subtitle="Casos de calidad y categorías"
          color="#57564F"
          onClick={() => directGo("CSQUALITY")}
        />
      </div>
    </div>
  );
}
