export function element<T extends HTMLElement = HTMLElement>(id: string): T {
  const value = document.getElementById(id);
  if (!value) throw new Error(`Missing UI element: ${id}`);
  return value as T;
}
export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
export interface ApiResponse {
  url: string;
  status: number;
  statusText: string;
  ms: number;
  contentType: string;
  body: string;
}
export interface Connection {
  baseUrl: string;
  username: string;
  hasPassword: boolean;
  hasApiKey: boolean;
}
export interface Presentation {
  id: string;
  title?: string;
  description?: string;
  status?: string;
  created?: string;
  recorded?: string;
  durationMs?: number;
  owner?: string;
  presenter?: string;
  views?: number;
  folder?: string;
  isLive?: boolean;
  thumbnail?: string;
  watchUrl: string;
}

export interface Analytics {
  totalViews: number | null;
  liveViews: number | null;
  onDemandViews: number | null;
  uniqueUsers: number | null;
  peakConnections: number | null;
  watchSeconds: number | null;
  firstWatched: string | null;
  lastWatched: string | null;
  browsers: { name: string; views: number | null }[] | null;
  systems: { name: string; views: number | null }[] | null;
  warnings: string[];
  requests: { endpoint: string; status: number; ms: number }[];
  fetchedAt: string;
}
