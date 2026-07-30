import { MarkdownPostProcessorContext } from 'obsidian';
import { ExecutionBoard, ExecutionTask, HermesNativeProvider } from './hermes-native-provider';

export interface NativeTaskBlockConfig {
  id?: string;
  board?: string;
  mode?: string;
}

export interface NativeBoardBlockConfig {
  board?: string;
  filter?: string;
}

export function parseBlockConfig(source: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const rawLine of source.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf(':');
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (key && value) values[key] = value;
  }
  return values;
}

export function formatTaskSummary(task: ExecutionTask): string {
  const lines = [task.title, `Status: ${task.status}`];
  if (task.assignee) lines.push(`Assignee: ${task.assignee}`);
  if (task.blocker) lines.push(`Blocked: ${task.blocker}`);
  if (task.result) lines.push(`Result: ${task.result}`);
  return lines.join('\n');
}

export function formatBoardSummary(board: ExecutionBoard): string {
  const counts = new Map<string, number>();
  for (const task of board.tasks) counts.set(task.status, (counts.get(task.status) ?? 0) + 1);
  const lines = [board.name];
  for (const status of ['triage', 'todo', 'scheduled', 'ready', 'running', 'blocked', 'review', 'done']) {
    const count = counts.get(status);
    if (count) lines.push(`${status}: ${count}`);
  }
  return lines.join('\n');
}

function renderError(el: HTMLElement, message: string): void {
  el.empty();
  el.addClass('hermes-native-error');
  el.createEl('strong', { text: 'Native Hermes unavailable' });
  el.createEl('div', { text: message });
}

function renderTask(el: HTMLElement, task: ExecutionTask, stale: boolean, fetchedAt: string | null): void {
  el.empty();
  el.addClass('hermes-native-task');
  const header = el.createDiv({ cls: 'hermes-native-header' });
  header.createEl('strong', { text: task.title || task.id });
  header.createEl('code', { text: task.status });
  el.createEl('div', { text: `Task: ${task.id}` });
  if (task.assignee) el.createEl('div', { text: `Assignee: ${task.assignee}` });
  if (task.blocker) el.createEl('div', { text: `Blocked: ${task.blocker}` });
  if (task.result) el.createEl('div', { text: task.result, cls: 'hermes-native-result' });
  if (stale) el.createEl('small', { text: `Cached state — last refreshed ${fetchedAt ?? 'unknown'}`, cls: 'hermes-native-stale' });
}

function renderBoard(el: HTMLElement, board: ExecutionBoard, stale: boolean, fetchedAt: string | null): void {
  el.empty();
  el.addClass('hermes-native-board');
  el.createEl('strong', { text: board.name || board.id });
  const statuses = new Map<string, number>();
  for (const task of board.tasks) statuses.set(task.status, (statuses.get(task.status) ?? 0) + 1);
  const summary = el.createEl('ul');
  for (const [status, count] of statuses) summary.createEl('li', { text: `${status}: ${count}` });
  if (board.tasks.length === 0) el.createEl('div', { text: 'No tasks on this native board.' });
  if (stale) el.createEl('small', { text: `Cached state — last refreshed ${fetchedAt ?? 'unknown'}`, cls: 'hermes-native-stale' });
}

export function registerHermesNativeRenderers(
  registerCodeBlockProcessor: (language: string, processor: (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => Promise<void>) => void,
  providerFactory: () => HermesNativeProvider,
): void {
  registerCodeBlockProcessor('hermes-task', async (source, el) => {
    const config = parseBlockConfig(source) as NativeTaskBlockConfig;
    if (!config.id) return renderError(el, 'A hermes-task block requires id: <native task id>.');
    try {
      const provider = providerFactory();
      const state = await provider.getTaskWithState(config.id, config.board);
      renderTask(el, state.value, state.stale, state.fetchedAt);
    } catch (error) {
      renderError(el, error instanceof Error ? error.message : String(error));
    }
  });

  registerCodeBlockProcessor('hermes-board', async (source, el) => {
    const config = parseBlockConfig(source) as NativeBoardBlockConfig;
    if (!config.board) return renderError(el, 'A hermes-board block requires board: <native board slug>.');
    try {
      const provider = providerFactory();
      const state = await provider.getBoardWithState(config.board);
      renderBoard(el, state.value, state.stale, state.fetchedAt);
    } catch (error) {
      renderError(el, error instanceof Error ? error.message : String(error));
    }
  });
}

export function nativeRendererCss(): string {
  return `
.hermes-native-task, .hermes-native-board, .hermes-native-error {
  border: 1px solid var(--background-modifier-border);
  border-radius: 8px;
  padding: 12px;
  margin: 0.5em 0;
  background: var(--background-secondary);
}
.hermes-native-header { display: flex; justify-content: space-between; gap: 12px; }
.hermes-native-header code { color: var(--text-accent); }
.hermes-native-result { margin-top: 8px; white-space: pre-wrap; }
.hermes-native-stale { display: block; margin-top: 8px; color: var(--text-warning); }
.hermes-native-error { border-color: var(--text-error); }
`;
}
