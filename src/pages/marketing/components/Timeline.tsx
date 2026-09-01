import { MT, formatDateHuman } from "../theme";
import type { MarketingBrief } from "../types";

export default function Timeline({ brief }: { brief: MarketingBrief }) {
  const currentIdx = brief.status === "completed" ? brief.stages.length : brief.stages.findIndex(s => s.key === brief.currentStage);

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", flexWrap: "wrap", rowGap: 16, padding: "0.5rem 0" }}>
      {brief.stages.map((s, i) => {
        const done = s.status === "done";
        const isCurrent = i === currentIdx;
        const color = done || isCurrent ? MT.primary : MT.text3;
        const bg = done || isCurrent ? MT.primarySoft : MT.surfaceAlt;
        const size = isCurrent ? 38 : 28;
        return (
          <div key={s.key} style={{ display: "flex", alignItems: "flex-start", flex: "0 0 auto" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", minWidth: 76 }}>
              <div style={{
                width: size, height: size, borderRadius: 999, background: bg, color,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 800, fontSize: isCurrent ? 14 : 12,
                border: isCurrent ? `2px solid ${MT.primary}` : "1px solid transparent",
                boxShadow: isCurrent ? `0 0 0 4px ${MT.primarySoft}` : "none",
                transition: "all 0.15s",
              }}>
                {done ? "✓" : i + 1}
              </div>
              <div style={{ fontSize: isCurrent ? 12 : 11, fontWeight: isCurrent ? 800 : 600, color: isCurrent ? MT.text1 : MT.text3, marginTop: 6, textAlign: "center" }}>
                {s.label}
              </div>
              <div style={{ fontSize: 9.5, color: MT.text3, marginTop: 1 }}>{formatDateHuman(s.deadline)}</div>
            </div>
            {i < brief.stages.length - 1 && (
              <div style={{ width: 22, height: 2, background: done ? MT.primary : MT.border, marginTop: isCurrent ? 19 : 14 }} />
            )}
          </div>
        );
      })}
      {brief.status === "completed" && (
        <div style={{ marginLeft: 10, fontSize: 11.5, fontWeight: 800, color: MT.primary, background: MT.primarySoft, padding: "0.25rem 0.6rem", borderRadius: 999 }}>
          ✓ Completado
        </div>
      )}
    </div>
  );
}
