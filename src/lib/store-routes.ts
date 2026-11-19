export const storeScreens = [
  "start",
  "dashboard",
  "pos",
  "cfd",
  "products",
  "inventory",
  "tables",
  "kds",
  "orders",
  "shifts",
  "staff",
  "settings",
  "billing",
  "feedback",
] as const;
export function isStoreScreen(screen: string) {
  return (storeScreens as readonly string[]).includes(screen);
}
