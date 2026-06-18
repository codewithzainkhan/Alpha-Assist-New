"use client"

import type React from "react"
import { useState, useEffect, useRef } from "react"
import {
  View, Text, TouchableOpacity, Modal, StyleSheet, TextInput,
  ScrollView, Alert, Dimensions, Animated, KeyboardAvoidingView,
  Platform, ActivityIndicator, Pressable,
} from "react-native"
import DateTimePicker from "@react-native-community/datetimepicker"
import { LinearGradient } from "expo-linear-gradient"
import { Ionicons } from "@expo/vector-icons"
import * as Haptics from "expo-haptics"
import { useTheme } from "../../components/context/ThemeContext"
import { useAuth } from "../../hooks/useAuth"
import { createTask, updateTask, type TaskInput, type TaskFrontend } from "../../services/tasks"
import { scheduleTaskNotifications, cancelNotificationsForTask } from "../../services/notifications"
import { scheduleCallReminder, saveUserPhone, getUserPhone } from "../../services/calls"

const { width, height } = Dimensions.get("window")

interface TaskSchedulingModalProps {
  isVisible: boolean
  onClose: () => void
  onTaskCreated?: () => void
  taskToEdit?: TaskFrontend | null
}

const TASK_TYPES  = ["Work", "Education", "Health", "Enter your own"]
const RECURRENCES = ["None", "Daily", "Weekly", "Monthly"]
const PRIORITY_CONFIG = {
  low:    { label: "Low",    color: "#10B981", icon: "arrow-down-outline"  },
  medium: { label: "Medium", color: "#F59E0B", icon: "remove-outline"      },
  high:   { label: "High",   color: "#EF4444", icon: "arrow-up-outline"    },
}

// ─── Toggle ───────────────────────────────────────────────────────────────────
const Toggle = ({ value, onToggle, activeColor }: {
  value: boolean; onToggle: () => void; activeColor: string
}) => {
  const anim = useRef(new Animated.Value(value ? 1 : 0)).current
  useEffect(() => {
    Animated.timing(anim, { toValue: value ? 1 : 0, duration: 180, useNativeDriver: false }).start()
  }, [value])
  const handle = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    onToggle()
  }
  return (
    <TouchableOpacity onPress={handle} activeOpacity={0.9}>
      <View style={[tg.track, { backgroundColor: value ? activeColor : "#6B7280" }]}>
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

// ─── Field label ──────────────────────────────────────────────────────────────
const FL = ({ text, required, colors }: { text: string; required?: boolean; colors: any }) => (
  <Text style={[fl.l, { color: colors.textSecondary }]}>
    {text}{required && <Text style={{ color: "#EF4444" }}> *</Text>}
  </Text>
)
const fl = StyleSheet.create({
  l: { fontSize: 12, fontWeight: "600", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 8 },
})

// ─── Inline date/time picker ──────────────────────────────────────────────────
const InlinePicker = ({ visible, mode, value, minimumDate, onChange, isDark }: {
  visible: boolean; mode: "date" | "time"; value: Date
  minimumDate?: Date; onChange: (d: Date) => void; isDark: boolean
}) => {
  const anim = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.spring(anim, { toValue: visible ? 1 : 0, useNativeDriver: false, tension: 70, friction: 12 }).start()
  }, [visible])
  if (!visible) return null
  return (
    <Animated.View style={[ip.wrap, { backgroundColor: isDark ? "#1C1C1E" : "#F2F2F7" }, { opacity: anim, transform: [{ scaleY: anim }] }]}>
      <DateTimePicker
        value={value} mode={mode} display="spinner" minimumDate={minimumDate}
        onChange={(_, d) => { if (d) onChange(d) }}
        textColor={isDark ? "#fff" : "#000"}
        style={{ backgroundColor: isDark ? "#1C1C1E" : "#F2F2F7" }}
      />
    </Animated.View>
  )
}
const ip = StyleSheet.create({ wrap: { borderRadius: 14, overflow: "hidden", marginTop: 6, marginBottom: 4 } })

