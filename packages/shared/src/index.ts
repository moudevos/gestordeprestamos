export type Role = "admin" | "collector";

export type NavItem = {
  key: string;
  label: string;
  path: string;
};

export const primaryNav: NavItem[] = [
  { key: "dashboard", label: "Dashboard", path: "/" },
  { key: "clientes", label: "Clientes", path: "/clientes" },
  { key: "prestamos", label: "Prestamos", path: "/prestamos" },
  { key: "cobranza", label: "Cobranza", path: "/cobranza" },
  { key: "reportes", label: "Reportes", path: "/reportes" }
];

export const secondaryNav: NavItem[] = [
  { key: "movimientos", label: "Movimientos", path: "/movimientos" },
  { key: "configuracion", label: "Configuracion", path: "/configuracion" },
  { key: "auditoria", label: "Auditoria", path: "/auditoria" }
];

export const currency = new Intl.NumberFormat("es-PE", {
  style: "currency",
  currency: "PEN",
  minimumFractionDigits: 2
});
