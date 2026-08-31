import { MT } from "../theme";
import type { MarketingBrief } from "../types";

export default function Timeline({ brief }: { brief: MarketingBrief }) {
  const currentIdx = brief.status === "completed" ? brief.stages.length : brief.stages.findIndex(s => s.key === brief.currentStage);

  return (
    <div style={{ display: "flex", alignItems: "center", overflowX: "auto", padding: "0.5rem 0" }}>
      {brief.stages.map((s, i) => {
        const done = s.status === "done";
        const isCurrent = i === currentIdx;
        const color = done ? MT.primary : isCurrent ? MT.clay : MT.text3;
        const bg = done ? MT.primarySoft : isCurrent ? MT.claySoft : MT.surfaceAlt;
        return (
          <div key={s.key} style={{ display: "flex", alignItems: "center", flex: "0 0 auto" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 92 }}>
              <div style={{
                width: 34, height: 34, borderRadius: 999, background: bg, color,
                display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13,
                border: isCurrent ? `2px solid ${MT.clay}` : `1px solid ${MT.border}`,
              }}>
                {done ? "✓" : i + 1}
              </div>
              <div style={{ fontSize: 11.5, fontWeight: isCurrent ? 800 : 600, color: isCurrent ? MT.text1 : MT.text2, marginTop: 6, textAlign: "center" }}>
                {s.label}
              </div>
              <div style={{ fontSize: 10, color: MT.text3, marginTop: 1 }}>{s.deadline}</div>
            </div>
            {i < brief.stages.length - 1 && (
              <div style={{ width: 28, height: 2, background: done ? MT.primary : MT.border, marginBottom: 20 }} />
            )}
          </div>
        );
      })}
      {brief.status === "completed" && (
        <div style={{ marginLeft: 12, fontSize: 12, fontWeight: 800, color: MT.primary, background: MT.primarySoft, padding: "0.3rem 0.7rem", borderRadius: 999 }}>
          ✓ Completado
        </div>
      )}
    </div>
  );
}
