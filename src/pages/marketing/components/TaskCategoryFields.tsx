import { useMemo, useState } from "react";
import { MT } from "../theme";
import {
  TASK_CATEGORIES, PUBLICIDAD_TYPES, GRAN_FORMATO_TYPES, TODO_TASK_TYPES,
  VIDEO_APPS, VIDEO_FORMATS,
} from "../types";
import type { TaskCategory } from "../types";

export const LANGUAGE_OPTIONS = ["Español", "Inglés", "Ambos", "Otro"] as const;

export interface TaskCategoryState {
  category: TaskCategory | null;
  selectedType: string | null;
  customType: string;
  tipoMedio: string;
  area: string;
  customMeasurements: boolean;
  ancho: string;
  alto: string;
  // Unit for both measurements — picked by the requester, shown next to the numbers and in the request text.
  unidad: "cm" | "inch";
  ubicacion: string;
  // Optional: whether the large-format print goes indoors or outdoors (affects material/finish).
  ambiente: "" | "Interior" | "Exterior";
  idioma: string;
  // Free text, only used when idioma is "Otro".
  idiomaOtro: string;
  videoApp: string;
  videoAppOtro: string; // free text, only when videoApp is "Otro"
  videoFormato: string;
  videoOrientacion: string;
  videoSonido: string;
  videoSubtitulos: string;
  videoVozEnOff: string;
  // Video brief template — these replace the generic description box for the Video category.
  videoProposito: string;
  videoScript: string;
  videoDescripcion: string;
}

export const EMPTY_TASK_CATEGORY_STATE: TaskCategoryState = {
  category: null, selectedType: null, customType: "",
  tipoMedio: "", area: "",
  customMeasurements: false, ancho: "", alto: "", unidad: "cm", ubicacion: "", ambiente: "", idioma: "", idiomaOtro: "",
  videoApp: "", videoAppOtro: "", videoFormato: "", videoOrientacion: "", videoSonido: "", videoSubtitulos: "", videoVozEnOff: "",
  videoProposito: "", videoScript: "", videoDescripcion: "",
};

function typesForCategory(category: TaskCategory | null): readonly string[] {
  if (category === "publicidad") return PUBLICIDAD_TYPES;
  if (category === "gran_formato") return GRAN_FORMATO_TYPES;
  if (category === "piezas_digitales") return TODO_TASK_TYPES;
  return [];
}

// "Video" never offers a type checklist (it's fields-only), so it's always "ready" the moment a
// category is picked; the other 3 need an actual type (or "Otro" + custom text) selected first.
export function taskCategoryIsComplete(s: TaskCategoryState): boolean {
  if (!s.category) return false;
  if (s.idioma === "Otro" && !s.idiomaOtro.trim()) return false;
  if (s.category === "videos") {
    if (s.videoApp === "Otro" && !s.videoAppOtro.trim()) return false;
    return s.videoProposito.trim().length > 0 && s.videoDescripcion.trim().length > 0;
  }
  if (!s.selectedType) return false;
  if (s.selectedType === "Otro") return s.customType.trim().length > 0;
  return true;
}

export function taskCategoryTitle(s: TaskCategoryState): string {
  if (s.category === "videos") {
    const app = s.videoApp === "Otro" && s.videoAppOtro.trim() ? s.videoAppOtro.trim() : s.videoApp;
    return ["Video", app, s.videoFormato].filter(Boolean).join(" — ");
  }
  if (!s.selectedType) return "";
  return s.selectedType === "Otro" ? s.customType.trim() : s.selectedType;
}

const measure = (value: string, unit: string) => (value.trim() ? `${value.trim()} ${unit}` : "?");

