import { supabase } from "./supabase"
import { cancelNotificationsForGoal } from "./notifications"

export interface Goal {
  id: string
  user_id: string
  goal_name: string
  goal_type: string
  target_amount: number
  current_amount: number
  deadline: string
  description?: string | null
  status: "active" | "completed" | "cancelled"
  message_reminder: boolean
  reminder_frequency?: string | null
  savings_history?: Array<{
    id: string
    amount: number
    date: string
    note?: string
  }> | null
  created_at: string
  completed_at?: string | null
}

// Frontend-friendly format (camelCase)
export interface GoalFrontend {
  id: string
  goalName: string
  goalType: string
  targetAmount: number
  currentAmount: number
  deadline: string
  description?: string
  status: "active" | "completed" | "cancelled"
  messageReminder: boolean
  reminderFrequency?: string
  savingsHistory?: Array<{
    id: string
    amount: number
    date: string
    note?: string
  }>
  createdAt: string
  completedAt?: string | null
}

/**
 * Transform database Goal to frontend format
 */
export function transformGoalToFrontend(goal: Goal): GoalFrontend {
  return {
    id: goal.id,
    goalName: goal.goal_name,
    goalType: goal.goal_type,
    targetAmount: goal.target_amount,
    currentAmount: goal.current_amount,
    deadline: goal.deadline,
    description: goal.description || undefined,
    status: goal.status,
    messageReminder: goal.message_reminder,
    reminderFrequency: goal.reminder_frequency || undefined,
    savingsHistory: goal.savings_history || undefined,
    createdAt: goal.created_at,
    completedAt: goal.completed_at || undefined,
  }
}

export interface GoalInput {
  goal_name: string
  goal_type: string
  target_amount: number
  current_amount?: number
  deadline: string
  description?: string
  message_reminder?: boolean
  reminder_frequency?: string
  savings_history?: Array<{
    id: string
    amount: number
    date: string
    note?: string
  }>
}

export interface SavingsTransaction {
  id: string
  amount: number
  date: string
  note?: string
}

/**
 * Get all goals for the current user (returns frontend format)
 */
export async function getGoals(userId: string): Promise<GoalFrontend[]> {
  try {
    const { data, error } = await supabase
      .from("goals")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Error fetching goals:", error)
      throw error
    }

    const goals = (data as Goal[]) || []
    return goals.map(transformGoalToFrontend)
  } catch (error) {
    console.error("Error in getGoals:", error)
    throw error
  }
}

/**
 * Get all goals for the current user (returns database format)
 */
export async function getGoalsRaw(userId: string): Promise<Goal[]> {
  try {
    const { data, error } = await supabase
      .from("goals")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Error fetching goals:", error)
      throw error
    }

    return (data as Goal[]) || []
  } catch (error) {
    console.error("Error in getGoalsRaw:", error)
    throw error
  }
}

/**
 * Get a single goal by ID
 */
export async function getGoalById(goalId: string, userId: string): Promise<Goal | null> {
  try {
    const { data, error } = await supabase
      .from("goals")
      .select("*")
      .eq("id", goalId)
      .eq("user_id", userId)
      .maybeSingle()

    if (error) {
      console.error("Error fetching goal:", error)
      throw error
    }

    return data as Goal | null
  } catch (error) {
    console.error("Error in getGoalById:", error)
    throw error
  }
}

/**
 * Create a new goal (returns frontend format)
 */
export async function createGoal(userId: string, goalData: GoalInput): Promise<GoalFrontend> {
  try {
    const { data, error } = await supabase
      .from("goals")
      .insert({
        user_id: userId,
        goal_name: goalData.goal_name,
        goal_type: goalData.goal_type,
        target_amount: goalData.target_amount,
        current_amount: goalData.current_amount || 0,
        deadline: goalData.deadline,
        description: goalData.description || null,
        status: "active",
        message_reminder: goalData.message_reminder || false,
        reminder_frequency: goalData.reminder_frequency || null,
        savings_history: goalData.savings_history || [],
      })
      .select()
      .single()

    if (error) {
      console.error("Error creating goal:", error)
      throw error
    }

    return transformGoalToFrontend(data as Goal)
  } catch (error) {
    console.error("Error in createGoal:", error)
    throw error
  }
}

