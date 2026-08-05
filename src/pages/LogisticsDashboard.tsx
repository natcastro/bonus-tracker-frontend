import { useNavigate } from "react-router-dom";

export default function LogisticsDashboard() {
  const navigate = useNavigate();
  const logout = () => { sessionStorage.removeItem("team"); navigate("/"); };

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", display: "flex", flexDirection: "column" }}>
      <header style={{
        background: "#fff", borderBottom: "1px solid #e2e8f0",
        padding: "0 2rem", height: 60, display: "flex", alignItems: "center",
        justifyContent: "space-between", gap: "1rem",
      }}>
        <div className="logo">FTC Hub — <span style={{ color: "#b45309" }}>Logística 📦</span></div>
        <button className="btn btn-secondary btn-sm" onClick={logout}>Logout</button>
      </header>
      <main style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "3rem" }}>
        <div style={{ textAlign: "center", color: "#64748b" }}>
          <div style={{ fontSize: "4rem", marginBottom: "1rem" }}>📦</div>
          <h2 style={{ color: "#111827", marginBottom: "0.5rem" }}>Logística</h2>
          <p style={{ fontSize: "0.95rem" }}>Próximamente — módulo en construcción.</p>
        </div>
      </main>
    </div>
  );
}
