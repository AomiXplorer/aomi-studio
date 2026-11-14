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
  /** Purchase orders (one per product purchase) and the payment rows that belong to them. */
  order: (id: string) => `aomi:order:${id}`,
  orders: "aomi:orders",
  orderByTransaction: (transactionId: string) => `aomi:order:tx:${transactionId}`,
  orderOpen: (emailLower: string) => `aomi:order:open:${emailLower}`,
  orderLock: (id: string) => `aomi:order:${id}:lock`,
  orderPoll: (id: string) => `aomi:order:${id}:poll`,
  /** Email uniqueness reservation, mirroring the username reservation. */
  email: (lower: string) => `aomi:email:${lower}`,
  /** Delivery log rows for the transactional email. */
  mail: (id: string) => `aomi:mail:${id}`,
  mails: "aomi:mails",
} as const;

/** The public origin, so a domain change is an env change and never a code change. */
export const PANEL_URL = (process.env.AOMI_PUBLIC_URL || "https://vierraapi.my.id").replace(/\/+$/, "");
