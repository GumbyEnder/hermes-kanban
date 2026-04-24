import { App, TFile, TFolder, normalizePath } from 'obsidian';

export interface KanbanCard {
  id: string;
  title: string;
  description?: string;
  column: string;
  boardId: string;
  priority?: 'high' | 'medium' | 'low';
  tags?: string[];
  dueDate?: string;
  completed?: string;        // 'completed: YYYY-MM-DD'
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

  /**
   * Generate a velocity report showing weekly throughput.
   * Scans all kanban boards for completed cards (via `completed: YYYY-MM-DD` metadata
   * or cards in Done/Completed columns) and generates per-week stats.
   */
  async generateVelocityReport(
    boardFolder: string,
    weeks: number = 4,
  ): Promise<{
    ok: boolean;
    path?: string;
    summary?: any;
    error?: string;
  }> {
    const result = await this.queryCards({});
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);

    // Collect completed cards: either with `completed` metadata or in Done/Completed columns
    const completedCards = result.cards.filter(c => {
      if (c.completed) return true;
      const colLower = c.column.toLowerCase();
      if (colLower.includes('done') || colLower.includes('completed')) return true;
      return false;
    });

    // Calculate ISO weeks for each card's completion date
    // Use `completed` date if available, else today for done-column cards without date
    const weeklyCounts = new Map<string, number>();

    for (const card of completedCards) {
      let dateStr = card.completed;
      if (!dateStr) {
        // Cards in Done column without explicit completed date — use today
        dateStr = todayStr;
      }

      const d = new Date(dateStr + 'T00:00:00Z');
      const isoWeek = this.getISOWeek(d);
      weeklyCounts.set(isoWeek, (weeklyCounts.get(isoWeek) || 0) + 1);
    }

    // Build array of week entries for the last `weeks` weeks
    const weekEntries: Array<{ week: string; completed: number; average: number; trend: string }> = [];
    const totalCount = completedCards.length;
    const average = weeks > 0 ? totalCount / weeks : 0;

    for (let i = weeks - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i * 7);
      const isoWeek = this.getISOWeek(d);
      const completed = weeklyCounts.get(isoWeek) || 0;

      // Calculate trend: compare with previous week
      let trend = '→';
      if (i < weeks - 1) {
        const prevDate = new Date(d);
        prevDate.setDate(prevDate.getDate() - 7);
        const prevWeek = this.getISOWeek(prevDate);
        const prevCount = weeklyCounts.get(prevWeek) || 0;
        if (completed > prevCount) trend = '▲';
        else if (completed < prevCount) trend = '▼';
        else trend = '→';
      }

      weekEntries.unshift({
        week: isoWeek,
        completed,
        average: Math.round(average * 10) / 10,
        trend,
      });
    }

    const currentWeekISO = this.getISOWeek(now);
    const reportPath = `${boardFolder}/reports/velocity-${currentWeekISO}.md`;
    const normalizedPath = normalizePath(reportPath);

    // Build markdown content
    let content = `---\nkanban-plugin: board\n---\n\n# Velocity Report\n\n`;
    content += `| Week | Completed | Average | Trend |\n`;
    content += `|------|-----------|---------|-------|\n`;
    for (const entry of weekEntries) {
      content += `| ${entry.week} | ${entry.completed} | ${entry.average} | ${entry.trend} |\n`;
    }
    content += `\n**Total completed**: ${totalCount} over ${weeks} week(s)\n`;
    content += `**Average per week**: ${Math.round(average * 10) / 10}\n`;

    // Find board file to determine where to put the report
    // Use the first board found in the folder to get folder context
    const folder = this.app.vault.getAbstractFileByPath(normalizePath(boardFolder));
    let baseFolder = boardFolder;
    if (folder instanceof TFolder) {
      baseFolder = folder.path;
    }

    const fullPath = normalizePath(`${baseFolder}/reports/velocity-${currentWeekISO}.md`);
    await this.app.vault.adapter.mkdir(normalizePath(`${baseFolder}/reports`));

    const existingFile = this.app.vault.getAbstractFileByPath(fullPath);
    if (existingFile instanceof TFile) {
      await this.app.vault.modify(existingFile, content);
    } else {
      await this.app.vault.create(fullPath, content);
    }

    return {
      ok: true,
      path: fullPath,
      summary: {
        weekEntries,
        totalCompleted: totalCount,
        averagePerWeek: Math.round(average * 10) / 10,
      },
    };
  }

  /**
   * Get ISO 8601 week string (e.g. "2025-W17") for a given date.
   */
  private getISOWeek(date: Date): string {
    const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    // Set to nearest Thursday: current date + 4 - current day number
    // Make Sunday's day number 7
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNum = Math.ceil(((d.valueOf() - yearStart.valueOf()) / 86400000 + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
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
    const blockedMatch = rest.match(/blocked:(.+?)(?:\||$)/);
    const blocked = !!blockedMatch;
    const blockerReason = blockedMatch ? blockedMatch[1].trim() : undefined;
    const linkedMatches = [...rest.matchAll(/\[\[([^\]]+)\]\]/g)].map(m => m[1]);
    const recurMatch = rest.match(/recur:(daily|weekly|monthly|\d{4}-\d{2}-\d{2})/i);
    const recur = recurMatch ? recurMatch[1].toLowerCase() : undefined;
    const completedMatch = rest.match(/completed:(\d{4}-\d{2}-\d{2})/i);
    const completed = completedMatch ? completedMatch[1] : undefined;

    return {
      id: `${boardId}::${column}::${title}`,
      title,
      column,
      boardId,
      checked,
      priority,
      dueDate,
      completed,
      tags: tagMatches.length ? tagMatches : undefined,
      blocked,
      blockerReason,
      linkedCards: linkedMatches.length ? linkedMatches : undefined,
      recur,
    };
  }

  private formatCardLine(card: Partial<KanbanCard> & { title: string }): string {
    let line = `- [ ] ${card.title}`;
    if (card.checked) line = `- [x] ${card.title}`;
    if (card.priority) line += ` | #${card.priority}`;
    if (card.dueDate) line += ` | due:${card.dueDate}`;
    if (card.completed) line += ` | completed:${card.completed}`;
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
}
