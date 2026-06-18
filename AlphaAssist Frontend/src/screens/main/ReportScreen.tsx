"use client"

import { useEffect, useRef, useState } from "react"
import {
  View, Text, ScrollView, StyleSheet,
  TouchableOpacity, Animated, Dimensions, Alert,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { LinearGradient } from "expo-linear-gradient"
import { Ionicons } from "@expo/vector-icons"
import { useRoute, useNavigation } from "@react-navigation/native"
import * as Sharing from "expo-sharing"
import * as Print from "expo-print"
import type { RouteProp } from "@react-navigation/native"
import type { StackNavigationProp } from "@react-navigation/stack"
import type { MainStackParamList } from "../../types/navigation"
import { useTheme } from "../../components/context/ThemeContext"
import { useAuth } from "../../hooks/useAuth"
import { getTasks } from "../../services/tasks"
import { getGoals } from "../../services/goals"
import { formatPKR } from "../../utils/currency"
import { supabase } from "../../services/supabase"
import { getAllReports, type StoredReport } from "../../services/reports"
import { buildReport, type ReportPeriod, type ReportData } from "../../services/reportBuilder"

const { width } = Dimensions.get("window")

type ReportRouteProp     = RouteProp<MainStackParamList, "Report">
type ReportNavProp       = StackNavigationProp<MainStackParamList, "Report">

// ReportPeriod, ReportData, and buildReport are imported from reportBuilder.ts above

// ── Ring component (reused from AnalyticsScreen) ──────────────────────────────
const Ring = ({ pct, size = 72, color, bg }: { pct: number; size?: number; color: string; bg: string }) => {
  const anim = useRef(new Animated.Value(0)).current
  const clamped = Math.min(100, Math.max(0, pct))
  useEffect(() => {
    Animated.timing(anim, { toValue: clamped, duration: 900, useNativeDriver: false }).start()
  }, [clamped])
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <View style={{ position: "absolute", width: size, height: size, borderRadius: size/2, borderWidth: 7, borderColor: bg }} />
      <View style={{
        position: "absolute", width: size, height: size, borderRadius: size/2, borderWidth: 7,
        borderColor: color,
        borderBottomColor: clamped < 25 ? "transparent" : color,
        borderLeftColor:   clamped < 50 ? "transparent" : color,
        borderTopColor:    clamped < 75 ? "transparent" : color,
        transform: [{ rotate: "-45deg" }],
      }} />
      <Text style={{ fontSize: size * 0.21, fontWeight: "800", color }}>{clamped}%</Text>
    </View>
  )
}

// ── Section header ─────────────────────────────────────────────────────────────
const SectionHeader = ({ icon, title, color, colors }: any) => (
  <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14, marginTop: 8 }}>
    <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: color + "22", alignItems: "center", justifyContent: "center" }}>
      <Ionicons name={icon} size={17} color={color} />
    </View>
    <Text style={{ fontSize: 17, fontWeight: "800", color: colors.text }}>{title}</Text>
  </View>
)

// ── Stat card ─────────────────────────────────────────────────────────────────
const StatCard = ({ label, value, sub, color, colors, isDark }: any) => (
  <View style={{
    flex: 1, borderRadius: 14, padding: 14, alignItems: "center",
    backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "#fff",
    borderWidth: 1, borderColor: isDark ? "rgba(255,255,255,0.08)" : "#E5E7EB",
    gap: 4,
  }}>
    <Text style={{ fontSize: 11, color: colors.textMuted, fontWeight: "600", textAlign: "center" }}>{label}</Text>
    <Text style={{ fontSize: 22, fontWeight: "800", color }}>{value}</Text>
    {sub ? <Text style={{ fontSize: 10, color: colors.textMuted, textAlign: "center" }}>{sub}</Text> : null}
  </View>
)

