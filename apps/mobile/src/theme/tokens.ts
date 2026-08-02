// Design tokens ported 1:1 from apps/web/app/globals.css so the two clients
// stay visually identical. When a brand colour changes on the web, change it
// here too — these are the same values, not an approximation.

export type ThemeName = "light" | "dark";

export type Theme = {
  name: ThemeName;
  primary: string;
  primaryHover: string;
  primarySoft: string;
  primaryFg: string;
  surface: string;
  surfaceMuted: string;
  surfaceSunken: string;
  surfaceInset: string;
  border: string;
  borderSubtle: string;
  text: string;
  textMuted: string;
  textSubtle: string;
  success: string;
  warning: string;
  danger: string;
  /** Channel accents for conversation rows and bubbles. */
  channel: Record<"email" | "instagram" | "facebook" | "whatsapp", string>;
};

const channel = {
  email: "#5f6b80",
  instagram: "#d6249f",
  facebook: "#1877f2",
  whatsapp: "#25d366"
} as const;

export const lightTheme: Theme = {
  name: "light",
  primary: "#037ef3",
  primaryHover: "#0269ce",
  primarySoft: "#e6f2fe",
  primaryFg: "#ffffff",
  surface: "#ffffff",
  surfaceMuted: "#f7f9fc",
  surfaceSunken: "#f1f4f9",
  surfaceInset: "#fafbfd",
  border: "#e4e8ef",
  borderSubtle: "#eef0f4",
  text: "#0f172a",
  textMuted: "#5f6b80",
  textSubtle: "#8b94a6",
  success: "#10a368",
  warning: "#d98208",
  danger: "#d8324a",
  channel
};

export const darkTheme: Theme = {
  name: "dark",
  primary: "#037ef3",
  primaryHover: "#0269ce",
  primarySoft: "#17324c",
  primaryFg: "#ffffff",
  surface: "#151a21",
  surfaceMuted: "#0d1015",
  surfaceSunken: "#1c222b",
  surfaceInset: "#191f27",
  border: "#2a313c",
  borderSubtle: "#222833",
  text: "#e7eaf0",
  textMuted: "#99a3b2",
  textSubtle: "#6c7583",
  success: "#34d399",
  warning: "#f0a33a",
  danger: "#f26d7d",
  channel
};

/** 4pt spacing scale. */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  pill: 999
} as const;

export const typeScale = {
  display: { fontSize: 28, fontWeight: "700" },
  title: { fontSize: 20, fontWeight: "700" },
  heading: { fontSize: 16, fontWeight: "600" },
  body: { fontSize: 15, fontWeight: "400" },
  label: { fontSize: 13, fontWeight: "500" },
  caption: { fontSize: 12, fontWeight: "400" },
  eyebrow: { fontSize: 11, fontWeight: "600", letterSpacing: 0.6 }
} as const;
