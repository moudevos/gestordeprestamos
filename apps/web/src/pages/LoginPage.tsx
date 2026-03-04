import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { Eye, EyeOff, KeyRound, LogIn, Mail, ShieldCheck } from "lucide-react";
import { Navigate } from "react-router-dom";
import { PageLoader } from "../components/LoadingState";
import { useAuth } from "../hooks/useAuth";
import { showErrorAlert, showSuccessAlert } from "../lib/alerts";
import { supabase } from "../lib/supabase";

type MessageTone = "neutral" | "success" | "error";

export function LoginPage() {
  const { session, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<MessageTone>("neutral");
  const [showPassword, setShowPassword] = useState(false);
  const [keepSession, setKeepSession] = useState(() => localStorage.getItem("gp_keep_session") !== "0");
  const [isRecoveryRequest, setIsRecoveryRequest] = useState(false);
  const [isRecoveryUpdate, setIsRecoveryUpdate] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (window.location.hash.toLowerCase().includes("type=recovery")) {
      setIsRecoveryUpdate(true);
      setMessage("Define una nueva contrasena para recuperar tu acceso.");
      setMessageTone("neutral");
    }
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    localStorage.setItem("gp_keep_session", keepSession ? "1" : "0");

    if (isRecoveryUpdate) {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      setMessage(error ? error.message : "Contrasena actualizada. Ya puedes iniciar sesion.");
      setMessageTone(error ? "error" : "success");
      if (error) {
        await showErrorAlert("No se pudo actualizar", error.message);
      } else {
        await showSuccessAlert("Contrasena actualizada", "Ya puedes iniciar sesion.");
      }
      if (!error) {
        setIsRecoveryUpdate(false);
        setNewPassword("");
        window.history.replaceState({}, document.title, "/login");
      }
      setIsSubmitting(false);
      return;
    }

    if (isRecoveryRequest) {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/login`
      });
      setMessage(error ? error.message : "Te enviamos un correo con el enlace de recuperacion.");
      setMessageTone(error ? "error" : "success");
      if (error) {
        await showErrorAlert("No se pudo enviar", error.message);
      } else {
        await showSuccessAlert("Correo enviado", "Revisa tu bandeja de entrada.");
      }
      setIsSubmitting(false);
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setMessage(error ? error.message : "Sesion iniciada y lista para uso continuo en este dispositivo.");
    setMessageTone(error ? "error" : "success");
    if (error) {
      await showErrorAlert("Acceso denegado", error.message);
    }
    setIsSubmitting(false);
  }

  if (loading) {
    return <div className="centered"><PageLoader label="Validando sesion..." /></div>;
  }

  if (session) {
    return <Navigate to="/" replace />;
  }

  const title = isRecoveryUpdate
    ? "Actualiza tu acceso"
    : isRecoveryRequest
      ? "Recupera tu clave"
      : "Bienvenido de nuevo";

  const subtitle = isRecoveryUpdate
    ? "Usa una clave nueva de al menos 8 caracteres."
    : isRecoveryRequest
      ? "Te enviaremos un enlace seguro al correo registrado."
      : "Entra rapido y mantente conectado para trabajo movil.";

  const statusClass =
    messageTone === "error"
      ? "status-text status-text-error"
      : messageTone === "success"
        ? "status-text status-text-success"
        : "status-text";

  return (
    <div className="login-shell">
      <form className="panel login-card" onSubmit={submit}>
        <div className="login-header">
          <span className="login-step">
            <ShieldCheck size={14} strokeWidth={2.3} />
            {isRecoveryUpdate ? "Paso final" : isRecoveryRequest ? "Recuperacion" : "Acceso seguro"}
          </span>
          <h2 className="login-title">{title}</h2>
          <p className="login-copy">{subtitle}</p>
        </div>

        <div className="stack">
          <label className="input-group">
            <span className="input-label">Correo</span>
            <div className="input-with-icon">
              <Mail size={18} className="input-icon" strokeWidth={2} />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@correo.com"
                autoComplete="email"
                required
                autoFocus
              />
            </div>
          </label>

          <label className="input-group">
            <span className="input-label">{isRecoveryUpdate ? "Nueva contrasena" : "Contrasena"}</span>
            <div className="password-row">
              <div className="input-with-icon">
                <KeyRound size={18} className="input-icon" strokeWidth={2} />
                <input
                  type={showPassword ? "text" : "password"}
                  value={isRecoveryUpdate ? newPassword : password}
                  onChange={(e) => (isRecoveryUpdate ? setNewPassword(e.target.value) : setPassword(e.target.value))}
                  placeholder={isRecoveryUpdate ? "Minimo 8 caracteres" : "Ingresa tu contrasena"}
                  autoComplete={isRecoveryUpdate ? "new-password" : "current-password"}
                  required={!isRecoveryRequest}
                  minLength={isRecoveryUpdate ? 8 : undefined}
                />
              </div>
              <button type="button" className="ghost-button" onClick={() => setShowPassword((value) => !value)}>
                {showPassword ? <EyeOff size={18} strokeWidth={2} /> : <Eye size={18} strokeWidth={2} />}
                <span>{showPassword ? "Ocultar" : "Mostrar"}</span>
              </button>
            </div>
          </label>
        </div>

        {!isRecoveryRequest && !isRecoveryUpdate && (
          <div className="login-meta">
            <label className="check-row">
              <input type="checkbox" checked={keepSession} onChange={(e) => setKeepSession(e.target.checked)} />
              <span>Mantener sesion activa en este dispositivo</span>
            </label>
            <span className="login-hint">Recomendado para cobradores en campo.</span>
          </div>
        )}

        <button type="submit" className="btn-primary w-full" disabled={isSubmitting}>
          {isSubmitting ? <LoaderCircleIcon /> : isRecoveryUpdate ? <KeyRound size={18} strokeWidth={2.2} /> : isRecoveryRequest ? <Mail size={18} strokeWidth={2.2} /> : <LogIn size={18} strokeWidth={2.2} />}
          {isSubmitting
            ? "Procesando..."
            : isRecoveryUpdate
              ? "Actualizar contrasena"
              : isRecoveryRequest
                ? "Enviar enlace"
                : "Entrar"}
        </button>

        {!isRecoveryUpdate && (
          <button
            type="button"
            className="link-button"
            onClick={() => {
              setIsRecoveryRequest((value) => !value);
              setMessage("");
              setMessageTone("neutral");
            }}
          >
            {isRecoveryRequest ? "Volver al inicio de sesion" : "Olvide mi contrasena"}
          </button>
        )}

        {message && <p className={statusClass}>{message}</p>}
      </form>
    </div>
  );
}

function LoaderCircleIcon() {
  return <span className="button-spinner" aria-hidden="true" />;
}
