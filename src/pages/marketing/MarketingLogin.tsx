import { useState } from "react";
import { MT } from "./theme";
import { useMarketing } from "./context";

export default function MarketingLogin() {
  const { login } = useMarketing();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const res = login(username, password);
    if (!res.ok) setError(res.error ?? "No se pudo iniciar sesión.");
  };

  return (
    <div style={{
      minHeight: "100vh", background: MT.bg, display: "flex",
      alignItems: "center", justifyContent: "center", padding: "2rem", fontFamily: MT.font,
    }}>
      <div style={{
        background: MT.surface, borderRadius: MT.radiusLg, boxShadow: MT.shadowLg,
        padding: "40px 36px", width: "100%", maxWidth: 380, border: `1px solid ${MT.border}`,
      }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12, background: MT.primary,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#fff", fontSize: 19, fontWeight: 800, margin: "0 auto 18px",
        }}>M</div>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: MT.text1, textAlign: "center", margin: "0 0 4px", letterSpacing: "-0.01em" }}>
          Marketing
        </h1>
        <p style={{ fontSize: 13, color: MT.text2, textAlign: "center", margin: "0 0 26px" }}>
          Inicia sesión para continuar
        </p>

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: MT.text2, display: "block", marginBottom: 6 }}>
              Usuario
            </label>
            <input
              type="text" value={username} onChange={(e) => { setUsername(e.target.value); setError(""); }}
              placeholder="Laura o Diseño" autoFocus required
              style={{
                width: "100%", fontFamily: MT.font, fontSize: 14, padding: "10px 12px",
                border: `1px solid ${MT.border}`, borderRadius: 8, outline: "none", boxSizing: "border-box",
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: MT.text2, display: "block", marginBottom: 6 }}>
              Contraseña
            </label>
            <input
              type="password" value={password} onChange={(e) => { setPassword(e.target.value); setError(""); }}
              placeholder="••••••" required
              style={{
                width: "100%", fontFamily: MT.font, fontSize: 14, padding: "10px 12px",
                border: `1px solid ${MT.border}`, borderRadius: 8, outline: "none", boxSizing: "border-box",
              }}
            />
          </div>

          {error && (
            <div style={{
              fontSize: 12.5, color: MT.danger, background: MT.dangerSoft,
              borderRadius: 8, padding: "8px 12px",
            }}>{error}</div>
          )}

          <button type="submit" style={{
            fontFamily: MT.font, fontSize: 14, fontWeight: 700, cursor: "pointer",
            background: MT.primary, color: "#fff", border: "none", borderRadius: 8, padding: "11px 0", marginTop: 6,
          }}>Entrar</button>
        </form>
      </div>
    </div>
  );
}
