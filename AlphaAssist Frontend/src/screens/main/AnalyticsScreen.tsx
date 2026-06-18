"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Dimensions,
  RefreshControl,
  Alert,
  Animated,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { LinearGradient } from "expo-linear-gradient"
import { useRoute, useNavigation, useFocusEffect } from "@react-navigation/native"
import type { StackNavigationProp } from "@react-navigation/stack"
import type { RouteProp } from "@react-navigation/native"
import type { MainStackParamList } from "../../types/navigation"
import { Ionicons } from "@expo/vector-icons"
import * as Haptics from "expo-haptics"

import Header from "../../components/common/Header"
import { useTheme } from "../../components/context/ThemeContext"
import { useAuth } from "../../hooks/useAuth"
import GoalCard from "../../components/goal/GoalCard"
import TaskCard from "../../components/task/TaskCard"
import AddMoneyModal from "../../components/goal/AddMoneyModal"
import NewGoalModal from "../modals/NewGoalModal"
import TaskSchedulingModal from "../modals/TaskSchedulingModal"
import { getGoals, deleteGoal, completeGoal, type GoalFrontend } from "../../services/goals"
import {
  getTasks,
  deleteTask,
  completeTask,
  type TaskFrontend,
} from "../../services/tasks"
import { fireTaskCompletedNotification } from "../../services/notifications"
import { getLatestReports, type StoredReport } from "../../services/reports"
import { formatPKR } from "../../utils/currency"
import { supabase } from "../../services/supabase"

const { width } = Dimensions.get("window")

type AnalyticsScreenRouteProp = RouteProp<MainStackParamList, "Analytics">
type AnalyticsScreenNavigationProp = StackNavigationProp<MainStackParamList, "Analytics">

// ── Circular progress ring component ──────────────────────────────────────────
const ProgressRing = ({
  percentage,
  size = 80,
  strokeWidth = 7,
  color,
  bg,
}: {
  percentage: number
  size?: number
  strokeWidth?: number
  color: string
  bg: string
}) => {
  const animatedValue = useRef(new Animated.Value(0)).current
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const clampedPct = Math.min(100, Math.max(0, percentage))

  useEffect(() => {
    Animated.timing(animatedValue, {
      toValue: clampedPct,
      duration: 900,
      useNativeDriver: false,
    }).start()
  }, [clampedPct])

  const strokeDashoffset = animatedValue.interpolate({
    inputRange: [0, 100],
    outputRange: [circumference, 0],
  })

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <View
        style={{
          position: "absolute",
          width: size, height: size,
          borderRadius: size / 2,
          borderWidth: strokeWidth,
          borderColor: bg,
        }}
      />
      <View
        style={{
          position: "absolute",
          width: size, height: size,
          borderRadius: size / 2,
          borderWidth: strokeWidth,
          borderColor: color,
          borderBottomColor: clampedPct < 25 ? "transparent" : color,
          borderLeftColor:   clampedPct < 50 ? "transparent" : color,
          borderTopColor:    clampedPct < 75 ? "transparent" : color,
          transform: [{ rotate: "-45deg" }],
        }}
      />
      <Text style={{ fontSize: size * 0.22, fontWeight: "800", color }}>{clampedPct}%</Text>
    </View>
  )
}

