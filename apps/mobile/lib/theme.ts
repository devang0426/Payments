// Shared look for StyleSheet. Big, high-contrast UI so parents can use it too.
export const colors = {
  background: "#FFFFFF",
  text: "#111827",
  muted: "#6B7280",
  primary: "#5B21B6",
  primaryText: "#FFFFFF",
  success: "#15803D",
  danger: "#B91C1C",
  card: "#F3F4F6",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const fontSize = {
  body: 18,
  label: 16,
  title: 40,
  button: 20,
} as const;

export const radius = {
  md: 12,
  lg: 20,
} as const;
