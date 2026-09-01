import { useEffect, useState } from "react";
import { MT } from "../theme";
import { deadlineTimestamp, daysBetweenIso, todayIsoBogota } from "../types";

const WEEKDAY_FMT = new Intl.DateTimeFormat("es-CO", { weekday: "long", timeZone: "America/Bogota" });
const DAY_MONTH_FMT = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", timeZone: "America/Bogota" });

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function bigLabel(deadline: string, diffDays: number): string {
  if (diffDays === 0) return "Hoy";
  if (diffDays === 1) return "Mañana";
  const weekday = capitalize(WEEKDAY_FMT.format(new Date(`${deadline}T12:00:00-05:00`)));
  if (diffDays > 1 && diffDays <= 6) return `Este ${weekday}`;
  return weekday;
}

function countdownText(diffMs: number): string {
  const abs = Math.abs(diffMs);
  const sec = Math.floor(abs / 1000) % 60;
  const min = Math.floor(abs / 60_000) % 60;
  const hr = Math.floor(abs / 3_600_000) % 24;
  const day = Math.floor(abs / 86_400_000);
  const prefix = diffMs < 0 ? "Venció hace" : "Faltan";
  if (day > 0) return `${prefix} ${day} día${day !== 1 ? "s" : ""}${hr > 0 ? ` ${hr} h` : ""}`;
  if (hr > 0) return `${prefix} ${hr} hora${hr !== 1 ? "s" : ""}`;
  if (min > 0) return `${prefix} ${min} minuto${min !== 1 ? "s" : ""}`;
  return `${prefix} ${sec} segundo${sec !== 1 ? "s" : ""}`;
}

export default function DeadlineBadge({ deadline, compact }: { deadline: string; compact?: boolean }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const target = deadlineTimestamp(deadline);
  const diffMs = target - now;
  const overdue = diffMs <= 0;
  const urgent = !overdue && diffMs <= 24 * 3_600_000;
  const diffDays = daysBetweenIso(todayIsoBogota(), deadline);

  const color = overdue ? MT.danger : urgent ? MT.warn : MT.text1;
  const soft = overdue ? MT.dangerSoft : urgent ? MT.warnSoft : MT.surfaceAlt;
  const smallDate = capitalize(DAY_MONTH_FMT.format(new Date(`${deadline}T12:00:00-05:00`)));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{ fontWeight: 800, fontSize: compact ? 13 : 16, color }}>
          {overdue ? "⚠ Atrasado" : bigLabel(deadline, diffDays)}
        </span>
        <span style={{ fontSize: 11, color: MT.text3 }}>{smallDate}</span>
      </div>
      <span style={{
        fontSize: 11, fontWeight: 700, color, background: soft, borderRadius: 999,
        padding: "1px 7px", width: "fit-content",
      }}>
        {countdownText(diffMs)}
      </span>
    </div>
  );
}
