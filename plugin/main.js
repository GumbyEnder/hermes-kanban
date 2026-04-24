var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/kanban-parser.ts
var kanban_parser_exports = {};
__export(kanban_parser_exports, {
  KanbanParser: () => KanbanParser
});
var import_obsidian, KanbanParser;
var init_kanban_parser = __esm({
  "src/kanban-parser.ts"() {
    import_obsidian = require("obsidian");
    KanbanParser = class {
      constructor(app) {
        this.app = app;
      }
      async listBoards(boardFolder) {
        const folder = this.app.vault.getAbstractFileByPath((0, import_obsidian.normalizePath)(boardFolder));
        const boards = [];
        if (folder instanceof import_obsidian.TFolder) {
          for (const child of folder.children) {
            if (child instanceof import_obsidian.TFile && child.extension === "md") {
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
      async getBoard(boardId) {
        const file = this.app.vault.getAbstractFileByPath((0, import_obsidian.normalizePath)(boardId));
        if (!(file instanceof import_obsidian.TFile))
          return { ok: false, error: `Board not found: ${boardId}` };
        const content = await this.app.vault.read(file);
        return { ok: true, board: this.parseBoard(file.path, file.basename, content) };
      }
      async createBoard(body, defaultFolder) {
        const columns = body.columns || ["Backlog", "To Do", "In Progress", "Review", "Done"];
        const folder = body.boardFolder || defaultFolder;
        const path = (0, import_obsidian.normalizePath)(`${folder}/${body.title}.md`);
        const content = this.buildBoardMarkdown(body.title, columns);
        await this.app.vault.adapter.mkdir((0, import_obsidian.normalizePath)(folder)).catch(() => {
        });
        await this.app.vault.create(path, content);
        return { ok: true, board: { id: path, title: body.title, path, columns, cards: [] } };
      }
      async addCard(body) {
        const file = this.app.vault.getAbstractFileByPath((0, import_obsidian.normalizePath)(body.boardId));
        if (!(file instanceof import_obsidian.TFile))
          return { ok: false, error: `Board not found: ${body.boardId}` };
        const content = await this.app.vault.read(file);
        const cardLine = this.formatCardLine(body);
        const updated = this.insertCardIntoColumn(content, body.column, cardLine);
        await this.app.vault.modify(file, updated);
        const id = `${body.boardId}::${body.column}::${body.title}`;
        return { ok: true, card: { id, title: body.title, column: body.column, boardId: body.boardId } };
      }
      async moveCard(body) {
        const [boardId, fromColumn, ...titleParts] = body.cardId.split("::");
        const title = titleParts.join("::");
        const file = this.app.vault.getAbstractFileByPath((0, import_obsidian.normalizePath)(boardId));
        if (!(file instanceof import_obsidian.TFile))
          return { ok: false, error: `Board not found: ${boardId}` };
        const content = await this.app.vault.read(file);
        const lines = content.split("\n");
        let cardLine = null;
        let cardLineIdx = -1;
        let inFromColumn = false;
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line.startsWith("## "))
            inFromColumn = line.slice(3).trim() === fromColumn;
          if (inFromColumn && (line.startsWith("- [ ]") || line.startsWith("- [x]"))) {
            const lineTitle = this.extractTitleFromLine(line);
            if (lineTitle === title) {
              cardLine = line;
              cardLineIdx = i;
              break;
            }
          }
        }
        if (cardLineIdx === -1 || !cardLine) {
          return { ok: false, error: `Card "${title}" not found in column "${fromColumn}"` };
        }
        lines.splice(cardLineIdx, 1);
        const updated = this.insertCardIntoColumn(lines.join("\n"), body.toColumn, cardLine);
        await this.app.vault.modify(file, updated);
        return { ok: true, message: `Moved "${title}" from "${fromColumn}" to "${body.toColumn}"` };
      }
      async updateCard(cardId, body) {
        const [boardId, column, ...titleParts] = cardId.split("::");
        const title = titleParts.join("::");
        const file = this.app.vault.getAbstractFileByPath((0, import_obsidian.normalizePath)(boardId));
        if (!(file instanceof import_obsidian.TFile))
          return { ok: false, error: `Board not found: ${boardId}` };
        const content = await this.app.vault.read(file);
        const lines = content.split("\n");
        let updated = false;
        let inColumn = false;
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].startsWith("## "))
            inColumn = lines[i].slice(3).trim() === column;
          if (inColumn && (lines[i].startsWith("- [ ]") || lines[i].startsWith("- [x]"))) {
            if (this.extractTitleFromLine(lines[i]) === title) {
              lines[i] = this.formatCardLine({ ...body, title: body.title || title, column, boardId });
              updated = true;
              break;
            }
          }
        }
        if (!updated)
          return { ok: false, error: `Card "${title}" not found` };
        await this.app.vault.modify(file, lines.join("\n"));
        return { ok: true, message: `Updated card "${title}"` };
      }
      async queryCards(filters) {
        var _a;
        const results = [];
        const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
        const files = [];
        if (filters.boardId) {
          const f = this.app.vault.getAbstractFileByPath((0, import_obsidian.normalizePath)(filters.boardId));
          if (f instanceof import_obsidian.TFile)
            files.push(f);
        } else {
          this.app.vault.getMarkdownFiles().forEach((f) => files.push(f));
        }
        for (const file of files) {
          const content = await this.app.vault.read(file);
          if (!this.isKanbanBoard(content))
            continue;
          const board = this.parseBoard(file.path, file.basename, content);
          for (const card of board.cards) {
            if (filters.column && card.column !== filters.column)
              continue;
            if (filters.tag && !((_a = card.tags) == null ? void 0 : _a.includes(filters.tag)))
              continue;
            if (filters.blocked !== void 0 && card.blocked !== filters.blocked)
              continue;
            if (filters.overdue && (!card.dueDate || card.dueDate >= today))
              continue;
            results.push(card);
          }
        }
        return { ok: true, cards: results };
      }
      async generateStandup(body) {
        const result = await this.queryCards({ boardId: body.boardId });
        const inProgress = result.cards.filter((c) => c.column === "In Progress");
        const blocked = result.cards.filter((c) => c.blocked);
        const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
        const dueSoon = result.cards.filter((c) => c.dueDate && c.dueDate <= today && c.column !== "Done");
        return {
          ok: true,
          standup: {
            generated: (/* @__PURE__ */ new Date()).toISOString(),
            inProgress: inProgress.map((c) => ({ title: c.title, board: c.boardId, priority: c.priority })),
            blocked: blocked.map((c) => ({ title: c.title, reason: c.blockerReason, board: c.boardId })),
            dueSoon: dueSoon.map((c) => ({ title: c.title, dueDate: c.dueDate, column: c.column })),
            summary: `${inProgress.length} in progress, ${blocked.length} blocked, ${dueSoon.length} due today/overdue`
          }
        };
      }
      async generateReview(body) {
        const result = await this.queryCards({ boardId: body.boardId });
        const done = result.cards.filter((c) => c.column === "Done");
        const carryOver = result.cards.filter((c) => c.column !== "Done");
        const blocked = result.cards.filter((c) => c.blocked);
        return {
          ok: true,
          review: {
            generated: (/* @__PURE__ */ new Date()).toISOString(),
            completed: done.map((c) => ({ title: c.title, board: c.boardId })),
            carryOver: carryOver.map((c) => ({ title: c.title, column: c.column, priority: c.priority })),
            blocked: blocked.map((c) => ({ title: c.title, reason: c.blockerReason })),
            velocity: done.length,
            summary: `Completed: ${done.length}. Carry-over: ${carryOver.length}. Blocked: ${blocked.length}.`
          }
        };
      }
      /**
       * Generate a velocity report showing weekly throughput.
       * Scans all kanban boards for completed cards (via `completed: YYYY-MM-DD` metadata
       * or cards in Done/Completed columns) and generates per-week stats.
       */
      async generateVelocityReport(boardFolder, weeks = 4) {
        const result = await this.queryCards({});
        const now = /* @__PURE__ */ new Date();
        const todayStr = now.toISOString().slice(0, 10);
        const completedCards = result.cards.filter((c) => {
          if (c.completed)
            return true;
          const colLower = c.column.toLowerCase();
          if (colLower.includes("done") || colLower.includes("completed"))
            return true;
          return false;
        });
        const weeklyCounts = /* @__PURE__ */ new Map();
        for (const card of completedCards) {
          let dateStr = card.completed;
          if (!dateStr) {
            dateStr = todayStr;
          }
          const d = /* @__PURE__ */ new Date(dateStr + "T00:00:00Z");
          const isoWeek = this.getISOWeek(d);
          weeklyCounts.set(isoWeek, (weeklyCounts.get(isoWeek) || 0) + 1);
        }
        const weekEntries = [];
        const totalCount = completedCards.length;
        const average = weeks > 0 ? totalCount / weeks : 0;
        for (let i = weeks - 1; i >= 0; i--) {
          const d = new Date(now);
          d.setDate(d.getDate() - i * 7);
          const isoWeek = this.getISOWeek(d);
          const completed = weeklyCounts.get(isoWeek) || 0;
          let trend = "\u2192";
          if (i < weeks - 1) {
            const prevDate = new Date(d);
            prevDate.setDate(prevDate.getDate() - 7);
            const prevWeek = this.getISOWeek(prevDate);
            const prevCount = weeklyCounts.get(prevWeek) || 0;
            if (completed > prevCount)
              trend = "\u25B2";
            else if (completed < prevCount)
              trend = "\u25BC";
            else
              trend = "\u2192";
          }
          weekEntries.unshift({
            week: isoWeek,
            completed,
            average: Math.round(average * 10) / 10,
            trend
          });
        }
        const currentWeekISO = this.getISOWeek(now);
        const reportPath = `${boardFolder}/reports/velocity-${currentWeekISO}.md`;
        const normalizedPath = (0, import_obsidian.normalizePath)(reportPath);
        let content = `---
kanban-plugin: board
---

# Velocity Report

`;
        content += `| Week | Completed | Average | Trend |
`;
        content += `|------|-----------|---------|-------|
`;
        for (const entry of weekEntries) {
          content += `| ${entry.week} | ${entry.completed} | ${entry.average} | ${entry.trend} |
`;
        }
        content += `
**Total completed**: ${totalCount} over ${weeks} week(s)
`;
        content += `**Average per week**: ${Math.round(average * 10) / 10}
`;
        const folder = this.app.vault.getAbstractFileByPath((0, import_obsidian.normalizePath)(boardFolder));
        let baseFolder = boardFolder;
        if (folder instanceof import_obsidian.TFolder) {
          baseFolder = folder.path;
        }
        const fullPath = (0, import_obsidian.normalizePath)(`${baseFolder}/reports/velocity-${currentWeekISO}.md`);
        await this.app.vault.adapter.mkdir((0, import_obsidian.normalizePath)(`${baseFolder}/reports`));
        const existingFile = this.app.vault.getAbstractFileByPath(fullPath);
        if (existingFile instanceof import_obsidian.TFile) {
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
            averagePerWeek: Math.round(average * 10) / 10
          }
        };
      }
      /**
       * Get ISO 8601 week string (e.g. "2025-W17") for a given date.
       */
      getISOWeek(date) {
        const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        const weekNum = Math.ceil(((d.valueOf() - yearStart.valueOf()) / 864e5 + 1) / 7);
        return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
      }
      // --- Private helpers ---
      /**
       * Process recurring cards — find Done cards with recur: field, re-create them in Backlog.
       * Call this on a schedule (e.g. daily standup) to auto-refresh recurring tasks.
       */
      async processRecurring(body) {
        const result = await this.queryCards({ boardId: body.boardId });
        const today = /* @__PURE__ */ new Date();
        const todayStr = today.toISOString().slice(0, 10);
        const recreated = [];
        for (const card of result.cards) {
          if (!card.recur || !card.checked)
            continue;
          let shouldRecreate = false;
          let nextDue;
          if (card.recur === "daily") {
            shouldRecreate = true;
            nextDue = todayStr;
          } else if (card.recur === "weekly") {
            shouldRecreate = true;
            const next = new Date(today);
            next.setDate(next.getDate() + 7);
            nextDue = next.toISOString().slice(0, 10);
          } else if (card.recur === "monthly") {
            shouldRecreate = true;
            const next = new Date(today);
            next.setMonth(next.getMonth() + 1);
            nextDue = next.toISOString().slice(0, 10);
          } else if (/^\d{4}-\d{2}-\d{2}$/.test(card.recur)) {
            shouldRecreate = card.recur <= todayStr;
            nextDue = card.recur;
          }
          if (shouldRecreate) {
            await this.addCard({
              boardId: card.boardId,
              column: "Backlog",
              title: card.title,
              priority: card.priority,
              tags: card.tags,
              dueDate: nextDue,
              recur: card.recur
            });
            recreated.push(card.title);
          }
        }
        return { ok: true, recreated: recreated.length, cards: recreated };
      }
      /**
       * Link two cards across boards. Adds a wikilink on the source card pointing to the target.
       */
      async linkCards(body) {
        const [boardId, column, ...titleParts] = body.fromCardId.split("::");
        const title = titleParts.join("::");
        const file = this.app.vault.getAbstractFileByPath((0, import_obsidian.normalizePath)(boardId));
        if (!(file instanceof import_obsidian.TFile))
          return { ok: false, error: `Board not found: ${boardId}` };
        const content = await this.app.vault.read(file);
        const lines = content.split("\n");
        let updated = false;
        let inColumn = false;
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].startsWith("## "))
            inColumn = lines[i].slice(3).trim() === column;
          if (inColumn && (lines[i].startsWith("- [ ]") || lines[i].startsWith("- [x]"))) {
            if (this.extractTitleFromLine(lines[i]) === title) {
              if (!lines[i].includes(`[[${body.toCardId}]]`)) {
                lines[i] += ` | [[${body.toCardId}]]`;
              }
              updated = true;
              break;
            }
          }
        }
        if (!updated)
          return { ok: false, error: `Card "${title}" not found in "${column}"` };
        await this.app.vault.modify(file, lines.join("\n"));
        return { ok: true, message: `Linked "${body.fromCardId}" \u2192 "${body.toCardId}"` };
      }
      /**
       * Get all linked cards for a given card ID.
       */
      async getCardLinks(cardId) {
        const [boardId, column, ...titleParts] = cardId.split("::");
        const title = titleParts.join("::");
        const file = this.app.vault.getAbstractFileByPath((0, import_obsidian.normalizePath)(boardId));
        if (!(file instanceof import_obsidian.TFile))
          return { ok: false, error: `Board not found: ${boardId}` };
        const content = await this.app.vault.read(file);
        const lines = content.split("\n");
        let inColumn = false;
        for (const line of lines) {
          if (line.startsWith("## "))
            inColumn = line.slice(3).trim() === column;
          if (inColumn && (line.startsWith("- [ ]") || line.startsWith("- [x]"))) {
            if (this.extractTitleFromLine(line) === title) {
              const links = [...line.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1]);
              return { ok: true, links };
            }
          }
        }
        return { ok: false, error: `Card "${title}" not found` };
      }
      isKanbanBoard(content) {
        return content.includes("## ") && (content.includes("- [ ]") || content.includes("- [x]") || content.includes("%% kanban"));
      }
      parseBoard(path, title, content) {
        const lines = content.split("\n");
        const columns = [];
        const cards = [];
        let currentColumn = "";
        for (const line of lines) {
          if (line.startsWith("## ") && !line.startsWith("%%")) {
            currentColumn = line.slice(3).trim();
            if (currentColumn && !columns.includes(currentColumn))
              columns.push(currentColumn);
          } else if (currentColumn && (line.startsWith("- [ ]") || line.startsWith("- [x]"))) {
            cards.push(this.parseCardLine(line, currentColumn, path));
          }
        }
        return { id: path, title, path, columns, cards };
      }
      parseCardLine(line, column, boardId) {
        const checked = line.startsWith("- [x]");
        const rest = line.replace(/^- \[.\] /, "");
        const titleMatch = rest.match(/^([^|#@\[]+)/);
        const title = titleMatch ? titleMatch[1].trim() : rest.trim();
        const priorityMatch = rest.match(/#(high|medium|low)/i);
        const priority = priorityMatch ? priorityMatch[1].toLowerCase() : void 0;
        const dueDateMatch = rest.match(/due:(\d{4}-\d{2}-\d{2})/);
        const dueDate = dueDateMatch ? dueDateMatch[1] : void 0;
        const tagMatches = [...rest.matchAll(/@(\w+)/g)].map((m) => m[1]);
        const blockedMatch = rest.match(/blocked:(.+?)(?:\||$)/);
        const blocked = !!blockedMatch;
        const blockerReason = blockedMatch ? blockedMatch[1].trim() : void 0;
        const linkedMatches = [...rest.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1]);
        const recurMatch = rest.match(/recur:(daily|weekly|monthly|\d{4}-\d{2}-\d{2})/i);
        const recur = recurMatch ? recurMatch[1].toLowerCase() : void 0;
        const completedMatch = rest.match(/completed:(\d{4}-\d{2}-\d{2})/i);
        const completed = completedMatch ? completedMatch[1] : void 0;
        return {
          id: `${boardId}::${column}::${title}`,
          title,
          column,
          boardId,
          checked,
          priority,
          dueDate,
          completed,
          tags: tagMatches.length ? tagMatches : void 0,
          blocked,
          blockerReason,
          linkedCards: linkedMatches.length ? linkedMatches : void 0,
          recur
        };
      }
      formatCardLine(card) {
        var _a, _b;
        let line = `- [ ] ${card.title}`;
        if (card.checked)
          line = `- [x] ${card.title}`;
        if (card.priority)
          line += ` | #${card.priority}`;
        if (card.dueDate)
          line += ` | due:${card.dueDate}`;
        if (card.completed)
          line += ` | completed:${card.completed}`;
        if (card.recur)
          line += ` | recur:${card.recur}`;
        if ((_a = card.tags) == null ? void 0 : _a.length)
          line += ` | ${card.tags.map((t) => `@${t}`).join(" ")}`;
        if (card.blocked && card.blockerReason)
          line += ` | blocked:${card.blockerReason}`;
        if ((_b = card.linkedCards) == null ? void 0 : _b.length)
          line += ` | ${card.linkedCards.map((l) => `[[${l}]]`).join(" ")}`;
        return line;
      }
      extractTitleFromLine(line) {
        const rest = line.replace(/^- \[.\] /, "");
        const match = rest.match(/^([^|#@]+)/);
        return match ? match[1].trim() : rest.trim();
      }
      insertCardIntoColumn(content, column, cardLine) {
        const lines = content.split("\n");
        let columnIdx = -1;
        let insertIdx = -1;
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].startsWith(`## ${column}`)) {
            columnIdx = i;
            continue;
          }
          if (columnIdx !== -1 && insertIdx === -1) {
            if (lines[i].startsWith("## ") || lines[i].startsWith("%%")) {
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
        return lines.join("\n");
      }
      buildBoardMarkdown(title, columns) {
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
        return lines.join("\n");
      }
      /**
       * Archive done/completed cards older than the specified number of days.
       * Moves them from the source board to an archive.md file.
       */
      async archiveCards(boardFolder, archiveFilePath, archiveDays) {
        const today = /* @__PURE__ */ new Date();
        const cutoffDate = new Date(today.getTime() - archiveDays * 864e5);
        const cutoffStr = cutoffDate.toISOString().slice(0, 10);
        const archiveDate = today.toISOString().slice(0, 10);
        const normalizedArchivePath = (0, import_obsidian.normalizePath)(archiveFilePath);
        const result = await this.queryCards({});
        const doneCards = result.cards.filter((c) => {
          const colLower = c.column.toLowerCase();
          return colLower.includes("done") || colLower.includes("completed");
        });
        const toArchive = [];
        for (const card of doneCards) {
          let dateStr = card.completed;
          if (!dateStr) {
            dateStr = archiveDate;
          }
          if (dateStr < cutoffStr) {
            toArchive.push(card);
          }
        }
        if (toArchive.length === 0) {
          return { ok: true, archived: 0, details: [] };
        }
        let existingContent = "";
        const archiveFile = this.app.vault.getAbstractFileByPath(normalizedArchivePath);
        if (archiveFile instanceof import_obsidian.TFile) {
          existingContent = await this.app.vault.read(archiveFile);
        }
        const archiveEntries = this.buildArchiveEntries(toArchive, archiveDate);
        let newContent;
        if (existingContent && existingContent.trim()) {
          if (existingContent.includes("</cards>")) {
            const parts = existingContent.split("</cards>");
            newContent = parts.slice(0, -1).join("</cards>") + archiveEntries + "</cards>";
          } else {
            newContent = existingContent.trimEnd() + "\n\n" + archiveEntries;
          }
        } else {
          newContent = this.buildArchiveMarkdown(archiveEntries);
        }
        const archiveDir = normalizedArchivePath.substring(0, normalizedArchivePath.lastIndexOf("/"));
        await this.app.vault.adapter.mkdir((0, import_obsidian.normalizePath)(archiveDir || ".")).catch(() => {
        });
        if (archiveFile instanceof import_obsidian.TFile) {
          await this.app.vault.modify(archiveFile, newContent);
        } else {
          await this.app.vault.create(normalizedArchivePath, newContent);
        }
        const details = [];
        for (const card of toArchive) {
          const file = this.app.vault.getAbstractFileByPath((0, import_obsidian.normalizePath)(card.boardId));
          if (!(file instanceof import_obsidian.TFile))
            continue;
          const content = await this.app.vault.read(file);
          const lines = content.split("\n");
          let inColumn = false;
          let found = false;
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].startsWith("## ")) {
              inColumn = lines[i].slice(3).trim() === card.column;
            }
            if (inColumn && (lines[i].startsWith("- [ ]") || lines[i].startsWith("- [x]"))) {
              if (this.extractTitleFromLine(lines[i]) === card.title) {
                lines.splice(i, 1);
                found = true;
                details.push(`Archived "${card.title}" from "${card.boardId}"`);
                break;
              }
            }
          }
          if (found) {
            await this.app.vault.modify(file, lines.join("\n"));
          }
        }
        return { ok: true, archived: toArchive.length, details };
      }
      /**
       * Build archive entries as Markdown sections, grouped by board.
       */
      buildArchiveEntries(cards, archiveDate) {
        var _a, _b;
        const grouped = /* @__PURE__ */ new Map();
        for (const card of cards) {
          const boardName = ((_a = card.boardId.split("/").pop()) == null ? void 0 : _a.replace(".md", "")) || card.boardId;
          if (!grouped.has(boardName))
            grouped.set(boardName, []);
          grouped.get(boardName).push(card);
        }
        let entries = "";
        for (const [boardName, boardCards] of grouped) {
          entries += `
## Board: ${boardName}

`;
          for (const card of boardCards) {
            entries += `### \u2705 ${card.title}
`;
            if (card.completed)
              entries += `- completed: ${card.completed}
`;
            if (card.priority)
              entries += `- #${card.priority}
`;
            if ((_b = card.tags) == null ? void 0 : _b.length)
              entries += `- ${card.tags.map((t) => `@${t}`).join(" ")}
`;
            entries += `</cards>

`;
          }
        }
        return entries;
      }
      /**
       * Build the full archive.md content with frontmatter.
       */
      buildArchiveMarkdown(entries) {
        const archiveDate = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
        return `---
kanban-plugin: archived
---

# Archived Cards
Archive date: ${archiveDate}
${entries}`;
      }
    };
  }
});

