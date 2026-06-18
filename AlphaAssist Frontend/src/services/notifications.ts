import * as Notifications from "expo-notifications"
import * as Device from "expo-device"
import Constants from "expo-constants"
import { Platform } from "react-native"

// ─── Foreground handler — set at module load before any notification fires ────
Notifications.setNotificationHandler({
  handleNotification: async (): Promise<Notifications.NotificationBehavior> => ({
    shouldShowBanner: true,   // replaces deprecated shouldShowAlert
    shouldShowList:   true,
    shouldPlaySound:  true,
    shouldSetBadge:   true,
  }),
})

// ─── Report generation on notification fire ──────────────────────────────────
// These are imported lazily inside the function to avoid circular deps
// saveReport and buildReport are called from scheduleReportNotifications trigger

// ─── Android channels — extracted so they can be called independently.
//     Must exist before scheduleNotificationAsync, even before
//     registerForPushNotifications is called (e.g. onboarding fires on OTP
//     verify, which happens before App.tsx wires up the push token). ──────────
async function ensureAndroidChannels() {
  if (Platform.OS !== "android") return
  await Notifications.setNotificationChannelAsync("default", {
    name: "Default",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#4F46E5",
  })
  await Notifications.setNotificationChannelAsync("tasks", {
    name: "Task Reminders",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#10B981",
  })
  await Notifications.setNotificationChannelAsync("goals", {
    name: "Goal Reminders",
    importance: Notifications.AndroidImportance.HIGH,
    lightColor: "#F59E0B",
  })
  await Notifications.setNotificationChannelAsync("onboarding", {
    name: "Welcome & Onboarding",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#818CF8",
  })
  await Notifications.setNotificationChannelAsync("engagement", {
    name: "Tips & Engagement",
    importance: Notifications.AndroidImportance.DEFAULT,
    lightColor: "#A78BFA",
  })
}

// ─── Request permission + get push token ─────────────────────────────────────
export async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) {
    console.log("[Notif] Skipping — not a physical device")
    return null
  }

  const { status: existing } = await Notifications.getPermissionsAsync()
  let finalStatus = existing

  if (existing !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync()
    finalStatus = status
  }

  if (finalStatus !== "granted") {
    console.warn("[Notif] Permission not granted")
    return null
  }

  await ensureAndroidChannels()

  try {
    // Try Expo push token first (needed for Expo push service)
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      Constants.easConfig?.projectId

    if (projectId) {
      const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data
      console.log("[Notif] Expo push token:", token)
      return token
    }

    // Fallback: native device token (works without EAS projectId — fine for
    // local notifications and direct APNs/FCM, not for Expo push service)
    const deviceToken = (await Notifications.getDevicePushTokenAsync()).data
    console.log("[Notif] Device push token:", deviceToken)
    return typeof deviceToken === "string" ? deviceToken : JSON.stringify(deviceToken)
  } catch (err) {
    console.warn("[Notif] Could not get push token (non-fatal):", err)
    return null
  }
}

// ─── Cancel helpers ───────────────────────────────────────────────────────────
export async function cancelNotification(id: string) {
  await Notifications.cancelScheduledNotificationAsync(id)
}

export async function cancelNotificationsForTask(taskId: string) {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync()
  for (const n of scheduled) {
    if (n.content.data?.taskId === taskId) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier)
    }
  }
}


export async function cancelNotificationsForGoal(goalId: string) {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync()
  for (const n of scheduled) {
    if (n.content.data?.goalId === goalId) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier)
    }
  }
}

