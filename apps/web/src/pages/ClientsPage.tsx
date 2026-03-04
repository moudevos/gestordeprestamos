import { Pencil, Plus, X } from "lucide-react";
import type { FormEvent } from "react";
import { useEffect, useState } from "react";
import { TableSkeleton } from "../components/LoadingState";
import { showErrorAlert, showSuccessToast } from "../lib/alerts";
import { supabase } from "../lib/supabase";

const initialForm = { doc_type: "DNI", doc_number: "", first_name: "", last_name: "", phone: "" };

export function ClientsPage() {
  const [clients, setClients] = useState<any[]>([]);
  const [organizationId, setOrganizationId] = useState<string>("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(initialForm);

  async function load() {
    setLoading(true);
    const [{ data }, { data: profile }] = await Promise.all([
      supabase.from("clients").select("*").is("deleted_at", null).order("created_at", { ascending: false }),
      supabase.from("profiles").select("organization_id").single()
    ]);
    setClients(data ?? []);
    setOrganizationId(profile?.organization_id ?? "");
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const result = editingClient
      ? await supabase.from("clients").update(form).eq("id", editingClient.id)
      : await supabase.from("clients").insert({
          organization_id: organizationId,
          ...form
        });

    if (result.error) {
      await showErrorAlert("No se pudo guardar", result.error.message);
      setSubmitting(false);
      return;
    }

    setForm(initialForm);
    setEditingClient(null);
    setIsModalOpen(false);
    await load();
    await showSuccessToast(editingClient ? "Cliente actualizado" : "Cliente creado");
    setSubmitting(false);
  }

  function openCreateModal() {
    setEditingClient(null);
    setForm(initialForm);
    setIsModalOpen(true);
  }

  function openEditModal(client: any) {
    setEditingClient(client);
    setForm({
      doc_type: client.doc_type ?? "DNI",
      doc_number: client.doc_number ?? "",
      first_name: client.first_name ?? "",
      last_name: client.last_name ?? "",
      phone: client.phone ?? ""
    });
    setIsModalOpen(true);
  }

  return (
    <div className="stack">
      <div className="quick-summary-header">
        <h1>Clientes</h1>
        <button type="button" className="btn-primary" onClick={openCreateModal}>
          <Plus size={18} strokeWidth={2.2} />
          Nuevo cliente
        </button>
      </div>
      {loading ? (
        <TableSkeleton rows={6} columns={5} />
      ) : (
        <div className="panel">
          <div className="table-container">
            <table className="table">
              <thead><tr><th>Documento</th><th>Nombre</th><th>Telefono</th><th>Estado</th><th>Score</th><th></th></tr></thead>
              <tbody>
                {clients.map((client) => (
                  <tr key={client.id}>
                    <td>{client.doc_type} {client.doc_number}</td>
                    <td>{client.first_name} {client.last_name}</td>
                    <td>{client.phone || "-"}</td>
                    <td>{client.status}</td>
                    <td>{client.score_value}</td>
                    <td>
                      <button type="button" className="ghost-button" onClick={() => openEditModal(client)}>
                        <Pencil size={16} strokeWidth={2} />
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {isModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsModalOpen(false)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="quick-summary-header">
              <h2 className="section-title">{editingClient ? "Editar cliente" : "Nuevo cliente"}</h2>
              <button type="button" className="icon-close-button" onClick={() => setIsModalOpen(false)} aria-label="Cerrar modal">
                <X size={18} strokeWidth={2.4} />
              </button>
            </div>
            <form className="form-grid" onSubmit={submit}>
              <div className="inline-fields">
                <label className="input-group">
                  <span className="input-label">Tipo de documento</span>
                  <select value={form.doc_type} onChange={(e) => setForm({ ...form, doc_type: e.target.value })}>
                    <option value="DNI">DNI</option>
                    <option value="CE">Carnet de extranjeria</option>
                    <option value="PASAPORTE">Pasaporte</option>
                    <option value="RUC">RUC</option>
                  </select>
                </label>
                <label className="input-group">
                  <span className="input-label">Numero de documento</span>
                  <input value={form.doc_number} onChange={(e) => setForm({ ...form, doc_number: e.target.value })} placeholder="12345678" />
                </label>
              </div>
              <label className="input-group">
                <span className="input-label">Nombres</span>
                <input value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} placeholder="Juan" />
              </label>
              <label className="input-group">
                <span className="input-label">Apellidos</span>
                <input value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} placeholder="Perez" />
              </label>
              <label className="input-group">
                <span className="input-label">Telefono o celular</span>
                <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="999888777" />
              </label>
              <div className="modal-actions">
                <button type="button" className="ghost-button" onClick={() => setIsModalOpen(false)}>Cancelar</button>
                <button type="submit" disabled={submitting}>{submitting ? "Guardando..." : editingClient ? "Guardar cambios" : "Guardar cliente"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
