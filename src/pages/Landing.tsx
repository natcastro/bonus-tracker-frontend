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
  icon, title, subtitle, color, tags, onClick, active,
}: {
  icon: string; title: string; subtitle: string;
  color: string; tags: string[]; onClick: () => void; active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "#fff",
        border: `1px solid ${active ? color : "#E5E7EB"}`,
        borderLeft: `4px solid ${color}`,
        borderRadius: "12px",
        padding: "1.5rem",
        cursor: "pointer",
        textAlign: "left",
        transition: "box-shadow 0.2s, transform 0.15s",
        boxShadow: active ? `0 4px 16px ${color}22` : "0 1px 3px rgba(0,0,0,0.06)",
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
        minWidth: 260,
        maxWidth: 360,
        flex: "1 1 260px",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 6px 20px ${color}28`;
        (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-2px)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.boxShadow = active
          ? `0 4px 16px ${color}22`
          : "0 1px 3px rgba(0,0,0,0.06)";
        (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)";
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <span style={{
          fontSize: "1.75rem",
          width: 44, height: 44,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: color + "14",
          borderRadius: "10px",
          flexShrink: 0,
        }}>{icon}</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: "1rem", color: "#111827" }}>{title}</div>
          <div style={{ fontSize: "0.8rem", color: "#6B7280", marginTop: 2 }}>{subtitle}</div>
        </div>
      </div>
      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginTop: "0.25rem" }}>
        {tags.map((t) => (
          <span key={t} style={{
            fontSize: "0.7rem", fontWeight: 600,
            padding: "0.2rem 0.6rem",
            borderRadius: 9999,
            background: color + "14",
            color: color,
            border: `1px solid ${color}30`,
          }}>{t}</span>
        ))}
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
        background: "#F8F9FA",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem 1.5rem",
        position: "relative",
      }}>
        <div style={{ position: "absolute", top: "1.25rem", right: "1.5rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
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
        <div style={{ textAlign: "center", marginBottom: "3rem" }}>
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
        <div style={{ display: "flex", gap: "1.25rem", flexWrap: "wrap", justifyContent: "center", maxWidth: 1100 }}>
          {(hasTeam("OPS") || hasTeam("APT") || hasTeam("TKLIVES")) && (
            <HubCard
              icon="🇺🇸"
              title="FTC USA"
              subtitle="Customer Service & TikTok Lives"
              color="#1e40af"
              tags={["Customer Service", "Lives"]}
              onClick={() => setView("ftc-usa")}
            />
          )}
          {hasTeam("MEX") && (
            <HubCard
              icon="🇲🇽"
              title="FTC México"
              subtitle="Ventas, Asistencia & Horarios"
              color="#15803d"
              tags={["Ventas", "Asistencia", "Horarios"]}
              onClick={() => directGo("MEX", getRole("MEX") ?? "staff")}
            />
          )}
          {hasTeam("CSQUALITY") && (
            <HubCard
              icon="⚙️"
              title="Operational Tools"
              subtitle="Herramientas internas del equipo"
              color="#475569"
              tags={["CS Quality Dictionary"]}
              onClick={() => setView("ops-tools")}
            />
          )}
          {hasTeam("MGMT") && (
            <HubCard
              icon="📊"
              title="Management"
              subtitle="Historial y datos del equipo"
              color="#64748b"
              tags={["Historial", "Datos"]}
              onClick={() => directGo("MGMT")}
            />
          )}
          {hasTeam("LOGISTICS") && (
            <HubCard
              icon="📦"
              title="Logística"
              subtitle="Gestión de envíos y productos"
              color="#b45309"
              tags={["Envíos", "Inventario"]}
              onClick={() => directGo("LOGISTICS")}
            />
          )}
          {hasTeam("MARKETING") && (
            <HubCard
              icon="🎨"
              title="Marketing"
              subtitle="Briefs de producto — Laura & Diseño"
              color="#3E6B45"
              tags={["Briefs", "Diseño"]}
              onClick={() => directGo("MARKETING")}
            />
          )}
        </div>
        {!hasTeam("OPS") && !hasTeam("APT") && !hasTeam("TKLIVES") && !hasTeam("MEX") && !hasTeam("CSQUALITY") && !hasTeam("MGMT") && !hasTeam("LOGISTICS") && !hasTeam("MARKETING") && (
          <p style={{ color: "#6B7280", marginTop: "1.5rem" }}>No tienes ningún equipo asignado todavía.</p>
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
              title="Customer Service"
              subtitle="Operations · Strategy"
              color="#1e40af"
              tags={["Operations", "Strategy"]}
              active={csSelected !== null && csSelected !== "TKLIVES"}
              onClick={() => setCsSelected(csSelected && csSelected !== "TKLIVES" ? null : "OPS")}
            />
          )}
          {hasTeam("TKLIVES") && (
            <HubCard
              icon="🎵"
              title="Lives"
              subtitle="TikTok Lives USA — Horarios y turnos"
              color="#e91e8c"
              tags={["TikTok Lives"]}
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
          title="CS Quality Dictionary"
          subtitle="Casos de calidad y categorías"
          color="#475569"
          tags={["Quality", "Dictionary"]}
          onClick={() => directGo("CSQUALITY")}
        />
      </div>
    </div>
  );
}
