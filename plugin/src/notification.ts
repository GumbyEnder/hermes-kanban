import { App, Notice, normalizePath } from 'obsidian';
import { KanbanParser } from './kanban-parser';
import { HermesKanbanSettings } from './settings';

/**
 * Check all kanban boards for overdue cards and show Obsidian notices.
 * Deduplicates per session — each card ID is notified at most once.
 */
export async function checkDueDateNotifications(
  app: App,
  settings: HermesKanbanSettings,
  parser: KanbanParser,
  notifiedIds: Set<string>,
): Promise<{ overdue: Array<{ cardId: string; title: string; dueDate: string; board: string }>; notified: string[]; archived?: { archived: number; details: string[] } }> {
  const today = new Date().toISOString().slice(0, 10);
  const queryResult = await parser.queryCards({ overdue: true });
  const overdue = queryResult.cards;

  const notifiedCardIds: string[] = [];

  for (const card of overdue) {
    if (notifiedIds.has(card.id)) continue;
    notifiedIds.add(card.id);
    notifiedCardIds.push(card.id);

    // Extract board name from path
    const boardName = card.boardId.split('/').pop()?.replace('.md', '') || card.boardId;
    new Notice(`Card "${card.title}" in board "${boardName}" is overdue`);
  }

  const overdueWithBoard = overdue.map(c => ({
    cardId: c.id,
    title: c.title,
    dueDate: c.dueDate!,
    board: c.boardId.split('/').pop()?.replace('.md', '') || c.boardId,
  }));

  const result: { overdue: typeof overdueWithBoard; notified: string[]; archived?: { archived: number; details: string[] } } = {
    overdue: overdueWithBoard,
    notified: notifiedCardIds,
  };

  // If archive is enabled, run archival sweep during notification check
  if (settings.archiveEnabled) {
    try {
      const archiveResult = await parser.archiveCards(
        settings.boardFolder,
        settings.archiveFilePath,
        settings.archiveDays,
      );
      if (archiveResult.archived > 0) {
        result.archived = { archived: archiveResult.archived, details: archiveResult.details };
      }
    } catch (err) {
      console.error('Error during auto-archive:', err);
    }
  }

  return result;
}

/**
 * Start the due-date notification scheduler. Returns a cleanup function.
 */
export function startNotificationScheduler(
  app: App,
  settings: HermesKanbanSettings,
  parser: KanbanParser,
  notifiedIds: Set<string>,
): () => void {
  // Run immediately on startup
  checkDueDateNotifications(app, settings, parser, notifiedIds).catch(err => {
    console.error('Error checking due date notifications:', err);
  });

  // Set up interval if notificationInterval > 0
  if (settings.notificationInterval > 0) {
    const intervalMs = settings.notificationInterval * 60 * 1000;
    const intervalId = setInterval(() => {
      checkDueDateNotifications(app, settings, parser, notifiedIds).catch(err => {
        console.error('Error checking due date notifications:', err);
      });
    }, intervalMs);

    return () => clearInterval(intervalId);
  }

  // Return no-op cleanup if disabled
  return () => {};
}
