import { NavLink } from "react-router-dom";

const TABS = [
  { to: "/marketing/tasks", label: "Mis tareas" },
  { to: "/marketing/todo", label: "To Do" },
  { to: "/marketing/home", label: "Briefs" },
  { to: "/marketing/dashboard", label: "Dashboard" },
  { to: "/marketing/requests", label: "Solicitudes" },
];

// Same .nav-links styling (and the same brand font/colors) every other module's top-nav already
// uses — Marketing used to have its own separate look, now it matches.
export default function TabBar() {
  return (
    <ul className="nav-links">
      {TABS.map(t => (
        <NavLink key={t.to} to={t.to} className={({ isActive }) => (isActive ? "active" : "")}>
          {t.label}
        </NavLink>
      ))}
    </ul>
  );
}