// ─── Task notifications ───────────────────────────────────────────────────────
export async function scheduleTaskNotifications(task: {
  id: string
  taskName: string
  scheduledDate: string
  scheduledTime: string
  messageReminder: boolean
  reminderTime?: string
}) {
  await cancelNotificationsForTask(task.id)

  const [year, month, day] = task.scheduledDate.split("-").map(Number)
  const [hour, min]        = task.scheduledTime.split(":").map(Number)
  const taskDate = new Date(year, month - 1, day, hour, min, 0)

  if (taskDate <= new Date()) return

  // 15 min before
  const fifteenBefore = new Date(taskDate.getTime() - 15 * 60 * 1000)
  if (fifteenBefore > new Date()) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "⏰ Task Reminder",
        body: `"${task.taskName}" starts in 15 minutes`,
        data: { taskId: task.id, type: "task_reminder" },
        sound: true,
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fifteenBefore, channelId: "tasks" },
    })
  }

  // At task time
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "🎯 Task Starting Now",
      body: `Time for: "${task.taskName}"`,
      data: { taskId: task.id, type: "task_start" },
      sound: true,
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: taskDate, channelId: "tasks" },
  })

  // Message reminder — push notification at user-set reminder time
  if (task.messageReminder && task.reminderTime) {
    const [rh, rm] = task.reminderTime.split(":").map(Number)
    const reminderDate = new Date(year, month - 1, day, rh, rm, 0)
    if (reminderDate > new Date()) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "💬 Message Reminder",
          body:  `Don't forget: "${task.taskName}"`,
          data:  { type: "task_message_reminder", taskId: task.id },
          sound: true,
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: reminderDate, channelId: "tasks" },
      })
    }
  }

  // Follow-up: 1 hour after deadline — fires if user hasn't marked complete
  await scheduleFollowUpNotification({
    id:            task.id,
    taskName:      task.taskName,
    scheduledDate: task.scheduledDate,
    scheduledTime: task.scheduledTime,
  })
}

// ─── Goal notifications ───────────────────────────────────────────────────────
export async function scheduleGoalNotifications(goal: {
  id: string
  goalName: string
  deadline: string
  reminderFrequency?: string
  messageReminder: boolean
  targetAmount: number
  currentAmount: number
}) {
  await cancelNotificationsForGoal(goal.id)

  const deadlineDate = new Date(goal.deadline)
  const now = new Date()

  // 7 days before
  const sevenDaysBefore = new Date(deadlineDate.getTime() - 7 * 24 * 60 * 60 * 1000)
  if (sevenDaysBefore > now) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "🎯 Goal Deadline Approaching",
        body: `"${goal.goalName}" is due in 7 days!`,
        data: { goalId: goal.id, type: "goal_deadline_7" },
        sound: true,
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: sevenDaysBefore, channelId: "goals" },
    })
  }

  // 1 day before
  const oneDayBefore = new Date(deadlineDate.getTime() - 24 * 60 * 60 * 1000)
  if (oneDayBefore > now) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "⚠️ Goal Deadline Tomorrow!",
        body: `Last chance! "${goal.goalName}" is due tomorrow.`,
        data: { goalId: goal.id, type: "goal_deadline_1" },
        sound: true,
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: oneDayBefore, channelId: "goals" },
    })
  }

  // Progress reminders
  if (goal.messageReminder && goal.reminderFrequency) {
    const progress = Math.round((goal.currentAmount / goal.targetAmount) * 100)
    const body = `You're at ${progress}% of your "${goal.goalName}" goal. Keep it up!`

    if (goal.reminderFrequency === "Daily") {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "💰 Goal Progress Check",
          body,
          data: { goalId: goal.id, type: "goal_progress" },
          sound: false,
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour: 9, minute: 0, channelId: "goals" },
      })
    } else if (goal.reminderFrequency === "Weekly") {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "💰 Weekly Goal Check-in",
          body,
          data: { goalId: goal.id, type: "goal_progress" },
          sound: false,
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday: 2, hour: 9, minute: 0, channelId: "goals" },
      })
    } else if (goal.reminderFrequency === "Monthly") {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "💰 Monthly Goal Check-in",
          body,
          data: { goalId: goal.id, type: "goal_progress" },
          sound: false,
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.YEARLY, month: new Date().getMonth() + 1, day: 1, hour: 9, minute: 0, channelId: "goals" },
      })
    }
  }
}