// src/main.ts
var main_exports = {};
__export(main_exports, {
  PLUGIN_VERSION: () => PLUGIN_VERSION,
  default: () => HermesKanbanPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian5 = require("obsidian");

// src/settings.ts
var DEFAULT_SETTINGS = {
  port: 27124,
  boardFolder: "Kanban",
  trustMode: "confirm",
  enabled: true,
  mcpEnabled: false,
  notificationInterval: 15,
  githubToken: "",
  githubOwner: "",
  githubRepo: "",
  githubProjectId: 0,
  syncIssues: "off",
  syncProjects: "off",
  archiveEnabled: false,
  archiveDays: 30,
  archiveFilePath: "Kanban/archive.md"
};

// src/server.ts
var http = __toESM(require("http"));
var import_obsidian3 = require("obsidian");
init_kanban_parser();

// src/notification.ts
var import_obsidian2 = require("obsidian");
async function checkDueDateNotifications(app, settings, parser, notifiedIds) {
  var _a;
  const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const queryResult = await parser.queryCards({ overdue: true });
  const overdue = queryResult.cards;
  const notifiedCardIds = [];
  for (const card of overdue) {
    if (notifiedIds.has(card.id))
      continue;
    notifiedIds.add(card.id);
    notifiedCardIds.push(card.id);
    const boardName = ((_a = card.boardId.split("/").pop()) == null ? void 0 : _a.replace(".md", "")) || card.boardId;
    new import_obsidian2.Notice(`Card "${card.title}" in board "${boardName}" is overdue`);
  }
  const overdueWithBoard = overdue.map((c) => {
    var _a2;
    return {
      cardId: c.id,
      title: c.title,
      dueDate: c.dueDate,
      board: ((_a2 = c.boardId.split("/").pop()) == null ? void 0 : _a2.replace(".md", "")) || c.boardId
    };
  });
  const result = {
    overdue: overdueWithBoard,
    notified: notifiedCardIds
  };
  if (settings.archiveEnabled) {
    try {
      const archiveResult = await parser.archiveCards(
        settings.boardFolder,
        settings.archiveFilePath,
        settings.archiveDays
      );
      if (archiveResult.archived > 0) {
        result.archived = { archived: archiveResult.archived, details: archiveResult.details };
      }
    } catch (err) {
      console.error("Error during auto-archive:", err);
    }
  }
  return result;
}
function startNotificationScheduler(app, settings, parser, notifiedIds) {
  checkDueDateNotifications(app, settings, parser, notifiedIds).catch((err) => {
    console.error("Error checking due date notifications:", err);
  });
  if (settings.notificationInterval > 0) {
    const intervalMs = settings.notificationInterval * 60 * 1e3;
    const intervalId = setInterval(() => {
      checkDueDateNotifications(app, settings, parser, notifiedIds).catch((err) => {
        console.error("Error checking due date notifications:", err);
      });
    }, intervalMs);
    return () => clearInterval(intervalId);
  }
  return () => {
  };
}

// src/templates.ts
var BOARD_TEMPLATES = [
  {
    name: "sprint",
    columns: ["Backlog", "To Do", "In Progress", "Review", "Done", "Blocked"]
  },
  {
    name: "bug-triage",
    columns: ["Reported", "Triage", "In Progress", "Testing", "Released"]
  },
  {
    name: "release",
    columns: ["Backlog", "In Progress", "Staged", "Deployed", "Verified"]
  },
  {
    name: "personal",
    columns: ["Ideas", "To Do", "In Progress", "Done"]
  }
];
function getTemplate(name) {
  return BOARD_TEMPLATES.find((t) => t.name === name);
}

// src/server.ts
var KanbanServer = class {
  constructor(app, settings) {
    this.server = null;
    this.notifiedIds = /* @__PURE__ */ new Set();
    this.stopNotifications = () => {
    };
    this.app = app;
    this.settings = settings;
    this.parser = new KanbanParser(app);
  }
  start() {
    if (this.server)
      this.stop();
    this.server = http.createServer(async (req, res) => {
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }
      const url = new URL(req.url || "/", `http://localhost:${this.settings.port}`);
      const body = await this.readBody(req);
      try {
        const result = await this.route(req.method || "GET", url.pathname, url.searchParams, body);
        res.writeHead(200);
        res.end(JSON.stringify(result));
      } catch (err) {
        const status = err.status || 500;
        res.writeHead(status);
        res.end(JSON.stringify({ ok: false, error: err.message || "Internal server error" }));
      }
    });
    this.server.listen(this.settings.port, "0.0.0.0", () => {
      console.log(`Hermes Kanban Bridge listening on port ${this.settings.port}`);
      new import_obsidian3.Notice(`Hermes Kanban Bridge started on port ${this.settings.port}`);
    });
    this.stopNotifications = startNotificationScheduler(
      this.app,
      this.settings,
      this.parser,
      this.notifiedIds
    );
    this.server.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        new import_obsidian3.Notice(`Hermes Kanban Bridge: port ${this.settings.port} already in use. Change port in settings.`);
      }
      console.error("Hermes Kanban Bridge server error:", err);
    });
  }
  stop() {
    if (this.server) {
      this.server.close();
      this.server = null;
      this.stopNotifications();
      console.log("Hermes Kanban Bridge stopped");
    }
  }
  async readBody(req) {
    return new Promise((resolve) => {
      let body = "";
      req.on("data", (chunk) => body += chunk);
      req.on("end", () => {
        try {
          resolve(body ? JSON.parse(body) : {});
        } catch (e) {
          resolve({});
        }
      });
    });
  }
  async route(method, path, params, body) {
    if (method === "GET" && path === "/health") {
      return { ok: true, status: "running", port: this.settings.port, version: PLUGIN_VERSION };
    }
    if (method === "GET" && path === "/boards") {
      return await this.parser.listBoards(this.settings.boardFolder);
    }
    if (method === "GET" && path.startsWith("/boards/")) {
      const boardId = decodeURIComponent(path.slice("/boards/".length));
      return await this.parser.getBoard(boardId);
    }
    if (method === "POST" && path === "/boards") {
      return await this.parser.createBoard(body, this.settings.boardFolder);
    }
    if (method === "POST" && path === "/cards/move") {
      return await this.parser.moveCard(body);
    }
    if (method === "POST" && path === "/cards") {
      return await this.parser.addCard(body);
    }
    if (method === "PUT" && path.startsWith("/cards/")) {
      const cardId = decodeURIComponent(path.slice("/cards/".length));
      return await this.parser.updateCard(cardId, body);
    }
    if (method === "GET" && path === "/query") {
      return await this.parser.queryCards({
        boardId: params.get("boardId") || void 0,
        column: params.get("column") || void 0,
        tag: params.get("tag") || void 0,
        blocked: params.get("blocked") === "true" ? true : void 0,
        overdue: params.get("overdue") === "true" ? true : void 0
      });
    }
    if (method === "POST" && path === "/cards/link") {
      return await this.parser.linkCards(body);
    }
    if (method === "GET" && path === "/cards/links") {
      const cardId = params.get("cardId");
      if (!cardId) {
        const e = new Error("cardId query param required");
        e.status = 400;
        throw e;
      }
      return await this.parser.getCardLinks(decodeURIComponent(cardId));
    }
    if (method === "POST" && path === "/cards/process-recurring") {
      return await this.parser.processRecurring(body);
    }
    if (method === "POST" && path === "/ritual/standup") {
      return await this.parser.generateStandup(body);
    }
    if (method === "POST" && path === "/ritual/review") {
      return await this.parser.generateReview(body);
    }
    if (method === "GET" && path === "/notify/due") {
      const result = await checkDueDateNotifications(
        this.app,
        this.settings,
        this.parser,
        this.notifiedIds
      );
      return { ok: true, ...result };
    }
    if (method === "GET" && path === "/report/velocity") {
      const weeks = parseInt(params.get("weeks") || "4", 10);
      return await this.parser.generateVelocityReport(this.settings.boardFolder, weeks);
    }
    if (method === "POST" && path === "/ritual/velocity") {
      const weeks = (body == null ? void 0 : body.weeks) ? parseInt(String(body.weeks), 10) : 4;
      return await this.parser.generateVelocityReport(this.settings.boardFolder, weeks);
    }
    const err = new Error(`Not found: ${method} ${path}`);
    err.status = 404;
    throw err;
    if (method === "POST" && path === "/cards/archive") {
      if (!this.settings.archiveEnabled) {
        const e = new Error("Card archival is not enabled. Enable archiveEnabled in settings.");
        e.status = 400;
        throw e;
      }
      return await this.parser.archiveCards(
        this.settings.boardFolder,
        this.settings.archiveFilePath,
        this.settings.archiveDays
      );
    }
    if (method === "POST" && path === "/templates") {
      return await this.createBoardFromTemplate(body);
    }
  }
  /**
   * Create a board from a preset template.
   * Body: { template: string, boardTitle: string }
   */
  async createBoardFromTemplate(body) {
    if (!body.template || !body.boardTitle) {
      const e = new Error('Body requires "template" (template name) and "boardTitle"');
      e.status = 400;
      throw e;
    }
    const template = getTemplate(body.template);
    if (!template) {
      const e = new Error(`Template "${body.template}" not found. Available: ${["sprint", "bug-triage", "release", "personal"].join(", ")}`);
      e.status = 404;
      throw e;
    }
    await this.parser.createBoard({ title: body.boardTitle, columns: template.columns }, this.settings.boardFolder);
    return { ok: true, path: `${this.settings.boardFolder}/${body.boardTitle}.md` };
  }
};

