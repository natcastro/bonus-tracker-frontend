import { useNavigate } from "react-router-dom";
import { UsersIcon } from "../components/icons";

const COLOR = "#0f766e";

// Placeholder for the upcoming Human Resources area — nothing to configure yet.
export default function HrDashboard() {
  const navigate = useNavigate();
  return (
    <div>
      <nav className="top-nav">
        <div className="logo">FTC Hub — <span style={{ color: COLOR }}>HR</span></div>
        <div />
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button className="btn btn-secondary btn-sm" onClick={() => navigate("/")}>← Volver al Hub</button>
          <button className="btn btn-secondary btn-sm" onClick={() => { sessionStorage.clear(); navigate("/"); }}>Logout</button>
        </div>
      </nav>

      <main className="content-area">
        <header className="section-header"><h2>HR — Recursos Humanos</h2></header>
        <div className="card" style={{ textAlign: "center", padding: "3.5rem 1.5rem" }}>
          <div style={{
            width: 64, height: 64, borderRadius: 16, background: `${COLOR}14`, margin: "0 auto 1rem",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <UsersIcon size={30} color={COLOR} />
          </div>
          <h3 style={{ margin: "0 0 0.4rem", fontSize: "1.25rem" }}>Página en construcción</h3>
          <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "0.95rem" }}>
            Estamos preparando esta sección. Muy pronto habrá novedades.
          </p>
        </div>
      </main>
    </div>
  );
}
