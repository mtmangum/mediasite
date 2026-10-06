import type { Presentation } from "./shared";

// The loaded presentation list, shared by the card, health, and analytics modules.
export const store = { items: [] as Presentation[] };

export const findPresentation = (id: string) =>
  store.items.find((p) => p.id === id);
