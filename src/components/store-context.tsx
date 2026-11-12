"use client";
import { createContext, useContext } from "react";
import type { Bootstrap } from "@/lib/view-types";
type Store = {
  data: Bootstrap;
  slug: string;
  namespace: string;
  terminalKey: string;
  online: boolean;
  refresh: () => Promise<void>;
  action: <T = unknown>(path: string, body: unknown) => Promise<T>;
  notify: (message: string) => void;
};
export const StoreContext = createContext<Store | null>(null);
export function useStore() {
  const store = useContext(StoreContext);
  if (!store) throw new Error("Store provider missing");
  return store;
}
