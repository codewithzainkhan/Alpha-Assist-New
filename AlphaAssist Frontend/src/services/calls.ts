// src/services/calls.ts
// Call reminder + WhatsApp reminder service.
// All Twilio operations go through the FastAPI backend (/api/calls/...).

import { apiPost } from "./api"
import { supabase } from "./supabase"


// ─── Call Reminder ────────────────────────────────────────────────────────────

export async function scheduleCallReminder(
  taskId:         string,
  taskName:       string,
  toNumber:       string,
  reminderTimeStr: string,  // "HH:MM:SS"
  dateStr:        string,   // "YYYY-MM-DD"
): Promise<boolean> {
  try {
    const [rh, rm]           = reminderTimeStr.split(":").map(Number)
    const [year, month, day] = dateStr.split("-").map(Number)
    const callDateTime        = new Date(year, month - 1, day, rh, rm, 0)

    if (callDateTime <= new Date()) {
      console.warn("[Calls] Reminder time is in the past — skipping call schedule")
      return false
    }

    await apiPost("/api/calls/schedule", {
      task_id:            taskId,
      task_name:          taskName,
      to_number:          toNumber,
      scheduled_datetime: callDateTime.toISOString(),
    })

    console.log("[Calls] Call reminder scheduled for task:", taskId)
    return true
  } catch (e) {
    console.warn("[Calls] scheduleCallReminder error:", e)
    return false
  }
}

export async function cancelCallReminder(taskId: string): Promise<void> {
  try {
    await apiPost("/api/calls/cancel", { task_id: taskId })
    console.log("[Calls] Call reminder cancelled for task:", taskId)
  } catch (e) {
    // Non-fatal — task may already be gone
    console.warn("[Calls] cancelCallReminder error:", e)
  }
}


// ─── WhatsApp Reminder ────────────────────────────────────────────────────────

export async function scheduleWhatsAppReminder(
  taskId:         string,
  taskName:       string,
  toNumber:       string,
  reminderTimeStr: string,  // "HH:MM:SS"
  dateStr:        string,   // "YYYY-MM-DD"
): Promise<boolean> {
  try {
    const [rh, rm]           = reminderTimeStr.split(":").map(Number)
    const [year, month, day] = dateStr.split("-").map(Number)
    const sendAt              = new Date(year, month - 1, day, rh, rm, 0)

    if (sendAt <= new Date()) {
      console.warn("[Calls] WhatsApp reminder time is in the past — skipping")
      return false
    }

    await apiPost("/api/calls/whatsapp/schedule", {
      task_id:            taskId,
      task_name:          taskName,
      to_number:          toNumber,
      scheduled_datetime: sendAt.toISOString(),
    })

    console.log("[Calls] WhatsApp reminder scheduled for task:", taskId)
    return true
  } catch (e) {
    console.warn("[Calls] scheduleWhatsAppReminder error:", e)
    return false
  }
}

export async function cancelWhatsAppReminder(taskId: string): Promise<void> {
  try {
    await apiPost("/api/calls/whatsapp/cancel", { task_id: taskId })
    console.log("[Calls] WhatsApp reminder cancelled for task:", taskId)
  } catch (e) {
    console.warn("[Calls] cancelWhatsAppReminder error:", e)
  }
}


// ─── Phone number management ──────────────────────────────────────────────────

export async function saveUserPhone(userId: string, phone: string): Promise<void> {
  const { error } = await supabase
    .from("profiles")
    .update({ phone })
    .eq("id", userId)

  if (error) throw error
  console.log("[Calls] Phone saved for user:", userId)
}

export async function getUserPhone(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("phone")
    .eq("id", userId)
    .maybeSingle()

  if (error) {
    console.warn("[Calls] getUserPhone error:", error)
    return null
  }

  return data?.phone ?? null
}
