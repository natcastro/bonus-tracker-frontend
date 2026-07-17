import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import type { ReactElement } from "react";
import Landing from "./pages/Landing";
import MexicoDashboard from "./pages/MexicoDashboard";
import OperationsDashboard from "./pages/OperationsDashboard";
import StrategyDashboard from "./pages/StrategyDashboard";
import TikTokLivesDashboard from "./pages/TikTokLivesDashboard";
import CSQualityDashboard from "./pages/CSQualityDashboard";
import ManagementDashboard from "./pages/ManagementDashboard";

const NO_PASSWORD_TEAMS = new Set(["TKLIVES", "CSQUALITY"]);

function ProtectedRoute({ team, children }: { team: string; children: ReactElement }) {
  const saved = sessionStorage.getItem("team");
  if (saved !== team) {
    if (NO_PASSWORD_TEAMS.has(team)) {
      sessionStorage.setItem("team", team);
      return children;
    }
    return <Navigate to="/" replace />;
  }
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/mexico" element={
          <ProtectedRoute team="MEX"><MexicoDashboard /></ProtectedRoute>
        } />
        <Route path="/operations" element={
          <ProtectedRoute team="OPS"><OperationsDashboard /></ProtectedRoute>
        } />
        <Route path="/strategy" element={
          <ProtectedRoute team="APT"><StrategyDashboard /></ProtectedRoute>
        } />
        <Route path="/tiktok-lives" element={
          <ProtectedRoute team="TKLIVES"><TikTokLivesDashboard /></ProtectedRoute>
        } />
        <Route path="/cs-quality" element={
          <ProtectedRoute team="CSQUALITY"><CSQualityDashboard /></ProtectedRoute>
        } />
        <Route path="/management" element={
          <ProtectedRoute team="MGMT"><ManagementDashboard /></ProtectedRoute>
        } />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
