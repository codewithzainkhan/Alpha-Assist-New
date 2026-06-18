"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { useFocusEffect } from "@react-navigation/native"
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Animated,
  RefreshControl,
  Alert,
} from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { LinearGradient } from "expo-linear-gradient"
import { useTheme } from "../../../components/context/ThemeContext"
import Header from "../../../components/common/Header"
import TaskSchedulingModal from "../../modals/TaskSchedulingModal"
import NewGoalModal from "../../modals/NewGoalModal"
import GoalCard from "../../../components/goal/GoalCard"
import TaskCard from "../../../components/task/TaskCard"
import AddMoneyModal from "../../../components/goal/AddMoneyModal"
import { Ionicons } from "@expo/vector-icons"
import * as Haptics from "expo-haptics"
import { useAuth } from "../../../hooks/useAuth"
import { getGoals, deleteGoal, completeGoal, type GoalFrontend } from "../../../services/goals"
import {
  getTasks,
  getUpcomingTasks,
  deleteTask,
  completeTask,
  type TaskFrontend,
} from "../../../services/tasks"
import type { StackNavigationProp } from "@react-navigation/stack"
import type { MainStackParamList } from "../../../types/navigation"
import { useNavigation } from "@react-navigation/native"
import { supabase } from "../../../services/supabase"
import { fireTaskCompletedNotification } from "../../../services/notifications"

type DashboardNavProp = StackNavigationProp<MainStackParamList, "Dashboard">

const getGreeting = () => {
  const h = new Date().getHours()
  if (h < 12) return { text: "Good Morning", emoji: "🌤️" }
  if (h < 17) return { text: "Good Afternoon", emoji: "☀️" }
  return { text: "Good Evening", emoji: "🌙" }
}

const getCurrentDate = () =>
  new Date().toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long" })

