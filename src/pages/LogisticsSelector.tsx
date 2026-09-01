import { useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import { PackageIcon, HubIcon } from "../components/icons";

const T = {
  bg: "#FFFFFF",
  text1: "#0F172A",
  text2: "#6B7280",
  border: "#EEEEEE",
  font: `-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", Arial, sans-serif`,
};

function OptionCard({
  icon, title, subtitle, tag, tagColor, color, onClick,
}: {
  icon: ReactNode; title: string; subtitle: string; tag: string; tagColor: string; color: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "#fff", border: `1px solid ${T.border}`, borderLeft: `3px solid ${color}`,
        borderRadius: 10, padding: "1.75rem", cursor: "pointer", textAlign: "left",
        width: 300, display: "flex", flexDirection: "column", gap: "0.9rem",
        boxShadow: "0 1px 2px rgba(17,24,39,0.04)", transition: "box-shadow 0.2s, transform 0.15s",
        fontFamily: T.font,
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 8px 24px ${color}22`;
        (e.currentTarget as HTMLButtonElement).style.transform = "translateY(-2px)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.boxShadow = "0 1px 2px rgba(17,24,39,0.04)";
        (e.currentTarget as HTMLButtonElement).style.transform = "translateY(0)";
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <span style={{
          width: 42, height: 42, borderRadius: 8, background: color + "12",
          display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>{icon}</span>
        <span style={{
          fontSize: 10.5, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase",
          color: tagColor, background: `${tagColor}18`, borderRadius: 999, padding: "3px 10px",
        }}>{tag}</span>
      </div>
      <div>
        <div style={{ fontSize: "1.15rem", fontWeight: 700, color: T.text1, letterSpacing: "-0.01em" }}>{title}</div>
        <div style={{ fontSize: "0.88rem", color: T.text2, marginTop: 6, lineHeight: 1.5 }}>{subtitle}</div>
      </div>
      <div style={{ fontSize: "0.82rem", fontWeight: 600, color, marginTop: 6 }}>Entrar →</div>
    </button>
  );
}

export default function LogisticsSelector() {
  const navigate = useNavigate();

  const logout = () => {
    sessionStorage.removeItem("team");
    sessionStorage.removeItem("role");
    navigate("/");
  };

  return (
    <div style={{
      minHeight: "100vh", background: T.bg, display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", padding: "2rem 1.5rem", position: "relative", overflow: "hidden",
    }}>
      <div aria-hidden style={{
        position: "fixed", top: "-12%", right: "-10%", width: 460, height: 460, borderRadius: "50%",
        background: "radial-gradient(circle, #B4530926 0%, transparent 70%)",
        filter: "blur(40px)", pointerEvents: "none", zIndex: 0,
      }} />
      <div aria-hidden style={{
        position: "fixed", bottom: "-14%", left: "-8%", width: 480, height: 480, borderRadius: "50%",
        background: "radial-gradient(circle, #4F46E522 0%, transparent 70%)",
        filter: "blur(40px)", pointerEvents: "none", zIndex: 0,
      }} />

      <button onClick={logout} style={{
        position: "absolute", top: 24, right: 28, background: "none", border: "none", zIndex: 1,
        color: T.text2, fontFamily: T.font, fontSize: 13, fontWeight: 600, cursor: "pointer",
      }}>Salir</button>

      <div style={{ textAlign: "center", marginBottom: "2.5rem", position: "relative", zIndex: 1 }}>
        <div style={{
          fontSize: "0.78rem", fontWeight: 700, letterSpacing: "0.15em", color: "#b45309",
          textTransform: "uppercase", marginBottom: "0.5rem", fontFamily: T.font,
        }}>Logística</div>
        <h1 style={{ fontSize: "2.2rem", fontWeight: 800, color: T.text1, letterSpacing: "-0.02em", margin: 0, fontFamily: T.font }}>
          ¿Qué quieres usar?
        </h1>
        <p style={{ color: T.text2, marginTop: "0.6rem", fontSize: "0.95rem", fontFamily: T.font }}>
          Selecciona el sistema de logística
        </p>
      </div>

      <div style={{ display: "flex", gap: "1.25rem", flexWrap: "wrap", justifyContent: "center", position: "relative", zIndex: 1 }}>
        <OptionCard
          icon={<PackageIcon color="#b45309" />}
          title="Logística Actual"
          subtitle="Gestión de envíos y productos — el sistema que ya usas hoy."
          tag="En uso"
          tagColor="#b45309"
          color="#b45309"
          onClick={() => navigate("/logistics/current")}
        />
        <OptionCard
          icon={<HubIcon color="#4F46E5" />}
          title="Logistics Hub"
          subtitle="Nuevo sistema de gestión de órdenes: TikTok, Amazon y Shopify en un solo lugar."
          tag="Prototipo UI"
          tagColor="#4F46E5"
          color="#4F46E5"
          onClick={() => navigate("/logistics/hub/home")}
        />
      </div>
    </div>
  );
}
