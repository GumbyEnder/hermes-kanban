import { App, TFile, TFolder, normalizePath, moment } from 'obsidian';

export interface KanbanCard {
  id: string;
  title: string;
  description?: string;
  column: string;
  boardId: string;
  priority?: 'high' | 'medium' | 'low';
  tags?: string[];
  dueDate?: string;
  doneDate?: string;       // YYYY-MM-DD when card was marked done
  blocked?: boolean;
  blockerReason?: string;
  linkedCards?: string[];
  recur?: string;           // 'daily' | 'weekly' | 'monthly' | 'YYYY-MM-DD'
  checked: boolean;
}

export interface KanbanBoard {
  id: string;
  title: string;
  path: string;
  columns: string[];
  cards: KanbanCard[];
}

export class KanbanParser {
  private app: App;

  constructor(app: App) {
    this.app = app;
  }

  async listBoards(boardFolder: string): Promise<{ ok: boolean; boards: Array<{ id: string; title: string; path: string; cardCount: number }> }> {
    const folder = this.app.vault.getAbstractFileByPath(normalizePath(boardFolder));
    const boards: Array<{ id: string; title: string; path: string; cardCount: number }> = [];

    if (folder instanceof TFolder) {
      for (const child of folder.children) {
        if (child instanceof TFile && child.extension === 'md') {
          const content = await this.app.vault.read(child);
          if (this.isKanbanBoard(content)) {
            const parsed = this.parseBoard(child.path, child.basename, content);
            boards.push({ id: child.path, title: child.basename, path: child.path, cardCount: parsed.cards.length });
          }
        }
      }
    }

    return { ok: true, boards };
  }

  async getBoard(boardId: string): Promise<{ ok: boolean; board?: KanbanBoard; error?: string }> {
    const file = this.app.vault.getAbstractFileByPath(normalizePath(boardId));
    if (!(file instanceof TFile)) return { ok: false, error: `Board not found: ${boardId}` };
    const content = await this.app.vault.read(file);
    return { ok: true, board: this.parseBoard(file.path, file.basename, content) };
  }

  async createBoard(
    body: { title: string; columns?: string[]; boardFolder?: string },
    defaultFolder: string
  ): Promise<{ ok: boolean; board?: Partial<KanbanBoard>; error?: string }> {
    const columns = body.columns || ['Backlog', 'To Do', 'In Progress', 'Review', 'Done'];
    const folder = body.boardFolder || defaultFolder;
    const path = normalizePath(`${folder}/${body.title}.md`);
    const content = this.buildBoardMarkdown(body.title, columns);

    await this.app.vault.adapter.mkdir(normalizePath(folder)).catch(() => {});
    await this.app.vault.create(path, content);

    return { ok: true, board: { id: path, title: body.title, path, columns, cards: [] } };
  }

  async addCard(body: {
    boardId: string;
    column: string;
    title: string;
    description?: string;
    priority?: string;
    tags?: string[];
    dueDate?: string;
    blocked?: boolean;
    blockerReason?: string;
  }): Promise<{ ok: boolean; card?: Partial<KanbanCard>; error?: string }> {
    const file = this.app.vault.getAbstractFileByPath(normalizePath(body.boardId));
    if (!(file instanceof TFile)) return { ok: false, error: `Board not found: ${body.boardId}` };

    const content = await this.app.vault.read(file);
    const cardLine = this.formatCardLine(body as any);
    const updated = this.insertCardIntoColumn(content, body.column, cardLine);

    await this.app.vault.modify(file, updated);
    const id = `${body.boardId}::${body.column}::${body.title}`;
    return { ok: true, card: { id, title: body.title, column: body.column, boardId: body.boardId } };
  }

