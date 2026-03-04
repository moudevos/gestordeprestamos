import { useEffect, useState } from "react";
import { TableSkeleton } from "../components/LoadingState";
import { supabase } from "../lib/supabase";

export function ReportsPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from("loans").select("id, status, principal_amount, total_amount, clients(first_name,last_name)").is("deleted_at", null).then(({ data }) => {
      setRows(data ?? []);
      setLoading(false);
    });
  }, []);

  function exportCsv() {
    const csv = ["cliente,estado,capital,total"]
      .concat(rows.map((row) => `${row.clients?.first_name ?? ""} ${row.clients?.last_name ?? ""},${row.status},${row.principal_amount},${row.total_amount}`))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "reporte-prestamos.csv";
    link.click();
  }

  return (
    <div className="stack">
      <h1>Reportes</h1>
      <div className="panel toolbar">
        <button onClick={exportCsv}>Exportar CSV</button>
      </div>
      {loading ? (
        <TableSkeleton rows={6} columns={4} />
      ) : (
        <div className="panel">
          <div className="table-container">
            <table className="table">
              <thead><tr><th>Cliente</th><th>Estado</th><th>Capital</th><th>Total</th></tr></thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.clients?.first_name} {row.clients?.last_name}</td>
                    <td>{row.status}</td>
                    <td>{row.principal_amount}</td>
                    <td>{row.total_amount}</td>
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
