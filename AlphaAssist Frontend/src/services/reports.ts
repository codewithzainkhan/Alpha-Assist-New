import { supabase } from "./supabase"
import { getTasks } from "./tasks"
import { getGoals } from "./goals"
import { buildReportForRange, type ReportData, type ReportPeriod } from "./reportBuilder"

// ── Types ─────────────────────────────────────────────────────────────────────

export type { ReportData, ReportPeriod }

export interface StoredReport {
  id:           string
  user_id:      string
  period:       ReportPeriod
  period_label: string
  period_start: string
  period_end:   string
  report_data:  ReportData
  generated_at: string
}

// ── Save a report to Supabase ─────────────────────────────────────────────────

export async function saveReport(
  userId: string,
  report: ReportData,
  periodStart: string,
  periodEnd:   string,
): Promise<void> {
  const { error } = await supabase
    .from("reports")
    .upsert({
      user_id:      userId,
      period:       report.period,
      period_label: report.dateLabel,
      period_start: periodStart,
      period_end:   periodEnd,
      report_data:  report,
      generated_at: report.generatedAt,
    }, {
      onConflict: "user_id,period,period_start",
    })

  if (error) {
    console.warn("[Reports] Failed to save report:", error.message)
    throw error
  }
}

// ── Generate & save reports for all periods ───────────────────────────────────

/**
 * Called on every login. Builds and upserts 6 reports into Supabase:
 *   - Yesterday / last week / last month   (completed past periods)
 *   - Today / this week / this month       (current in-progress snapshot)
 *
 * Uses Promise.allSettled so a single failure never blocks the others.
 */
export async function generateAndSaveAllReports(userId: string): Promise<void> {
  try {
    const [tasks, goals] = await Promise.all([getTasks(userId), getGoals(userId)])

    const now = new Date()
    const todayStr = now.toISOString().split("T")[0]

    // ── Yesterday ─────────────────────────────────────────────────────────────
    const yesterday = new Date(now)
    yesterday.setDate(now.getDate() - 1)
    const yesterdayStr = yesterday.toISOString().split("T")[0]

    // ── This week (Monday–today) ──────────────────────────────────────────────
    const thisMonday = new Date(now)
    thisMonday.setDate(now.getDate() - ((now.getDay() + 6) % 7))
    thisMonday.setHours(0, 0, 0, 0)
    const thisWeekStartStr = thisMonday.toISOString().split("T")[0]

    // ── Last week (Mon–Sun before this week) ──────────────────────────────────
    const lastWeekEnd = new Date(thisMonday)
    lastWeekEnd.setDate(thisMonday.getDate() - 1)
    const lastWeekStart = new Date(lastWeekEnd)
    lastWeekStart.setDate(lastWeekEnd.getDate() - 6)
    const lastWeekStartStr = lastWeekStart.toISOString().split("T")[0]
    const lastWeekEndStr   = lastWeekEnd.toISOString().split("T")[0]

    // ── This month (1st–today) ────────────────────────────────────────────────
    const thisMonthStartStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`

    // ── Last month ────────────────────────────────────────────────────────────
    const lastMonthEndDate   = new Date(now.getFullYear(), now.getMonth(), 0)
    const lastMonthStartDate = new Date(lastMonthEndDate.getFullYear(), lastMonthEndDate.getMonth(), 1)
    const lastMonthStartStr  = lastMonthStartDate.toISOString().split("T")[0]
    const lastMonthEndStr    = lastMonthEndDate.toISOString().split("T")[0]

    const build = (period: ReportPeriod, start: string, end: string) =>
      saveReport(userId, buildReportForRange(period, tasks, goals, start, end), start, end)
        .catch((e) => console.warn(`[Reports] Failed to save ${period} (${start}):`, e))

    await Promise.allSettled([
      // Past completed periods
      build("daily",   yesterdayStr,    yesterdayStr),
      build("weekly",  lastWeekStartStr, lastWeekEndStr),
      build("monthly", lastMonthStartStr, lastMonthEndStr),
      // Current in-progress snapshots
      build("daily",   todayStr,         todayStr),
      build("weekly",  thisWeekStartStr,  todayStr),
      build("monthly", thisMonthStartStr, todayStr),
    ])

    console.log("[Reports] All period reports generated and saved")
  } catch (err) {
    console.warn("[Reports] generateAndSaveAllReports failed:", err)
  }
}

// ── Fetch latest stored reports ───────────────────────────────────────────────

export async function getLatestReports(userId: string): Promise<{
  daily:   StoredReport | null
  weekly:  StoredReport | null
  monthly: StoredReport | null
}> {
  const { data, error } = await supabase
    .from("reports")
    .select("*")
    .eq("user_id", userId)
    .order("generated_at", { ascending: false })
    .limit(30)

  if (error) {
    console.warn("[Reports] Failed to fetch reports:", error.message)
    return { daily: null, weekly: null, monthly: null }
  }

  const rows = (data ?? []) as StoredReport[]

  return {
    daily:   rows.find((r) => r.period === "daily")   ?? null,
    weekly:  rows.find((r) => r.period === "weekly")  ?? null,
    monthly: rows.find((r) => r.period === "monthly") ?? null,
  }
}

// ── Fetch all reports for a user ──────────────────────────────────────────────

export async function getAllReports(userId: string, period?: ReportPeriod): Promise<StoredReport[]> {
  let query = supabase
    .from("reports")
    .select("*")
    .eq("user_id", userId)
    .order("period_end", { ascending: false })
    .limit(50)

  if (period) query = query.eq("period", period)

  const { data, error } = await query
  if (error) { console.warn("[Reports] Failed to fetch all reports:", error.message); return [] }
  return (data ?? []) as StoredReport[]
}
