import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { verifyPassword } from "../services/api";

type Team = "MEX" | "OPS" | "APT" | "TKLIVES" | "CSQUALITY" | "MGMT";
type View = "hub" | "ftc-usa" | "ops-tools";

const ROUTES: Record<Team, string> = {
  MEX: "/mexico", OPS: "/operations",
  APT: "/strategy", TKLIVES: "/tiktok-lives", CSQUALITY: "/cs-quality",
  MGMT: "/management",
};

const MANAGEMENT_PASSWORD = "123456";

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

// ── Password form ─────────────────────────────────────────────────────────────
function PasswordForm({
  team, label, color, onBack,
}: {
  team: Team; label: string; color: string; onBack: () => void;
}) {
  const navigate = useNavigate();
  const [pw, setPw] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const role = await verifyPassword(team, pw);
      sessionStorage.setItem("team", team);
      sessionStorage.setItem("role", role);
      navigate(ROUTES[team]);
    } catch {
      setError("Contraseña incorrecta.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      background: "#fff",
      border: `1px solid #E5E7EB`,
      borderLeft: `4px solid ${color}`,
      borderRadius: 12,
      padding: "1.5rem",
      maxWidth: 380,
      width: "100%",
    }}>
      <div style={{ fontWeight: 700, fontSize: "0.95rem", marginBottom: "1rem", color: "#111827" }}>
        🔒 {label}
      </div>
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <input
          type="password"
          className="form-control"
          placeholder="Contraseña"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          autoFocus
          required
          style={{ borderColor: color + "60" }}
        />
        {error && <p className="error-msg">{error}</p>}
        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onBack}>
            Cancelar
          </button>
          <button
            type="submit"
            className="btn btn-primary btn-sm"
            style={{ background: color }}
            disabled={loading}
          >
            {loading ? "..." : "Entrar"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Main Landing ──────────────────────────────────────────────────────────────
export default function Landing() {
  const navigate = useNavigate();
  const [view, setView] = useState<View>("hub");
  const [csSelected, setCsSelected] = useState<Team | null>(null);
  const [mgmtPw, setMgmtPw] = useState("");
  const [mgmtPwError, setMgmtPwError] = useState("");

  const directGo = (team: Team) => {
    sessionStorage.setItem("team", team);
    sessionStorage.setItem("role", "admin");
    navigate(ROUTES[team]);
  };

  const submitMgmt = (e: React.FormEvent) => {
    e.preventDefault();
    if (mgmtPw === MANAGEMENT_PASSWORD) {
      directGo("MGMT");
    } else {
      setMgmtPwError("Contraseña incorrecta.");
    }
  };

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
      }}>
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
          <HubCard
            icon="🇺🇸"
            title="FTC USA"
            subtitle="Customer Service & TikTok Lives"
            color="#1e40af"
            tags={["Customer Service", "Lives"]}
            onClick={() => setView("ftc-usa")}
          />
          <HubCard
            icon="🇲🇽"
            title="FTC México"
            subtitle="Ventas, Asistencia & Horarios"
            color="#15803d"
            tags={["Ventas", "Asistencia", "Horarios"]}
            onClick={() => setCsSelected(csSelected === "MEX" ? null : "MEX")}
          />
          <HubCard
            icon="⚙️"
            title="Operational Tools"
            subtitle="Herramientas internas del equipo"
            color="#475569"
            tags={["CS Quality Dictionary"]}
            onClick={() => setView("ops-tools")}
          />
          <HubCard
            icon="📊"
            title="Management"
            subtitle="Historial y datos del equipo"
            color="#64748b"
            tags={["Historial", "Datos"]}
            onClick={() => setCsSelected(csSelected === "MGMT" ? null : "MGMT")}
            active={csSelected === "MGMT"}
          />
        </div>

        {/* México password inline */}
        {csSelected === "MEX" && (
          <div style={{ marginTop: "2rem" }}>
            <PasswordForm
              team="MEX"
              label="FTC México"
              color="#15803d"
              onBack={() => setCsSelected(null)}
            />
          </div>
        )}

        {/* Management password inline */}
        {csSelected === "MGMT" && (
          <div style={{ marginTop: "2rem" }}>
            <div style={{
              background: "#fff",
              border: "1px solid #E5E7EB",
              borderLeft: "4px solid #64748b",
              borderRadius: 12,
              padding: "1.5rem",
              maxWidth: 380,
              width: "100%",
            }}>
              <div style={{ fontWeight: 700, fontSize: "0.95rem", marginBottom: "1rem", color: "#111827" }}>
                🔒 Management
              </div>
              <form onSubmit={submitMgmt} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <input
                  type="password"
                  className="form-control"
                  placeholder="Contraseña"
                  value={mgmtPw}
                  onChange={(e) => { setMgmtPw(e.target.value); setMgmtPwError(""); }}
                  autoFocus
                  required
                  style={{ borderColor: "#94a3b860" }}
                />
                {mgmtPwError && <p className="error-msg">{mgmtPwError}</p>}
                <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setCsSelected(null)}>
                    Cancelar
                  </button>
                  <button type="submit" className="btn btn-primary btn-sm" style={{ background: "#64748b" }}>
                    Entrar
                  </button>
                </div>
              </form>
            </div>
          </div>
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
          <HubCard
            icon="🎧"
            title="Customer Service"
            subtitle="Operations · Strategy"
            color="#1e40af"
            tags={["Operations", "Strategy"]}
            active={csSelected !== null && csSelected !== "TKLIVES"}
            onClick={() => setCsSelected(csSelected && csSelected !== "TKLIVES" ? null : "OPS")}
          />
          <HubCard
            icon="🎵"
            title="Lives"
            subtitle="TikTok Lives USA — Horarios y turnos"
            color="#e91e8c"
            tags={["TikTok Lives"]}
            onClick={() => directGo("TKLIVES")}
          />
        </div>

        {/* CS team picker */}
        {csSelected && csSelected !== "TKLIVES" && (
          <div style={{ marginTop: "2rem", display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem", width: "100%" }}>
            {csSelected === "USA" || csSelected === "OPS" || csSelected === "APT" ? (
              <>
                {/* Team selector pills */}
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", justifyContent: "center" }}>
                  {CS_TEAMS.map((t) => (
                    <button
                      key={t.key}
                      onClick={() => setCsSelected(t.key)}
                      style={{
                        padding: "0.5rem 1.25rem",
                        borderRadius: 9999,
                        border: `2px solid ${csSelected === t.key ? t.color : "#E5E7EB"}`,
                        background: csSelected === t.key ? t.color + "12" : "#fff",
                        color: csSelected === t.key ? t.color : "#374151",
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
                {/* Password form for the selected CS team */}
                <PasswordForm
                  team={csSelected as Team}
                  label={CS_TEAMS.find((t) => t.key === csSelected)?.label ?? ""}
                  color={CS_TEAMS.find((t) => t.key === csSelected)?.color ?? "#1e40af"}
                  onBack={() => setCsSelected(null)}
                />
              </>
            ) : null}
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
