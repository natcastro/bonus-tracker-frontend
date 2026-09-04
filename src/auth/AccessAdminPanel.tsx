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
// extraRole lets a team offer a third role button beyond admin/staff (only Marketing needs this, for Carol).
const ROLE_TEAMS: { key: string; label: string; adminLabel: string; staffLabel: string; extraRole?: { value: string; label: string } }[] = [
  { key: "MEX",       label: "FTC México", adminLabel: "Administrador", staffLabel: "Staff" },
  { key: "MARKETING", label: "Marketing",  adminLabel: "Laura (revisión)", staffLabel: "Diseño", extraRole: { value: "carol", label: "Karol (coordinación)" } },
];

type RoleValue = "admin" | "staff" | "carol" | "";

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
    const label = role === "admin" ? roleTeam.adminLabel : role === "staff" ? roleTeam.staffLabel : roleTeam.extraRole?.label ?? role;
    return `${roleTeam.label} (${label})`;
  }
  return TEAM_OPTIONS.find((o) => o.key === t)?.label ?? t;
}

function EntryForm({
  initial, onSave, onCancel,
}: {
  initial?: HubAccessEntry;
  onSave: (email: string, teams: string[], isAdmin: boolean, nickname: string) => Promise<void>;
  onCancel: () => void;
}) {
  const parsed = parseTeams(initial?.teams ?? []);
  const [email, setEmail] = useState(initial?.email ?? "");
  const [nickname, setNickname] = useState(initial?.nickname ?? "");
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
      await onSave(email.trim().toLowerCase(), finalTeams, isAdmin, nickname.trim());
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

      <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 4 }}>Apodo / nombre para mostrar (opcional)</label>
      <input
        type="text" value={nickname} onChange={e => setNickname(e.target.value)}
        placeholder="Ej. Juanita"
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
                  {(["", "staff", "admin", ...(rt.extraRole ? [rt.extraRole.value] : [])] as RoleValue[]).map(r => {
                    const label = r === "" ? "Sin acceso" : r === "staff" ? rt.staffLabel : r === "admin" ? rt.adminLabel : rt.extraRole?.label ?? r;
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

function ViewAsPicker({ entries, onStart }: { entries: HubAccessEntry[]; onStart: (team: string, role: TeamRole, email?: string) => void }) {
  const [team, setTeam] = useState("OPS");
  const [role, setRole] = useState<TeamRole>("admin");
  const [personEmail, setPersonEmail] = useState("");
  const isRoleTeam = ROLE_TEAMS.some((rt) => rt.key === team);
  const roleTeam = ROLE_TEAMS.find((rt) => rt.key === team);

  // Everyone whose Hub Access actually matches this exact team+role — when more than one person
  // shares it (like Marketing's 3 Diseño people), previewing needs to know specifically who.
  const matchingPeople = isRoleTeam
    ? entries.filter((e) => e.teams.includes(`${team}:${role}`))
    : [];

  const changeTeam = (t: string) => { setTeam(t); setRole("admin"); setPersonEmail(""); };
  const changeRole = (r: TeamRole) => { setRole(r); setPersonEmail(""); };

  return (
    <div style={{ background: "#FFF7ED", border: "1px solid #FDE0B0", borderRadius: 10, padding: "1rem", marginBottom: "1rem" }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: "#7C2D12", marginBottom: 8 }}>👀 Ver el Hub como otra persona</div>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
        <select
          value={team}
          onChange={(e) => changeTeam(e.target.value)}
          className="form-control"
          style={{ width: "auto", flex: "1 1 200px" }}
        >
          {ALL_TEAMS_FOR_PREVIEW.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
        {isRoleTeam && roleTeam && (
          <div style={{ display: "flex", gap: "0.3rem" }}>
            {([...(["staff", "admin"] as TeamRole[]), ...(roleTeam.extraRole ? [roleTeam.extraRole.value as TeamRole] : [])]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => changeRole(r)}
                style={{
                  fontSize: 11.5, fontWeight: 600, padding: "0.3rem 0.6rem", borderRadius: 999, cursor: "pointer",
                  border: `1px solid ${role === r ? "#7C2D12" : "#E5E7EB"}`,
                  background: role === r ? "#7C2D12" : "#fff",
                  color: role === r ? "#fff" : "#6B7280",
                }}
              >
                {r === "staff" ? roleTeam.staffLabel : r === "admin" ? roleTeam.adminLabel : roleTeam.extraRole?.label}
              </button>
            ))}
          </div>
        )}
        {matchingPeople.length > 1 && (
          <select
            value={personEmail}
            onChange={(e) => setPersonEmail(e.target.value)}
            className="form-control"
            style={{ width: "auto", flex: "1 1 180px" }}
          >
            <option value="">¿Cuál persona?</option>
            {matchingPeople.map((p) => <option key={p.email} value={p.email}>{p.nickname || p.email}</option>)}
          </select>
        )}
        <button
          className="btn btn-sm" style={{ background: "#7C2D12", color: "#fff" }}
          disabled={matchingPeople.length > 1 && !personEmail}
          onClick={() => onStart(team, role, matchingPeople.length === 1 ? matchingPeople[0].email : personEmail || undefined)}
        >
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
  const [search, setSearch] = useState("");

  const startPreview = (team: string, role: TeamRole, email?: string) => {
    startViewAs(team, role, email);
    onClose();
    navigate("/");
  };

  const load = async () => {
    setLoading(true);
    try { setEntries(await getAllHubAccess()); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const save = async (email: string, teams: string[], isAdmin: boolean, nickname: string) => {
    await upsertHubAccess(email, teams, isAdmin, nickname);
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

  const q = search.trim().toLowerCase();
  const visibleEntries = q
    ? entries.filter(e => e.email.toLowerCase().includes(q) || e.nickname.toLowerCase().includes(q) || teamLabels(e.teams).toLowerCase().includes(q))
    : entries;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "3rem 1.5rem" }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(15,23,42,0.4)" }} />
      <div style={{ position: "relative", background: "#fff", borderRadius: 14, boxShadow: "0 24px 64px rgba(0,0,0,0.25)", padding: "1.5rem", width: 560, maxWidth: "100%", maxHeight: "85vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#0F172A" }}>Accesos a FTC Hub</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#6B7280" }}>×</button>
        </div>

        <ViewAsPicker entries={entries} onStart={startPreview} />

        {!adding && !editingEmail && (
          <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)} style={{ marginBottom: "1rem" }}>+ Agregar correo</button>
        )}

        {adding && (
          <EntryForm onSave={save} onCancel={() => setAdding(false)} />
        )}

        {!loading && entries.length > 0 && (
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por correo, apodo o equipo/rol..."
            className="form-control" style={{ marginBottom: "0.75rem" }}
          />
        )}

        {loading ? (
          <p style={{ color: "#6B7280", fontSize: 13 }}>Cargando…</p>
        ) : entries.length === 0 ? (
          <p style={{ color: "#6B7280", fontSize: 13 }}>Todavía no hay correos con acceso.</p>
        ) : visibleEntries.length === 0 ? (
          <p style={{ color: "#6B7280", fontSize: 13 }}>Ningún correo coincide con "{search}".</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {visibleEntries.map(e => (
              editingEmail === e.email ? (
                <EntryForm key={e.email} initial={e} onSave={save} onCancel={() => setEditingEmail(null)} />
              ) : (
                <div key={e.email} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", border: "1px solid #E5E7EB", borderRadius: 8, padding: "0.6rem 0.8rem" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: "#111827" }}>
                      {e.nickname || e.email} {e.isAdmin && <span style={{ fontSize: 10.5, fontWeight: 700, color: "#7c3aed", background: "#f1ebfe", borderRadius: 999, padding: "0.1rem 0.5rem", marginLeft: 6 }}>ADMIN</span>}
                    </div>
                    {e.nickname && <div style={{ fontSize: 12, color: "#9CA3AF", marginTop: 1 }}>{e.email}</div>}
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