// ─── Immediate: goal completed ────────────────────────────────────────────────
export async function fireGoalCompletedNotification(goalName: string, goalId: string) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "🎉 Goal Achieved!",
      body: `You completed your "${goalName}" goal! Amazing work.`,
      data: { goalId, type: "goal_completed" },
      sound: true,
    },
    trigger: null,
  })
}

// ─── ONBOARDING — email signup (fires after OTP verified) ────────────────────
export async function scheduleOnboardingNotifications(userName: string) {
  // Ensure Android channels exist BEFORE scheduling anything
  await ensureAndroidChannels()

  console.log("[Notif] Scheduling onboarding notifications for:", userName)

  // 1) Immediate welcome
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "🎉 Welcome to AlphaAssist!",
      body: `Hey ${userName}! Your account is ready. Let's set up your first goal or task.`,
      data: { type: "onboarding_welcome" },
      sound: true,
    },
    trigger: null,
  })
  console.log("[Notif] Welcome notification fired")

  // 2) First task nudge — 10 minutes after signup
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "📋 Schedule your first task",
      body: "Stay on top of your day — add a task and let AlphaAssist remind you.",
      data: { type: "onboarding_task_nudge" },
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(Date.now() + 10 * 60 * 1000),
      channelId: "onboarding",
    },
  })

  // 3) First goal nudge — 1 hour after signup
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "🎯 Set your first financial goal",
      body: "Whether it's saving for something or tracking spending — start your first goal now.",
      data: { type: "onboarding_goal_nudge" },
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(Date.now() + 60 * 60 * 1000),
      channelId: "onboarding",
    },
  })

  // 4) Explore features nudge — 24 hours after signup
  await Notifications.scheduleNotificationAsync({
    content: {
      title: "✨ Explore AlphaAssist",
      body: "Try voice cloning, AI chat, and smart analytics — your AI assistant is ready.",
      data: { type: "onboarding_explore" },
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(Date.now() + 24 * 60 * 60 * 1000),
      channelId: "onboarding",
    },
  })

  console.log("[Notif] All onboarding notifications scheduled")
}

// ─── ONBOARDING — Google sign-in (new user only) ─────────────────────────────
export async function scheduleGoogleOnboardingNotifications(userName: string) {
  await ensureAndroidChannels()

  console.log("[Notif] Scheduling Google onboarding for:", userName)

  await Notifications.scheduleNotificationAsync({
    content: {
      title: "👋 Welcome to AlphaAssist!",
      body: `Hi ${userName}! You're all set. Tap to set up your first task or goal.`,
      data: { type: "onboarding_google_welcome" },
      sound: true,
    },
    trigger: null,
  })

  await Notifications.scheduleNotificationAsync({
    content: {
      title: "📋 Add your first task",
      body: "Organize your day — schedule a task and let AlphaAssist keep you on track.",
      data: { type: "onboarding_task_nudge" },
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(Date.now() + 10 * 60 * 1000),
      channelId: "onboarding",
    },
  })

  await Notifications.scheduleNotificationAsync({
    content: {
      title: "💰 Create your first goal",
      body: "Track savings, plan purchases, and hit your financial targets with AlphaAssist.",
      data: { type: "onboarding_goal_nudge" },
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(Date.now() + 60 * 60 * 1000),
      channelId: "onboarding",
    },
  })

  await Notifications.scheduleNotificationAsync({
    content: {
      title: "🤖 Your AI assistant is ready",
      body: "Chat with AI, clone your voice, and view smart analytics — all in one place.",
      data: { type: "onboarding_explore" },
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: new Date(Date.now() + 24 * 60 * 60 * 1000),
      channelId: "onboarding",
    },
  })

  console.log("[Notif] Google onboarding notifications scheduled")
}

