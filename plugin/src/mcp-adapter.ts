import { App, Notice } from 'obsidian';
import { HermesKanbanSettings } from './settings';
import { KanbanParser } from './kanban-parser';

/**
 * MCP (Model Context Protocol) adapter for hermes-kanban-bridge.
 *
 * Exposes Kanban operations as MCP tools so any MCP-aware client
 * (Claude Desktop, Cursor, Zed, etc.) can control Kanban boards —
 * not just Hermes.
 *
 * MCP transport: stdio (spawned as a subprocess) or HTTP SSE.
 * This implementation uses the HTTP SSE transport on a separate port
 * (default: 27125) to avoid conflicts with the main REST API.
 *
 * Spec: https://spec.modelcontextprotocol.io/
 */

import * as http from 'http';

export interface McpTool {
  name: string;
  description: string;
  inputSchema: object;
}

export class McpAdapter {
  private server: http.Server | null = null;
  private app: App;
  private settings: HermesKanbanSettings;
  private parser: KanbanParser;

  constructor(app: App, settings: HermesKanbanSettings, parser: KanbanParser) {
    this.app = app;
    this.settings = settings;
    this.parser = parser;
  }

  get port(): number {
    return this.settings.port + 1; // default 27125
  }

  start(): void {
    if (this.server) this.stop();

    this.server = http.createServer(async (req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

      const url = new URL(req.url || '/', `http://localhost:${this.port}`);
      const body = await this.readBody(req);

      try {
        const result = await this.handleMcp(req.method || 'GET', url.pathname, body);
        res.setHeader('Content-Type', 'application/json');
        res.writeHead(200);
        res.end(JSON.stringify(result));
      } catch (err: any) {
        res.setHeader('Content-Type', 'application/json');
        res.writeHead(err.status || 500);
        res.end(JSON.stringify({ error: { code: -32603, message: err.message } }));
      }
    });

    this.server.listen(this.port, '0.0.0.0', () => {
      console.log(`Hermes Kanban MCP adapter listening on port ${this.port}`);
      new Notice(`Hermes Kanban MCP ready on port ${this.port}`);
    });
  }

  stop(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }

