import { useEffect, useState } from "react";
import type { Currency } from "./hrData";
import { CURRENCIES } from "./hrData";

const group = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const toText = (v: number | null) => {
  if (v === null || Number.isNaN(v)) return "";
  const [i, d] = String(v).split(".");
  return group(i) + (d ? `.${d}` : "");
};

// A money field that writes the thousands separators, the currency symbol and the currency code while
// you type, so "4200000" reads as "$ 4,200,000 COP" and a stray extra zero is easy to spot.
export default function MoneyInput({ value, onChange, currency, disabled, placeholder, invalid, ariaLabel }: {
  value: number | null; onChange: (n: number | null) => void; currency: Currency; disabled?: boolean; placeholder?: string; invalid?: boolean; ariaLabel?: string;
}) {
  const [text, setText] = useState(toText(value));

  // Follow outside changes (e.g. switching person) but never fight what is being typed ("12." is still 12).
  useEffect(() => {
    const typed = text === "" ? null : Number(text.replace(/,/g, "").replace(/\.$/, ""));
    if (typed !== value) setText(toText(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const change = (raw: string) => {
    let t = raw.replace(/[^\d.]/g, "");
    const dot = t.indexOf(".");
    if (dot !== -1) t = t.slice(0, dot + 1) + t.slice(dot + 1).replace(/\./g, "");
    const hasDot = t.includes(".");
    let [intPart, dec = ""] = t.split(".");
    intPart = intPart.replace(/^0+(?=\d)/, "");
    dec = dec.slice(0, 2);
    const next = group(intPart) + (hasDot ? `.${dec}` : "");
    setText(next);
    onChange(next === "" ? null : Number(`${intPart || "0"}${dec ? `.${dec}` : ""}`));
  };

  return (
    <div className="hr-money">
      <span className="hr-money__sym" aria-hidden>{CURRENCIES[currency].symbol}</span>
      <input className="form-control" inputMode="decimal" autoComplete="off" disabled={disabled} placeholder={placeholder ?? "0"} aria-label={ariaLabel}
        value={text} onChange={(e) => change(e.target.value)} style={invalid ? { borderColor: "#dc2626" } : undefined} />
      <span className="hr-money__cur" aria-hidden>{currency}</span>
    </div>
  );
}