// ─── RE-ENGAGEMENT — fires on login if user inactive for 3+ days ─────────────
export async function scheduleReEngagementIfNeeded(userId: string) {
  try {
    const { default: AsyncStorage } = await import("@react-native-async-storage/async-storage")
    const key = `@last_active_${userId}`
    const lastActiveStr = await AsyncStorage.getItem(key)
    const now = Date.now()

    await AsyncStorage.setItem(key, now.toString())

    if (!lastActiveStr) return

    const lastActive = parseInt(lastActiveStr, 10)
    const daysSince  = (now - lastActive) / (1000 * 60 * 60 * 24)

    console.log("[Notif] Days since last active:", daysSince.toFixed(1))

    if (daysSince >= 3) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "👋 Welcome back!",
          body: daysSince >= 7
            ? "It's been a while! Your tasks and goals are waiting for you."
            : "You have tasks and goals to check on — tap to catch up.",
          data: { type: "re_engagement", userId },
          sound: true,
        },
        trigger: null,
      })
    }
  } catch (err) {
    console.warn("[Notif] Re-engagement check failed:", err)
  }
}
// ─── ENGAGEMENT QUOTES ────────────────────────────────────────────────────────
// 60 messages across 4 categories: motivational, AI, productivity, financial.
// Shuffled randomly per scheduling session so the user never sees the same
// order twice. We schedule 5 days × 12 slots/day (every 2 hrs, 00–22) = 60
// slots — safely under iOS's 64 local notification hard cap.

