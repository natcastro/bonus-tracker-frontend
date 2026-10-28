import { MT } from "../theme";
import { todoCategoryOf } from "../types";

// The kind of a To Do task ("Video · Instagram · Story", "Banner página web"…) as a small tag in front of its name.
// Hidden when it would only repeat the name (older tasks whose title is the generic category).
export default function TodoCategoryChip({ task }: { task: { categoryLabel?: string | null; taskType: string; title: string } }) {
  const cat = todoCategoryOf(task);
  if (!cat || cat === "Otro" || cat === task.title.replace(/\s+—\s+/g, " · ")) return null;
  return (
    <span title={cat} style={{
      display: "inline-block", maxWidth: "100%", fontSize: 10.5, fontWeight: 800, letterSpacing: "0.02em", color: MT.clay, background: MT.claySoft,
      borderRadius: 999, padding: "2px 9px", marginRight: 8, verticalAlign: "middle", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
    }}>{cat}</span>
  );
}
