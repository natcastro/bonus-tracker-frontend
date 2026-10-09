// Prototype data + helpers for the HR contractor-invoice module. Everything here is FAKE and lives
// only in memory — nothing is saved anywhere.

export type Currency = "USD" | "COP";
export type PayType = "hourly" | "fixed";
export type CycleStatus = "abierto" | "con_hr" | "aprobada";

// Max a single monthly total (base + bonus) or fixed amount may reach — catches the extra-zero typo.
// Limits are placeholders to be confirmed by HR.
export const CURRENCIES: Record<Currency, { label: string; symbol: string; unitWords: string; limit: number }> = {
  USD: { label: "USD (dólares)", symbol: "$", unitWords: "US dollars", limit: 10_000 },
  COP: { label: "COP (pesos colombianos)", symbol: "$", unitWords: "Colombian pesos", limit: 10_000_000 },
};

export interface BankInfo {
  bankName: string; bankCountry: string; swift: string; routing: string;
  holder: string; accountType: string; accountNumber: string;
}

export interface Supervisor { id: number; firstName: string; lastName: string; position: string }

export interface Contractor {
  id: number;
  legalName: string; position: string; email: string; phone: string; address: string; country: string; taxId: string;
  payType: PayType; hourlyRate: number; baseAmount: number; currency: Currency;
  supervisorId: number | null; // null → William approves
  bank: BankInfo;
}

export interface DayEntry { date: string; hours: number; note: string; approved: boolean }

// One pay cycle (a calendar month) of one contractor.
export interface Cycle {
  id: number; contractorId: number; year: number; month: number; // month 1-12
  days: DayEntry[];           // hourly contractors
  summary: string;            // fixed-pay contractors: what they delivered this month
  summaryApproved: boolean;
  bonus: number | null;       // only the supervisor sets it; null = not decided yet (0 is a valid answer)
  closed: boolean; signature: string | null;
  status: CycleStatus; number: number | null; hrNote?: string;
}

export type Persona =
  | { kind: "hr" } | { kind: "accounting" }
  | { kind: "supervisor"; id: number } | { kind: "employee"; id: number };

export const HR_HEAD = "William";
export const ACCOUNTANT = "Erika";

export const BILL_TO = {
  name: "XPRESS SHAPEWEAR FL LLC", taxId: "85-3540085",
  address: "2914 Ponce De Leon Blvd, Coral Gables, FL 33134, USA", phone: "+1 385 416 5493", email: "usahr@formatucuerpo.com",
};

// ── Dates ───────────────────────────────────────────────────────────────────
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const two = (n: number) => String(n).padStart(2, "0");

const MONTHS_ES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const addDaysIso = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

// A pay cycle runs from the 24th of the previous month to the 23rd; (year, month) is the month it ENDS in.
// The 24th is the day to submit, the 25th the day William approves.
export function cycleInfo(year: number, month: number) {
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const name = MONTHS[month - 1];
  return {
    name,
    startIso: `${prevYear}-${two(prevMonth)}-24`, endIso: `${year}-${two(month)}-23`,
    uploadIso: `${year}-${two(month)}-24`, approveIso: `${year}-${two(month)}-25`,
    closing: `${name} 23, ${year}`,
    period: `From ${MONTHS[prevMonth - 1]} 24, ${prevYear}, to ${name} 23, ${year}`,
    rangeEs: `24 de ${MONTHS_ES[prevMonth - 1]} al 23 de ${MONTHS_ES[month - 1]}`,
    dueDate: `${MONTHS[nextMonth - 1]} 5, ${nextYear}`,
  };
}

// The cycle open right now: through the 25th it is the one ending this month (24th–25th = submit/approve
// window); from the 26th on, the next one.
export function currentCycleKey(now: Date) {
  let year = now.getFullYear(), month = now.getMonth() + 1;
  if (now.getDate() > 25) { month += 1; if (month > 12) { month = 1; year += 1; } }
  return { year, month };
}

