import type { Presentation } from "./shared";

// The loaded presentation list, shared by the card, health, and analytics modules.
export const store = { items: [] as Presentation[] };

// Presentations opened by link that aren't among the loaded list (older recordings).
const extras = new Map<string, Presentation>();
export const addExtra = (p: Presentation) => extras.set(p.id, p);

export const findPresentation = (id: string) =>
  store.items.find((p) => p.id === id) ?? extras.get(id);
