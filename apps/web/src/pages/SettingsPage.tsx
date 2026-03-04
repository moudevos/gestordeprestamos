import { Building2, Landmark, Palette, UserRound, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { TableSkeleton } from "../components/LoadingState";
import { showErrorAlert, showSuccessAlert } from "../lib/alerts";
import { supabase } from "../lib/supabase";

export function SettingsPage() {
  const [policy, setPolicy] = useState<any>(null);
  const [plans, setPlans] = useState<any[]>([]);
  const [organization, setOrganization] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [organizationId, setOrganizationId] = useState("");
  const [capitalSummary, setCapitalSummary] = useState<any>(null);
  const [capitalForm, setCapitalForm] = useState({
    initial_funding: "",
    profit_withdrawal: ""
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingBusiness, setSavingBusiness] = useState(false);

  async function load() {
    setLoading(true);
    const [{ data: policyRow }, { data: planRows }, { data: profileRow }] = await Promise.all([
      supabase.from("loan_policies").select("*").eq("scope", "organization_default").limit(1).maybeSingle(),
      supabase.from("interest_plans").select("*").order("created_at", { ascending: false }),
      supabase.from("profiles").select("user_id, organization_id, role, full_name, phone").single()
    ]);
    const organizationRow = profileRow?.organization_id
      ? await supabase.from("organizations").select("id, name, currency_code, timezone, accent_color").eq("id", profileRow.organization_id).maybeSingle()
      : { data: null };
    const capitalRow = profileRow?.organization_id
      ? await supabase.rpc("get_capital_summary", { p_organization_id: profileRow.organization_id })
      : { data: null };

    setPolicy(policyRow);
    setPlans(planRows ?? []);
    setProfile(profileRow ?? null);
    setOrganization(organizationRow.data ?? null);
    setOrganizationId(profileRow?.organization_id ?? "");
    setCapitalSummary(capitalRow.data?.[0] ?? capitalRow.data ?? null);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function savePolicy() {
    if (!policy) return;
    setSaving(true);
    const policyResult = await supabase.from("loan_policies").update(policy).eq("id", policy.id);
    const error = policyResult.error;
    if (error) {
      await showErrorAlert("No se pudo guardar", error.message);
      setSaving(false);
      return;
    }
    await load();
    await showSuccessAlert("Configuracion guardada", "Los cambios fueron aplicados.");
    setSaving(false);
  }

  async function saveBusinessProfile() {
    if (!organization || !profile) return;

    setSavingBusiness(true);

    const [organizationResult, profileResult] = await Promise.all([
      supabase
        .from("organizations")
        .update({
          name: organization.name,
          currency_code: organization.currency_code,
          timezone: organization.timezone,
          accent_color: organization.accent_color
        })
        .eq("id", organization.id),
      supabase
        .from("profiles")
        .update({
          full_name: profile.full_name,
          phone: profile.phone
        })
        .eq("user_id", profile.user_id)
    ]);

    const error = organizationResult.error ?? profileResult.error;

    if (error) {
      await showErrorAlert("No se pudo guardar", error.message);
      setSavingBusiness(false);
      return;
    }

    await load();
    await showSuccessAlert("Perfil actualizado", "Los datos de tu empresa fueron guardados.");
    setSavingBusiness(false);
  }

  async function registerCapitalMovement(movementType: "initial_funding" | "profit_withdrawal") {
    if (!organizationId) {
      await showErrorAlert("Perfil incompleto", "No se encontro la organizacion del usuario.");
      return;
    }

    const rawAmount = movementType === "initial_funding" ? capitalForm.initial_funding : capitalForm.profit_withdrawal;
    const amount = Number(rawAmount);
    if (amount <= 0) {
      await showErrorAlert("Monto invalido", "Ingresa un monto mayor a cero.");
      return;
    }

    const { error } = await supabase.rpc("record_capital_movement", {
      params: {
        organization_id: organizationId,
        movement_type: movementType,
        direction: movementType === "profit_withdrawal" ? "out" : "in",
        amount,
        note: movementType === "profit_withdrawal" ? "Retiro de ganancia" : "Capital registrado manualmente"
      }
    });

    if (error) {
      await showErrorAlert("No se pudo registrar", error.message);
      return;
    }

    setCapitalForm((current) => ({
      ...current,
      [movementType]: ""
    }));
    await load();
    await showSuccessAlert("Movimiento registrado", "El capital fue actualizado.");
  }

  return (
    <div className="stack">
      <h1>Configuracion</h1>
      {loading ? (
        <TableSkeleton rows={2} columns={3} />
      ) : (
        <>
          {organization && profile && (
            <div className="panel stack">
              <div className="quick-summary-header">
                <div>
                  <h2 className="section-title">Perfil de empresa</h2>
                  <p className="helper-text">Edita el nombre de la empresa y los datos del responsable desde aqui.</p>
                </div>
              </div>
              <div className="form-grid">
                <label className="input-group">
                  <span className="input-label">Nombre de la empresa</span>
                  <div className="input-with-icon">
                    <Building2 size={18} className="input-icon" strokeWidth={2} />
                    <input value={organization.name ?? ""} onChange={(e) => setOrganization({ ...organization, name: e.target.value })} placeholder="Prestamos San Martin" />
                  </div>
                </label>
                <label className="input-group">
                  <span className="input-label">Responsable</span>
                  <div className="input-with-icon">
                    <UserRound size={18} className="input-icon" strokeWidth={2} />
                    <input value={profile.full_name ?? ""} onChange={(e) => setProfile({ ...profile, full_name: e.target.value })} placeholder="Nombre del responsable" />
                  </div>
                </label>
                <div className="inline-fields">
                  <label className="input-group">
                    <span className="input-label">Moneda</span>
                    <select value={organization.currency_code ?? "PEN"} onChange={(e) => setOrganization({ ...organization, currency_code: e.target.value })}>
                      <option value="PEN">Soles (PEN)</option>
                      <option value="USD">Dolares (USD)</option>
                    </select>
                  </label>
                  <label className="input-group">
                    <span className="input-label">Zona horaria</span>
                    <select value={organization.timezone ?? "America/Lima"} onChange={(e) => setOrganization({ ...organization, timezone: e.target.value })}>
                      <option value="America/Lima">America/Lima</option>
                      <option value="America/Bogota">America/Bogota</option>
                      <option value="America/Mexico_City">America/Mexico_City</option>
                    </select>
                  </label>
                </div>
                <label className="input-group">
                  <span className="input-label">Telefono</span>
                  <input value={profile.phone ?? ""} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} placeholder="999888777" />
                </label>
                <label className="input-group">
                  <span className="input-label">Color acento</span>
                  <div className="input-with-icon">
                    <Palette size={18} className="input-icon" strokeWidth={2} />
                    <input type="color" value={organization.accent_color ?? "#2f6fed"} onChange={(e) => setOrganization({ ...organization, accent_color: e.target.value })} className="color-input" />
                  </div>
                </label>
              </div>
              <div>
                <button type="button" className="btn-primary" onClick={saveBusinessProfile} disabled={savingBusiness}>
                  {savingBusiness ? "Guardando perfil..." : "Guardar perfil de empresa"}
                </button>
              </div>
            </div>
          )}

          <div className="panel stack">
            <div className="quick-summary-header">
              <div>
                <h2 className="section-title">Capital y caja</h2>
                <p className="helper-text">Registra entradas de capital y retiros de ganancia para cuadrar tu caja.</p>
              </div>
            </div>
            <div className="form-grid">
              <label className="input-group">
                <span className="input-label">Capital de trabajo inicial (S/)</span>
                <div className="input-with-icon">
                  <Landmark size={18} className="input-icon" strokeWidth={2} />
                  <input value={capitalForm.initial_funding} onChange={(e) => setCapitalForm({ ...capitalForm, initial_funding: e.target.value })} placeholder="10000" />
                </div>
                <button type="button" className="ghost-button" onClick={() => registerCapitalMovement("initial_funding")}>Registrar capital</button>
              </label>
              <label className="input-group">
                <span className="input-label">Retiro de ganancia (S/)</span>
                <div className="input-with-icon">
                  <Wallet size={18} className="input-icon" strokeWidth={2} />
                  <input value={capitalForm.profit_withdrawal} onChange={(e) => setCapitalForm({ ...capitalForm, profit_withdrawal: e.target.value })} placeholder="200" />
                </div>
                <button type="button" className="ghost-button" onClick={() => registerCapitalMovement("profit_withdrawal")}>Retirar ganancia</button>
                <span className="helper-text">Usa este retiro para cuadrar caja cuando saques utilidad.</span>
              </label>
            </div>
          </div>

          {policy && (
            <div className="panel stack">
              <div className="quick-summary-header">
                <div>
                  <h2 className="section-title">Politica general</h2>
                  <p className="helper-text">Define mora y orden de aplicacion para todos los prestamos por defecto.</p>
                </div>
              </div>
              <div className="form-grid">
                <label className="input-group">
                  <span className="input-label">Mora diaria (%)</span>
                  <input value={policy.daily_overdue_pct ?? ""} onChange={(e) => setPolicy({ ...policy, daily_overdue_pct: e.target.value })} />
                </label>
                <label className="input-group">
                  <span className="input-label">Inicio de mora</span>
                  <select value={policy.overdue_start_rule ?? "next_day"} onChange={(e) => setPolicy({ ...policy, overdue_start_rule: e.target.value })}>
                    <option value="same_day">Mismo dia</option>
                    <option value="next_day">Dia siguiente</option>
                  </select>
                </label>
                <label className="input-group">
                  <span className="input-label">Orden de aplicacion</span>
                  <select value={policy.payment_waterfall ?? "penalty_interest_capital"} onChange={(e) => setPolicy({ ...policy, payment_waterfall: e.target.value })}>
                    <option value="penalty_interest_capital">Mora &gt; interes &gt; capital</option>
                    <option value="penalty_capital_interest">Mora &gt; capital &gt; interes</option>
                  </select>
                </label>
              </div>
              <div>
                <button type="button" className="btn-primary" onClick={savePolicy} disabled={saving}>
                  {saving ? "Guardando..." : "Guardar politica"}
                </button>
              </div>
            </div>
          )}
        </>
      )}
      {!loading && capitalSummary && (
        <div className="panel quick-badges">
          <span className="data-chip">Disponible: S/ {Number(capitalSummary.available_cash ?? 0).toFixed(2)}</span>
          <span className="data-chip">Entradas: S/ {Number(capitalSummary.total_in ?? 0).toFixed(2)}</span>
          <span className="data-chip">Salidas: S/ {Number(capitalSummary.total_out ?? 0).toFixed(2)}</span>
          <span className="data-chip">Colocado en prestamos: S/ {Number(capitalSummary.total_disbursed ?? 0).toFixed(2)}</span>
          <span className="data-chip">Ganancia neta retenida: S/ {Number(capitalSummary.net_profit_collected ?? 0).toFixed(2)}</span>
          <span className="data-chip">Ganancia retirada: S/ {Number(capitalSummary.total_profit_withdrawn ?? 0).toFixed(2)}</span>
        </div>
      )}
      {loading ? (
        <TableSkeleton rows={5} columns={4} />
      ) : (
        <div className="panel">
          <h2>Planes</h2>
          <div className="table-container">
            <table className="table">
              <thead><tr><th>Plan</th><th>Plazo</th><th>Cuotas</th><th>Interes</th></tr></thead>
              <tbody>
                {plans.map((plan) => (
                  <tr key={plan.id}>
                    <td>{plan.plan_name}</td>
                    <td>{plan.plazo_dias_min}-{plan.plazo_dias_max}</td>
                    <td>{plan.cuotas_min}-{plan.cuotas_max}</td>
                    <td>{plan.interes_flat_pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