export const pad4 = (n: number) => String(n).padStart(4, "0");
// ── Money ───────────────────────────────────────────────────────────────────
export function formatMoney(amount: number, currency: Currency): string {
  return `${CURRENCIES[currency].symbol}${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

const ONES = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const SCALES = ["", "thousand", "million", "billion"];

function below1000(n: number): string {
  const parts: string[] = [];
  if (n >= 100) { parts.push(`${ONES[Math.floor(n / 100)]} hundred`); n %= 100; }
  if (n >= 20) { parts.push(TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : "")); }
  else if (n > 0) parts.push(ONES[n]);
  return parts.join(" ");
}

export function numberToWords(n: number): string {
  if (n === 0) return "zero";
  const chunks: string[] = [];
  let i = 0;
  while (n > 0) {
    const part = n % 1000;
    if (part) chunks.unshift(`${below1000(part)}${SCALES[i] ? ` ${SCALES[i]}` : ""}`);
    n = Math.floor(n / 1000); i++;
  }
  return chunks.join(" ");
}

// "One thousand two hundred US dollars" — cents, when present, as "and 50/100" (what accounting expects).
export function amountInWords(amount: number, currency: Currency): string {
  const whole = Math.floor(Math.round(amount * 100) / 100);
  const cents = Math.round((amount - whole) * 100);
  const unit = CURRENCIES[currency].unitWords;
  const words = `${numberToWords(whole)} ${unit}${cents ? ` and ${two(cents)}/100` : ""}`;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// ── Checks ──────────────────────────────────────────────────────────────────
const SPANISH_HINTS = /\b(el|la|los|las|de|del|que|para|con|una|un|por|se|en|mes|trabajo|realicé|hice|horas|reuniones|tareas)\b/gi;
export function looksEnglish(text: string): boolean {
  if (/[áéíóúñ¿¡]/i.test(text)) return false;
  return (text.match(SPANISH_HINTS) ?? []).length < 3;
}



export const maskAccount = (n: string) => (n.length > 4 ? `••••${n.slice(-4)}` : "••••");

export const STATUS_LABEL: Record<CycleStatus, string> = { abierto: "En curso", con_hr: "Con William (HR)", aprobada: "Aprobada" };

export const overLimit = (amount: number, currency: Currency) => amount > CURRENCIES[currency].limit;

export function daysOfCycle(year: number, month: number): string[] {
  const { startIso, endIso } = cycleInfo(year, month);
  const out: string[] = [];
  for (let d = startIso; d <= endIso; d = addDaysIso(d, 1)) out.push(d);
  return out;
}
export const weekdayLabel = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
export const isWeekend = (iso: string) => [0, 6].includes(new Date(`${iso}T12:00:00`).getDay());

export function cycleTotals(c: Contractor, cy: Pick<Cycle, "days" | "bonus">) {
  const hours = cy.days.reduce((s, d) => s + (Number(d.hours) || 0), 0);
  const base = c.payType === "hourly" ? Math.round(hours * c.hourlyRate * 100) / 100 : c.baseAmount;
  const bonus = cy.bonus ?? 0;
  return { hours, base, bonus, total: Math.round((base + bonus) * 100) / 100 };
}

export function cycleDescription(c: Contractor, cy: Cycle): string {
  if (c.payType === "fixed") return cy.summary;
  return "Hourly professional services — detailed hour-by-hour in the attached report.";
}

export function approvalsComplete(c: Contractor, cy: Cycle): boolean {
  if (c.payType === "fixed") return cy.summaryApproved;
  const used = cy.days.filter(d => d.hours > 0);
  return used.length > 0 && used.every(d => d.approved);
}

export const isReadyForHr = (c: Contractor, cy: Cycle) =>
  cy.status === "abierto" && cy.closed && !!cy.signature && cy.bonus !== null && approvalsComplete(c, cy);

export const nextCycleNumber = (cycles: Cycle[], contractorId: number) =>
  cycles.filter(x => x.contractorId === contractorId && x.status === "aprobada").reduce((m, x) => Math.max(m, x.number ?? 0), 0) + 1;

export const cycleFileName = (c: Contractor, number: number | null, year: number, month: number) =>
  `${c.legalName}- Invoice ${number ? pad4(number) : "(pendiente)"}-${cycleInfo(year, month).name.toLowerCase()} ${year}.pdf`;

// ── Fake data ───────────────────────────────────────────────────────────────
const bank = (n: string): BankInfo => ({
  bankName: "Banco de Prueba", bankCountry: "Colombia", swift: "TESTCOBB", routing: "000000000",
  holder: n, accountType: "Savings", accountNumber: "0012345678",
});

export const SEED_SUPERVISORS: Supervisor[] = [
  { id: 1, firstName: "Héctor", lastName: "Ramírez", position: "Operations Manager" },
  { id: 2, firstName: "Daniela", lastName: "Ortiz", position: "Marketing Lead" },
];

export const SEED_CONTRACTORS: Contractor[] = [
  { id: 1, legalName: "Pepito Pérez", position: "Customer Service Agent", email: "pepito.prueba@example.com", phone: "+57 321 000 0001", address: "Cra 52A # 128C-32, Bogotá DC", country: "Colombia", taxId: "CC 12345678",
    payType: "hourly", hourlyRate: 12, baseAmount: 0, currency: "USD", supervisorId: 1, bank: bank("Pepito Pérez") },
  { id: 2, legalName: "María Gómez", position: "Graphic Designer", email: "maria.prueba@example.com", phone: "+57 300 000 0002", address: "Calle 10 # 5-20, Medellín", country: "Colombia", taxId: "CC 87654321",
    payType: "fixed", hourlyRate: 0, baseAmount: 1000, currency: "USD", supervisorId: 2, bank: bank("María Gómez") },
  { id: 3, legalName: "Carlos Rodríguez", position: "Community Manager", email: "carlos.prueba@example.com", phone: "+57 310 000 0003", address: "Av. 6N # 20-15, Cali", country: "Colombia", taxId: "CC 11223344",
    payType: "fixed", hourlyRate: 0, baseAmount: 4200000, currency: "COP", supervisorId: 1, bank: bank("Carlos Rodríguez") },
  { id: 4, legalName: "Laura Martínez", position: "Support Agent", email: "laura.prueba@example.com", phone: "+1 305 000 0004", address: "123 Test St, Miami, FL", country: "USA", taxId: "SSN/EIN 00-0000000",
    payType: "hourly", hourlyRate: 15, baseAmount: 0, currency: "USD", supervisorId: null, bank: bank("Laura Martínez") },
];

const NOTES = ["Answered customer chats and tracked orders.", "Handled returns and follow-up emails.", "Updated the order spreadsheet and replied to tickets.", "Prepared the weekly report and helped the team."];

function hourlyDays(year: number, month: number, upTo: string, approveUntil: number): DayEntry[] {
  const out: DayEntry[] = [];
  daysOfCycle(year, month).filter(d => d < upTo && !isWeekend(d)).forEach((d, i) => {
    out.push({ date: d, hours: 4 + (i % 5), note: NOTES[i % NOTES.length], approved: i < approveUntil });
  });
  return out;
}

export function buildSeedCycles(now: Date, contractors: Contractor[]): Cycle[] {
  const cur = currentCycleKey(now);
  const prev = (back: number) => { const d = new Date(cur.year, cur.month - 1 - back, 1); return { year: d.getFullYear(), month: d.getMonth() + 1 }; };
  const todayIso = `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
  const cycles: Cycle[] = [];
  let id = 1;
  const base = (c: Contractor, year: number, month: number): Cycle => ({
    id: id++, contractorId: c.id, year, month, days: [], summary: "", summaryApproved: false,
    bonus: null, closed: false, signature: null, status: "abierto", number: null,
  });

  // past, approved cycles (history)
  contractors.forEach(c => [2, 1].forEach((back, idx) => {
    const { year, month } = prev(back);
    const x = base(c, year, month);
    x.status = "aprobada"; x.closed = true; x.number = idx + 1; x.bonus = c.id === 2 ? 120 : 0;
    if (c.payType === "hourly") x.days = hourlyDays(year, month, "9999-12-31", 99);
    else { x.summary = "Monthly design work: social posts, banners and product images."; x.summaryApproved = true; }
    cycles.push(x);
  }));
  // current cycles
  contractors.forEach(c => {
    const x = base(c, cur.year, cur.month);
    if (c.id === 1) x.days = hourlyDays(cur.year, cur.month, todayIso, 3);
    if (c.id === 4) x.days = hourlyDays(cur.year, cur.month, todayIso, 0);
    if (c.id === 2) x.summary = "Designed the October campaign banners and updated";
    cycles.push(x);
  });
  return cycles;
}
