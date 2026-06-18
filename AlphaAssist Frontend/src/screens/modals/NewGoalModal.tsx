"use client"

import type React from "react"
import { useState, useRef } from "react"
import {
  View, Text, Modal, TouchableOpacity, TextInput, StyleSheet,
  Dimensions, Alert, Animated, ScrollView, KeyboardAvoidingView, Platform,
} from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import DateTimePicker from "@react-native-community/datetimepicker"
import { Ionicons } from "@expo/vector-icons"
import * as Haptics from "expo-haptics"
import { useTheme } from "../../components/context/ThemeContext"
import { useAuth } from "../../hooks/useAuth"
import { createGoal, type GoalInput } from "../../services/goals"
import { scheduleGoalNotifications, fireGoalCompletedNotification } from "../../services/notifications"

const { width, height } = Dimensions.get("window")

interface NewGoalModalProps {
  isVisible: boolean
  onClose: () => void
  onGoalCreated?: () => void
}

const GOAL_TYPES  = ["Save Money to Buy", "Purchase Goal", "Financial Goal", "Enter your own"]
const FREQUENCIES = ["Daily", "Weekly", "Monthly"]

// ── Field label ───────────────────────────────────────────────────────────────
const FieldLabel = ({ text, required, colors }: { text: string; required?: boolean; colors: any }) => (
  <Text style={[fl.label, { color: colors.textSecondary }]}>
    {text}{required && <Text style={{ color: "#EF4444" }}> *</Text>}
  </Text>
)
const fl = StyleSheet.create({
  label: { fontSize: 12, fontWeight: "600", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 8 },
})

// ── Input row ─────────────────────────────────────────────────────────────────
const InputRow = ({ icon, children, colors }: { icon: string; children: React.ReactNode; colors: any }) => (
  <View style={[ir.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
    <Ionicons name={icon as any} size={18} color={colors.textMuted} style={{ marginRight: 10 }} />
    {children}
  </View>
)
const ir = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, borderWidth: 1 },
})

// ── Toggle ────────────────────────────────────────────────────────────────────
const Toggle = ({ value, onToggle, activeColor, colors }: {
  value: boolean; onToggle: () => void; activeColor: string; colors: any
}) => {
  const anim = useRef(new Animated.Value(value ? 1 : 0)).current
  const handle = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    Animated.timing(anim, { toValue: value ? 0 : 1, duration: 180, useNativeDriver: false }).start()
    onToggle()
  }
  return (
    <TouchableOpacity onPress={handle} activeOpacity={0.9}>
      <View style={[tg.track, { backgroundColor: value ? activeColor : colors.border }]}>
        <Animated.View style={[tg.thumb, {
          transform: [{ translateX: anim.interpolate({ inputRange: [0,1], outputRange: [3,23] }) }],
        }]} />
      </View>
    </TouchableOpacity>
  )
}
const tg = StyleSheet.create({
  track: { width: 50, height: 28, borderRadius: 14, justifyContent: "center" },
  thumb: {
    width: 22, height: 22, borderRadius: 11, backgroundColor: "#fff", position: "absolute",
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 2, elevation: 2,
  },
})

// ── Inline date picker ────────────────────────────────────────────────────────
const InlineDatePicker = ({ visible, value, onChange, isDark }: {
  visible: boolean; value: Date; onChange: (d: Date) => void; isDark: boolean
}) => {
  const anim = useRef(new Animated.Value(0)).current
  const prevVisible = useRef(false)

  if (prevVisible.current !== visible) {
    prevVisible.current = visible
    Animated.spring(anim, { toValue: visible ? 1 : 0, useNativeDriver: false, tension: 70, friction: 12 }).start()
  }

  if (!visible) return null

  return (
    <Animated.View style={[
      ip.wrap,
      { backgroundColor: isDark ? "#1C1C1E" : "#F2F2F7" },
      { opacity: anim, transform: [{ scaleY: anim }] },
    ]}>
      <DateTimePicker
        value={value}
        mode="date"
        display="spinner"
        minimumDate={new Date(Date.now() + 86400000)}
        onChange={(_, d) => { if (d) onChange(d) }}
        textColor={isDark ? "#fff" : "#000"}
        style={{ backgroundColor: isDark ? "#1C1C1E" : "#F2F2F7" }}
      />
    </Animated.View>
  )
}
const ip = StyleSheet.create({
  wrap: { borderRadius: 14, overflow: "hidden", marginTop: 6, marginBottom: 4 },
})

