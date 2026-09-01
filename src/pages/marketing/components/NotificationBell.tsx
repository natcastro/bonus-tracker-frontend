import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MT } from "../theme";
import { formatRelative } from "../theme";
import { useMarketing } from "../context";
import { BellIcon } from "../../../components/icons";
import type { MarketingNotification } from "../types";

export default function NotificationBell() {
  const { notifications, unreadCount, markNotificationRead, authedUser } = useMarketing();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const isUnread = (n: MarketingNotification) => {
    if (!authedUser) return false;
    return authedUser.role === "laura" ? !n.readLaura : !n.readDiseno;
  };

  const handleClick = (n: MarketingNotification) => {
    if (isUnread(n)) markNotificationRead(n.id);
    setOpen(false);
    if (n.briefId) navigate(`/marketing/brief/${n.briefId}`);
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen(o => !o)} style={{
        position: "relative", width: 38, height: 38, borderRadius: 999,
        border: `1px solid ${MT.border}`, background: MT.surface, cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <BellIcon size={18} color={MT.text2} />
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
            notifications.map(n => {
              const unread = isUnread(n);
              return (
                <div
                  key={n.id}
                  onClick={() => handleClick(n)}
                  style={{
                    padding: "0.7rem 1rem", borderBottom: `1px solid ${MT.border}`, fontSize: 12.5,
                    color: MT.text1, lineHeight: 1.5, cursor: "pointer",
                    background: unread ? MT.mossSoft : "transparent",
                    display: "flex", gap: "0.5rem", alignItems: "flex-start",
                  }}
                >
                  {unread && (
                    <span style={{ width: 7, height: 7, borderRadius: 999, background: MT.moss, marginTop: 5, flexShrink: 0 }} />
                  )}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: unread ? 700 : 400 }}>{n.message}</div>
                    <div style={{ fontSize: 11, color: MT.text3, marginTop: 3 }}>{formatRelative(n.createdAt)}</div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
