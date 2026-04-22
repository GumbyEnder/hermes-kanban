import * as http from 'http';
import { App, Notice } from 'obsidian';
import { HermesKanbanSettings } from './settings';
import { KanbanParser } from './kanban-parser';

export class KanbanServer {
  private server: http.Server | null = null;
  private app: App;
  private settings: HermesKanbanSettings;
  private parser: KanbanParser;

  constructor(app: App, settings: HermesKanbanSettings) {
    this.app = app;
    this.settings = settings;
    this.parser = new KanbanParser(app);
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

    if (method === 'POST' && path === '/ritual/standup') {
      return await this.parser.generateStandup(body);
    }

    if (method === 'POST' && path === '/ritual/review') {
      return await this.parser.generateReview(body);
    }

    const err: any = new Error(`Not found: ${method} ${path}`);
    err.status = 404;
    throw err;
  }
}
