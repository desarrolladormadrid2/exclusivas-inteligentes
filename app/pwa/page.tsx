"use client";

import { useEffect, useState, type FormEvent } from "react";
import { APP_VERSION } from "../version";

type PwaView = "almacen" | "reparto" | "comercial";

type PwaUser = {
  username: string;
  role?: string;
  name?: string;
};

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const FALLBACK_USERS: PwaUser[] = [{ username: "Luis" }, { username: "Jose" }];

const PWA_VIEW_LABELS: Record<PwaView, string> = {
  almacen: "Almacén",
  reparto: "Reparto",
  comercial: "Comercial",
};

function pwaViewPath(view: PwaView) {
  return view === "almacen" ? "/almacen" : view === "reparto" ? "/reparto" : "/comercial";
}

function PwaTruckIcon() {
  return <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false"><path d="M3 8h16v13H3zM19 13h5l5 5v3H19zM24 13v5h5M3 18h16" /><circle cx="8" cy="24" r="3" /><circle cx="25" cy="24" r="3" /></svg>;
}

function readStoredSession() {
  try {
    const raw = localStorage.getItem("excluvas.session") || sessionStorage.getItem("excluvas.session");
    return raw ? (JSON.parse(raw) as PwaUser) : null;
  } catch {
    return null;
  }
}

