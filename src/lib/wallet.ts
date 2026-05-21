export type Eip1193Provider = {
  request: (
    args: { method: string; params?: unknown[] | Record<string, unknown> },
    chain?: string,
    expiry?: number
  ) => Promise<unknown>;
  on?: (event: string, listener: (...args: any[]) => void) => void;
  removeListener?: (event: string, listener: (...args: any[]) => void) => void;
};

export function getEip1193Provider(): Eip1193Provider | null {
  if (typeof window === "undefined") return null;
  return ((window as any).ethereum as Eip1193Provider | undefined) ?? null;
}
