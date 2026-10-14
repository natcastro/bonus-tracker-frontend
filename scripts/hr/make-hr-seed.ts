// Turns HR's contractors Excel into a SQL file for Supabase (table hr_people). Run it on your own computer:
//   npx tsx scripts/hr/make-hr-seed.ts "/path/to/Base de Datos contratistas Int y Locales.xlsx"
// It writes hr-people-seed.sql NEXT TO the Excel (outside the project). That file has pay data: never commit or share it.
import * as XLSX from "xlsx";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parseContractorsSheet } from "./hrImport";

const file = process.argv[2];
if (!file) { console.error("Falta la ruta del Excel."); process.exit(1); }
const { contractors, supervisors } = parseContractorsSheet(XLSX as never, XLSX.readFile(file));
const q = (o: unknown) => `$j$${JSON.stringify(o)}$j$::jsonb`;
let sql = "-- Personas reales de HR. Contiene datos de pago: NO lo subas a GitHub ni lo compartas.\n-- Ejecútalo en Supabase → SQL Editor, después de supabase/hr-people.sql.\n";
sql += "delete from hr_people;\n";
for (const c of contractors) sql += `insert into hr_people (kind, id, data) values ('contractor', ${c.id}, ${q(c)});\n`;
for (const s of supervisors) sql += `insert into hr_people (kind, id, data) values ('supervisor', ${s.id}, ${q(s)});\n`;
const out = join(dirname(file), "hr-people-seed.sql");
writeFileSync(out, sql);
console.log(`Listo: ${contractors.length} personas y ${supervisors.length} supervisores → ${out}`);
