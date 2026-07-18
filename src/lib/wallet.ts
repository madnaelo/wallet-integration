export type Eip1193Provider = {
  request: (
    args: { method: string; params?: unknown[] | Record<string, unknown> },
    chain?: string,
    expiry?: number
  ) => Promise<unknown>;
  on?: (event: string, listener: (...args: any[]) => void) => void;
  removeListener?: (event: string, listener: (...args: any[]) => void) => void;
};
