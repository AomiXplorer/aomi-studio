/** Every Redis key the application owns lives here, so nothing is spelled inline twice. */
export const K = {
  user: (id: string) => `aomi:user:${id}`,
  username: (lower: string) => `aomi:username:${lower}`,
  users: "aomi:users",
  projects: "aomi:projects",
  userProjects: (userId: string) => `aomi:user:${userId}:projects`,
  userStats: (userId: string) => `aomi:user:${userId}:stats`,
  project: (id: string) => `aomi:project:${id}`,
  projectMessages: (id: string) => `aomi:project:${id}:messages`,
  apiKey: (id: string) => `aomi:apikey:${id}`,
  apiKeys: "aomi:apikeys",
  activeKey: "aomi:apikey:active",
  audit: "aomi:audit",
  settings: "aomi:settings",
  loginFail: (key: string) => `aomi:login:fail:${key}`,
  telegramFlow: (chatId: string | number) => `aomi:tg:flow:${chatId}`,
  telegramThrottle: (chatId: string | number) => `aomi:tg:throttle:${chatId}`,
  backupLast: "aomi:backup:last",
  boot: "aomi:boot",
} as const;

export const PANEL_URL = "https://aomi-studio.vercel.app";
