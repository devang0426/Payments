// Shared look for StyleSheet, from the UI design (FlowPay.html at the repo root): lavender
// background, one purple accent, Atkinson Hyperlegible, big type and pill buttons so parents can use it.
export const colors = {
  background: "#F2F1F8",
  surface: "#FFFFFF",
  text: "#1E1B2E",
  muted: "#4F4C66",
  line: "#DEDCEE",
  primary: "#5B4BD6",
  primaryText: "#FFFFFF",
  primarySoft: "#E6E3F8", // info notes
  primaryDeep: "#3A2FA0",
  success: "#15803D",
  danger: "#B42318",
  dangerSoft: "#FBE9E7",
  warning: "#7A4200",
  warningSoft: "#FDF1DC", // amber cards (M13)
  rehearsal: "#B45309", // the orange REHEARSAL banner
  card: "#FFFFFF",
} as const;

// Loaded in app/_layout.tsx. A custom font has no automatic bold on Android, so bold text uses
// fonts.bold instead of fontWeight.
export const fonts = {
  regular: "AtkinsonHyperlegible_400Regular",
  bold: "AtkinsonHyperlegible_700Bold",
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
  title: 46,
  button: 20,
  heading: 24,
} as const;

export const radius = {
  md: 16,
  lg: 20,
  pill: 999,
} as const;
