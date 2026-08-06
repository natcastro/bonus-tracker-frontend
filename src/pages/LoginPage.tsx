import { useState } from "react";
import { supabase } from "../services/supabase";

const T = {
  bg: "#f5f5f7",
  surface: "#ffffff",
  p1: "#1d1d1f",
  p2: "#6e6e73",
  p3: "#aeaeb2",
  sep: "rgba(0,0,0,0.08)",
  blue: "#0071e3",
  red: "#ff3b30",
  shadow: "0 2px 8px rgba(0,0,0,0.08), 0 8px 32px rgba(0,0,0,0.06)",
  font: `-apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", Arial, sans-serif`,
};

export default function LoginPage({ errorMsg }: { errorMsg?: string }) {
  const [loading, setLoading] = useState(false);

  const handleMicrosoft = async () => {
    setLoading(true);
    await supabase.auth.signInWithOAuth({
      provider: "azure",
      options: {
        scopes: "email profile",
        redirectTo: window.location.origin,
      },
    });
  };

  return (
    <div style={{
      minHeight: "100vh", background: T.bg,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: T.font,
    }}>
      <div style={{
        background: T.surface, borderRadius: 20,
        padding: "48px 40px", width: "100%", maxWidth: 380,
        boxShadow: T.shadow, textAlign: "center",
      }}>
        {/* Logo / título */}
        <div style={{
          width: 60, height: 60, borderRadius: 14, background: "#1d1d1f",
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 20px", fontSize: 28,
        }}>💪</div>

        <h1 style={{ fontSize: 24, fontWeight: 700, color: T.p1, margin: "0 0 6px" }}>
          FTC Hub
        </h1>
        <p style={{ fontSize: 14, color: T.p2, margin: "0 0 32px" }}>
          Inicia sesión con tu cuenta de empresa
        </p>

        {/* Error de dominio */}
        {errorMsg && (
          <div style={{
            background: "rgba(255,59,48,0.08)", border: "1px solid rgba(255,59,48,0.2)",
            borderRadius: 10, padding: "12px 16px", marginBottom: 20,
            fontSize: 13, color: T.red, lineHeight: 1.4,
          }}>
            {errorMsg}
          </div>
        )}

        {/* Botón Microsoft */}
        <button
          onClick={handleMicrosoft}
          disabled={loading}
          style={{
            width: "100%", padding: "13px 20px",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
            background: loading ? T.bg : T.p1,
            color: "#fff", border: "none", borderRadius: 12,
            fontSize: 15, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer",
            fontFamily: T.font, transition: "opacity 0.15s",
            opacity: loading ? 0.6 : 1,
          }}
        >
          {/* Microsoft icon */}
          {!loading && (
            <svg width="18" height="18" viewBox="0 0 21 21" fill="none">
              <rect x="1" y="1" width="9" height="9" fill="#f25022"/>
              <rect x="11" y="1" width="9" height="9" fill="#7fba00"/>
              <rect x="1" y="11" width="9" height="9" fill="#00a4ef"/>
              <rect x="11" y="11" width="9" height="9" fill="#ffb900"/>
            </svg>
          )}
          {loading ? "Redirigiendo…" : "Continuar con Microsoft"}
        </button>

        <p style={{ fontSize: 12, color: T.p3, marginTop: 20, lineHeight: 1.5 }}>
          Solo cuentas <strong>@formatucuerpo.com</strong> tienen acceso.
        </p>
      </div>
    </div>
  );
}
