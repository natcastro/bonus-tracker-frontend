// Local-only reference page for the FTC Hub design system (rendered at /styleguide in dev,
// outside the Microsoft login). Everything here uses the shared classes from index.css with
// sample data — it never touches Supabase or any module logic.
import { useState } from "react";
import type { ReactNode } from "react";
import { GlobeIcon, PaletteIcon, UsersIcon } from "../components/icons";
import { Illustration } from "../components/Illustrations";
import type { IllustrationKind } from "../components/Illustrations";

const SWATCHES: { name: string; v: string; note: string }[] = [
  { name: "Ink", v: "--ink", note: "Texto, botón primario" },
  { name: "Ink 2", v: "--ink-2", note: "Texto secundario" },
  { name: "Ink 3", v: "--ink-3", note: "Etiquetas, ayuda" },
  { name: "Line strong", v: "--line-strong", note: "Bordes de inputs" },
  { name: "Line", v: "--line", note: "Bordes de tarjetas" },
  { name: "Paper 3", v: "--paper-3", note: "Hover, fondos suaves" },
  { name: "Paper 2", v: "--paper-2", note: "Filas, hover" },
  { name: "Accent", v: "--accent", note: "Verde oliva FTC" },
];

const TAGS = ["green", "blue", "peach", "yellow", "red", "violet", "grey"] as const;
const TAG_LABELS: Record<(typeof TAGS)[number], string> = {
  green: "Aprobado", blue: "En revisión", peach: "Pendiente", yellow: "Por vencer", red: "Atrasado", violet: "Video", grey: "Borrador",
};

const ROWS = [
  { name: "Savannah Nguyen", team: "Operations", status: "green", score: "96.4", bonus: "$370.00" },
  { name: "Devon Lane", team: "Strategy", status: "blue", score: "91.0", bonus: "$312.50" },
  { name: "Arlene McCoy", team: "Marketing", status: "peach", score: "88.2", bonus: "$280.00" },
  { name: "Esther Howard", team: "México", status: "red", score: "74.9", bonus: "$120.00" },
] as const;

function Section({ label, title, children }: { label: string; title: string; children: ReactNode }) {
  return (
    <section style={{ borderTop: "1px solid var(--ink)", paddingTop: "1rem", marginTop: "4rem" }}>
      <div className="eyebrow" style={{ marginBottom: "0.5rem" }}>{label}</div>
      <h2 style={{ fontSize: "1.75rem", fontWeight: 600, letterSpacing: "-0.035em", marginBottom: "1.5rem" }}>{title}</h2>
      {children}
    </section>
  );
}

