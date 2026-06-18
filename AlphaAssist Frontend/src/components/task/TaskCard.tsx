"use client"

import type React from "react"
import { View, Text, TouchableOpacity, StyleSheet, Alert, Animated } from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import { Ionicons } from "@expo/vector-icons"
import { useTheme } from "../context/ThemeContext"
import type { TaskFrontend } from "../../services/tasks"

type Task = TaskFrontend

interface TaskCardProps {
  task: Task
  onEdit?:     (task: Task) => void
  onDelete?:   (taskId: string) => void
  onComplete?: (task: Task) => void   // changed: receives full task not just id
}

const TaskCard: React.FC<TaskCardProps> = ({ task, onEdit, onDelete, onComplete }) => {
  const { colors, activeTheme } = useTheme()

  const isCompleted = task.status === "completed"
  const isInProgress = task.status === "in_progress"
  const isPending = task.status === "pending"

  const taskDate = new Date(task.scheduledDate)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  taskDate.setHours(0, 0, 0, 0)

  const daysUntil = Math.ceil((taskDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  const isOverdue = daysUntil < 0 && !isCompleted
  const isToday   = daysUntil === 0
  const isUpcoming = daysUntil > 0 && daysUntil <= 7

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: date.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
    })
  }

  const formatTime = (timeString: string) => {
    try {
      const [hours, minutes] = timeString.split(":")
      const date = new Date()
      date.setHours(parseInt(hours), parseInt(minutes), 0)
      return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
    } catch { return timeString }
  }

  const getPriorityColor = () => {
    switch (task.priority) {
      case "high":   return "#ef4444"
      case "medium": return "#f59e0b"
      case "low":    return "#10b981"
      default:       return colors.textSecondary
    }
  }

  const handleDelete = () => {
    Alert.alert(
      "Delete Task",
      "Are you sure you want to delete this task? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => onDelete?.(task.id) },
      ],
    )
  }

  const handleComplete = () => {
    Alert.alert(
      "Mark as Completed",
      `Mark "${task.taskName}" as done?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Complete ✓", onPress: () => onComplete?.(task) },
      ],
    )
  }

  const styles = createStyles(colors, activeTheme, isCompleted, isOverdue, getPriorityColor())

  return (
    <View style={styles.card}>
      <LinearGradient
        colors={
          isCompleted
            ? (["#10b981", "#059669"] as [string, string, ...string[]])
            : isOverdue
              ? (["#ef4444", "#dc2626"] as [string, string, ...string[]])
              : activeTheme === "light"
                ? (["#FFFFFF", "#F5F5F7"] as [string, string, ...string[]])
                : (["#1a1a2e", "#16213e"] as [string, string, ...string[]])
        }
        style={styles.cardGradient}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.iconContainer}>
              <Ionicons
                name={
                  isCompleted   ? "checkmark-circle" :
                  isInProgress  ? "time" :
                  isPending     ? "calendar-outline" : "alert-circle"
                }
                size={20}
                color={isCompleted || isOverdue ? "#fff" : colors.primary}
              />
            </View>
            <View style={styles.headerText}>
              <Text style={styles.taskName} numberOfLines={1}>{task.taskName}</Text>
              <Text style={styles.taskType}>{task.taskType}</Text>
            </View>
          </View>
          <View style={styles.headerActions}>
            {task.status !== "completed" && (
              <>
                {onEdit && (
                  <TouchableOpacity onPress={() => onEdit(task)} style={styles.actionButton}>
                    <Ionicons name="create-outline" size={18} color={colors.textSecondary} />
                  </TouchableOpacity>
                )}
                {onDelete && (
                  <TouchableOpacity onPress={handleDelete} style={styles.actionButton}>
                    <Ionicons name="trash-outline" size={18} color={colors.error || "#ef4444"} />
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>
        </View>

        {/* Date and Time Info */}
        <View style={styles.dateTimeContainer}>
          <View style={styles.dateTimeRow}>
            <Ionicons name="calendar-outline" size={16} color={isCompleted || isOverdue ? "rgba(255,255,255,0.9)" : colors.textSecondary} />
            <Text style={[styles.dateTimeText, isToday && styles.todayText, isOverdue && styles.overdueText]}>
              {isToday      ? "Today" :
               isOverdue    ? `${Math.abs(daysUntil)} days overdue` :
               isUpcoming   ? `In ${daysUntil} day${daysUntil > 1 ? "s" : ""}` :
               formatDate(task.scheduledDate)}
            </Text>
          </View>
          <View style={styles.dateTimeRow}>
            <Ionicons name="time-outline" size={16} color={isCompleted || isOverdue ? "rgba(255,255,255,0.9)" : colors.textSecondary} />
            <Text style={styles.dateTimeText}>{formatTime(task.scheduledTime)}</Text>
          </View>
        </View>

        {/* Priority Badge */}
        {!isCompleted && (
          <View style={styles.priorityContainer}>
            <View style={[styles.priorityBadge, { backgroundColor: getPriorityColor() + "20" }]}>
              <View style={[styles.priorityDot, { backgroundColor: getPriorityColor() }]} />
              <Text style={[styles.priorityText, { color: getPriorityColor() }]}>
                {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)} Priority
              </Text>
            </View>
          </View>
        )}

        {/* Reminders */}
        {(task.callReminder || task.messageReminder) && (
          <View style={styles.reminderContainer}>
            {task.callReminder && (
              <View style={styles.reminderBadge}>
                <Ionicons name="call-outline" size={14} color={colors.primary} />
                <Text style={styles.reminderText}>Call</Text>
              </View>
            )}
            {task.messageReminder && (
              <View style={styles.reminderBadge}>
                <Ionicons name="chatbubble-outline" size={14} color={colors.primary} />
                <Text style={styles.reminderText}>Message</Text>
              </View>
            )}
          </View>
        )}

        {/* Description */}
        {task.description && (
          <View style={styles.descriptionContainer}>
            <Text style={styles.descriptionText} numberOfLines={2}>{task.description}</Text>
          </View>
        )}

        {/* ── Mark as Completed button (replaces Update Progress) ── */}
        {task.status !== "completed" && onComplete && (
          <View style={styles.actionContainer}>
            <TouchableOpacity style={styles.completeButton} onPress={handleComplete} activeOpacity={0.85}>
              <LinearGradient
                colors={
                  isOverdue
                    ? (["rgba(255,255,255,0.25)", "rgba(255,255,255,0.15)"] as [string, string, ...string[]])
                    : (["#10b981", "#059669"] as [string, string, ...string[]])
                }
                style={styles.completeButtonGradient}
              >
                <Ionicons name="checkmark-circle-outline" size={18} color="#fff" />
                <Text style={styles.completeButtonText}>Mark as Completed</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}

        {/* Completed badge */}
        {task.status === "completed" && (
          <View style={styles.completedBadge}>
            <Ionicons name="checkmark-circle" size={20} color="#fff" />
            <Text style={styles.completedBadgeText}>Task Completed!</Text>
          </View>
        )}
      </LinearGradient>
    </View>
  )
}

const createStyles = (
  colors: any,
  activeTheme: "light" | "dark",
  isCompleted: boolean,
  isOverdue: boolean,
  priorityColor: string,
) =>
  StyleSheet.create({
    card: {
      marginBottom: 16,
      borderRadius: 16,
      overflow: "hidden",
      elevation: 4,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
    },
    cardGradient: {
      padding: 16,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: isCompleted || isOverdue ? "transparent" : colors.border,
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: 12,
    },
    headerLeft:    { flexDirection: "row", alignItems: "center", flex: 1 },
    iconContainer: {
      width: 40, height: 40, borderRadius: 20,
      backgroundColor: isCompleted || isOverdue ? "rgba(255,255,255,0.2)" : colors.surface,
      alignItems: "center", justifyContent: "center", marginRight: 12,
    },
    headerText:    { flex: 1 },
    taskName: {
      fontSize: 18, fontWeight: "700",
      color: isCompleted || isOverdue ? "#fff" : colors.text,
      marginBottom: 4,
    },
    taskType: {
      fontSize: 13, fontWeight: "500",
      color: isCompleted || isOverdue ? "rgba(255,255,255,0.8)" : colors.textSecondary,
    },
    headerActions: { flexDirection: "row", gap: 8 },
    actionButton:  { padding: 4 },
    dateTimeContainer: { marginBottom: 12, gap: 8 },
    dateTimeRow:   { flexDirection: "row", alignItems: "center", gap: 8 },
    dateTimeText: {
      fontSize: 13, fontWeight: "500",
      color: isCompleted || isOverdue ? "rgba(255,255,255,0.9)" : colors.textSecondary,
    },
    todayText:     { color: colors.primary, fontWeight: "700" },
    overdueText:   { color: "#fff", fontWeight: "600" },
    priorityContainer: { marginBottom: 12 },
    priorityBadge: {
      flexDirection: "row", alignItems: "center", alignSelf: "flex-start",
      paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, gap: 6,
    },
    priorityDot:   { width: 8, height: 8, borderRadius: 4 },
    priorityText:  { fontSize: 12, fontWeight: "600" },
    reminderContainer: { flexDirection: "row", gap: 8, marginBottom: 12 },
    reminderBadge: {
      flexDirection: "row", alignItems: "center", gap: 4,
      paddingHorizontal: 8, paddingVertical: 4,
      backgroundColor: colors.surface, borderRadius: 8,
      borderWidth: 1, borderColor: colors.border,
    },
    reminderText:  { fontSize: 12, color: colors.text, fontWeight: "500" },
    descriptionContainer: {
      marginBottom: 12, paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: isCompleted || isOverdue ? "rgba(255,255,255,0.2)" : colors.border,
    },
    descriptionText: {
      fontSize: 13, lineHeight: 18,
      color: isCompleted || isOverdue ? "rgba(255,255,255,0.8)" : colors.textSecondary,
    },
    actionContainer: { marginTop: 8 },
    completeButton:  { borderRadius: 10, overflow: "hidden" },
    completeButtonGradient: {
      flexDirection: "row", alignItems: "center", justifyContent: "center",
      paddingVertical: 11, gap: 8,
    },
    completeButtonText: { color: "#fff", fontSize: 14, fontWeight: "700" },
    completedBadge: {
      flexDirection: "row", alignItems: "center", justifyContent: "center",
      gap: 8, marginTop: 8, paddingVertical: 8,
    },
    completedBadgeText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  })

export default TaskCard