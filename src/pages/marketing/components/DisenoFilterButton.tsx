import { useEffect, useRef, useState } from "react";
import { MT } from "../theme";

// The "Diseño" filter chip in a toolbar — clicking it activates the filter AND opens a checklist
// to narrow it to specific people (an empty selection means "todos"). Shared by the Briefs and To
// Do boards so both filter rows behave the same way.
export default function DisenoFilterButton({
  active, onActivate, selected, onChangeSelected, options, disenoDisplayName,
}: {
  active: boolean;
  onActivate: () => void;
  selected: string[];
  onChangeSelected: (next: string[]) => void;
  options: string[];
  disenoDisplayName: (email: string) => string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const allSelected = selected.length === 0;

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const toggle = (email: string) => {
    if (selected.includes(email)) onChangeSelected(selected.filter(e => e !== email));
    else onChangeSelected([...selected, email]);
  };

  const rowStyle: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", cursor: "pointer", fontSize: 12.5, color: MT.text1,
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => { onActivate(); setOpen(v => !v); }}
        style={{
          fontFamily: MT.font, fontSize: 12, fontWeight: 700, cursor: "pointer",
          padding: "5px 11px", borderRadius: 7, whiteSpace: "nowrap",
          border: `1px solid ${active ? MT.primary : MT.border}`,
          background: active ? MT.primarySoft : MT.surface,
          color: active ? MT.primary : MT.text2,
          display: "flex", alignItems: "center", gap: 5,
        }}
      >Diseño{active && !allSelected ? ` (${selected.length})` : ""} ▾</button>
      {open && (
        <div style={{
          position: "absolute", top: "100%", left: 0, marginTop: 4, zIndex: 20, minWidth: 180,
          background: MT.surface, border: `1px solid ${MT.border}`, borderRadius: 8, boxShadow: MT.shadowLg,
          overflow: "hidden",
        }}>
          <div onClick={() => onChangeSelected([])} style={{ ...rowStyle, borderBottom: `1px solid ${MT.border}`, fontWeight: 700 }}
            onMouseEnter={e => (e.currentTarget.style.background = MT.surfaceAlt)}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >
            <input type="checkbox" checked={allSelected} readOnly /> Todas
          </div>
          {options.map(email => (
            <div key={email} onClick={() => toggle(email)} style={rowStyle}
              onMouseEnter={e => (e.currentTarget.style.background = MT.surfaceAlt)}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
            >
              <input type="checkbox" checked={allSelected || selected.includes(email)} readOnly />
              {disenoDisplayName(email)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
