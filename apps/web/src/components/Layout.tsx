import {
  BarChart3,
  CreditCard,
  FolderKanban,
  HandCoins,
  LayoutDashboard,
  Menu,
  LogOut,
  Settings,
  ShieldCheck,
  Users
} from "lucide-react";
import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { primaryNav, secondaryNav } from "@gestor-prestamos/shared";
import { supabase } from "../lib/supabase";

export function Layout() {
  const [loggingOut, setLoggingOut] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const getNavClass = (isActive: boolean, muted = false) =>
    `nav-link${isActive ? " nav-link-active" : ""}${muted ? " nav-link-muted" : ""}`;

  const iconByKey = {
    dashboard: LayoutDashboard,
    clientes: Users,
    prestamos: CreditCard,
    cobranza: HandCoins,
    reportes: BarChart3,
    movimientos: FolderKanban,
    configuracion: Settings,
    auditoria: ShieldCheck
  } as const;
  const mobilePrimaryNav = primaryNav.slice(0, 4);

  async function handleLogout() {
    setLoggingOut(true);
    await supabase.auth.signOut();
    setLoggingOut(false);
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">Prestamos</div>
        <nav className="nav">
          {primaryNav.map((item) => (
            <NavLink key={item.key} to={item.path} className={({ isActive }) => getNavClass(isActive)}>
              {(() => {
                const Icon = iconByKey[item.key as keyof typeof iconByKey];
                return <Icon size={18} strokeWidth={2} />;
              })()}
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="secondary-nav">
          {secondaryNav.map((item) => (
            <NavLink key={item.key} to={item.path} className={({ isActive }) => getNavClass(isActive, true)}>
              {(() => {
                const Icon = iconByKey[item.key as keyof typeof iconByKey];
                return <Icon size={18} strokeWidth={2} />;
              })()}
              {item.label}
            </NavLink>
          ))}
          <button type="button" className="logout-button" onClick={handleLogout} disabled={loggingOut}>
            <LogOut size={18} strokeWidth={2} />
            {loggingOut ? "Saliendo..." : "Cerrar sesion"}
          </button>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
      <nav className="bottom-nav">
        {mobilePrimaryNav.map((item) => (
          <NavLink key={item.key} to={item.path} className={({ isActive }) => getNavClass(isActive)}>
            {(() => {
              const Icon = iconByKey[item.key as keyof typeof iconByKey];
              return <Icon size={18} strokeWidth={2} />;
            })()}
            {item.label}
          </NavLink>
        ))}
        <button
          type="button"
          className={`nav-link menu-toggle${mobileMenuOpen ? " nav-link-active" : ""}`}
          onClick={() => setMobileMenuOpen((value) => !value)}
        >
          <Menu size={18} strokeWidth={2} />
          Menu
        </button>
      </nav>
      {mobileMenuOpen && (
        <>
          <button type="button" className="mobile-menu-backdrop" onClick={() => setMobileMenuOpen(false)} aria-label="Cerrar menu" />
          <div className="mobile-menu-sheet">
            <div className="quick-summary-header">
              <h2 className="section-title">Menu</h2>
              <button type="button" className="ghost-button" onClick={() => setMobileMenuOpen(false)}>Cerrar</button>
            </div>
            <div className="mobile-menu-list">
              <div className="mobile-menu-group">
                <span className="mobile-menu-label">Principales</span>
                {primaryNav.map((item) => (
                  <NavLink
                    key={item.key}
                    to={item.path}
                    className={({ isActive }) => getNavClass(isActive)}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {(() => {
                      const Icon = iconByKey[item.key as keyof typeof iconByKey];
                      return <Icon size={18} strokeWidth={2} />;
                    })()}
                    {item.label}
                  </NavLink>
                ))}
              </div>
              <div className="mobile-menu-group">
                <span className="mobile-menu-label">Administracion</span>
                {secondaryNav.map((item) => (
                  <NavLink
                    key={item.key}
                    to={item.path}
                    className={({ isActive }) => getNavClass(isActive, true)}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {(() => {
                      const Icon = iconByKey[item.key as keyof typeof iconByKey];
                      return <Icon size={18} strokeWidth={2} />;
                    })()}
                    {item.label}
                  </NavLink>
                ))}
              </div>
              <button type="button" className="logout-button" onClick={handleLogout} disabled={loggingOut}>
                <LogOut size={18} strokeWidth={2} />
                {loggingOut ? "Saliendo..." : "Cerrar sesion"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
