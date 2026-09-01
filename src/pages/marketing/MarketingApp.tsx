import { Routes, Route, Navigate } from "react-router-dom";
import { MT } from "./theme";
import { MarketingProvider, useMarketing } from "./context";
import Navbar from "./components/Navbar";
import DashboardPage from "./pages/DashboardPage";
import BriefDetailPage from "./pages/BriefDetailPage";

function Shell() {
  const { authedUser, loading } = useMarketing();

  if (!authedUser) {
    return (
      <div style={{ minHeight: "100vh", background: MT.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "2rem", textAlign: "center", fontFamily: MT.font }}>
        <h1 style={{ fontSize: "1.3rem", fontWeight: 800, color: MT.text1, marginBottom: "0.5rem" }}>Sin rol asignado en Marketing</h1>
        <p style={{ color: MT.text2, maxWidth: 380 }}>
          Tu correo tiene acceso a Marketing pero no tiene un rol (Laura o Diseño) asignado todavía. Pide a un administrador que te lo asigne desde el panel de accesos.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: MT.bg, display: "flex", alignItems: "center", justifyContent: "center", color: MT.text2, fontFamily: MT.font }}>
        Cargando…
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: MT.bg }}>
      <Navbar />
      <Routes>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="brief/:id" element={<BriefDetailPage />} />
        <Route path="*" element={<Navigate to="dashboard" replace />} />
      </Routes>
    </div>
  );
}

export default function MarketingApp() {
  return (
    <MarketingProvider>
      <Shell />
    </MarketingProvider>
  );
}
