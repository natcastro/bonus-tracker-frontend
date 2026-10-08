import { MT } from "../theme";

// Shown right under the description label of every request form: vague descriptions are the main
// cause of extra revision rounds.
export default function SpecificNotice() {
  return (
    <p style={{
      margin: "0 0 6px", fontSize: 12, fontWeight: 800, color: MT.clay,
      textTransform: "uppercase", letterSpacing: "0.04em",
    }}>
      ⚠ Importante: ser específico
    </p>
  );
}
