"use client";
import { useEffect, useState } from "react";

function apiUrl(path: string) {
  return path;
}

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any>(null);
  // No pintamos el login hasta resolver la sesión persistida; así evitamos
  // el parpadeo del formulario al recargar una sesión válida.
  const [sessionReady, setSessionReady] = useState(false);
  const [name, setName] = useState("Luis");
  const [users, setUsers] = useState<any[]>([{ username: "Luis" }, { username: "Jose" }]);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [isPublicOrderPortal, setIsPublicOrderPortal] = useState(false);
  const [currentPath, setCurrentPath] = useState("");
  useEffect(() => {
    const path = window.location.pathname.replace(/\/$/, "");
    setCurrentPath(path || "/");
    setIsPublicOrderPortal(["/portal-pedidos", "/web"].includes(path) || path.startsWith("/seguimiento/"));
    try {
      const saved =
        localStorage.getItem("excluvas.session") ||
        sessionStorage.getItem("excluvas.session");
      if (saved) setUser(JSON.parse(saved));
    } catch {}
    setSessionReady(true);
  }, []);
  useEffect(() => {
    if (!sessionReady || user?.role !== "repartidor" || currentPath === "/reparto") return;
    window.location.replace("/reparto");
  }, [currentPath, sessionReady, user]);
  useEffect(() => {
    fetch(apiUrl("/api/users"))
      .then((response) => (response.ok ? response.json() : []))
      .then((data) => {
        const activeUsers = Array.isArray(data)
          ? data.filter((item: any) => Number(item.deleted || 0) === 0)
          : [];
        const priority = ["Luis", "Jose"];
        const orderedUsers = activeUsers.sort((a: any, b: any) => {
          const aPriority = priority.indexOf(a.username);
          const bPriority = priority.indexOf(b.username);
          if (aPriority !== -1 || bPriority !== -1) {
            return (aPriority === -1 ? priority.length : aPriority) - (bPriority === -1 ? priority.length : bPriority);
          }
          return String(a.username || "").localeCompare(String(b.username || ""), "es");
        });
        setUsers(orderedUsers.length ? orderedUsers : [{ username: "Luis" }, { username: "Jose" }]);
        if (orderedUsers.length && !orderedUsers.some((item: any) => item.username === name)) {
          setName(orderedUsers[0].username);
        }
      })
      .catch(() => setUsers([{ username: "Luis" }, { username: "Jose" }]));
  }, []);
  async function login(e: any) {
    e.preventDefault();
    setError("");
    if (!name || !password) {
      setError("Escribe la contraseña para continuar.");
      return;
    }
    setLoginBusy(true);
    try {
      const r = await fetch(apiUrl("/api/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: name, password }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setError(d.error || "Usuario o contraseña incorrectos.");
        return;
      }
      const session = JSON.stringify(d.user);
      if (remember) {
        localStorage.setItem("excluvas.session", session);
        sessionStorage.removeItem("excluvas.session");
      } else {
        sessionStorage.setItem("excluvas.session", session);
        localStorage.removeItem("excluvas.session");
      }
      setUser(d.user);
    } catch {
      setError("No se puede conectar con el CRM. Comprueba que la aplicación esté iniciada.");
    } finally {
      setLoginBusy(false);
    }
  }
  function logout() {
    localStorage.removeItem("excluvas.session");
    sessionStorage.removeItem("excluvas.session");
    setUser(null);
    setPassword("");
    setShowPassword(false);
  }
  if (!sessionReady)
    return <main className="auth-loading"><div className="auth-loading-mark">E</div><span>Comprobando sesión…</span></main>;
  if (user?.role === "repartidor" && currentPath !== "/reparto")
    return <main className="auth-loading"><div className="auth-loading-mark">E</div><span>Abriendo vista de reparto…</span></main>;
  if (isPublicOrderPortal) return <div className="public-order-portal">{children}</div>;
  if (!user)
    return (
      <main className="login-page">
        <form className="login-card" onSubmit={login}>
          <div className="brand-mark">E</div>
          <h1>Exclusivas</h1>
          <p>Acceso al CRM local</p>
          <label>
            Usuario
            <select value={name} onChange={(e) => setName(e.target.value)}>
              {users.map((item) => <option key={item.username} value={item.username}>{item.username}{item.role === "repartidor" ? " · Repartidor" : ""}</option>)}
            </select>
          </label>
          <label>
            Contraseña
            <span className="password-field">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                aria-label="Contraseña"
              />
              <button type="button" className="password-toggle" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"} aria-pressed={showPassword}>
                {showPassword ? "Ocultar" : "Mostrar"}
              </button>
            </span>
          </label>
          <label className="remember-option">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />{" "}
            Recordarme en este equipo
          </label>
          {error && <small className="login-error">{error}</small>}
          <button className="button primary" disabled={loginBusy}>
            {loginBusy ? "Comprobando…" : "Entrar"}
          </button>
        </form>
      </main>
    );
  return (
    <div className="auth-session">
      {children}
    </div>
  );
}