// ── Quick Action card ─────────────────────────────────────────────────────────
const QuickAction = ({
  icon, label, sublabel, gradientColors, onPress,
}: {
  icon: string; label: string; sublabel: string
  gradientColors: [string, string]; onPress: () => void
}) => (
  <TouchableOpacity onPress={onPress} activeOpacity={0.82} style={{ flex: 1 }}>
    <LinearGradient colors={gradientColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={qaStyles.card}>
      <View style={qaStyles.iconBg}>
        <Ionicons name={icon as any} size={22} color="#fff" />
      </View>
      <Text style={qaStyles.label}>{label}</Text>
      <Text style={qaStyles.sublabel}>{sublabel}</Text>
    </LinearGradient>
  </TouchableOpacity>
)

const qaStyles = StyleSheet.create({
  card: {
    borderRadius: 16, padding: 16, gap: 8,
    shadowColor: "#000", shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18, shadowRadius: 8, elevation: 5,
  },
  iconBg: {
    width: 40, height: 40, borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center", justifyContent: "center",
  },
  label:    { fontSize: 14, fontWeight: "700", color: "#fff", marginTop: 2 },
  sublabel: { fontSize: 11, color: "rgba(255,255,255,0.8)" },
})

// ── Section card wrapper ──────────────────────────────────────────────────────
const SectionCard = ({
  title, icon, iconColor, iconBg, action, actionLabel, children, colors, activeTheme,
}: {
  title: string; icon: string; iconColor: string; iconBg: string
  action?: () => void; actionLabel?: string; children: React.ReactNode
  colors: any; activeTheme: "light" | "dark"
}) => (
  <View style={[scStyles.card, {
    backgroundColor: colors.backgroundSecondary,
    borderColor: colors.border,
    shadowOpacity: activeTheme === "dark" ? 0.3 : 0.06,
  }]}>
    <View style={scStyles.header}>
      <View style={[scStyles.iconBg, { backgroundColor: iconBg }]}>
        <Ionicons name={icon as any} size={18} color={iconColor} />
      </View>
      <Text style={[scStyles.title, { color: colors.text }]}>{title}</Text>
      {action && actionLabel && (
        <TouchableOpacity onPress={action} style={[scStyles.headerBtn, { borderColor: colors.border }]}>
          <Ionicons name="add" size={14} color={iconColor} />
          <Text style={[scStyles.headerBtnText, { color: iconColor }]}>{actionLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
    {children}
  </View>
)

const scStyles = StyleSheet.create({
  card: {
    borderRadius: 18, padding: 18, marginBottom: 14, borderWidth: 1,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowRadius: 8, elevation: 3,
  },
  header:        { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 },
  iconBg:        { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  title:         { flex: 1, fontSize: 16, fontWeight: "700", letterSpacing: 0.2 },
  headerBtn:     { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  headerBtnText: { fontSize: 12, fontWeight: "600" },
})

// ── Empty state ───────────────────────────────────────────────────────────────
const EmptyState = ({ icon, text, sub, colors }: { icon: any; text: string; sub?: string; colors: any }) => (
  <View style={{ alignItems: "center", paddingVertical: 28, gap: 8 }}>
    <Ionicons name={icon} size={40} color={colors.textMuted} />
    <Text style={{ fontSize: 15, fontWeight: "600", color: colors.textSecondary }}>{text}</Text>
    {sub && <Text style={{ fontSize: 12, color: colors.textMuted, textAlign: "center", lineHeight: 17 }}>{sub}</Text>}
  </View>
)

// ── View All button ───────────────────────────────────────────────────────────
const ViewAllButton = ({ label, onPress, colors, accent }: { label: string; onPress: () => void; colors: any; accent: string }) => (
  <TouchableOpacity
    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress() }}
    style={[vaStyles.btn, { backgroundColor: colors.surface, borderColor: colors.border }]}
    activeOpacity={0.8}
  >
    <Text style={[vaStyles.text, { color: accent }]}>{label}</Text>
    <Ionicons name="chevron-forward" size={16} color={accent} />
  </TouchableOpacity>
)

const vaStyles = StyleSheet.create({
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 11, borderRadius: 12, marginTop: 4, borderWidth: 1, gap: 6 },
  text: { fontSize: 13, fontWeight: "600" },
})

// ─────────────────────────────────────────────────────────────────────────────

const DashboardScreen = () => {
  const { colors, activeTheme } = useTheme()
  const { user } = useAuth()
  const navigation = useNavigation<DashboardNavProp>()
  const isDark = activeTheme === "dark"

  const fadeAnims  = useRef([0, 1, 2, 3, 4, 5].map(() => new Animated.Value(0))).current
  const slideAnims = useRef([0, 1, 2, 3, 4, 5].map(() => new Animated.Value(22))).current

  const [isTaskModalOpen,    setIsTaskModalOpen]    = useState(false)
  const [isNewGoalModalOpen, setIsNewGoalModalOpen] = useState(false)
  const [goals,         setGoals]         = useState<GoalFrontend[]>([])
  const [tasks,         setTasks]         = useState<TaskFrontend[]>([])
  const [allTasks,      setAllTasks]      = useState<TaskFrontend[]>([])
  const [loading,       setLoading]       = useState(true)
  const [tasksLoading,  setTasksLoading]  = useState(true)
  const [refreshing,    setRefreshing]    = useState(false)
  const [selectedGoal,  setSelectedGoal]  = useState<GoalFrontend | null>(null)
  const [selectedTask,  setSelectedTask]  = useState<TaskFrontend | null>(null)
  const [isAddMoneyModalOpen, setIsAddMoneyModalOpen] = useState(false)
  const [userName,      setUserName]      = useState<string>("")

  useEffect(() => {
    fadeAnims.forEach((anim, i) => {
      Animated.parallel([
        Animated.timing(anim,        { toValue: 1, duration: 500, delay: i * 90, useNativeDriver: true }),
        Animated.timing(slideAnims[i], { toValue: 0, duration: 500, delay: i * 90, useNativeDriver: true }),
      ]).start()
    })
  }, [])

  const animStyle = (i: number) => ({ opacity: fadeAnims[i], transform: [{ translateY: slideAnims[i] }] })

  // ── Load data on first mount ──────────────────────────────────────────────
  useEffect(() => {
    if (user?.id) {
      loadUserProfile()
      loadGoals()
      loadTasks()
    }
  }, [user])

  // ── Refresh tasks & goals whenever screen is focused (picks up chat mutations) ──
  useFocusEffect(
    useCallback(() => {
      if (user?.id) {
        loadGoals()
        loadTasks()
      }
    }, [user])
  )

  // ── Realtime subscriptions — stats update instantly on any DB change ──────
  useEffect(() => {
    if (!user?.id) return

    const tasksSub = supabase
      .channel(`dashboard-tasks-${user.id}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "tasks",
        filter: `user_id=eq.${user.id}`,
      }, () => loadTasks())
      .subscribe()

    const goalsSub = supabase
      .channel(`dashboard-goals-${user.id}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "goals",
        filter: `user_id=eq.${user.id}`,
      }, () => loadGoals())
      .subscribe()

    return () => {
      supabase.removeChannel(tasksSub)
      supabase.removeChannel(goalsSub)
    }
  }, [user?.id])

  const loadUserProfile = async () => {
    if (!user?.id) return
    try {
      const { data } = await supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle()
      setUserName(data?.full_name || user.email?.split("@")[0] || "there")
    } catch {
      setUserName(user.email?.split("@")[0] || "there")
    }
  }

  const loadGoals = async () => {
    if (!user?.id) { setGoals([]); setLoading(false); setRefreshing(false); return }
    try { setLoading(true); setGoals(await getGoals(user.id)) }
    catch { setGoals([]) }
    finally { setLoading(false); setRefreshing(false) }
  }

  const loadTasks = async () => {
    if (!user?.id) { setTasks([]); setAllTasks([]); setTasksLoading(false); setRefreshing(false); return }
    try {
      setTasksLoading(true)
      const [upcoming, all] = await Promise.all([
        getUpcomingTasks(user.id),
        getTasks(user.id),
      ])
      setTasks(upcoming)
      setAllTasks(all)
    } catch { setTasks([]); setAllTasks([]) }
    finally { setTasksLoading(false); setRefreshing(false) }
  }

  const onRefresh = () => { setRefreshing(true); loadGoals(); loadTasks() }

  const handleAddMoney    = (goal: GoalFrontend) => { setSelectedGoal(goal); setIsAddMoneyModalOpen(true) }
  const handleMoneyAdded  = () => loadGoals()

  const handleDeleteGoal   = async (id: string) => {
    if (!user?.id) return
    try { await deleteGoal(id, user.id); loadGoals() }
    catch { Alert.alert("Error", "Failed to delete goal.") }
  }
  const handleCompleteGoal = async (id: string) => {
    if (!user?.id) return
    try { await completeGoal(id, user.id); loadGoals() }
    catch { Alert.alert("Error", "Failed to complete goal.") }
  }
  const handleEditTask    = (task: TaskFrontend) => { setSelectedTask(task); setIsTaskModalOpen(true) }
  const handleDeleteTask  = async (id: string) => {
    if (!user?.id) return
    try { await deleteTask(id, user.id); loadTasks() }
    catch { Alert.alert("Error", "Failed to delete task.") }
  }
  const handleCompleteTask = async (task: TaskFrontend) => {
    if (!user?.id) return
    try {
      await completeTask(task.id, user.id)
      await fireTaskCompletedNotification(task.taskName, task.id)
      loadTasks()
    } catch { Alert.alert("Error", "Failed to complete task.") }
  }

  // ── Navigate to AI Chat with a pre-filled prompt ──────────────────────────
  const goToChat = (prompt?: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    navigation.navigate("AIChat", prompt ? { initialMessage: prompt } : undefined)
  }

  const upcomingGoals   = goals.filter(g => g.status === "active" && g.deadline)
    .sort((a, b) => new Date(a.deadline!).getTime() - new Date(b.deadline!).getTime()).slice(0, 2)
  const activeGoalCount    = goals.filter(g => g.status === "active").length
  const completedGoalCount = goals.filter(g => g.status === "completed").length
  const pendingTaskCount   = allTasks.filter(t => t.status === "pending" || t.status === "in_progress").length
  const completedTaskCount = allTasks.filter(t => t.status === "completed").length

  const greeting   = getGreeting()
  const ACCENT      = isDark ? "#60A5FA" : "#4F46E5"
  const ACCENT_GREEN = isDark ? "#34D399" : "#059669"
  const styles     = createStyles(colors, activeTheme)

  // ── Prompt chips that land in chat with a pre-filled message ─────────────
  const PROMPT_CHIPS = [
    { label: "Summarise my goals",  prompt: "Summarise all my current goals and how close I am to achieving them." },
    { label: "What's due today?",   prompt: "What tasks do I have scheduled for today?" },
    { label: "Motivate me",         prompt: "Give me a motivational message based on my current tasks and goals." },
    { label: "Help me plan",        prompt: "Help me plan and prioritise my pending tasks for this week." },
  ]

  return (
    <SafeAreaView edges={["left", "right", "bottom"]} style={styles.container}>
      <Header title="Dashboard" />

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >

        {/* ── Hero greeting ── */}
        <Animated.View style={animStyle(0)}>
          <LinearGradient
            colors={isDark ? ["#0f0c29", "#302b63", "#24243e"] : ["#667eea", "#764ba2"]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={styles.heroBanner}
          >
            <View style={styles.heroBubble1} />
            <View style={styles.heroBubble2} />
            <View style={styles.heroTop}>
              <View style={{ flex: 1 }}>
                <Text style={styles.heroDate}>{getCurrentDate()}</Text>
                <Text style={styles.heroGreeting}>
                  {greeting.emoji} {greeting.text},{"\n"}
                  {userName || "there"}!
                </Text>
              </View>
              <View style={styles.heroStatsBox}>
                <View style={styles.heroStat}>
                  <Text style={styles.heroStatNum}>{pendingTaskCount}</Text>
                  <Text style={styles.heroStatLabel}>{"Tasks\nPending"}</Text>
                </View>
                <View style={styles.heroStatDivider} />
                <View style={styles.heroStat}>
                  <Text style={styles.heroStatNum}>{activeGoalCount}</Text>
                  <Text style={styles.heroStatLabel}>{"Active\nGoals"}</Text>
                </View>
              </View>
            </View>
          </LinearGradient>
        </Animated.View>

        {/* ── Quick Actions ── */}
        <Animated.View style={animStyle(1)}>
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>Quick Actions</Text>
          <View style={styles.quickRow}>
            <QuickAction
              icon="chatbubble-ellipses" label="AI Chat" sublabel="Ask anything"
              gradientColors={isDark ? ["#1d4ed8", "#4f46e5"] : ["#4F46E5", "#7C3AED"]}
              onPress={() => goToChat()}
            />
            <QuickAction
              icon="add-circle" label="New Task" sublabel="Schedule it"
              gradientColors={isDark ? ["#065f46", "#047857"] : ["#059669", "#10B981"]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setSelectedTask(null); setIsTaskModalOpen(true) }}
            />
            <QuickAction
              icon="flag" label="New Goal" sublabel="Set a target"
              gradientColors={isDark ? ["#92400e", "#b45309"] : ["#F59E0B", "#EF4444"]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setIsNewGoalModalOpen(true) }}
            />
          </View>
        </Animated.View>

        {/* ── AI Chat input with smart prompt chips ── */}
        <Animated.View style={animStyle(2)}>
          <SectionCard
            title="AI Assistant" icon="sparkles" iconColor={ACCENT}
            iconBg={isDark ? "#1e3a5f" : "#EEF2FF"} colors={colors} activeTheme={activeTheme}
          >
            {/* Tappable fake input → goes straight to AIChat */}
            <TouchableOpacity onPress={() => goToChat()} activeOpacity={0.9}>
              <View style={[styles.chatInputRow, { backgroundColor: colors.backgroundTertiary, borderColor: colors.border }]}>
                <View style={[styles.chatDot, { backgroundColor: ACCENT }]} />
                <Text style={[styles.chatPlaceholder, { color: colors.textMuted }]}>
                  Ask Alpha Assist anything…
                </Text>
                <View style={[styles.chatSendBtn, { backgroundColor: ACCENT }]}>
                  <Ionicons name="arrow-up" size={16} color="#fff" />
                </View>
              </View>
            </TouchableOpacity>

            {/* Prompt chips — each navigates to AIChat with message pre-filled */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.promptsRow}>
              {PROMPT_CHIPS.map(chip => (
                <TouchableOpacity
                  key={chip.label}
                  onPress={() => goToChat(chip.prompt)}
                  style={[styles.promptChip, {
                    backgroundColor: isDark ? "#1e3a5f" : "#EEF2FF",
                    borderColor:     isDark ? "#1e3a5f" : "#C7D2FE",
                  }]}
                >
                  <Text style={[styles.promptChipText, { color: ACCENT }]}>{chip.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </SectionCard>
        </Animated.View>

        {/* ── Upcoming Tasks ── */}
        <Animated.View style={animStyle(3)}>
          <SectionCard
            title="Upcoming Tasks" icon="checkmark-done-outline"
            iconColor={ACCENT_GREEN} iconBg={isDark ? "#1a3a2a" : "#ECFDF5"}
            action={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setSelectedTask(null); setIsTaskModalOpen(true) }}
            actionLabel="Add" colors={colors} activeTheme={activeTheme}
          >
            {tasksLoading ? (
              <EmptyState icon="hourglass-outline" text="Loading tasks…" colors={colors} />
            ) : tasks.length === 0 ? (
              <EmptyState icon="calendar-outline" text="No upcoming tasks" sub="Schedule your first task to get started!" colors={colors} />
            ) : (
              <View style={{ gap: 12 }}>
                {tasks.slice(0, 3).map(task => (
                  <TaskCard key={task.id} task={task} onEdit={handleEditTask} onDelete={handleDeleteTask} onComplete={handleCompleteTask} />
                ))}
                {tasks.length > 3 && (
                  <ViewAllButton
                    label={`View All Tasks (${tasks.length})`}
                    onPress={() => navigation.navigate("Analytics", { initialTab: "Tasks" })}
                    colors={colors} accent={ACCENT_GREEN}
                  />
                )}
              </View>
            )}
          </SectionCard>
        </Animated.View>

        {/* ── Upcoming Goals ── */}
        <Animated.View style={animStyle(4)}>
          <SectionCard
            title="Upcoming Goals" icon="flag-outline"
            iconColor={isDark ? "#FBBF24" : "#F59E0B"} iconBg={isDark ? "#3b2000" : "#FFF7ED"}
            action={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); setIsNewGoalModalOpen(true) }}
            actionLabel="Add" colors={colors} activeTheme={activeTheme}
          >
            {loading ? (
              <EmptyState icon="hourglass-outline" text="Loading goals…" colors={colors} />
            ) : upcomingGoals.length === 0 ? (
              <EmptyState icon="flag-outline" text="No upcoming goals" sub="Set goals with deadlines to see them here!" colors={colors} />
            ) : (
              <View style={{ gap: 12 }}>
                {upcomingGoals.map(goal => (
                  <GoalCard key={goal.id} goal={goal} onAddMoney={handleAddMoney} onDelete={handleDeleteGoal} onComplete={handleCompleteGoal} />
                ))}
                {goals.filter(g => g.status === "active" && g.deadline).length > 2 && (
                  <ViewAllButton
                    label={`View All Goals (${activeGoalCount})`}
                    onPress={() => navigation.navigate("Analytics", { initialTab: "Goals" })}
                    colors={colors} accent={isDark ? "#FBBF24" : "#F59E0B"}
                  />
                )}
              </View>
            )}
          </SectionCard>
        </Animated.View>

        {/* ── Summary strip ── */}
        <Animated.View style={animStyle(5)}>
          <View style={[styles.summaryStrip, { backgroundColor: colors.backgroundSecondary, borderColor: colors.border }]}>
            {[
              { label: "Tasks Done",    value: completedTaskCount, color: ACCENT_GREEN },
              { label: "Goals Done",    value: completedGoalCount, color: ACCENT_GREEN },
              { label: "Active Goals",  value: activeGoalCount,    color: ACCENT },
              { label: "Pending Tasks", value: pendingTaskCount,   color: ACCENT },
            ].map((item, i, arr) => (
              <View key={item.label} style={{ flexDirection: "row", alignItems: "center" }}>
                <View style={styles.stripItem}>
                  <Text style={[styles.stripValue, { color: item.color }]}>{item.value}</Text>
                  <Text style={[styles.stripLabel, { color: colors.textSecondary }]}>{item.label}</Text>
                </View>
                {i < arr.length - 1 && <View style={[styles.stripDivider, { backgroundColor: colors.border }]} />}
              </View>
            ))}
          </View>
        </Animated.View>

      </ScrollView>

      {/* Modals */}
      <TaskSchedulingModal
        isVisible={isTaskModalOpen}
        onClose={() => { setIsTaskModalOpen(false); setSelectedTask(null) }}
        onTaskCreated={() => { setIsTaskModalOpen(false); loadTasks() }}
        taskToEdit={selectedTask}
      />
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
    </SafeAreaView>
  )
}

const createStyles = (colors: any, activeTheme: "light" | "dark") =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    content: { flex: 1, paddingHorizontal: 16, paddingTop: 16, backgroundColor: colors.background },

    heroBanner:      { borderRadius: 20, padding: 22, marginBottom: 18, overflow: "hidden", position: "relative" },
    heroBubble1:     { position: "absolute", width: 160, height: 160, borderRadius: 80, backgroundColor: "rgba(255,255,255,0.06)", top: -50, right: -30 },
    heroBubble2:     { position: "absolute", width: 100, height: 100, borderRadius: 50,  backgroundColor: "rgba(255,255,255,0.06)", bottom: -30, left: 10 },
    heroTop:         { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    heroDate:        { fontSize: 12, color: "rgba(255,255,255,0.7)", marginBottom: 6 },
    heroGreeting:    { fontSize: 22, fontWeight: "800", color: "#fff", lineHeight: 30 },
    heroStatsBox:    { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 14, padding: 12 },
    heroStat:        { alignItems: "center" },
    heroStatNum:     { fontSize: 22, fontWeight: "800", color: "#fff" },
    heroStatLabel:   { fontSize: 10, color: "rgba(255,255,255,0.75)", textAlign: "center", lineHeight: 14, marginTop: 2 },
    heroStatDivider: { width: 1, height: 32, backgroundColor: "rgba(255,255,255,0.25)" },

    sectionLabel:    { fontSize: 11, fontWeight: "700", letterSpacing: 1, marginBottom: 10, textTransform: "uppercase" },
    quickRow:        { flexDirection: "row", gap: 10, marginBottom: 14 },

    chatInputRow:    { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1 },
    chatDot:         { width: 8, height: 8, borderRadius: 4 },
    chatPlaceholder: { flex: 1, fontSize: 14 },
    chatSendBtn:     { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },

    promptsRow:      { gap: 8, paddingTop: 12, paddingBottom: 2 },
    promptChip:      { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
    promptChipText:  { fontSize: 12, fontWeight: "600" },

    summaryStrip:    { flexDirection: "row", alignItems: "center", justifyContent: "space-around", borderRadius: 16, padding: 16, borderWidth: 1, marginBottom: 8 },
    stripItem:       { alignItems: "center", gap: 3 },
    stripValue:      { fontSize: 20, fontWeight: "800" },
    stripLabel:      { fontSize: 10, fontWeight: "500", textAlign: "center" },
    stripDivider:    { width: 1, height: 32, marginHorizontal: 2 },
  })

export default DashboardScreen
