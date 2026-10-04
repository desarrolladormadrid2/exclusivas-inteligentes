"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ClientOrderPortal } from "../page";
import { APP_VERSION } from "../version";

type CustomerAuthMode = "login" | "register";

type CustomerSession = {
  kind: "cliente";
  id: number;
  name: string;
  email: string;
  token: string;
};

type RegistrationStatus = {
  id: number;
  email: string;
  status: "Pendiente de validar" | "Validada" | "Rechazada";
  message?: string;
};

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const EMPTY_REGISTRATION = {
  company_name: "",
  commercial_name: "",
  tax_id: "",
  contact_name: "",
  email: "",
  phone: "",
  address: "",
  city: "",
  delivery_address: "",
  delivery_city: "",
  message: "",
  password: "",
  passwordConfirm: "",
};

function readCustomerSession() {
  try {
    const raw = localStorage.getItem("excluvas.portal.session");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CustomerSession;
    return parsed?.kind === "cliente" && parsed.token ? parsed : null;
  } catch {
    return null;
  }
}

export default function CustomerPwaPage() {
  const [session, setSession] = useState<CustomerSession | null | undefined>(undefined);
  const [mode, setMode] = useState<CustomerAuthMode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [registration, setRegistration] = useState(EMPTY_REGISTRATION);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [registrationStatus, setRegistrationStatus] = useState<RegistrationStatus | null>(null);

  useEffect(() => {
    setSession(readCustomerSession());
    try {
      const raw = localStorage.getItem("excluvas.portal.registration");
      if (raw) setRegistrationStatus(JSON.parse(raw) as RegistrationStatus);
    } catch {}
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
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/cliente/sw.js", { scope: "/cliente/" }).catch(() => undefined);
  }, []);

  function updateRegistration(field: keyof typeof EMPTY_REGISTRATION, value: string) {
    setRegistration((current) => ({ ...current, [field]: value }));
  }

  function switchMode(nextMode: CustomerAuthMode) {
    setMode(nextMode);
    setError("");
    setMessage("");
  }

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/public_login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "cliente", email, password }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.portal) {
        if (body.code === "ACCOUNT_PENDING" || body.code === "ACCOUNT_REJECTED") {
          const nextStatus = { id: Number(body.registration_id || 0), email, status: body.status || (body.code === "ACCOUNT_PENDING" ? "Pendiente de validar" : "Rechazada"), message: body.error } as RegistrationStatus;
          localStorage.setItem("excluvas.portal.registration", JSON.stringify(nextStatus));
          setRegistrationStatus(nextStatus);
          setMessage(body.error || "Tu cuenta todavía no está activa.");
        }
        throw new Error(body.error || "No se ha podido iniciar sesión.");
      }
      localStorage.setItem("excluvas.portal.session", JSON.stringify(body.portal));
      localStorage.removeItem("excluvas.portal.registration");
      setRegistrationStatus(null);
      setSession(body.portal);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se ha podido iniciar sesión.");
    } finally {
      setBusy(false);
    }
  }

  async function submitRegistration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    if (registration.password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      setBusy(false);
      return;
    }
    if (registration.password !== registration.passwordConfirm) {
      setError("Las contraseñas no coinciden.");
      setBusy(false);
      return;
    }
    try {
      const { passwordConfirm: _passwordConfirm, ...payload } = registration;
      const response = await fetch("/api/web_registrations", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Actor": "PWA clientes" },
        body: JSON.stringify({ ...payload, kind: "cliente" }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || "No se ha podido enviar el registro.");
      const nextStatus: RegistrationStatus = { id: Number(body.id), email: registration.email.trim(), status: body.status || "Pendiente de validar", message: "El equipo comercial revisará tus datos y activará tu acceso." };
      localStorage.setItem("excluvas.portal.registration", JSON.stringify(nextStatus));
      setRegistrationStatus(nextStatus);
      setMessage("");
      setRegistration(EMPTY_REGISTRATION);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se ha podido enviar el registro.");
    } finally {
      setBusy(false);
    }
  }

  async function installApp() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  }

  if (session === undefined) {
    return <main className="customer-pwa-loading"><span className="pwa-entry-mark">E</span><span>Comprobando tu sesión…</span></main>;
  }

  if (session) {
    return <ClientOrderPortal standalone portalLoginHref="/cliente" onClose={() => window.location.href = "/cliente"} onCreated={() => {}} />;
  }

  return (
    <main className="customer-pwa-page">
      <section className="customer-pwa-shell" aria-labelledby="customer-pwa-title">
        <header className="customer-pwa-header">
          <div className="customer-pwa-brand"><span className="pwa-entry-mark" aria-hidden="true">E</span><div><strong>Exclusivas</strong><span>Área de cliente</span></div></div>
          <span className="customer-pwa-version">v{APP_VERSION}</span>
        </header>
        <div className="customer-pwa-card">
          <div className="customer-pwa-intro"><span className="pwa-entry-kicker">PEDIDOS Y ENTREGAS</span><h1 id="customer-pwa-title">Todos tus pedidos online</h1><p>Consulta tus pedidos, fechas de entrega, facturas y seguimiento desde un único sitio.</p></div>
          <div className="customer-pwa-tabs" role="tablist" aria-label="Acceso de cliente">
            <button type="button" className={mode === "login" ? "active" : ""} onClick={() => switchMode("login")}>Iniciar sesión</button>
            <button type="button" className={mode === "register" ? "active" : ""} onClick={() => switchMode("register")}>Registrarme</button>
          </div>
          {mode === "login" ? (
            <form className="customer-pwa-form" onSubmit={submitLogin}>
              <label>Email<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="tu@email.com" /></label>
              <label>Contraseña<input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
              {error && <small className="customer-pwa-error" role="alert">{error}</small>}
              <button className="customer-pwa-primary" disabled={busy}>{busy ? "Comprobando…" : "Entrar en mi área"}</button>
              <p className="customer-pwa-help">Si todavía no tienes una cuenta, regístrate y el equipo comercial validará tus datos.</p>
            </form>
          ) : (
            <form className="customer-pwa-form customer-pwa-register-form" onSubmit={submitRegistration}>
              <div className="customer-pwa-form-grid">
                <label>Razón social / empresa *<input required value={registration.company_name} onChange={(event) => updateRegistration("company_name", event.target.value)} /></label>
                <label>Nombre comercial *<input required value={registration.commercial_name} onChange={(event) => updateRegistration("commercial_name", event.target.value)} placeholder="Cómo te conocen tus clientes" /></label>
                <label>NIF/CIF<input value={registration.tax_id} onChange={(event) => updateRegistration("tax_id", event.target.value)} /></label>
                <label>Persona de contacto *<input required value={registration.contact_name} onChange={(event) => updateRegistration("contact_name", event.target.value)} /></label>
                <label>Email *<input type="email" required value={registration.email} onChange={(event) => updateRegistration("email", event.target.value)} /></label>
                <label>Teléfono<input value={registration.phone} onChange={(event) => updateRegistration("phone", event.target.value)} /></label>
                <label>Ciudad fiscal<input value={registration.city} onChange={(event) => updateRegistration("city", event.target.value)} /></label>
                <label className="wide">Domicilio fiscal<input value={registration.address} onChange={(event) => updateRegistration("address", event.target.value)} /></label>
                <label className="wide">Dirección principal de entrega *<input required value={registration.delivery_address} onChange={(event) => updateRegistration("delivery_address", event.target.value)} placeholder="La dirección donde recibes los pedidos" /></label>
                <label>Ciudad de entrega *<input required value={registration.delivery_city} onChange={(event) => updateRegistration("delivery_city", event.target.value)} /></label>
                <label>Contraseña *<input type="password" minLength={8} required value={registration.password} onChange={(event) => updateRegistration("password", event.target.value)} /></label>
                <label>Repite la contraseña *<input type="password" minLength={8} required value={registration.passwordConfirm} onChange={(event) => updateRegistration("passwordConfirm", event.target.value)} /></label>
                <label className="wide">¿Qué necesitas?<textarea rows={3} value={registration.message} onChange={(event) => updateRegistration("message", event.target.value)} /></label>
              </div>
              {error && <small className="customer-pwa-error" role="alert">{error}</small>}
              {message && <small className="customer-pwa-success" role="status">{message}</small>}
              <button className="customer-pwa-primary" disabled={busy}>{busy ? "Enviando…" : "Solicitar registro"}</button>
            </form>
          )}
          {registrationStatus && <section className={`customer-pwa-account-status ${registrationStatus.status === "Validada" ? "is-approved" : registrationStatus.status === "Rechazada" ? "is-rejected" : "is-pending"}`} aria-live="polite">
            <div className="customer-pwa-account-status-icon">{registrationStatus.status === "Validada" ? "✓" : registrationStatus.status === "Rechazada" ? "!" : "…"}</div>
            <div><strong>{registrationStatus.status === "Validada" ? "Cuenta validada" : registrationStatus.status === "Rechazada" ? "Solicitud no aprobada" : "Perfil pendiente de validación"}</strong><p>{registrationStatus.message || (registrationStatus.status === "Pendiente de validar" ? "El equipo comercial revisará tus datos antes de activar los pedidos." : "")}</p><small>{registrationStatus.email}</small></div>
            {registrationStatus.status === "Pendiente de validar" && <button type="button" onClick={() => { setEmail(registrationStatus.email); setMode("login"); setMessage("Cuando el CRM valide tu ficha podrás entrar desde aquí."); }}>Comprobar acceso</button>}
          </section>}
        </div>
        <footer className="customer-pwa-footer">
          {installPrompt && !installed ? <button type="button" className="customer-pwa-install" onClick={installApp}>＋ Instalar app de cliente</button> : <span>Conexión segura con el CRM</span>}
          <a href="/web">Volver a la web</a>
        </footer>
      </section>
    </main>
  );
}