const ENGAGEMENT_MESSAGES: { title: string; body: string }[] = [
  // ── Motivational ─────────────────────────────────────────────────────────
  { title: "💪 Keep Going", body: "Every small step today builds the life you want tomorrow. You've got this." },
  { title: "🔥 Stay Consistent", body: "Motivation gets you started. Habit keeps you going. Show up again today." },
  { title: "🌅 New Opportunity", body: "Every 2 hours is a fresh chance to make progress. What will you do with this one?" },
  { title: "⚡ Energy Check", body: "High performers don't wait to feel motivated — they act first and feel it after." },
  { title: "🏆 Champions Mindset", body: "The difference between where you are and where you want to be is what you do right now." },
  { title: "🌟 You're Closer", body: "Every task you complete today is one step closer to the version of yourself you're building." },
  { title: "💡 Small Wins Matter", body: "Don't underestimate the power of tiny victories. They compound into massive results." },
  { title: "🎯 Stay Focused", body: "Distraction is the enemy of progress. Lock in for the next 2 hours." },
  { title: "🚀 Push Forward", body: "Hard days build strong people. Keep pushing — the breakthrough is closer than you think." },
  { title: "🧠 Growth Mode", body: "Comfort zones are great to visit, but terrible to live in. Stretch yourself today." },
  { title: "⏰ Use Your Time", body: "You have the same 24 hours as the most successful people alive. Use the next 2 wisely." },
  { title: "🌊 Build Momentum", body: "Success isn't a single moment — it's a wave you build one action at a time." },
  { title: "🎖️ Discipline Wins", body: "Talent is common. Discipline is rare. Showing up daily is what separates the best." },
  { title: "💎 Pressure Creates", body: "Diamonds are made under pressure. Don't run from challenges — grow through them." },
  { title: "🌱 Keep Planting", body: "You may not see results today, but keep planting. The harvest is coming." },

  // ── AI & Technology ───────────────────────────────────────────────────────
  { title: "🤖 Your AI Is Ready", body: "AlphaAssist is learning your patterns to help you work smarter every single day." },
  { title: "⚡ AI-Powered You", body: "The most powerful tool isn't a computer — it's a human with the right AI alongside them." },
  { title: "🧬 Future Is Now", body: "10 years ago, having a personal AI assistant was science fiction. You're living it today." },
  { title: "🔮 Predict Your Day", body: "AI doesn't just react — it anticipates. Let AlphaAssist stay one step ahead for you." },
  { title: "🌐 Smarter Every Day", body: "Every interaction with AlphaAssist makes your experience more personalized and powerful." },
  { title: "💬 Talk to Your AI", body: "Have a question, an idea, or need to think something through? Your AI chat is one tap away." },
  { title: "🛰️ AI Is Your Edge", body: "The people winning in 2025 are the ones who've mastered working with AI. You're already ahead." },
  { title: "🧠 Augmented Mind", body: "AI doesn't replace your thinking — it amplifies it. Use AlphaAssist to think bigger." },
  { title: "⚙️ Automate the Boring", body: "Let AI handle repetitive thinking so you can focus on what only humans can do: create and decide." },
  { title: "🔬 Data = Power", body: "Your analytics screen holds patterns about you that your conscious mind hasn't noticed yet." },
  { title: "🎙️ Voice Is Powerful", body: "Your voice carries authority. AlphaAssist's voice cloning helps you scale that presence." },
  { title: "🌟 AI Never Sleeps", body: "While you rest, AlphaAssist is tracking your goals and preparing your reminders for tomorrow." },
  { title: "🚀 Exponential Tools", body: "Linear effort + exponential AI tools = results that feel almost unfair. Keep using AlphaAssist." },
  { title: "🔐 Your Data, Your AI", body: "AlphaAssist works for you alone. Your goals, tasks, and habits stay private and personalized." },
  { title: "💡 Ask Anything", body: "The smartest people aren't the ones who know everything — they're the ones who ask the right questions." },

  // ── Productivity ──────────────────────────────────────────────────────────
  { title: "📋 Task Check-In", body: "Quick — do you have a task scheduled for the next 2 hours? If not, add one now." },
  { title: "⏱️ Time Blocking", body: "The most productive people don't manage tasks — they manage time. Block your next 2 hours." },
  { title: "🗂️ Clear Your Queue", body: "A cluttered task list is a cluttered mind. Take 2 minutes to review and prioritize." },
  { title: "🎯 One Thing", body: "What's the single most important thing you could do right now? Do that first." },
  { title: "📊 Track to Win", body: "What gets measured gets managed. Check your analytics and see where your time is really going." },
  { title: "🔋 Recharge Tip", body: "Peak performance requires recovery. Have you taken a real break in the last 2 hours?" },
  { title: "📅 Plan Tomorrow", body: "The best time to plan tomorrow is today. Spend 5 minutes scheduling your tasks for tonight." },
  { title: "🧹 Inbox Zero", body: "A clear schedule creates a clear mind. Review your tasks and remove anything that doesn't matter." },
  { title: "⚡ 2-Minute Rule", body: "If a task takes less than 2 minutes — do it right now. Stop letting small things pile up." },
  { title: "🌙 Evening Wind Down", body: "Before bed, review what you accomplished today. Progress worth celebrating, no matter how small." },
  { title: "☀️ Morning Intention", body: "Set your intention now. What does a successful next 2 hours look like for you?" },
  { title: "🔄 Review & Adjust", body: "Productivity isn't about doing more — it's about doing the right things. Adjust your task list now." },
  { title: "💼 Deep Work Time", body: "Close the distractions. The next 2 hours of focused work can change your entire week." },
  { title: "🎵 Flow State", body: "You're 2 hours away from potentially your most productive stretch of the day. Get into flow." },
  { title: "📌 Priorities First", body: "Don't let the urgent crowd out the important. Check your task list and protect what matters." },

  // ── Financial ─────────────────────────────────────────────────────────────
  { title: "💰 Money Mindset", body: "Wealth isn't about how much you earn — it's about the gap between what you earn and what you keep." },
  { title: "🏦 Save First", body: "Pay yourself first. Before any expense, move something toward your savings goal today." },
  { title: "📈 Goals Update", body: "How's your financial goal progressing? Even ₨100 added today keeps the momentum alive." },
  { title: "🎯 Goal Progress", body: "Small, consistent contributions beat large sporadic ones every time. Add to your goal today." },
  { title: "💸 Spend With Intent", body: "Every rupee you spend is a vote for what you value. Are you voting for your goals?" },
  { title: "🧾 Track Everything", body: "You can't optimize what you don't measure. Your goals tracker is waiting for an update." },
  { title: "🌱 Compound Effect", body: "₨1,000 saved today at 10% becomes ₨2,594 in 10 years. Compounding rewards consistency." },
  { title: "🏆 Financial Freedom", body: "Freedom isn't a salary — it's a system. AlphaAssist helps you build that system one goal at a time." },
  { title: "⚠️ Avoid Lifestyle Creep", body: "As income grows, keep expenses flat. The difference is what builds real wealth." },
  { title: "📊 Net Worth Check", body: "Track your goals regularly. Seeing progress, even small progress, is what keeps you going." },
  { title: "💡 Smart Money Move", body: "The best financial decision you can make today costs nothing — update your goal and stay accountable." },
  { title: "🎯 Stay on Track", body: "Missing one day is an accident. Missing two is a pattern. Check your goals before the day ends." },
  { title: "💎 Value Over Price", body: "Rich people buy assets. Everyone else buys things. What are you buying with your next rupee?" },
  { title: "🔐 Emergency First", body: "Before any investment goal, an emergency fund is your financial immune system. How's yours?" },
  { title: "🚀 Future You Thanks You", body: "The sacrifice you make today is the gift your future self receives tomorrow. Keep saving." },
]

