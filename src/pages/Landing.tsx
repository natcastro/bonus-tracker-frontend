import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useHubAccess } from "../auth/HubAccessContext";
import { useMsal } from "@azure/msal-react";
import AccessAdminPanel from "../auth/AccessAdminPanel";

type Team = "MEX" | "OPS" | "APT" | "TKLIVES" | "CSQUALITY" | "MGMT" | "LOGISTICS" | "MARKETING";
type View = "hub" | "ftc-usa" | "ops-tools";

const ROUTES: Record<Team, string> = {
  MEX: "/mexico", OPS: "/operations",
  APT: "/strategy", TKLIVES: "/tiktok-lives", CSQUALITY: "/cs-quality",
  MGMT: "/management", LOGISTICS: "/logistics", MARKETING: "/marketing",
};

const CS_TEAMS: { key: Team; label: string; desc: string; color: string }[] = [
  { key: "OPS",  label: "Operations Team",  desc: "Handling Time & TikTok",  color: "#7c3aed" },
  { key: "APT",  label: "Strategy Team",    desc: "Afiliados & CS",          color: "#6366f1" },
];

// ── Card component ────────────────────────────────────────────────────────────
function HubCard({
  icon, eyebrow, title, subtitle, color, onClick, active,
}: {
  icon: string; eyebrow: string; title: string; subtitle: string;
  color: string; onClick: () => void; active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "#fff",
        border: `1px solid ${active ? color : "#EEEEEE"}`,
        borderLeft: `3px solid ${color}`,
        borderRadius: "10px",
        padding: "1.75rem",
        cursor: "pointer",
        textAlign: "left",
        transition: "box-shadow 0.2s, transform 0.15s",
        boxShadow: active ? `0 4px 16px ${color}1a` : "0 1px 2px rgba(0,0,0,0.04)",
        display: "flex",
        flexDirection: "column",
        gap: "0.9rem",
        minWidth: 260,
        maxWidth: 360,
        flex: "1 1 260px",
        position: "relative",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 8px 24px ${color}22`;
        (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-2px)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.boxShadow = active
          ? `0 4px 16px ${color}1a`
          : "0 1px 2px rgba(0,0,0,0.04)";
        (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)";
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <span style={{
          fontSize: "1.5rem",
          width: 42, height: 42,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: color + "12",
          borderRadius: "8px",
          flexShrink: 0,
        }}>{icon}</span>
        <span style={{
          fontSize: "0.65rem", fontWeight: 700, letterSpacing: "0.08em",
          textTransform: "uppercase", color: color,
        }}>{eyebrow}</span>
      </div>
      <div>
        <div style={{ fontWeight: 700, fontSize: "1.15rem", color: "#111827", letterSpacing: "-0.01em" }}>{title}</div>
        <div style={{ fontSize: "0.85rem", color: "#6B7280", marginTop: 6, lineHeight: 1.5 }}>{subtitle}</div>
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
      <div style={{ minHeight: "100vh", background: "#F8F9FA", display: "flex", alignItems: "center", justifyContent: "center", color: "#6B7280" }}>
        Cargando…
      </div>
    );
  }

  if (!access) {
    return (
      <div style={{ minHeight: "100vh", background: "#F8F9FA", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "2rem", textAlign: "center" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: "#0F172A", marginBottom: "0.5rem" }}>Sin acceso todavía</h1>
        <p style={{ color: "#6B7280", maxWidth: 420, marginBottom: "1.5rem" }}>
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
        {/* Soft brand-colored accents — kept out of the content area, which stays white */}
        <div aria-hidden style={{
          position: "fixed", top: "-12%", left: "-10%", width: 480, height: 480, borderRadius: "50%",
          background: "radial-gradient(circle, #3E8C5433 0%, transparent 70%)",
          filter: "blur(40px)", pointerEvents: "none", zIndex: 0,
        }} />
        <div aria-hidden style={{
          position: "fixed", bottom: "-15%", right: "-10%", width: 560, height: 560, borderRadius: "50%",
          background: "radial-gradient(circle, #D4A02733 0%, transparent 70%)",
          filter: "blur(40px)", pointerEvents: "none", zIndex: 0,
        }} />

        <div style={{ position: "absolute", top: "1.25rem", right: "1.5rem", display: "flex", alignItems: "center", gap: "0.75rem", zIndex: 1 }}>
          <span style={{ fontSize: "0.8rem", color: "#6B7280" }}>{name}</span>
          {access.isAdmin && !viewAs && (
            <button
              onClick={() => setShowAdminPanel(true)}
              title="Administrar accesos"
              className="btn btn-secondary btn-sm"
              style={{ fontSize: "1rem", lineHeight: 1, padding: "0.4rem 0.6rem" }}
            >
              ⚙️
            </button>
          )}
          <button onClick={logout} className="btn btn-secondary btn-sm">Salir</button>
        </div>
        {showAdminPanel && <AccessAdminPanel onClose={() => setShowAdminPanel(false)} />}
        {/* Logo + title */}
        <div style={{ textAlign: "center", marginBottom: "3rem", position: "relative", zIndex: 1 }}>
          <div style={{
            fontSize: "0.8rem",
            fontWeight: 700,
            letterSpacing: "0.15em",
            color: "#3E8C54",
            textTransform: "uppercase",
            marginBottom: "0.5rem",
          }}>Forma tu Cuerpo</div>
          <h1 style={{
            fontSize: "2.75rem",
            fontWeight: 800,
            color: "#0F172A",
            letterSpacing: "-0.03em",
            margin: 0,
          }}>FTC Hub</h1>
          <p style={{ color: "#6B7280", marginTop: "0.6rem", fontSize: "0.95rem" }}>
            Selecciona tu equipo para continuar
          </p>
        </div>

        {/* 3 main cards */}
        <div style={{ display: "flex", gap: "1.25rem", flexWrap: "wrap", justifyContent: "center", maxWidth: 1100, position: "relative", zIndex: 1 }}>
          {(hasTeam("OPS") || hasTeam("APT") || hasTeam("TKLIVES")) && (
            <HubCard
              icon="🇺🇸"
              eyebrow="Región"
              title="FTC USA"
              subtitle="Customer Service & TikTok Lives"
              color="#1e40af"
              onClick={() => setView("ftc-usa")}
            />
          )}
          {hasTeam("MEX") && (
            <HubCard
              icon="🇲🇽"
              eyebrow="Región"
              title="FTC México"
              subtitle="Ventas, Asistencia & Horarios"
              color="#15803d"
              onClick={() => directGo("MEX", getRole("MEX") ?? "staff")}
            />
          )}
          {hasTeam("CSQUALITY") && (
            <HubCard
              icon="⚙️"
              eyebrow="Herramientas"
              title="Operational Tools"
              subtitle="Herramientas internas del equipo"
              color="#475569"
              onClick={() => setView("ops-tools")}
            />
          )}
          {hasTeam("MGMT") && (
            <HubCard
              icon="📊"
              eyebrow="Gestión"
              title="Management"
              subtitle="Historial y datos del equipo"
              color="#64748b"
              onClick={() => directGo("MGMT")}
            />
          )}
          {hasTeam("LOGISTICS") && (
            <HubCard
              icon="📦"
              eyebrow="Operaciones"
              title="Logística"
              subtitle="Gestión de envíos y productos"
              color="#b45309"
              onClick={() => directGo("LOGISTICS")}
            />
          )}
          {hasTeam("MARKETING") && (
            <HubCard
              icon="🎨"
              eyebrow="Equipo"
              title="Marketing"
              subtitle="Briefs de producto — Laura & Diseño"
              color="#3E6B45"
              onClick={() => directGo("MARKETING")}
            />
          )}
        </div>
        {!hasTeam("OPS") && !hasTeam("APT") && !hasTeam("TKLIVES") && !hasTeam("MEX") && !hasTeam("CSQUALITY") && !hasTeam("MGMT") && !hasTeam("LOGISTICS") && !hasTeam("MARKETING") && (
          <p style={{ color: "#6B7280", marginTop: "1.5rem", position: "relative", zIndex: 1 }}>No tienes ningún equipo asignado todavía.</p>
        )}

      </div>
    );
  }

  // ── FTC USA sub-view ──────────────────────────────────────────────────────
  if (view === "ftc-usa") {
    return (
      <div style={{
        minHeight: "100vh",
        background: "#F8F9FA",
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
            color: "#6B7280", fontSize: "0.85rem", fontWeight: 500,
            marginBottom: "1.5rem", display: "flex", alignItems: "center", gap: "0.4rem",
            alignSelf: "flex-start", maxWidth: 1100, width: "100%",
            padding: "0 0.25rem",
          }}
        >
          ← FTC Hub
        </button>

        <div style={{ textAlign: "center", marginBottom: "2.5rem", width: "100%" }}>
          <div style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.15em", color: "#1e40af", textTransform: "uppercase", marginBottom: "0.4rem" }}>FTC USA</div>
          <h2 style={{ fontSize: "2rem", fontWeight: 800, color: "#0F172A", letterSpacing: "-0.02em", margin: 0 }}>
            Selecciona tu área
          </h2>
        </div>

        {/* 2 sub-cards */}
        <div style={{ display: "flex", gap: "1.25rem", flexWrap: "wrap", justifyContent: "center", maxWidth: 1100 }}>
          {(hasTeam("OPS") || hasTeam("APT")) && (
            <HubCard
              icon="🎧"
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
              icon="🎵"
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
                  style={{
                    padding: "0.5rem 1.25rem",
                    borderRadius: 9999,
                    border: `2px solid ${t.color}`,
                    background: t.color + "12",
                    color: t.color,
                    fontWeight: 600,
                    fontSize: "0.85rem",
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
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
      background: "#F8F9FA",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      padding: "4rem 1.5rem",
    }}>
      <button
        onClick={() => setView("hub")}
        style={{
          background: "none", border: "none", cursor: "pointer",
          color: "#6B7280", fontSize: "0.85rem", fontWeight: 500,
          marginBottom: "1.5rem", display: "flex", alignItems: "center", gap: "0.4rem",
          alignSelf: "flex-start", maxWidth: 1100, width: "100%",
          padding: "0 0.25rem",
        }}
      >
        ← FTC Hub
      </button>

      <div style={{ textAlign: "center", marginBottom: "2.5rem" }}>
        <div style={{ fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.15em", color: "#475569", textTransform: "uppercase", marginBottom: "0.4rem" }}>Operational Tools</div>
        <h2 style={{ fontSize: "2rem", fontWeight: 800, color: "#0F172A", letterSpacing: "-0.02em", margin: 0 }}>
          Herramientas internas
        </h2>
      </div>

      <div style={{ display: "flex", gap: "1.25rem", flexWrap: "wrap", justifyContent: "center" }}>
        <HubCard
          icon="📖"
          eyebrow="Herramienta"
          title="CS Quality Dictionary"
          subtitle="Casos de calidad y categorías"
          color="#475569"
          onClick={() => directGo("CSQUALITY")}
        />
      </div>
    </div>
  );
}
