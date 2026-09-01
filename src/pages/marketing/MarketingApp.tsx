import { Routes, Route, Navigate } from "react-router-dom";
import { MT } from "./theme";
import { MarketingProvider, useMarketing } from "./context";
import Navbar from "./components/Navbar";
import TabBar from "./components/TabBar";
import MyTasksPage from "./pages/MyTasksPage";
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
    <div style={{ minHeight: "100vh", background: MT.bg, position: "relative", overflow: "hidden" }}>
      <div aria-hidden style={{
        position: "fixed", top: "-14%", right: "-8%", width: 460, height: 460, borderRadius: "50%",
        background: "radial-gradient(circle, #3E8C5426 0%, transparent 70%)",
        filter: "blur(40px)", pointerEvents: "none", zIndex: 0,
      }} />
      <div aria-hidden style={{
        position: "fixed", bottom: "-16%", left: "-10%", width: 520, height: 520, borderRadius: "50%",
        background: "radial-gradient(circle, #B15E3B22 0%, transparent 70%)",
        filter: "blur(40px)", pointerEvents: "none", zIndex: 0,
      }} />
      <div style={{ position: "relative", zIndex: 1 }}>
        <Navbar />
        <TabBar />
        <Routes>
          <Route index element={<Navigate to="tasks" replace />} />
          <Route path="tasks" element={<MyTasksPage />} />
          <Route path="home" element={<DashboardPage />} />
          <Route path="dashboard" element={<Navigate to="/marketing/home" replace />} />
          <Route path="brief/:id" element={<BriefDetailPage />} />
          <Route path="*" element={<Navigate to="tasks" replace />} />
        </Routes>
      </div>
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
