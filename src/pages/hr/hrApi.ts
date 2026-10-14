import { msalInstance } from "../../auth/msalInstance";
import { loginRequest } from "../../auth/msalConfig";
import type { Contractor, Supervisor } from "./hrData";

// HR people (pay rates, bank and tax data) live behind a Netlify function that checks the Microsoft login and
// the person's Hub Access — they are never readable with the public database key.
async function idToken(): Promise<string> {
  const account = msalInstance.getActiveAccount() ?? msalInstance.getAllAccounts()[0];
  if (!account) throw new Error("Inicia sesión de nuevo.");
  const r = await msalInstance.acquireTokenSilent({ ...loginRequest, account });
  return r.idToken;
}

async function call<T>(body: object): Promise<T> {
  const res = await fetch("/.netlify/functions/hr-people", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken: await idToken(), ...body }) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data as T;
}

export const fetchHrPeople = () => call<{ contractors: Contractor[]; supervisors: Supervisor[] }>({ action: "list" });
export const saveHrPerson = (kind: "contractor" | "supervisor", data: Contractor | Supervisor) => call<{ ok: true }>({ action: "save", kind, data });
