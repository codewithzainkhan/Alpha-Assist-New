"use client"

import type React from "react"
import { useState, useRef } from "react"
import {
  View, Text, Modal, TouchableOpacity, TextInput, StyleSheet,
  Dimensions, Alert, Animated, ScrollView, KeyboardAvoidingView, Platform,
} from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import { Ionicons } from "@expo/vector-icons"
import * as Haptics from "expo-haptics"
import { useTheme } from "../context/ThemeContext"
import { useAuth } from "../../hooks/useAuth"
import { addMoneyToGoal, type GoalFrontend } from "../../services/goals"
import { formatPKR } from "../../utils/currency"
import { fireGoalCompletedNotification, cancelNotificationsForGoal } from "../../services/notifications"

const { width } = Dimensions.get("window")

interface AddMoneyModalProps {
  isVisible: boolean
  onClose: () => void
  goal: GoalFrontend | null
  onMoneyAdded?: () => void
}

const QUICK_AMOUNTS = [500, 1000, 2000, 5000]

const AddMoneyModal: React.FC<AddMoneyModalProps> = ({ isVisible, onClose, goal, onMoneyAdded }) => {
  const { colors, activeTheme } = useTheme()
  const { user } = useAuth()
  const isDark = activeTheme === "dark"

  const [amount,           setAmount]           = useState("")
  const [note,             setNote]             = useState("")
  const [showSuccessModal, setShowSuccessModal] = useState(false)
  const [isSubmitting,     setIsSubmitting]     = useState(false)
  const [goalJustCompleted, setGoalJustCompleted] = useState(false)

  const scaleAnim       = useRef(new Animated.Value(0)).current
  const successFadeAnim = useRef(new Animated.Value(0)).current

  if (!goal || !user?.id) return null

  const remainingAmount = Math.max(0, goal.targetAmount - goal.currentAmount)
  const currentPct = goal.targetAmount > 0
    ? Math.min(100, Math.round((goal.currentAmount / goal.targetAmount) * 100))
    : 0
  const previewPct = amount && parseFloat(amount) > 0
    ? Math.min(100, Math.round(((goal.currentAmount + parseFloat(amount)) / goal.targetAmount) * 100))
    : currentPct

  const quickAmounts = [
    ...QUICK_AMOUNTS.filter((q) => q <= remainingAmount * 1.1),
    remainingAmount > 0 && !QUICK_AMOUNTS.includes(remainingAmount) ? remainingAmount : null,
  ].filter(Boolean) as number[]

  const handleAddMoney = async () => {
    if (!amount.trim() || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      Alert.alert("Validation", "Please enter a valid amount"); return
    }
    const newTotal = goal.currentAmount + parseFloat(amount)
    if (newTotal > goal.targetAmount * 1.1) {
      const overPct = (((newTotal - goal.targetAmount) / goal.targetAmount) * 100).toFixed(1)
      Alert.alert(
        "Over Target",
        `This will exceed your target by ${overPct}%. Continue?`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Continue", onPress: () => saveMoney(parseFloat(amount)) },
        ]
      )
      return
    }
    saveMoney(parseFloat(amount))
  }

  const saveMoney = async (amountToAdd: number) => {
    setIsSubmitting(true)
    setGoalJustCompleted(false)
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    try {
      const updated = await addMoneyToGoal(goal.id, user.id, amountToAdd, note.trim() || undefined)

      // ── Notification logic ────────────────────────────────────────────────
      const isNowComplete = updated.currentAmount >= updated.targetAmount

      if (isNowComplete) {
        // Goal just hit 100% — fire the celebration notification immediately
        // and cancel any remaining deadline/progress reminders (no longer needed)
        try {
          await fireGoalCompletedNotification(goal.goalName, goal.id)
          await cancelNotificationsForGoal(goal.id)
        } catch (notifErr) {
          console.warn("Goal completed notification failed:", notifErr)
        }
        setGoalJustCompleted(true)
      }
      // ─────────────────────────────────────────────────────────────────────

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      setShowSuccessModal(true)
      Animated.parallel([
        Animated.spring(scaleAnim,       { toValue: 1, useNativeDriver: true, tension: 60, friction: 8 }),
        Animated.timing(successFadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]).start()
      setTimeout(() => {
        setShowSuccessModal(false)
        scaleAnim.setValue(0); successFadeAnim.setValue(0)
        setAmount(""); setNote(""); setGoalJustCompleted(false)
        onClose(); onMoneyAdded?.()
      }, 2000)
    } catch (error) {
      console.error("Error adding money:", error)
      Alert.alert("Error", "Failed to add money. Please try again.")
    } finally {
      setIsSubmitting(false)
    }
  }

  const isGoalComplete = goal.currentAmount >= goal.targetAmount
  const ACCENT = isDark ? "#34D399" : "#059669"
  const styles = createStyles(colors, activeTheme)

  return (
    <>
      <Modal visible={isVisible} transparent animationType="slide" onRequestClose={onClose}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={styles.overlay}>
            <View style={[styles.sheet, { backgroundColor: colors.backgroundSecondary }]}>

              {/* Header */}
              <LinearGradient
                colors={isDark ? ["#064e3b","#065f46"] : ["#059669","#10B981"]}
                start={{ x:0, y:0 }} end={{ x:1, y:0 }}
                style={styles.header}
              >
                <View style={styles.headerLeft}>
                  <View style={styles.headerIconBg}>
                    <Ionicons name="wallet" size={18} color="#fff" />
                  </View>
                  <Text style={styles.headerTitle}>Add Money</Text>
                </View>
                <TouchableOpacity
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onClose() }}
                  style={styles.closeBtn}
                >
                  <Ionicons name="close" size={20} color="rgba(255,255,255,0.8)" />
                </TouchableOpacity>
              </LinearGradient>

              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>

                {/* Goal summary card */}
                <View style={[styles.goalCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <View style={styles.goalCardTop}>
                    <View style={[styles.goalIconBg, { backgroundColor: isDark ? "#064e3b" : "#ECFDF5" }]}>
                      <Ionicons name="flag" size={18} color={ACCENT} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.goalName, { color: colors.text }]}>{goal.goalName}</Text>
                      <Text style={[styles.goalType, { color: colors.textSecondary }]}>{goal.goalType}</Text>
                    </View>
                    {isGoalComplete && (
                      <View style={[styles.completeBadge, { backgroundColor: isDark ? "#064e3b" : "#ECFDF5" }]}>
                        <Text style={{ fontSize:11, fontWeight:"700", color: ACCENT }}>✓ COMPLETE</Text>
                      </View>
                    )}
                  </View>

                  {/* Progress bar */}
                  <View style={styles.progressSection}>
                    <View style={[styles.progressTrack, { backgroundColor: isDark ? "#1e3a2a" : "#D1FAE5" }]}>
                      <Animated.View style={[
                        styles.progressFill,
                        {
                          width: `${previewPct}%`,
                          backgroundColor: ACCENT,
                          opacity: amount && parseFloat(amount) > 0 ? 0.7 : 1,
                        },
                      ]} />
                      {amount && parseFloat(amount) > 0 && (
                        <View style={[styles.progressPreviewFill, { width: `${previewPct}%`, borderColor: ACCENT }]} />
                      )}
                    </View>
                    <View style={styles.progressLabels}>
                      <Text style={{ fontSize:12, color: colors.textSecondary }}>
                        {formatPKR(goal.currentAmount)}
                        {amount && parseFloat(amount) > 0 && (
                          <Text style={{ color: ACCENT, fontWeight:"700" }}>
                            {" "}→ {formatPKR(goal.currentAmount + parseFloat(amount))}
                          </Text>
                        )}
                      </Text>
                      <Text style={{ fontSize:12, fontWeight:"700", color: ACCENT }}>{previewPct}%</Text>
                      <Text style={{ fontSize:12, color: colors.textSecondary }}>{formatPKR(goal.targetAmount)}</Text>
                    </View>
                  </View>

                  {/* Stats row */}
                  <View style={styles.statsRow}>
                    {[
                      { label: "Current",   value: formatPKR(goal.currentAmount), color: colors.text },
                      { label: "Target",    value: formatPKR(goal.targetAmount),   color: colors.text },
                      { label: "Remaining", value: formatPKR(remainingAmount),     color: ACCENT },
                    ].map((s, i, arr) => (
                      <View key={s.label} style={{ flexDirection:"row", alignItems:"center" }}>
                        <View style={styles.stat}>
                          <Text style={{ fontSize:11, color: colors.textSecondary, marginBottom:3 }}>{s.label}</Text>
                          <Text style={{ fontSize:14, fontWeight:"700", color: s.color }}>{s.value}</Text>
                        </View>
                        {i < arr.length - 1 && <View style={[styles.statDivider, { backgroundColor: colors.border }]} />}
                      </View>
                    ))}
                  </View>
                </View>

                {/* Amount input */}
                <View style={styles.field}>
                  <Text style={[styles.label, { color: colors.textSecondary }]}>
                    AMOUNT TO ADD <Text style={{ color:"#EF4444" }}>*</Text>
                  </Text>
                  <View style={[styles.amountRow, {
                    backgroundColor: colors.surface,
                    borderColor: amount && parseFloat(amount) > 0 ? ACCENT : colors.border,
                  }]}>
                    <Text style={[styles.currency, { color: colors.text }]}>₨</Text>
                    <TextInput
                      style={[styles.amountInput, { color: colors.text }]}
                      placeholder="0.00"
                      placeholderTextColor={colors.textMuted}
                      value={amount}
                      onChangeText={(t) => setAmount(t.replace(/[^0-9.]/g, ""))}
                      keyboardType="decimal-pad"
                      autoFocus={false}
                    />
                    {amount.length > 0 && (
                      <TouchableOpacity onPress={() => setAmount("")} style={{ padding:4 }}>
                        <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Preview: will this complete the goal? */}
                  {amount && parseFloat(amount) > 0 && parseFloat(amount) >= remainingAmount && !isGoalComplete && (
                    <View style={[styles.completionBanner, {
                      backgroundColor: isDark ? "rgba(16,185,129,0.12)" : "#ECFDF5",
                      borderColor: "#10B981",
                    }]}>
                      <Ionicons name="trophy" size={14} color="#10B981" />
                      <Text style={{ fontSize:12, color:"#10B981", fontWeight:"600" }}>
                        This will complete your goal! 🎉
                      </Text>
                    </View>
                  )}
                </View>

                {/* Quick amounts */}
                {quickAmounts.length > 0 && (
                  <View style={styles.field}>
                    <Text style={[styles.label, { color: colors.textSecondary }]}>QUICK AMOUNTS</Text>
                    <View style={styles.quickRow}>
                      {quickAmounts.map((q) => {
                        const isActive    = amount === q.toString()
                        const isComplete  = q === remainingAmount
                        return (
                          <TouchableOpacity
                            key={q}
                            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setAmount(q.toString()) }}
                            style={[styles.quickChip, {
                              backgroundColor: isActive ? ACCENT : colors.surface,
                              borderColor:     isActive ? ACCENT : isComplete ? ACCENT : colors.border,
                            }]}
                          >
                            {isComplete && !isActive && (
                              <Ionicons name="checkmark-circle" size={12} color={ACCENT} style={{ marginRight:3 }} />
                            )}
                            <Text style={{ fontSize:13, fontWeight:"600", color: isActive ? "#fff" : isComplete ? ACCENT : colors.text }}>
                              {isComplete ? "Complete" : `₨${(q / 1000).toFixed(0)}k`}
                            </Text>
                          </TouchableOpacity>
                        )
                      })}
                    </View>
                  </View>
                )}

                {/* Note */}
                <View style={styles.field}>
                  <Text style={[styles.label, { color: colors.textSecondary }]}>NOTE</Text>
                  <TextInput
                    style={[styles.textarea, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                    placeholder="e.g., Monthly savings, Birthday money..."
                    placeholderTextColor={colors.textMuted}
                    value={note}
                    onChangeText={setNote}
                    multiline numberOfLines={2}
                    textAlignVertical="top"
                    maxLength={150}
                  />
                </View>

                {/* Add button */}
                <TouchableOpacity
                  onPress={handleAddMoney}
                  disabled={isSubmitting || !amount || parseFloat(amount) <= 0}
                  style={[styles.addBtnWrap, (!amount || parseFloat(amount) <= 0 || isSubmitting) && { opacity:0.45 }]}
                  activeOpacity={0.85}
                >
                  <LinearGradient
                    colors={isDark ? ["#064e3b","#065f46"] : ["#059669","#10B981"]}
                    start={{ x:0, y:0 }} end={{ x:1, y:0 }}
                    style={styles.addBtn}
                  >
                    <Ionicons name="add-circle" size={20} color="#fff" />
                    <Text style={styles.addBtnText}>
                      {isSubmitting ? "Adding…" : amount && parseFloat(amount) > 0
                        ? `Add ${formatPKR(parseFloat(amount))}`
                        : "Add Money"}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>

              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Success */}
      <Modal visible={showSuccessModal} transparent animationType="fade">
        <Animated.View style={[styles.successOverlay, { opacity: successFadeAnim }]}>
          <Animated.View style={[styles.successCard, {
            backgroundColor: colors.backgroundSecondary,
            transform: [{ scale: scaleAnim }],
          }]}>
            <LinearGradient
              colors={goalJustCompleted ? ["#7C3AED","#4F46E5"] : ["#059669","#10B981"]}
              style={styles.successIconBg}
            >
              <Ionicons name={goalJustCompleted ? "trophy" : "checkmark"} size={36} color="#fff" />
            </LinearGradient>
            <Text style={[styles.successTitle, { color: colors.text }]}>
              {goalJustCompleted ? "Goal Complete! 🎉" : "Money Added!"}
            </Text>
            {amount && (
              <Text style={[styles.successAmount, { color: ACCENT }]}>
                +{formatPKR(parseFloat(amount))}
              </Text>
            )}
            <Text style={[styles.successSub, { color: colors.textSecondary }]}>
              {goal.goalName}
            </Text>
            {goalJustCompleted && (
              <View style={[styles.completionPill, { backgroundColor: isDark ? "rgba(79,70,229,0.2)" : "#EEF2FF" }]}>
                <Ionicons name="notifications" size={13} color="#7C3AED" />
                <Text style={{ fontSize:12, color:"#7C3AED", fontWeight:"600" }}>
                  Celebration notification sent!
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
    overlay:            { flex:1, backgroundColor:"rgba(0,0,0,0.6)", justifyContent:"flex-end" },
    sheet:              { borderTopLeftRadius:24, borderTopRightRadius:24, maxHeight:"90%", overflow:"hidden" },
    header:             { flexDirection:"row", alignItems:"center", justifyContent:"space-between", paddingHorizontal:20, paddingVertical:16 },
    headerLeft:         { flexDirection:"row", alignItems:"center", gap:10 },
    headerIconBg:       { width:32, height:32, borderRadius:8, backgroundColor:"rgba(255,255,255,0.2)", alignItems:"center", justifyContent:"center" },
    headerTitle:        { fontSize:18, fontWeight:"700", color:"#fff" },
    closeBtn:           { width:32, height:32, borderRadius:16, backgroundColor:"rgba(255,255,255,0.15)", alignItems:"center", justifyContent:"center" },
    body:               { padding:20, paddingBottom:40 },
    goalCard:           { borderRadius:16, padding:16, marginBottom:20, borderWidth:1 },
    goalCardTop:        { flexDirection:"row", alignItems:"center", gap:10, marginBottom:16 },
    goalIconBg:         { width:38, height:38, borderRadius:10, alignItems:"center", justifyContent:"center" },
    goalName:           { fontSize:16, fontWeight:"700" },
    goalType:           { fontSize:12, marginTop:2 },
    completeBadge:      { paddingHorizontal:10, paddingVertical:5, borderRadius:8 },
    progressSection:    { marginBottom:14 },
    progressTrack:      { height:8, borderRadius:4, overflow:"visible", marginBottom:8, position:"relative" },
    progressFill:       { height:"100%", borderRadius:4, position:"absolute" },
    progressPreviewFill:{ height:"100%", borderRadius:4, position:"absolute", borderWidth:1.5, borderStyle:"dashed" },
    progressLabels:     { flexDirection:"row", justifyContent:"space-between", alignItems:"center" },
    statsRow:           { flexDirection:"row", alignItems:"center", justifyContent:"space-around" },
    stat:               { flex:1, alignItems:"center" },
    statDivider:        { width:1, height:28 },
    field:              { marginBottom:18 },
    label:              { fontSize:12, fontWeight:"600", letterSpacing:0.5, marginBottom:8 },
    amountRow:          { flexDirection:"row", alignItems:"center", borderRadius:14, paddingHorizontal:16, paddingVertical:14, borderWidth:1.5 },
    currency:           { fontSize:22, fontWeight:"700", marginRight:8 },
    amountInput:        { flex:1, fontSize:22, fontWeight:"700" },
    completionBanner:   { flexDirection:"row", alignItems:"center", gap:6, borderRadius:10, padding:10, marginTop:8, borderWidth:1 },
    quickRow:           { flexDirection:"row", flexWrap:"wrap", gap:8 },
    quickChip:          { paddingVertical:10, paddingHorizontal:14, borderRadius:12, borderWidth:1, flexDirection:"row", alignItems:"center" },
    textarea:           { borderRadius:12, padding:14, fontSize:14, borderWidth:1, minHeight:60, textAlignVertical:"top" },
    addBtnWrap:         { borderRadius:14, overflow:"hidden" },
    addBtn:             { flexDirection:"row", alignItems:"center", justifyContent:"center", gap:8, paddingVertical:16 },
    addBtnText:         { color:"#fff", fontSize:16, fontWeight:"700", letterSpacing:0.3 },
    successOverlay:     { flex:1, backgroundColor:"rgba(0,0,0,0.7)", justifyContent:"center", alignItems:"center" },
    successCard:        { width:width*0.75, borderRadius:24, padding:32, alignItems:"center", gap:10, shadowColor:"#000", shadowOffset:{width:0,height:8}, shadowOpacity:0.3, shadowRadius:20, elevation:12 },
    successIconBg:      { width:72, height:72, borderRadius:36, alignItems:"center", justifyContent:"center" },
    successTitle:       { fontSize:22, fontWeight:"800" },
    successAmount:      { fontSize:28, fontWeight:"800" },
    successSub:         { fontSize:14, textAlign:"center" },
    completionPill:     { flexDirection:"row", alignItems:"center", gap:6, paddingHorizontal:12, paddingVertical:7, borderRadius:20, marginTop:4 },
  })

export default AddMoneyModal