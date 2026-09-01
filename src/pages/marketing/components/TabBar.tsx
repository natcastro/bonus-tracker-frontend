import { NavLink } from "react-router-dom";
import { MT } from "../theme";

const TABS = [
  { to: "/marketing/tasks", label: "Mis tareas" },
  { to: "/marketing/home", label: "Vista general" },
];

export default function TabBar() {
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
