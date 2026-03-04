import type { ReactElement } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export function AuthGate({ children }: { children: ReactElement }) {
  const { loading, session } = useAuth();
  if (loading) return <div className="centered"><div className="panel w-full max-w-md">Cargando sesion...</div></div>;
  if (!session) return <Navigate to="/login" replace />;
  return children;
}