export default function PwaEntryPage() {
  const [view, setView] = useState<PwaView | null>(null);
  const [users, setUsers] = useState<PwaUser[]>(FALLBACK_USERS);
  const [name, setName] = useState("Luis");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [activeSession, setActiveSession] = useState<PwaUser | null>(null);
  const [useAnotherUser, setUseAnotherUser] = useState(false);
  const [loginBusy, setLoginBusy] = useState(false);
  const [error, setError] = useState("");
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    setActiveSession(readStoredSession());
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const onAppInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    if (window.matchMedia("(display-mode: standalone)").matches) setInstalled(true);

    const controller = new AbortController();
    fetch("/api/users", { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : []))
      .then((data) => {
        const activeUsers = Array.isArray(data)
          ? data.filter((item: PwaUser & { deleted?: number }) => Number(item.deleted || 0) === 0)
          : [];
        if (!activeUsers.length) return;
        setUsers(activeUsers);
        setName((current) => activeUsers.some((item: PwaUser) => item.username === current) ? current : activeUsers[0].username);
      })
      .catch(() => undefined);

    return () => {
      controller.abort();
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/pwa/sw.js", { scope: "/pwa/" }).catch(() => undefined);
  }, []);

  function chooseView(nextView: PwaView) {
    setView(nextView);
    setError("");
    setUseAnotherUser(false);
  }

  function resetView() {
    setView(null);
    setError("");
    setPassword("");
    setUseAnotherUser(false);
  }

  function persistSession(user: PwaUser) {
    const session = JSON.stringify(user);
    if (remember) {
      localStorage.setItem("excluvas.session", session);
      sessionStorage.removeItem("excluvas.session");
    } else {
      sessionStorage.setItem("excluvas.session", session);
      localStorage.removeItem("excluvas.session");
    }
    setActiveSession(user);
  }

  function continueWithSession() {
    if (!view || !activeSession) return;
    if (view !== "reparto" && activeSession.role === "repartidor") {
      setError("Este usuario solo tiene acceso a la vista de reparto.");
      return;
    }
    window.location.assign(pwaViewPath(view));
  }

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!view || !name || !password) {
      setError("Selecciona una vista y escribe la contraseña para continuar.");
      return;
    }
    setLoginBusy(true);
    try {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: name, password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.user) {
        setError(data.error || "Usuario o contraseña incorrectos.");
        return;
      }
      if (view !== "reparto" && data.user.role === "repartidor") {
        setError("Este usuario solo tiene acceso a la vista de reparto.");
        return;
      }
      persistSession(data.user);
      window.location.assign(pwaViewPath(view));
    } catch {
      setError("No se puede conectar con el CRM. Comprueba la conexión.");
    } finally {
      setLoginBusy(false);
    }
  }

  async function installApp() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  }

  return (
    <main className="pwa-entry-page">
      <section className="pwa-entry-shell" aria-labelledby="pwa-title">
        <header className="pwa-entry-header">
          <div className="pwa-entry-brand">
            <span className="pwa-entry-mark" aria-hidden="true">E</span>
            <div>
              <strong>Exclusivas</strong>
              <span>Operativa móvil</span>
            </div>
          </div>
          <span className="pwa-entry-version">v{APP_VERSION}</span>
        </header>

        <div className="pwa-entry-card">
          <div className="pwa-entry-intro">
            <span className="pwa-entry-kicker">Acceso de trabajo</span>
            <h1 id="pwa-title">¿Dónde vas a trabajar?</h1>
            <p>Elige la vista que necesitas. La información se sincroniza con el CRM.</p>
          </div>

          {!view ? (
            <div className="pwa-view-grid" aria-label="Selecciona una vista">
              <button type="button" className="pwa-view-card" onClick={() => chooseView("almacen")}>
                <span className="pwa-view-icon" aria-hidden="true">▦</span>
                <span><strong>Almacén</strong><small>Preparación y carga de pedidos</small></span>
                <span className="pwa-view-arrow" aria-hidden="true">→</span>
              </button>
              <button type="button" className="pwa-view-card" onClick={() => chooseView("reparto")}>
                <span className="pwa-view-icon pwa-view-icon-truck"><PwaTruckIcon /></span>
                <span><strong>Reparto</strong><small>Ruta, entregas, cobros e incidencias</small></span>
                <span className="pwa-view-arrow" aria-hidden="true">→</span>
              </button>
              <button type="button" className="pwa-view-card" onClick={() => chooseView("comercial")}>
                <span className="pwa-view-icon" aria-hidden="true">€</span>
                <span><strong>Comercial</strong><small>Pedidos, clientes, visitas y gestión comercial</small></span>
                <span className="pwa-view-arrow" aria-hidden="true">→</span>
              </button>
            </div>
          ) : (
            <div className="pwa-login-step">
              <div className="pwa-selected-view">
                <span className={`pwa-selected-view-icon${view === "reparto" ? " pwa-view-icon-truck" : ""}`}>{view === "almacen" ? "▦" : view === "reparto" ? <PwaTruckIcon /> : "€"}</span>
                <span><small>Vista seleccionada</small><strong>{PWA_VIEW_LABELS[view]}</strong></span>
                <button type="button" className="pwa-change-view" onClick={resetView}>Cambiar</button>
              </div>

              {activeSession && !useAnotherUser ? (
                <div className="pwa-session-box">
                  <span className="pwa-session-status">Sesión activa</span>
                  <strong>{activeSession.name || activeSession.username}</strong>
                  <p>Continuar con la sesión guardada en este dispositivo.</p>
                  {error && <small className="pwa-entry-error">{error}</small>}
                  <button type="button" className="pwa-entry-button" onClick={continueWithSession}>Continuar</button>
                  <button type="button" className="pwa-secondary-button" onClick={() => { setUseAnotherUser(true); setError(""); }}>Entrar con otro usuario</button>
                </div>
              ) : (
                <form className="pwa-login-form" onSubmit={login}>
                  <label>
                    Usuario
                    <select value={name} onChange={(event) => setName(event.target.value)}>
                      {users.map((item) => <option key={item.username} value={item.username}>{item.username}{item.role === "repartidor" ? " · Reparto" : ""}</option>)}
                    </select>
                  </label>
                  <label>
                    Contraseña
                    <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoFocus />
                  </label>
                  <label className="pwa-remember-option">
                    <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
                    Recordarme en este equipo
                  </label>
                  {error && <small className="pwa-entry-error">{error}</small>}
                  <button className="pwa-entry-button" disabled={loginBusy}>{loginBusy ? "Comprobando…" : "Entrar"}</button>
                </form>
              )}
            </div>
          )}
        </div>

        <footer className="pwa-entry-footer">
          {installPrompt && !installed ? <button type="button" className="pwa-install-button" onClick={installApp}>＋ Instalar app en este dispositivo</button> : <span>Conexión segura con el CRM</span>}
          <span>Exclusivas Inteligentes</span>
        </footer>
      </section>
    </main>
  );
}
