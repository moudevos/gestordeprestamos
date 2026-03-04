import { useEffect, useMemo, useState } from "react";
import { TableSkeleton } from "../components/LoadingState";
import { supabase } from "../lib/supabase";

type MovementFilter = "all" | "capital" | "payments";

type MixedRow = {
  id: string;
  date: string;
  type: "capital" | "payment";
  category: string;
  direction: "in" | "out" | "neutral";
  amount: number;
  detail: string;
};

const capitalMovementLabels: Record<string, string> = {
  initial_funding: "Capital inicial",
  manual_funding: "Ingreso de capital",
  loan_disbursement: "Desembolso de prestamo",
  principal_collection: "Recuperacion de capital",
  interest_collection: "Cobro de interes",
  profit_withdrawal: "Retiro de ganancia",
  manual_adjustment: "Ajuste manual"
};

const paymentMethodLabels: Record<string, string> = {
  cash: "Efectivo",
  transfer: "Transferencia",
  deposit: "Deposito"
};

export function MovementsPage() {
  const [filter, setFilter] = useState<MovementFilter>("all");
  const [rows, setRows] = useState<MixedRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [{ data: capitalRows }, { data: paymentRows }] = await Promise.all([
        supabase
          .from("capital_movements")
          .select("id, created_at, movement_type, direction, amount, note, loans(clients(first_name,last_name))")
          .order("created_at", { ascending: false })
          .limit(100),
        supabase
          .from("payments")
          .select("id, paid_at, amount, method, reference, loans(clients(first_name,last_name))")
          .order("paid_at", { ascending: false })
          .limit(100)
      ]);

      const normalizedCapital: MixedRow[] = (capitalRows ?? []).map((row: any) => ({
        id: row.id,
        date: row.created_at,
        type: "capital",
        category: capitalMovementLabels[row.movement_type] ?? "Movimiento de caja",
        direction: row.direction,
        amount: Number(row.amount ?? 0),
        detail:
          row.movement_type === "loan_disbursement"
            ? `Prestamo a ${row.loans?.clients?.first_name ?? ""} ${row.loans?.clients?.last_name ?? ""}`.trim()
            : row.note || "Movimiento de caja"
      }));

      const normalizedPayments: MixedRow[] = (paymentRows ?? []).map((row: any) => ({
        id: row.id,
        date: row.paid_at,
        type: "payment",
        category: paymentMethodLabels[row.method] ?? "Pago",
        direction: "neutral",
        amount: Number(row.amount ?? 0),
        detail: `${row.loans?.clients?.first_name ?? ""} ${row.loans?.clients?.last_name ?? ""}`.trim() || row.reference || "Pago registrado"
      }));

      const merged = [...normalizedCapital, ...normalizedPayments].sort((a, b) => String(b.date).localeCompare(String(a.date)));
      setRows(merged);
      setLoading(false);
    }

    load();
  }, []);

  const visibleRows = useMemo(() => {
    if (filter === "capital") return rows.filter((row) => row.type === "capital");
    if (filter === "payments") return rows.filter((row) => row.type === "payment");
    return rows;
  }, [filter, rows]);

  return (
    <div className="stack">
      <div className="quick-summary-header">
        <h1>Movimientos</h1>
        <div className="segmented-control">
          <button type="button" className={filter === "all" ? "segment-active" : "segment-button"} onClick={() => setFilter("all")}>Todo</button>
          <button type="button" className={filter === "capital" ? "segment-active" : "segment-button"} onClick={() => setFilter("capital")}>Caja</button>
          <button type="button" className={filter === "payments" ? "segment-active" : "segment-button"} onClick={() => setFilter("payments")}>Pagos</button>
        </div>
      </div>
      <p className="helper-text">
        Filtra entre movimientos de capital, pagos cobrados o una vista consolidada de ambos.
      </p>
      {loading ? (
        <TableSkeleton rows={8} columns={5} />
      ) : (
        <div className="panel">
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Vista</th>
                  <th>Categoria</th>
                  <th>Monto</th>
                  <th>Detalle</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr key={`${row.type}-${row.id}`}>
                    <td>{String(row.date).slice(0, 10)}</td>
                    <td>{row.type === "capital" ? "Caja" : "Pago"}</td>
                    <td>{row.category}</td>
                    <td className={row.direction === "out" ? "amount-out" : row.direction === "in" ? "amount-in" : ""}>
                      {row.direction === "out" ? "- " : row.direction === "in" ? "+ " : ""}S/ {row.amount.toFixed(2)}
                    </td>
                    <td>{row.detail}</td>
                  </tr>
                ))}
                {visibleRows.length === 0 && (
                  <tr>
                    <td colSpan={5}>No hay movimientos para este filtro.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
