import * as http from 'http';
import { App, Notice } from 'obsidian';
import { HermesKanbanSettings } from './settings';
import { KanbanParser } from './kanban-parser';
import { DueDateNotifier } from './notification';

/** Board templates (6.6) — pre-built column sets for common workflows */
const BOARD_TEMPLATES: Record<string, { columns: string[]; description: string }> = {
  default: {
    columns: ['Backlog', 'To Do', 'In Progress', 'Review', 'Done'],
    description: 'Standard kanban workflow',
  },
  sprint: {
    columns: ['Backlog', 'Sprint Backlog', 'In Progress', 'Code Review', 'Done'],
    description: 'Agile sprint with code review column',
  },
  'bug-triage': {
    columns: ['Reported', 'Triaged', 'In Progress', 'QA Testing', 'Closed'],
    description: 'Bug triage and resolution workflow',
  },
  release: {
    columns: ['Planned', 'Ready', 'In Progress', 'Staging', 'Released'],
    description: 'Release pipeline tracking',
  },
  personal: {
    columns: ['Inbox', 'Today', 'This Week', 'Waiting', 'Done'],
    description: 'Personal productivity / GTD-lite',
  },
};

export class KanbanServer {
  private server: http.Server | null = null;
  private app: App;
  private settings: HermesKanbanSettings;
  private parser: KanbanParser;
  notifier: DueDateNotifier | null = null;
  private notifTimerId: ReturnType<typeof setTimeout> | null = null;

  constructor(app: App, settings: HermesKanbanSettings) {
    this.app = app;
    this.settings = settings;
    this.parser = new KanbanParser(app);
  }

  startNotifier(intervalMinutes?: number): void {
    const minutes = intervalMinutes ?? this.settings.notificationInterval;
    if (minutes <= 0) return;
    this.notifier = new DueDateNotifier(this.app, this.parser, minutes);
    this.notifier.start(minutes);
  }

  stopNotifier(): void {
    this.notifier?.stop();
    this.notifier = null;
  }

