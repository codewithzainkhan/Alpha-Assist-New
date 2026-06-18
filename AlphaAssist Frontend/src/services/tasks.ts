import { supabase } from "./supabase"
import { cancelNotificationsForTask } from "./notifications"
import { cancelCallReminder, cancelWhatsAppReminder } from "./calls"

export interface Task {
  id: string
  user_id: string
  task_name: string
  task_type: string
  description?: string | null
  scheduled_date: string
  scheduled_time: string
  status: "pending" | "in_progress" | "completed" | "cancelled"
  priority: "low" | "medium" | "high"
  call_reminder: boolean
  message_reminder: boolean
  whatsapp_reminder: boolean          // ← added
  reminder_time?: string | null
  recurrence?: string | null
  progress: number
  completed_at?: string | null
  created_at: string
  updated_at?: string | null
}

// Frontend-friendly format (camelCase)
export interface TaskFrontend {
  id: string
  taskName: string
  taskType: string
  description?: string
  scheduledDate: string
  scheduledTime: string
  status: "pending" | "in_progress" | "completed" | "cancelled"
  priority: "low" | "medium" | "high"
  callReminder: boolean
  messageReminder: boolean
  whatsappReminder: boolean           // ← added
  reminderTime?: string
  recurrence?: string
  progress: number
  completedAt?: string | null
  createdAt: string
  updatedAt?: string | null
}

/**
 * Transform database Task to frontend format
 */
export function transformTaskToFrontend(task: Task): TaskFrontend {
  return {
    id: task.id,
    taskName: task.task_name,
    taskType: task.task_type,
    description: task.description || undefined,
    scheduledDate: task.scheduled_date,
    scheduledTime: task.scheduled_time,
    status: task.status,
    priority: task.priority,
    callReminder: task.call_reminder,
    messageReminder: task.message_reminder,
    whatsappReminder: task.whatsapp_reminder ?? false,  // ← added
    reminderTime: task.reminder_time || undefined,
    recurrence: task.recurrence || undefined,
    progress: task.progress,
    completedAt: task.completed_at || undefined,
    createdAt: task.created_at,
    updatedAt: task.updated_at || undefined,
  }
}

export interface TaskInput {
  task_name: string
  task_type: string
  description?: string
  scheduled_date: string
  scheduled_time: string
  priority?: "low" | "medium" | "high"
  call_reminder?: boolean
  message_reminder?: boolean
  whatsapp_reminder?: boolean         // ← added
  reminder_time?: string
  recurrence?: string
  progress?: number
}

/**
 * Get all tasks for the current user (returns frontend format)
 */
export async function getTasks(userId: string): Promise<TaskFrontend[]> {
  try {
    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .eq("user_id", userId)
      .order("scheduled_date", { ascending: true })
      .order("scheduled_time", { ascending: true })

    if (error) {
      console.error("Error fetching tasks:", error)
      throw error
    }

    const tasks = (data as Task[]) || []
    return tasks.map(transformTaskToFrontend)
  } catch (error) {
    console.error("Error in getTasks:", error)
    throw error
  }
}

/**
 * Get tasks by status
 */
export async function getTasksByStatus(
  userId: string,
  status: TaskFrontend["status"],
): Promise<TaskFrontend[]> {
  try {
    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .eq("user_id", userId)
      .eq("status", status)
      .order("scheduled_date", { ascending: true })
      .order("scheduled_time", { ascending: true })

    if (error) {
      console.error("Error fetching tasks by status:", error)
      throw error
    }

    const tasks = (data as Task[]) || []
    return tasks.map(transformTaskToFrontend)
  } catch (error) {
    console.error("Error in getTasksByStatus:", error)
    throw error
  }
}

/**
 * Get a single task by ID
 */
export async function getTaskById(taskId: string, userId: string): Promise<Task | null> {
  try {
    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .eq("id", taskId)
      .eq("user_id", userId)
      .maybeSingle()

    if (error) {
      console.error("Error fetching task:", error)
      throw error
    }

    return data as Task | null
  } catch (error) {
    console.error("Error in getTaskById:", error)
    throw error
  }
}

/**
 * Create a new task (returns frontend format)
 */
const TASK_TIER_LIMITS: Record<string, number | null> = { basic: 10, standard: 50, premium: null }

export async function createTask(userId: string, taskData: TaskInput): Promise<TaskFrontend> {
  try {
    const [profileRes, activeRes] = await Promise.all([
      supabase.from("profiles").select("subscription_tier").eq("id", userId).single(),
      supabase.from("tasks").select("id").eq("user_id", userId).in("status", ["pending", "in_progress"]),
    ])
    const tier = (profileRes.data?.subscription_tier as string) || "basic"
    const limit = TASK_TIER_LIMITS[tier] ?? 10
    const activeCount = activeRes.data?.length ?? 0
    if (limit !== null && activeCount >= limit) {
      throw new Error(
        `You've reached your limit of ${limit} active tasks on the ${tier.charAt(0).toUpperCase() + tier.slice(1)} plan. ` +
        "Complete or delete some existing ones, or upgrade your plan to create more."
      )
    }

    const { data, error } = await supabase
      .from("tasks")
      .insert({
        user_id:           userId,
        task_name:         taskData.task_name,
        task_type:         taskData.task_type,
        description:       taskData.description || null,
        scheduled_date:    taskData.scheduled_date,
        scheduled_time:    taskData.scheduled_time,
        status:            "pending",
        priority:          taskData.priority || "medium",
        call_reminder:     taskData.call_reminder     || false,
        message_reminder:  taskData.message_reminder  || false,
        whatsapp_reminder: taskData.whatsapp_reminder || false,  // ← added
        reminder_time:     taskData.reminder_time || null,
        recurrence:        taskData.recurrence || null,
        progress:          taskData.progress || 0,
        updated_at:        new Date().toISOString(),
      })
      .select()
      .single()

    if (error) {
      console.error("Error creating task:", error)
      throw error
    }

    return transformTaskToFrontend(data as Task)
  } catch (error) {
    console.error("Error in createTask:", error)
    throw error
  }
}

