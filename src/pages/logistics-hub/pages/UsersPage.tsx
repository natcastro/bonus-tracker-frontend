import { useState } from "react";
import { HT } from "../theme";
import { useLogisticsHub } from "../context";
import type { HubRole } from "../types";

const ROLE_LABEL: Record<HubRole, string> = {
  admin: "Admin",
  logistics: "Logística",
  Belier: "Tienda Belier",
  Norte: "Tienda Norte",
  Plaza: "Tienda Plaza",
};

const ROLE_COLOR: Record<HubRole, { fg: string; bg: string }> = {
  admin: { fg: HT.primaryDark, bg: HT.primarySoft },
  logistics: { fg: HT.info, bg: HT.infoSoft },
  Belier: { fg: "#2563EB", bg: "#EAF1FF" },
  Norte: { fg: "#7C3AED", bg: "#F1EBFE" },
  Plaza: { fg: "#DB2777", bg: "#FCE7F3" },
};

const ROLE_OPTIONS: HubRole[] = ["admin", "logistics", "Belier", "Norte", "Plaza"];

function RoleBadge({ role }: { role: HubRole }) {
  const c = ROLE_COLOR[role];
  return (
    <span style={{
      fontFamily: HT.font, fontSize: 12, fontWeight: 700,
      color: c.fg, background: c.bg, borderRadius: 999, padding: "4px 12px",
    }}>{ROLE_LABEL[role]}</span>
  );
}

function NewUserForm({ onClose }: { onClose: () => void }) {
  const { addUser } = useLogisticsHub();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<HubRole>("logistics");

  const canSave = name.trim() && email.trim();

  const save = () => {
    if (!canSave) return;
    addUser({ name: name.trim(), email: email.trim(), role });
    onClose();
  };

  return (
    <div style={{
      background: HT.surface, border: `1px solid ${HT.border}`, borderRadius: HT.radiusLg,
      boxShadow: HT.shadow, padding: 22, marginBottom: 20,
    }}>
      <div style={{ fontFamily: HT.font, fontSize: 13, fontWeight: 700, color: HT.text1, marginBottom: 14 }}>
        Nuevo usuario
      </div>
      <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <input
          value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre"
          style={{
            flex: "1 1 180px", fontFamily: HT.font, fontSize: 13.5, padding: "10px 12px",
            border: `1px solid ${HT.border}`, borderRadius: 8, outline: "none",
          }}
        />
        <input
          value={email} onChange={(e) => setEmail(e.target.value)} placeholder="correo@formatucuerpo.com"
          style={{
            flex: "1 1 220px", fontFamily: HT.font, fontSize: 13.5, padding: "10px 12px",
            border: `1px solid ${HT.border}`, borderRadius: 8, outline: "none",
          }}
        />
      </div>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontFamily: HT.font, fontSize: 11.5, fontWeight: 700, color: HT.text3, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>
          Rol
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {ROLE_OPTIONS.map((r) => (
            <button key={r} onClick={() => setRole(r)} style={{
              fontFamily: HT.font, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
              padding: "6px 13px", borderRadius: 999,
              background: role === r ? HT.text1 : HT.surfaceAlt,
              color: role === r ? "#fff" : HT.text2, border: "none",
            }}>{ROLE_LABEL[r]}</button>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button onClick={onClose} style={{
          fontFamily: HT.font, fontSize: 13, fontWeight: 600, cursor: "pointer",
          background: "transparent", color: HT.text2, border: "none", padding: "9px 14px",
        }}>Cancelar</button>
        <button onClick={save} disabled={!canSave} style={{
          fontFamily: HT.font, fontSize: 13, fontWeight: 700, cursor: canSave ? "pointer" : "not-allowed",
          background: canSave ? HT.primary : HT.surfaceAlt, color: canSave ? "#fff" : HT.text3,
          border: "none", borderRadius: 8, padding: "9px 18px",
        }}>Crear usuario</button>
      </div>
    </div>
  );
}

export default function UsersPage() {
  const { users, removeUser, currentUser } = useLogisticsHub();
  const [showForm, setShowForm] = useState(false);

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "32px 24px 60px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontFamily: HT.font, fontSize: 26, fontWeight: 800, color: HT.text1, margin: 0, letterSpacing: "-0.01em" }}>
            Usuarios
          </h1>
          <p style={{ fontFamily: HT.font, fontSize: 14, color: HT.text2, margin: "4px 0 0" }}>
            Cada persona ve únicamente lo que corresponde a su rol.
          </p>
        </div>
        {!showForm && (
          <button onClick={() => setShowForm(true)} style={{
            fontFamily: HT.font, fontSize: 13.5, fontWeight: 700, cursor: "pointer",
            background: HT.primary, color: "#fff", border: "none", borderRadius: 8, padding: "10px 18px",
          }}>+ Nuevo usuario</button>
        )}
      </div>

      <div style={{
        background: HT.warnSoft, border: `1px solid rgba(217,119,6,0.2)`, borderRadius: 10,
        padding: "10px 14px", marginBottom: 20, fontFamily: HT.font, fontSize: 12.5, color: HT.warn,
      }}>
        Prototipo — la autenticación real (login por usuario y permisos) se conecta en una fase posterior. Por ahora esto define el modelo de roles.
      </div>

      {showForm && <NewUserForm onClose={() => setShowForm(false)} />}

      <div style={{ background: HT.surface, border: `1px solid ${HT.border}`, borderRadius: HT.radiusLg, boxShadow: HT.shadow, overflow: "hidden" }}>
        {users.map((u) => (
          <div key={u.id} style={{
            display: "flex", alignItems: "center", gap: 14, padding: "14px 20px",
            borderBottom: `1px solid ${HT.border}`,
          }}>
            <div style={{
              width: 34, height: 34, borderRadius: "50%", background: HT.surfaceAlt,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: HT.font, fontSize: 13, fontWeight: 700, color: HT.text1, flexShrink: 0,
            }}>{u.name.slice(0, 1)}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: HT.font, fontSize: 14, fontWeight: 600, color: HT.text1 }}>
                {u.name}{u.name === currentUser && <span style={{ color: HT.text3, fontWeight: 500 }}> (tú)</span>}
              </div>
              <div style={{ fontFamily: HT.font, fontSize: 12.5, color: HT.text3, marginTop: 1 }}>{u.email}</div>
            </div>
            <RoleBadge role={u.role} />
            {u.name !== currentUser && (
              <button onClick={() => removeUser(u.id)} title="Eliminar" style={{
                width: 28, height: 28, borderRadius: 7, border: "none", background: "transparent",
                color: HT.text3, cursor: "pointer", fontSize: 16,
              }}>×</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