// ─── Phone number popup ───────────────────────────────────────────────────────
const PhoneNumberModal = ({
  visible, onSave, onCancel, isDark, colors, saving, type,
}: {
  visible: boolean; onSave: (phone: string) => void; onCancel: () => void
  isDark: boolean; colors: any; saving: boolean; type: "call" | "whatsapp"
}) => {
  const [phone, setPhone] = useState("")
  const ACCENT    = isDark ? "#60A5FA" : "#4F46E5"
  const isWA      = type === "whatsapp"
  const iconName  = isWA ? "logo-whatsapp" : "call"
  const gradColors: [string, string] = isWA ? ["#25D366", "#128C7E"] : ["#4F46E5", "#7C3AED"]

  const handleSave = () => {
    const cleaned = phone.replace(/\s/g, "")
    if (cleaned.length < 7) { Alert.alert("Invalid Number", "Please enter a valid phone number with country code (e.g. +923001234567)"); return }
    onSave(cleaned)
  }

  if (!visible) return null

  // Renders as an absolute overlay INSIDE the parent Modal — avoids iOS nested Modal bug
  return (
    <View style={{
      position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "center",
      alignItems: "center", padding: 24, zIndex: 999,
    }}>
      <View style={{
        width: "100%", borderRadius: 24, padding: 28,
        backgroundColor: isDark ? "#1C1C2E" : "#fff",
        shadowColor: "#000", shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3, shadowRadius: 20, elevation: 12,
      }}>
        {/* Icon */}
        <View style={{ alignItems: "center", marginBottom: 20 }}>
          <LinearGradient colors={gradColors} style={{ width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center" }}>
            <Ionicons name={iconName as any} size={28} color="#fff" />
          </LinearGradient>
        </View>

        <Text style={{ fontSize: 20, fontWeight: "800", color: colors.text, textAlign: "center", marginBottom: 8 }}>
          {isWA ? "WhatsApp Number Required" : "Phone Number Required"}
        </Text>
        <Text style={{ fontSize: 14, color: colors.textMuted, textAlign: "center", lineHeight: 20, marginBottom: 24 }}>
          {isWA
            ? "Enter your WhatsApp number to receive a reminder message. It will be saved to your profile."
            : "To receive a call reminder, we need your phone number. It will be saved to your profile for future use."}
        </Text>

        {/* Input */}
        <View style={{
          flexDirection: "row", alignItems: "center",
          backgroundColor: isDark ? "rgba(255,255,255,0.06)" : "#F3F4F6",
          borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14,
          borderWidth: 1, borderColor: isDark ? "rgba(255,255,255,0.1)" : "#E5E7EB",
          marginBottom: 8,
        }}>
          <Ionicons name="call-outline" size={18} color={ACCENT} style={{ marginRight: 10 }} />
          <TextInput
            style={{ flex: 1, fontSize: 16, color: colors.text }}
            placeholder="+92 300 1234567"
            placeholderTextColor={colors.textMuted}
            value={phone}
            onChangeText={setPhone}
            keyboardType="phone-pad"
            autoFocus
          />
        </View>
        <Text style={{ fontSize: 11, color: colors.textMuted, marginBottom: 24 }}>
          Include country code (e.g. +92 for Pakistan, +1 for USA)
        </Text>

        {/* Buttons */}
        <View style={{ gap: 10 }}>
          <TouchableOpacity onPress={handleSave} disabled={saving} activeOpacity={0.85}
            style={{ borderRadius: 14, overflow: "hidden", opacity: saving ? 0.7 : 1 }}>
            <LinearGradient colors={["#4F46E5", "#7C3AED"]} start={{ x:0, y:0 }} end={{ x:1, y:0 }}
              style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 15 }}>
              {saving
                ? <ActivityIndicator size="small" color="#fff" />
                : <Ionicons name="checkmark-circle" size={18} color="#fff" />
              }
              <Text style={{ color: "#fff", fontSize: 15, fontWeight: "700" }}>
                {saving ? "Saving…" : "Save & Enable Call Reminder"}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity onPress={onCancel} disabled={saving}
            style={{ paddingVertical: 12, alignItems: "center" }}>
            <Text style={{ fontSize: 14, color: colors.textMuted }}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
const TaskSchedulingModal: React.FC<TaskSchedulingModalProps> = ({
  isVisible, onClose, onTaskCreated, taskToEdit,
}) => {
  const { colors, activeTheme } = useTheme()
  const { user } = useAuth()
  const isDark  = activeTheme === "dark"
  const ACCENT  = isDark ? "#60A5FA" : "#4F46E5"

  // form
  const [taskName,       setTaskName]       = useState("")
  const [taskType,       setTaskType]       = useState("")
  const [customTaskType, setCustomTaskType] = useState("")
  const [description,    setDescription]    = useState("")
  const [selectedDate,   setSelectedDate]   = useState(new Date())
  const [scheduledTime,  setScheduledTime]  = useState(() => {
    const d = new Date(); d.setMinutes(d.getMinutes() + 30); return d
  })
  const [priority,     setPriority]     = useState<"low"|"medium"|"high">("medium")
  const [callReminder,    setCallReminder]    = useState(false)
  const [messageReminder, setMessageReminder] = useState(false)
  const [reminderTime,    setReminderTime]    = useState(new Date())
  const [recurrence,      setRecurrence]      = useState("None")

  // phone number flow
  const [showPhoneModal,  setShowPhoneModal]  = useState(false)
  const [savingPhone,     setSavingPhone]     = useState(false)
  const [userPhone,       setUserPhone]       = useState<string | null>(null)
  const [schedulingCall,  setSchedulingCall]  = useState(false)

  type OpenPicker = "date" | "time" | "reminder" | null
  const [openPicker,       setOpenPicker]       = useState<OpenPicker>(null)
  const [showTypeDropdown, setShowTypeDropdown] = useState(false)
  const [showSuccess,      setShowSuccess]      = useState(false)
  const [isSubmitting,     setIsSubmitting]     = useState(false)
  const [notifStatus,      setNotifStatus]      = useState<"idle"|"scheduling"|"done"|"failed">("idle")

  const scaleAnim       = useRef(new Animated.Value(0)).current
  const successFadeAnim = useRef(new Animated.Value(0)).current
  const scrollRef       = useRef<ScrollView>(null)

  // Load user's saved phone on open
  useEffect(() => {
    if (!isVisible || !user?.id) return
    getUserPhone(user.id).then(setUserPhone)
  }, [isVisible, user?.id])

  useEffect(() => {
    if (!isVisible) return
    if (taskToEdit) {
      setTaskName(taskToEdit.taskName)
      setTaskType(taskToEdit.taskType)
      setDescription(taskToEdit.description || "")
      setSelectedDate(new Date(taskToEdit.scheduledDate))
      const [h, m] = taskToEdit.scheduledTime.split(":")
      const td = new Date(); td.setHours(+h, +m, 0); setScheduledTime(td)
      setPriority(taskToEdit.priority)
      setCallReminder(taskToEdit.callReminder)
      setMessageReminder(taskToEdit.messageReminder)
      if (taskToEdit.reminderTime) {
        const [rh, rm] = taskToEdit.reminderTime.split(":")
        const rd = new Date(); rd.setHours(+rh, +rm, 0); setReminderTime(rd)
      }
      setRecurrence(taskToEdit.recurrence || "None")
    } else {
      resetForm()
    }
  }, [taskToEdit, isVisible])

  const resetForm = () => {
    setTaskName(""); setTaskType(""); setCustomTaskType(""); setDescription("")
    setSelectedDate(new Date())
    const d = new Date(); d.setMinutes(d.getMinutes() + 30); setScheduledTime(d)
    setPriority("medium"); setCallReminder(false); setMessageReminder(false)
    setReminderTime(new Date()); setRecurrence("None")
    setShowTypeDropdown(false); setOpenPicker(null); setNotifStatus("idle")
  }

  const isScheduledInFuture = () => {
    const c = new Date(selectedDate)
    c.setHours(scheduledTime.getHours(), scheduledTime.getMinutes(), 0)
    return c > new Date()
  }

  const fmtTime = (d: Date) =>
    `${d.getHours().toString().padStart(2,"0")}:${d.getMinutes().toString().padStart(2,"0")}:00`
  const fmtDate = (d: Date) =>
    `${d.getFullYear()}-${(d.getMonth()+1).toString().padStart(2,"0")}-${d.getDate().toString().padStart(2,"0")}`

  // ── Reminder toggles ─────────────────────────────────────────────────────
  const handleToggleCallReminder = () => {
    if (callReminder) {
      setCallReminder(false)
    } else {
      if (!userPhone) {
        setShowPhoneModal(true)
      } else {
        setCallReminder(true)
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      }
    }
  }

  const handleToggleMessageReminder = () => {
    setMessageReminder(prev => !prev)
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
  }

  // ── Save phone to profiles ────────────────────────────────────────────────
  const handleSavePhone = async (phone: string) => {
    if (!user?.id) return
    setSavingPhone(true)
    try {
      await saveUserPhone(user.id, phone)
      setUserPhone(phone)
      setShowPhoneModal(false)
      setCallReminder(true)
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    } catch (e) {
      Alert.alert("Error", "Failed to save phone number. Please try again.")
    } finally {
      setSavingPhone(false)
    }
  }

  // scheduleCallReminder is imported from calls.ts

  const handleSaveTask = async () => {
    if (!user?.id)        { Alert.alert("Error", "You must be logged in"); return }
    if (!taskName.trim()) { Alert.alert("Validation", "Please enter a task name"); return }
    if (!taskType)        { Alert.alert("Validation", "Please select a task type"); return }
    if (taskType === "Enter your own" && !customTaskType.trim()) {
      Alert.alert("Validation", "Please enter your custom task type"); return
    }
    if (!taskToEdit && !isScheduledInFuture()) {
      Alert.alert("Validation", "Please schedule the task for a future date and time"); return
    }

    setIsSubmitting(true); setOpenPicker(null)
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)

    const hasReminderTime = callReminder || messageReminder
    const taskInput: TaskInput = {
      task_name:        taskName.trim(),
      task_type:        taskType === "Enter your own" ? customTaskType.trim() : taskType,
      description:      description.trim() || undefined,
      scheduled_date:   fmtDate(selectedDate),
      scheduled_time:   fmtTime(scheduledTime),
      priority,
      call_reminder:      callReminder,
      message_reminder:   messageReminder,
      whatsapp_reminder:  false,
      reminder_time:    hasReminderTime ? fmtTime(reminderTime) : undefined,
      recurrence:       recurrence !== "None" ? recurrence : undefined,
      progress:         taskToEdit?.progress || 0,
    }

    try {
      let savedId: string
      if (taskToEdit) {
        await updateTask(taskToEdit.id, user.id, taskInput)
        savedId = taskToEdit.id
      } else {
        const created = await createTask(user.id, taskInput)
        savedId = created.id
      }

      if (savedId && (callReminder || messageReminder)) {
        setNotifStatus("scheduling")
        try {
          if (messageReminder) {
            await scheduleTaskNotifications({
              id:              savedId,
              taskName:        taskName.trim(),
              scheduledDate:   fmtDate(selectedDate),
              scheduledTime:   fmtTime(scheduledTime),
              messageReminder: true,
              reminderTime:    fmtTime(reminderTime),
            })
          }

          if (callReminder && userPhone) {
            setSchedulingCall(true)
            await scheduleCallReminder(savedId, taskName.trim(), userPhone, fmtTime(reminderTime), fmtDate(selectedDate))
            setSchedulingCall(false)
          }

          setNotifStatus("done")
        } catch (notifErr) {
          console.warn("Notification/call scheduling failed:", notifErr)
          setNotifStatus("failed")
        }
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      setShowSuccess(true)
      Animated.parallel([
        Animated.spring(scaleAnim,       { toValue: 1, useNativeDriver: true, tension: 60, friction: 8 }),
        Animated.timing(successFadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]).start()

      setTimeout(() => {
        setShowSuccess(false)
        scaleAnim.setValue(0); successFadeAnim.setValue(0)
        resetForm(); onClose(); onTaskCreated?.()
      }, 1800)
    } catch (err) {
      console.error("Error saving task:", err)
      Alert.alert("Error", `Failed to ${taskToEdit ? "update" : "create"} task.`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const togglePicker = (which: OpenPicker) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setOpenPicker(prev => prev === which ? null : which)
  }

  const s = createStyles(colors, activeTheme)

  return (
    <>
      <Modal visible={isVisible} transparent animationType="slide" onRequestClose={onClose}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <Pressable style={s.backdrop} onPress={onClose} />
          <View style={[s.sheet, { backgroundColor: colors.backgroundSecondary }]}>

          {/* ── Phone number popup — inside same Modal to avoid iOS stacking issue ── */}
          {showPhoneModal && (
            <PhoneNumberModal
              visible={showPhoneModal}
              onSave={handleSavePhone}
              onCancel={() => setShowPhoneModal(false)}
              isDark={isDark}
              colors={colors}
              saving={savingPhone}
              type="call"
            />
          )}

              {/* Header */}
              <LinearGradient
                colors={isDark ? ["#065f46","#047857"] : ["#059669","#10B981"]}
                start={{ x:0, y:0 }} end={{ x:1, y:0 }} style={s.header}
              >
                <View style={s.headerLeft}>
                  <View style={s.headerIconBg}>
                    <Ionicons name={taskToEdit ? "create" : "calendar"} size={18} color="#fff" />
                  </View>
                  <Text style={s.headerTitle}>{taskToEdit ? "Edit Task" : "Schedule New Task"}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onClose() }}
                  style={s.closeBtn}
                >
                  <Ionicons name="close" size={20} color="rgba(255,255,255,0.8)" />
                </TouchableOpacity>
              </LinearGradient>

              <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false}
                contentContainerStyle={s.form} keyboardShouldPersistTaps="handled">

                {/* Task Name */}
                <View style={s.field}>
                  <FL text="Task Name" required colors={colors} />
                  <View style={[s.inputRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Ionicons name="checkmark-circle-outline" size={18} color={colors.textMuted} style={{ marginRight: 10 }} />
                    <TextInput
                      style={[s.input, { color: colors.text }]}
                      placeholder="e.g., Meeting with client, Gym workout"
                      placeholderTextColor={colors.textMuted}
                      value={taskName} onChangeText={setTaskName}
                    />
                  </View>
                </View>

                {/* Task Type */}
                <View style={s.field}>
                  <FL text="Task Type" required colors={colors} />
                  <TouchableOpacity
                    onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowTypeDropdown(!showTypeDropdown) }}
                    style={[s.inputRow, { backgroundColor: colors.surface, borderColor: showTypeDropdown ? ACCENT : colors.border }]}
                  >
                    <Ionicons name="list-outline" size={18} color={colors.textMuted} style={{ marginRight: 10 }} />
                    <Text style={[{ flex:1, fontSize:16 }, taskType ? { color: colors.text } : { color: colors.textMuted }]}>
                      {taskType || "Select task type"}
                    </Text>
                    <Ionicons name={showTypeDropdown ? "chevron-up" : "chevron-down"} size={18} color={ACCENT} />
                  </TouchableOpacity>
                  {showTypeDropdown && (
                    <View style={[s.dropdown, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                      {TASK_TYPES.map((t, i) => (
                        <TouchableOpacity key={t}
                          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setTaskType(t); setShowTypeDropdown(false) }}
                          style={[s.dropdownItem, i < TASK_TYPES.length-1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }]}
                        >
                          <Text style={[{ fontSize:15 }, taskType===t ? { color: ACCENT, fontWeight:"700" } : { color: colors.text }]}>{t}</Text>
                          {taskType===t && <Ionicons name="checkmark" size={16} color={ACCENT} />}
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>

                {/* Custom Task Type */}
                {taskType === "Enter your own" && (
                  <View style={s.field}>
                    <FL text="Custom Task Type" required colors={colors} />
                    <View style={[s.inputRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                      <Ionicons name="pencil-outline" size={18} color={colors.textMuted} style={{ marginRight: 10 }} />
                      <TextInput
                        style={[s.input, { color: colors.text }]}
                        placeholder="Enter your task type"
                        placeholderTextColor={colors.textMuted}
                        value={customTaskType} onChangeText={setCustomTaskType}
                      />
                    </View>
                  </View>
                )}

                {/* Date + Time */}
                <View style={s.twoCol}>
                  <View style={[s.field, { flex:1 }]}>
                    <FL text="Date" required colors={colors} />
                    <TouchableOpacity onPress={() => togglePicker("date")}
                      style={[s.inputRow, { backgroundColor: colors.surface, borderColor: openPicker==="date" ? ACCENT : colors.border }]}>
                      <Ionicons name="calendar-outline" size={16} color={ACCENT} style={{ marginRight: 8 }} />
                      <Text style={{ flex:1, fontSize:14, color: colors.text }}>
                        {selectedDate.toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" })}
                      </Text>
                      <Ionicons name={openPicker==="date" ? "chevron-up" : "chevron-down"} size={14} color={ACCENT} />
                    </TouchableOpacity>
                  </View>
                  <View style={[s.field, { flex:1 }]}>
                    <FL text="Time" required colors={colors} />
                    <TouchableOpacity onPress={() => togglePicker("time")}
                      style={[s.inputRow, { backgroundColor: colors.surface, borderColor: openPicker==="time" ? ACCENT : colors.border }]}>
                      <Ionicons name="time-outline" size={16} color={ACCENT} style={{ marginRight: 8 }} />
                      <Text style={{ flex:1, fontSize:14, color: colors.text }}>
                        {scheduledTime.toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" })}
                      </Text>
                      <Ionicons name={openPicker==="time" ? "chevron-up" : "chevron-down"} size={14} color={ACCENT} />
                    </TouchableOpacity>
                  </View>
                </View>
                <InlinePicker visible={openPicker==="date"} mode="date" value={selectedDate} minimumDate={new Date()} onChange={setSelectedDate} isDark={isDark} />
                <InlinePicker visible={openPicker==="time"} mode="time" value={scheduledTime} onChange={setScheduledTime} isDark={isDark} />

                {/* Priority */}
                <View style={s.field}>
                  <FL text="Priority" colors={colors} />
                  <View style={s.priorityRow}>
                    {(Object.entries(PRIORITY_CONFIG) as [string, typeof PRIORITY_CONFIG.low][]).map(([key, cfg]) => (
                      <TouchableOpacity key={key}
                        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setPriority(key as any) }}
                        style={[s.priorityChip, { backgroundColor: priority===key ? cfg.color : colors.surface, borderColor: priority===key ? cfg.color : colors.border }]}>
                        <Ionicons name={cfg.icon as any} size={14} color={priority===key ? "#fff" : cfg.color} />
                        <Text style={{ fontSize:13, fontWeight:"600", color: priority===key ? "#fff" : colors.text }}>{cfg.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Description */}
                <View style={s.field}>
                  <FL text="Description" colors={colors} />
                  <TextInput
                    style={[s.textarea, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                    placeholder="Add notes about your task..."
                    placeholderTextColor={colors.textMuted}
                    value={description} onChangeText={setDescription}
                    multiline numberOfLines={3} textAlignVertical="top" maxLength={300}
                  />
                  <Text style={{ fontSize:11, textAlign:"right", marginTop:4, color: colors.textMuted }}>{description.length}/300</Text>
                </View>

                {/* ── Reminders ── */}
                <View style={[s.remindersCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={s.remindersHeader}>
                    <View style={[s.remindersIconBg, { backgroundColor: isDark ? "#1e3a5f" : "#EEF2FF" }]}>
                      <Ionicons name="notifications" size={16} color={ACCENT} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize:15, fontWeight:"700", color: colors.text }}>Reminders</Text>
                    </View>
                  </View>

                  {/* ── Call Reminder row ── */}
                  <View style={[s.reminderRow, { backgroundColor: callReminder ? (isDark ? "rgba(79,70,229,0.1)" : "#EEF2FF") : "transparent", borderRadius: 12, padding: 12 }]}>
                    <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: callReminder ? ACCENT : (isDark ? "rgba(255,255,255,0.08)" : "#F3F4F6"), alignItems: "center", justifyContent: "center" }}>
                      <Ionicons name="call" size={18} color={callReminder ? "#fff" : colors.textMuted} />
                    </View>
                    <View style={{ flex:1, marginLeft: 12 }}>
                      <Text style={{ fontSize:14, fontWeight:"700", color: colors.text }}>Call Reminder</Text>
                      <Text style={{ fontSize:12, color: colors.textMuted, marginTop:2 }}>
                        {callReminder && userPhone ? `AI voice call to ${userPhone}` : "AI voice call via Twilio"}
                      </Text>
                    </View>
                    <Toggle value={callReminder} onToggle={handleToggleCallReminder} activeColor={ACCENT} />
                  </View>

                  {/* Divider */}
                  <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: 8 }} />

                  {/* ── Message Reminder row ── */}
                  <View style={[s.reminderRow, { backgroundColor: messageReminder ? (isDark ? "rgba(16,185,129,0.1)" : "#ECFDF5") : "transparent", borderRadius: 12, padding: 12 }]}>
                    <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: messageReminder ? "#10B981" : (isDark ? "rgba(255,255,255,0.08)" : "#F3F4F6"), alignItems: "center", justifyContent: "center" }}>
                      <Ionicons name="chatbubble" size={18} color={messageReminder ? "#fff" : colors.textMuted} />
                    </View>
                    <View style={{ flex:1, marginLeft: 12 }}>
                      <Text style={{ fontSize:14, fontWeight:"700", color: colors.text }}>Message Reminder</Text>
                      <Text style={{ fontSize:12, color: colors.textMuted, marginTop:2 }}>Push notification on your device</Text>
                    </View>
                    <Toggle value={messageReminder} onToggle={handleToggleMessageReminder} activeColor="#10B981" />
                  </View>

                  {/* ── Reminder time picker (shown when any reminder is active) ── */}
                  {(callReminder || messageReminder) && (
                    <View style={{ marginTop: 14, paddingHorizontal: 4 }}>
                      <FL text="Reminder Time" colors={colors} />
                      <TouchableOpacity onPress={() => togglePicker("reminder")}
                        style={[s.inputRow, { backgroundColor: colors.backgroundSecondary, borderColor: openPicker==="reminder" ? ACCENT : colors.border }]}>
                        <Ionicons name="alarm-outline" size={16} color={ACCENT} style={{ marginRight: 8 }} />
                        <Text style={{ flex:1, fontSize:15, color: colors.text }}>
                          {reminderTime.toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" })}
                        </Text>
                        <Ionicons name={openPicker==="reminder" ? "chevron-up" : "chevron-down"} size={14} color={ACCENT} />
                      </TouchableOpacity>
                      <InlinePicker visible={openPicker==="reminder"} mode="time" value={reminderTime} onChange={setReminderTime} isDark={isDark} />
                    </View>
                  )}

                  {/* Notification status */}
                  {notifStatus !== "idle" && (
                    <View style={[s.notifStatus, {
                      backgroundColor: notifStatus==="done" ? (isDark?"rgba(16,185,129,0.12)":"#ECFDF5") : notifStatus==="failed" ? (isDark?"rgba(239,68,68,0.12)":"#FEF2F2") : (isDark?"rgba(79,70,229,0.12)":"#EEF2FF"),
                      borderColor: notifStatus==="done" ? "#10B981" : notifStatus==="failed" ? "#EF4444" : ACCENT,
                    }]}>
                      <Ionicons name={notifStatus==="done" ? "checkmark-circle" : notifStatus==="failed" ? "alert-circle" : "hourglass-outline"} size={15}
                        color={notifStatus==="done" ? "#10B981" : notifStatus==="failed" ? "#EF4444" : ACCENT} />
                      <Text style={{ fontSize:12, lineHeight:17, color: notifStatus==="done" ? "#10B981" : notifStatus==="failed" ? "#EF4444" : ACCENT }}>
                        {notifStatus==="scheduling" && (schedulingCall ? "Scheduling Twilio call…" : "Scheduling notifications…")}
                        {notifStatus==="done"       && (callReminder && messageReminder ? "Call & push reminders scheduled ✓" : callReminder ? "Call reminder scheduled via Twilio ✓" : "Push notification scheduled ✓")}
                        {notifStatus==="failed"     && "Reminder unavailable — check app permissions in Settings"}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Recurrence */}
                <View style={s.field}>
                  <FL text="Recurrence" colors={colors} />
                  <View style={s.recurrenceRow}>
                    {RECURRENCES.map((r) => (
                      <TouchableOpacity key={r}
                        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setRecurrence(r) }}
                        style={[s.recurrenceChip, { backgroundColor: recurrence===r ? ACCENT : colors.surface, borderColor: recurrence===r ? ACCENT : colors.border }]}>
                        <Text style={{ fontSize:13, fontWeight:"600", color: recurrence===r ? "#fff" : colors.text }}>{r}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Save */}
                <TouchableOpacity onPress={handleSaveTask} disabled={isSubmitting}
                  style={[s.saveBtnWrap, isSubmitting && { opacity: 0.6 }]} activeOpacity={0.85}>
                  <LinearGradient colors={isDark ? ["#065f46","#047857"] : ["#059669","#10B981"]} start={{ x:0, y:0 }} end={{ x:1, y:0 }} style={s.saveBtn}>
                    <Ionicons name={taskToEdit ? "create" : "checkmark-circle"} size={18} color="#fff" />
                    <Text style={s.saveBtnText}>{isSubmitting ? "Saving…" : taskToEdit ? "Update Task" : "Create Task"}</Text>
                  </LinearGradient>
                </TouchableOpacity>

              </ScrollView>
            </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Success overlay */}
      <Modal visible={showSuccess} transparent animationType="fade">
        <Animated.View style={[s.successOverlay, { opacity: successFadeAnim }]}>
          <Animated.View style={[s.successCard, { backgroundColor: colors.backgroundSecondary, transform: [{ scale: scaleAnim }] }]}>
            <LinearGradient colors={["#059669","#10B981"]} style={s.successIconBg}>
              <Ionicons name="checkmark" size={36} color="#fff" />
            </LinearGradient>
            <Text style={[s.successTitle, { color: colors.text }]}>Task {taskToEdit ? "Updated" : "Created"}!</Text>
            <Text style={[s.successSub, { color: colors.textSecondary }]}>"{taskName}" has been {taskToEdit ? "updated" : "scheduled"}.</Text>
            {notifStatus === "done" && (
              <View style={s.successNotifRow}>
                <Ionicons name={callReminder ? "call" : "notifications"} size={14} color="#10B981" />
                <Text style={{ fontSize:12, color:"#10B981" }}>
                  {callReminder && messageReminder ? "Call & push reminders set" : callReminder ? "Call reminder set via Twilio" : "Push notification set"}
                </Text>
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
    backdrop:        { flex: 1, backgroundColor: "rgba(0,0,0,0.6)" },
    sheet:           { height: height * 0.92, borderTopLeftRadius:24, borderTopRightRadius:24, overflow:"hidden" },
    header:          { flexDirection:"row", alignItems:"center", justifyContent:"space-between", paddingHorizontal:20, paddingVertical:16 },
    headerLeft:      { flexDirection:"row", alignItems:"center", gap:10 },
    headerIconBg:    { width:32, height:32, borderRadius:8, backgroundColor:"rgba(255,255,255,0.2)", alignItems:"center", justifyContent:"center" },
    headerTitle:     { fontSize:18, fontWeight:"700", color:"#fff" },
    closeBtn:        { width:32, height:32, borderRadius:16, backgroundColor:"rgba(255,255,255,0.15)", alignItems:"center", justifyContent:"center" },
    form:            { padding:20, paddingBottom:40 },
    field:           { marginBottom:18 },
    inputRow:        { flexDirection:"row", alignItems:"center", borderRadius:12, paddingHorizontal:14, paddingVertical:13, borderWidth:1 },
    input:           { flex:1, fontSize:16 },
    twoCol:          { flexDirection:"row", gap:12 },
    dropdown:        { borderRadius:12, borderWidth:1, marginTop:6, overflow:"hidden" },
    dropdownItem:    { flexDirection:"row", alignItems:"center", justifyContent:"space-between", paddingHorizontal:16, paddingVertical:14 },
    priorityRow:     { flexDirection:"row", gap:10 },
    priorityChip:    { flex:1, flexDirection:"row", alignItems:"center", justifyContent:"center", gap:6, paddingVertical:12, borderRadius:12, borderWidth:1 },
    textarea:        { borderRadius:12, padding:14, fontSize:15, borderWidth:1, minHeight:80, textAlignVertical:"top" },
    remindersCard:   { borderRadius:16, padding:16, marginBottom:18, borderWidth:1 },
    remindersHeader: { flexDirection:"row", alignItems:"center", gap:10, marginBottom:12 },
    remindersIconBg: { width:32, height:32, borderRadius:8, alignItems:"center", justifyContent:"center" },
    reminderRow:     { flexDirection:"row", alignItems:"center" },
    notifStatus:     { flexDirection:"row", alignItems:"flex-start", gap:8, borderRadius:10, padding:10, marginTop:12, borderWidth:1 },
    recurrenceRow:   { flexDirection:"row", gap:8 },
    recurrenceChip:  { flex:1, paddingVertical:11, borderRadius:12, borderWidth:1, alignItems:"center" },
    saveBtnWrap:     { borderRadius:14, overflow:"hidden", marginTop:8 },
    saveBtn:         { flexDirection:"row", alignItems:"center", justifyContent:"center", gap:8, paddingVertical:16 },
    saveBtnText:     { color:"#fff", fontSize:16, fontWeight:"700", letterSpacing:0.3 },
    successOverlay:  { flex:1, backgroundColor:"rgba(0,0,0,0.7)", justifyContent:"center", alignItems:"center" },
    successCard:     { width:width*0.75, borderRadius:24, padding:32, alignItems:"center", gap:12, shadowColor:"#000", shadowOffset:{width:0,height:8}, shadowOpacity:0.3, shadowRadius:20, elevation:12 },
    successIconBg:   { width:72, height:72, borderRadius:36, alignItems:"center", justifyContent:"center" },
    successTitle:    { fontSize:22, fontWeight:"800" },
    successSub:      { fontSize:14, textAlign:"center", lineHeight:20 },
    successNotifRow: { flexDirection:"row", alignItems:"center", gap:6, marginTop:4 },
  })

export default TaskSchedulingModal