// src/mcp-adapter.ts
var import_obsidian4 = require("obsidian");
var http2 = __toESM(require("http"));
var McpAdapter = class {
  constructor(app, settings, parser) {
    this.server = null;
    this.app = app;
    this.settings = settings;
    this.parser = parser;
  }
  get port() {
    return this.settings.port + 1;
  }
  start() {
    if (this.server)
      this.stop();
    this.server = http2.createServer(async (req, res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }
      const url = new URL(req.url || "/", `http://localhost:${this.port}`);
      const body = await this.readBody(req);
      try {
        const result = await this.handleMcp(req.method || "GET", url.pathname, body);
        res.setHeader("Content-Type", "application/json");
        res.writeHead(200);
        res.end(JSON.stringify(result));
      } catch (err) {
        res.setHeader("Content-Type", "application/json");
        res.writeHead(err.status || 500);
        res.end(JSON.stringify({ error: { code: -32603, message: err.message } }));
      }
    });
    this.server.listen(this.port, "0.0.0.0", () => {
      console.log(`Hermes Kanban MCP adapter listening on port ${this.port}`);
      new import_obsidian4.Notice(`Hermes Kanban MCP ready on port ${this.port}`);
    });
  }
  stop() {
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }
  async handleMcp(method, path, body) {
    if (path === "/mcp" && method === "POST" && (body == null ? void 0 : body.method) === "initialize") {
      return {
        jsonrpc: "2.0",
        id: body.id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "hermes-kanban-bridge", version: "1.0.0" }
        }
      };
    }
    if (path === "/mcp" && method === "POST" && (body == null ? void 0 : body.method) === "tools/list") {
      return {
        jsonrpc: "2.0",
        id: body.id,
        result: { tools: this.getTools() }
      };
    }
    if (path === "/mcp" && method === "POST" && (body == null ? void 0 : body.method) === "tools/call") {
      const { name, arguments: args } = body.params;
      const result = await this.callTool(name, args || {});
      return {
        jsonrpc: "2.0",
        id: body.id,
        result: {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          isError: !result.ok
        }
      };
    }
    if (path === "/mcp/health" && method === "GET") {
      return { ok: true, transport: "http", port: this.port, tools: this.getTools().length };
    }
    const err = new Error(`Unknown MCP path: ${method} ${path}`);
    err.status = 404;
    throw err;
  }
  async callTool(name, args) {
    switch (name) {
      case "kanban_health":
        return { ok: true, status: "running", port: this.settings.port, version: "1.0.0" };
      case "kanban_list_boards":
        return await this.parser.listBoards(this.settings.boardFolder);
      case "kanban_get_board":
        return await this.parser.getBoard(args.boardId);
      case "kanban_create_board":
        return await this.parser.createBoard(args, this.settings.boardFolder);
      case "kanban_add_card":
        return await this.parser.addCard(args);
      case "kanban_move_card":
        return await this.parser.moveCard(args);
      case "kanban_update_card":
        return await this.parser.updateCard(args.cardId, args);
      case "kanban_query":
        return await this.parser.queryCards(args);
      case "kanban_standup":
        return await this.parser.generateStandup(args);
      case "kanban_review":
        return await this.parser.generateReview(args);
      default:
        return { ok: false, error: `Unknown tool: ${name}` };
    }
  }
  getTools() {
    return [
      {
        name: "kanban_health",
        description: "Check if the Hermes Kanban Bridge plugin is running",
        inputSchema: { type: "object", properties: {} }
      },
      {
        name: "kanban_list_boards",
        description: "List all Kanban boards in the vault",
        inputSchema: { type: "object", properties: {} }
      },
      {
        name: "kanban_get_board",
        description: "Get full board state including all columns and cards",
        inputSchema: {
          type: "object",
          properties: { boardId: { type: "string", description: "Board file path (e.g. Kanban/MyProject.md)" } },
          required: ["boardId"]
        }
      },
      {
        name: "kanban_create_board",
        description: "Create a new Kanban board with custom columns",
        inputSchema: {
          type: "object",
          properties: {
            title: { type: "string", description: "Board title" },
            columns: { type: "array", items: { type: "string" }, description: "Column names (default: Backlog, To Do, In Progress, Review, Done)" }
          },
          required: ["title"]
        }
      },
      {
        name: "kanban_add_card",
        description: "Add a new card to a Kanban board column",
        inputSchema: {
          type: "object",
          properties: {
            boardId: { type: "string", description: "Board file path" },
            column: { type: "string", description: "Target column name" },
            title: { type: "string", description: "Card title (verb phrase recommended)" },
            priority: { type: "string", enum: ["high", "medium", "low"] },
            dueDate: { type: "string", description: "ISO date YYYY-MM-DD" },
            tags: { type: "array", items: { type: "string" } },
            blocked: { type: "boolean" },
            blockerReason: { type: "string" }
          },
          required: ["boardId", "column", "title"]
        }
      },
      {
        name: "kanban_move_card",
        description: "Move a card from one column to another",
        inputSchema: {
          type: "object",
          properties: {
            cardId: { type: "string", description: "Card ID: boardPath::column::title" },
            toColumn: { type: "string", description: "Destination column name" }
          },
          required: ["cardId", "toColumn"]
        }
      },
      {
        name: "kanban_update_card",
        description: "Update card metadata (priority, due date, tags, blocked status)",
        inputSchema: {
          type: "object",
          properties: {
            cardId: { type: "string", description: "Card ID: boardPath::column::title" },
            priority: { type: "string", enum: ["high", "medium", "low"] },
            dueDate: { type: "string" },
            tags: { type: "array", items: { type: "string" } },
            blocked: { type: "boolean" },
            blockerReason: { type: "string" }
          },
          required: ["cardId"]
        }
      },
      {
        name: "kanban_query",
        description: "Query cards across boards with filters",
        inputSchema: {
          type: "object",
          properties: {
            boardId: { type: "string", description: "Filter to specific board (optional)" },
            column: { type: "string" },
            tag: { type: "string" },
            blocked: { type: "boolean" },
            overdue: { type: "boolean" }
          }
        }
      },
      {
        name: "kanban_standup",
        description: "Generate a daily standup summary \u2014 in progress, blocked, and overdue cards",
        inputSchema: {
          type: "object",
          properties: { boardId: { type: "string", description: "Specific board (optional, omit for all boards)" } }
        }
      },
      {
        name: "kanban_review",
        description: "Generate a weekly review report \u2014 completed, carry-over, velocity",
        inputSchema: {
          type: "object",
          properties: { boardId: { type: "string", description: "Specific board (optional, omit for all boards)" } }
        }
      }
    ];
  }
  async readBody(req) {
    return new Promise((resolve) => {
      let body = "";
      req.on("data", (chunk) => body += chunk);
      req.on("end", () => {
        try {
          resolve(body ? JSON.parse(body) : {});
        } catch (e) {
          resolve({});
        }
      });
    });
  }
};