// Fisher-Yates shuffle
function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Hours at which notifications fire (every 2 hrs, whole day)
const ENGAGEMENT_HOURS = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22]

// Key used to track whether we've already scheduled this week
const ENGAGEMENT_SCHEDULED_KEY = "@engagement_scheduled_until"

/**
 * Call once on login / app open.
 * Schedules engagement notifications every 2 hours for the next 5 days (60 total).
 * Stays under iOS's hard cap of 64 local notifications.
 * Uses AsyncStorage to avoid re-scheduling if already done this week.
 * Picks a fresh random shuffle every scheduling session so messages vary.
 */
export async function scheduleEngagementNotifications() {
  await ensureAndroidChannels()

  try {
    const { default: AsyncStorage } = await import("@react-native-async-storage/async-storage")

    // Skip if already scheduled and still valid (checks every login)
    const scheduledUntil = await AsyncStorage.getItem(ENGAGEMENT_SCHEDULED_KEY)
    const alreadyValid = scheduledUntil && parseInt(scheduledUntil, 10) > Date.now()
    if (alreadyValid) {
      // Still check how many are actually left — if < 24 hrs worth, reschedule
      const remaining = await Notifications.getAllScheduledNotificationsAsync()
      const engagementLeft = remaining.filter(n => n.content.data?.type === "engagement").length
      if (engagementLeft >= 24) {
        console.log("[Notif] Engagement notifications OK — skipping (" + engagementLeft + " remaining)")
        return
      }
      console.log("[Notif] Engagement running low (" + engagementLeft + " left) — rescheduling")
    }

    // Cancel any existing engagement notifications
    const existing = await Notifications.getAllScheduledNotificationsAsync()
    for (const n of existing) {
      if (n.content.data?.type === "engagement") {
        await Notifications.cancelScheduledNotificationAsync(n.identifier)
      }
    }

    const messages = shuffleArray(ENGAGEMENT_MESSAGES)
    const now      = new Date()
    let   msgIndex = 0

    // Schedule for next 5 days (5 days × 12 slots = 60, safely under iOS 64 cap)
    for (let day = 0; day < 5; day++) {
      for (const hour of ENGAGEMENT_HOURS) {
        const fireDate = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate() + day,
          hour, 5, 0  // :05 past each even hour — 12:05am, 2:05am, 4:05am...
        )

        // Skip slots already in the past
        if (fireDate <= now) continue

        const msg = messages[msgIndex % messages.length]
        msgIndex++

        // Re-shuffle when we've cycled through all messages
        if (msgIndex % messages.length === 0) {
          messages.splice(0, messages.length, ...shuffleArray(ENGAGEMENT_MESSAGES))
        }

        await Notifications.scheduleNotificationAsync({
          content: {
            title: msg.title,
            body:  msg.body,
            data:  { type: "engagement" },
            sound: false,
          },
          trigger: {
            type:      Notifications.SchedulableTriggerInputTypes.DATE,
            date:      fireDate,
            channelId: "engagement",
          },
        })
      }
    }

    // Mark as scheduled for 4 days (reschedules before 5-day batch expires)
    const validUntil = Date.now() + 4 * 24 * 60 * 60 * 1000
    await AsyncStorage.setItem(ENGAGEMENT_SCHEDULED_KEY, validUntil.toString())

    console.log("[Notif] Engagement notifications scheduled for 5 days (every 2 hrs) — 60 slots")
  } catch (err) {
    console.warn("[Notif] Failed to schedule engagement notifications:", err)
  }
}

