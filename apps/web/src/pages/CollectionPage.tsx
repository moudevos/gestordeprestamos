import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { AlertCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { TableSkeleton } from "../components/LoadingState";
import { showErrorAlert, showSuccessAlert, showWarningAlert } from "../lib/alerts";
import { supabase } from "../lib/supabase";

export function CollectionPage() {
  const [loans, setLoans] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [organizationId, setOrganizationId] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [form, setForm] = useState({
    loan_id: "",
    amount: "0",
    paid_at: new Date().toISOString().slice(0, 10),
    method: "cash",
    reference: ""
  });

  const selectedLoan = loans.find((loan) => loan.id === form.loan_id);
  const paidAmount = selectedLoan
    ? Math.max(0, Number(selectedLoan.total_amount ?? 0) - Number(selectedLoan.loan_balances?.total_outstanding ?? selectedLoan.total_amount ?? 0))
    : 0;
  const pendingAmount = selectedLoan ? Number(selectedLoan.loan_balances?.total_outstanding ?? 0) : 0;
  const penaltyAmount = selectedLoan ? Number(selectedLoan.loan_balances?.penalty_outstanding ?? 0) : 0;
  const paymentCount = selectedLoan ? payments.filter((payment) => payment.loan_id === selectedLoan.id).length : 0;
  const trustLabel = !selectedLoan
    ? "-"
    : penaltyAmount > 0
      ? "Baja"
      : paymentCount >= 3 || paidAmount >= Number(selectedLoan.total_amount ?? 0) * 0.5
        ? "Alta"
        : paymentCount >= 1
          ? "Media"
          : "Inicial";

  async function load() {
    setLoading(true);
    const [{ data: loanRows }, { data: paymentRows }, { data: profile }] = await Promise.all([
      supabase.from("loans").select("id, principal_amount, total_amount, status, clients(first_name,last_name), loan_balances(total_outstanding,penalty_outstanding)").in("status", ["active", "overdue"]),
      supabase.from("payments").select("*, loans(clients(first_name,last_name))").order("created_at", { ascending: false }).limit(100),
      supabase.from("profiles").select("organization_id").single()
    ]);
    setLoans(loanRows ?? []);
    setPayments(paymentRows ?? []);
    setOrganizationId(profile?.organization_id ?? "");
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setErrorMessage("");
    if (!organizationId) {
      const text = "No se encontro la organizacion del usuario. Revisa el perfil.";
      setErrorMessage(text);
      await showErrorAlert("Perfil incompleto", text);
      return;
    }
    if (!form.loan_id) {
      const text = "Selecciona un prestamo antes de registrar el pago.";
      setErrorMessage(text);
      await showWarningAlert("Falta seleccionar", text);
      return;
    }
    if (Number(form.amount) <= 0) {
      const text = "El monto debe ser mayor a cero.";
      setErrorMessage(text);
      await showWarningAlert("Monto invalido", text);
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.rpc("post_payment", {
      params: {
        organization_id: organizationId,
        loan_id: form.loan_id,
        amount: Number(form.amount),
        paid_at: form.paid_at,
        method: form.method,
        reference: form.reference
      }
    });
    if (error) {
      const text = error.message || "No se pudo registrar el pago.";
      setErrorMessage(text);
      await showErrorAlert("Pago no registrado", text);
      setSubmitting(false);
      return;
    }
    await load();
    await showSuccessAlert("Pago registrado", "El pago se guardo correctamente.");
    setSubmitting(false);
  }

  return (
    <div className="stack">
      <h1>Cobranza</h1>
      <form className="panel form-grid" onSubmit={submit}>
        <label className="input-group">
          <span className="input-label">Prestamo</span>
          <select value={form.loan_id} onChange={(e) => setForm({ ...form, loan_id: e.target.value })}>
            <option value="">Selecciona prestamo</option>
            {loans.map((loan) => <option key={loan.id} value={loan.id}>{loan.clients?.first_name} {loan.clients?.last_name} - S/ {loan.principal_amount}</option>)}
          </select>
        </label>
        <label className="input-group">
          <span className="input-label">Monto pagado (S/)</span>
          <input value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0" inputMode="decimal" />
        </label>
        <label className="input-group">
          <span className="input-label">Fecha del pago</span>
          <input type="date" value={form.paid_at} onChange={(e) => setForm({ ...form, paid_at: e.target.value })} />
        </label>
        <label className="input-group">
          <span className="input-label">Metodo</span>
          <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
            <option value="cash">Efectivo</option>
            <option value="transfer">Transferencia</option>
            <option value="deposit">Deposito</option>
          </select>
        </label>
        <label className="input-group">
          <span className="input-label">Referencia</span>
          <input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="Operacion, voucher, nota" />
        </label>
        <button type="submit" disabled={submitting}>{submitting ? "Registrando..." : "Registrar pago"}</button>
      </form>
      {selectedLoan && (
        <div className="panel stack">
          <div className="quick-summary-header">
            <h2 className="section-title">Resumen rapido del prestamo</h2>
            <Link className="link-button" to="/prestamos">Ver prestamo</Link>
          </div>
          <div className="quick-badges">
            <span className="data-chip">Cliente: {selectedLoan.clients?.first_name} {selectedLoan.clients?.last_name}</span>
            <span className="data-chip">Estado: {selectedLoan.status}</span>
            <span className="data-chip">Pagado: S/ {paidAmount.toFixed(2)}</span>
            <span className="data-chip">Pendiente: S/ {pendingAmount.toFixed(2)}</span>
            <span className="data-chip">Mora: S/ {penaltyAmount.toFixed(2)}</span>
            <span className="data-chip">Pagos registrados: {paymentCount}</span>
            <span className="data-chip">Confianza: {trustLabel}</span>
          </div>
          <span className="helper-text">
            La confianza sube cuando paga sin mora y acumula pagos registrados. Es una referencia rapida, no una regla automatica final.
          </span>
        </div>
      )}
      {errorMessage && (
        <div className="panel error-banner">
          <AlertCircle size={18} strokeWidth={2} />
          <span>{errorMessage}</span>
        </div>
      )}
      {loading ? (
        <TableSkeleton rows={5} columns={4} />
      ) : (
        <div className="panel">
          <div className="table-container">
            <table className="table">
              <thead><tr><th>Fecha</th><th>Cliente</th><th>Monto</th><th>Metodo</th></tr></thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id}>
                    <td>{payment.paid_at}</td>
                    <td>{payment.loans?.clients?.first_name} {payment.loans?.clients?.last_name}</td>
                    <td>{payment.amount}</td>
                    <td>{payment.method}</td>
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
