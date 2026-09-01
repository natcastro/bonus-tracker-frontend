import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getAllHubAccess, upsertHubAccess, deleteHubAccess } from "../services/api";
import type { HubAccessEntry } from "../services/api";
import { useHubAccess } from "./HubAccessContext";
import type { TeamRole } from "./HubAccessContext";

const TEAM_OPTIONS: { key: string; label: string }[] = [
  { key: "OPS",        label: "FTC USA — Operations" },
  { key: "APT",        label: "FTC USA — Strategy" },
  { key: "TKLIVES",    label: "FTC USA — TikTok Lives" },
  { key: "CSQUALITY",  label: "Operational Tools" },
  { key: "MGMT",       label: "Management" },
  { key: "LOGISTICS",  label: "Logística" },
];

const ALL_TEAMS_FOR_PREVIEW = [...TEAM_OPTIONS, { key: "MEX", label: "FTC México" }, { key: "MARKETING", label: "Marketing" }];

// Teams where access also needs a role — stored in hub_access as "TEAM:role" (e.g. "MEX:admin").
const ROLE_TEAMS: { key: string; label: string; adminLabel: string; staffLabel: string }[] = [
  { key: "MEX",       label: "FTC México", adminLabel: "Administrador", staffLabel: "Staff" },
  { key: "MARKETING", label: "Marketing",  adminLabel: "Laura (revisión)", staffLabel: "Diseño" },
];

type RoleValue = "admin" | "staff" | "";

function parseTeams(teams: string[]) {
  const plain = teams.filter((t) => t !== "ALL" && !ROLE_TEAMS.some((rt) => t.startsWith(`${rt.key}:`)));
  const roles: Record<string, RoleValue> = {};
  for (const rt of ROLE_TEAMS) {
    const found = teams.find((t) => t.startsWith(`${rt.key}:`));
    roles[rt.key] = found ? (found.split(":")[1] as RoleValue) : "";
  }
  return { plain, roles };
}

function formatTeamEntry(t: string): string {
  const roleTeam = ROLE_TEAMS.find((rt) => t.startsWith(`${rt.key}:`));
  if (roleTeam) {
    const role = t.split(":")[1];
    return `${roleTeam.label} (${role === "admin" ? roleTeam.adminLabel : roleTeam.staffLabel})`;
  }
  return TEAM_OPTIONS.find((o) => o.key === t)?.label ?? t;
}

