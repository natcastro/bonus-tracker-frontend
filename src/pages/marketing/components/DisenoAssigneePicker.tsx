import { useEffect, useRef, useState } from "react";
import { MT } from "../theme";

// A "who gets this" dropdown that shows the country on the far right of each row — not right next
// to the name — so it reads as two separate columns. A plain <select> can't lay out its options
// that way (an <option> is text-only), so this is a small custom listbox instead.
export default function DisenoAssigneePicker({
  value, onChange, options, disenoDisplayName, disenoCountry, placeholder = "Selecciona a alguien de Diseño...",
}: {
  value: string;
  onChange: (email: string) => void;
  options: string[];
  disenoDisplayName: (email: string | null) => string;
  disenoCountry: (email: string) => string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const fieldStyle: React.CSSProperties = {
    width: "100%", fontFamily: MT.font, fontSize: 13.5, padding: "9px 11px",
    border: `1px solid ${MT.border}`, borderRadius: 8, outline: "none", boxSizing: "border-box",
    background: MT.surface, cursor: "pointer", textAlign: "left",
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <div style={fieldStyle} onClick={() => setOpen(v => !v)}>
        <span style={{ color: value ? MT.text1 : MT.text3 }}>{value ? disenoDisplayName(value) : placeholder}</span>
      </div>
      {open && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, zIndex: 10,
          background: MT.surface, border: `1px solid ${MT.border}`, borderRadius: 8, boxShadow: MT.shadowLg,
          maxHeight: 260, overflowY: "auto",
        }}>
          {options.length === 0 ? (
            <div style={{ padding: "10px 12px", fontSize: 12.5, color: MT.text3 }}>No hay nadie de Diseño configurado todavía.</div>
          ) : (
            options.map(email => {
              const country = disenoCountry(email);
              return (
                <div
                  key={email}
                  onClick={() => { onChange(email); setOpen(false); }}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 12px", cursor: "pointer", fontSize: 13 }}
                  onMouseEnter={e => (e.currentTarget.style.background = MT.surfaceAlt)}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <span style={{ color: MT.text1, fontWeight: 600 }}>{disenoDisplayName(email)}</span>
                  <span style={{ color: MT.text3, fontSize: 12 }}>{country || "No sé el país"}</span>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