/**
 * Update a task - returns frontend format
 */
export async function updateTask(
  taskId: string,
  userId: string,
  updates: Partial<TaskInput> & {
    status?: "pending" | "in_progress" | "completed" | "cancelled"
    progress?: number
    completed_at?: string | null
  },
): Promise<TaskFrontend> {
  try {
    const updateData: any = {
      updated_at: new Date().toISOString(),
    }

    if (updates.task_name         !== undefined) updateData.task_name         = updates.task_name
    if (updates.task_type         !== undefined) updateData.task_type         = updates.task_type
    if (updates.description       !== undefined) updateData.description       = updates.description || null
    if (updates.scheduled_date    !== undefined) updateData.scheduled_date    = updates.scheduled_date
    if (updates.scheduled_time    !== undefined) updateData.scheduled_time    = updates.scheduled_time
    if (updates.priority          !== undefined) updateData.priority          = updates.priority
    if (updates.call_reminder     !== undefined) updateData.call_reminder     = updates.call_reminder
    if (updates.message_reminder  !== undefined) updateData.message_reminder  = updates.message_reminder
    if (updates.whatsapp_reminder !== undefined) updateData.whatsapp_reminder = updates.whatsapp_reminder  // ← added
    if (updates.reminder_time     !== undefined) updateData.reminder_time     = updates.reminder_time || null
    if (updates.recurrence        !== undefined) updateData.recurrence        = updates.recurrence || null
    if (updates.progress          !== undefined) updateData.progress          = updates.progress
    if (updates.status            !== undefined) updateData.status            = updates.status
    if (updates.completed_at      !== undefined) updateData.completed_at      = updates.completed_at

    const { data, error } = await supabase
      .from("tasks")
      .update(updateData)
      .eq("id", taskId)
      .eq("user_id", userId)
      .select()
      .single()

    if (error) {
      console.error("Error updating task:", error)
      throw error
    }

    return transformTaskToFrontend(data as Task)
  } catch (error) {
    console.error("Error in updateTask:", error)
    throw error
  }
}

/**
 * Update task progress
 */
export async function updateTaskProgress(
  taskId: string,
  userId: string,
  progress: number,
): Promise<TaskFrontend> {
  try {
    const updates: any = {
      progress: Math.min(Math.max(progress, 0), 100),
      updated_at: new Date().toISOString(),
    }

    // Auto-complete if progress is 100 — cancel all reminders
    if (progress >= 100) {
      updates.status = "completed"
      updates.completed_at = new Date().toISOString()
      await cancelNotificationsForTask(taskId)   // push notifications
      await cancelCallReminder(taskId)            // Twilio call
      await cancelWhatsAppReminder(taskId)        // WhatsApp message  ← added
    } else if (progress > 0) {
      updates.status = "in_progress"
    }

    return await updateTask(taskId, userId, updates)
  } catch (error) {
    console.error("Error in updateTaskProgress:", error)
    throw error
  }
}

/**
 * Delete a task — cancels all reminders before deleting
 */
export async function deleteTask(taskId: string, userId: string): Promise<void> {
  try {
    await cancelNotificationsForTask(taskId)   // push notifications
    await cancelCallReminder(taskId)            // Twilio call
    await cancelWhatsAppReminder(taskId)        // WhatsApp message  ← added

    const { error } = await supabase
      .from("tasks")
      .delete()
      .eq("id", taskId)
      .eq("user_id", userId)

    if (error) {
      console.error("Error deleting task:", error)
      throw error
    }
  } catch (error) {
    console.error("Error in deleteTask:", error)
    throw error
  }
}

/**
 * Delete all tasks for a user (used when deleting account)
 */
export async function deleteAllUserTasks(userId: string): Promise<void> {
  try {
    const { error } = await supabase.from("tasks").delete().eq("user_id", userId)

    if (error) {
      console.error("Error deleting all user tasks:", error)
      throw error
    }
  } catch (error) {
    console.error("Error in deleteAllUserTasks:", error)
    throw error
  }
}

/**
 * Mark a task as completed - returns frontend format
 */
export async function completeTask(taskId: string, userId: string): Promise<TaskFrontend> {
  try {
    await cancelNotificationsForTask(taskId)
    await cancelCallReminder(taskId)
    await cancelWhatsAppReminder(taskId)        // ← added

    return await updateTask(taskId, userId, {
      status:       "completed",
      progress:     100,
      completed_at: new Date().toISOString(),
    })
  } catch (error) {
    console.error("Error in completeTask:", error)
    throw error
  }
}

/**
 * Get upcoming tasks (within next 7 days)
 */
export async function getUpcomingTasks(userId: string): Promise<TaskFrontend[]> {
  try {
    const today    = new Date()
    const nextWeek = new Date()
    nextWeek.setDate(today.getDate() + 7)

    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .eq("user_id", userId)
      .in("status", ["pending", "in_progress"])
      .gte("scheduled_date", today.toISOString().split("T")[0])
      .lte("scheduled_date", nextWeek.toISOString().split("T")[0])
      .order("scheduled_date", { ascending: true })
      .order("scheduled_time", { ascending: true })

    if (error) {
      console.error("Error fetching upcoming tasks:", error)
      throw error
    }

    const tasks = (data as Task[]) || []
    return tasks.map(transformTaskToFrontend)
  } catch (error) {
    console.error("Error in getUpcomingTasks:", error)
    throw error
  }
}