  async moveCard(body: { cardId: string; toColumn: string }): Promise<{ ok: boolean; message?: string; error?: string }> {
    const [boardId, fromColumn, ...titleParts] = body.cardId.split('::');
    const title = titleParts.join('::');
    const file = this.app.vault.getAbstractFileByPath(normalizePath(boardId));
    if (!(file instanceof TFile)) return { ok: false, error: `Board not found: ${boardId}` };

    const content = await this.app.vault.read(file);
    const lines = content.split('\n');
    let cardLine: string | null = null;
    let cardLineIdx = -1;
    let inFromColumn = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('## ')) inFromColumn = line.slice(3).trim() === fromColumn;
      if (inFromColumn && (line.startsWith('- [ ]') || line.startsWith('- [x]'))) {
        const lineTitle = this.extractTitleFromLine(line);
        if (lineTitle === title) { cardLine = line; cardLineIdx = i; break; }
      }
    }

    if (cardLineIdx === -1 || !cardLine) {
      return { ok: false, error: `Card "${title}" not found in column "${fromColumn}"` };
    }

    lines.splice(cardLineIdx, 1);
    const updated = this.insertCardIntoColumn(lines.join('\n'), body.toColumn, cardLine);
    await this.app.vault.modify(file, updated);
    return { ok: true, message: `Moved "${title}" from "${fromColumn}" to "${body.toColumn}"` };
  }

  async updateCard(cardId: string, body: Partial<KanbanCard>): Promise<{ ok: boolean; message?: string; error?: string }> {
    const [boardId, column, ...titleParts] = cardId.split('::');
    const title = titleParts.join('::');
    const file = this.app.vault.getAbstractFileByPath(normalizePath(boardId));
    if (!(file instanceof TFile)) return { ok: false, error: `Board not found: ${boardId}` };

    const content = await this.app.vault.read(file);
    const lines = content.split('\n');
    let updated = false;
    let inColumn = false;

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('## ')) inColumn = lines[i].slice(3).trim() === column;
      if (inColumn && (lines[i].startsWith('- [ ]') || lines[i].startsWith('- [x]'))) {
        if (this.extractTitleFromLine(lines[i]) === title) {
          lines[i] = this.formatCardLine({ ...body, title: body.title || title, column, boardId } as any);
          updated = true;
          break;
        }
      }
    }

    if (!updated) return { ok: false, error: `Card "${title}" not found` };
    await this.app.vault.modify(file, lines.join('\n'));
    return { ok: true, message: `Updated card "${title}"` };
  }

  async queryCards(filters: {
    boardId?: string;
    column?: string;
    tag?: string;
    blocked?: boolean;
    overdue?: boolean;
  }): Promise<{ ok: boolean; cards: KanbanCard[] }> {
    const results: KanbanCard[] = [];
    const today = new Date().toISOString().slice(0, 10);
    const files: TFile[] = [];

    if (filters.boardId) {
      const f = this.app.vault.getAbstractFileByPath(normalizePath(filters.boardId));
      if (f instanceof TFile) files.push(f);
    } else {
      this.app.vault.getMarkdownFiles().forEach(f => files.push(f));
    }

    for (const file of files) {
      const content = await this.app.vault.read(file);
      if (!this.isKanbanBoard(content)) continue;
      const board = this.parseBoard(file.path, file.basename, content);
      for (const card of board.cards) {
        if (filters.column && card.column !== filters.column) continue;
        if (filters.tag && !card.tags?.includes(filters.tag)) continue;
        if (filters.blocked !== undefined && card.blocked !== filters.blocked) continue;
        if (filters.overdue && (!card.dueDate || card.dueDate >= today)) continue;
        results.push(card);
      }
    }

    return { ok: true, cards: results };
  }

  async generateStandup(body: { boardId?: string }): Promise<{ ok: boolean; standup?: object }> {
    const result = await this.queryCards({ boardId: body.boardId });
    const inProgress = result.cards.filter(c => c.column === 'In Progress');
    const blocked = result.cards.filter(c => c.blocked);
    const today = new Date().toISOString().slice(0, 10);
    const dueSoon = result.cards.filter(c => c.dueDate && c.dueDate <= today && c.column !== 'Done');

    return {
      ok: true,
      standup: {
        generated: new Date().toISOString(),
        inProgress: inProgress.map(c => ({ title: c.title, board: c.boardId, priority: c.priority })),
        blocked: blocked.map(c => ({ title: c.title, reason: c.blockerReason, board: c.boardId })),
        dueSoon: dueSoon.map(c => ({ title: c.title, dueDate: c.dueDate, column: c.column })),
        summary: `${inProgress.length} in progress, ${blocked.length} blocked, ${dueSoon.length} due today/overdue`,
      }
    };
  }

  async generateReview(body: { boardId?: string }): Promise<{ ok: boolean; review?: object }> {
    const result = await this.queryCards({ boardId: body.boardId });
    const done = result.cards.filter(c => c.column === 'Done');
    const carryOver = result.cards.filter(c => c.column !== 'Done');
    const blocked = result.cards.filter(c => c.blocked);

    return {
      ok: true,
      review: {
        generated: new Date().toISOString(),
        completed: done.map(c => ({ title: c.title, board: c.boardId })),
        carryOver: carryOver.map(c => ({ title: c.title, column: c.column, priority: c.priority })),
        blocked: blocked.map(c => ({ title: c.title, reason: c.blockerReason })),
        velocity: done.length,
        summary: `Completed: ${done.length}. Carry-over: ${carryOver.length}. Blocked: ${blocked.length}.`,
      }
    };
  }

  // --- Private helpers ---

  /**
   * Process recurring cards — find Done cards with recur: field, re-create them in Backlog.
   * Call this on a schedule (e.g. daily standup) to auto-refresh recurring tasks.
   */
  async processRecurring(body: { boardId?: string }): Promise<{ ok: boolean; recreated: number; cards: string[] }> {
    const result = await this.queryCards({ boardId: body.boardId });
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const recreated: string[] = [];

    for (const card of result.cards) {
      if (!card.recur || !card.checked) continue;

      let shouldRecreate = false;
      let nextDue: string | undefined;

      if (card.recur === 'daily') {
        shouldRecreate = true;
        nextDue = todayStr;
      } else if (card.recur === 'weekly') {
        shouldRecreate = true;
        const next = new Date(today);
        next.setDate(next.getDate() + 7);
        nextDue = next.toISOString().slice(0, 10);
      } else if (card.recur === 'monthly') {
        shouldRecreate = true;
        const next = new Date(today);
        next.setMonth(next.getMonth() + 1);
        nextDue = next.toISOString().slice(0, 10);
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(card.recur)) {
        // Specific date recurrence — only recreate if that date is today or past
        shouldRecreate = card.recur <= todayStr;
        nextDue = card.recur;
      }

      if (shouldRecreate) {
        await this.addCard({
          boardId: card.boardId,
          column: 'Backlog',
          title: card.title,
          priority: card.priority,
          tags: card.tags,
          dueDate: nextDue,
          recur: card.recur,
        } as any);
        recreated.push(card.title);
      }
    }

    return { ok: true, recreated: recreated.length, cards: recreated };
  }

  /**
   * Link two cards across boards. Adds a wikilink on the source card pointing to the target.
   */
  async linkCards(body: { fromCardId: string; toCardId: string }): Promise<{ ok: boolean; message?: string; error?: string }> {
    const [boardId, column, ...titleParts] = body.fromCardId.split('::');
    const title = titleParts.join('::');
    const file = this.app.vault.getAbstractFileByPath(normalizePath(boardId));
    if (!(file instanceof TFile)) return { ok: false, error: `Board not found: ${boardId}` };

    const content = await this.app.vault.read(file);
    const lines = content.split('\n');
    let updated = false;
    let inColumn = false;

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('## ')) inColumn = lines[i].slice(3).trim() === column;
      if (inColumn && (lines[i].startsWith('- [ ]') || lines[i].startsWith('- [x]'))) {
        if (this.extractTitleFromLine(lines[i]) === title) {
          // Append wikilink if not already present
          if (!lines[i].includes(`[[${body.toCardId}]]`)) {
            lines[i] += ` | [[${body.toCardId}]]`;
          }
          updated = true;
          break;
        }
      }
    }

    if (!updated) return { ok: false, error: `Card "${title}" not found in "${column}"` };
    await this.app.vault.modify(file, lines.join('\n'));
    return { ok: true, message: `Linked "${body.fromCardId}" → "${body.toCardId}"` };
  }

  /**
   * Get all linked cards for a given card ID.
   */
  async getCardLinks(cardId: string): Promise<{ ok: boolean; links?: string[]; error?: string }> {
    const [boardId, column, ...titleParts] = cardId.split('::');
    const title = titleParts.join('::');
    const file = this.app.vault.getAbstractFileByPath(normalizePath(boardId));
    if (!(file instanceof TFile)) return { ok: false, error: `Board not found: ${boardId}` };

    const content = await this.app.vault.read(file);
    const lines = content.split('\n');
    let inColumn = false;

    for (const line of lines) {
      if (line.startsWith('## ')) inColumn = line.slice(3).trim() === column;
      if (inColumn && (line.startsWith('- [ ]') || line.startsWith('- [x]'))) {
        if (this.extractTitleFromLine(line) === title) {
          const links = [...line.matchAll(/\[\[([^\]]+)\]\]/g)].map(m => m[1]);
          return { ok: true, links };
        }
      }
    }

    return { ok: false, error: `Card "${title}" not found` };
  }

  private isKanbanBoard(content: string): boolean {
    return content.includes('## ') &&
      (content.includes('- [ ]') || content.includes('- [x]') || content.includes('%% kanban'));
  }

  private parseBoard(path: string, title: string, content: string): KanbanBoard {
    const lines = content.split('\n');
    const columns: string[] = [];
    const cards: KanbanCard[] = [];
    let currentColumn = '';

    for (const line of lines) {
      if (line.startsWith('## ') && !line.startsWith('%%')) {
        currentColumn = line.slice(3).trim();
        if (currentColumn && !columns.includes(currentColumn)) columns.push(currentColumn);
      } else if (currentColumn && (line.startsWith('- [ ]') || line.startsWith('- [x]'))) {
        cards.push(this.parseCardLine(line, currentColumn, path));
      }
    }

    return { id: path, title, path, columns, cards };
  }

  private parseCardLine(line: string, column: string, boardId: string): KanbanCard {
    const checked = line.startsWith('- [x]');
    const rest = line.replace(/^- \[.\] /, '');
    const titleMatch = rest.match(/^([^|#@\[]+)/);
    const title = titleMatch ? titleMatch[1].trim() : rest.trim();
    const priorityMatch = rest.match(/#(high|medium|low)/i);
    const priority = (priorityMatch ? priorityMatch[1].toLowerCase() : undefined) as KanbanCard['priority'];
    const dueDateMatch = rest.match(/due:(\d{4}-\d{2}-\d{2})/);
    const dueDate = dueDateMatch ? dueDateMatch[1] : undefined;
    const tagMatches = [...rest.matchAll(/@(\w+)/g)].map(m => m[1]);
    const doneDateMatch = rest.match(/done:(\d{4}-\d{2}-\d{2})/);
    const doneDate = doneDateMatch ? doneDateMatch[1] : undefined;
    const blockedMatch = rest.match(/blocked:(.+?)(?:\||$)/);
    const blocked = !!blockedMatch;
    const blockerReason = blockedMatch ? blockedMatch[1].trim() : undefined;
    const linkedMatches = [...rest.matchAll(/\[\[([^\]]+)\]\]/g)].map(m => m[1]);
    const recurMatch = rest.match(/recur:(daily|weekly|monthly|\d{4}-\d{2}-\d{2})/i);
    const recur = recurMatch ? recurMatch[1].toLowerCase() : undefined;

    return {
      id: `${boardId}::${column}::${title}`,
      title,
      column,
      boardId,
      checked,
      priority,
      dueDate,
      tags: tagMatches.length ? tagMatches : undefined,
      blocked,
      blockerReason,
      linkedCards: linkedMatches.length ? linkedMatches : undefined,
      doneDate,
      recur,
    };
  }

  private formatCardLine(card: Partial<KanbanCard> & { title: string }): string {
    let line = `- [ ] ${card.title}`;
    if (card.priority) line += ` | #${card.priority}`;
    if (card.dueDate) line += ` | due:${card.dueDate}`;
    if (card.recur) line += ` | recur:${card.recur}`;
    if (card.tags?.length) line += ` | ${card.tags.map((t: string) => `@${t}`).join(' ')}`;
    if (card.blocked && card.blockerReason) line += ` | blocked:${card.blockerReason}`;
    if (card.linkedCards?.length) line += ` | ${card.linkedCards.map((l: string) => `[[${l}]]`).join(' ')}`;
    return line;
  }

  private extractTitleFromLine(line: string): string {
    const rest = line.replace(/^- \[.\] /, '');
    const match = rest.match(/^([^|#@]+)/);
    return match ? match[1].trim() : rest.trim();
  }

  private insertCardIntoColumn(content: string, column: string, cardLine: string): string {
    const lines = content.split('\n');
    let columnIdx = -1;
    let insertIdx = -1;

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith(`## ${column}`)) { columnIdx = i; continue; }
      if (columnIdx !== -1 && insertIdx === -1) {
        if (lines[i].startsWith('## ') || lines[i].startsWith('%%')) {
          insertIdx = i;
          break;
        }
      }
    }

    if (columnIdx === -1) {
      lines.push(``, `## ${column}`, cardLine, ``);
    } else if (insertIdx === -1) {
      lines.push(cardLine);
    } else {
      lines.splice(insertIdx, 0, cardLine);
    }

    return lines.join('\n');
  }

  private buildBoardMarkdown(title: string, columns: string[]): string {
    const lines = [
      `---`,
      `kanban-plugin: board`,
      `---`,
      ``,
      `# ${title}`,
      ``
    ];
    for (const col of columns) {
      lines.push(`## ${col}`, ``);
    }
    return lines.join('\n');
  }

  /**
   * Generate a velocity (throughput) report: count completed cards per week.
   * Detects completion by: (1) `done: YYYY-MM-DD` metadata on card line, or
   * (2) cards in columns whose name contains 'done' or 'completed' (case-insensitive).
   * Cards with `done:` metadata get date-attributed; cards without it are counted
   * in the most recent week as "currently done" (approximation).
   * Writes a markdown note to `{boardFolder}/reports/velocity-YYYY-Www.md`.
   */
  async generateVelocityReport(
    numWeeks: number = 4,
    boardFolder?: string
  ): Promise<{ ok: boolean; path?: string; summary?: any; error?: string }> {
    const result = await this.queryCards({});
    const now = moment();
    const weeks: Array<{ weekLabel: string; weekNum: number; completed: number; trend?: string; diff?: number }> = [];

    // Build week buckets
    for (let i = 0; i < numWeeks; i++) {
      const weekStart = now.clone().subtract(i + 1, 'weeks').startOf('week');
      const weekEnd = weekStart.clone().endOf('week');
      weeks.unshift({ weekLabel: weekStart.format('YYYY-[W]ww'), weekNum: i + 1, completed: 0 });
    }

    // Count completions per week
    for (const card of result.cards) {
      const isDone = card.checked;
      const isDoneColumn = /^(done|completed|archived)$/i.test(card.column);

      if (card.doneDate && isDone) {
        // Date-attributed: put in the correct week bucket
        const doneMoment = moment(card.doneDate, 'YYYY-MM-DD');
        for (const week of weeks) {
          const weekStart = moment().subtract(numWeeks - week.weekNum, 'weeks').startOf('week').clone().subtract(now.clone().startOf('week').diff(moment().clone().startOf('week'), 'ms') || 0);
          // Simpler: rebuild week bounds from label
          const ws = moment(week.weekLabel, 'YYYY-[W]ww');
          const we = ws.clone().add(6, 'days').endOf('day');
          if (doneMoment.isBetween(ws, we, null, '[]')) {
            week.completed++;
            break;
          }
        }
      } else if (isDone && isDoneColumn) {
        // No done date — attribute to most recent week
        weeks[weeks.length - 1].completed++;
      }
    }

    // Calculate trends
    for (let i = 0; i < weeks.length; i++) {
      const prev = weeks[i + 1];
      if (prev) {
        const diff = weeks[i].completed - prev.completed;
        weeks[i].trend = diff > 0 ? '▲' : diff < 0 ? '▼' : '→';
        weeks[i].diff = diff;
      } else {
        weeks[i].trend = '—';
        weeks[i].diff = 0;
      }
    }

    const total = weeks.reduce((sum, w) => sum + w.completed, 0);
    const average = weeks.length > 0 ? Math.round(total / weeks.length) : 0;

    const header = '| Week | Completed | Average | Trend |\n|------|-----------|---------|-------|';
    const rows = weeks.map(w =>
      `| ${w.weekLabel} | ${w.completed} | ${average} | ${w.trend ?? '—'} ${w.diff != null && w.diff > 0 ? '+' : ''}${w.diff ?? 0} |`
    ).join('\n');

    const summary = `**Hermes Kanban Velocity Report**\n\nWeeks: ${numWeeks} | Total Completed: ${total} | Weekly Average: ${average}\n\n${header}\n${rows}`;

    try {
      const currentWeekLabel = now.format('YYYY-[W]ww');
      const reportPath = normalizePath(`${boardFolder || 'Kanban'}/reports/velocity-${currentWeekLabel}.md`);
      await this.app.vault.adapter.mkdir(normalizePath(`${boardFolder || 'Kanban'}/reports`)).catch(() => {});

      let fileContent = summary;
      try {
        const existing = await this.app.vault.adapter.read(reportPath);
        fileContent = existing + '\n\n---\n' + summary;
      } catch {
        // File doesn't exist
      }

      await this.app.vault.adapter.write(reportPath, fileContent);

      return {
        ok: true,
        path: reportPath,
        summary: { numWeeks, total, average, weeks },
      };
    } catch (err: any) {
      return { ok: false, error: err.message || 'Failed to write velocity report' };
    }
  }

  /**
   * Archive done cards from a board into a separate archive file (6.5).
   * Moves checked/done cards older than maxDays into Kanban/archive/ to keep the active board clean.
   */
  async archiveCards(body: {
    boardId: string;
    maxDays?: number;
    archiveFolder?: string;
  }): Promise<{ ok: boolean; archived?: number; error?: string }> {
    const maxDays = body.maxDays ?? 7;
    const archiveFolder = body.archiveFolder ?? 'Kanban/archive';
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - maxDays);
    const cutoffStr = cutoffDate.toISOString().slice(0, 10);

    const boardResult = await this.getBoard(body.boardId);
    if (!boardResult.ok || !boardResult.board) return { ok: false, error: boardResult.error };

    const board = boardResult.board;
    const doneCards = board.cards.filter(c => c.checked && c.column.toLowerCase().includes('done'));

    if (doneCards.length === 0) return { ok: true, archived: 0 };

    // Only archive cards with doneDate older than cutoff
    const toArchive = doneCards.filter(c => {
      if (!c.doneDate) return false;
      return c.doneDate <= cutoffStr;
    });

    if (toArchive.length === 0) return { ok: true, archived: 0 };

    const boardTitle = board.title.replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '-');
    const archivePath = normalizePath(`${archiveFolder}/${boardTitle}-archive.md`);

    let archiveContent: string;
    try {
      archiveContent = await this.app.vault.adapter.read(archivePath);
    } catch {
      archiveContent = `---\nkanban-plugin: board\n---\n\n# ${boardTitle} — Archived\n\n## Archived\n\n`;
    }

    const archivedLines = archiveContent.split('\n');
    const archiveInsert = toArchive.map(c => {
      let line = `- [x] ${c.title}`;
      if (c.priority) line += ` | #${c.priority}`;
      if (c.dueDate) line += ` | due:${c.dueDate}`;
      if (c.doneDate) line += ` | done:${c.doneDate}`;
      if (c.tags?.length) line += ` | ${c.tags.map((t: string) => '@' + t).join(' ')}`;
      return line;
    });

    let insertIdx = -1;
    for (let i = 0; i < archivedLines.length; i++) {
      if (archivedLines[i] === '## Archived') { insertIdx = i + 1; break; }
    }
    if (insertIdx === -1) {
      archivedLines.push('## Archived');
      insertIdx = archivedLines.length - 1;
    }

    for (const line of archiveInsert) {
      archivedLines.splice(insertIdx, 0, line);
    }

    await this.app.vault.adapter.mkdir(normalizePath(archiveFolder)).catch(() => {});
    await this.app.vault.adapter.write(archivePath, archivedLines.join('\n'));

    // Remove archived cards from the active board
    const file = this.app.vault.getAbstractFileByPath(normalizePath(body.boardId));
    if (!(file instanceof TFile)) return { ok: false, error: 'Board not found: ' + body.boardId };

    let content = await this.app.vault.read(file);
    const archivedIds = new Set(toArchive.map(c => c.title));
    const lines = content.split('\n');
    let inDone = false;
    const linesToRemove: number[] = [];

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('## ')) {
        inDone = lines[i].slice(3).trim().toLowerCase().includes('done');
      }
      if (inDone && (lines[i].startsWith('- [ ]') || lines[i].startsWith('- [x]'))) {
        if (archivedIds.has(this.extractTitleFromLine(lines[i]))) {
          linesToRemove.push(i);
        }
      }
    }

    for (const idx of linesToRemove.reverse()) {
      lines.splice(idx, 1);
    }
    await this.app.vault.modify(file, lines.join('\n'));

    return { ok: true, archived: toArchive.length };
  }
}
