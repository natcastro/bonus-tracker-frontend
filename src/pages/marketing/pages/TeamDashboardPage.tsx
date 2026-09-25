import { useMemo, useState } from "react";
import { MT } from "../theme";
import { useMarketing } from "../context";
import ConstructionBanner from "../components/ConstructionBanner";

// Placeholder — no real weekly target has been defined yet, this is just something to react to.
const WEEKLY_GOAL = 3;

interface PersonStats {
  email: string;
  name: string;
  role: "laura" | "diseno" | "carol";
  color: string;
  completedCount: number;
  onTimeCount: number;
  onTimePct: number;
  weeks: { label: string; total: number; onTime: number }[];
  currentStreak: number;
}

// Monday of the week containing this date, as yyyy-mm-dd.
function isoWeekStart(iso: string): string {
  const d = new Date(iso.slice(0, 10) + "T00:00:00");
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

const PALETTE = [MT.primary, MT.clay, MT.info, MT.moss, MT.warn, MT.danger];

export default function TeamDashboardPage() {
  const { briefs, notifyEmails, disenoEmailList, disenoDisplayName } = useMarketing();
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);

  const people = useMemo(() => {
    const list: { email: string; name: string; role: "laura" | "diseno" | "carol" }[] = [];
    if (notifyEmails.laura) list.push({ email: notifyEmails.laura, name: "Laura", role: "laura" });
    if (notifyEmails.carol) list.push({ email: notifyEmails.carol, name: "Karol", role: "carol" });
    disenoEmailList.forEach(e => list.push({ email: e, name: disenoDisplayName(e), role: "diseno" }));
    return list;
  }, [notifyEmails, disenoEmailList, disenoDisplayName]);

  const stats: PersonStats[] = useMemo(() => {
    return people.map((p, i) => {
      const entries: { completedAt: string; late: boolean }[] = [];
      for (const b of briefs) {
        for (const s of b.stages) {
          if (s.status !== "done" || !s.completedAt || s.role !== p.role) continue;
          if (p.role === "diseno" && (!b.assignedDisenoEmail || b.assignedDisenoEmail.toLowerCase() !== p.email.toLowerCase())) continue;
          entries.push({ completedAt: s.completedAt, late: !!s.late });
        }
      }
      const completedCount = entries.length;
      const onTimeCount = entries.filter(e => !e.late).length;
      const onTimePct = completedCount > 0 ? Math.round((100 * onTimeCount) / completedCount) : 100;

      const weekMap = new Map<string, { total: number; onTime: number }>();
      entries.forEach(e => {
        const wk = isoWeekStart(e.completedAt);
        const cur = weekMap.get(wk) ?? { total: 0, onTime: 0 };
        cur.total++;
        if (!e.late) cur.onTime++;
        weekMap.set(wk, cur);
      });
      const weeks: { label: string; total: number; onTime: number }[] = [];
      const today = new Date();
      for (let w = 7; w >= 0; w--) {
        const d = new Date(today);
        d.setDate(d.getDate() - w * 7);
        const wk = isoWeekStart(d.toISOString().slice(0, 10));
        const v = weekMap.get(wk) ?? { total: 0, onTime: 0 };
        weeks.push({ label: wk.slice(5), total: v.total, onTime: v.onTime });
      }
      let currentStreak = 0;
      for (let w = weeks.length - 1; w >= 0; w--) {
        if (weeks[w].onTime >= WEEKLY_GOAL) currentStreak++;
        else break;
      }
      return { email: p.email, name: p.name, role: p.role, color: PALETTE[i % PALETTE.length], completedCount, onTimeCount, onTimePct, weeks, currentStreak };
    });
  }, [people, briefs]);

  const active = stats.find(s => s.email === selectedEmail) ?? stats[0] ?? null;

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "1.25rem 1.5rem", fontFamily: MT.font }}>
      <ConstructionBanner label="Dashboard" />
      <h1 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: MT.text1 }}>Dashboard</h1>
      <p style={{ margin: "0.15rem 0 1.25rem", fontSize: 12.5, color: MT.text2 }}>
        Estadísticas por persona — metas semanales y cumplimiento (borrador, todos los números y metas son ajustables)
      </p>

      {stats.length === 0 ? (
        <p style={{ color: MT.text3, fontSize: 13 }}>No hay personas configuradas todavía en Notificaciones (Laura/Carol/Diseño).</p>
      ) : (
        <>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
            {stats.map(s => (
              <button
                key={s.email}
                onClick={() => setSelectedEmail(s.email)}
                style={{
                  display: "flex", flexDirection: "column", gap: 4, padding: "0.9rem 1.1rem", minWidth: 160,
                  borderRadius: 10, cursor: "pointer", textAlign: "left", fontFamily: MT.font,
                  border: `1.5px solid ${active?.email === s.email ? s.color : MT.border}`,
                  background: active?.email === s.email ? `${s.color}12` : MT.surface,
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 700, color: s.color }}>{s.name}</span>
                <span style={{ fontSize: 20, fontWeight: 800, color: MT.text1 }}>{s.onTimePct}%</span>
                <span style={{ fontSize: 11, color: MT.text3 }}>{s.completedCount} entregas · racha {s.currentStreak} sem</span>
              </button>
            ))}
          </div>

          {active && (
            <div style={{ background: MT.surface, border: `1px solid ${MT.border}`, borderRadius: MT.radiusLg, padding: "1.25rem", boxShadow: MT.shadow }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem", flexWrap: "wrap", gap: 12 }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: MT.text1 }}>{active.name}</h2>
                  <p style={{ margin: "0.2rem 0 0", fontSize: 12, color: MT.text2 }}>Meta semanal: {WEEKLY_GOAL} entregas a tiempo</p>
                </div>
                <div style={{ display: "flex", gap: "1.5rem" }}>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: active.color }}>{active.onTimePct}%</div>
                    <div style={{ fontSize: 10, color: MT.text3, textTransform: "uppercase", letterSpacing: "0.04em" }}>A tiempo</div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: MT.text1 }}>{active.completedCount}</div>
                    <div style={{ fontSize: 10, color: MT.text3, textTransform: "uppercase", letterSpacing: "0.04em" }}>Entregas</div>
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: active.currentStreak > 0 ? MT.moss : MT.text3 }}>{active.currentStreak}</div>
                    <div style={{ fontSize: 10, color: MT.text3, textTransform: "uppercase", letterSpacing: "0.04em" }}>Semanas cumpliendo meta</div>
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 140, borderBottom: `1px solid ${MT.border}`, paddingBottom: 4 }}>
                {active.weeks.map(w => {
                  const h = Math.min(100, w.onTime * 22);
                  const metGoal = w.onTime >= WEEKLY_GOAL;
                  return (
                    <div key={w.label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flex: 1 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: MT.text2 }}>{w.onTime}</span>
                      <div style={{ width: "70%", height: Math.max(4, h), background: metGoal ? active.color : MT.border, borderRadius: "4px 4px 0 0" }} />
                      <span style={{ fontSize: 9, color: MT.text3 }}>{w.label}</span>
                    </div>
                  );
                })}
              </div>
              <p style={{ fontSize: 11, color: MT.text3, marginTop: 10 }}>
                Barras por semana (lunes) — entregas a tiempo de {active.name}. Meta actual: {WEEKLY_GOAL}/semana.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
