import { Routes, Route, Navigate } from "react-router-dom";
import { MT } from "./theme";
import { MarketingProvider, useMarketing } from "./context";
import MarketingLogin from "./MarketingLogin";
import Navbar from "./components/Navbar";
import DashboardPage from "./pages/DashboardPage";
import BriefDetailPage from "./pages/BriefDetailPage";

function Shell() {
  const { authedUser, loading } = useMarketing();

  if (!authedUser) return <MarketingLogin />;

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