  start(): void {
    if (this.server) this.stop();

    this.server = http.createServer(async (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      const url = new URL(req.url || '/', `http://localhost:${this.settings.port}`);
      const body = await this.readBody(req);

      try {
        const result = await this.route(req.method || 'GET', url.pathname, url.searchParams, body);
        res.writeHead(200);
        res.end(JSON.stringify(result));
      } catch (err: any) {
        const status = err.status || 500;
        res.writeHead(status);
        res.end(JSON.stringify({ ok: false, error: err.message || 'Internal server error' }));
      }
    });

    this.server.listen(this.settings.port, '0.0.0.0', () => {
      console.log(`Hermes Kanban Bridge listening on port ${this.settings.port}`);
      new Notice(`Hermes Kanban Bridge started on port ${this.settings.port}`);
    });

    this.server.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        new Notice(`Hermes Kanban Bridge: port ${this.settings.port} already in use. Change port in settings.`);
      }
      console.error('Hermes Kanban Bridge server error:', err);
    });
  }

  stop(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
      console.log('Hermes Kanban Bridge stopped');
    }
  }

  private async readBody(req: http.IncomingMessage): Promise<any> {
    return new Promise((resolve) => {
      let body = '';
      req.on('data', (chunk: string) => body += chunk);
      req.on('end', () => {
        try { resolve(body ? JSON.parse(body) : {}); }
        catch { resolve({}); }
      });
    });
  }

  private async route(method: string, path: string, params: URLSearchParams, body: any): Promise<any> {
    if (method === 'GET' && path === '/health') {
      return { ok: true, status: 'running', port: this.settings.port, version: '1.0.0' };
    }

    if (method === 'GET' && path === '/boards') {
      return await this.parser.listBoards(this.settings.boardFolder);
    }

    if (method === 'GET' && path.startsWith('/boards/')) {
      const boardId = decodeURIComponent(path.slice('/boards/'.length));
      return await this.parser.getBoard(boardId);
    }

    if (method === 'POST' && path === '/boards') {
      return await this.parser.createBoard(body, this.settings.boardFolder);
    }

    if (method === 'POST' && path === '/cards/move') {
      return await this.parser.moveCard(body);
    }

    if (method === 'POST' && path === '/cards') {
      return await this.parser.addCard(body);
    }

    if (method === 'PUT' && path.startsWith('/cards/')) {
      const cardId = decodeURIComponent(path.slice('/cards/'.length));
      return await this.parser.updateCard(cardId, body);
    }

    if (method === 'GET' && path === '/query') {
      return await this.parser.queryCards({
        boardId: params.get('boardId') || undefined,
        column: params.get('column') || undefined,
        tag: params.get('tag') || undefined,
        blocked: params.get('blocked') === 'true' ? true : undefined,
        overdue: params.get('overdue') === 'true' ? true : undefined,
      });
    }

    // Link cards
    if (method === 'POST' && path === '/cards/link') {
      return await this.parser.linkCards(body);
    }

    // Get card links
    if (method === 'GET' && path === '/cards/links') {
      const cardId = params.get('cardId');
      if (!cardId) { const e: any = new Error('cardId query param required'); e.status = 400; throw e; }
      return await this.parser.getCardLinks(decodeURIComponent(cardId));
    }

    // Process recurring cards
    if (method === 'POST' && path === '/cards/process-recurring') {
      return await this.parser.processRecurring(body);
    }

    if (method === 'POST' && path === '/ritual/standup') {
      return await this.parser.generateStandup(body);
    }

    if (method === 'POST' && path === '/ritual/review') {
      return await this.parser.generateReview(body);
    }

    // Due date notifications (6.7)
    if (method === 'GET' && path === '/notify/due') {
      if (!this.notifier) { const e: any = new Error('Due date notifications are not enabled'); e.status = 503; throw e; }
      return await this.notifier.check();
    }

    // Velocity report (6.8)
    if (method === 'GET' && path === '/report/velocity') {
      const weeks = params.get('weeks') ? parseInt(params.get('weeks')!) : 4;
      return await this.parser.generateVelocityReport(weeks, this.settings.boardFolder);
    }

    if (method === 'POST' && path === '/ritual/velocity') {
      const weeks = body.weeks || 4;
      return await this.parser.generateVelocityReport(weeks, this.settings.boardFolder);
    }

    // Card archival (6.5)
    if (method === 'POST' && path === '/cards/archive') {
      return await this.parser.archiveCards(body);
    }

    // Board templates (6.6) — GET /templates lists available templates
    if (method === 'GET' && path === '/templates') {
      return { ok: true, templates: Object.fromEntries(
        Object.entries(BOARD_TEMPLATES).map(([k, v]) => [k, { columns: v.columns, description: v.description }])
      )};
    }

    if (method === 'GET' && path.startsWith('/templates/')) {
      const name = path.slice('/templates/'.length);
      const template = BOARD_TEMPLATES[name];
      if (!template) { const e: any = new Error(`Unknown template: ${name}`); e.status = 404; throw e; }
      return { ok: true, template: { name, columns: template.columns, description: template.description } };
    }

    // Board creation from template (6.6)
    if (method === 'POST' && path === '/templates/apply') {
      const template = BOARD_TEMPLATES[body.template];
      if (!template) { const e: any = new Error(`Unknown template: ${body.template}`); e.status = 404; throw e; }
      const boardBody = { title: body.title, columns: template.columns, boardFolder: body.boardFolder };
      return await this.parser.createBoard(boardBody as any, this.settings.boardFolder);
    }

    // Create board with template from POST /boards
    if (method === 'POST' && path === '/boards' && body.template) {
      const template = BOARD_TEMPLATES[body.template];
      if (!template) { const e: any = new Error(`Unknown template: ${body.template}`); e.status = 404; throw e; }
      const boardBody = { title: body.title, columns: template.columns, boardFolder: body.boardFolder };
      return await this.parser.createBoard(boardBody as any, this.settings.boardFolder);
    }

    const err: any = new Error(`Not found: ${method} ${path}`);
    err.status = 404;
    throw err;
  }
}
