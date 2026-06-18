/**
 * src/services/reportBuilder.ts
 *
 * Self-contained report-building logic with no circular dependencies.
 * Both ReportScreen and the background generator import from here.
 */
import type { TaskFrontend } from "./tasks"
import type { GoalFrontend } from "./goals"

// ── Types ─────────────────────────────────────────────────────────────────────

export type ReportPeriod = "daily" | "weekly" | "monthly"

export interface ReportData {
  period:      ReportPeriod
  generatedAt: string
  dateLabel:   string

  tasks: {
    total:          number
    completed:      number
    pending:        number
    overdue:        number
    completionRate: number
    byType:         { type: string; total: number; completed: number }[]
    highlighted:    TaskFrontend[]
  }

  goals: {
    total:          number
    active:         number
    completed:      number
    totalSaved:     number
    totalTarget:    number
    totalRemaining: number
    progressPct:    number
    avgProgress:    number
    nearDeadline:   GoalFrontend[]
    recentlyFunded: GoalFrontend[]
    completedGoals: GoalFrontend[]
    topGoal:        GoalFrontend | null
    atRisk:         GoalFrontend[]
  }

  insight: string
}

// ── Date helpers ──────────────────────────────────────────────────────────────

export function getDateRange(period: ReportPeriod): { start: string; end: string } {
  const now   = new Date()
  const today = now.toISOString().split("T")[0]

  if (period === "daily") return { start: today, end: today }

  if (period === "weekly") {
    const monday = new Date(now)
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7))
    monday.setHours(0, 0, 0, 0)
    return { start: monday.toISOString().split("T")[0], end: today }
  }

  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`
  return { start: monthStart, end: today }
}

function getDateLabel(period: ReportPeriod, start: string, end: string): string {
  // Use noon to avoid UTC-offset flipping the day
  const startDate = new Date(start + "T12:00:00")
  const endDate   = new Date(end   + "T12:00:00")
  const todayStr  = new Date().toISOString().split("T")[0]
  const shortOpts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }

  if (period === "daily") {
    if (start === todayStr) return `Today, ${startDate.toLocaleDateString("en-US", shortOpts)}`
    return startDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
  }

  if (period === "weekly") {
    return `${startDate.toLocaleDateString("en-US", shortOpts)} – ${endDate.toLocaleDateString("en-US", shortOpts)}`
  }

  return startDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })
}

// ── Insight generator ─────────────────────────────────────────────────────────

function buildInsight(data: Omit<ReportData, "insight">): string {
  const { tasks, goals, period } = data
  const periodWord = period === "daily" ? "today" : period === "weekly" ? "this week" : "this month"

  if (tasks.total === 0 && goals.total === 0)
    return `No activity recorded ${periodWord}. Start scheduling tasks to track your progress!`
  if (tasks.completionRate === 100 && tasks.total > 0)
    return `Perfect score ${periodWord}! You completed all ${tasks.total} task${tasks.total > 1 ? "s" : ""}. Outstanding work! 🎉`
  if (tasks.completionRate >= 75)
    return `Great momentum ${periodWord} — ${tasks.completed} of ${tasks.total} tasks done. Keep it up! 💪`
  if (tasks.completionRate >= 50)
    return `Solid progress ${periodWord}. ${tasks.pending} task${tasks.pending > 1 ? "s" : ""} still pending — you can finish strong!`
  if (tasks.overdue > 0)
    return `${tasks.overdue} overdue task${tasks.overdue > 1 ? "s" : ""} need your attention. Tackle them first ${periodWord === "today" ? "tomorrow" : "next"}!`
  return `${tasks.completed} of ${tasks.total} tasks completed ${periodWord}. Goals are ${goals.progressPct}% funded overall.`
}

// ── Core builder ──────────────────────────────────────────────────────────────

/**
 * Build a ReportData snapshot for an explicit date range.
 * Use this to generate both current-period and past-period reports.
 */
export function buildReportForRange(
  period: ReportPeriod,
  tasks:  TaskFrontend[],
  goals:  GoalFrontend[],
  start:  string,
  end:    string,
): ReportData {
  const periodTasks = tasks.filter((t) => t.scheduledDate >= start && t.scheduledDate <= end)
  const completed   = periodTasks.filter((t) => t.status === "completed")
  const pending     = periodTasks.filter((t) => t.status !== "completed")
  const now         = new Date()
  const overdue     = pending.filter((t) => new Date(t.scheduledDate + "T" + t.scheduledTime) < now)

  const typeMap: Record<string, { total: number; completed: number }> = {}
  for (const t of periodTasks) {
    if (!typeMap[t.taskType]) typeMap[t.taskType] = { total: 0, completed: 0 }
    typeMap[t.taskType].total++
    if (t.status === "completed") typeMap[t.taskType].completed++
  }
  const byType = Object.entries(typeMap).map(([type, v]) => ({ type, ...v }))

  const activeGoalsList    = goals.filter((g) => g.status === "active")
  const completedGoalsList = goals.filter((g) => g.status === "completed")
  const allGoalsForSavings = [...activeGoalsList, ...completedGoalsList]

  const totalSaved     = allGoalsForSavings.reduce((s, g) => s + g.currentAmount, 0)
  const totalTarget    = allGoalsForSavings.reduce((s, g) => s + g.targetAmount, 0)
  const totalRemaining = Math.max(0, totalTarget - totalSaved)
  const progressPct    = totalTarget > 0 ? Math.round((totalSaved / totalTarget) * 100) : 0

  const avgProgress = allGoalsForSavings.length > 0
    ? Math.round(allGoalsForSavings.reduce(
        (s, g) => s + (g.targetAmount > 0 ? (g.currentAmount / g.targetAmount) * 100 : 0),
        0
      ) / allGoalsForSavings.length)
    : 0

  const in7Days  = new Date(now.getTime() + 7  * 24 * 60 * 60 * 1000)
  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

  const nearDeadline = activeGoalsList
    .filter((g) => g.deadline && new Date(g.deadline) <= in7Days)
    .sort((a, b) => new Date(a.deadline ?? "").getTime() - new Date(b.deadline ?? "").getTime())

  const atRisk = activeGoalsList.filter((g) => {
    const pct = g.targetAmount > 0 ? (g.currentAmount / g.targetAmount) * 100 : 0
    return g.deadline && new Date(g.deadline) <= in30Days && pct < 50
  })

  const topGoal = [...activeGoalsList].sort(
    (a, b) => (b.targetAmount > 0 ? b.currentAmount / b.targetAmount : 0)
             - (a.targetAmount > 0 ? a.currentAmount / a.targetAmount : 0)
  )[0] ?? null

  const recentlyFunded = [...activeGoalsList]
    .sort((a, b) => b.currentAmount - a.currentAmount)
    .slice(0, 5)

  const completionRate = periodTasks.length > 0
    ? Math.round((completed.length / periodTasks.length) * 100)
    : 0

  const base: Omit<ReportData, "insight"> = {
    period,
    generatedAt: new Date().toISOString(),
    dateLabel:   getDateLabel(period, start, end),
    tasks: {
      total:          periodTasks.length,
      completed:      completed.length,
      pending:        pending.length,
      overdue:        overdue.length,
      completionRate,
      byType,
      highlighted:    completed.slice(0, 5),
    },
    goals: {
      total:          goals.length,
      active:         activeGoalsList.length,
      completed:      completedGoalsList.length,
      totalSaved,
      totalTarget,
      totalRemaining,
      progressPct,
      avgProgress,
      nearDeadline,
      recentlyFunded,
      completedGoals: completedGoalsList,
      topGoal,
      atRisk,
    },
  }

  return { ...base, insight: buildInsight(base) }
}

/**
 * Convenience wrapper: build a report for the CURRENT period
 * (today / this week / this month).
 */
export function buildReport(
  period: ReportPeriod,
  tasks:  TaskFrontend[],
  goals:  GoalFrontend[],
): ReportData {
  const { start, end } = getDateRange(period)
  return buildReportForRange(period, tasks, goals, start, end)
}