function EntryForm({
  initial, onSave, onCancel,
}: {
  initial?: HubAccessEntry;
  onSave: (email: string, teams: string[], isAdmin: boolean) => Promise<void>;
  onCancel: () => void;
}) {
  const parsed = parseTeams(initial?.teams ?? []);
  const [email, setEmail] = useState(initial?.email ?? "");
  const [teams, setTeams] = useState<string[]>(parsed.plain);
  const [roles, setRoles] = useState<Record<string, RoleValue>>(parsed.roles);
  const [allAccess, setAllAccess] = useState(initial?.teams.includes("ALL") ?? false);
  const [isAdmin, setIsAdmin] = useState(initial?.isAdmin ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const toggleTeam = (key: string) => {
    setTeams(prev => prev.includes(key) ? prev.filter(t => t !== key) : [...prev, key]);
  };

  const submit = async () => {
    if (!email.trim() || !email.includes("@")) { setError("Escribe un correo válido."); return; }
    setSaving(true); setError("");
    try {
      const roleTeams = ROLE_TEAMS.filter(rt => roles[rt.key]).map(rt => `${rt.key}:${roles[rt.key]}`);
      const finalTeams = allAccess ? ["ALL"] : [...teams, ...roleTeams];
      await onSave(email.trim().toLowerCase(), finalTeams, isAdmin);
    } catch (err: any) {
      setError(err?.message ?? "No se pudo guardar.");
    } finally { setSaving(false); }
  };

  return (
    <div style={{ background: "#F8F9FA", border: "1px solid #E5E7EB", borderRadius: 10, padding: "1rem", marginBottom: "0.75rem" }}>
      <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 4 }}>Correo</label>
      <input
        type="email" value={email} onChange={e => setEmail(e.target.value)} disabled={!!initial}
        placeholder="nombre@formatucuerpo.com" autoFocus={!initial}
        className="form-control" style={{ marginBottom: "0.75rem" }}
      />

      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 8, cursor: "pointer" }}>
        <input type="checkbox" checked={allAccess} onChange={e => setAllAccess(e.target.checked)} />
        Acceso a todo (administrador de FTC Hub)
      </label>

      {!allAccess && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.4rem", marginBottom: "0.75rem" }}>
            {TEAM_OPTIONS.map(t => (
              <label key={t.key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "#374151", cursor: "pointer" }}>
                <input type="checkbox" checked={teams.includes(t.key)} onChange={() => toggleTeam(t.key)} />
                {t.label}
              </label>
            ))}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "0.75rem" }}>
            {ROLE_TEAMS.map(rt => (
              <div key={rt.key} style={{ border: "1px solid #E5E7EB", borderRadius: 8, padding: "0.5rem 0.7rem" }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: "#374151", marginBottom: 6 }}>{rt.label}</div>
                <div style={{ display: "flex", gap: "0.4rem" }}>
                  {(["", "staff", "admin"] as RoleValue[]).map(r => {
                    const label = r === "" ? "Sin acceso" : r === "staff" ? rt.staffLabel : rt.adminLabel;
                    const active = roles[rt.key] === r || (r === "" && !roles[rt.key]);
                    return (
                      <button
                        key={r || "none"}
                        type="button"
                        onClick={() => setRoles(prev => ({ ...prev, [rt.key]: r }))}
                        style={{
                          fontSize: 11.5, fontWeight: 600, padding: "0.3rem 0.6rem", borderRadius: 999, cursor: "pointer",
                          border: `1px solid ${active ? "#374151" : "#E5E7EB"}`,
                          background: active ? "#374151" : "#fff",
                          color: active ? "#fff" : "#6B7280",
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "#374151", marginBottom: "0.75rem", cursor: "pointer" }}>
        <input type="checkbox" checked={isAdmin} onChange={e => setIsAdmin(e.target.checked)} />
        Puede administrar accesos (ve este panel)
      </label>

      {error && <p className="error-msg">{error}</p>}

      <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
        <button className="btn btn-secondary btn-sm" onClick={onCancel}>Cancelar</button>
        <button className="btn btn-primary btn-sm" disabled={saving} onClick={submit}>{saving ? "..." : "Guardar"}</button>
      </div>
    </div>
  );
}

function ViewAsPicker({ onStart }: { onStart: (team: string, role: TeamRole) => void }) {
  const [team, setTeam] = useState("OPS");
  const [role, setRole] = useState<TeamRole>("admin");
  const isRoleTeam = ROLE_TEAMS.some((rt) => rt.key === team);
  const roleTeam = ROLE_TEAMS.find((rt) => rt.key === team);

  return (
    <div style={{ background: "#FFF7ED", border: "1px solid #FDE0B0", borderRadius: 10, padding: "1rem", marginBottom: "1rem" }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: "#7C2D12", marginBottom: 8 }}>👀 Ver el Hub como otra persona</div>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
        <select
          value={team}
          onChange={(e) => { setTeam(e.target.value); setRole("admin"); }}
          className="form-control"
          style={{ width: "auto", flex: "1 1 200px" }}
        >
          {ALL_TEAMS_FOR_PREVIEW.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
        {isRoleTeam && roleTeam && (
          <div style={{ display: "flex", gap: "0.3rem" }}>
            {(["staff", "admin"] as TeamRole[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                style={{
                  fontSize: 11.5, fontWeight: 600, padding: "0.3rem 0.6rem", borderRadius: 999, cursor: "pointer",
                  border: `1px solid ${role === r ? "#7C2D12" : "#E5E7EB"}`,
                  background: role === r ? "#7C2D12" : "#fff",
                  color: role === r ? "#fff" : "#6B7280",
                }}
              >
                {r === "staff" ? roleTeam.staffLabel : roleTeam.adminLabel}
              </button>
            ))}
          </div>
        )}
        <button className="btn btn-sm" style={{ background: "#7C2D12", color: "#fff" }} onClick={() => onStart(team, role)}>
          Ver así
        </button>
      </div>
    </div>
  );
}

export default function AccessAdminPanel({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const { startViewAs } = useHubAccess();
  const [entries, setEntries] = useState<HubAccessEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editingEmail, setEditingEmail] = useState<string | null>(null);

  const startPreview = (team: string, role: TeamRole) => {
    startViewAs(team, role);
    onClose();
    navigate("/");
  };

  const load = async () => {
    setLoading(true);
    try { setEntries(await getAllHubAccess()); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const save = async (email: string, teams: string[], isAdmin: boolean) => {
    await upsertHubAccess(email, teams, isAdmin);
    setAdding(false); setEditingEmail(null);
    await load();
  };

  const remove = async (email: string) => {
    if (!confirm(`¿Quitar el acceso de ${email}?`)) return;
    await deleteHubAccess(email);
    await load();
  };

  const teamLabels = (teams: string[]) => {
    if (teams.includes("ALL")) return "Todo";
    return teams.map(formatTeamEntry).join(", ") || "Sin equipos";
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "3rem 1.5rem" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(15,23,42,0.4)" }} />
      <div style={{ position: "relative", background: "#fff", borderRadius: 14, boxShadow: "0 24px 64px rgba(0,0,0,0.25)", padding: "1.5rem", width: 560, maxWidth: "100%", maxHeight: "85vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#0F172A" }}>Accesos a FTC Hub</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#6B7280" }}>×</button>
        </div>

        <ViewAsPicker onStart={startPreview} />

        {!adding && !editingEmail && (
          <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)} style={{ marginBottom: "1rem" }}>+ Agregar correo</button>
        )}

        {adding && (
          <EntryForm onSave={save} onCancel={() => setAdding(false)} />
        )}

        {loading ? (
          <p style={{ color: "#6B7280", fontSize: 13 }}>Cargando…</p>
        ) : entries.length === 0 ? (
          <p style={{ color: "#6B7280", fontSize: 13 }}>Todavía no hay correos con acceso.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {entries.map(e => (
              editingEmail === e.email ? (
                <EntryForm key={e.email} initial={e} onSave={save} onCancel={() => setEditingEmail(null)} />
              ) : (
                <div key={e.email} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", border: "1px solid #E5E7EB", borderRadius: 8, padding: "0.6rem 0.8rem" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: "#111827" }}>
                      {e.email} {e.isAdmin && <span style={{ fontSize: 10.5, fontWeight: 700, color: "#7c3aed", background: "#f1ebfe", borderRadius: 999, padding: "0.1rem 0.5rem", marginLeft: 6 }}>ADMIN</span>}
                    </div>
                    <div style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>{teamLabels(e.teams)}</div>
                  </div>
                  <div style={{ display: "flex", gap: "0.4rem" }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => setEditingEmail(e.email)}>Editar</button>
                    <button className="btn btn-sm btn-danger" onClick={() => remove(e.email)}>Eliminar</button>
                  </div>
                </div>
              )
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
