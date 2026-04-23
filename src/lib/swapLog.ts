export type SwapLogEntry = {
  txHash: string;
  walletAddress: string;
  timestampMs: number;
};

class SwapLog {
  private entries: SwapLogEntry[] = [];

  add(entry: SwapLogEntry) {
    this.entries.unshift(entry);
    if (this.entries.length > 50) this.entries.length = 50;
  }

  list() {
    return [...this.entries];
  }
}

export const swapLog = new SwapLog();
