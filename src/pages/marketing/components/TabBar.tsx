import { NavLink } from "react-router-dom";
import { useMarketing } from "../context";

const TABS = [
  { to: "/marketing/tasks", label: "Mis tareas" },
  { to: "/marketing/todo", label: "To Do" },
  { to: "/marketing/home", label: "Briefs" },
  { to: "/marketing/dashboard", label: "Dashboard" },
  { to: "/marketing/requests", label: "Solicitudes" },
];

// Same .nav-links styling (and the same brand font/colors) every other module's top-nav already
// uses — Marketing used to have its own separate look, now it matches.
// Video people only get their own tasks, the To Do board and their dashboard — nothing else of Marketing.
const VIDEO_TABS = TABS.filter(t => ["/marketing/tasks", "/marketing/todo", "/marketing/dashboard"].includes(t.to));

export default function TabBar() {
  const { authedUser } = useMarketing();
  return (
    <ul className="nav-links">
      {(authedUser?.role === "video" ? VIDEO_TABS : TABS).map(t => (
        <NavLink key={t.to} to={t.to} className={({ isActive }) => (isActive ? "active" : "")}>
          {t.label}
        </NavLink>
      ))}
    </ul>
  );
}
