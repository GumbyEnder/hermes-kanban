export type HermesTaskStatus =
  | 'triage'
  | 'todo'
  | 'scheduled'
  | 'ready'
  | 'running'
  | 'blocked'
  | 'review'
  | 'done'
  | 'archived';

export interface HermesNativeConnectionSettings {
  baseUrl: string;
  /** Explicit opt-in for a future authenticated remote transport. */
  allowRemote?: boolean;
  timeoutMs?: number;
}

export interface ProviderReadResult<T> {
  value: T;
  stale: boolean;
  fetchedAt: string | null;
  error?: string;
}

export interface ExecutionBoard {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  tasks: ExecutionTask[];
  updatedAt?: string;
  extensions?: Record<string, unknown>;
}

export interface ExecutionTask {
  id: string;
  boardId?: string;
  title: string;
  body?: string;
  status: HermesTaskStatus;
  assignee?: string;
  priority?: number | string;
  tenant?: string;
  blocker?: string;
  result?: string;
  comments?: Array<Record<string, unknown>>;
  attachments?: Array<Record<string, unknown>>;
  links?: { parents: string[]; children: string[] };
  runs?: Array<Record<string, unknown>>;
  extensions?: Record<string, unknown>;
}

export interface ExecutionProfile {
  name: string;
  description?: string;
  extensions?: Record<string, unknown>;
}

export interface ProviderHealth {
  ok: boolean;
  message?: string;
  fetchedAt: string | null;
}

const KNOWN_TASK_FIELDS = new Set([
  'id', 'board_id', 'boardId', 'title', 'body', 'status', 'assignee',
  'priority', 'tenant', 'blocker', 'block_reason', 'result',
]);
const KNOWN_BOARD_FIELDS = new Set([
  'slug', 'id', 'name', 'description', 'icon', 'updated_at', 'updatedAt',
  'tasks', 'total', 'counts',
]);

/**
 * Read-only adapter for the native Hermes Kanban dashboard API.
 *
 * This adapter deliberately has no task mutation methods. Native task writes
 * are added only after the provider's read contract has been proven stable.
 */
export class HermesNativeProvider {
  readonly kind = 'hermes-native' as const;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private cache = new Map<string, { value: unknown; fetchedAt: string }>();

  constructor(settings: HermesNativeConnectionSettings) {
    const parsed = new URL(settings.baseUrl);
    const isLoopback = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost' || parsed.hostname === '[::1]';
    if (!isLoopback && !settings.allowRemote) {
      throw new Error('Hermes native provider only permits loopback endpoints unless allowRemote is explicitly enabled.');
    }
    this.baseUrl = settings.baseUrl.replace(/\/$/, '');
    this.timeoutMs = settings.timeoutMs ?? 5000;
  }

  async health(): Promise<ProviderHealth> {
    try {
      await this.request<Record<string, unknown>>('/api/plugins/kanban/boards');
      return { ok: true, fetchedAt: new Date().toISOString() };
    } catch (error) {
      return { ok: false, message: this.errorMessage(error), fetchedAt: null };
    }
  }

  async listBoards(): Promise<ExecutionBoard[]> {
    return (await this.listBoardsWithState()).value;
  }

  async listBoardsWithState(): Promise<ProviderReadResult<ExecutionBoard[]>> {
    return this.readWithCache('boards', async () => {
      const payload = await this.request<{ boards?: unknown[] }>('/api/plugins/kanban/boards');
      return (payload.boards ?? []).map(item => this.mapBoard(item as Record<string, unknown>));
    });
  }

  async getBoard(boardId: string): Promise<ExecutionBoard> {
    return (await this.getBoardWithState(boardId)).value;
  }

  async getBoardWithState(boardId: string): Promise<ProviderReadResult<ExecutionBoard>> {
    const key = `board:${boardId}`;
    return this.readWithCache(key, async () => {
      const payload = await this.request<{ columns?: Array<{ name?: string; tasks?: unknown[] }> }>(`/api/plugins/kanban/board?board=${encodeURIComponent(boardId)}`);
      const tasks = (payload.columns ?? []).flatMap(column =>
        (column.tasks ?? []).map(task => this.mapTask(task as Record<string, unknown>, boardId)),
      );
      return { id: boardId, name: boardId, tasks };
    });
  }

