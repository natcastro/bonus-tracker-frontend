import type * as XLSXType from "xlsx";
import type { Contractor, Currency, Supervisor } from "./hrData";
import { CURRENCIES, EXTRA_DEFAULTS } from "./hrData";

// Reads HR's "Base de Datos contratistas" sheet (international + local USA sections) into contractors and
// supervisors. Nothing is saved: the result is handed to the page, which keeps it in memory.

const strip = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const titleCase = (s: string) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t === t.toUpperCase() ? t.toLowerCase().replace(/(^|\s)\S/g, (m) => m.toUpperCase()) : t;
};

function distance(a: string, b: string): number {
  const m = a.length, n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[m][n];
}

// Names HR asked to change: every spelling of Natalie Peña becomes just "Katalina" (no surname for now).
const RENAMES: { test: RegExp; to: string }[] = [{ test: /^nat[a-z]*lie pena$/, to: "Katalina" }];
// Correct spellings of people we know: a name within one typo of these is written this way.
const KNOWN_NAMES = ["William Calle", "Héctor Peña"]; // only the ones the sheet misspells most often

function money(v: unknown): number {
  if (typeof v === "number") return v;
  const t = String(v ?? "").replace(/[$\s]/g, "").replace(/cop|usd/gi, "");
  if (!t) return NaN;
  if (/^\d{1,3}(\.\d{3})+$/.test(t)) return Number(t.replace(/\./g, ""));
  if (/^\d{1,3}(,\d{3})+$/.test(t)) return Number(t.replace(/,/g, ""));
  return Number(t.replace(",", "."));
}

export interface ImportReport {
  contractors: number; supervisors: number; adp: number; international: number; dualRole: number;
  needsReview: number; fixes: string[];
}