// Folds every category-specific answer into one readable block — prepended to the free-form
// description, since there's no dedicated column per field (most only apply to one category).
export function taskCategoryDetailsBlock(s: TaskCategoryState): string {
  const lines: string[] = [];
  if (s.category === "publicidad" || s.category === "gran_formato") {
    if (s.tipoMedio) lines.push(`Tipo de medio: ${s.tipoMedio}`);
    if (s.area.trim()) lines.push(`Área que solicita: ${s.area.trim()}`);
  }
  if (s.category === "gran_formato") {
    if (s.ancho.trim() || s.alto.trim()) lines.push(`Medidas: ${measure(s.ancho, s.unidad)} x ${measure(s.alto, s.unidad)}`);
    const place = [s.ambiente, s.ubicacion.trim()].filter(Boolean).join(" — ");
    if (place) lines.push(`Ubicación del impreso: ${place}`);
  }
  if ((s.category === "publicidad" || s.category === "piezas_digitales") && s.customMeasurements) {
    lines.push(`Medidas personalizadas: ${measure(s.ancho, s.unidad)} x ${measure(s.alto, s.unidad)}`);
  }
  if (s.category === "videos") {
    if (s.videoApp) lines.push(`App: ${s.videoApp === "Otro" && s.videoAppOtro.trim() ? s.videoAppOtro.trim() : s.videoApp}`);
    if (s.videoFormato) lines.push(`Formato: ${s.videoFormato}`);
    if (s.videoOrientacion) lines.push(`Orientación: ${s.videoOrientacion}`);
    if (s.videoSonido) lines.push(`Sonido: ${s.videoSonido}`);
    if (s.videoSubtitulos) lines.push(`Subtítulos: ${s.videoSubtitulos}`);
    if (s.videoVozEnOff) lines.push(`Voz en off (locutor): ${s.videoVozEnOff}`);
  }
  if (s.idioma) lines.push(`Idioma: ${s.idioma === "Otro" && s.idiomaOtro.trim() ? s.idiomaOtro.trim() : s.idioma}`);
  if (s.category === "videos") {
    if (s.videoProposito.trim()) lines.push(`\nPropósito del video:\n${s.videoProposito.trim()}`);
    lines.push(`\nScript del video:\n${s.videoScript.trim() || "Por definir"}`);
    if (s.videoDescripcion.trim()) lines.push(`\nDescripción detallada del video:\n${s.videoDescripcion.trim()}`);
  }
  return lines.join("\n");
}

const fieldStyle: React.CSSProperties = {
  width: "100%", fontFamily: MT.font, fontSize: 13.5, padding: "9px 11px",
  border: `1px solid ${MT.border}`, borderRadius: 8, outline: "none", boxSizing: "border-box",
};
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: MT.text2, display: "block", marginBottom: 6 };

function SegButtons({ options, value, onChange }: { options: readonly string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {options.map(opt => (
        <button key={opt} type="button" onClick={() => onChange(opt)} style={{
          fontFamily: MT.font, fontSize: 12.5, fontWeight: 700, cursor: "pointer",
          padding: "6px 12px", borderRadius: 999,
          border: `1px solid ${value === opt ? MT.primary : MT.border}`,
          background: value === opt ? MT.primarySoft : MT.surface,
          color: value === opt ? MT.primary : MT.text2,
        }}>{opt}</button>
      ))}
    </div>
  );
}

// Width/height inputs with a cm / inch switch; the unit shows up inside each field as soon as a number is typed.
function MeasureInputs({ state, set }: { state: TaskCategoryState; set: (patch: Partial<TaskCategoryState>) => void }) {
  const numeric = (v: string) => v.replace(/[^0-9.,]/g, "");
  const field = (value: string, onChange: (v: string) => void, placeholder: string) => (
    <div style={{ position: "relative", flex: 1 }}>
      <input
        style={{ ...fieldStyle, paddingRight: 52 }} value={value} inputMode="decimal"
        onChange={e => onChange(numeric(e.target.value))} placeholder={placeholder}
      />
      {value.trim() && (
        <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 12.5, fontWeight: 700, color: MT.text3, pointerEvents: "none" }}>
          {state.unidad}
        </span>
      )}
    </div>
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <SegButtons options={["cm", "inch"]} value={state.unidad} onChange={v => set({ unidad: v as "cm" | "inch" })} />
      <div style={{ display: "flex", gap: 10 }}>
        {field(state.ancho, v => set({ ancho: v }), "Ancho")}
        {field(state.alto, v => set({ alto: v }), "Alto")}
      </div>
    </div>
  );
}

