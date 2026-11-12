import { create } from "zustand";
import type { CartLine } from "./view-types";
type State = {
  lines: CartLine[];
  add: (line: CartLine) => void;
  quantity: (key: string, delta: number) => void;
  clear: () => void;
  restore: (lines: CartLine[]) => void;
};
export const useCart = create<State>((set) => ({
  lines: [],
  add: (line) =>
    set((s) => {
      const old = s.lines.find((l) => l.key === line.key);
      return {
        lines: old
          ? s.lines.map((l) =>
              l.key === line.key
                ? { ...l, quantity: l.quantity + line.quantity }
                : l,
            )
          : [...s.lines, line],
      };
    }),
  quantity: (key, delta) =>
    set((s) => ({
      lines: s.lines
        .map((l) =>
          l.key === key ? { ...l, quantity: l.quantity + delta } : l,
        )
        .filter((l) => l.quantity > 0),
    })),
  clear: () => set({ lines: [] }),
  restore: (lines) => set({ lines }),
}));
