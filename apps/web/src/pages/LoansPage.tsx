import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { Calculator, Eye, Percent, Trash2, X } from "lucide-react";
import { TableSkeleton } from "../components/LoadingState";
import { showErrorAlert, showSuccessToast } from "../lib/alerts";
import { supabase } from "../lib/supabase";

const initialLoanForm = {
  client_id: "",
  principal_amount: "1000",
  interest_pct: "10",
  commission_amount: "0",
  first_payment_date: new Date().toISOString().slice(0, 10),
  frequency: "weekly",
  installments_count: "4"
};

export function LoansPage() {
  const [clients, setClients] = useState<any[]>([]);
  const [loans, setLoans] = useState<any[]>([]);
  const [selectedLoan, setSelectedLoan] = useState<any | null>(null);
  const [loanToDelete, setLoanToDelete] = useState<any | null>(null);
  const [deleteReason, setDeleteReason] = useState("Prestamo duplicado");
  const [deleteNote, setDeleteNote] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState(initialLoanForm);

  const principal = Number(form.principal_amount) || 0;
  const interestPct = Number(form.interest_pct) || 0;
  const interestAmount = Number(((principal * interestPct) / 100).toFixed(2));
  const commissionAmount = Number(form.commission_amount) || 0;
  const estimatedTotal = principal + interestAmount + commissionAmount;

  async function load() {
    setLoading(true);
    const [{ data: clientRows }, { data: loanRows }, { data: profile }] = await Promise.all([
      supabase.from("clients").select("id, first_name, last_name").is("deleted_at", null),
      supabase.from("loans").select(
        "*, clients(first_name,last_name,phone,score_value), loan_balances(total_outstanding,principal_outstanding,interest_outstanding,penalty_outstanding,interest_collected), installments(id,status,remaining_amount), payments(id,amount,paid_at)"
      ).is("deleted_at", null).order("created_at", { ascending: false }),
      supabase.from("profiles").select("organization_id").single()
    ]);
    setClients(clientRows ?? []);
    setLoans(loanRows ?? []);
    setOrganizationId(profile?.organization_id ?? "");
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await supabase.rpc("create_loan_with_schedule", {
      params: {
        organization_id: organizationId,
        client_id: form.client_id,
        principal_amount: Number(form.principal_amount),
        flat_interest_amount: interestAmount,
        commission_amount: Number(form.commission_amount),
        disbursed_at: new Date().toISOString().slice(0, 10),
        start_date: form.first_payment_date,
        frequency: form.frequency,
        installments_count: Number(form.installments_count)
      }
    });

    if (error) {
      await showErrorAlert("No se pudo crear el prestamo", error.message);
      setSubmitting(false);
      return;
    }

    setForm({
      ...initialLoanForm,
      first_payment_date: new Date().toISOString().slice(0, 10)
    });
    await load();
    await showSuccessToast("Prestamo creado");
    setSubmitting(false);
  }

  async function deleteLoan() {
    if (!loanToDelete) return;
    setDeleting(true);
    const { error } = await supabase.rpc("delete_loan_with_reason", {
      params: {
        organization_id: organizationId,
        loan_id: loanToDelete.id,
        reason: deleteReason,
        note: deleteReason === "Otro" ? deleteNote : deleteNote || null
      }
    });

    if (error) {
      await showErrorAlert("No se pudo eliminar", error.message);
      setDeleting(false);
      return;
    }

    setLoanToDelete(null);
    setSelectedLoan(null);
    setDeleteReason("Prestamo duplicado");
    setDeleteNote("");
    await load();
    await showSuccessToast("Prestamo eliminado");
    setDeleting(false);
  }

  const detailPaid = selectedLoan
    ? Math.max(0, Number(selectedLoan.total_amount ?? 0) - Number(selectedLoan.loan_balances?.total_outstanding ?? selectedLoan.total_amount ?? 0))
    : 0;
  const detailPendingInstallments = selectedLoan
    ? (selectedLoan.installments ?? []).filter((item: any) => item.status !== "paid").length
    : 0;
  const detailPaidInstallments = selectedLoan
    ? (selectedLoan.installments ?? []).filter((item: any) => item.status === "paid").length
    : 0;

  return (
    <div className="stack">
      <h1>Prestamos</h1>
      <form className="panel form-grid" onSubmit={submit}>
        <label className="input-group">
          <span className="input-label">Cliente</span>
          <select value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value })}>
            <option value="">Selecciona cliente</option>
            {clients.map((client) => <option key={client.id} value={client.id}>{client.first_name} {client.last_name}</option>)}
          </select>
        </label>

        <label className="input-group">
          <span className="input-label">Capital (S/)</span>
          <input
            value={form.principal_amount}
            onChange={(e) => setForm({ ...form, principal_amount: e.target.value })}
            placeholder="1000"
            inputMode="decimal"
          />
        </label>

        <label className="input-group">
          <span className="input-label">Interes (%)</span>
          <div className="input-with-icon">
            <Percent size={18} className="input-icon" strokeWidth={2} />
            <input
              value={form.interest_pct}
              onChange={(e) => setForm({ ...form, interest_pct: e.target.value })}
              placeholder="10"
              inputMode="decimal"
            />
          </div>
          <span className="helper-text">Equivale a S/ {interestAmount.toFixed(2)}</span>
        </label>

        <label className="input-group">
          <span className="input-label">Comision (S/)</span>
          <input
            value={form.commission_amount}
            onChange={(e) => setForm({ ...form, commission_amount: e.target.value })}
            placeholder="0"
            inputMode="decimal"
          />
        </label>

        <label className="input-group">
          <span className="input-label">Cantidad de cuotas</span>
          <input
            value={form.installments_count}
            onChange={(e) => setForm({ ...form, installments_count: e.target.value })}
            placeholder="4"
            inputMode="numeric"
          />
        </label>

        <label className="input-group">
          <span className="input-label">Fecha del primer pago</span>
          <input
            type="date"
            value={form.first_payment_date}
            onChange={(e) => setForm({ ...form, first_payment_date: e.target.value })}
          />
          <span className="helper-text">Las siguientes cuotas se calculan desde esta fecha.</span>
        </label>

        <label className="input-group">
          <span className="input-label">Frecuencia de pago</span>
          <select
            value={form.frequency}
            onChange={(e) => setForm({ ...form, frequency: e.target.value })}
            disabled={Number(form.installments_count) <= 1}
          >
            <option value="daily">Diaria</option>
            <option value="weekly">Semanal</option>
            <option value="biweekly">Quincenal</option>
            <option value="monthly">Mensual</option>
          </select>
          <span className="helper-text">
            {Number(form.installments_count) <= 1 ? "Con una sola cuota no se necesita frecuencia." : "Se aplica desde la primera fecha de pago."}
          </span>
        </label>

        <div className="loan-summary">
          <div className="loan-summary-head">
            <Calculator size={18} strokeWidth={2} />
            <span>Resumen rapido</span>
          </div>
          <span>Desembolso: hoy ({new Date().toLocaleDateString()})</span>
          <span>Interes calculado: S/ {interestAmount.toFixed(2)}</span>
          <span>Total estimado: S/ {estimatedTotal.toFixed(2)}</span>
        </div>

        <button type="submit" disabled={submitting}>{submitting ? "Creando..." : "Crear prestamo"}</button>
      </form>
      {loading ? (
        <TableSkeleton rows={6} columns={4} />
      ) : (
        <div className="panel">
          <div className="table-container">
            <table className="table">
              <thead><tr><th>Cliente</th><th>Deuda actual</th><th>Pagado</th><th>Cuotas restantes</th><th>Estado</th><th></th></tr></thead>
              <tbody>
                {loans.map((loan) => (
                  <tr key={loan.id}>
                    <td>{loan.clients?.first_name} {loan.clients?.last_name}</td>
                    <td>S/ {(loan.loan_balances?.total_outstanding ?? loan.total_amount).toFixed?.(2) ?? loan.loan_balances?.total_outstanding ?? loan.total_amount}</td>
                    <td>S/ {Math.max(0, Number(loan.total_amount ?? 0) - Number(loan.loan_balances?.total_outstanding ?? loan.total_amount ?? 0)).toFixed(2)}</td>
                    <td>{(loan.installments ?? []).filter((item: any) => item.status !== "paid").length}</td>
                    <td>{loan.status}</td>
                    <td>
                      <button type="button" className="ghost-button" onClick={() => setSelectedLoan(loan)}>
                        <Eye size={16} strokeWidth={2} />
                        Ver
                      </button>
                      <button type="button" className="ghost-button danger-button" onClick={() => setLoanToDelete(loan)}>
                        <Trash2 size={16} strokeWidth={2} />
                        Eliminar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {selectedLoan && (
        <div className="modal-backdrop" onClick={() => setSelectedLoan(null)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="quick-summary-header">
              <div className="stack gap-1">
                <h2 className="section-title">Detalle del prestamo</h2>
                <span className="helper-text">
                  {selectedLoan.clients?.first_name} {selectedLoan.clients?.last_name} {selectedLoan.clients?.phone ? `· ${selectedLoan.clients.phone}` : ""}
                </span>
              </div>
              <button type="button" className="icon-close-button" onClick={() => setSelectedLoan(null)} aria-label="Cerrar modal">
                <X size={18} strokeWidth={2.4} />
              </button>
            </div>

            <div className="quick-badges">
              <span className="data-chip">Capital: S/ {Number(selectedLoan.principal_amount ?? 0).toFixed(2)}</span>
              <span className="data-chip">Total del prestamo: S/ {Number(selectedLoan.total_amount ?? 0).toFixed(2)}</span>
              <span className="data-chip">Pagado: S/ {detailPaid.toFixed(2)}</span>
              <span className="data-chip">Deuda actual: S/ {Number(selectedLoan.loan_balances?.total_outstanding ?? 0).toFixed(2)}</span>
              <span className="data-chip">Capital pendiente: S/ {Number(selectedLoan.loan_balances?.principal_outstanding ?? 0).toFixed(2)}</span>
              <span className="data-chip">Interes pendiente: S/ {Number(selectedLoan.loan_balances?.interest_outstanding ?? 0).toFixed(2)}</span>
              <span className="data-chip">Mora pendiente: S/ {Number(selectedLoan.loan_balances?.penalty_outstanding ?? 0).toFixed(2)}</span>
              <span className="data-chip">Interes cobrado: S/ {Number(selectedLoan.loan_balances?.interest_collected ?? 0).toFixed(2)}</span>
              <span className="data-chip">Cuotas pagadas: {detailPaidInstallments}</span>
              <span className="data-chip">Cuotas restantes: {detailPendingInstallments}</span>
              <span className="data-chip">Pagos registrados: {(selectedLoan.payments ?? []).length}</span>
              <span className="data-chip">Score cliente: {selectedLoan.clients?.score_value ?? "-"}</span>
              <span className="data-chip">Estado: {selectedLoan.status}</span>
            </div>

            <div className="panel">
              <h3 className="section-title">Historial reciente</h3>
              <div className="table-container">
                <table className="table">
                  <thead><tr><th>Fecha</th><th>Monto</th></tr></thead>
                  <tbody>
                    {(selectedLoan.payments ?? []).slice().sort((a: any, b: any) => String(b.paid_at).localeCompare(String(a.paid_at))).slice(0, 6).map((payment: any) => (
                      <tr key={payment.id}>
                        <td>{payment.paid_at}</td>
                        <td>S/ {Number(payment.amount ?? 0).toFixed(2)}</td>
                      </tr>
                    ))}
                    {(selectedLoan.payments ?? []).length === 0 && (
                      <tr><td colSpan={2}>Sin pagos registrados.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
      {loanToDelete && (
        <div className="modal-backdrop" onClick={() => setLoanToDelete(null)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="quick-summary-header">
              <h2 className="section-title">Eliminar prestamo</h2>
              <button type="button" className="icon-close-button" onClick={() => setLoanToDelete(null)} aria-label="Cerrar modal">
                <X size={18} strokeWidth={2.4} />
              </button>
            </div>
            <div className="stack">
              <p className="helper-text">Al eliminarlo se ocultara del sistema y se revertira su impacto en caja y ganancia.</p>
              <div className="quick-badges">
                <span className="data-chip">{loanToDelete.clients?.first_name} {loanToDelete.clients?.last_name}</span>
                <span className="data-chip">S/ {Number(loanToDelete.total_amount ?? 0).toFixed(2)}</span>
              </div>
              <label className="input-group">
                <span className="input-label">Motivo</span>
                <select value={deleteReason} onChange={(e) => setDeleteReason(e.target.value)}>
                  <option value="Prestamo duplicado">Prestamo duplicado</option>
                  <option value="Prestamo errado">Prestamo errado</option>
                  <option value="Cliente equivocado">Cliente equivocado</option>
                  <option value="Otro">Otro</option>
                </select>
              </label>
              <label className="input-group">
                <span className="input-label">Detalle</span>
                <input value={deleteNote} onChange={(e) => setDeleteNote(e.target.value)} placeholder="Detalle opcional del motivo" />
              </label>
              <div className="modal-actions">
                <button type="button" className="ghost-button" onClick={() => setLoanToDelete(null)}>Cancelar</button>
                <button type="button" className="danger-button" onClick={deleteLoan} disabled={deleting}>
                  {deleting ? "Eliminando..." : "Eliminar prestamo"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