  private async handleMcp(method: string, path: string, body: any): Promise<any> {

    // MCP initialize handshake
    if (path === '/mcp' && method === 'POST' && body?.method === 'initialize') {
      return {
        jsonrpc: '2.0',
        id: body.id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'hermes-kanban-bridge', version: '1.0.0' },
        }
      };
    }

    // List tools
    if (path === '/mcp' && method === 'POST' && body?.method === 'tools/list') {
      return {
        jsonrpc: '2.0',
        id: body.id,
        result: { tools: this.getTools() }
      };
    }

    // Call tool
    if (path === '/mcp' && method === 'POST' && body?.method === 'tools/call') {
      const { name, arguments: args } = body.params;
      const result = await this.callTool(name, args || {});
      return {
        jsonrpc: '2.0',
        id: body.id,
        result: {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          isError: !result.ok,
        }
      };
    }

    // Health / discovery
    if (path === '/mcp/health' && method === 'GET') {
      return { ok: true, transport: 'http', port: this.port, tools: this.getTools().length };
    }

    const err: any = new Error(`Unknown MCP path: ${method} ${path}`);
    err.status = 404;
    throw err;
  }

  private async callTool(name: string, args: any): Promise<any> {
    switch (name) {
      case 'kanban_health':
        return { ok: true, status: 'running', port: this.settings.port, version: '1.0.0' };

      case 'kanban_list_boards':
        return await this.parser.listBoards(this.settings.boardFolder);

      case 'kanban_get_board':
        return await this.parser.getBoard(args.boardId);

      case 'kanban_create_board':
        return await this.parser.createBoard(args, this.settings.boardFolder);

      case 'kanban_add_card':
        return await this.parser.addCard(args);

      case 'kanban_move_card':
        return await this.parser.moveCard(args);

      case 'kanban_update_card':
        return await this.parser.updateCard(args.cardId, args);

      case 'kanban_query':
        return await this.parser.queryCards(args);

      case 'kanban_standup':
        return await this.parser.generateStandup(args);

      case 'kanban_review':
        return await this.parser.generateReview(args);

      default:
        return { ok: false, error: `Unknown tool: ${name}` };
    }
  }

  private getTools(): McpTool[] {
    return [
      {
        name: 'kanban_health',
        description: 'Check if the Hermes Kanban Bridge plugin is running',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'kanban_list_boards',
        description: 'List all Kanban boards in the vault',
        inputSchema: { type: 'object', properties: {} },
      },
      {
        name: 'kanban_get_board',
        description: 'Get full board state including all columns and cards',
        inputSchema: {
          type: 'object',
          properties: { boardId: { type: 'string', description: 'Board file path (e.g. Kanban/MyProject.md)' } },
          required: ['boardId'],
        },
      },
      {
        name: 'kanban_create_board',
        description: 'Create a new Kanban board with custom columns',
        inputSchema: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'Board title' },
            columns: { type: 'array', items: { type: 'string' }, description: 'Column names (default: Backlog, To Do, In Progress, Review, Done)' },
          },
          required: ['title'],
        },
      },
      {
        name: 'kanban_add_card',
        description: 'Add a new card to a Kanban board column',
        inputSchema: {
          type: 'object',
          properties: {
            boardId: { type: 'string', description: 'Board file path' },
            column: { type: 'string', description: 'Target column name' },
            title: { type: 'string', description: 'Card title (verb phrase recommended)' },
            priority: { type: 'string', enum: ['high', 'medium', 'low'] },
            dueDate: { type: 'string', description: 'ISO date YYYY-MM-DD' },
            tags: { type: 'array', items: { type: 'string' } },
            blocked: { type: 'boolean' },
            blockerReason: { type: 'string' },
          },
          required: ['boardId', 'column', 'title'],
        },
      },
      {
        name: 'kanban_move_card',
        description: 'Move a card from one column to another',
        inputSchema: {
          type: 'object',
          properties: {
            cardId: { type: 'string', description: 'Card ID: boardPath::column::title' },
            toColumn: { type: 'string', description: 'Destination column name' },
          },
          required: ['cardId', 'toColumn'],
        },
      },
      {
        name: 'kanban_update_card',
        description: 'Update card metadata (priority, due date, tags, blocked status)',
        inputSchema: {
          type: 'object',
          properties: {
            cardId: { type: 'string', description: 'Card ID: boardPath::column::title' },
            priority: { type: 'string', enum: ['high', 'medium', 'low'] },
            dueDate: { type: 'string' },
            tags: { type: 'array', items: { type: 'string' } },
            blocked: { type: 'boolean' },
            blockerReason: { type: 'string' },
          },
          required: ['cardId'],
        },
      },
      {
        name: 'kanban_query',
        description: 'Query cards across boards with filters',
        inputSchema: {
          type: 'object',
          properties: {
            boardId: { type: 'string', description: 'Filter to specific board (optional)' },
            column: { type: 'string' },
            tag: { type: 'string' },
            blocked: { type: 'boolean' },
            overdue: { type: 'boolean' },
          },
        },
      },
      {
        name: 'kanban_standup',
        description: 'Generate a daily standup summary — in progress, blocked, and overdue cards',
        inputSchema: {
          type: 'object',
          properties: { boardId: { type: 'string', description: 'Specific board (optional, omit for all boards)' } },
        },
      },
      {
        name: 'kanban_review',
        description: 'Generate a weekly review report — completed, carry-over, velocity',
        inputSchema: {
          type: 'object',
          properties: { boardId: { type: 'string', description: 'Specific board (optional, omit for all boards)' } },
        },
      },
    ];
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
}