/**
 * Cancel all engagement notifications (e.g. on logout).
 */
export async function cancelEngagementNotifications() {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync()
    for (const n of scheduled) {
      if (n.content.data?.type === "engagement") {
        await Notifications.cancelScheduledNotificationAsync(n.identifier)
      }
    }
    const { default: AsyncStorage } = await import("@react-native-async-storage/async-storage")
    await AsyncStorage.removeItem(ENGAGEMENT_SCHEDULED_KEY)
    console.log("[Notif] Engagement notifications cancelled")
  } catch (err) {
    console.warn("[Notif] Failed to cancel engagement notifications:", err)
  }
}


// ─── Task completion notifications ───────────────────────────────────────────

/**
 * Schedule a follow-up notification 1 hour after the task deadline.
 * Call this when a task is created/updated with a scheduled time.
 * If user completes the task before it fires, call cancelFollowUpNotification().
 */
export async function scheduleFollowUpNotification(task: {
  id: string
  taskName: string
  scheduledDate: string  // "YYYY-MM-DD"
  scheduledTime: string  // "HH:MM"
}) {
  await ensureAndroidChannels()
  try {
    // Parse deadline → add 1 hour
    const [year, month, day]  = task.scheduledDate.split("-").map(Number)
    const [hour, minute]      = task.scheduledTime.split(":").map(Number)
    const deadline            = new Date(year, month - 1, day, hour, minute, 0)
    const followUpTime        = new Date(deadline.getTime() + 60 * 60 * 1000) // +1 hour

    // Don't schedule if follow-up time is in the past
    if (followUpTime <= new Date()) return

    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Follow-up",
        body:  `Have you done with "${task.taskName}"? how was it?`,
        data:  {
          type:   "task_followup",
          taskId: task.id,
        },
        sound: true,
      },
      trigger: {
        type:      Notifications.SchedulableTriggerInputTypes.DATE,
        date:      followUpTime,
        channelId: "tasks",
      },
    })
    console.log(`[Notif] Follow-up scheduled for "${task.taskName}" at`, followUpTime.toLocaleTimeString())
  } catch (err) {
    console.warn("[Notif] Failed to schedule follow-up:", err)
  }
}

/**
 * Cancel the follow-up notification for a task.
 * Call this when user marks task as completed (before the follow-up fires).
 */
export async function cancelFollowUpNotification(taskId: string) {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync()
    const toCancel  = scheduled.filter(
      (n) => n.content.data?.type === "task_followup" && n.content.data?.taskId === taskId
    )
    await Promise.all(toCancel.map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)))
    if (toCancel.length > 0) {
      console.log(`[Notif] Cancelled ${toCancel.length} follow-up notification(s) for task ${taskId}`)
    }
  } catch (err) {
    console.warn("[Notif] Failed to cancel follow-up:", err)
  }
}

/**
 * Immediately fire a well-done notification when task is marked complete.
 * Also cancels any pending follow-up for this task.
 */
export async function fireTaskCompletedNotification(taskName: string, taskId: string) {
  await ensureAndroidChannels()
  await cancelFollowUpNotification(taskId)
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Well Done! 🎉",
        body:  `You completed "${taskName}"! Keep up the great work.`,
        data:  { type: "task_completed", taskId },
        sound: true,
      },
      trigger: null,
    })
    console.log(`[Notif] Well-done fired for "${taskName}"`)
  } catch (err) {
    console.warn("[Notif] Failed to fire well-done notification:", err)
  }
}


// ─── Report notifications ─────────────────────────────────────────────────────

