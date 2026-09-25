import { useMemo, useState } from "react";
import { MT } from "../theme";
import { useMarketing } from "../context";
import ConstructionBanner from "../components/ConstructionBanner";
import { stageLabel, daysBetweenIso } from "../types";
import type { StageKey } from "../types";

interface DisenoStats {
  email: string;
  name: string;
  entries: { completedAt: string; late: boolean; turnaroundDays: number }[];
  avgDays: number | null;
  onTimePct: number;
  completedCount: number;
}

// Monday of the week containing this date, as yyyy-mm-dd.
function isoWeekStart(iso: string): string {
  const d = new Date(iso.slice(0, 10) + "T00:00:00");
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

export default function TeamDashboardPage() {
  const { briefs, todoTasks, disenoEmailList, disenoDisplayName } = useMarketing();
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);

  const published = useMemo(() => briefs.filter(b => b.status !== "draft"), [briefs]);

  // Average Handling Time per Diseño person — turnaround from when a stage became theirs
  // (the previous stage's actual completion) to when they finished it, across briefs and
  // To Do tasks alike. Ranked shortest-first.
  const disenoStats: DisenoStats[] = useMemo(() => {
    return disenoEmailList.map(email => {
      const entries: { completedAt: string; late: boolean; turnaroundDays: number }[] = [];
      for (const b of published) {
        if (!b.assignedDisenoEmail || b.assignedDisenoEmail.toLowerCase() !== email.toLowerCase()) continue;
        b.stages.forEach((s, i) => {
          if (s.role !== "diseno" || s.status !== "done" || !s.completedAt) return;
          const start = (i > 0 ? b.stages[i - 1].completedAt : b.startDate) ?? b.startDate;
          entries.push({ completedAt: s.completedAt, late: !!s.late, turnaroundDays: Math.max(0, daysBetweenIso(start, s.completedAt)) });
        });
      }
      for (const t of todoTasks) {
        if (t.assignedDisenoEmail.toLowerCase() !== email.toLowerCase()) continue;
        t.stages.forEach((s, i) => {
          if (s.role !== "diseno" || s.status !== "done" || !s.completedAt) return;
          const start = (i > 0 ? t.stages[i - 1].completedAt : t.createdAt.slice(0, 10)) ?? t.createdAt.slice(0, 10);
          entries.push({ completedAt: s.completedAt, late: !!s.late, turnaroundDays: Math.max(0, daysBetweenIso(start, s.completedAt)) });
        });
      }
      const completedCount = entries.length;
      const onTime = entries.filter(e => !e.late).length;
      const avgDays = completedCount > 0 ? entries.reduce((s, e) => s + e.turnaroundDays, 0) / completedCount : null;
      return { email, name: disenoDisplayName(email), entries, avgDays, onTimePct: completedCount > 0 ? Math.round((100 * onTime) / completedCount) : 100, completedCount };
    }).sort((a, b) => {
      if (a.avgDays === null) return 1;
      if (b.avgDays === null) return -1;
      return a.avgDays - b.avgDays;
    });
  }, [published, todoTasks, disenoEmailList, disenoDisplayName]);

  const selected = disenoStats.find(d => d.email === selectedEmail) ?? null;
  const selectedWeeks = useMemo(() => {
    if (!selected) return [];
    const map = new Map<string, { total: number; onTime: number }>();
    selected.entries.forEach(e => {
      const wk = isoWeekStart(e.completedAt);
      const cur = map.get(wk) ?? { total: 0, onTime: 0 };
      cur.total++;
      if (!e.late) cur.onTime++;
      map.set(wk, cur);
    });
    const out: { label: string; total: number; onTime: number }[] = [];
    const today = new Date();
    for (let w = 7; w >= 0; w--) {
      const d = new Date(today);
      d.setDate(d.getDate() - w * 7);
      const wk = isoWeekStart(d.toISOString().slice(0, 10));
      const v = map.get(wk) ?? { total: 0, onTime: 0 };
      out.push({ label: wk.slice(5), total: v.total, onTime: v.onTime });
    }
    return out;
  }, [selected]);

  // Every completed stage across every brief — the raw material for every chart below.
  const doneStages = useMemo(() => {
    const list: { completedAt: string; late: boolean; role: "laura" | "diseno"; stageKey: StageKey }[] = [];
    for (const b of published) {
      for (const s of b.stages) {
        if (s.status !== "done" || !s.completedAt || s.role === "carol") continue;
        list.push({ completedAt: s.completedAt, late: !!s.late, role: s.role, stageKey: s.key });
      }
    }
    return list;
  }, [published]);

  const totalDone = doneStages.length;
  const totalOnTime = doneStages.filter(s => !s.late).length;
  const overallOnTimePct = totalDone > 0 ? Math.round((100 * totalOnTime) / totalDone) : 100;
  const completedBriefsCount = published.filter(b => b.status === "completed").length;
  const inProgressCount = published.filter(b => b.status === "in_progress").length;

  // On-time % split by role — aggregated, never names an individual.
  const byRole = useMemo(() => {
    const roles: ("laura" | "diseno")[] = ["laura", "diseno"];
    return roles.map(role => {
      const entries = doneStages.filter(s => s.role === role);
      const onTime = entries.filter(s => !s.late).length;
      return { role, label: role === "laura" ? "Laura (revisiones)" : "Diseño (entregas)", total: entries.length, onTime, pct: entries.length > 0 ? Math.round((100 * onTime) / entries.length) : 100 };
    });
  }, [doneStages]);

  // Which stage type generates the most delays — helps spot where the process is slow.
  const byStage = useMemo(() => {
    const map = new Map<StageKey, { total: number; late: number }>();
    doneStages.forEach(s => {
      const cur = map.get(s.stageKey) ?? { total: 0, late: 0 };
      cur.total++;
      if (s.late) cur.late++;
      map.set(s.stageKey, cur);
    });
    return [...map.entries()]
      .map(([key, v]) => ({ key, label: stageLabel(key), ...v, latePct: v.total > 0 ? Math.round((100 * v.late) / v.total) : 0 }))
      .sort((a, b) => b.latePct - a.latePct);
  }, [doneStages]);

  // Team-wide completions per week, last 8 weeks.
  const weeks = useMemo(() => {
    const map = new Map<string, { total: number; onTime: number }>();
    doneStages.forEach(s => {
      const wk = isoWeekStart(s.completedAt);
      const cur = map.get(wk) ?? { total: 0, onTime: 0 };
      cur.total++;
      if (!s.late) cur.onTime++;
      map.set(wk, cur);
    });
    const out: { label: string; total: number; onTime: number }[] = [];
    const today = new Date();
    for (let w = 7; w >= 0; w--) {
      const d = new Date(today);
      d.setDate(d.getDate() - w * 7);
      const wk = isoWeekStart(d.toISOString().slice(0, 10));
      const v = map.get(wk) ?? { total: 0, onTime: 0 };
      out.push({ label: wk.slice(5), total: v.total, onTime: v.onTime });
    }
    return out;
  }, [doneStages]);
  const maxWeekTotal = Math.max(1, ...weeks.map(w => w.total));

  const kpi = (label: string, value: string | number, color: string) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, padding: "0.9rem 1.1rem", flex: 1, minWidth: 130 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: MT.text3, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
    </div>
  );

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "1.25rem 1.5rem", fontFamily: MT.font }}>
      <ConstructionBanner label="Dashboard" />
      <h1 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: MT.text1 }}>Dashboard</h1>
      <p style={{ margin: "0.15rem 0 1.25rem", fontSize: 12.5, color: MT.text2 }}>
        Estadísticas del equipo completo, más un ranking de AHT de Diseño (borrador, cifras ajustables)
      </p>

      {/* Diseño AHT ranking — click a card for that person's stats */}
      <div style={{ marginBottom: "1.5rem" }}>
        <p style={{ fontWeight: 700, fontSize: 12, color: MT.text2, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.75rem" }}>
          Diseño — tiempo promedio de entrega (AHT)
        </p>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
          {disenoStats.map((d, i) => (
            <button
              key={d.email}
              onClick={() => setSelectedEmail(selectedEmail === d.email ? null : d.email)}
              style={{
                display: "flex", flexDirection: "column", gap: 4, padding: "0.9rem 1.1rem", minWidth: 170,
                borderRadius: 10, cursor: "pointer", textAlign: "left", fontFamily: MT.font, position: "relative",
                border: `1.5px solid ${selectedEmail === d.email ? MT.clay : MT.border}`,
                background: selectedEmail === d.email ? MT.claySoft : MT.surface,
              }}
            >
              <span style={{
                position: "absolute", top: -8, left: -8, width: 22, height: 22, borderRadius: "50%",
                background: i === 0 ? MT.moss : MT.border, color: i === 0 ? "#fff" : MT.text2,
                fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center",
              }}>{i + 1}</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: MT.text1 }}>{d.name}</span>
              <span style={{ fontSize: 20, fontWeight: 800, color: MT.clay }}>{d.avgDays === null ? "—" : `${d.avgDays.toFixed(1)}d`}</span>
              <span style={{ fontSize: 11, color: MT.text3 }}>{d.completedCount} entregas · {d.onTimePct}% a tiempo</span>
            </button>
          ))}
        </div>

        {selected && (
          <div style={{ background: MT.surface, border: `1px solid ${MT.border}`, borderRadius: MT.radiusLg, padding: "1.25rem", marginTop: "1rem", boxShadow: MT.shadow }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: 10 }}>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: MT.text1 }}>{selected.name}</h2>
              <div style={{ display: "flex", gap: "1.25rem" }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: MT.clay }}>{selected.avgDays === null ? "—" : `${selected.avgDays.toFixed(1)}d`}</div>
                  <div style={{ fontSize: 9.5, color: MT.text3, textTransform: "uppercase" }}>AHT</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: MT.text1 }}>{selected.completedCount}</div>
                  <div style={{ fontSize: 9.5, color: MT.text3, textTransform: "uppercase" }}>Entregas</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: selected.onTimePct >= 80 ? MT.primary : MT.warn }}>{selected.onTimePct}%</div>
                  <div style={{ fontSize: 9.5, color: MT.text3, textTransform: "uppercase" }}>A tiempo</div>
                </div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 110, borderBottom: `1px solid ${MT.border}`, paddingBottom: 4 }}>
              {selectedWeeks.map(w => {
                const h = Math.min(80, w.total * 18);
                return (
                  <div key={w.label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flex: 1 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: MT.text2 }}>{w.total}</span>
                    <div style={{ width: "60%", height: Math.max(2, h), background: MT.clay, borderRadius: "4px 4px 0 0" }} />
                    <span style={{ fontSize: 9, color: MT.text3 }}>{w.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* KPI strip */}
      <div style={{
        display: "flex", flexWrap: "wrap", background: MT.surface, border: `1px solid ${MT.border}`,
        borderRadius: MT.radius, marginBottom: "1.5rem", overflow: "hidden", boxShadow: MT.shadow,
      }}>
        {kpi("A tiempo (equipo)", `${overallOnTimePct}%`, overallOnTimePct >= 80 ? MT.primary : overallOnTimePct >= 60 ? MT.warn : MT.danger)}
        {kpi("Briefs completados", completedBriefsCount, MT.primary)}
        {kpi("En proceso", inProgressCount, MT.info)}
        {kpi("Etapas entregadas", totalDone, MT.text1)}
      </div>

      {/* Weekly trend */}
      <div style={{ background: MT.surface, border: `1px solid ${MT.border}`, borderRadius: MT.radiusLg, padding: "1.25rem", marginBottom: "1.25rem", boxShadow: MT.shadow }}>
        <p style={{ fontWeight: 700, fontSize: 12, color: MT.text2, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "1rem" }}>
          Entregas por semana (últimas 8 semanas)
        </p>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 140, borderBottom: `1px solid ${MT.border}`, paddingBottom: 4 }}>
          {weeks.map(w => {
            const totalH = Math.round((w.total / maxWeekTotal) * 110);
            const onTimeH = w.total > 0 ? Math.round((w.onTime / w.total) * totalH) : 0;
            return (
              <div key={w.label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flex: 1 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: MT.text2 }}>{w.total}</span>
                <div style={{ width: "60%", height: Math.max(2, totalH), background: MT.border, borderRadius: "4px 4px 0 0", position: "relative", display: "flex", alignItems: "flex-end" }}>
                  <div style={{ width: "100%", height: onTimeH, background: MT.primary, borderRadius: "4px 4px 0 0" }} />
                </div>
                <span style={{ fontSize: 9, color: MT.text3 }}>{w.label}</span>
              </div>
            );
          })}
        </div>
        <p style={{ fontSize: 11, color: MT.text3, marginTop: 10 }}>
          Barra completa = total de etapas entregadas esa semana; la parte verde es lo que se entregó a tiempo.
        </p>
      </div>

      <div style={{ display: "flex", gap: "1.25rem", flexWrap: "wrap" }}>
        {/* On-time by role */}
        <div style={{ flex: "1 1 320px", background: MT.surface, border: `1px solid ${MT.border}`, borderRadius: MT.radiusLg, padding: "1.25rem", boxShadow: MT.shadow }}>
          <p style={{ fontWeight: 700, fontSize: 12, color: MT.text2, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "1rem" }}>
            A tiempo por rol
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {byRole.map(r => (
              <div key={r.role}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, color: MT.text1, marginBottom: 4 }}>
                  <span style={{ fontWeight: 600 }}>{r.label}</span>
                  <span style={{ fontWeight: 700, color: r.pct >= 80 ? MT.primary : r.pct >= 60 ? MT.warn : MT.danger }}>{r.pct}% ({r.onTime}/{r.total})</span>
                </div>
                <div style={{ height: 8, borderRadius: 999, background: MT.border, overflow: "hidden" }}>
                  <div style={{ width: `${r.pct}%`, height: "100%", background: r.pct >= 80 ? MT.primary : r.pct >= 60 ? MT.warn : MT.danger }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Delays by stage type */}
        <div style={{ flex: "1 1 320px", background: MT.surface, border: `1px solid ${MT.border}`, borderRadius: MT.radiusLg, padding: "1.25rem", boxShadow: MT.shadow }}>
          <p style={{ fontWeight: 700, fontSize: 12, color: MT.text2, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "1rem" }}>
            % de retraso por etapa del proceso
          </p>
          {byStage.length === 0 ? (
            <p style={{ fontSize: 12.5, color: MT.text3 }}>Sin datos todavía.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {byStage.map(s => (
                <div key={s.key}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: MT.text1, marginBottom: 4 }}>
                    <span>{s.label}</span>
                    <span style={{ fontWeight: 700, color: s.latePct > 0 ? MT.danger : MT.text3 }}>{s.latePct}% tarde ({s.late}/{s.total})</span>
                  </div>
                  <div style={{ height: 6, borderRadius: 999, background: MT.border, overflow: "hidden" }}>
                    <div style={{ width: `${s.latePct}%`, height: "100%", background: MT.danger }} />
                  </div>
                </div>
              ))}
            </div>
          )}
          <p style={{ fontSize: 11, color: MT.text3, marginTop: 10 }}>Ayuda a ver en qué parte del flujo se atasca más — no identifica a nadie en particular.</p>
        </div>
      </div>
    </div>
  );
}