// ── Stat pill ─────────────────────────────────────────────────────────────────
const StatPill = ({
  label, value, sub, colors, accent,
}: {
  label: string; value: string; sub?: string; colors: any; accent: string
}) => (
  <View style={[summaryStyles.pill, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
    <Text style={[summaryStyles.pillLabel, { color: colors.textSecondary }]}>{label}</Text>
    <Text style={[summaryStyles.pillValue, { color: accent }]}>{value}</Text>
    {sub ? <Text style={[summaryStyles.pillSub, { color: colors.textMuted }]}>{sub}</Text> : null}
  </View>
)

const summaryStyles = StyleSheet.create({
  pill:       { flex: 1, borderRadius: 14, padding: 14, alignItems: "center", borderWidth: 1 },
  pillLabel:  { fontSize: 11, fontWeight: "500", marginBottom: 6, textAlign: "center" },
  pillValue:  { fontSize: 20, fontWeight: "800" },
  pillSub:    { fontSize: 10, marginTop: 4, textAlign: "center" },
})

// ─────────────────────────────────────────────────────────────────────────────

const AnalyticsScreen = () => {
  const { colors, activeTheme } = useTheme()
  const { user } = useAuth()
  const route = useRoute<AnalyticsScreenRouteProp>()
  const navigation = useNavigation<AnalyticsScreenNavigationProp>()
  const isDark = activeTheme === "dark"

  const [activeTab, setActiveTab]           = useState<"Tasks" | "Goals">(route.params?.initialTab || "Tasks")
  const [goals, setGoals]                   = useState<GoalFrontend[]>([])
  const [tasks, setTasks]                   = useState<TaskFrontend[]>([])
  const [loading, setLoading]               = useState(true)
  const [refreshing, setRefreshing]         = useState(false)
  const [goalFilter, setGoalFilter]         = useState<"all" | "active" | "completed">("all")
  const [taskFilter, setTaskFilter]         = useState<"all" | "pending" | "in_progress" | "completed">("all")
  const [typeFilter, setTypeFilter]           = useState<string>("all")
  const [selectedGoal, setSelectedGoal]     = useState<GoalFrontend | null>(null)
  const [selectedTask, setSelectedTask]     = useState<TaskFrontend | null>(null)
  const [isAddMoneyModalOpen, setIsAddMoneyModalOpen] = useState(false)
  const [isNewGoalModalOpen, setIsNewGoalModalOpen]   = useState(false)
  const [isTaskModalOpen, setIsTaskModalOpen]         = useState(false)
  const [userName, setUserName]             = useState<string>("")
  const [storedReports, setStoredReports]   = useState<{ daily: StoredReport | null; weekly: StoredReport | null; monthly: StoredReport | null }>({ daily: null, weekly: null, monthly: null })
  const [reportsLoading, setReportsLoading] = useState(false)
  const [reportSheetVisible, setReportSheetVisible] = useState(false)
  const sheetAnim = useRef(new Animated.Value(0)).current

  const tabAnim   = useRef(new Animated.Value(activeTab === "Tasks" ? 0 : 1)).current
  const fadeAnims  = useRef([0, 1, 2, 3, 4].map(() => new Animated.Value(0))).current
  const slideAnims = useRef([0, 1, 2, 3, 4].map(() => new Animated.Value(20))).current

  useEffect(() => {
    fadeAnims.forEach((anim, i) => {
      Animated.parallel([
        Animated.timing(anim,         { toValue: 1, duration: 450, delay: i * 80, useNativeDriver: true }),
        Animated.timing(slideAnims[i],{ toValue: 0, duration: 450, delay: i * 80, useNativeDriver: true }),
      ]).start()
    })
  }, [])

  const animStyle = (i: number) => ({
    opacity:   fadeAnims[i],
    transform: [{ translateY: slideAnims[i] }],
  })

  const getCurrentDate = () =>
    new Date().toLocaleDateString("en-US", { day: "numeric", month: "long", year: "numeric" })

  const getGreeting = () => {
    const h = new Date().getHours()
    if (h < 12) return "Good Morning"
    if (h < 17) return "Good Afternoon"
    return "Good Evening"
  }

  const switchTab = (tab: "Tasks" | "Goals") => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setActiveTab(tab)
    Animated.spring(tabAnim, { toValue: tab === "Tasks" ? 0 : 1, useNativeDriver: false, tension: 60, friction: 10 }).start()
    if (tab === "Goals") loadGoals()
    else loadTasks()
  }

  useEffect(() => {
    if (route.params?.initialTab) setActiveTab(route.params.initialTab)
  }, [route.params?.initialTab])

  useEffect(() => {
    if (user?.id) {
      loadUserProfile()
      loadStoredReports()
      if (activeTab === "Goals") loadGoals()
      else loadTasks()
    }
  }, [activeTab, user])

  useFocusEffect(
    useCallback(() => {
      if (!user?.id) return
      if (activeTab === "Goals") loadGoals()
      else loadTasks()
    }, [user, activeTab])
  )

  const loadUserProfile = async () => {
    if (!user?.id) return
    try {
      const { data, error } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle()
      if (error && (error as any).code !== "PGRST116") { setUserName(user.email || "User"); return }
      setUserName(data?.full_name || user.email?.split("@")[0] || "User")
    } catch { setUserName(user.email?.split("@")[0] || "User") }
  }

  const loadStoredReports = async () => {
    if (!user?.id) return
    setReportsLoading(true)
    try {
      const reports = await getLatestReports(user.id)
      setStoredReports(reports)
    } catch (e) {
      console.warn("[Analytics] Failed to load stored reports:", e)
    } finally {
      setReportsLoading(false)
    }
  }

  const openReportSheet = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    setReportSheetVisible(true)
    Animated.spring(sheetAnim, { toValue: 1, useNativeDriver: true, tension: 65, friction: 11 }).start()
  }

  const closeReportSheet = () => {
    Animated.timing(sheetAnim, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => setReportSheetVisible(false))
  }

  const loadGoals = async () => {
    if (!user?.id) { setGoals([]); setLoading(false); return }
    try { setLoading(true); setGoals(await getGoals(user.id)) }
    catch { setGoals([]) }
    finally { setLoading(false); setRefreshing(false) }
  }

  const loadTasks = async () => {
    if (!user?.id) { setTasks([]); setLoading(false); return }
    try {
      setLoading(true)
      const fetched = await getTasks(user.id)
      // Newest first — sort by createdAt descending
      fetched.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      setTasks(fetched)
    } catch { setTasks([]) }
    finally { setLoading(false); setRefreshing(false) }
  }

  const onRefresh = () => {
    setRefreshing(true)
    if (activeTab === "Goals") loadGoals()
    else loadTasks()
  }

  // ── Goal handlers ─────────────────────────────────────────────────────────
  const handleAddMoney      = (goal: GoalFrontend) => { setSelectedGoal(goal); setIsAddMoneyModalOpen(true) }
  const handleMoneyAdded    = () => loadGoals()
  const handleDeleteGoal    = async (goalId: string) => {
    if (!user?.id) return
    try { await deleteGoal(goalId, user.id); loadGoals() }
    catch { Alert.alert("Error", "Failed to delete goal. Please try again.") }
  }
  const handleCompleteGoal  = async (goalId: string) => {
    if (!user?.id) return
    try { await completeGoal(goalId, user.id); loadGoals() }
    catch { Alert.alert("Error", "Failed to complete goal. Please try again.") }
  }

  // ── Task handlers ─────────────────────────────────────────────────────────
  const handleEditTask   = (task: TaskFrontend) => { setSelectedTask(task); setIsTaskModalOpen(true) }
  const handleDeleteTask = async (taskId: string) => {
    if (!user?.id) return
    try { await deleteTask(taskId, user.id); loadTasks() }
    catch { Alert.alert("Error", "Failed to delete task. Please try again.") }
  }

  // Receives full task object — needed for well-done notification
  const handleCompleteTask = async (task: TaskFrontend) => {
    if (!user?.id) return
    try {
      await completeTask(task.id, user.id)
      // Fire "Well Done!" immediately + cancel any pending follow-up
      await fireTaskCompletedNotification(task.taskName, task.id)
      loadTasks()
    }
    catch { Alert.alert("Error", "Failed to complete task. Please try again.") }
  }

  // ── Statistics ────────────────────────────────────────────────────────────
  const filteredGoals = goals.filter((g) => goalFilter === "all" || g.status === goalFilter)

  // Unique task types from actual user data
  const taskTypes = ["all", ...Array.from(new Set(tasks.map((t) => t.taskType))).sort()]

  const filteredTasks = tasks.filter((t) => {
    const statusMatch = taskFilter === "all" || t.status === taskFilter
    const typeMatch   = typeFilter  === "all" || t.taskType === typeFilter
    return statusMatch && typeMatch
  })

  const totalSavings       = goals.filter((g) => g.status === "active").reduce((s, g) => s + g.currentAmount, 0)
  const totalTarget        = goals.filter((g) => g.status === "active").reduce((s, g) => s + g.targetAmount, 0)
  const completedGoals     = goals.filter((g) => g.status === "completed").length
  const activeGoals        = goals.filter((g) => g.status === "active").length
  const overallProgress    = totalTarget > 0 ? Math.round((totalSavings / totalTarget) * 100) : 0
  const goalCompletionRate = goals.length > 0 ? Math.round((completedGoals / goals.length) * 100) : 0

  const completedTasks     = tasks.filter((t) => t.status === "completed").length
  const activeTasks        = tasks.filter((t) => t.status === "pending" || t.status === "in_progress").length
  const inProgressTasks    = tasks.filter((t) => t.status === "in_progress").length
  const totalTaskProgress  = tasks.length > 0
    ? Math.round(tasks.reduce((s, t) => s + t.progress, 0) / tasks.length) : 0
  const taskCompletionRate = tasks.length > 0 ? Math.round((completedTasks / tasks.length) * 100) : 0

  // Time-period completion breakdown
  const now         = new Date()
  const todayStr    = now.toISOString().split("T")[0]  // "YYYY-MM-DD"

  // Start of this week (Monday)
  const weekStart = new Date(now)
  weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7))
  weekStart.setHours(0, 0, 0, 0)
  const weekStartStr = weekStart.toISOString().split("T")[0]

  // Start of this month
  const monthStartStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`

  // Daily
  const dailyTotal     = tasks.filter((t) => t.scheduledDate === todayStr).length
  const dailyDone      = tasks.filter((t) => t.scheduledDate === todayStr && t.status === "completed").length
  const dailyPct       = dailyTotal > 0 ? Math.round((dailyDone / dailyTotal) * 100) : 0

  // Weekly
  const weeklyTotal    = tasks.filter((t) => t.scheduledDate >= weekStartStr && t.scheduledDate <= todayStr).length
  const weeklyDone     = tasks.filter((t) => t.scheduledDate >= weekStartStr && t.scheduledDate <= todayStr && t.status === "completed").length
  const weeklyPct      = weeklyTotal > 0 ? Math.round((weeklyDone / weeklyTotal) * 100) : 0

  // Monthly
  const monthlyTotal   = tasks.filter((t) => t.scheduledDate >= monthStartStr && t.scheduledDate <= todayStr).length
  const monthlyDone    = tasks.filter((t) => t.scheduledDate >= monthStartStr && t.scheduledDate <= todayStr && t.status === "completed").length
  const monthlyPct     = monthlyTotal > 0 ? Math.round((monthlyDone / monthlyTotal) * 100) : 0

  const tabIndicatorLeft = tabAnim.interpolate({ inputRange: [0, 1], outputRange: ["2%", "52%"] })

  const ACCENT       = isDark ? "#60A5FA" : "#4F46E5"
  const ACCENT_GREEN = isDark ? "#34D399" : "#059669"
  const styles = createStyles(colors, activeTheme)

  return (
    <SafeAreaView edges={["left", "right"]} style={styles.container}>
      <Header title="Analytics" />

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* ── Tab Switcher ── */}
        <Animated.View style={animStyle(0)}>
          <View style={[styles.tabWrapper, { backgroundColor: colors.backgroundTertiary, borderColor: colors.border }]}>
            <Animated.View style={[styles.tabIndicator, { left: tabIndicatorLeft, backgroundColor: colors.backgroundSecondary }]} />
            <TouchableOpacity style={styles.tab} onPress={() => switchTab("Tasks")}>
              <View style={styles.tabContent}>
                <Ionicons name="checkmark-done-outline" size={16} color={activeTab === "Tasks" ? colors.text : colors.textMuted} />
                <Text style={[styles.tabText, activeTab === "Tasks" && styles.activeTabText, { color: activeTab === "Tasks" ? colors.text : colors.textMuted }]}>
                  Tasks
                </Text>
                {activeTasks > 0 && (
                  <View style={[styles.badge, { backgroundColor: "#EF4444" }]}>
                    <Text style={styles.badgeText}>{activeTasks}</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={styles.tab} onPress={() => switchTab("Goals")}>
              <View style={styles.tabContent}>
                <Ionicons name="flag-outline" size={16} color={activeTab === "Goals" ? colors.text : colors.textMuted} />
                <Text style={[styles.tabText, activeTab === "Goals" && styles.activeTabText, { color: activeTab === "Goals" ? colors.text : colors.textMuted }]}>
                  Goals
                </Text>
                {activeGoals > 0 && (
                  <View style={[styles.badge, { backgroundColor: "#EF4444" }]}>
                    <Text style={styles.badgeText}>{activeGoals}</Text>
                  </View>
                )}
              </View>
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* ── Greeting ── */}
        <Animated.View style={[styles.greeting, animStyle(1)]}>
          <Text style={[styles.dateText,     { color: colors.textSecondary }]}>{getCurrentDate()}</Text>
          <Text style={[styles.greetingText, { color: colors.text }]}>
            {getGreeting()}, {userName || "User"} 👋
          </Text>
        </Animated.View>

        {/* ── Goals progress cards ── */}
        {activeTab === "Goals" && goals.length > 0 && (
          <Animated.View style={animStyle(2)}>
            <View style={styles.progressRow}>
              <LinearGradient
                colors={isDark ? ["#0f172a", "#1e293b"] : ["#EEF2FF", "#F5F3FF"]}
                style={[styles.progressCard, { borderColor: isDark ? "#1e3a5f" : "#DDD6FE" }]}
              >
                <Text style={[styles.progressCardTitle, { color: colors.textSecondary }]}>Savings Progress</Text>
                <ProgressRing percentage={overallProgress} color={ACCENT} bg={isDark ? "#1e3a5f" : "#DDD6FE"} />
                <Text style={[styles.progressCardSub,  { color: colors.textSecondary }]}>{formatPKR(totalSavings)}</Text>
                <Text style={[styles.progressCardMini, { color: colors.textMuted }]}>of {formatPKR(totalTarget)}</Text>
              </LinearGradient>
              <LinearGradient
                colors={isDark ? ["#0f1f17", "#162e22"] : ["#ECFDF5", "#D1FAE5"]}
                style={[styles.progressCard, { borderColor: isDark ? "#065f46" : "#6EE7B7" }]}
              >
                <Text style={[styles.progressCardTitle, { color: colors.textSecondary }]}>Completion Rate</Text>
                <ProgressRing percentage={goalCompletionRate} color={ACCENT_GREEN} bg={isDark ? "#065f46" : "#6EE7B7"} />
                <Text style={[styles.progressCardSub,  { color: colors.textSecondary }]}>{completedGoals} done</Text>
                <Text style={[styles.progressCardMini, { color: colors.textMuted }]}>of {goals.length} goals</Text>
              </LinearGradient>
            </View>
          </Animated.View>
        )}

        {/* ── Tasks recurrence rings ── */}
        {activeTab === "Tasks" && tasks.length > 0 && (
          <Animated.View style={animStyle(2)}>
            <View style={styles.progressRow}>
              <LinearGradient
                colors={isDark ? ["#0f172a", "#1e293b"] : ["#EEF2FF", "#F5F3FF"]}
                style={[styles.progressCard, { borderColor: isDark ? "#1e3a5f" : "#DDD6FE" }]}
              >
                <Text style={[styles.progressCardTitle, { color: colors.textSecondary }]}>Today</Text>
                <ProgressRing percentage={dailyPct} color={ACCENT} bg={isDark ? "#1e3a5f" : "#DDD6FE"} size={68} />
                <Text style={[styles.progressCardSub,  { color: colors.textSecondary }]}>{dailyDone}/{dailyTotal}</Text>
                <Text style={[styles.progressCardMini, { color: colors.textMuted }]}>completed</Text>
              </LinearGradient>
              <LinearGradient
                colors={isDark ? ["#0f1f17", "#162e22"] : ["#ECFDF5", "#D1FAE5"]}
                style={[styles.progressCard, { borderColor: isDark ? "#065f46" : "#6EE7B7" }]}
              >
                <Text style={[styles.progressCardTitle, { color: colors.textSecondary }]}>This Week</Text>
                <ProgressRing percentage={weeklyPct} color={ACCENT_GREEN} bg={isDark ? "#065f46" : "#6EE7B7"} size={68} />
                <Text style={[styles.progressCardSub,  { color: colors.textSecondary }]}>{weeklyDone}/{weeklyTotal}</Text>
                <Text style={[styles.progressCardMini, { color: colors.textMuted }]}>completed</Text>
              </LinearGradient>
              <LinearGradient
                colors={isDark ? ["#2d1b00", "#3d2600"] : ["#FFFBEB", "#FEF3C7"]}
                style={[styles.progressCard, { borderColor: isDark ? "#78350f" : "#FCD34D" }]}
              >
                <Text style={[styles.progressCardTitle, { color: colors.textSecondary }]}>This Month</Text>
                <ProgressRing percentage={monthlyPct} color="#F59E0B" bg={isDark ? "#78350f" : "#FCD34D"} size={68} />
                <Text style={[styles.progressCardSub,  { color: colors.textSecondary }]}>{monthlyDone}/{monthlyTotal}</Text>
                <Text style={[styles.progressCardMini, { color: colors.textMuted }]}>completed</Text>
              </LinearGradient>
            </View>
          </Animated.View>
        )}

        {/* ── Goals Tab ── */}
        {activeTab === "Goals" && (
          <Animated.View style={animStyle(3)}>
            <View style={styles.statsRow}>
              <StatPill label="Total Savings" value={formatPKR(totalSavings)} sub={`of ${formatPKR(totalTarget)}`} colors={colors} accent={ACCENT} />
              <StatPill label="Active"        value={String(activeGoals)}    colors={colors} accent={ACCENT} />
              <StatPill label="Completed"     value={String(completedGoals)} colors={colors} accent={ACCENT_GREEN} />
            </View>
            <FilterBar
              options={[{ key: "all", label: "All" }, { key: "active", label: "Active" }, { key: "completed", label: "Done" }]}
              active={goalFilter}
              onSelect={(k) => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setGoalFilter(k as any) }}
              colors={colors} accent={ACCENT}
            />
            <TouchableOpacity
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setIsNewGoalModalOpen(true) }}
              style={styles.createBtnWrap} activeOpacity={0.85}
            >
              <LinearGradient colors={isDark ? ["#1d4ed8", "#4f46e5"] : ["#4F46E5", "#7C3AED"]} start={{ x:0, y:0 }} end={{ x:1, y:0 }} style={styles.createBtn}>
                <Ionicons name="add-circle-outline" size={20} color="#fff" />
                <Text style={styles.createBtnText}>Create New Goal</Text>
              </LinearGradient>
            </TouchableOpacity>
            {loading ? (
              <EmptyState icon="hourglass-outline" text="Loading goals..." colors={colors} />
            ) : filteredGoals.length === 0 ? (
              <EmptyState
                icon={goalFilter === "completed" ? "checkmark-circle-outline" : "flag-outline"}
                text={`No ${goalFilter === "all" ? "" : goalFilter} goals yet`}
                sub={goalFilter !== "completed" ? "Create your first goal to start tracking!" : undefined}
                colors={colors}
              />
            ) : (
              <View style={styles.list}>
                {filteredGoals.map((goal) => (
                  <GoalCard key={goal.id} goal={goal} onAddMoney={handleAddMoney} onDelete={handleDeleteGoal} onComplete={handleCompleteGoal} />
                ))}
              </View>
            )}
          </Animated.View>
        )}

        {/* ── Tasks Tab ── */}
        {activeTab === "Tasks" && (
          <Animated.View style={animStyle(3)}>
            <View style={styles.statsRow}>
              <StatPill label="Active"       value={String(activeTasks)}    colors={colors} accent={ACCENT} />
              <StatPill label="Completed"    value={String(completedTasks)} colors={colors} accent={ACCENT_GREEN} />
              <StatPill label="Completion"   value={`${taskCompletionRate}%`} colors={colors} accent={ACCENT} />
            </View>
            <FilterBar
              options={[
                { key: "all",         label: "All" },
                { key: "pending",     label: "Pending" },
                { key: "in_progress", label: "Active" },
                { key: "completed",   label: "Done" },
              ]}
              active={taskFilter}
              onSelect={(k) => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setTaskFilter(k as any) }}
              colors={colors} accent={ACCENT}
            />
            {/* Type filter — derived from user's actual task types */}
            {taskTypes.length > 1 && (
              <FilterBar
                options={taskTypes.map((t) => ({
                  key:   t,
                  label: t === "all" ? "All Types" : t,
                }))}
                active={typeFilter}
                onSelect={(k) => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setTypeFilter(k) }}
                colors={colors}
                accent={isDark ? "#7C3AED" : "#7C3AED"}
              />
            )}
            <TouchableOpacity
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setSelectedTask(null); setIsTaskModalOpen(true) }}
              style={styles.createBtnWrap} activeOpacity={0.85}
            >
              <LinearGradient colors={isDark ? ["#065f46", "#047857"] : ["#059669", "#10B981"]} start={{ x:0, y:0 }} end={{ x:1, y:0 }} style={styles.createBtn}>
                <Ionicons name="add-circle-outline" size={20} color="#fff" />
                <Text style={styles.createBtnText}>Create New Task</Text>
              </LinearGradient>
            </TouchableOpacity>
            {loading ? (
              <EmptyState icon="hourglass-outline" text="Loading tasks..." colors={colors} />
            ) : filteredTasks.length === 0 ? (
              <EmptyState
                icon={taskFilter === "completed" ? "checkmark-circle-outline" : "calendar-outline"}
                text={`No ${taskFilter === "all" ? "" : taskFilter.replace("_", " ")} tasks yet`}
                sub={taskFilter !== "completed" ? "Create your first task to start tracking!" : undefined}
                colors={colors}
              />
            ) : (
              <View style={styles.list}>
                {filteredTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onEdit={handleEditTask}
                    onDelete={handleDeleteTask}
                    onComplete={handleCompleteTask}
                  />
                ))}
              </View>
            )}
          </Animated.View>
        )}
      </ScrollView>


      {/* ── Floating Report Button — hidden while sheet is open ── */}
      {!reportSheetVisible && (
      <TouchableOpacity
        onPress={openReportSheet}
        activeOpacity={0.9}
        style={{
          position: "absolute", bottom: 100, right: 20,
          flexDirection: "row", alignItems: "center", gap: 8,
          paddingVertical: 13, paddingHorizontal: 18,
          borderRadius: 30,
          shadowColor: "#4F46E5", shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.45, shadowRadius: 12, elevation: 10,
          overflow: "hidden",
          zIndex: 999,
        }}
      >
        <LinearGradient
          colors={isDark ? ["#4338CA", "#7C3AED"] : ["#4F46E5", "#7C3AED"]}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        />
        <Ionicons name="document-text-outline" size={19} color="#fff" />
        <Text style={{ color: "#fff", fontSize: 14, fontWeight: "700", letterSpacing: 0.2 }}>Reports</Text>
        {(storedReports.daily || storedReports.weekly || storedReports.monthly) && (
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#34D399", marginLeft: 2 }} />
        )}
      </TouchableOpacity>
      )}

      {/* ── Reports Bottom Sheet ── */}
      {reportSheetVisible && (() => {
        const now          = new Date()
        const yesterday    = new Date(now); yesterday.setDate(now.getDate() - 1)
        const thisMonday   = new Date(now); thisMonday.setDate(now.getDate() - ((now.getDay() + 6) % 7))
        const lastWeekEnd  = new Date(thisMonday); lastWeekEnd.setDate(thisMonday.getDate() - 1)
        const lastWeekStart = new Date(thisMonday); lastWeekStart.setDate(thisMonday.getDate() - 7)
        const thisMonth1   = new Date(now.getFullYear(), now.getMonth(), 1)
        const lastMonthEnd = new Date(thisMonth1); lastMonthEnd.setDate(0)
        const lastMonthStart = new Date(lastMonthEnd.getFullYear(), lastMonthEnd.getMonth(), 1)

        const fmtDate = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
        const fmtFull = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
        const fmtMon  = (d: Date) => d.toLocaleDateString("en-US", { month: "long", year: "numeric" })

        const cards: {
          period:      "daily" | "weekly" | "monthly"
          icon:        string
          label:       string
          dateRange:   string
          color:       string
          bgLight:     string
          bgDark:      string
          report:      StoredReport | null
        }[] = [
          {
            period:    "daily",
            icon:      "today-outline",
            label:     "Daily Report",
            dateRange: fmtFull(yesterday),
            color:     ACCENT,
            bgLight:   "#EEF2FF",
            bgDark:    "#1e2a4a",
            report:    storedReports.daily,
          },
          {
            period:    "weekly",
            icon:      "calendar-outline",
            label:     "Weekly Report",
            dateRange: `${fmtDate(lastWeekStart)} – ${fmtDate(lastWeekEnd)}`,
            color:     ACCENT_GREEN,
            bgLight:   "#ECFDF5",
            bgDark:    "#0f2018",
            report:    storedReports.weekly,
          },
          {
            period:    "monthly",
            icon:      "calendar-number-outline",
            label:     "Monthly Report",
            dateRange: fmtMon(lastMonthStart),
            color:     "#F59E0B",
            bgLight:   "#FFFBEB",
            bgDark:    "#2d1f00",
            report:    storedReports.monthly,
          },
        ]

        const sheetTranslate = sheetAnim.interpolate({ inputRange: [0, 1], outputRange: [500, 0] })
        const backdropOpacity = sheetAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.6] })

        return (
          <>
            {/* Backdrop */}
            <Animated.View
              style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "#000", opacity: backdropOpacity }}
            >
              <TouchableOpacity style={{ flex: 1 }} onPress={closeReportSheet} activeOpacity={1} />
            </Animated.View>

            {/* Sheet — fixed 88% screen height, inner content scrollable */}
            <Animated.View style={{
              position: "absolute", left: 0, right: 0, bottom: 0,
              transform: [{ translateY: sheetTranslate }],
              backgroundColor: colors.background,
              borderTopLeftRadius: 28, borderTopRightRadius: 28,
              shadowColor: "#000", shadowOffset: { width: 0, height: -4 },
              shadowOpacity: 0.18, shadowRadius: 16, elevation: 20,
              height: Math.round(Dimensions.get("window").height * 0.88),
            }}>
              {/* Handle */}
              <View style={{ alignItems: "center", paddingTop: 14, paddingBottom: 6 }}>
                <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border }} />
              </View>

              {/* Header — sticky, not scrolled */}
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 12 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <LinearGradient colors={["#4F46E5", "#7C3AED"]} style={{ width: 36, height: 36, borderRadius: 11, alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name="stats-chart-outline" size={18} color="#fff" />
                  </LinearGradient>
                  <View>
                    <Text style={{ fontSize: 18, fontWeight: "800", color: colors.text }}>Your Reports</Text>
                    <Text style={{ fontSize: 12, color: colors.textMuted }}>Select a period to view</Text>
                  </View>
                </View>
                <TouchableOpacity onPress={closeReportSheet} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: isDark ? "rgba(255,255,255,0.08)" : "#F3F4F6", alignItems: "center", justifyContent: "center" }}>
                  <Ionicons name="close" size={18} color={colors.textMuted} />
                </TouchableOpacity>
              </View>

              {/* Scrollable content */}
              <ScrollView
                showsVerticalScrollIndicator={false}
                bounces={true}
                contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 48, gap: 10 }}
              >
                {cards.map((card) => {
                  const hasReport = !!card.report
                  const tasks     = card.report?.report_data.tasks
                  const goals     = card.report?.report_data.goals

                  return (
                    <TouchableOpacity
                      key={card.period}
                      activeOpacity={hasReport ? 0.8 : 1}
                      onPress={() => {
                        if (!hasReport) return
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                        closeReportSheet()
                        setTimeout(() => navigation.navigate("Report", { period: card.period, storedReportId: card.report!.id } as any), 250)
                      }}
                      style={{
                        borderRadius: 18,
                        backgroundColor: isDark ? card.bgDark : card.bgLight,
                        borderWidth: 1.5,
                        borderColor: hasReport ? card.color + "55" : (isDark ? "rgba(255,255,255,0.07)" : "#E5E7EB"),
                        padding: 16,
                        opacity: hasReport ? 1 : 0.6,
                      }}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
                        {/* Icon circle */}
                        <View style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: card.color + "20", alignItems: "center", justifyContent: "center" }}>
                          <Ionicons name={card.icon as any} size={24} color={card.color} />
                        </View>

                        {/* Info */}
                        <View style={{ flex: 1, gap: 3 }}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                            <Text style={{ fontSize: 15, fontWeight: "800", color: colors.text }}>{card.label}</Text>
                            {hasReport && (
                              <View style={{ backgroundColor: card.color + "22", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
                                <Text style={{ fontSize: 10, fontWeight: "700", color: card.color }}>READY</Text>
                              </View>
                            )}
                          </View>
                          <Text style={{ fontSize: 12, color: colors.textMuted }}>{card.dateRange}</Text>
                          {hasReport && tasks ? (
                            <View style={{ flexDirection: "row", gap: 14, marginTop: 4 }}>
                              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                                <Ionicons name="checkmark-circle" size={13} color={card.color} />
                                <Text style={{ fontSize: 12, color: card.color, fontWeight: "600" }}>{tasks.completed}/{tasks.total} tasks</Text>
                              </View>
                              {goals && goals.total > 0 && (
                                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                                  <Ionicons name="flag" size={13} color={card.color} />
                                  <Text style={{ fontSize: 12, color: card.color, fontWeight: "600" }}>{goals.progressPct}% funded</Text>
                                </View>
                              )}
                            </View>
                          ) : (
                            <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 2, fontStyle: "italic" }}>
                              {reportsLoading ? "Loading..." : "Report not yet generated"}
                            </Text>
                          )}
                        </View>

                        {/* Arrow */}
                        {hasReport && (
                          <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: card.color, alignItems: "center", justifyContent: "center" }}>
                            <Ionicons name="arrow-forward" size={16} color="#fff" />
                          </View>
                        )}
                      </View>
                    </TouchableOpacity>
                  )
                })}

                {/* Note */}
                <Text style={{ fontSize: 11, color: colors.textMuted, textAlign: "center", marginTop: 8, paddingHorizontal: 8, lineHeight: 16 }}>
                  Reports are generated automatically at the end of each period.
                </Text>
              </ScrollView>
            </Animated.View>
          </>
        )
      })()}

      {/* ── Modals ── */}
      <NewGoalModal
        isVisible={isNewGoalModalOpen}
        onClose={() => setIsNewGoalModalOpen(false)}
        onGoalCreated={() => { setIsNewGoalModalOpen(false); loadGoals() }}
      />
      <AddMoneyModal
        isVisible={isAddMoneyModalOpen}
        onClose={() => { setIsAddMoneyModalOpen(false); setSelectedGoal(null) }}
        goal={selectedGoal}
        onMoneyAdded={handleMoneyAdded}
      />
      <TaskSchedulingModal
        isVisible={isTaskModalOpen}
        onClose={() => { setIsTaskModalOpen(false); setSelectedTask(null) }}
        onTaskCreated={() => { setIsTaskModalOpen(false); loadTasks() }}
        taskToEdit={selectedTask}
      />
    </SafeAreaView>
  )
}

// ── Reusable FilterBar ────────────────────────────────────────────────────────
const FilterBar = ({
  options, active, onSelect, colors, accent,
}: {
  options: { key: string; label: string }[]
  active: string
  onSelect: (key: string) => void
  colors: any
  accent: string
}) => (
  <ScrollView
    horizontal showsHorizontalScrollIndicator={false}
    contentContainerStyle={{ gap: 8, paddingRight: 16, marginBottom: 14 }}
  >
    {options.map((opt) => {
      const isActive = opt.key === active
      return (
        <TouchableOpacity
          key={opt.key}
          onPress={() => onSelect(opt.key)}
          style={{
            paddingVertical: 8, paddingHorizontal: 18, borderRadius: 20,
            backgroundColor: isActive ? accent : colors.surface,
            borderWidth: 1, borderColor: isActive ? accent : colors.border,
          }}
        >
          <Text style={{ fontSize: 13, fontWeight: "600", color: isActive ? "#fff" : colors.text }}>{opt.label}</Text>
        </TouchableOpacity>
      )
    })}
  </ScrollView>
)

// ── Empty state ───────────────────────────────────────────────────────────────
const EmptyState = ({ icon, text, sub, colors }: { icon: any; text: string; sub?: string; colors: any }) => (
  <View style={{ alignItems: "center", paddingVertical: 40, gap: 8 }}>
    <Ionicons name={icon} size={48} color={colors.textMuted} />
    <Text style={{ fontSize: 16, color: colors.textSecondary, fontWeight: "600" }}>{text}</Text>
    {sub && <Text style={{ fontSize: 13, color: colors.textMuted, textAlign: "center", lineHeight: 18 }}>{sub}</Text>}
  </View>
)

// ─────────────────────────────────────────────────────────────────────────────

const createStyles = (colors: any, activeTheme: "light" | "dark") =>
  StyleSheet.create({
    container:         { flex: 1, backgroundColor: colors.background },
    content:           { flex: 1, paddingHorizontal: 16, paddingTop: 16, backgroundColor: colors.background },
    tabWrapper:        { flexDirection: "row", borderRadius: 14, padding: 4, marginBottom: 20, borderWidth: 1, position: "relative" },
    tabIndicator:      { position: "absolute", top: 4, bottom: 4, width: "46%", borderRadius: 10, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 4, elevation: 3 },
    tab:               { flex: 1, paddingVertical: 11, alignItems: "center", zIndex: 1 },
    tabContent:        { flexDirection: "row", alignItems: "center", gap: 6 },
    tabText:           { fontSize: 15, fontWeight: "500" },
    activeTabText:     { fontWeight: "700" },
    badge:             { borderRadius: 10, minWidth: 18, height: 18, alignItems: "center", justifyContent: "center", paddingHorizontal: 5 },
    badgeText:         { color: "#fff", fontSize: 10, fontWeight: "700" },
    greeting:          { marginBottom: 20 },
    dateText:          { fontSize: 13, fontWeight: "500", marginBottom: 4 },
    greetingText:      { fontSize: 26, fontWeight: "800", letterSpacing: -0.5 },
    progressRow:       { flexDirection: "row", gap: 12, marginBottom: 20 },
    progressCard:      { flex: 1, borderRadius: 18, padding: 16, alignItems: "center", borderWidth: 1, gap: 6 },
    progressCardTitle: { fontSize: 12, fontWeight: "600", textAlign: "center" },
    progressCardSub:   { fontSize: 13, fontWeight: "700", marginTop: 2 },
    progressCardMini:  { fontSize: 11 },
    statsRow:          { flexDirection: "row", gap: 10, marginBottom: 16 },
    createBtnWrap:     { borderRadius: 14, overflow: "hidden", marginBottom: 16 },
    createBtn:         { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14 },
    createBtnText:     { color: "#fff", fontSize: 15, fontWeight: "700", letterSpacing: 0.2 },
    list:              { gap: 14, paddingBottom: 8 },
  })

export default AnalyticsScreen