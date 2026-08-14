import { useState } from "react";
import { HT } from "./theme";
import { useLogisticsHub } from "./context";

export default function LogisticsHubLogin() {
  const { login, users } = useLogisticsHub();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const res = login(email, password);
    if (!res.ok) setError(res.error ?? "No se pudo iniciar sesión.");
  };

  return (
    <div style={{
      minHeight: "100vh", background: HT.bg, display: "flex",
      alignItems: "center", justifyContent: "center", padding: "2rem", fontFamily: HT.font,
    }}>
      <div style={{
        background: HT.surface, borderRadius: HT.radiusLg, boxShadow: HT.shadowLg,
        padding: "40px 36px", width: "100%", maxWidth: 380,
      }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12, background: HT.primary,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#fff", fontSize: 19, fontWeight: 800, margin: "0 auto 18px",
        }}>L</div>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: HT.text1, textAlign: "center", margin: "0 0 4px", letterSpacing: "-0.01em" }}>
          Logistics Hub
        </h1>
        <p style={{ fontSize: 13, color: HT.text2, textAlign: "center", margin: "0 0 26px" }}>
          Inicia sesión para continuar
        </p>

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: HT.text2, display: "block", marginBottom: 6 }}>
              Correo
            </label>
            <input
              type="email" value={email} onChange={(e) => { setEmail(e.target.value); setError(""); }}
              placeholder="natalie@formatucuerpo.com" autoFocus required
              style={{
                width: "100%", fontFamily: HT.font, fontSize: 14, padding: "10px 12px",
                border: `1px solid ${HT.border}`, borderRadius: 8, outline: "none", boxSizing: "border-box",
              }}
            />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: HT.text2, display: "block", marginBottom: 6 }}>
              Contraseña
            </label>
            <input
              type="password" value={password} onChange={(e) => { setPassword(e.target.value); setError(""); }}
              placeholder="••••••" required
              style={{
                width: "100%", fontFamily: HT.font, fontSize: 14, padding: "10px 12px",
                border: `1px solid ${HT.border}`, borderRadius: 8, outline: "none", boxSizing: "border-box",
              }}
            />
          </div>

          {error && (
            <div style={{
              fontSize: 12.5, color: HT.danger, background: HT.dangerSoft,
              borderRadius: 8, padding: "8px 12px",
            }}>{error}</div>
          )}

          <button type="submit" style={{
            fontFamily: HT.font, fontSize: 14, fontWeight: 700, cursor: "pointer",
            background: HT.primary, color: "#fff", border: "none", borderRadius: 8, padding: "11px 0", marginTop: 6,
          }}>Entrar</button>
        </form>

        <div style={{
          marginTop: 22, paddingTop: 18, borderTop: `1px solid ${HT.border}`,
          fontSize: 11.5, color: HT.text3, lineHeight: 1.6,
        }}>
          Demo — cualquier usuario de la lista de Usuarios puede entrar con la contraseña <strong style={{ color: HT.text2 }}>123456</strong>.
          <br />Prueba: {users.slice(0, 2).map((u) => u.email).join(" · ")}
        </div>
      </div>
    </div>
  );
}
