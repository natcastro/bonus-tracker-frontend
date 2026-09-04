import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useMsal } from "@azure/msal-react";
import { getHubAccessForEmail } from "../services/api";
import type { HubAccessEntry } from "../services/api";

export type TeamRole = "admin" | "staff" | "carol";
export interface ViewAs { team: string; role: TeamRole }

const VIEW_AS_KEY = "hub_view_as";

function readViewAs(): ViewAs | null {
  try {
    const raw = sessionStorage.getItem(VIEW_AS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

interface HubAccessCtxShape {
  email: string;
  name: string;
  access: HubAccessEntry | null;
  loading: boolean;
  hasTeam: (team: string) => boolean;
  getRole: (team: string) => TeamRole | null;
  viewAs: ViewAs | null;
  canPreview: boolean;
  startViewAs: (team: string, role: TeamRole) => void;
  stopViewAs: () => void;
}

const Ctx = createContext<HubAccessCtxShape | null>(null);

export function useHubAccess() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useHubAccess must be used within HubAccessProvider");
  return ctx;
}

export function HubAccessProvider({ children }: { children: ReactNode }) {
  const { accounts } = useMsal();
  const account = accounts[0];
  const email = account?.username ?? "";
  const name = account?.name ?? email;
  const [access, setAccess] = useState<HubAccessEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [viewAs, setViewAsState] = useState<ViewAs | null>(() => readViewAs());

  useEffect(() => {
    if (!email) { setLoading(false); return; }
    setLoading(true);
    getHubAccessForEmail(email).then(setAccess).catch(() => setAccess(null)).finally(() => setLoading(false));
  }, [email]);

  // Only a real admin can be previewing — otherwise ignore any leftover/tampered value.
  const activeViewAs = access?.isAdmin ? viewAs : null;

  const startViewAs = (team: string, role: TeamRole) => {
    if (!access?.isAdmin) return;
    const next: ViewAs = { team, role };
    sessionStorage.setItem(VIEW_AS_KEY, JSON.stringify(next));
    sessionStorage.removeItem("team");
    sessionStorage.removeItem("role");
    setViewAsState(next);
  };

  const stopViewAs = () => {
    sessionStorage.removeItem(VIEW_AS_KEY);
    sessionStorage.removeItem("team");
    sessionStorage.removeItem("role");
    setViewAsState(null);
  };

  const hasTeam = (team: string) => {
    if (!access) return false;
    if (activeViewAs) return activeViewAs.team === team;
    if (access.isAdmin || access.teams.includes("ALL")) return true;
    return access.teams.some((t) => t === team || t.startsWith(`${team}:`));
  };

  const getRole = (team: string): TeamRole | null => {
    if (!access) return null;
    if (activeViewAs) return activeViewAs.team === team ? activeViewAs.role : null;
    if (access.isAdmin || access.teams.includes("ALL")) return "admin";
    const entry = access.teams.find((t) => t.startsWith(`${team}:`));
    if (entry) return entry.split(":")[1] as TeamRole;
    return access.teams.includes(team) ? "admin" : null;
  };

  return (
    <Ctx.Provider value={{
      email, name, access, loading, hasTeam, getRole,
      viewAs: activeViewAs, canPreview: !!access?.isAdmin, startViewAs, stopViewAs,
    }}>
      {children}
    </Ctx.Provider>
  );
}
