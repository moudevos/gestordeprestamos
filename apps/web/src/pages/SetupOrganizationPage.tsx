import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { Building2, Copy, UserRound } from "lucide-react";
import { showErrorAlert, showSuccessAlert } from "../lib/alerts";
import { supabase } from "../lib/supabase";

type SetupOrganizationPageProps = {
  userId: string;
  userEmail: string;
  onCompleted: (profile: { user_id: string; organization_id: string; role: string; full_name: string | null; phone: string | null }) => void;
};

export function SetupOrganizationPage({ userId, userEmail, onCompleted }: SetupOrganizationPageProps) {
  const [companyName, setCompanyName] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [currencyCode, setCurrencyCode] = useState("PEN");
  const [timezone, setTimezone] = useState("America/Lima");
  const [accentColor, setAccentColor] = useState("#2f6fed");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [manualSql, setManualSql] = useState("");

  const fallbackSql = useMemo(() => {
    const safeCompany = companyName.trim().replaceAll("'", "''");
    const safeFullName = fullName.trim().replaceAll("'", "''");
    const safePhone = phone.trim().replaceAll("'", "''");
    const safeTimezone = timezone.trim().replaceAll("'", "''");
    const safeCurrency = currencyCode.trim().replaceAll("'", "''");
    const safeAccent = accentColor.trim().replaceAll("'", "''");

    return [
      "with new_org as (",
      "  insert into public.organizations (name, currency_code, timezone, accent_color)",
      `  values ('${safeCompany}', '${safeCurrency}', '${safeTimezone}', '${safeAccent}')`,
      "  returning id",
      ")",
      "insert into public.profiles (user_id, organization_id, role, full_name, phone)",
      "select",
      `  '${userId}'::uuid,`,
      "  new_org.id,",
      "  'admin',",
      `  '${safeFullName || userEmail.replaceAll("'", "''")}',`,
      `  ${safePhone ? `'${safePhone}'` : "null"}`,
      "from new_org;",
      "",
      "insert into public.loan_policies (",
      "  organization_id, scope, policy_name, interest_mode, interest_flat_pct, interest_flat_amount,",
      "  commission_amount, daily_overdue_pct, overdue_base, overdue_start_rule, overdue_cap_type,",
      "  overdue_cap_value, payment_waterfall, allow_partial_payments, allow_refinance_after_interest_paid",
      ")",
      "select",
      "  organization_id,",
      "  'organization_default',",
      "  'Politica general',",
      "  'flat_pct',",
      "  20,",
      "  0,",
      "  0,",
      "  2,",
      "  'saldo_vencido_total',",
      "  'next_day',",
      "  'amount',",
      "  0,",
      "  'penalty_interest_capital',",
      "  true,",
      "  true",
      "from public.profiles",
      `where user_id = '${userId}'::uuid;`
    ].join("\n");
  }, [accentColor, companyName, currencyCode, fullName, phone, timezone, userEmail, userId]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    setManualSql("");

    const { data: organization, error: organizationError } = await supabase
      .from("organizations")
      .insert({
        name: companyName.trim(),
        currency_code: currencyCode,
        timezone,
        accent_color: accentColor
      })
      .select("id, name, currency_code, timezone, accent_color")
      .single();

    if (organizationError || !organization) {
      const sql = fallbackSql;
      setManualSql(sql);
      await showErrorAlert("No se pudo crear la empresa", organizationError?.message ?? "Tu base aun no permite este alta desde frontend.");
      setIsSubmitting(false);
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .insert({
        user_id: userId,
        organization_id: organization.id,
        role: "admin",
        full_name: fullName.trim() || userEmail,
        phone: phone.trim() || null
      })
      .select("*")
      .single();

    if (profileError || !profile) {
      const sql = fallbackSql;
      setManualSql(sql);
      await showErrorAlert("Empresa creada, perfil pendiente", profileError?.message ?? "Crea el perfil manualmente desde Supabase.");
      setIsSubmitting(false);
      return;
    }

    const { error: policyError } = await supabase.from("loan_policies").insert({
      organization_id: organization.id,
      scope: "organization_default",
      policy_name: "Politica general",
      interest_mode: "flat_pct",
      interest_flat_pct: 20,
      interest_flat_amount: 0,
      commission_amount: 0,
      daily_overdue_pct: 2,
      overdue_base: "saldo_vencido_total",
      overdue_start_rule: "next_day",
      overdue_cap_type: "amount",
      overdue_cap_value: 0,
      payment_waterfall: "penalty_interest_capital",
      allow_partial_payments: true,
      allow_refinance_after_interest_paid: true
    });

    if (policyError) {
      await showErrorAlert("Perfil creado, politica pendiente", policyError.message);
      setManualSql(fallbackSql);
      setIsSubmitting(false);
      onCompleted(profile);
      return;
    }

    await showSuccessAlert("Empresa lista", "La configuracion inicial ya esta creada.");
    setIsSubmitting(false);
    onCompleted(profile);
  }

  async function copySql() {
    if (!manualSql) return;
    await navigator.clipboard.writeText(manualSql);
    await showSuccessAlert("SQL copiado", "Pegalo en el SQL Editor de Supabase.");
  }

  return (
    <div className="login-shell">
      <form className="panel login-card" onSubmit={submit}>
        <div className="login-header">
          <span className="login-step">
            <Building2 size={14} strokeWidth={2.3} />
            Configuracion inicial
          </span>
          <h2 className="login-title">Crea tu empresa</h2>
          <p className="login-copy">Asocia este usuario a su empresa y deja una politica base lista para operar.</p>
        </div>

        <div className="stack">
          <label className="input-group">
            <span className="input-label">Correo del usuario</span>
            <div className="input-with-icon">
              <UserRound size={18} className="input-icon" strokeWidth={2} />
              <input value={userEmail} disabled />
            </div>
          </label>

          <label className="input-group">
            <span className="input-label">Nombre de la empresa</span>
            <input value={companyName} onChange={(event) => setCompanyName(event.target.value)} placeholder="Prestamos San Martin" required autoFocus />
          </label>

          <div className="inline-fields">
            <label className="input-group">
              <span className="input-label">Moneda</span>
              <select value={currencyCode} onChange={(event) => setCurrencyCode(event.target.value)}>
                <option value="PEN">Soles (PEN)</option>
                <option value="USD">Dolares (USD)</option>
              </select>
            </label>
            <label className="input-group">
              <span className="input-label">Zona horaria</span>
              <select value={timezone} onChange={(event) => setTimezone(event.target.value)}>
                <option value="America/Lima">America/Lima</option>
                <option value="America/Bogota">America/Bogota</option>
                <option value="America/Mexico_City">America/Mexico_City</option>
              </select>
            </label>
          </div>

          <div className="inline-fields">
            <label className="input-group">
              <span className="input-label">Nombre del responsable</span>
              <input value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Nombre del propietario" />
            </label>
            <label className="input-group">
              <span className="input-label">Telefono</span>
              <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="999888777" />
            </label>
          </div>

          <label className="input-group">
            <span className="input-label">Color acento</span>
            <input type="color" value={accentColor} onChange={(event) => setAccentColor(event.target.value)} className="color-input" />
          </label>
        </div>

        <button type="submit" className="btn-primary w-full" disabled={isSubmitting}>
          {isSubmitting ? "Creando empresa..." : "Crear empresa"}
        </button>

        {manualSql && (
          <div className="panel tone-slate">
            <div className="quick-summary-header">
              <div>
                <h3 className="section-title">Alta manual</h3>
                <p className="helper-text">Si tu RLS aun bloquea esta accion, ejecuta este SQL en Supabase.</p>
              </div>
              <button type="button" className="ghost-button" onClick={copySql}>
                <Copy size={16} strokeWidth={2} />
                <span>Copiar SQL</span>
              </button>
            </div>
            <pre className="code-block">{manualSql}</pre>
          </div>
        )}
      </form>
    </div>
  );
}
