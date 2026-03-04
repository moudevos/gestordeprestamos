import { sendReminderEmail } from "./email.js";
import { sendPushNotification } from "./push.js";
import { supabaseAdmin } from "./supabase.js";

export async function runDailyJobs(asOfDate = new Date().toISOString().slice(0, 10)) {
  const { data: organizations } = await supabaseAdmin.from("organizations").select("id");
  const results: Array<{ organizationId: string; overdue: number | null; reminders: number | null }> = [];

  for (const organization of organizations ?? []) {
    const overdue = await supabaseAdmin.rpc("compute_overdue", {
      p_organization_id: organization.id,
      p_as_of_date: asOfDate
    });
    const reminders = await supabaseAdmin.rpc("queue_reminders", {
      p_as_of_date: asOfDate
    });
    await sendDailyPushSummary(organization.id, asOfDate);
    results.push({ organizationId: organization.id, overdue: overdue.data, reminders: reminders.data });
  }

  return results;
}

export async function processQueuedReminders() {
  const { data: reminders } = await supabaseAdmin
    .from("reminders")
    .select("*, clients(email, first_name), loans(id)")
    .eq("status", "queued")
    .lte("scheduled_for", new Date().toISOString())
    .limit(50);

  for (const reminder of reminders ?? []) {
    const subjectMap: Record<string, string> = {
      upcoming: "Recordatorio de pago",
      due_today: "Tu cuota vence hoy",
      overdue_day_1: "Tu cuota vencio ayer",
      overdue_day_3: "Tienes una cuota vencida",
      overdue_day_7: "Tienes atraso acumulado"
    };
    const send = await sendReminderEmail(
      reminder.clients?.email,
      subjectMap[reminder.reminder_type] ?? "Recordatorio",
      `Prestamo ${reminder.loan_id}: revisa tu cuota pendiente.`
    );

    await supabaseAdmin.from("reminder_logs").insert({
      organization_id: reminder.organization_id,
      reminder_id: reminder.id,
      channel: "email",
      status: send.success ? "sent" : "failed",
      response_message: send.message
    });

    await supabaseAdmin.from("reminders").update({
      status: send.success ? "sent" : "failed"
    }).eq("id", reminder.id);
  }

  return reminders?.length ?? 0;
}

export async function sendDailyPushSummary(organizationId: string, asOfDate: string) {
  const [{ data: dueToday }, { data: overdue }, { data: subscriptions }] = await Promise.all([
    supabaseAdmin.from("installments").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("due_date", asOfDate).neq("status", "paid"),
    supabaseAdmin.from("installments").select("id", { count: "exact", head: true }).eq("organization_id", organizationId).lt("due_date", asOfDate).neq("status", "paid"),
    supabaseAdmin.from("push_subscriptions").select("*").eq("organization_id", organizationId).eq("is_active", true)
  ]);

  const payload = {
    title: "Resumen diario",
    body: `${dueToday?.length ?? 0} cuotas vencen hoy, ${overdue?.length ?? 0} siguen vencidas`
  };

  for (const subscription of subscriptions ?? []) {
    try {
      await sendPushNotification(subscription, payload);
    } catch {
      await supabaseAdmin.from("push_subscriptions").update({ is_active: false }).eq("id", subscription.id);
    }
  }
}

export async function notifyPaymentEvent(organizationId: string, amount: number) {
  const { data: subscriptions } = await supabaseAdmin.from("push_subscriptions").select("*").eq("organization_id", organizationId).eq("is_active", true);
  for (const subscription of subscriptions ?? []) {
    await sendPushNotification(subscription, {
      title: "Pago registrado",
      body: `Se registro un pago de ${amount.toFixed(2)}`
    });
  }
}

