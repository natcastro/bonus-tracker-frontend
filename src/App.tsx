import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import type { ReactElement } from "react";
import Landing from "./pages/Landing";
import UsaDashboard from "./pages/UsaDashboard";
import MexicoDashboard from "./pages/MexicoDashboard";

function ProtectedRoute({ team, children }: { team: string; children: ReactElement }) {
  const saved = sessionStorage.getItem("team");
  if (saved !== team) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/usa" element={
          <ProtectedRoute team="USA"><UsaDashboard /></ProtectedRoute>
        } />
        <Route path="/mexico" element={
          <ProtectedRoute team="MEX"><MexicoDashboard /></ProtectedRoute>
        } />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