// src/main.ts
var PLUGIN_VERSION = "1.5.0";
var HermesKanbanPlugin = class extends import_obsidian5.Plugin {
  constructor() {
    super(...arguments);
    this.settings = DEFAULT_SETTINGS;
    this.server = null;
    this.mcpAdapter = null;
  }
  async onload() {
    await this.loadSettings();
    this.server = new KanbanServer(this.app, this.settings);
    if (this.settings.enabled) {
      this.server.start();
    }
    if (this.settings.enabled && this.settings.notificationInterval > 0) {
      this.server.startNotifier(this.settings.notificationInterval);
    }
    if (this.settings.mcpEnabled && this.server) {
      const { KanbanParser: KanbanParser2 } = await Promise.resolve().then(() => (init_kanban_parser(), kanban_parser_exports));
      const parser = new KanbanParser2(this.app);
      this.mcpAdapter = new McpAdapter(this.app, this.settings, parser);
      this.mcpAdapter.start();
    }
    this.addSettingTab(new HermesKanbanSettingTab(this.app, this));
    this.addCommand({
      id: "toggle-server",
      name: "Toggle Hermes Kanban Bridge server",
      callback: () => {
        if (this.server) {
          this.settings.enabled = !this.settings.enabled;
          this.settings.enabled ? this.server.start() : this.server.stop();
          this.saveSettings();
        }
      }
    });
    this.addCommand({
      id: "toggle-mcp",
      name: "Toggle Hermes Kanban MCP adapter",
      callback: async () => {
        var _a;
        this.settings.mcpEnabled = !this.settings.mcpEnabled;
        if (this.settings.mcpEnabled) {
          const { KanbanParser: KanbanParser2 } = await Promise.resolve().then(() => (init_kanban_parser(), kanban_parser_exports));
          const parser = new KanbanParser2(this.app);
          this.mcpAdapter = new McpAdapter(this.app, this.settings, parser);
          this.mcpAdapter.start();
        } else {
          (_a = this.mcpAdapter) == null ? void 0 : _a.stop();
          this.mcpAdapter = null;
        }
        this.saveSettings();
      }
    });
    this.addCommand({
      id: "brat-check-update",
      name: "Check for BRAT Updates",
      callback: async () => {
        const releaseUrl = "https://github.com/GumbyEnder/hermes-kanban/releases";
        await navigator.clipboard.writeText(releaseUrl);
        new Notice("Hermes Kanban Bridge: Release URL copied to clipboard. Check BRAT for updates on GitHub Releases.");
      }
    });
    console.log("Hermes Kanban Bridge loaded");
  }
  onunload() {
    var _a, _b, _c;
    (_a = this.server) == null ? void 0 : _a.stopNotifier();
    (_b = this.server) == null ? void 0 : _b.stop();
    (_c = this.mcpAdapter) == null ? void 0 : _c.stop();
    console.log("Hermes Kanban Bridge unloaded");
  }
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
};
var HermesKanbanSettingTab = class extends import_obsidian5.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Hermes Kanban Bridge Settings" });
    new import_obsidian5.Setting(containerEl).setName("Port").setDesc("Local port for the REST API (default: 27124)").addText((text) => text.setPlaceholder("27124").setValue(String(this.plugin.settings.port)).onChange(async (value) => {
      const port = parseInt(value);
      if (!isNaN(port) && port > 1024 && port < 65535) {
        this.plugin.settings.port = port;
        await this.plugin.saveSettings();
      }
    }));
    new import_obsidian5.Setting(containerEl).setName("Board folder").setDesc("Vault folder where Kanban boards are stored").addText((text) => text.setPlaceholder("Kanban").setValue(this.plugin.settings.boardFolder).onChange(async (value) => {
      this.plugin.settings.boardFolder = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian5.Setting(containerEl).setName("Trust mode").setDesc("Confirm: show approval modal. Auto: allow writes without prompting.").addDropdown((drop) => drop.addOption("confirm", "Confirm (ask before writing)").addOption("auto", "Auto-trust (no prompts)").setValue(this.plugin.settings.trustMode).onChange(async (value) => {
      this.plugin.settings.trustMode = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian5.Setting(containerEl).setName("Enable server").setDesc("Start the REST API server when Obsidian loads").addToggle((toggle) => toggle.setValue(this.plugin.settings.enabled).onChange(async (value) => {
      var _a, _b, _c, _d;
      this.plugin.settings.enabled = value;
      await this.plugin.saveSettings();
      value ? (_a = this.plugin.server) == null ? void 0 : _a.start() : (_b = this.plugin.server) == null ? void 0 : _b.stop();
      if (value && this.plugin.settings.notificationInterval > 0) {
        (_c = this.plugin.server) == null ? void 0 : _c.startNotifier(this.plugin.settings.notificationInterval);
      } else {
        (_d = this.plugin.server) == null ? void 0 : _d.stopNotifier();
      }
    }));
    new import_obsidian5.Setting(containerEl).setName("Due date notification interval").setDesc("Check for overdue cards every N minutes (0 = disabled). Shows an Obsidian notice for each overdue card.").addText((text) => text.setPlaceholder("15").setValue(String(this.plugin.settings.notificationInterval)).onChange(async (value) => {
      var _a, _b;
      const minutes = parseInt(value);
      if (!isNaN(minutes) && minutes >= 0) {
        this.plugin.settings.notificationInterval = minutes;
        await this.plugin.saveSettings();
        if (minutes > 0 && this.plugin.settings.enabled) {
          (_a = this.plugin.server) == null ? void 0 : _a.startNotifier(minutes);
        } else {
          (_b = this.plugin.server) == null ? void 0 : _b.stopNotifier();
        }
      }
    }));
    new import_obsidian5.Setting(containerEl).setName("Enable MCP adapter").setDesc("Expose Kanban tools via MCP on port " + (this.plugin.settings.port + 1) + " (Claude Desktop, Cursor, Zed, etc.)").addToggle((toggle) => toggle.setValue(this.plugin.settings.mcpEnabled).onChange(async (value) => {
      var _a;
      this.plugin.settings.mcpEnabled = value;
      await this.plugin.saveSettings();
      if (value) {
        Promise.resolve().then(() => (init_kanban_parser(), kanban_parser_exports)).then(({ KanbanParser: KanbanParser2 }) => {
          var _a2;
          const parser = new KanbanParser2(this.plugin.app);
          this.plugin.mcpAdapter = new McpAdapter(this.plugin.app, this.plugin.settings, parser);
          (_a2 = this.plugin.mcpAdapter) == null ? void 0 : _a2.start();
        });
      } else {
        (_a = this.plugin.mcpAdapter) == null ? void 0 : _a.stop();
        this.plugin.mcpAdapter = null;
      }
    }));
    containerEl.createEl("hr");
    containerEl.createEl("h3", { text: "GitHub Integration" });
    new import_obsidian5.Setting(containerEl).setName("GitHub Token").setDesc("Personal access token with repo access. Stored locally only.").addText((text) => {
      text.inputEl.type = "password";
      text.setValue(this.plugin.settings.githubToken).onChange(async (value) => {
        this.plugin.settings.githubToken = value;
        await this.plugin.saveSettings();
      });
    });
    new import_obsidian5.Setting(containerEl).setName("GitHub Owner").setDesc("Your GitHub username or organization name.").addText((text) => text.setPlaceholder("Username or org").setValue(this.plugin.settings.githubOwner).onChange(async (value) => {
      this.plugin.settings.githubOwner = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian5.Setting(containerEl).setName("GitHub Repo").setDesc("The repository name to sync issues with.").addText((text) => text.setPlaceholder("repo-name").setValue(this.plugin.settings.githubRepo).onChange(async (value) => {
      this.plugin.settings.githubRepo = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian5.Setting(containerEl).setName("GitHub Project ID").setDesc("Numeric ID of the GitHub Projects board for card sync.").addText((text) => text.setPlaceholder("0").setValue(String(this.plugin.settings.githubProjectId)).onChange(async (value) => {
      const id = parseInt(value);
      this.plugin.settings.githubProjectId = isNaN(id) ? 0 : id;
      await this.plugin.saveSettings();
    }));
    new import_obsidian5.Setting(containerEl).setName("Sync Issues").setDesc("How to sync Kanban cards with GitHub Issues.").addDropdown((drop) => drop.addOption("off", "Off (no sync)").addOption("push", "Push only (Kanban to GitHub)").addOption("pull", "Pull only (GitHub to Kanban)").addOption("bidirectional", "Bidirectional").setValue(this.plugin.settings.syncIssues).onChange(async (value) => {
      this.plugin.settings.syncIssues = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian5.Setting(containerEl).setName("Sync Projects").setDesc("How to sync Kanban cards with GitHub Projects board.").addDropdown((drop) => drop.addOption("off", "Off (no sync)").addOption("push", "Push only (Kanban to GitHub)").addOption("pull", "Pull only (GitHub to Kanban)").addOption("bidirectional", "Bidirectional").setValue(this.plugin.settings.syncProjects).onChange(async (value) => {
      this.plugin.settings.syncProjects = value;
      await this.plugin.saveSettings();
    }));
  }
};
