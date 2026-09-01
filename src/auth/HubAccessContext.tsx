import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useMsal } from "@azure/msal-react";
import { getHubAccessForEmail } from "../services/api";
import type { HubAccessEntry } from "../services/api";

export type TeamRole = "admin" | "staff";

interface HubAccessCtxShape {
  email: string;
  name: string;
  access: HubAccessEntry | null;
  loading: boolean;
  hasTeam: (team: string) => boolean;
  getRole: (team: string) => TeamRole | null;
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

  useEffect(() => {
    if (!email) { setLoading(false); return; }
    setLoading(true);
    getHubAccessForEmail(email).then(setAccess).catch(() => setAccess(null)).finally(() => setLoading(false));
  }, [email]);

  const hasTeam = (team: string) => {
    if (!access) return false;
    if (access.isAdmin || access.teams.includes("ALL")) return true;
    return access.teams.some((t) => t === team || t.startsWith(`${team}:`));
  };

  const getRole = (team: string): TeamRole | null => {
    if (!access) return null;
    if (access.isAdmin || access.teams.includes("ALL")) return "admin";
    const entry = access.teams.find((t) => t.startsWith(`${team}:`));
    if (entry) return entry.split(":")[1] as TeamRole;
    return access.teams.includes(team) ? "admin" : null;
  };

  return <Ctx.Provider value={{ email, name, access, loading, hasTeam, getRole }}>{children}</Ctx.Provider>;
}