  async getTask(taskId: string, boardId?: string): Promise<ExecutionTask> {
    return (await this.getTaskWithState(taskId, boardId)).value;
  }

  async getTaskWithState(taskId: string, boardId?: string): Promise<ProviderReadResult<ExecutionTask>> {
    const key = `task:${boardId ?? ''}:${taskId}`;
    return this.readWithCache(key, async () => {
      const suffix = boardId ? `?board=${encodeURIComponent(boardId)}` : '';
      const payload = await this.request<Record<string, unknown>>(`/api/plugins/kanban/tasks/${encodeURIComponent(taskId)}${suffix}`);
      const task = this.mapTask((payload.task ?? {}) as Record<string, unknown>, boardId);
      task.comments = Array.isArray(payload.comments) ? payload.comments as Array<Record<string, unknown>> : [];
      task.attachments = Array.isArray(payload.attachments) ? payload.attachments as Array<Record<string, unknown>> : [];
      task.runs = Array.isArray(payload.runs) ? payload.runs as Array<Record<string, unknown>> : [];
      const links = payload.links as { parents?: string[]; children?: string[] } | undefined;
      task.links = { parents: links?.parents ?? [], children: links?.children ?? [] };
      return task;
    });
  }

  async listProfiles(): Promise<ExecutionProfile[]> {
    const payload = await this.request<{ profiles?: unknown[] }>('/api/plugins/kanban/profiles');
    return (payload.profiles ?? []).map(profile => {
      const item = profile as Record<string, unknown>;
      return {
        name: String(item.name ?? ''),
        description: typeof item.description === 'string' ? item.description : undefined,
        extensions: this.extensions(item, new Set(['name', 'description'])),
      };
    });
  }

  private async request<T>(path: string): Promise<T> {
    const controller = new AbortController();
    const timer = globalThis.setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}${path}`, { signal: controller.signal });
      if (!response.ok) throw new Error(`Hermes native API returned HTTP ${response.status}`);
      return await response.json() as T;
    } finally {
      globalThis.clearTimeout(timer);
    }
  }

  private async readWithCache<T>(key: string, fetcher: () => Promise<T>): Promise<ProviderReadResult<T>> {
    try {
      const value = await fetcher();
      const fetchedAt = new Date().toISOString();
      this.cache.set(key, { value, fetchedAt });
      return { value, stale: false, fetchedAt };
    } catch (error) {
      const cached = this.cache.get(key);
      if (cached) {
        return { value: cached.value as T, stale: true, fetchedAt: cached.fetchedAt, error: this.errorMessage(error) };
      }
      throw error;
    }
  }

  private mapBoard(item: Record<string, unknown>): ExecutionBoard {
    const id = String(item.slug ?? item.id ?? '');
    return {
      id,
      name: String(item.name ?? id),
      description: typeof item.description === 'string' ? item.description : undefined,
      icon: typeof item.icon === 'string' ? item.icon : undefined,
      tasks: [],
      updatedAt: typeof item.updated_at === 'string' ? item.updated_at : undefined,
      extensions: this.extensions(item, KNOWN_BOARD_FIELDS),
    };
  }

  private mapTask(item: Record<string, unknown>, boardId?: string): ExecutionTask {
    return {
      id: String(item.id ?? ''),
      boardId: boardId ?? (typeof item.board_id === 'string' ? item.board_id : undefined),
      title: String(item.title ?? ''),
      body: typeof item.body === 'string' ? item.body : undefined,
      status: String(item.status ?? 'todo') as HermesTaskStatus,
      assignee: typeof item.assignee === 'string' ? item.assignee : undefined,
      priority: typeof item.priority === 'number' || typeof item.priority === 'string' ? item.priority : undefined,
      tenant: typeof item.tenant === 'string' ? item.tenant : undefined,
      blocker: typeof item.block_reason === 'string' ? item.block_reason : undefined,
      result: typeof item.result === 'string' ? item.result : undefined,
      extensions: this.extensions(item, KNOWN_TASK_FIELDS),
    };
  }

  private extensions(item: Record<string, unknown>, known: Set<string>): Record<string, unknown> | undefined {
    const extensions = Object.fromEntries(Object.entries(item).filter(([key]) => !known.has(key)));
    return Object.keys(extensions).length ? extensions : undefined;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