export default function TaskCategoryFields({ state, onChange }: { state: TaskCategoryState; onChange: (next: TaskCategoryState) => void }) {
  const [query, setQuery] = useState("");
  const [showOptions, setShowOptions] = useState(false);
  const set = (patch: Partial<TaskCategoryState>) => onChange({ ...state, ...patch });

  const types = typesForCategory(state.category);
  const isOtro = state.selectedType === "Otro";
  const filteredTypes = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return types;
    return types.filter(t => t.toLowerCase().includes(q));
  }, [types, query]);

  const selectCategory = (category: TaskCategory) => {
    onChange({ ...EMPTY_TASK_CATEGORY_STATE, category });
    setQuery(""); setShowOptions(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <label style={labelStyle}>Categoría</label>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {TASK_CATEGORIES.map(c => (
            <button key={c.key} type="button" onClick={() => selectCategory(c.key)} style={{
              fontFamily: MT.font, fontSize: 13, fontWeight: 700, cursor: "pointer",
              padding: "8px 14px", borderRadius: 999,
              border: `1px solid ${state.category === c.key ? MT.primary : MT.border}`,
              background: state.category === c.key ? MT.primary : MT.surface,
              color: state.category === c.key ? "#fff" : MT.text1,
            }}>{c.label}</button>
          ))}
        </div>
      </div>

      {state.category && state.category !== "videos" && (
        <div style={{ position: "relative" }}>
          <label style={labelStyle}>Tipo de pieza</label>
          <input
            style={fieldStyle}
            value={state.selectedType ? (isOtro ? "Otro" : state.selectedType) : query}
            onChange={e => { setQuery(e.target.value); set({ selectedType: null }); setShowOptions(true); }}
            onFocus={() => setShowOptions(true)}
            placeholder="Escribe para buscar..."
          />
          {showOptions && !state.selectedType && (
            <div style={{
              position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, zIndex: 10,
              background: MT.surface, border: `1px solid ${MT.border}`, borderRadius: 8, boxShadow: MT.shadowLg,
              maxHeight: 220, overflowY: "auto",
            }}>
              {filteredTypes.length === 0 ? (
                <div style={{ padding: "10px 12px", fontSize: 12.5, color: MT.text3 }}>Sin resultados — elige "Otro" y descríbelo.</div>
              ) : (
                filteredTypes.map(t => (
                  <div
                    key={t}
                    onClick={() => { set({ selectedType: t }); setQuery(t); setShowOptions(false); }}
                    style={{ padding: "9px 12px", fontSize: 13, color: MT.text1, cursor: "pointer" }}
                    onMouseEnter={e => (e.currentTarget.style.background = MT.surfaceAlt)}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >{t}</div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {isOtro && (
        <div>
          <label style={labelStyle}>¿Cómo se llama la pieza?</label>
          <input style={fieldStyle} value={state.customType} onChange={e => set({ customType: e.target.value })} placeholder="Descríbela..." />
        </div>
      )}

      {(state.category === "publicidad" || state.category === "gran_formato") && (
        <>
          <div>
            <label style={labelStyle}>Tipo de medio</label>
            <SegButtons options={["Impresión", "Digital Virtual"]} value={state.tipoMedio} onChange={v => set({ tipoMedio: v })} />
          </div>
          <div>
            <label style={labelStyle}>Área que solicita (opcional)</label>
            <input style={fieldStyle} value={state.area} onChange={e => set({ area: e.target.value })} placeholder="Ej. Ventas" />
          </div>
        </>
      )}

      {state.category === "gran_formato" && (
        <>
          <div>
            <label style={labelStyle}>Medidas (ancho x alto) — elige cm o inch</label>
            <MeasureInputs state={state} set={set} />
          </div>
          <div>
            <label style={labelStyle}>¿Dónde estará ubicado el impreso? (opcional)</label>
            <SegButtons options={["Interior", "Exterior"]} value={state.ambiente}
              onChange={v => set({ ambiente: state.ambiente === v ? "" : (v as "Interior" | "Exterior") })} />
            <input style={{ ...fieldStyle, marginTop: 8 }} value={state.ubicacion} onChange={e => set({ ubicacion: e.target.value })} placeholder="Ej. Tienda Bogotá Centro" />
          </div>
        </>
      )}

      {(state.category === "publicidad" || state.category === "piezas_digitales") && (
        <div>
          <label style={labelStyle}>¿Quieres colocar medidas personalizadas?</label>
          <SegButtons options={["Sí", "No"]} value={state.customMeasurements ? "Sí" : "No"} onChange={v => set({ customMeasurements: v === "Sí" })} />
          {state.customMeasurements && (
            <div style={{ marginTop: 10 }}>
              <MeasureInputs state={state} set={set} />
            </div>
          )}
        </div>
      )}

      {state.category === "videos" && (
        <>
          <div>
            <label style={labelStyle}>App</label>
            <SegButtons options={VIDEO_APPS} value={state.videoApp} onChange={v => set({ videoApp: v })} />
            {state.videoApp === "Otro" && (
              <input style={{ ...fieldStyle, marginTop: 8 }} value={state.videoAppOtro} placeholder="¿Cuál app o plataforma?"
                onChange={e => set({ videoAppOtro: e.target.value })} autoFocus />
            )}
          </div>
          <div>
            <label style={labelStyle}>Formato</label>
            <SegButtons options={VIDEO_FORMATS} value={state.videoFormato} onChange={v => set({ videoFormato: v })} />
          </div>
          <div>
            <label style={labelStyle}>Orientación</label>
            <SegButtons options={["Vertical", "Horizontal"]} value={state.videoOrientacion} onChange={v => set({ videoOrientacion: v })} />
          </div>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            <div>
              <label style={labelStyle}>¿Lleva sonido?</label>
              <SegButtons options={["Sí", "No"]} value={state.videoSonido} onChange={v => set({ videoSonido: v })} />
            </div>
            <div>
              <label style={labelStyle}>¿Lleva subtítulos?</label>
              <SegButtons options={["Sí", "No"]} value={state.videoSubtitulos} onChange={v => set({ videoSubtitulos: v })} />
            </div>
            <div>
              <label style={labelStyle}>¿Lleva voz en off (locutor)?</label>
              <SegButtons options={["Sí", "No"]} value={state.videoVozEnOff} onChange={v => set({ videoVozEnOff: v })} />
            </div>
          </div>

          {/* Video brief template — a video can't be made from a one-line request */}
          <div style={{ background: MT.surfaceAlt, borderRadius: 10, padding: "0.85rem 0.9rem", display: "flex", flexDirection: "column", gap: 12 }}>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 800, color: MT.clay, textTransform: "uppercase", letterSpacing: "0.04em" }}>
              ⚠ Importante: ser específico
            </p>
            <div>
              <label style={labelStyle}>Propósito del video</label>
              <textarea style={{ ...fieldStyle, resize: "vertical", minHeight: 56 }} value={state.videoProposito}
                onChange={e => set({ videoProposito: e.target.value })}
                placeholder="¿Para qué es el video? Ej. lanzar la faja X, mostrar cómo se usa, promoción de temporada…" />
            </div>
            <div>
              <label style={labelStyle}>Script del video</label>
              <textarea style={{ ...fieldStyle, resize: "vertical", minHeight: 90 }} value={state.videoScript}
                onChange={e => set({ videoScript: e.target.value })}
                placeholder="El texto o guion que se dice / aparece en el video. Si todavía no lo tienes, escribe «Por definir»." />
            </div>
            <div>
              <label style={labelStyle}>Descripción detallada del video</label>
              <textarea style={{ ...fieldStyle, resize: "vertical", minHeight: 90 }} value={state.videoDescripcion}
                onChange={e => set({ videoDescripcion: e.target.value })}
                placeholder="Escena por escena: qué se ve, tomas, música, colores, duración, referencias…" />
            </div>
          </div>
        </>
      )}

      {state.category && (
        <div>
          <label style={labelStyle}>¿En qué idioma?</label>
          <SegButtons options={LANGUAGE_OPTIONS} value={state.idioma} onChange={v => set({ idioma: v })} />
          {state.idioma === "Otro" && (
            <input
              style={{ ...fieldStyle, marginTop: 8 }} value={state.idiomaOtro} placeholder="¿Cuál idioma? (ej. Portugués)"
              onChange={e => set({ idiomaOtro: e.target.value })} autoFocus
            />
          )}
        </div>
      )}
    </div>
  );
}
