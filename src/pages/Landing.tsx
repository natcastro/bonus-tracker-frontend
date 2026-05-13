import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { verifyPassword } from "../services/api";

type Team = "USA" | "MEX";

export default function Landing() {
  const [selected, setSelected] = useState<Team | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSelect = (team: Team) => {
    setSelected(team);
    setPassword("");
    setError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    setLoading(true);
    setError("");
    try {
      await verifyPassword(selected, password);
      sessionStorage.setItem("team", selected);
      navigate(selected === "USA" ? "/usa" : "/mexico");
    } catch {
      setError("Incorrect password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="landing-root">
      <div className="landing-card">
        <div className="landing-logo">Bonus Tracker</div>
        <p className="landing-subtitle">Select your team to continue</p>

        <div className="team-buttons">
          <button
            className={`team-btn usa ${selected === "USA" ? "active" : ""}`}
            onClick={() => handleSelect("USA")}
          >
            <span className="flag">🇺🇸</span>
            <span>United States</span>
          </button>
          <button
            className={`team-btn mex ${selected === "MEX" ? "active" : ""}`}
            onClick={() => handleSelect("MEX")}
          >
            <span className="flag">🇲🇽</span>
            <span>México</span>
          </button>
        </div>

        {selected && (
          <form onSubmit={handleSubmit} className="password-form">
            <label>Password — {selected === "USA" ? "United States" : "México"}</label>
            <input
              type="password"
              className="form-control"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              autoFocus
              required
            />
            {error && <p className="error-msg">{error}</p>}
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? "Verifying..." : "Enter"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