/**
 * Schedule daily, weekly, and monthly report notifications.
 * - Daily:   fires at 00:00 every day (for previous day's report)
 * - Weekly:  fires at 00:00 every Monday (for last week's report)
 * - Monthly: fires at 00:00 on the 1st of every month (for last month's report)
 *
 * Call once on login — skips if already scheduled.
 */
export async function scheduleReportNotifications() {
  await ensureAndroidChannels()
  try {
    const existing = await Notifications.getAllScheduledNotificationsAsync()
    const hasDaily   = existing.some((n) => n.content.data?.type === "report_daily")
    const hasWeekly  = existing.some((n) => n.content.data?.type === "report_weekly")
    const hasMonthly = existing.some((n) => n.content.data?.type === "report_monthly")

    // ── Daily report — every day at midnight ─────────────────────────────────
    if (!hasDaily) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "📊 Your Daily Report is Ready",
          body:  "Tap to see how your tasks and goals went today.",
          data:  { type: "report_daily", period: "daily" },
          sound: true,
        },
        trigger: {
          type:      Notifications.SchedulableTriggerInputTypes.DAILY,
          hour:      0,
          minute:    0,
          channelId: "default",
        },
      })
      console.log("[Notif] Daily report notification scheduled")
    }

    // ── Also schedule 11:59 PM daily report generation (saves to Supabase) ──
    if (!existing.some((n) => n.content.data?.type === "report_generate_daily")) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "",   // silent — just triggers generation
          body:  "",
          data:  { type: "report_generate_daily", period: "daily", silent: true },
          sound: false,
        },
        trigger: {
          type:      Notifications.SchedulableTriggerInputTypes.DAILY,
          hour:      23,
          minute:    59,
          channelId: "default",
        },
      })
    }

    // ── Weekly report — every Monday at midnight ──────────────────────────────
    if (!hasWeekly) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "📈 Your Weekly Report is Ready",
          body:  "See your task completions and goal progress for the week.",
          data:  { type: "report_weekly", period: "weekly" },
          sound: true,
        },
        trigger: {
          type:      Notifications.SchedulableTriggerInputTypes.WEEKLY,
          weekday:   2,   // Monday (1=Sun, 2=Mon … 7=Sat in Expo)
          hour:      0,
          minute:    0,
          channelId: "default",
        },
      })
      console.log("[Notif] Weekly report notification scheduled")
    }

    // ── Monthly report — 1st of each month at midnight ────────────────────────
    if (!hasMonthly) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "🗓️ Your Monthly Report is Ready",
          body:  "Your full month summary of tasks and savings is here.",
          data:  { type: "report_monthly", period: "monthly" },
          sound: true,
        },
        trigger: {
          type:      Notifications.SchedulableTriggerInputTypes.MONTHLY,
          day:       1,
          hour:      0,
          minute:    0,
          channelId: "default",
        },
      })
      console.log("[Notif] Monthly report notification scheduled")
    }
  } catch (err) {
    console.warn("[Notif] Failed to schedule report notifications:", err)
  }
}

/**
 * Cancel all scheduled report notifications (call on logout).
 */
export async function cancelReportNotifications() {
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync()
    const toCancel = all.filter((n) =>
      ["report_daily", "report_weekly", "report_monthly"].includes(n.content.data?.type as string)
    )
    await Promise.all(toCancel.map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)))
    console.log(`[Notif] Cancelled ${toCancel.length} report notification(s)`)
  } catch (err) {
    console.warn("[Notif] Failed to cancel report notifications:", err)
  }
}

// ─── DEV HELPER — call once from a button/useEffect to reset the engagement
//     schedule guard if you want to force a reschedule during testing ──────────
export async function resetEngagementSchedule() {
  try {
    const { default: AsyncStorage } = await import("@react-native-async-storage/async-storage")
    await AsyncStorage.removeItem(ENGAGEMENT_SCHEDULED_KEY)
    console.log("[Notif] Engagement schedule reset — will reschedule on next login")
  } catch (err) {
    console.warn("[Notif] Reset failed:", err)
  }
}