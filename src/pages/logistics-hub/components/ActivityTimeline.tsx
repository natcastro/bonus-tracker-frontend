import { HT } from "../theme";
import type { ActivityEntry } from "../types";

export default function ActivityTimeline({ entries }: { entries: ActivityEntry[] }) {
  const sorted = [...entries].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {sorted.map((e, i) => (
        <div key={i} style={{ display: "flex", gap: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 8 }}>
            <div style={{
              width: 7, height: 7, borderRadius: "50%",
              background: i === sorted.length - 1 ? HT.primary : HT.borderStrong,
              marginTop: 5, flexShrink: 0,
            }} />
            {i < sorted.length - 1 && <div style={{ width: 1, flex: 1, background: HT.border, minHeight: 20 }} />}
          </div>
          <div style={{ paddingBottom: 16 }}>
            <div style={{ fontFamily: HT.mono, fontSize: 11, color: HT.text3, marginBottom: 2 }}>
              {new Date(e.time).toLocaleString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
            </div>
            <div style={{ fontFamily: HT.font, fontSize: 13, color: HT.text1, lineHeight: 1.4 }}>{e.text}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
