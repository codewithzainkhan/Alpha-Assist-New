"use client"

import type React from "react"
import { View, Text, TouchableOpacity, StyleSheet, Alert, Animated } from "react-native"
import { LinearGradient } from "expo-linear-gradient"
import { Ionicons } from "@expo/vector-icons"
import { useTheme } from "../context/ThemeContext"
import type { GoalFrontend } from "../../services/goals"
import { formatPKR } from "../../utils/currency"

type Goal = GoalFrontend

interface GoalCardProps {
  goal: Goal
  onAddMoney: (goal: Goal) => void
  onEdit?: (goal: Goal) => void
  onDelete?: (goalId: string) => void
  onComplete?: (goalId: string) => void
}

const GoalCard: React.FC<GoalCardProps> = ({ goal, onAddMoney, onEdit, onDelete, onComplete }) => {
  const { colors, activeTheme } = useTheme()

  const progress = Math.min((goal.currentAmount / goal.targetAmount) * 100, 100)
  const remainingAmount = Math.max(goal.targetAmount - goal.currentAmount, 0)
  const daysRemaining = Math.ceil((new Date(goal.deadline).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))

  const isOverdue = daysRemaining < 0 && goal.status === "active"
  const isCompleted = goal.status === "completed" || goal.currentAmount >= goal.targetAmount

  const formatCurrency = formatPKR

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  }

  const handleDelete = () => {
    Alert.alert(
      "Delete Goal",
      "Are you sure you want to delete this goal? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => onDelete && onDelete(goal.id),
        },
      ],
    )
  }

  const handleComplete = () => {
    Alert.alert(
      "Complete Goal",
      "Mark this goal as completed?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Complete",
          onPress: () => onComplete && onComplete(goal.id),
        },
      ],
    )
  }

  const styles = createStyles(colors, activeTheme, isCompleted, isOverdue)

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
              <Ionicons name="flag" size={20} color={isCompleted ? "#fff" : colors.primary} />
            </View>
            <View style={styles.headerText}>
              <Text style={styles.goalName} numberOfLines={1}>
                {goal.goalName}
              </Text>
              <Text style={styles.goalType}>{goal.goalType}</Text>
            </View>
          </View>
          {goal.status === "active" && (
            <View style={styles.headerActions}>
              {onEdit && (
                <TouchableOpacity onPress={() => onEdit(goal)} style={styles.actionButton}>
                  <Ionicons name="create-outline" size={18} color={colors.textSecondary} />
                </TouchableOpacity>
              )}
              {onDelete && (
                <TouchableOpacity onPress={handleDelete} style={styles.actionButton}>
                  <Ionicons name="trash-outline" size={18} color={colors.error || "#ef4444"} />
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {/* Progress Bar */}
        <View style={styles.progressContainer}>
          <View style={styles.progressBarBackground}>
            <Animated.View
              style={[
                styles.progressBarFill,
                {
                  width: `${progress}%`,
                  backgroundColor: isCompleted
                    ? "#fff"
                    : isOverdue
                      ? "#fff"
                      : colors.primary,
                },
              ]}
            />
          </View>
          <View style={styles.progressTextContainer}>
            <Text style={styles.progressText}>{progress.toFixed(1)}%</Text>
            <Text style={styles.amountText}>
              {formatCurrency(goal.currentAmount)} / {formatCurrency(goal.targetAmount)}
            </Text>
          </View>
        </View>

        {/* Details */}
        <View style={styles.detailsContainer}>
          <View style={styles.detailRow}>
            <Ionicons name="cash-outline" size={16} color={colors.textSecondary} />
            <Text style={styles.detailText}>
              Remaining: <Text style={styles.detailValue}>{formatCurrency(remainingAmount)}</Text>
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Ionicons
              name={isOverdue ? "alert-circle" : "calendar-outline"}
              size={16}
              color={isOverdue ? "#ef4444" : colors.textSecondary}
            />
            <Text
              style={[
                styles.detailText,
                isOverdue && styles.overdueText,
                isCompleted && styles.completedText,
              ]}
            >
              {isCompleted
                ? "Completed"
                : isOverdue
                  ? `Overdue by ${Math.abs(daysRemaining)} days`
                  : `${daysRemaining} days remaining`}
            </Text>
          </View>
        </View>

        {/* Description */}
        {goal.description && (
          <View style={styles.descriptionContainer}>
            <Text style={styles.descriptionText} numberOfLines={2}>
              {goal.description}
            </Text>
          </View>
        )}

        {/* Action Buttons */}
        {goal.status === "active" && (
          <View style={styles.actionContainer}>
            <TouchableOpacity style={styles.addMoneyButton} onPress={() => onAddMoney(goal)}>
              <LinearGradient
                colors={
                  activeTheme === "light"
                    ? (["#4A9EFF", "#6B73FF"] as [string, string, ...string[]])
                    : (["#00c9ff", "#92fe9d"] as [string, string, ...string[]])
                }
                style={styles.addMoneyButtonGradient}
              >
                <Ionicons name="add-circle-outline" size={18} color="#fff" />
                <Text style={styles.addMoneyButtonText}>Add Money</Text>
              </LinearGradient>
            </TouchableOpacity>
            {goal.currentAmount >= goal.targetAmount && onComplete && (
              <TouchableOpacity style={styles.completeButton} onPress={handleComplete}>
                <Text style={styles.completeButtonText}>Mark Complete</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {goal.status === "completed" && (
          <View style={styles.completedBadge}>
            <Ionicons name="checkmark-circle" size={20} color="#fff" />
            <Text style={styles.completedBadgeText}>Goal Achieved!</Text>
          </View>
        )}
      </LinearGradient>
    </View>
  )
}

const createStyles = (colors: any, activeTheme: "light" | "dark", isCompleted: boolean, isOverdue: boolean) =>
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
    headerLeft: {
      flexDirection: "row",
      alignItems: "center",
      flex: 1,
    },
    iconContainer: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: isCompleted || isOverdue ? "rgba(255,255,255,0.2)" : colors.surface,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 12,
    },
    headerText: {
      flex: 1,
    },
    goalName: {
      fontSize: 18,
      fontWeight: "700",
      color: isCompleted || isOverdue ? "#fff" : colors.text,
      marginBottom: 4,
    },
    goalType: {
      fontSize: 13,
      color: isCompleted || isOverdue ? "rgba(255,255,255,0.8)" : colors.textSecondary,
      fontWeight: "500",
    },
    headerActions: {
      flexDirection: "row",
      gap: 8,
    },
    actionButton: {
      padding: 4,
    },
    progressContainer: {
      marginBottom: 12,
    },
    progressBarBackground: {
      height: 8,
      backgroundColor: isCompleted || isOverdue ? "rgba(255,255,255,0.3)" : colors.surface,
      borderRadius: 4,
      overflow: "hidden",
      marginBottom: 8,
    },
    progressBarFill: {
      height: "100%",
      borderRadius: 4,
    },
    progressTextContainer: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    progressText: {
      fontSize: 14,
      fontWeight: "700",
      color: isCompleted || isOverdue ? "#fff" : colors.primary,
    },
    amountText: {
      fontSize: 13,
      fontWeight: "600",
      color: isCompleted || isOverdue ? "rgba(255,255,255,0.9)" : colors.textSecondary,
    },
    detailsContainer: {
      marginBottom: 12,
      gap: 8,
    },
    detailRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    detailText: {
      fontSize: 13,
      color: isCompleted || isOverdue ? "rgba(255,255,255,0.9)" : colors.textSecondary,
      fontWeight: "500",
    },
    detailValue: {
      fontWeight: "700",
      color: isCompleted || isOverdue ? "#fff" : colors.text,
    },
    overdueText: {
      color: "#fff",
      fontWeight: "600",
    },
    completedText: {
      color: "#fff",
      fontWeight: "600",
    },
    descriptionContainer: {
      marginBottom: 12,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: isCompleted || isOverdue ? "rgba(255,255,255,0.2)" : colors.border,
    },
    descriptionText: {
      fontSize: 13,
      color: isCompleted || isOverdue ? "rgba(255,255,255,0.8)" : colors.textSecondary,
      lineHeight: 18,
    },
    actionContainer: {
      flexDirection: "row",
      gap: 8,
      marginTop: 8,
    },
    addMoneyButton: {
      flex: 1,
      borderRadius: 10,
      overflow: "hidden",
    },
    addMoneyButtonGradient: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 10,
      gap: 6,
    },
    addMoneyButtonText: {
      color: "#fff",
      fontSize: 14,
      fontWeight: "600",
    },
    completeButton: {
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: 10,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    completeButtonText: {
      color: colors.text,
      fontSize: 14,
      fontWeight: "600",
    },
    completedBadge: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      marginTop: 8,
      paddingVertical: 8,
    },
    completedBadgeText: {
      color: "#fff",
      fontSize: 14,
      fontWeight: "700",
    },
  })

export default GoalCard

