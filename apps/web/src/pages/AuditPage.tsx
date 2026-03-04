import { useEffect, useState } from "react";
import { TableSkeleton } from "../components/LoadingState";
import { supabase } from "../lib/supabase";

export function AuditPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(50).then(({ data }) => {
      setRows(data ?? []);
      setLoading(false);
    });
  }, []);

  return (
    <div className="stack">
      <h1>Auditoria</h1>
      {loading ? (
        <TableSkeleton rows={7} columns={4} />
      ) : (
        <div className="panel">
          <div className="table-container">
            <table className="table">
              <thead><tr><th>Fecha</th><th>Entidad</th><th>Accion</th><th>Motivo</th></tr></thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>{new Date(row.created_at).toLocaleString()}</td>
                    <td>{row.entity}</td>
                    <td>{row.action}</td>
                    <td>{row.reason}</td>
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
