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
  { key: "DEVOLUCIONES", label: "Devoluciones" },
];

const ALL_TEAMS_FOR_PREVIEW = [...TEAM_OPTIONS, { key: "MEX", label: "FTC México" }, { key: "MARKETING", label: "Marketing" }, { key: "HR", label: "HR (Recursos Humanos)" }];

// Teams where access also needs a role — stored in hub_access as "TEAM:role" (e.g. "MEX:admin").
// extraRoles lets a team offer extra role buttons beyond admin/staff (only Marketing needs this, for Carol).
const ROLE_TEAMS: { key: string; label: string; adminLabel: string; staffLabel: string; extraRoles?: { value: string; label: string }[] }[] = [
  { key: "MEX",       label: "FTC México", adminLabel: "Administrador", staffLabel: "Staff" },
  { key: "MARKETING", label: "Marketing",  adminLabel: "Laura (revisión)", staffLabel: "Diseño", extraRoles: [
    { value: "carol", label: "Karol (coordinación)" },
    { value: "video", label: "Video" },
  ] },
  { key: "HR", label: "HR (Recursos Humanos)", adminLabel: "William (jefe de HR)", staffLabel: "Contratista", extraRoles: [
    { value: "supervisor", label: "Supervisor" },
    { value: "accounting", label: "Contabilidad (Erika)" },
  ] },
];

type RoleValue = "admin" | "staff" | "carol" | "supervisor" | "accounting" | "video" | "";

