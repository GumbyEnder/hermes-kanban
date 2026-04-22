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
  blocked?: boolean;
  blockerReason?: string;
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
    const titleMatch = rest.match(/^([^|#@]+)/);
    const title = titleMatch ? titleMatch[1].trim() : rest.trim();
    const priorityMatch = rest.match(/#(high|medium|low)/i);
    const priority = (priorityMatch ? priorityMatch[1].toLowerCase() : undefined) as KanbanCard['priority'];
    const dueDateMatch = rest.match(/due:(\d{4}-\d{2}-\d{2})/);
    const dueDate = dueDateMatch ? dueDateMatch[1] : undefined;
    const tagMatches = [...rest.matchAll(/@(\w+)/g)].map(m => m[1]);
    const blockedMatch = rest.match(/blocked:(.+?)(?:\||$)/);
    const blocked = !!blockedMatch;
    const blockerReason = blockedMatch ? blockedMatch[1].trim() : undefined;

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
    };
  }

  private formatCardLine(card: Partial<KanbanCard> & { title: string }): string {
    let line = `- [ ] ${card.title}`;
    if (card.priority) line += ` | #${card.priority}`;
    if (card.dueDate) line += ` | due:${card.dueDate}`;
    if (card.tags?.length) line += ` | ${card.tags.map((t: string) => `@${t}`).join(' ')}`;
    if (card.blocked && card.blockerReason) line += ` | blocked:${card.blockerReason}`;
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
    const lines = [`# ${title}`, ``];
    for (const col of columns) {
      lines.push(`## ${col}`, ``);
    }
    return lines.join('\n');
  }
}
