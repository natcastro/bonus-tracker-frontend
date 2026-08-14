import { Routes, Route, Navigate } from "react-router-dom";
import { HT } from "./theme";
import { LogisticsHubProvider, useLogisticsHub } from "./context";
import LogisticsHubLogin from "./LogisticsHubLogin";
import Navbar from "./components/Navbar";
import OrderDetailDrawer from "./components/OrderDetailDrawer";
import HomePage from "./pages/HomePage";
import PendingPage from "./pages/PendingPage";
import CompletedPage from "./pages/CompletedPage";
import UsersPage from "./pages/UsersPage";

function Shell() {
  const { selectedOrderId, authedUser } = useLogisticsHub();

  if (!authedUser) return <LogisticsHubLogin />;

  return (
    <div style={{ minHeight: "100vh", background: HT.bg }}>
      <Navbar />
      <Routes>
        <Route index element={<Navigate to="home" replace />} />
        <Route path="home" element={<HomePage />} />
        <Route path="assign" element={<Navigate to="../home" replace />} />
        <Route path="pending" element={<PendingPage />} />
        <Route path="completed" element={<CompletedPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="*" element={<Navigate to="home" replace />} />
      </Routes>
      {selectedOrderId && <OrderDetailDrawer />}
    </div>
  );
}

export default function LogisticsHubApp() {
  return (
    <LogisticsHubProvider>
      <Shell />
    </LogisticsHubProvider>
  );
}