export function parseContractorsSheet(XLSX: typeof XLSXType, wb: XLSXType.WorkBook): { contractors: Contractor[]; supervisors: Supervisor[]; report: ImportReport } {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "", blankrows: false });
  const headerIdx = rows.findIndex((r) => strip(r[0]) === "nombre del contratista");
  if (headerIdx === -1) throw new Error('No encontré la fila de encabezados ("Nombre del Contratista"). ¿Es el archivo correcto?');
  const col = (key: string) => rows[headerIdx].findIndex((h) => strip(h).startsWith(key));
  const C = { name: 0, country: col("pais"), sup: col("supervisor"), area: col("area"), method: col("metodo"), cur: col("moneda"), base: col("valor"), fixed: col("sueldo fijo"), variable: col("sueldo variable"), pay: col("pago"), notes: col("comen") };

  const raw: Record<string, unknown>[] = [];
  for (const r of rows.slice(headerIdx + 1)) {
    const name = String(r[C.name] ?? "").trim();
    const isRepeatedHeader = strip(name) === "nombre del contratista";
    const isSectionTitle = !String(r[C.country] ?? "").trim() && !String(r[C.method] ?? "").trim();
    if (!name || isRepeatedHeader || isSectionTitle) continue;
    raw.push({
      name: titleCase(name), country: String(r[C.country]).trim(), sup: String(r[C.sup]).trim(), area: String(r[C.area]).trim(),
      method: String(r[C.method]), cur: String(r[C.cur]).trim().toUpperCase(), base: r[C.base], fixed: strip(r[C.fixed]), variable: strip(r[C.variable]),
      variableRaw: String(r[C.variable]).trim(), pay: String(r[C.pay]), notes: [r[C.notes], ...r.slice(C.notes + 1)].map((x) => String(x ?? "").trim()).filter(Boolean).join(" · "),
    });
  }

  // ── supervisors: unify spellings (Willam/William, Natialie/Natalie…), then apply HR's renames
  const fixes: string[] = [];
  const spellings = new Map<string, Map<string, number>>(); // normalized key → spelling → count
  raw.forEach((x) => { const sp = String(x.sup); if (!sp) return; const k = strip(sp); if (!spellings.has(k)) spellings.set(k, new Map()); const m = spellings.get(k)!; m.set(sp, (m.get(sp) ?? 0) + 1); });
  const keys = [...spellings.keys()];
  const clusterOf = new Map<string, string>();
  keys.forEach((k) => { const home = keys.find((o) => clusterOf.get(o) === o && distance(o, k) <= 1); clusterOf.set(k, home ?? k); });
  const canonical = new Map<string, string>(); // cluster key → display name
  const spellingCount = new Map<string, Map<string, number>>();
  keys.forEach((k) => { const c = clusterOf.get(k)!; if (!spellingCount.has(c)) spellingCount.set(c, new Map()); spellings.get(k)!.forEach((n, sp) => spellingCount.get(c)!.set(sp, (spellingCount.get(c)!.get(sp) ?? 0) + n)); });
  spellingCount.forEach((m, c) => {
    const best = [...m.entries()].sort((a, b) => (/[^\u0000-\u007f]/.test(b[0]) ? 1 : 0) - (/[^\u0000-\u007f]/.test(a[0]) ? 1 : 0) || b[1] - a[1])[0][0];
    let display = titleCase(best);
    const known = KNOWN_NAMES.find((k) => distance(strip(k), strip(display)) <= 1);
    if (known) display = known;
    const ren = RENAMES.find((r) => r.test.test(strip(display)));
    if (ren) { fixes.push(`${m.size > 1 ? m.size + " escrituras de " : ""}"${[...m.keys()].join('", "')}" → ${ren.to}`); display = ren.to; }
    else if (m.size > 1) fixes.push(`Unificado: ${[...m.keys()].map((x) => `"${x}"`).join(", ")} → ${display}`);
    canonical.set(c, display);
  });
  const supName = (sp: string) => (sp ? canonical.get(clusterOf.get(strip(sp))!) ?? titleCase(sp) : "");

  const supervisors: Supervisor[] = [...new Set(raw.map((x) => supName(String(x.sup))).filter(Boolean))].map((full, i) => {
    const parts = full.split(" "); const last = parts.length > 1 ? parts.pop()! : ""; // a single name stays as a first name
    return { id: i + 1, firstName: parts.join(" "), lastName: last, position: "Supervisor", contractorId: null };
  });
  const supId = (name: string) => supervisors.find((s) => `${s.firstName} ${s.lastName}`.trim() === name)?.id ?? null;

  // ── contractors
  const contractors: Contractor[] = raw.map((x, i) => {
    const issues: string[] = ["Faltan datos fijos: correo, Tax ID, dirección y cuenta bancaria."];
    const cur: Currency = x.cur === "COP" ? "COP" : "USD";
    const comment = strip(x.notes), vText = String(x.variable), fixed = x.fixed === "si";
    const baseNum = money(x.base);
    const commission = /comision|flete/.test(comment) || Number.isNaN(baseNum) || (!fixed && vText === "no");
    const hourly = !commission && !fixed && vText === "si";
    const payType = commission ? "variable" : hourly ? "hourly" : "fixed";
    const baseAmount = Number.isNaN(baseNum) ? 0 : baseNum;

    let bonusCap = 0;
    const mentionsBonus = /bono/.test(vText + " " + comment);
    const capMatch = String(x.notes).match(/bono\s+m[aá]x[a-z]*\s+de\s+\$?\s*([\d.,]+)/i) ?? String(x.notes).match(/\bmax\s*\$?\s*([\d.,]+)/i) ?? String(x.variableRaw).match(/bono de\s+\$?\s*([\d.,]+)/i);
    if (capMatch) bonusCap = money(capMatch[1]);
    else if (mentionsBonus) issues.push("Falta el tope de bono (el archivo dice que hay bono pero no cuánto).");
    const monthly = String(x.notes).match(/m[aá]ximo\s+\$?\s*([\d.,]+)\s+al mes/i);
    const weekly = String(x.notes).match(/m[aá]ximo\s+(\d+)\s+horas\s+semanales/i);
    if (hourly) issues.push(`Define la tarifa por hora: el archivo trae ${baseAmount} como valor base.`);
    if (!fixed && !commission && !hourly) issues.push("Marcado como sueldo NO fijo pero con bono: confirma si la base es fija.");
    if (payType === "variable" && !baseAmount) issues.push("Pago variable sin base garantizada: lo define el supervisor cada mes.");
    if (baseAmount > CURRENCIES[cur].limit) issues.push(`El monto base (${baseAmount.toLocaleString("en-US")} ${cur}) supera el límite de ${CURRENCIES[cur].limit.toLocaleString("en-US")} ${cur}: ¿pesos escritos como dólares o un cero de más?`);

    const usa = /^usa/i.test(String(x.country));
    const region = usa ? String(x.country).replace(/^usa\s*-?\s*/i, "").trim() : "";
    const method = /adp/i.test(String(x.method)) ? "adp" : "wired";
    return {
      ...EXTRA_DEFAULTS, id: i + 1, legalName: String(x.name), position: String(x.area) || "—", email: "", phone: "", address: "",
      country: usa ? "USA" : strip(x.country) === "espana" ? "España" : String(x.country), taxId: "",
      payType, hourlyRate: 0, baseAmount, currency: cur, bonusCap, supervisorId: supId(supName(String(x.sup))),
      bank: { bankName: "", bankCountry: "", swift: "", routing: "", holder: String(x.name), accountType: "Savings", accountNumber: "" },
      region, paymentMethod: method, sendsInvoice: method === "wired",
      payDay: Number(String(x.pay).match(/(\d{1,2})/)?.[1] ?? 30),
      monthlyCap: monthly ? money(monthly[1]) : null, weeklyHoursCap: weekly ? Number(weekly[1]) : null,
      notes: String(x.notes), issues,
    } as Contractor;
  });

  // ── supervisors who are also paid contractors (same person, maybe a shortened name: "Jai Yepez" = "Jainelker Jesús Yépez")
  let dual = 0;
  supervisors.forEach((s) => {
    const sk = strip(`${s.firstName} ${s.lastName}`).split(" ");
    const match = contractors.find((c) => {
      const ck = strip(c.legalName).split(" ");
      const sameLast = ck[ck.length - 1] === sk[sk.length - 1];
      const f1 = ck[0], f2 = sk[0];
      return sameLast && (f1 === f2 || (Math.min(f1.length, f2.length) >= 3 && (f1.startsWith(f2) || f2.startsWith(f1))));
    });
    if (match) {
      s.contractorId = match.id; s.position = match.position; dual++;
      const parts = match.legalName.split(" "); s.lastName = parts.pop() ?? ""; s.firstName = parts.join(" ");
      if (strip(match.legalName) !== strip(`${s.firstName} ${s.lastName}`)) fixes.push(`Mismo supervisor y contratista: ${match.legalName}`);
    }
  });

  return {
    contractors, supervisors,
    report: {
      contractors: contractors.length, supervisors: supervisors.length, dualRole: dual,
      adp: contractors.filter((c) => c.paymentMethod === "adp").length, international: contractors.filter((c) => c.paymentMethod === "wired").length,
      needsReview: contractors.filter((c) => c.issues.length > 1).length, fixes,
    },
  };
}
