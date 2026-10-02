import { NavLink } from "react-router-dom";
import { MT } from "../theme";
import { useMarketing } from "../context";

const INTERNAL_TABS = [
  { to: "/marketing/tasks", label: "Mis tareas" },
  { to: "/marketing/todo", label: "To Do" },
  { to: "/marketing/home", label: "Briefs" },
  { to: "/marketing/dashboard", label: "Dashboard" },
  { to: "/marketing/requests", label: "Solicitudes" },
];

// An "enlace" user only ever sees their own requests — no tab here should even hint at
// Briefs/To Do/Dashboard existing, since those routes aren't registered for that role at all.
const ENLACE_TABS = [
  { to: "/marketing/requests", label: "Solicitudes" },
];

export default function TabBar() {
  const { authedUser } = useMarketing();
  const TABS = authedUser?.role === "enlace" ? ENLACE_TABS : INTERNAL_TABS;
  return (
    <div style={{
      display: "flex", gap: "1.25rem", padding: "0 1.5rem", background: MT.surface,
      borderBottom: `1px solid ${MT.border}`, position: "sticky", top: 49, zIndex: 40, fontFamily: MT.font,
    }}>
      {TABS.map(t => (
        <NavLink key={t.to} to={t.to} style={({ isActive }) => ({
          padding: "0.6rem 0.1rem", fontSize: 13, fontWeight: 700, textDecoration: "none",
          color: isActive ? MT.primary : MT.text2,
          borderBottom: `2px solid ${isActive ? MT.primary : "transparent"}`,
        })}>
          {t.label}
        </NavLink>
      ))}
    </div>
  );
}