/**
 * Update a goal (used for adding money, editing, etc.) - returns frontend format
 */
export async function updateGoal(
  goalId: string,
  userId: string,
  updates: Partial<GoalInput> & {
    current_amount?: number
    status?: "active" | "completed" | "cancelled"
    savings_history?: SavingsTransaction[]
    completed_at?: string | null
  },
): Promise<GoalFrontend> {
  try {
    const updateData: any = {}
    
    if (updates.goal_name !== undefined) updateData.goal_name = updates.goal_name
    if (updates.goal_type !== undefined) updateData.goal_type = updates.goal_type
    if (updates.target_amount !== undefined) updateData.target_amount = updates.target_amount
    if (updates.current_amount !== undefined) updateData.current_amount = updates.current_amount
    if (updates.deadline !== undefined) updateData.deadline = updates.deadline
    if (updates.description !== undefined) updateData.description = updates.description || null
    if (updates.message_reminder !== undefined) updateData.message_reminder = updates.message_reminder
    if (updates.reminder_frequency !== undefined) updateData.reminder_frequency = updates.reminder_frequency || null
    if (updates.savings_history !== undefined) updateData.savings_history = updates.savings_history
    if (updates.status !== undefined) updateData.status = updates.status
    if (updates.completed_at !== undefined) updateData.completed_at = updates.completed_at

    const { data, error } = await supabase
      .from("goals")
      .update(updateData)
      .eq("id", goalId)
      .eq("user_id", userId)
      .select()
      .single()

    if (error) {
      console.error("Error updating goal:", error)
      throw error
    }

    return transformGoalToFrontend(data as Goal)
  } catch (error) {
    console.error("Error in updateGoal:", error)
    throw error
  }
}

/**
 * Add money to a goal (updates current amount and savings history) - returns frontend format
 */
export async function addMoneyToGoal(
  goalId: string,
  userId: string,
  amount: number,
  note?: string,
): Promise<GoalFrontend> {
  try {
    // First get the current goal
    const currentGoal = await getGoalById(goalId, userId)
    if (!currentGoal) {
      throw new Error("Goal not found")
    }

    const newAmount = currentGoal.current_amount + amount
    const newHistory = [
      ...(currentGoal.savings_history || []),
      {
        id: Date.now().toString(),
        amount,
        date: new Date().toISOString(),
        note: note || undefined,
      },
    ]

    const updates: any = {
      current_amount: newAmount,
      savings_history: newHistory,
    }

    // Auto-complete if target is reached
    if (newAmount >= currentGoal.target_amount && currentGoal.status === "active") {
      updates.status = "completed"
      updates.completed_at = new Date().toISOString()
      await cancelNotificationsForGoal(goalId)
    }

    return await updateGoal(goalId, userId, updates)
  } catch (error) {
    console.error("Error in addMoneyToGoal:", error)
    throw error
  }
}

/**
 * Delete a goal
 */
export async function deleteGoal(goalId: string, userId: string): Promise<void> {
  
  try {
    await cancelNotificationsForGoal(goalId)
    const { error } = await supabase.from("goals").delete().eq("id", goalId).eq("user_id", userId)

    if (error) {
      console.error("Error deleting goal:", error)
      throw error
    }
  } catch (error) {
    console.error("Error in deleteGoal:", error)
    throw error
  }
}

/**
 * Delete all goals for a user (used when deleting account)
 */
export async function deleteAllUserGoals(userId: string): Promise<void> {
  try {
    const { error } = await supabase.from("goals").delete().eq("user_id", userId)

    if (error) {
      console.error("Error deleting all user goals:", error)
      throw error
    }
  } catch (error) {
    console.error("Error in deleteAllUserGoals:", error)
    throw error
  }
}

/**
 * Mark a goal as completed - returns frontend format
 */
export async function completeGoal(goalId: string, userId: string): Promise<GoalFrontend> {
  try {
    return await updateGoal(goalId, userId, {
      status: "completed",
      completed_at: new Date().toISOString(),
    })
  } catch (error) {
    console.error("Error in completeGoal:", error)
    throw error
  }
}

