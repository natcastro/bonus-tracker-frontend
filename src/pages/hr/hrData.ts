// Prototype data + helpers for the HR contractor-invoice module. Everything here is FAKE and lives
// only in memory — nothing is saved anywhere.

export type Currency = "USD" | "COP";
export type PayType = "hourly" | "fixed";
export type InvoiceStatus = "borrador" | "con_supervisor" | "devuelta" | "aprobada";

export interface BankInfo {
  bankName: string; bankCountry: string; swift: string; routing: string;
  holder: string; accountType: string; accountNumber: string;
}

export interface Contractor {
  id: number;
  legalName: string; email: string; phone: string; address: string; country: string; taxId: string;
  payType: PayType; hourlyRate: number; baseAmount: number; currency: Currency;
  supervisor: string | null; // null → William approves
  bank: BankInfo;
}

export interface HourRow { date: string; hours: number; task: string }

export interface Invoice {
  id: number; contractorId: number;
  number: number;            // consecutive per contractor, only advances once approved
  year: number; month: number; // month: 1-12
  hourRows: HourRow[]; baseAmount: number; bonus: number;
  description: string; signature: string | null;
  status: InvoiceStatus; supervisorNote?: string;
}

export const SUPERVISORS = ["Héctor Ramírez", "Daniela Ortiz"];
export const HR_HEAD = "William";

export const BILL_TO = {
  name: "XPRESS SHAPEWEAR FL LLC", taxId: "85-3540085",
  address: "2914 Ponce De Leon Blvd, Coral Gables, FL 33134, USA", phone: "+1 385 416 5493", email: "usahr@formatucuerpo.com",
};

const bank = (n: string): BankInfo => ({
  bankName: "Banco de Prueba", bankCountry: "Colombia", swift: "TESTCOBB", routing: "000000000",
  holder: n, accountType: "Savings", accountNumber: "0012345678",
});

export const SEED_CONTRACTORS: Contractor[] = [
  { id: 1, legalName: "Pepito Pérez", email: "pepito.prueba@example.com", phone: "+57 321 000 0001", address: "Cra 52A # 128C-32, Bogotá DC", country: "Colombia", taxId: "CC 12345678",
    payType: "hourly", hourlyRate: 12, baseAmount: 0, currency: "USD", supervisor: "Héctor Ramírez", bank: bank("Pepito Pérez") },
  { id: 2, legalName: "María Gómez", email: "maria.prueba@example.com", phone: "+57 300 000 0002", address: "Calle 10 # 5-20, Medellín", country: "Colombia", taxId: "CC 87654321",
    payType: "fixed", hourlyRate: 0, baseAmount: 1000, currency: "USD", supervisor: "Daniela Ortiz", bank: bank("María Gómez") },
  { id: 3, legalName: "Carlos Rodríguez", email: "carlos.prueba@example.com", phone: "+57 310 000 0003", address: "Av. 6N # 20-15, Cali", country: "Colombia", taxId: "CC 11223344",
    payType: "fixed", hourlyRate: 0, baseAmount: 4200000, currency: "COP", supervisor: "Héctor Ramírez", bank: bank("Carlos Rodríguez") },
  { id: 4, legalName: "Laura Martínez", email: "laura.prueba@example.com", phone: "+1 305 000 0004", address: "123 Test St, Miami, FL", country: "USA", taxId: "SSN/EIN 00-0000000",
    payType: "hourly", hourlyRate: 15, baseAmount: 0, currency: "USD", supervisor: null, bank: bank("Laura Martínez") },
];

// A past, already-approved invoice per person so the consecutive has something to continue from.
export const SEED_INVOICES: Invoice[] = [
  { id: 1, contractorId: 2, number: 1, year: 2026, month: 8, hourRows: [], baseAmount: 1000, bonus: 120, description: "Customer support and order follow-up for the month of August.", signature: null, status: "aprobada" },
  { id: 2, contractorId: 3, number: 1, year: 2026, month: 8, hourRows: [], baseAmount: 4200000, bonus: 300000, description: "Social media content and community management.", signature: null, status: "aprobada" },
  { id: 3, contractorId: 3, number: 2, year: 2026, month: 9, hourRows: [], baseAmount: 4200000, bonus: 0, description: "Social media content and community management.", signature: null, status: "aprobada" },
];

// ── Dates ───────────────────────────────────────────────────────────────────
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const two = (n: number) => String(n).padStart(2, "0");

export function monthInfo(year: number, month: number) {
  const last = new Date(year, month, 0).getDate(); // day 0 of next month = last day of this one
  const name = MONTHS[month - 1];
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  return {
    lastDay: last, name,
    closing: `${name} ${last}, ${year}`,
    period: `From ${name} 01, ${year}, to ${name} ${two(last)}, ${year}`,
    dueDate: `${MONTHS[nextMonth - 1]} 5, ${nextYear}`,
    submitBy: `${name === "December" ? "January" : MONTHS[nextMonth - 1]} 25`,
    firstIso: `${year}-${two(month)}-01`, lastIso: `${year}-${two(month)}-${two(last)}`,
  };
}

export const pad4 = (n: number) => String(n).padStart(4, "0");
export const invoiceFileName = (c: Contractor, number: number, year: number, month: number) =>
  `${c.legalName}- Invoice ${pad4(number)}-${MONTHS[month - 1].toLowerCase()} ${year}.pdf`;

// ── Money ───────────────────────────────────────────────────────────────────
export function formatMoney(amount: number, currency: Currency): string {
  return `$${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
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
  const unit = currency === "USD" ? "US dollars" : "Colombian pesos";
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

export const nextInvoiceNumber = (invoices: Invoice[], contractorId: number) =>
  invoices.filter(i => i.contractorId === contractorId && i.status === "aprobada").reduce((m, i) => Math.max(m, i.number), 0) + 1;

export function invoiceTotals(c: Contractor, inv: Pick<Invoice, "hourRows" | "baseAmount" | "bonus">) {
  const hours = inv.hourRows.reduce((s, r) => s + (Number(r.hours) || 0), 0);
  const base = c.payType === "hourly" ? Math.round(hours * c.hourlyRate * 100) / 100 : Number(inv.baseAmount) || 0;
  const bonus = Number(inv.bonus) || 0;
  return { hours, base, bonus, total: Math.round((base + bonus) * 100) / 100 };
}

export const STATUS_LABEL: Record<InvoiceStatus, string> = {
  borrador: "Borrador", con_supervisor: "Con el supervisor", devuelta: "Devuelta", aprobada: "Aprobada y enviada a HR",
};