function parseTeams(teams: string[]) {
  const plain = teams.filter((t) => t !== "ALL" && !ROLE_TEAMS.some((rt) => t.startsWith(`${rt.key}:`)));
  const roles: Record<string, RoleValue> = {};
  for (const rt of ROLE_TEAMS) {
    const found = teams.find((t) => t.startsWith(`${rt.key}:`));
    roles[rt.key] = found ? (found.split(":")[1] as RoleValue) : "";
  }
  return { plain, roles };
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
                  {(["", "staff", "admin", ...(rt.extraRoles?.map(r => r.value) ?? [])] as RoleValue[]).map(r => {
                    const label = r === "" ? "Sin acceso" : r === "staff" ? rt.staffLabel : r === "admin" ? rt.adminLabel : rt.extraRoles?.find(x => x.value === r)?.label ?? r;
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
            {([...(["staff", "admin"] as TeamRole[]), ...(roleTeam.extraRoles?.map(r => r.value as TeamRole) ?? [])]).map((r) => (
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
                {r === "staff" ? roleTeam.staffLabel : r === "admin" ? roleTeam.adminLabel : roleTeam.extraRoles?.find(x => x.value === r)?.label}
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

const SHORT: Record<string, string> = {
  OPS: "Operations", APT: "Strategy", TKLIVES: "TikTok Lives", CSQUALITY: "Op. Tools", MGMT: "Management",
  LOGISTICS: "Logística", DEVOLUCIONES: "Devoluciones", MEX: "México", MARKETING: "Marketing", HR: "HR",
};
const ROLE_SHORT: Record<string, string> = { admin: "Admin", staff: "Staff", carol: "Karol", supervisor: "Supervisor", accounting: "Contabilidad" };
const HR_ROLE_SHORT: Record<string, string> = { admin: "Jefe de HR", staff: "Contratista", supervisor: "Supervisor", accounting: "Contabilidad" };
const MKT_ROLE_SHORT: Record<string, string> = { admin: "Laura", staff: "Diseño", carol: "Karol", video: "Video" };
const TEAM_COLOR: Record<string, string> = {
  OPS: "#2563eb", APT: "#7c3aed", TKLIVES: "#db2777", CSQUALITY: "#0891b2", MGMT: "#475569",
  LOGISTICS: "#b45309", DEVOLUCIONES: "#b45309", MEX: "#15803d", MARKETING: "#3E6B45", HR: "#0f766e", ALL: "#111827",
};
const pillOf = (t: string): { key: string; text: string } => {
  if (t === "ALL") return { key: "ALL", text: "Todo" };
  const [key, role] = t.split(":");
  const base = SHORT[key] ?? key;
  if (!role) return { key, text: base };
  const r = key === "HR" ? HR_ROLE_SHORT[role] : key === "MARKETING" ? MKT_ROLE_SHORT[role] : ROLE_SHORT[role];
  return { key, text: `${base} · ${r ?? role}` };
};
const initials = (n: string) => n.replace(/[—–-].*$/, "").trim().split(/[\s@._]+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase()).join("") || "?";
const hue = (n: string) => { let h = 0; for (const c of n) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };

const ACC_CSS = `
.acc-modal { position: relative; background: #fff; border-radius: 16px; box-shadow: 0 24px 64px rgba(15,23,42,.28); width: 760px; max-width: 100%; max-height: 88vh; display: flex; flex-direction: column; overflow: hidden; animation: acc-in .2s cubic-bezier(.23,1,.32,1) backwards; }
@keyframes acc-in { from { opacity: 0; transform: translateY(8px) scale(.985); } }
@media (prefers-reduced-motion: reduce) { .acc-modal { animation: none; } }
.acc-head { padding: 1.2rem 1.5rem .9rem; border-bottom: 1px solid #eef0f3; }
.acc-title { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.acc-title h2 { margin: 0; font-size: 1.15rem; font-weight: 800; color: #0f172a; letter-spacing: -.01em; }
.acc-title small { font-weight: 600; color: #94a3b8; margin-left: 8px; font-size: .8rem; }
.acc-x { background: none; border: none; width: 32px; height: 32px; border-radius: 8px; font-size: 20px; cursor: pointer; color: #64748b; transition: background .15s; }
.acc-x:hover { background: #f1f5f9; }
.acc-bar { display: flex; gap: 8px; margin-top: .9rem; flex-wrap: wrap; }
.acc-search { flex: 1 1 240px; min-width: 0; padding: .55rem .8rem .55rem 2.1rem; border: 1px solid #e2e8f0; border-radius: 10px; font-size: .88rem; background: #f8fafc url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round'%3E%3Ccircle cx='7' cy='7' r='5'/%3E%3Cpath d='m11 11 3.5 3.5'/%3E%3C/svg%3E") 10px 50% no-repeat; outline: none; transition: border-color .15s, box-shadow .15s; }
.acc-search:focus { border-color: #0f766e; box-shadow: 0 0 0 3px rgba(15,118,110,.15); background-color: #fff; }
.acc-btn { border: 1px solid #e2e8f0; background: #fff; color: #0f172a; padding: .5rem .85rem; border-radius: 10px; font-size: .82rem; font-weight: 700; cursor: pointer; transition: background .15s, transform .1s; white-space: nowrap; }
.acc-btn:hover { background: #f8fafc; } .acc-btn:active { transform: scale(.97); }
.acc-btn--dark { background: #111827; color: #fff; border-color: #111827; } .acc-btn--dark:hover { background: #1f2937; }
.acc-chips { display: flex; gap: 6px; margin-top: .8rem; overflow-x: auto; padding-bottom: 2px; scrollbar-width: thin; }
.acc-chip { flex: none; border: 1px solid #e2e8f0; background: #fff; color: #475569; border-radius: 999px; padding: .28rem .7rem; font-size: .78rem; font-weight: 700; cursor: pointer; transition: background .15s, color .15s, border-color .15s; }
.acc-chip b { font-weight: 700; opacity: .55; margin-left: 4px; }
.acc-chip:hover { background: #f8fafc; }
.acc-chip[aria-pressed="true"] { background: #111827; border-color: #111827; color: #fff; }
.acc-body { padding: 1rem 1.5rem 1.4rem; overflow-y: auto; flex: 1; }
.acc-list { display: flex; flex-direction: column; }
.acc-row { display: flex; align-items: center; gap: 12px; padding: .7rem .4rem; border-bottom: 1px solid #f1f5f9; border-radius: 10px; transition: background .15s; }
.acc-row:hover { background: #f8fafc; }
.acc-av { flex: none; width: 38px; height: 38px; border-radius: 50%; display: grid; place-items: center; font-size: .78rem; font-weight: 800; }
.acc-main { flex: 1; min-width: 0; }
.acc-name { font-weight: 700; font-size: .92rem; color: #0f172a; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.acc-mail { font-size: .78rem; color: #94a3b8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.acc-pills { display: flex; gap: 5px; flex-wrap: wrap; margin-top: 5px; }
.acc-pill { font-size: .7rem; font-weight: 700; padding: .12rem .5rem; border-radius: 999px; }
.acc-adm { font-size: .64rem; font-weight: 800; letter-spacing: .04em; color: #6d28d9; background: #f1ebfe; border-radius: 999px; padding: .1rem .5rem; }
.acc-act { display: flex; gap: 4px; flex: none; opacity: .0; transition: opacity .15s; }
.acc-row:hover .acc-act, .acc-row:focus-within .acc-act { opacity: 1; }
@media (hover: none) { .acc-act { opacity: 1; } }
.acc-link { background: none; border: none; padding: .35rem .6rem; border-radius: 8px; font-size: .8rem; font-weight: 700; cursor: pointer; color: #334155; transition: background .15s; }
.acc-link:hover { background: #eef2f7; } .acc-link--bad { color: #b91c1c; } .acc-link--bad:hover { background: #fef2f2; }
.acc-empty { text-align: center; color: #94a3b8; font-size: .9rem; padding: 2.2rem 0; }
@media (max-width: 560px) { .acc-head, .acc-body { padding-left: 1rem; padding-right: 1rem; } .acc-act { opacity: 1; } }
`;

export default function AccessAdminPanel({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const { startViewAs } = useHubAccess();
  const [entries, setEntries] = useState<HubAccessEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editingEmail, setEditingEmail] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [showView, setShowView] = useState(false);

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

  const teamKeys = (e: HubAccessEntry) => e.teams.map(t => t.split(":")[0]);
  const isAdminEntry = (e: HubAccessEntry) => e.isAdmin || e.teams.includes("ALL");
  const chips: { key: string; label: string; count: number }[] = [{ key: "all", label: "Todos", count: entries.length }];
  if (entries.some(isAdminEntry)) chips.push({ key: "admin", label: "Administradores", count: entries.filter(isAdminEntry).length });
  Object.keys(SHORT).forEach(k => {
    const n = entries.filter(e => teamKeys(e).includes(k)).length;
    if (n) chips.push({ key: k, label: SHORT[k], count: n });
  });

  const q = search.trim().toLowerCase();
  const visibleEntries = entries.filter(e => {
    if (filter === "admin" ? !isAdminEntry(e) : filter !== "all" && !teamKeys(e).includes(filter)) return false;
    if (!q) return true;
    return e.email.toLowerCase().includes(q) || e.nickname.toLowerCase().includes(q) || e.teams.map(t => pillOf(t).text).join(" ").toLowerCase().includes(q);
  });

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "3rem 1.5rem" }}>
      <style>{ACC_CSS}</style>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(15,23,42,0.4)" }} />
      <div className="acc-modal" role="dialog" aria-label="Accesos a FTC Hub">
        <div className="acc-head">
          <div className="acc-title">
            <h2>Accesos a FTC Hub<small>{entries.length} personas</small></h2>
            <button className="acc-x" onClick={onClose} aria-label="Cerrar">×</button>
          </div>
          <div className="acc-bar">
            <input className="acc-search" type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre, correo o equipo…" aria-label="Buscar" />
            <button className="acc-btn" onClick={() => setShowView(v => !v)} aria-expanded={showView}>👀 Ver como…</button>
            <button className="acc-btn acc-btn--dark" onClick={() => { setAdding(true); setEditingEmail(null); }}>+ Agregar correo</button>
          </div>
          {!loading && entries.length > 0 && (
            <div className="acc-chips" role="group" aria-label="Filtrar por equipo">
              {chips.map(c => (
                <button key={c.key} className="acc-chip" aria-pressed={filter === c.key} onClick={() => setFilter(c.key)}>{c.label}<b>{c.count}</b></button>
              ))}
            </div>
          )}
        </div>

        <div className="acc-body">
          {showView && <ViewAsPicker entries={entries} onStart={startPreview} />}
          {adding && <EntryForm onSave={save} onCancel={() => setAdding(false)} />}

          {loading ? (
            <p className="acc-empty">Cargando…</p>
          ) : entries.length === 0 ? (
            <p className="acc-empty">Todavía no hay correos con acceso.</p>
          ) : visibleEntries.length === 0 ? (
            <p className="acc-empty">Nadie coincide con esos filtros.</p>
          ) : (
            <div className="acc-list">
              {visibleEntries.map(e => editingEmail === e.email ? (
                <EntryForm key={e.email} initial={e} onSave={save} onCancel={() => setEditingEmail(null)} />
              ) : (
                <div key={e.email} className="acc-row">
                  <div className="acc-av" style={{ background: `hsl(${hue(e.email)} 70% 92%)`, color: `hsl(${hue(e.email)} 60% 30%)` }}>{initials(e.nickname || e.email)}</div>
                  <div className="acc-main">
                    <div className="acc-name">{e.nickname || e.email}{e.isAdmin && <span className="acc-adm">ADMIN</span>}</div>
                    {e.nickname && <div className="acc-mail">{e.email}</div>}
                    <div className="acc-pills">
                      {e.teams.length === 0 && <span className="acc-pill" style={{ background: "#f1f5f9", color: "#64748b" }}>Sin equipos</span>}
                      {e.teams.map(t => { const p = pillOf(t); const c = TEAM_COLOR[p.key] ?? "#475569"; return <span key={t} className="acc-pill" style={{ background: `${c}14`, color: c }}>{p.text}</span>; })}
                    </div>
                  </div>
                  <div className="acc-act">
                    <button className="acc-link" onClick={() => { setEditingEmail(e.email); setAdding(false); }}>Editar</button>
                    <button className="acc-link acc-link--bad" onClick={() => remove(e.email)}>Eliminar</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
