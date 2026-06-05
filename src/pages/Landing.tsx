import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { verifyPassword } from "../services/api";

type Team = "USA" | "MEX" | "OPS" | "APT";

const TEAM_CONFIG: Record<Team, { label: string; flag: string; color: string; route: string }> = {
  USA: { label: "United States",        flag: "🇺🇸", color: "#1e40af", route: "/usa" },
  MEX: { label: "México",               flag: "🇲🇽", color: "#16a34a", route: "/mexico" },
  OPS: { label: "Operations Team",      flag: "🇺🇸", color: "#7c3aed", route: "/operations" },
  APT: { label: "Account Protection",   flag: "🇺🇸", color: "#0891b2", route: "/account-protection" },
};

export default function Landing() {
  const [selected, setSelected] = useState<Team | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSelect = (team: Team) => {
    setSelected(team);
    setPassword("");
    setError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    setLoading(true);
    setError("");
    try {
      await verifyPassword(selected, password);
      sessionStorage.setItem("team", selected);
      navigate(TEAM_CONFIG[selected].route);
    } catch {
      setError("Incorrect password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="landing-root">
      <div className="landing-card">
        <div className="landing-logo">Bonus Tracker</div>
        <p className="landing-subtitle">Select your team to continue</p>

        <div className="team-buttons" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
          {(Object.entries(TEAM_CONFIG) as [Team, typeof TEAM_CONFIG[Team]][]).map(([key, cfg]) => (
            <button
              key={key}
              className={`team-btn ${selected === key ? "active" : ""}`}
              style={selected === key ? { borderColor: cfg.color, background: cfg.color + "10" } : {}}
              onClick={() => handleSelect(key)}
            >
              <span className="flag">{cfg.flag}</span>
              <span style={{ fontSize: "0.9rem" }}>{cfg.label}</span>
            </button>
          ))}
        </div>

        {selected && (
          <form onSubmit={handleSubmit} className="password-form">
            <label>Password — {TEAM_CONFIG[selected].label}</label>
            <input
              type="password"
              className="form-control"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              autoFocus
              required
            />
            {error && <p className="error-msg">{error}</p>}
            <button
              type="submit"
              className="btn btn-primary"
              style={{ background: TEAM_CONFIG[selected].color }}
              disabled={loading}
            >
              {loading ? "Verifying..." : "Enter"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