// ─────────────────────────────────────────────────────────────────────────────
// Main screen
// ─────────────────────────────────────────────────────────────────────────────
export default function ReportScreen() {
  const { colors, activeTheme } = useTheme()
  const { user }    = useAuth()
  const route       = useRoute<ReportRouteProp>()
  const navigation  = useNavigation<ReportNavProp>()
  const isDark      = activeTheme === "dark"

  const initialPeriod = route.params?.period ?? "daily"
  const [activePeriod, setActivePeriod] = useState<ReportPeriod>(initialPeriod)
  const [report, setReport]             = useState<ReportData | null>(null)
  const [loading, setLoading]           = useState(true)
  const [saving,  setSaving]            = useState(false)
  const fadeAnim  = useRef(new Animated.Value(0)).current
  const slideAnim = useRef(new Animated.Value(24)).current

  const ACCENT       = isDark ? "#818CF8" : "#4F46E5"
  const ACCENT_GREEN = isDark ? "#34D399" : "#059669"
  const ACCENT_AMBER = "#F59E0B"

  useEffect(() => { loadReport(activePeriod) }, [activePeriod, user])

  const loadReport = async (period: ReportPeriod) => {
    if (!user?.id) return
    setLoading(true)
    fadeAnim.setValue(0); slideAnim.setValue(24)
    try {
      // If opened from Analytics with a storedReportId, load that saved report
      const storedReportId = (route.params as any)?.storedReportId as string | undefined
      if (storedReportId) {
        const { data, error } = await supabase
          .from("reports")
          .select("*")
          .eq("id", storedReportId)
          .single()
        if (!error && data) {
          setReport(data.report_data as ReportData)
          Animated.parallel([
            Animated.timing(fadeAnim,  { toValue: 1, duration: 500, useNativeDriver: true }),
            Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 60, friction: 10 }),
          ]).start()
          return
        }
      }
      // Otherwise build live report from current data
      const [tasks, goals] = await Promise.all([
        getTasks(user.id),
        getGoals(user.id),
      ])
      const r = buildReport(period, tasks, goals)
      setReport(r)
      Animated.parallel([
        Animated.timing(fadeAnim,  { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 60, friction: 10 }),
      ]).start()
    } catch (e) {
      console.warn("[Report] Error loading:", e)
    } finally {
      setLoading(false)
    }
  }

  const switchPeriod = (p: ReportPeriod) => {
    if (p === activePeriod) return
    setActivePeriod(p)
  }

  const handleDownload = async () => {
    if (!report) return
    setSaving(true)
    try {
      const periodLabel = activePeriod.charAt(0).toUpperCase() + activePeriod.slice(1)
      const dateStr     = new Date().toISOString().split("T")[0]
      const genTime     = new Date(report.generatedAt).toLocaleString("en-US", {
        month: "short", day: "numeric", year: "numeric",
        hour: "numeric", minute: "2-digit", hour12: true,
      })

      const tasksByTypeRows = report.tasks.byType.map((t) => {
        const pct = t.total > 0 ? Math.round((t.completed / t.total) * 100) : 0
        return `<tr><td>${t.type}</td><td style="text-align:center">${t.completed}/${t.total}</td><td><div style="background:#e5e7eb;border-radius:4px;height:8px;overflow:hidden"><div style="background:#4F46E5;height:8px;width:${pct}%"></div></div><span style="font-size:10px;color:#6b7280">${pct}%</span></td></tr>`
      }).join("")

      const completedTaskRows = report.tasks.highlighted.map((t) =>
        `<tr><td>&#10003; ${t.taskName}</td><td style="color:#6b7280">${t.taskType}</td><td style="color:#6b7280">${t.scheduledDate}</td></tr>`
      ).join("")

      const goalRows = report.goals.recentlyFunded.map((g) => {
        const pct = g.targetAmount > 0 ? Math.round((g.currentAmount / g.targetAmount) * 100) : 0
        const bc  = pct >= 75 ? "#10B981" : pct >= 40 ? "#F59E0B" : "#EF4444"
        return `<tr><td><strong>${g.goalName}</strong>${g.goalType ? `<br><span style="font-size:11px;color:#6b7280">${g.goalType}</span>` : ""}</td><td style="text-align:right;color:#10B981;font-weight:700">Rs ${g.currentAmount.toLocaleString()}</td><td style="text-align:right;color:#6b7280">Rs ${g.targetAmount.toLocaleString()}</td><td style="text-align:center"><div style="background:#e5e7eb;border-radius:4px;height:8px;min-width:50px;overflow:hidden"><div style="background:${bc};height:8px;width:${pct}%"></div></div><span style="font-size:10px;color:${bc};font-weight:700">${pct}%</span></td></tr>`
      }).join("")

      const achievedRows = report.goals.completedGoals.map((g) =>
        `<tr><td>&#127942; ${g.goalName}</td><td style="color:#10B981;font-weight:700">Rs ${g.currentAmount.toLocaleString()}</td><td style="color:#6b7280">${g.goalType ?? ""}</td></tr>`
      ).join("")

      const atRiskRows = report.goals.atRisk.map((g) => {
        const pct = g.targetAmount > 0 ? Math.round((g.currentAmount / g.targetAmount) * 100) : 0
        const dl  = g.deadline ? Math.ceil((new Date(g.deadline).getTime() - Date.now()) / 86400000) : null
        return `<tr><td style="color:#EF4444">&#9888; ${g.goalName}</td><td style="text-align:center;color:#EF4444">${pct}%</td><td style="text-align:center;color:#EF4444">${dl !== null ? dl + "d" : "-"}</td></tr>`
      }).join("")

      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,Helvetica,Arial,sans-serif;background:#f9fafb;color:#111827}
.page{max-width:720px;margin:0 auto;padding:32px 28px;background:#fff}
.header{background:linear-gradient(135deg,#4F46E5,#7C3AED);border-radius:16px;padding:28px 24px;color:#fff;margin-bottom:24px}
.header h1{font-size:24px;font-weight:800;margin-bottom:4px}
.header p{font-size:13px;opacity:.8}
.meta{display:flex;gap:12px;margin-top:16px;flex-wrap:wrap}
.meta-item{background:rgba(255,255,255,.15);border-radius:10px;padding:8px 14px;font-size:12px;text-align:center}
.meta-item strong{display:block;font-size:18px;font-weight:800}
.insight{background:#EEF2FF;border-left:4px solid #4F46E5;border-radius:10px;padding:14px 16px;margin-bottom:24px;font-size:13px;color:#3730a3;line-height:1.6}
.section{margin-bottom:28px}
.section-title{font-size:16px;font-weight:800;margin-bottom:14px;padding-bottom:8px;border-bottom:2px solid #e5e7eb}
.stats{display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap}
.stat{flex:1;min-width:80px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:12px;padding:12px;text-align:center}
.stat .lbl{font-size:10px;color:#6b7280;font-weight:600;margin-bottom:4px}
.stat .val{font-size:20px;font-weight:800}
.savings{background:#ECFDF5;border:1px solid #6EE7B7;border-radius:14px;padding:18px;margin-bottom:16px}
.srow{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(0,0,0,.05);font-size:13px}
.srow:last-child{border-bottom:none}
.pbar-wrap{background:#BBF7D0;border-radius:6px;height:10px;margin-top:14px;overflow:hidden}
.pbar-fill{background:#10B981;height:10px;border-radius:6px}
table{width:100%;border-collapse:collapse;font-size:13px;margin-top:12px}
th{background:#f3f4f6;font-size:10px;font-weight:700;text-transform:uppercase;color:#6b7280;padding:8px 10px;text-align:left}
td{padding:9px 10px;border-bottom:1px solid #f3f4f6;vertical-align:middle}
tr:last-child td{border-bottom:none}
.risk{background:#FEF2F2;border:1px solid #FECACA;border-radius:12px;padding:14px;margin-bottom:16px}
.risk-title{font-size:13px;font-weight:700;color:#EF4444;margin-bottom:10px}
.footer{text-align:center;font-size:11px;color:#9ca3af;margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb}
</style></head><body><div class="page">

<div class="header">
  <h1>&#128202; AlphaAssist ${periodLabel} Report</h1>
  <p>${report.dateLabel} &nbsp;·&nbsp; Generated ${genTime}</p>
  <div class="meta">
    <div class="meta-item"><strong>${report.tasks.completionRate}%</strong>Task Rate</div>
    <div class="meta-item"><strong>${report.tasks.completed}/${report.tasks.total}</strong>Tasks Done</div>
    <div class="meta-item"><strong>${report.goals.progressPct}%</strong>Goals Funded</div>
    <div class="meta-item"><strong>Rs ${report.goals.totalSaved.toLocaleString()}</strong>Total Saved</div>
  </div>
</div>

<div class="insight">&#10024; ${report.insight}</div>

<div class="section">
  <div class="section-title">&#9989; Tasks</div>
  <div class="stats">
    <div class="stat"><div class="lbl">Total</div><div class="val" style="color:#111827">${report.tasks.total}</div></div>
    <div class="stat"><div class="lbl">Completed</div><div class="val" style="color:#10B981">${report.tasks.completed}</div></div>
    <div class="stat"><div class="lbl">Pending</div><div class="val" style="color:#F59E0B">${report.tasks.pending}</div></div>
    <div class="stat"><div class="lbl">Overdue</div><div class="val" style="color:${report.tasks.overdue > 0 ? "#EF4444" : "#9ca3af"}">${report.tasks.overdue}</div></div>
    <div class="stat"><div class="lbl">Rate</div><div class="val" style="color:#4F46E5">${report.tasks.completionRate}%</div></div>
  </div>
  ${tasksByTypeRows ? `<table><tr><th>Type</th><th style="text-align:center">Done</th><th>Progress</th></tr>${tasksByTypeRows}</table>` : ""}
  ${completedTaskRows ? `<table style="margin-top:16px"><tr><th>Completed Tasks</th><th>Type</th><th>Date</th></tr>${completedTaskRows}</table>` : ""}
</div>

<div class="section">
  <div class="section-title">&#127988; Goals</div>
  <div class="stats">
    <div class="stat"><div class="lbl">Total</div><div class="val" style="color:#111827">${report.goals.total}</div></div>
    <div class="stat"><div class="lbl">Active</div><div class="val" style="color:#4F46E5">${report.goals.active}</div></div>
    <div class="stat"><div class="lbl">Achieved</div><div class="val" style="color:#10B981">${report.goals.completedGoals.length}</div></div>
    <div class="stat"><div class="lbl">Avg Funded</div><div class="val" style="color:#F59E0B">${report.goals.avgProgress}%</div></div>
  </div>
  <div class="savings">
    <strong style="font-size:14px;color:#065f46">&#128176; Savings Overview</strong>
    <div style="margin-top:12px">
      <div class="srow"><span>Total Saved</span><strong style="color:#10B981">Rs ${report.goals.totalSaved.toLocaleString()}</strong></div>
      <div class="srow"><span>Total Target</span><strong>Rs ${report.goals.totalTarget.toLocaleString()}</strong></div>
      <div class="srow"><span>Still Needed</span><strong style="color:#F59E0B">Rs ${report.goals.totalRemaining.toLocaleString()}</strong></div>
    </div>
    <div class="pbar-wrap"><div class="pbar-fill" style="width:${report.goals.progressPct}%"></div></div>
    <div style="font-size:11px;color:#6b7280;text-align:right;margin-top:4px">${report.goals.progressPct}% of total target funded</div>
  </div>
  ${goalRows ? `<table><tr><th>Goal</th><th style="text-align:right">Saved</th><th style="text-align:right">Target</th><th style="text-align:center">Progress</th></tr>${goalRows}</table>` : ""}
  ${atRiskRows ? `<div class="risk" style="margin-top:16px"><div class="risk-title">&#9888; Needs Attention</div><table><tr><th>Goal</th><th style="text-align:center">Funded</th><th style="text-align:center">Days Left</th></tr>${atRiskRows}</table></div>` : ""}
  ${achievedRows ? `<table style="margin-top:16px"><tr><th>&#127942; Achieved Goals</th><th>Amount Saved</th><th>Type</th></tr>${achievedRows}</table>` : ""}
</div>

<div class="footer">AlphaAssist &nbsp;·&nbsp; ${periodLabel} Report &nbsp;·&nbsp; ${genTime}</div>
</div></body></html>`

      // expo-print generates the PDF and returns a temp URI directly
      const { uri: pdfUri } = await Print.printToFileAsync({ html, base64: false })

      const canShare = await Sharing.isAvailableAsync()
      if (canShare) {
        await Sharing.shareAsync(pdfUri, {
          mimeType: "application/pdf",
          dialogTitle: `Save ${periodLabel} Report`,
          UTI: "com.adobe.pdf",
        })
      } else {
        Alert.alert("Saved", "PDF has been generated successfully.")
      }
    } catch (err) {
      console.warn("[Report] Download error:", err)
      Alert.alert("Error", "Could not generate PDF. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  const PERIODS: { key: ReportPeriod; label: string; icon: string }[] = [
    { key: "daily",   label: "Daily",   icon: "today-outline" },
    { key: "weekly",  label: "Weekly",  icon: "calendar-outline" },
    { key: "monthly", label: "Monthly", icon: "calendar-number-outline" },
  ]

  const s = styles(colors, isDark)

  return (
    <SafeAreaView edges={["left", "right", "bottom"]} style={s.container}>

      {/* ── Header ── */}
      <LinearGradient
        colors={isDark ? ["#0f0c29", "#1a1040"] : ["#4F46E5", "#7C3AED"]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={s.header}
      >
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Reports</Text>
          {report && <Text style={s.headerSub}>{report.dateLabel}</Text>}
        </View>
        <TouchableOpacity
          style={[s.headerIcon, saving && { opacity: 0.5 }]}
          onPress={handleDownload}
          disabled={saving || !report}
          activeOpacity={0.8}
        >
          <Ionicons name={saving ? "hourglass-outline" : "download-outline"} size={22} color="#fff" />
        </TouchableOpacity>
      </LinearGradient>

      {/* ── Period tabs ── */}
      <View style={[s.periodRow, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
        {PERIODS.map((p) => {
          const active = p.key === activePeriod
          return (
            <TouchableOpacity
              key={p.key}
              onPress={() => switchPeriod(p.key)}
              style={[s.periodTab, active && { backgroundColor: ACCENT }]}
              activeOpacity={0.8}
            >
              <Ionicons name={p.icon as any} size={14} color={active ? "#fff" : colors.textMuted} />
              <Text style={[s.periodTabText, { color: active ? "#fff" : colors.textMuted }]}>{p.label}</Text>
            </TouchableOpacity>
          )
        })}
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name="hourglass-outline" size={40} color={colors.textMuted} />
          <Text style={{ color: colors.textMuted, marginTop: 12, fontSize: 15 }}>Generating report…</Text>
        </View>
      ) : !report ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: colors.textMuted }}>Could not load report.</Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
        >
          <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>

            {/* ── Insight banner ── */}
            <LinearGradient
              colors={isDark ? ["#1a1040", "#0f0c29"] : ["#EEF2FF", "#F5F3FF"]}
              style={[s.insightCard, { borderColor: isDark ? "rgba(129,140,248,0.3)" : "#C7D2FE" }]}
            >
              <View style={s.insightIconWrap}>
                <Ionicons name="sparkles" size={18} color={ACCENT} />
              </View>
              <Text style={[s.insightText, { color: colors.text }]}>{report.insight}</Text>
            </LinearGradient>

            {/* ── Tasks section ── */}
            <SectionHeader icon="checkmark-done-outline" title="Tasks" color={ACCENT} colors={colors} />

            {/* Stats row */}
            <View style={{ flexDirection: "row", gap: 10, marginBottom: 16 }}>
              <StatCard label="Total"     value={report.tasks.total}          color={colors.text}   colors={colors} isDark={isDark} />
              <StatCard label="Completed" value={report.tasks.completed}       color={ACCENT_GREEN}  colors={colors} isDark={isDark} />
              <StatCard label="Pending"   value={report.tasks.pending}         color={ACCENT_AMBER}  colors={colors} isDark={isDark} />
              <StatCard label="Overdue"   value={report.tasks.overdue}
                color={report.tasks.overdue > 0 ? "#EF4444" : colors.textMuted}
                colors={colors} isDark={isDark}
              />
            </View>

            {/* Completion ring + by-type breakdown */}
            <View style={[s.card, { flexDirection: "row", alignItems: "center", gap: 16 }]}>
              <View style={{ alignItems: "center", gap: 6 }}>
                <Ring pct={report.tasks.completionRate} color={ACCENT} bg={isDark ? "#1e3a5f" : "#DDD6FE"} />
                <Text style={{ fontSize: 11, color: colors.textMuted }}>completion</Text>
              </View>
              <View style={{ flex: 1, gap: 8 }}>
                {report.tasks.byType.length === 0 ? (
                  <Text style={{ color: colors.textMuted, fontSize: 13 }}>No tasks this period.</Text>
                ) : report.tasks.byType.map((row) => (
                  <View key={row.type}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                      <Text style={{ fontSize: 12, fontWeight: "600", color: colors.text }}>{row.type}</Text>
                      <Text style={{ fontSize: 12, color: colors.textMuted }}>{row.completed}/{row.total}</Text>
                    </View>
                    <View style={{ height: 5, backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "#E5E7EB", borderRadius: 3, overflow: "hidden" }}>
                      <View style={{
                        height: "100%", borderRadius: 3, backgroundColor: ACCENT,
                        width: `${row.total > 0 ? Math.round((row.completed / row.total) * 100) : 0}%`,
                      }} />
                    </View>
                  </View>
                ))}
              </View>
            </View>

            {/* Completed task list */}
            {report.tasks.highlighted.length > 0 && (
              <View style={[s.card, { gap: 10 }]}>
                <Text style={{ fontSize: 13, fontWeight: "700", color: colors.text, marginBottom: 2 }}>
                  ✅ Completed Tasks
                </Text>
                {report.tasks.highlighted.map((t) => (
                  <View key={t.id} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <Ionicons name="checkmark-circle" size={16} color={ACCENT_GREEN} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 13, fontWeight: "600", color: colors.text }} numberOfLines={1}>{t.taskName}</Text>
                      <Text style={{ fontSize: 11, color: colors.textMuted }}>{t.taskType} · {t.scheduledDate}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* ── Goals section ── */}
            <SectionHeader icon="flag-outline" title="Goals" color={ACCENT_GREEN} colors={colors} />

            {report.goals.total === 0 ? (
              <View style={[s.card, { alignItems: "center", paddingVertical: 28, gap: 8 }]}>
                <Ionicons name="flag-outline" size={32} color={colors.textMuted} />
                <Text style={{ color: colors.textMuted, fontSize: 14 }}>No goals created yet.</Text>
              </View>
            ) : (
              <>
                {/* ── 4 stat cards ── */}
                <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
                  <StatCard label="Total"     value={report.goals.total}                        color={colors.text}  colors={colors} isDark={isDark} />
                  <StatCard label="Active"    value={report.goals.active}                       color={ACCENT}       colors={colors} isDark={isDark} />
                  <StatCard label="Achieved"  value={report.goals.completedGoals.length}        color={ACCENT_GREEN} colors={colors} isDark={isDark} />
                  <StatCard label="Avg"       value={`${report.goals.avgProgress}%`}            color={ACCENT_AMBER} colors={colors} isDark={isDark} />
                </View>

                {/* ── Savings overview card ── */}
                <LinearGradient
                  colors={isDark ? ["#0f1f17", "#162e22"] : ["#ECFDF5", "#D1FAE5"]}
                  style={[s.card, { borderColor: isDark ? "#065f46" : "#6EE7B7", gap: 14 }]}
                >
                  <Text style={{ fontSize: 13, fontWeight: "700", color: colors.text }}>💰 Savings Overview</Text>

                  {/* Ring + three amounts */}
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
                    <View style={{ alignItems: "center", gap: 4 }}>
                      <Ring pct={report.goals.progressPct} color={ACCENT_GREEN} bg={isDark ? "#065f46" : "#6EE7B7"} size={80} />
                      <Text style={{ fontSize: 10, color: colors.textMuted }}>funded</Text>
                    </View>
                    <View style={{ flex: 1, gap: 10 }}>
                      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                        <Text style={{ fontSize: 12, color: colors.textMuted }}>Total Saved</Text>
                        <Text style={{ fontSize: 15, fontWeight: "800", color: ACCENT_GREEN }}>{formatPKR(report.goals.totalSaved)}</Text>
                      </View>
                      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                        <Text style={{ fontSize: 12, color: colors.textMuted }}>Total Target</Text>
                        <Text style={{ fontSize: 14, fontWeight: "700", color: colors.text }}>{formatPKR(report.goals.totalTarget)}</Text>
                      </View>
                      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                        <Text style={{ fontSize: 12, color: colors.textMuted }}>Still Needed</Text>
                        <Text style={{ fontSize: 14, fontWeight: "700", color: ACCENT_AMBER }}>{formatPKR(report.goals.totalRemaining)}</Text>
                      </View>
                    </View>
                  </View>

                  {/* Full-width progress bar */}
                  <View style={{ height: 8, backgroundColor: isDark ? "rgba(255,255,255,0.10)" : "#BBF7D0", borderRadius: 4, overflow: "hidden" }}>
                    <View style={{ height: "100%", width: `${report.goals.progressPct}%`, backgroundColor: ACCENT_GREEN, borderRadius: 4 }} />
                  </View>
                  <Text style={{ fontSize: 11, color: colors.textMuted, textAlign: "right", marginTop: -8 }}>
                    {report.goals.progressPct}% of total target funded across {report.goals.total} goal{report.goals.total !== 1 ? "s" : ""}
                  </Text>
                </LinearGradient>

                {/* ── Individual goal progress ── */}
                {report.goals.recentlyFunded.length > 0 && (
                  <View style={[s.card, { gap: 16 }]}>
                    <Text style={{ fontSize: 13, fontWeight: "700", color: colors.text }}>📊 Each Goal at a Glance</Text>
                    {report.goals.recentlyFunded.map((g) => {
                      const pct = g.targetAmount > 0 ? Math.round((g.currentAmount / g.targetAmount) * 100) : 0
                      const remaining = g.targetAmount - g.currentAmount
                      const daysLeft  = g.deadline
                        ? Math.ceil((new Date(g.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                        : null
                      const barColor  = pct >= 75 ? ACCENT_GREEN : pct >= 40 ? ACCENT_AMBER : "#EF4444"
                      return (
                        <View key={g.id} style={{ gap: 7 }}>
                          {/* Name + type + % */}
                          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                            <View style={{ flex: 1, gap: 1 }}>
                              <Text style={{ fontSize: 13, fontWeight: "700", color: colors.text }} numberOfLines={1}>{g.goalName}</Text>
                              {g.goalType ? <Text style={{ fontSize: 11, color: colors.textMuted }}>{g.goalType}</Text> : null}
                            </View>
                            <View style={{ alignItems: "flex-end", gap: 1 }}>
                              <Text style={{ fontSize: 14, fontWeight: "800", color: barColor }}>{pct}%</Text>
                              {daysLeft !== null && (
                                <Text style={{ fontSize: 10, color: daysLeft <= 7 ? "#EF4444" : colors.textMuted }}>
                                  {daysLeft > 0 ? `${daysLeft}d left` : daysLeft === 0 ? "Due today" : "Overdue"}
                                </Text>
                              )}
                            </View>
                          </View>
                          {/* Progress bar */}
                          <View style={{ height: 7, backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "#E5E7EB", borderRadius: 4, overflow: "hidden" }}>
                            <View style={{ height: "100%", width: `${pct}%`, borderRadius: 4, backgroundColor: barColor }} />
                          </View>
                          {/* Amounts */}
                          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                            <Text style={{ fontSize: 11, color: ACCENT_GREEN, fontWeight: "600" }}>Saved {formatPKR(g.currentAmount)}</Text>
                            <Text style={{ fontSize: 11, color: colors.textMuted }}>
                              {remaining > 0 ? `${formatPKR(remaining)} to go` : "Target reached 🎉"}
                            </Text>
                          </View>
                        </View>
                      )
                    })}
                  </View>
                )}

                {/* ── At risk goals ── */}
                {report.goals.atRisk.length > 0 && (
                  <View style={[s.card, { gap: 12, borderColor: isDark ? "rgba(239,68,68,0.35)" : "#FECACA" }]}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: "rgba(239,68,68,0.12)", alignItems: "center", justifyContent: "center" }}>
                        <Ionicons name="warning-outline" size={15} color="#EF4444" />
                      </View>
                      <Text style={{ fontSize: 13, fontWeight: "700", color: "#EF4444" }}>⚠️ Needs Attention</Text>
                    </View>
                    <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: -6 }}>
                      These goals have a deadline within 30 days but are less than 50% funded.
                    </Text>
                    {report.goals.atRisk.map((g) => {
                      const pct = g.targetAmount > 0 ? Math.round((g.currentAmount / g.targetAmount) * 100) : 0
                      const daysLeft = g.deadline
                        ? Math.ceil((new Date(g.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                        : null
                      const needed = g.targetAmount - g.currentAmount
                      return (
                        <View key={g.id} style={{
                          flexDirection: "row", alignItems: "center", gap: 12,
                          backgroundColor: isDark ? "rgba(239,68,68,0.06)" : "#FEF2F2",
                          borderRadius: 12, padding: 12,
                        }}>
                          <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: "rgba(239,68,68,0.12)", alignItems: "center", justifyContent: "center" }}>
                            <Text style={{ fontSize: 13, fontWeight: "800", color: "#EF4444" }}>{pct}%</Text>
                          </View>
                          <View style={{ flex: 1, gap: 3 }}>
                            <Text style={{ fontSize: 13, fontWeight: "700", color: colors.text }} numberOfLines={1}>{g.goalName}</Text>
                            <Text style={{ fontSize: 11, color: "#EF4444" }}>
                              {daysLeft !== null ? `${daysLeft} days left` : ""}
                              {daysLeft !== null && " · "}
                              {formatPKR(needed)} still needed
                            </Text>
                          </View>
                        </View>
                      )
                    })}
                  </View>
                )}

                {/* ── Deadline this week ── */}
                {report.goals.nearDeadline.length > 0 && (
                  <View style={[s.card, { gap: 12, borderColor: isDark ? "rgba(245,158,11,0.35)" : "#FDE68A" }]}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: "rgba(245,158,11,0.12)", alignItems: "center", justifyContent: "center" }}>
                        <Ionicons name="time-outline" size={15} color={ACCENT_AMBER} />
                      </View>
                      <Text style={{ fontSize: 13, fontWeight: "700", color: ACCENT_AMBER }}>🕐 Due This Week</Text>
                    </View>
                    {report.goals.nearDeadline.map((g) => {
                      const pct = g.targetAmount > 0 ? Math.round((g.currentAmount / g.targetAmount) * 100) : 0
                      const daysLeft = g.deadline
                        ? Math.ceil((new Date(g.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                        : null
                      const needed = g.targetAmount - g.currentAmount
                      return (
                        <View key={g.id} style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                          <Ring pct={pct} size={50} color={ACCENT_AMBER} bg={isDark ? "#78350f" : "#FCD34D"} />
                          <View style={{ flex: 1, gap: 3 }}>
                            <Text style={{ fontSize: 13, fontWeight: "700", color: colors.text }} numberOfLines={1}>{g.goalName}</Text>
                            <Text style={{ fontSize: 11, color: ACCENT_AMBER, fontWeight: "600" }}>
                              {daysLeft === 0 ? "Due today!" : daysLeft === 1 ? "Due tomorrow!" : `${daysLeft} days left`}
                            </Text>
                            <Text style={{ fontSize: 11, color: colors.textMuted }}>
                              {needed > 0 ? `${formatPKR(needed)} still needed` : "Fully funded ✅"}
                            </Text>
                          </View>
                        </View>
                      )
                    })}
                  </View>
                )}

                {/* ── Achieved goals ── */}
                {report.goals.completedGoals.length > 0 && (
                  <View style={[s.card, { gap: 12, borderColor: isDark ? "rgba(52,211,153,0.25)" : "#6EE7B7" }]}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: "rgba(52,211,153,0.12)", alignItems: "center", justifyContent: "center" }}>
                        <Ionicons name="trophy-outline" size={15} color={ACCENT_GREEN} />
                      </View>
                      <Text style={{ fontSize: 13, fontWeight: "700", color: ACCENT_GREEN }}>🏆 Achieved Goals</Text>
                    </View>
                    {report.goals.completedGoals.slice(0, 5).map((g) => (
                      <View key={g.id} style={{
                        flexDirection: "row", alignItems: "center", gap: 12,
                        backgroundColor: isDark ? "rgba(52,211,153,0.06)" : "#F0FDF4",
                        borderRadius: 12, padding: 12,
                      }}>
                        <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(52,211,153,0.15)", alignItems: "center", justifyContent: "center" }}>
                          <Ionicons name="checkmark-circle" size={22} color={ACCENT_GREEN} />
                        </View>
                        <View style={{ flex: 1, gap: 2 }}>
                          <Text style={{ fontSize: 13, fontWeight: "700", color: colors.text }} numberOfLines={1}>{g.goalName}</Text>
                          <Text style={{ fontSize: 12, color: ACCENT_GREEN, fontWeight: "600" }}>{formatPKR(g.currentAmount)} · Goal achieved! 🎉</Text>
                          {g.goalType ? <Text style={{ fontSize: 11, color: colors.textMuted }}>{g.goalType}</Text> : null}
                        </View>
                      </View>
                    ))}
                  </View>
                )}
              </>
            )}
            {/* ── Generated at ── */}
            <Text style={{ textAlign: "center", fontSize: 11, color: colors.textMuted, marginTop: 20 }}>
              Report generated · {new Date(report.generatedAt).toLocaleString("en-US", {
                month: "short", day: "numeric", hour: "numeric", minute: "2-digit", hour12: true,
              })}
            </Text>

          </Animated.View>
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

const styles = (colors: any, isDark: boolean) => StyleSheet.create({
  container:     { flex: 1, backgroundColor: colors.background },
  header:        { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 52, paddingBottom: 20, gap: 12 },
  backBtn:       { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  headerTitle:   { fontSize: 22, fontWeight: "800", color: "#fff" },
  headerSub:     { fontSize: 13, color: "rgba(255,255,255,0.7)", marginTop: 2 },
  headerIcon:    { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  periodRow:     { flexDirection: "row", padding: 6, gap: 6, borderBottomWidth: 1 },
  periodTab:     { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 9, borderRadius: 10 },
  periodTabText: { fontSize: 13, fontWeight: "600" },
  insightCard:   { flexDirection: "row", alignItems: "flex-start", gap: 12, borderRadius: 16, padding: 16, marginBottom: 20, borderWidth: 1 },
  insightIconWrap:{ width: 32, height: 32, borderRadius: 10, backgroundColor: "rgba(129,140,248,0.15)", alignItems: "center", justifyContent: "center", marginTop: 1 },
  insightText:   { flex: 1, fontSize: 14, lineHeight: 21, fontWeight: "500" },
  card:          {
    backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "#fff",
    borderRadius: 16, padding: 16, marginBottom: 14,
    borderWidth: 1, borderColor: isDark ? "rgba(255,255,255,0.08)" : "#E5E7EB",
  },
})