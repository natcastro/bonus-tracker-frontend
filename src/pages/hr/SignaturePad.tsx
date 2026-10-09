import { useEffect, useRef } from "react";

// Draw-your-signature box (a typed name is not accepted per HR's rules).
export default function SignaturePad({ value, onChange, disabled }: { value: string | null; onChange: (dataUrl: string | null) => void; disabled?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const ctx = cv.getContext("2d")!;
    ctx.clearRect(0, 0, cv.width, cv.height);
    if (value) { const img = new Image(); img.onload = () => ctx.drawImage(img, 0, 0); img.src = value; }
  }, [value]);

  const pos = (e: React.PointerEvent) => { const r = ref.current!.getBoundingClientRect(); return { x: (e.clientX - r.left) * (ref.current!.width / r.width), y: (e.clientY - r.top) * (ref.current!.height / r.height) }; };
  const down = (e: React.PointerEvent) => { if (disabled) return; drawing.current = true; ref.current!.setPointerCapture(e.pointerId); const ctx = ref.current!.getContext("2d")!; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const ctx = ref.current!.getContext("2d")!; const p = pos(e);
    ctx.lineWidth = 2.2; ctx.lineCap = "round"; ctx.strokeStyle = "#0f172a"; ctx.lineTo(p.x, p.y); ctx.stroke();
  };
  const up = () => { if (!drawing.current) return; drawing.current = false; onChange(ref.current!.toDataURL("image/png")); };

  return (
    <div>
      <canvas ref={ref} width={520} height={140} onPointerDown={down} onPointerMove={move} onPointerUp={up}
        style={{ width: "100%", maxWidth: 520, height: 140, border: "1px dashed #94a3b8", borderRadius: 8, background: disabled ? "#f8fafc" : "#fff", touchAction: "none", cursor: disabled ? "default" : "crosshair" }} />
      {!disabled && <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 6 }} onClick={() => onChange(null)}>Borrar firma</button>}
    </div>
  );
}
