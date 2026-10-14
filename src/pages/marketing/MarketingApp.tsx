import { Routes, Route, Navigate } from "react-router-dom";
import { MT } from "./theme";
import { MarketingProvider, useMarketing } from "./context";
import Navbar from "./components/Navbar";
import MyTasksPage from "./pages/MyTasksPage";
import DashboardPage from "./pages/DashboardPage";
import TodoPage from "./pages/TodoPage";
import TeamDashboardPage from "./pages/TeamDashboardPage";
import VideoDashboardPage from "./pages/VideoDashboardPage";
import BriefDetailPage from "./pages/BriefDetailPage";
import TodoTaskDetailPage from "./pages/TodoTaskDetailPage";
import RequestsPage from "./pages/RequestsPage";
import RequestDetailPage from "./pages/RequestDetailPage";
import NewRequestPage from "./pages/NewRequestPage";

// Everything under here needs an actual Marketing role (Laura/Diseño/Karol) — unlike
// "nueva-solicitud" and "request/:id" below, which only need a company Microsoft login.
function InternalShell() {
  const { authedUser, loading } = useMarketing();

  if (!authedUser) {
    return (
      <div style={{ minHeight: "100vh", background: MT.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "2rem", textAlign: "center", fontFamily: MT.font }}>
        <h1 style={{ fontSize: "1.3rem", fontWeight: 800, color: MT.text1, marginBottom: "0.5rem" }}>Sin rol asignado en Marketing</h1>
        <p style={{ color: MT.text2, maxWidth: 380 }}>
          Tu correo tiene acceso a Marketing pero no tiene un rol (Laura, Diseño, Karol o Video) asignado todavía. Pide a un administrador que te lo asigne desde el panel de accesos.
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
        <Routes>
          <Route index element={<Navigate to="tasks" replace />} />
          <Route path="tasks" element={<MyTasksPage />} />
          <Route path="todo" element={<TodoPage />} />
          <Route path="dashboard" element={authedUser.role === "video" ? <VideoDashboardPage /> : <TeamDashboardPage />} />
          <Route path="todo/:id" element={<TodoTaskDetailPage />} />
          {/* Briefs and Solicitudes are closed to the Video role (anything else falls through to "tasks" below). */}
          {authedUser.role !== "video" && <Route path="home" element={<DashboardPage />} />}
          {authedUser.role !== "video" && <Route path="brief/:id" element={<BriefDetailPage />} />}
          {/* Everyone reaches Solicitudes, but RequestsPage itself only shows the full
              list/assign/reassign/delete tools to Laura/Karol — Diseño just gets the
              "copiar enlace" box so they can hand it out too. */}
          {authedUser.role !== "video" && <Route path="requests" element={<RequestsPage />} />}
          <Route path="*" element={<Navigate to="tasks" replace />} />
        </Routes>
      </div>
    </div>
  );
}

export default function MarketingApp() {
  return (
    <MarketingProvider>
      {/* "nueva-solicitud" and "request/:id" are reachable by anyone with a company Microsoft
          login, no Marketing role needed — they're matched before the internal-only catch-all,
          and render their own minimal layout (no Navbar/TabBar, which assume an internal role). */}
      <Routes>
        <Route path="nueva-solicitud" element={<NewRequestPage />} />
        <Route path="request/:id" element={<RequestDetailPage />} />
        <Route path="*" element={<InternalShell />} />
      </Routes>
    </MarketingProvider>
  );
}