// ── Main component ────────────────────────────────────────────────────────────
const NewGoalModal: React.FC<NewGoalModalProps> = ({ isVisible, onClose, onGoalCreated }) => {
  const { colors, activeTheme } = useTheme()
  const { user } = useAuth()
  const isDark = activeTheme === "dark"

  const [goalName,             setGoalName]             = useState("")
  const [goalType,             setGoalType]             = useState("")
  const [customGoalType,       setCustomGoalType]       = useState("")
  const [targetAmount,         setTargetAmount]         = useState("")
  const [currentAmount,        setCurrentAmount]        = useState("0")
  const [deadline,             setDeadline]             = useState(new Date(Date.now() + 86400000 * 30))
  const [description,          setDescription]          = useState("")
  const [messageReminder,      setMessageReminder]      = useState(false)
  const [reminderFrequency,    setReminderFrequency]    = useState("")
  const [showDatePicker,       setShowDatePicker]       = useState(false)
  const [showGoalTypeDropdown, setShowGoalTypeDropdown] = useState(false)
  const [showSuccessModal,     setShowSuccessModal]     = useState(false)
  const [isSubmitting,         setIsSubmitting]         = useState(false)

  // notification scheduling feedback
  const [notifStatus, setNotifStatus] = useState<"idle"|"scheduling"|"done"|"failed">("idle")

  const scaleAnim       = useRef(new Animated.Value(0)).current
  const successFadeAnim = useRef(new Animated.Value(0)).current

  const resetForm = () => {
    setGoalName(""); setGoalType(""); setCustomGoalType("")
    setTargetAmount(""); setCurrentAmount("0")
    setDeadline(new Date(Date.now() + 86400000 * 30))
    setDescription(""); setMessageReminder(false); setReminderFrequency("")
    setShowGoalTypeDropdown(false); setShowDatePicker(false); setNotifStatus("idle")
  }

  const handleCreateGoal = async () => {
    if (!user?.id)         { Alert.alert("Error", "You must be logged in"); return }
    if (!goalName.trim())  { Alert.alert("Validation", "Please enter a goal name"); return }
    if (!goalType)         { Alert.alert("Validation", "Please select a goal type"); return }
    if (goalType === "Enter your own" && !customGoalType.trim()) {
      Alert.alert("Validation", "Please enter your custom goal type"); return
    }
    if (!targetAmount.trim() || isNaN(parseFloat(targetAmount)) || parseFloat(targetAmount) <= 0) {
      Alert.alert("Validation", "Please enter a valid target amount"); return
    }
    const initialAmount = parseFloat(currentAmount) || 0
    const target        = parseFloat(targetAmount)
    if (initialAmount > target) { Alert.alert("Validation", "Initial amount cannot exceed target amount"); return }
    if (deadline <= new Date())  { Alert.alert("Validation", "Please set a deadline in the future"); return }
    if (messageReminder && !reminderFrequency) { Alert.alert("Validation", "Please select a reminder frequency"); return }

    setIsSubmitting(true); setShowDatePicker(false)
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)

    const goalInput: GoalInput = {
      goal_name:          goalName.trim(),
      goal_type:          goalType === "Enter your own" ? customGoalType.trim() : goalType,
      target_amount:      target,
      current_amount:     initialAmount,
      deadline:           deadline.toISOString(),
      description:        description.trim() || undefined,
      message_reminder:   messageReminder,
      reminder_frequency: messageReminder ? reminderFrequency : undefined,
      savings_history: initialAmount > 0
        ? [{ id: Date.now().toString(), amount: initialAmount, date: new Date().toISOString(), note: "Initial amount" }]
        : undefined,
    }

    try {
      const created = await createGoal(user.id, goalInput)

      // ── Schedule notifications ────────────────────────────────────────────
      setNotifStatus("scheduling")
      try {
        // If the initial amount already meets the target, fire completed immediately
        if (initialAmount >= target) {
          await fireGoalCompletedNotification(goalName.trim(), created.id)
        } else {
          await scheduleGoalNotifications({
            id:               created.id,
            goalName:         goalName.trim(),
            deadline:         deadline.toISOString(),
            messageReminder,
            reminderFrequency: messageReminder ? reminderFrequency : undefined,
            targetAmount:     target,
            currentAmount:    initialAmount,
          })
        }
        setNotifStatus("done")
      } catch (notifErr) {
        // Non-fatal — goal was saved successfully
        console.warn("Notification scheduling failed:", notifErr)
        setNotifStatus("failed")
      }
      // ─────────────────────────────────────────────────────────────────────

      resetForm()
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      setShowSuccessModal(true)
      Animated.parallel([
        Animated.spring(scaleAnim,       { toValue: 1, useNativeDriver: true, tension: 60, friction: 8 }),
        Animated.timing(successFadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]).start()
      setTimeout(() => {
        setShowSuccessModal(false)
        scaleAnim.setValue(0); successFadeAnim.setValue(0)
        onClose(); onGoalCreated?.()
      }, 1800)
    } catch (err) {
      console.error("Error creating goal:", err)
      Alert.alert("Error", "Failed to save goal. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const progress = targetAmount && parseFloat(targetAmount) > 0
    ? Math.min(100, Math.round(((parseFloat(currentAmount) || 0) / parseFloat(targetAmount)) * 100))
    : 0

  const ACCENT = isDark ? "#60A5FA" : "#4F46E5"
  const s = createStyles(colors, activeTheme)

  return (
    <>
      <Modal visible={isVisible} transparent animationType="slide" onRequestClose={onClose}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={s.overlay}>
            <View style={[s.sheet, { backgroundColor: colors.backgroundSecondary }]}>

              {/* Header */}
              <LinearGradient
                colors={isDark ? ["#0f0c29","#302b63"] : ["#4F46E5","#7C3AED"]}
                start={{ x:0, y:0 }} end={{ x:1, y:0 }}
                style={s.header}
              >
                <View style={s.headerLeft}>
                  <View style={s.headerIconBg}>
                    <Ionicons name="flag" size={18} color="#fff" />
                  </View>
                  <Text style={s.headerTitle}>Create New Goal</Text>
                </View>
                <TouchableOpacity
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onClose() }}
                  style={s.closeBtn}
                >
                  <Ionicons name="close" size={20} color="rgba(255,255,255,0.8)" />
                </TouchableOpacity>
              </LinearGradient>

              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={s.form}
                keyboardShouldPersistTaps="handled"
              >

                {/* Goal Name */}
                <View style={s.field}>
                  <FieldLabel text="Goal Name" required colors={colors} />
                  <InputRow icon="flag-outline" colors={colors}>
                    <TextInput
                      style={[s.input, { color: colors.text }]}
                      placeholder="e.g., Buy a Car, Save for Vacation"
                      placeholderTextColor={colors.textMuted}
                      value={goalName}
                      onChangeText={setGoalName}
                    />
                  </InputRow>
                </View>

                {/* Goal Type */}
                <View style={s.field}>
                  <FieldLabel text="Goal Type" required colors={colors} />
                  <TouchableOpacity
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowGoalTypeDropdown(!showGoalTypeDropdown) }}
                    style={[ir.row, { backgroundColor: colors.surface, borderColor: showGoalTypeDropdown ? ACCENT : colors.border }]}
                  >
                    <Ionicons name="list-outline" size={18} color={colors.textMuted} style={{ marginRight: 10 }} />
                    <Text style={[{ flex:1, fontSize:16 }, goalType ? { color: colors.text } : { color: colors.textMuted }]}>
                      {goalType || "Select goal type"}
                    </Text>
                    <Ionicons name={showGoalTypeDropdown ? "chevron-up" : "chevron-down"} size={18} color={ACCENT} />
                  </TouchableOpacity>
                  {showGoalTypeDropdown && (
                    <View style={[s.dropdown, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                      {GOAL_TYPES.map((type, i) => (
                        <TouchableOpacity
                          key={type}
                          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setGoalType(type); setShowGoalTypeDropdown(false) }}
                          style={[s.dropdownItem, i < GOAL_TYPES.length-1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}
                        >
                          <Text style={[{ fontSize:15 }, goalType===type ? { color: ACCENT, fontWeight:"700" } : { color: colors.text }]}>{type}</Text>
                          {goalType===type && <Ionicons name="checkmark" size={16} color={ACCENT} />}
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>

                {/* Custom Goal Type */}
                {goalType === "Enter your own" && (
                  <View style={s.field}>
                    <FieldLabel text="Custom Goal Type" required colors={colors} />
                    <InputRow icon="pencil-outline" colors={colors}>
                      <TextInput
                        style={[s.input, { color: colors.text }]}
                        placeholder="Describe your goal type"
                        placeholderTextColor={colors.textMuted}
                        value={customGoalType}
                        onChangeText={setCustomGoalType}
                      />
                    </InputRow>
                  </View>
                )}

                {/* Amounts */}
                <View style={s.amountRow}>
                  <View style={[s.field, { flex:1 }]}>
                    <FieldLabel text="Target Amount" required colors={colors} />
                    <View style={[ir.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                      <Text style={[s.currency, { color: colors.text }]}>₨</Text>
                      <TextInput
                        style={[s.input, { color: colors.text }]}
                        placeholder="0.00"
                        placeholderTextColor={colors.textMuted}
                        value={targetAmount}
                        onChangeText={(t) => setTargetAmount(t.replace(/[^0-9.]/g, ""))}
                        keyboardType="decimal-pad"
                      />
                    </View>
                  </View>
                  <View style={[s.field, { flex:1 }]}>
                    <FieldLabel text="Initial Amount" colors={colors} />
                    <View style={[ir.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                      <Text style={[s.currency, { color: colors.text }]}>₨</Text>
                      <TextInput
                        style={[s.input, { color: colors.text }]}
                        placeholder="0.00"
                        placeholderTextColor={colors.textMuted}
                        value={currentAmount}
                        onChangeText={(t) => setCurrentAmount(t.replace(/[^0-9.]/g, ""))}
                        keyboardType="decimal-pad"
                      />
                    </View>
                  </View>
                </View>

                {/* Progress preview */}
                {targetAmount && parseFloat(targetAmount) > 0 && (
                  <View style={[s.progressPreview, {
                    backgroundColor: isDark ? "rgba(79,70,229,0.1)" : "#EEF2FF",
                    borderColor: isDark ? "#4f46e5" : "#C7D2FE",
                  }]}>
                    <View style={s.progressPreviewTop}>
                      <Text style={{ fontSize:13, color: colors.textSecondary }}>Starting progress</Text>
                      <Text style={{ fontSize:13, fontWeight:"700", color: ACCENT }}>{progress}%</Text>
                    </View>
                    <View style={[s.progressBar, { backgroundColor: isDark ? "#1e3a5f" : "#DDD6FE" }]}>
                      <View style={[s.progressFill, { width: `${progress}%`, backgroundColor: ACCENT }]} />
                    </View>
                  </View>
                )}

                {/* Deadline */}
                <View style={s.field}>
                  <FieldLabel text="Deadline" required colors={colors} />
                  <TouchableOpacity
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowDatePicker(!showDatePicker) }}
                    style={[ir.row, { backgroundColor: colors.surface, borderColor: showDatePicker ? ACCENT : colors.border }]}
                  >
                    <Ionicons name="calendar-outline" size={18} color={showDatePicker ? ACCENT : colors.textMuted} style={{ marginRight: 10 }} />
                    <Text style={{ flex:1, fontSize:16, color: colors.text }}>
                      {deadline.toLocaleDateString("en-US", { year:"numeric", month:"short", day:"numeric" })}
                    </Text>
                    <Ionicons name={showDatePicker ? "chevron-up" : "chevron-down"} size={16} color={showDatePicker ? ACCENT : colors.textMuted} />
                  </TouchableOpacity>
                  <InlineDatePicker visible={showDatePicker} value={deadline} onChange={setDeadline} isDark={isDark} />
                  {showDatePicker && (
                    <TouchableOpacity
                      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowDatePicker(false) }}
                      style={[s.doneBtn, { backgroundColor: ACCENT }]}
                    >
                      <Ionicons name="checkmark" size={16} color="#fff" />
                      <Text style={s.doneBtnText}>Done</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Description */}
                <View style={s.field}>
                  <FieldLabel text="Description" colors={colors} />
                  <TextInput
                    style={[s.textarea, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                    placeholder="Add notes about your goal..."
                    placeholderTextColor={colors.textMuted}
                    value={description}
                    onChangeText={setDescription}
                    multiline numberOfLines={3}
                    textAlignVertical="top"
                    maxLength={300}
                  />
                  <Text style={{ fontSize:11, textAlign:"right", marginTop:4, color: colors.textMuted }}>
                    {description.length}/300
                  </Text>
                </View>

                {/* Reminder toggle */}
                <View style={[s.reminderRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={[s.reminderIcon, { backgroundColor: isDark ? "#1a3a2a" : "#ECFDF5" }]}>
                    <Ionicons name="notifications-outline" size={18} color={isDark ? "#34D399" : "#059669"} />
                  </View>
                  <View style={{ flex:1 }}>
                    <Text style={{ fontSize:15, fontWeight:"600", color: colors.text }}>Message Reminder</Text>
                    <Text style={{ fontSize:12, color: colors.textMuted, marginTop:2 }}>Get notified about your goal progress</Text>
                  </View>
                  <Toggle value={messageReminder} onToggle={() => setMessageReminder(!messageReminder)} activeColor="#10B981" colors={colors} />
                </View>

                {/* Frequency chips */}
                {messageReminder && (
                  <View style={[s.field, { marginTop:12 }]}>
                    <FieldLabel text="Reminder Frequency" required colors={colors} />
                    <View style={s.freqRow}>
                      {FREQUENCIES.map((f) => (
                        <TouchableOpacity
                          key={f}
                          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setReminderFrequency(f) }}
                          style={[s.freqChip, {
                            backgroundColor: reminderFrequency===f ? "#10B981" : colors.surface,
                            borderColor:     reminderFrequency===f ? "#10B981" : colors.border,
                          }]}
                        >
                          <Text style={{ fontSize:14, fontWeight:"600", color: reminderFrequency===f ? "#fff" : colors.text }}>{f}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    {/* Notification status banner — shown after submit */}
                    {notifStatus !== "idle" && (
                      <View style={[s.notifBanner, {
                        backgroundColor:
                          notifStatus === "done"       ? (isDark ? "rgba(16,185,129,0.12)" : "#ECFDF5") :
                          notifStatus === "failed"     ? (isDark ? "rgba(239,68,68,0.12)"  : "#FEF2F2") :
                          /* scheduling */               (isDark ? "rgba(79,70,229,0.12)"  : "#EEF2FF"),
                        borderColor:
                          notifStatus === "done"   ? "#10B981" :
                          notifStatus === "failed" ? "#EF4444" : ACCENT,
                        marginTop: 10,
                      }]}>
                        <Ionicons
                          name={
                            notifStatus === "done"   ? "checkmark-circle"  :
                            notifStatus === "failed" ? "alert-circle"      : "hourglass-outline"
                          }
                          size={15}
                          color={
                            notifStatus === "done"   ? "#10B981" :
                            notifStatus === "failed" ? "#EF4444" : ACCENT
                          }
                        />
                        <Text style={{
                          flex:1, fontSize:12, lineHeight:17,
                          color:
                            notifStatus === "done"   ? "#10B981" :
                            notifStatus === "failed" ? "#EF4444" : ACCENT,
                        }}>
                          {notifStatus === "scheduling" && "Scheduling reminders…"}
                          {notifStatus === "done"       && "Goal reminders scheduled successfully"}
                          {notifStatus === "failed"     && "Reminders unavailable — check app permissions in Settings"}
                        </Text>
                      </View>
                    )}
                  </View>
                )}

                {/* Also show notif status even when reminder toggle is off (deadline notifications still fire) */}
                {!messageReminder && notifStatus !== "idle" && (
                  <View style={[s.notifBanner, {
                    backgroundColor:
                      notifStatus === "done"   ? (isDark ? "rgba(16,185,129,0.12)" : "#ECFDF5") :
                      notifStatus === "failed" ? (isDark ? "rgba(239,68,68,0.12)"  : "#FEF2F2") :
                                                 (isDark ? "rgba(79,70,229,0.12)"  : "#EEF2FF"),
                    borderColor:
                      notifStatus === "done"   ? "#10B981" :
                      notifStatus === "failed" ? "#EF4444" : ACCENT,
                    marginBottom: 12,
                  }]}>
                    <Ionicons
                      name={
                        notifStatus === "done"   ? "checkmark-circle"  :
                        notifStatus === "failed" ? "alert-circle"      : "hourglass-outline"
                      }
                      size={15}
                      color={notifStatus === "done" ? "#10B981" : notifStatus === "failed" ? "#EF4444" : ACCENT}
                    />
                    <Text style={{
                      flex:1, fontSize:12, lineHeight:17,
                      color: notifStatus === "done" ? "#10B981" : notifStatus === "failed" ? "#EF4444" : ACCENT,
                    }}>
                      {notifStatus === "scheduling" && "Scheduling deadline reminders…"}
                      {notifStatus === "done"       && "Deadline reminders set (7 days & 1 day before)"}
                      {notifStatus === "failed"     && "Reminders unavailable — check app permissions in Settings"}
                    </Text>
                  </View>
                )}

                {/* Create button */}
                <TouchableOpacity
                  onPress={handleCreateGoal}
                  disabled={isSubmitting}
                  style={[s.createBtnWrap, isSubmitting && { opacity: 0.6 }]}
                  activeOpacity={0.85}
                >
                  <LinearGradient
                    colors={isDark ? ["#1d4ed8","#4f46e5"] : ["#4F46E5","#7C3AED"]}
                    start={{ x:0, y:0 }} end={{ x:1, y:0 }}
                    style={s.createBtn}
                  >
                    <Ionicons name="flag" size={18} color="#fff" />
                    <Text style={s.createBtnText}>{isSubmitting ? "Creating…" : "Create Goal"}</Text>
                  </LinearGradient>
                </TouchableOpacity>

              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Success overlay */}
      <Modal visible={showSuccessModal} transparent animationType="fade">
        <Animated.View style={[s.successOverlay, { opacity: successFadeAnim }]}>
          <Animated.View style={[s.successCard, {
            backgroundColor: colors.backgroundSecondary,
            transform: [{ scale: scaleAnim }],
          }]}>
            <LinearGradient colors={["#059669","#10B981"]} style={s.successIconBg}>
              <Ionicons name="checkmark" size={36} color="#fff" />
            </LinearGradient>
            <Text style={[s.successTitle, { color: colors.text }]}>Goal Created!</Text>
            <Text style={[s.successSub, { color: colors.textSecondary }]}>
              "{goalName || "Your goal"}" has been saved.
            </Text>
            {notifStatus === "done" && (
              <View style={s.successNotifRow}>
                <Ionicons name="notifications" size={14} color="#10B981" />
                <Text style={{ fontSize:12, color:"#10B981" }}>Reminders set</Text>
              </View>
            )}
          </Animated.View>
        </Animated.View>
      </Modal>
    </>
  )
}

const createStyles = (colors: any, activeTheme: "light" | "dark") =>
  StyleSheet.create({
    overlay:           { flex:1, backgroundColor:"rgba(0,0,0,0.6)", justifyContent:"flex-end" },
    sheet:             { borderTopLeftRadius:24, borderTopRightRadius:24, maxHeight:height*0.92, overflow:"hidden" },
    header:            { flexDirection:"row", alignItems:"center", justifyContent:"space-between", paddingHorizontal:20, paddingVertical:16 },
    headerLeft:        { flexDirection:"row", alignItems:"center", gap:10 },
    headerIconBg:      { width:32, height:32, borderRadius:8, backgroundColor:"rgba(255,255,255,0.2)", alignItems:"center", justifyContent:"center" },
    headerTitle:       { fontSize:18, fontWeight:"700", color:"#fff" },
    closeBtn:          { width:32, height:32, borderRadius:16, backgroundColor:"rgba(255,255,255,0.15)", alignItems:"center", justifyContent:"center" },
    form:              { padding:20, paddingBottom:40 },
    field:             { marginBottom:18 },
    input:             { flex:1, fontSize:16 },
    currency:          { fontSize:18, fontWeight:"700", marginRight:8 },
    amountRow:         { flexDirection:"row", gap:12 },
    dropdown:          { borderRadius:12, borderWidth:1, marginTop:6, overflow:"hidden" },
    dropdownItem:      { flexDirection:"row", alignItems:"center", justifyContent:"space-between", paddingHorizontal:16, paddingVertical:14 },
    progressPreview:   { borderRadius:12, padding:14, marginBottom:18, borderWidth:1 },
    progressPreviewTop:{ flexDirection:"row", justifyContent:"space-between", marginBottom:8 },
    progressBar:       { height:6, borderRadius:3, overflow:"hidden" },
    progressFill:      { height:"100%", borderRadius:3 },
    doneBtn:           { flexDirection:"row", alignItems:"center", justifyContent:"center", gap:6, borderRadius:10, paddingVertical:10, marginTop:6 },
    doneBtnText:       { color:"#fff", fontSize:14, fontWeight:"700" },
    textarea:          { borderRadius:12, padding:14, fontSize:15, borderWidth:1, minHeight:80, textAlignVertical:"top" },
    reminderRow:       { flexDirection:"row", alignItems:"center", gap:12, borderRadius:14, padding:14, marginBottom:4, borderWidth:1 },
    reminderIcon:      { width:36, height:36, borderRadius:9, alignItems:"center", justifyContent:"center" },
    freqRow:           { flexDirection:"row", gap:10 },
    freqChip:          { flex:1, paddingVertical:12, borderRadius:12, borderWidth:1, alignItems:"center" },
    notifBanner:       { flexDirection:"row", alignItems:"flex-start", gap:8, borderRadius:10, padding:10, borderWidth:1 },
    createBtnWrap:     { borderRadius:14, overflow:"hidden", marginTop:8 },
    createBtn:         { flexDirection:"row", alignItems:"center", justifyContent:"center", gap:8, paddingVertical:16 },
    createBtnText:     { color:"#fff", fontSize:16, fontWeight:"700", letterSpacing:0.3 },
    successOverlay:    { flex:1, backgroundColor:"rgba(0,0,0,0.7)", justifyContent:"center", alignItems:"center" },
    successCard:       { width:width*0.75, borderRadius:24, padding:32, alignItems:"center", gap:12, shadowColor:"#000", shadowOffset:{width:0,height:8}, shadowOpacity:0.3, shadowRadius:20, elevation:12 },
    successIconBg:     { width:72, height:72, borderRadius:36, alignItems:"center", justifyContent:"center" },
    successTitle:      { fontSize:22, fontWeight:"800" },
    successSub:        { fontSize:14, textAlign:"center", lineHeight:20 },
    successNotifRow:   { flexDirection:"row", alignItems:"center", gap:6, marginTop:4 },
  })

export default NewGoalModal