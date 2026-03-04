import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AuthGate } from "./components/AuthGate";
import { PageLoader } from "./components/LoadingState";
import { Layout } from "./components/Layout";
import { DashboardPage } from "./pages/DashboardPage";
import { ClientsPage } from "./pages/ClientsPage";
import { LoansPage } from "./pages/LoansPage";
import { CollectionPage } from "./pages/CollectionPage";
import { ReportsPage } from "./pages/ReportsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { AuditPage } from "./pages/AuditPage";
import { MovementsPage } from "./pages/MovementsPage";
import { LoginPage } from "./pages/LoginPage";
import { SetupOrganizationPage } from "./pages/SetupOrganizationPage";
import { useAuth } from "./hooks/useAuth";
import { supabase } from "./lib/supabase";
import { registerPush } from "./hooks/usePush";

export function App() {
  const { session, loading } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      if (!session?.user) {
        if (!cancelled) {
          setProfile(null);
          setProfileLoading(false);
        }
        return;
      }

      setProfileLoading(true);
      const { data: profileRow } = await supabase.from("profiles").select("*").eq("user_id", session.user.id).maybeSingle();

      if (cancelled) return;

      setProfile(profileRow ?? null);
      setProfileLoading(false);

      if (profileRow) {
        const pushKey = `gp_push_registered_${profileRow.user_id}`;
        if (sessionStorage.getItem(pushKey) !== "1") {
          try {
            await registerPush({ organization_id: profileRow.organization_id, user_id: profileRow.user_id });
            sessionStorage.setItem(pushKey, "1");
          } catch {
            sessionStorage.removeItem(pushKey);
          }
        }
      }
    }

    void loadProfile();

    return () => {
      cancelled = true;
    };
  }, [session]);

  const isReady = !loading && !profileLoading;
  const needsSetup = Boolean(session?.user && !profile);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/primer-setup"
        element={
          <AuthGate>
            {!isReady ? (
              <div className="centered"><PageLoader label="Preparando acceso..." /></div>
            ) : needsSetup ? (
              <SetupOrganizationPage
                userId={session!.user.id}
                userEmail={session!.user.email ?? ""}
                onCompleted={(nextProfile) => setProfile(nextProfile)}
              />
            ) : (
              <Navigate to="/" replace />
            )}
          </AuthGate>
        }
      />
      <Route
        path="/"
        element={
          <AuthGate>
            {!isReady ? (
              <div className="centered"><PageLoader label="Cargando perfil..." /></div>
            ) : needsSetup ? (
              <Navigate to="/primer-setup" replace />
            ) : (
              <Layout />
            )}
          </AuthGate>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="clientes" element={<ClientsPage />} />
        <Route path="prestamos" element={<LoansPage />} />
        <Route path="cobranza" element={<CollectionPage />} />
        <Route path="reportes" element={<ReportsPage />} />
        <Route path="movimientos" element={<MovementsPage />} />
        <Route path="configuracion" element={<SettingsPage />} />
        <Route path="auditoria" element={<AuditPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
