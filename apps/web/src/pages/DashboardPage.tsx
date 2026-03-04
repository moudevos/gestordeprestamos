import type { ReactNode } from "react";
import {
  AlertTriangle,
  BanknoteArrowDown,
  BanknoteArrowUp,
  Coins,
  HandCoins,
  Landmark,
  Wallet
} from "lucide-react";
import { BarChart, Bar, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useQuery } from "@tanstack/react-query";
import { MetricSkeleton } from "../components/LoadingState";
import { supabase } from "../lib/supabase";

export function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const [{ data: profile }, today, overdue, balances] = await Promise.all([
        supabase.from("profiles").select("organization_id").single(),
        supabase
          .from("installments")
          .select("id, amount_due, due_date, status, loans(id, clients(first_name,last_name))")
          .eq("due_date", new Date().toISOString().slice(0, 10))
          .neq("status", "paid")
          .order("due_date", { ascending: true }),
        supabase
          .from("installments")
          .select("id, amount_due, due_date, status, loans(id, clients(first_name,last_name))")
          .lt("due_date", new Date().toISOString().slice(0, 10))
          .neq("status", "paid")
          .order("due_date", { ascending: true })
          .limit(8),
        supabase.from("loan_balances").select("principal_outstanding, penalty_outstanding, interest_collected, total_outstanding")
      ]);
      const capital = profile?.organization_id
        ? await supabase.rpc("get_capital_summary", { p_organization_id: profile.organization_id })
        : { data: null };
      return {
        today: today.data ?? [],
        overdue: overdue.data ?? [],
        balances: balances.data ?? [],
        capital: capital.data?.[0] ?? capital.data ?? null
      };
    }
  });

  const totals = (data?.balances ?? []).reduce(
    (acc, row) => ({
      principal: acc.principal + Number(row.principal_outstanding),
      penalty: acc.penalty + Number(row.penalty_outstanding),
      collected: acc.collected + Number(row.interest_collected),
      outstanding: acc.outstanding + Number(row.total_outstanding)
    }),
    { principal: 0, penalty: 0, collected: 0, outstanding: 0 }
  );

  const totalIn = Number(data?.capital?.total_in ?? 0);
  const totalOut = Number(data?.capital?.total_out ?? 0);
  const availableCash = Number(data?.capital?.available_cash ?? 0);
  const capitalInStreet = Number(data?.capital?.total_disbursed ?? 0);
  const fundsChart = [
    { name: "Disponible", value: availableCash, color: "#2f6fed" },
    { name: "Colocado", value: Math.max(0, capitalInStreet), color: "#94a3b8" }
  ];
  const portfolioChart = [
    { name: "Saldo", value: totals.outstanding },
    { name: "Mora", value: totals.penalty },
    { name: "Interes cobrado", value: totals.collected }
  ];

  return (
    <div className="stack">
      <h1>Dashboard</h1>
      <div className="metrics-grid">
        {isLoading ? (
          Array.from({ length: 9 }).map((_, index) => <MetricSkeleton key={index} />)
        ) : (
          <>
            <MetricCard icon={<HandCoins size={18} strokeWidth={2} />} label="Por cobrar hoy" value={String(data?.today.length ?? 0)} tone="blue" />
            <MetricCard icon={<AlertTriangle size={18} strokeWidth={2} />} label="Vencidas" value={String(data?.overdue.length ?? 0)} tone="amber" />
            <MetricCard icon={<Landmark size={18} strokeWidth={2} />} label="Capital activo" value={`S/ ${totals.principal.toFixed(2)}`} tone="slate" />
            <MetricCard icon={<Wallet size={18} strokeWidth={2} />} label="Saldo total" value={`S/ ${totals.outstanding.toFixed(2)}`} tone="blue" />
            <MetricCard icon={<AlertTriangle size={18} strokeWidth={2} />} label="Mora acumulada" value={`S/ ${totals.penalty.toFixed(2)}`} tone="rose" />
            <MetricCard icon={<Coins size={18} strokeWidth={2} />} label="Interes cobrado" value={`S/ ${totals.collected.toFixed(2)}`} tone="emerald" />
            <MetricCard icon={<BanknoteArrowUp size={18} strokeWidth={2} />} label="Entradas de capital" value={`S/ ${totalIn.toFixed(2)}`} tone="emerald" />
            <MetricCard icon={<Wallet size={18} strokeWidth={2} />} label="Efectivo disponible" value={`S/ ${availableCash.toFixed(2)}`} tone="blue" />
            <MetricCard icon={<BanknoteArrowDown size={18} strokeWidth={2} />} label="Salidas acumuladas" value={`S/ ${totalOut.toFixed(2)}`} tone="slate" />
          </>
        )}
      </div>
      {!isLoading && (
        <>
        <div className="dashboard-tables">
          <div className="panel">
            <div className="quick-summary-header">
              <h2 className="section-title">Cuotas vencidas</h2>
              <span className="helper-text">{data?.overdue.length ?? 0} registros</span>
            </div>
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Vencimiento</th>
                    <th>Monto</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.overdue ?? []).map((item: any) => (
                    <tr key={item.id}>
                      <td>{item.loans?.clients?.first_name} {item.loans?.clients?.last_name}</td>
                      <td>{item.due_date}</td>
                      <td>S/ {Number(item.amount_due ?? 0).toFixed(2)}</td>
                      <td>{item.status}</td>
                    </tr>
                  ))}
                  {(data?.overdue ?? []).length === 0 && (
                    <tr><td colSpan={4}>No hay cuotas vencidas.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
          <div className="panel">
            <div className="quick-summary-header">
              <h2 className="section-title">Vencen hoy</h2>
              <span className="helper-text">{data?.today.length ?? 0} registros</span>
            </div>
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th>Fecha</th>
                    <th>Monto</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.today ?? []).map((item: any) => (
                    <tr key={item.id}>
                      <td>{item.loans?.clients?.first_name} {item.loans?.clients?.last_name}</td>
                      <td>{item.due_date}</td>
                      <td>S/ {Number(item.amount_due ?? 0).toFixed(2)}</td>
                      <td>{item.status}</td>
                    </tr>
                  ))}
                  {(data?.today ?? []).length === 0 && (
                    <tr><td colSpan={4}>No hay cuotas para hoy.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        <div className="dashboard-charts">
          <div className="panel chart-panel">
            <div className="chart-title">Disponibilidad de fondos</div>
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie data={fundsChart} dataKey="value" nameKey="name" innerRadius={55} outerRadius={80} paddingAngle={3}>
                  {fundsChart.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number) => [`S/ ${Number(value).toFixed(2)}`, "Monto"]}
                  contentStyle={{ borderRadius: 16, border: "1px solid #dde2ea", fontSize: 12 }}
                />
                <Legend verticalAlign="bottom" height={24} iconType="circle" />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="panel chart-panel">
            <div className="chart-title">Cartera actual</div>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={portfolioChart}>
                <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickLine={false} axisLine={false} fontSize={12} />
                <Tooltip
                  formatter={(value: number) => [`S/ ${Number(value).toFixed(2)}`, "Monto"]}
                  contentStyle={{ borderRadius: 16, border: "1px solid #dde2ea", fontSize: 12 }}
                />
                <Legend verticalAlign="bottom" height={24} iconType="circle" />
                <Bar dataKey="value" radius={[8, 8, 0, 0]} fill="#2f6fed" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        </>
      )}
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  tone
}: {
  icon: ReactNode;
  label: string;
  value: string;
  tone: "blue" | "emerald" | "rose" | "amber" | "slate";
}) {
  return (
    <section className={`metric-card metric-${tone}`}>
      <div className="metric-icon">{icon}</div>
      <div className="metric-copy">
        <span className="metric-label">{label}</span>
        <strong className="metric-value">{value}</strong>
      </div>
    </section>
  );
}
