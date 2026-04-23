import { App, Notice } from 'obsidian';
import { KanbanParser } from './kanban-parser';

/**
 * Due date notification manager.
 * Scans all kanban boards for overdue cards and shows Obsidian Notice() banners.
 * Deduplicates: only notifies once per card per session.
 */
export class DueDateNotifier {
  private app: App;
  private parser: KanbanParser;
  private notifiedCardIds: Set<string> = new Set();
  private timerId: ReturnType<typeof setInterval> | null = null;
  private intervalMinutes: number = 15;

  constructor(app: App, parser: KanbanParser, intervalMinutes: number = 15) {
    this.app = app;
    this.parser = parser;
    this.intervalMinutes = intervalMinutes;
  }

  /** Start periodic checking. If intervalMinutes is 0, does nothing. */
  start(intervalMinutes?: number): void {
    this.intervalMinutes = intervalMinutes ?? this.intervalMinutes;
    this.stop();
    this.notifiedCardIds.clear();

    if (this.intervalMinutes <= 0) return;

    // Run immediately on start
    this.check();

    this.timerId = setInterval(() => this.check(), this.intervalMinutes * 60 * 1000);
  }

  /** Stop periodic checking. */
  stop(): void {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  /** Manually trigger a due date sweep. Returns overdue cards and which were newly notified. */
  async check(): Promise<{ overdue: Array<{ id: string; title: string; boardId: string; dueDate: string }>; notified: string[] }> {
    const result = await this.parser.queryCards({ overdue: true });
    const overdue = result.cards.map(c => ({
      id: c.id,
      title: c.title,
      boardId: c.boardId,
      dueDate: c.dueDate!,
    }));

    const newlyNotified: string[] = [];
    for (const card of overdue) {
      if (!this.notifiedCardIds.has(card.id)) {
        this.notifiedCardIds.add(card.id);
        newlyNotified.push(card.id);
        new Notice(`⚠️ Card "${card.title}" is overdue (was due: ${card.dueDate})`);
      }
    }

    return { overdue, notified: newlyNotified };
  }

  /** Get count of already-notified cards (useful for settings display). */
  getNotifiedCount(): number {
    return this.notifiedCardIds.size;
  }

  /** Clear notification history (useful for "remind me again"). */
  reset(): void {
    this.notifiedCardIds.clear();
  }
}
