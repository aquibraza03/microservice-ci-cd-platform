/**
 * Single-flight refresh coordinator.
 *
 * Guarantees that when N requests fail with 401 simultaneously, the token
 * refresh runs exactly once and every caller waits on the same promise.
 */
export type RefreshTask = () => Promise<void>;

export class RefreshCoordinator {
  private inflight: Promise<void> | null = null;

  constructor(private readonly task: RefreshTask) {}

  /** Run the refresh, deduplicating concurrent callers. */
  refresh(): Promise<void> {
    if (this.inflight === null) {
      this.inflight = this.task().finally(() => {
        this.inflight = null;
      });
    }
    return this.inflight;
  }

  /** Whether a refresh is currently in progress. */
  get isRefreshing(): boolean {
    return this.inflight !== null;
  }
}
