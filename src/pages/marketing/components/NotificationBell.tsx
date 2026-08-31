import { useEffect, useRef, useState } from "react";
import { MT } from "../theme";
import { formatRelative } from "../theme";
import { useMarketing } from "../context";

export default function NotificationBell() {
  const { notifications, unreadCount, markNotificationsSeen } = useMarketing();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && unreadCount > 0) markNotificationsSeen();
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={toggle} style={{
        position: "relative", width: 38, height: 38, borderRadius: 999,
        border: `1px solid ${MT.border}`, background: MT.surface, cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17,
      }}>
        🔔
        {unreadCount > 0 && (
          <span style={{
            position: "absolute", top: -4, right: -4, minWidth: 17, height: 17, borderRadius: 999,
            background: MT.clay, color: "#fff", fontSize: 10, fontWeight: 800,
            display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px",
          }}>{unreadCount > 9 ? "9+" : unreadCount}</span>
        )}
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "110%", right: 0, width: 320, maxHeight: 380, overflowY: "auto",
          background: MT.surface, border: `1px solid ${MT.border}`, borderRadius: MT.radius,
          boxShadow: MT.shadowLg, zIndex: 100,
        }}>
          <div style={{ padding: "0.75rem 1rem", borderBottom: `1px solid ${MT.border}`, fontWeight: 700, fontSize: 13, color: MT.text1 }}>
            Notificaciones
          </div>
          {notifications.length === 0 ? (
            <div style={{ padding: "1.5rem 1rem", textAlign: "center", color: MT.text3, fontSize: 12.5 }}>
              Sin notificaciones todavía.
            </div>
          ) : (
            notifications.map(n => (
              <div key={n.id} style={{ padding: "0.7rem 1rem", borderBottom: `1px solid ${MT.border}`, fontSize: 12.5, color: MT.text1, lineHeight: 1.5 }}>
                <div>{n.message}</div>
                <div style={{ fontSize: 11, color: MT.text3, marginTop: 3 }}>{formatRelative(n.createdAt)}</div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