export default function StyleGuide() {
  const [tab, setTab] = useState("Resumen");
  const [modal, setModal] = useState(false);

  return (
    <div>
      <nav className="top-nav">
        <div className="logo">FTC Hub — <span style={{ color: "var(--ink-3)", fontWeight: 500 }}>Design system</span></div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <select className="month-selector" defaultValue="oct">
            <option value="oct">24 oct – 23 nov</option>
            <option value="sep">24 sep – 23 oct</option>
          </select>
          <button className="btn btn-secondary btn-sm">← FTC Hub</button>
        </div>
        <ul className="nav-links">
          {["Resumen", "Agentes", "Historial", "Configuración"].map(t => (
            <li key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>{t}</li>
          ))}
        </ul>
      </nav>

      <main className="content-area" style={{ maxWidth: 1080 }}>
        <div style={{ padding: "3rem 0 0" }}>
          <div className="eyebrow" style={{ marginBottom: "0.9rem" }}>Dirección visual · v0.1</div>
          <h1 style={{ fontSize: "clamp(2.25rem, 6vw, 4rem)", fontWeight: 600, letterSpacing: "-0.05em", lineHeight: 1, maxWidth: 760 }}>
            Un solo lenguaje para todo el Hub
          </h1>
          <p style={{ color: "var(--ink-2)", fontSize: "1.1rem", marginTop: "1.1rem", maxWidth: 560 }}>
            Tinta cálida sobre blanco, bordes finos en lugar de sombras, números en mono y color solo donde comunica un estado.
          </p>
        </div>

        <Section label="Tipografía" title="Geist + Geist Mono">
          <div className="card" style={{ display: "grid", gap: "1.25rem" }}>
            {[
              { l: "Display · 600 · −0.045em", s: { fontSize: "2.5rem", fontWeight: 600, letterSpacing: "-0.045em", lineHeight: 1.05 }, t: "Bonos del ciclo" },
              { l: "Título · 600 · −0.025em", s: { fontSize: "1.5rem", fontWeight: 600, letterSpacing: "-0.025em" }, t: "Customer Service — Operations" },
              { l: "Cuerpo · 400", s: { fontSize: "0.95rem", color: "var(--ink-2)" }, t: "El ciclo va del 24 al 23. Los bonos se aprueban y se envían a HR al cierre." },
              { l: "Mono · números y etiquetas", s: { fontFamily: "var(--font-mono)", fontSize: "1.1rem" }, t: "$1,284.50 · 96.4% · 24/10/2026" },
            ].map(r => (
              <div key={r.l} style={{ display: "grid", gridTemplateColumns: "minmax(140px, 220px) 1fr", gap: "1rem", alignItems: "baseline" }}>
                <span className="eyebrow">{r.l}</span>
                <span style={r.s}>{r.t}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section label="Color" title="Neutros cálidos, un acento, pasteles para estados">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: "0.75rem", marginBottom: "1.25rem" }}>
            {SWATCHES.map(s => (
              <div key={s.v}>
                <div style={{ height: 64, background: `var(${s.v})`, border: "1px solid var(--line)", borderRadius: "var(--radius-sm)" }} />
                <div style={{ fontSize: "0.82rem", fontWeight: 500, marginTop: "0.4rem" }}>{s.name}</div>
                <div style={{ fontSize: "0.74rem", color: "var(--ink-3)" }}>{s.note}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
            {TAGS.map(t => (
              <span key={t} className="badge" style={{ background: `var(--tag-${t}-bg)`, color: `var(--tag-${t}-fg)` }}>{TAG_LABELS[t]}</span>
            ))}
          </div>
        </Section>

        <Section label="Componentes" title="Botones y formularios">
          <div className="card">
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center", marginBottom: "1.5rem" }}>
              <button className="btn btn-primary">Aprobar y enviar a HR</button>
              <button className="btn btn-secondary">Exportar</button>
              <button className="btn btn-danger">Eliminar</button>
              <button className="btn btn-primary" disabled>Deshabilitado</button>
              <button className="btn btn-secondary btn-sm">Pequeño</button>
              <button className="btn btn-secondary" onClick={() => setModal(true)}>Abrir modal</button>
            </div>
            <div className="search-bar" style={{ marginBottom: "1.5rem" }}>
              <input placeholder="Buscar por título, código, categoría…" />
              <button aria-label="Buscar">↑</button>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="sg-name">Nombre del agente</label>
                <input id="sg-name" className="form-control" placeholder="Ej. Savannah Nguyen" />
              </div>
              <div className="form-group">
                <label htmlFor="sg-team">Equipo</label>
                <select id="sg-team" className="form-control" defaultValue="ops">
                  <option value="ops">Operations</option>
                  <option value="apt">Strategy</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="sg-score">TikTok Score</label>
                <input id="sg-score" className="form-control mono" defaultValue="4.8" />
              </div>
            </div>
          </div>
        </Section>

        <Section label="Datos" title="Indicadores y tablas">
          <div className="summary-cards">
            {[
              { h: "Bono total del ciclo", a: "$4,812.50" },
              { h: "Agentes activos", a: "14" },
              { h: "Handling time", a: "96.4%" },
              { h: "Casos pendientes", a: "7" },
            ].map(s => (
              <div className="stat-card" key={s.h}><h3>{s.h}</h3><div className="amount">{s.a}</div></div>
            ))}
          </div>
          <div className="card" style={{ padding: "0.5rem 0.6rem 0.25rem" }}>
            <div style={{ overflowX: "auto" }}>
              <table className="data-table" style={{ marginTop: 0 }}>
                <thead>
                  <tr><th>Agente</th><th>Equipo</th><th>Estado</th><th style={{ textAlign: "right" }}>Score</th><th style={{ textAlign: "right" }}>Bono</th></tr>
                </thead>
                <tbody>
                  {ROWS.map(r => (
                    <tr key={r.name}>
                      <td style={{ fontWeight: 500 }}>{r.name}</td>
                      <td style={{ color: "var(--ink-2)" }}>{r.team}</td>
                      <td><span className="badge" style={{ background: `var(--tag-${r.status}-bg)`, color: `var(--tag-${r.status}-fg)` }}>{TAG_LABELS[r.status]}</span></td>
                      <td className="mono" style={{ textAlign: "right" }}>{r.score}</td>
                      <td className="mono" style={{ textAlign: "right" }}>{r.bonus}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Section>

        <Section label="Gráficas" title="Barras en salvia, negativos en rojo ladrillo">
          <div style={{ background: "var(--paper-3)", padding: "2rem" }}>
            <div style={{ background: "#fff", borderRadius: 24, padding: "2rem", maxWidth: 520 }}>
              <div style={{ display: "flex", alignItems: "flex-end", gap: "1.25rem", height: 150, borderBottom: "1px solid var(--chart-sage-ink)" }}>
                {[62, 38, 100, 74, 22].map((h, i) => <div key={i} style={{ flex: 1, height: `${h}%`, background: "var(--chart-sage)" }} />)}
              </div>
              <div style={{ display: "flex", gap: "1.25rem", height: 70 }}>
                {[55, 70, 35, 90, 40].map((h, i) => <div key={i} style={{ flex: 1, height: `${h}%`, background: "linear-gradient(#E4E3E0, #F7F7F5)" }} />)}
              </div>
              <table className="data-table" style={{ marginTop: "1.25rem" }}>
                <thead><tr><th></th><th style={{ textAlign: "right" }}>Semana 4</th><th style={{ textAlign: "right" }}>Semana 5</th></tr></thead>
                <tbody>
                  <tr><td>Gastos</td><td className="mono" style={{ textAlign: "right", color: "var(--neg-soft)" }}>- $44,571.19</td><td className="mono" style={{ textAlign: "right", color: "var(--neg)" }}>- $39,571.84</td></tr>
                  <tr><td>Bonos</td><td className="mono" style={{ textAlign: "right", color: "var(--pos-soft)" }}>$47,696.00</td><td /></tr>
                </tbody>
              </table>
            </div>
          </div>
        </Section>

        <Section label="Iconos pequeños" title="Briefs como icono, no como ilustración">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "0.75rem" }}>
            {([["briefDoc", "A", "Documento"], ["clipboard", "B", "Lista"], ["folder", "C", "Carpeta"], ["stack", "D", "Capas"], ["presentation", "E", "Presentación"], ["compass", "F", "Estrategia"]] as [IllustrationKind, string, string][]).map(([k, a, b]) => (
              <div key={k} className="fx-card" style={{ border: "1px solid var(--ink)", padding: "1.1rem 1.25rem", display: "flex", flexDirection: "column", gap: "1.5rem", transition: "background-color 0.18s" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ width: 40, height: 40, border: "1px solid var(--ink)", display: "flex", alignItems: "center", justifyContent: "center" }}><Illustration kind={k} size={26} /></span>
                  <span className="eyebrow">Revisión 1</span>
                </div>
                <div><div className="fx-title" style={{ fontWeight: 600, fontSize: "1.1rem", letterSpacing: "-0.02em" }}>C-031 / C-082</div><div style={{ fontSize: "0.8rem", color: "var(--ink-3)" }}>Opción {a} · {b}</div></div>
              </div>
            ))}
          </div>
        </Section>

        <Section label="Opciones" title="Reemplazo del megáfono (Briefs)">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "0.75rem" }}>
            {([["briefDoc", "A", "Documento de brief"], ["clipboard", "B", "Lista de verificación"], ["folder", "C", "Carpeta de proyecto"], ["stack", "D", "Capas de campaña"], ["presentation", "E", "Presentación"], ["compass", "F", "Estrategia"]] as [IllustrationKind, string, string][]).map(([k, a, b]) => (
              <div key={k} className="fx-card" style={{ border: "1px solid var(--ink)", padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1.25rem", transition: "background-color 0.18s" }}>
                <div><div className="eyebrow">Opción {a}</div><div className="fx-title" style={{ fontWeight: 600, fontSize: "1.1rem", letterSpacing: "-0.02em" }}>{b}</div></div>
                <div style={{ display: "flex", justifyContent: "center" }}><Illustration kind={k} size={120} /></div>
              </div>
            ))}
          </div>
        </Section>

        <Section label="Ilustraciones" title="Líneas finas, un punto relleno">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: "0.75rem" }}>
            {([["megaphone", "Campañas", "Briefs y lanzamientos"], ["chart", "Resultados", "Métricas del ciclo"], ["funnel", "Embudo", "Leads y conversión"], ["calendar", "Planeación", "Calendario de contenido"], ["post", "Contenido", "Posts y reels"], ["mail", "Mensajes", "Correo y secuencias"], ["canvas", "Diseño", "Piezas creativas"], ["target", "Metas", "Objetivos del equipo"], ["dots", "FTC USA", "Disco de puntos"], ["layers", "Marketing", "Capas"], ["grid", "FTC México", "Rejilla"], ["line", "Management", "Serpentina"], ["rings", "HR", "Anillos"]] as [IllustrationKind, string, string][]).map(([k, a, b]) => (
              <div key={k} className="fx-card" style={{ border: "1px solid var(--ink)", padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1.25rem", transition: "background-color 0.18s" }}>
                <div><div style={{ fontSize: "0.85rem", color: "var(--ink-2)" }}>{a}</div><div className="fx-title" style={{ fontWeight: 600, fontSize: "1.1rem", letterSpacing: "-0.02em" }}>{b}</div></div>
                <div style={{ display: "flex", justifyContent: "center" }}><Illustration kind={k} size={120} /></div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: "1.5rem", flexWrap: "wrap", alignItems: "center", marginTop: "1.5rem" }}>
            {[["Calificado", "3", "grey", "$160,500"], ["Propuesta inicial", "1", "blue", "$118,265"], ["Video", "3", "violet", "$17,000"], ["Aprobado", "1", "green", "$9,400"]].map(([l, n, t, a]) => (
              <span key={l} style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem" }}>
                <span style={{ background: `var(--tag-${t}-bg)`, color: `var(--tag-${t}-fg)`, borderRadius: 999, padding: "0.3rem 0.9rem", fontSize: "0.95rem" }}>{l}</span>
                <span className="mono" style={{ color: "var(--ink-3)" }}>{n}</span>
                <span className="mono" style={{ color: "var(--ink-3)", marginLeft: "1rem" }}>{a}</span>
              </span>
            ))}
          </div>
        </Section>

        <Section label="Navegación" title="Tarjetas del Hub">
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            {[
              { i: <GlobeIcon color="#2A5270" />, c: "#2A5270", e: "Región", t: "FTC USA", s: "Customer Service & TikTok Lives" },
              { i: <PaletteIcon color="#3E6B45" />, c: "#3E6B45", e: "Equipo", t: "Marketing", s: "Briefs de producto — Laura & Diseño" },
              { i: <UsersIcon color="#0f766e" />, c: "#0f766e", e: "Equipo", t: "HR", s: "Recursos humanos" },
            ].map(c => (
              <button key={c.t} className="hub-card" style={{ flex: "1 1 240px", maxWidth: 340 }}>
                <div className="hub-card__top">
                  <span className="hub-card__icon" style={{ background: c.c + "14" }}>{c.i}</span>
                  <span className="eyebrow">{c.e}</span>
                </div>
                <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "0.75rem" }}>
                  <div>
                    <div className="hub-card__title">{c.t}</div>
                    <div className="hub-card__sub">{c.s}</div>
                  </div>
                  <span className="hub-card__arrow" aria-hidden>→</span>
                </div>
              </button>
            ))}
          </div>
        </Section>
      </main>

      <div className={`modal-overlay${modal ? " active" : ""}`} onClick={() => setModal(false)}>
        <div className="modal" onClick={e => e.stopPropagation()}>
          <div className="modal-header"><h3>Aprobar bonos del ciclo</h3></div>
          <p style={{ color: "var(--ink-2)", fontSize: "0.9rem" }}>Se enviará el resumen a HR. Esta es solo una muestra del estilo del modal.</p>
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setModal(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={() => setModal(false)}>Aprobar</button>
          </div>
        </div>
      </div>
    </div>
  );
}
