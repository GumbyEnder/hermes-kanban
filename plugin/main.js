     1|var __create = Object.create;
     2|var __defProp = Object.defineProperty;
     3|var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
     4|var __getOwnPropNames = Object.getOwnPropertyNames;
     5|var __getProtoOf = Object.getPrototypeOf;
     6|var __hasOwnProp = Object.prototype.hasOwnProperty;
     7|var __esm = (fn, res) => function __init() {
     8|  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
     9|};
    10|var __export = (target, all) => {
    11|  for (var name in all)
    12|    __defProp(target, name, { get: all[name], enumerable: true });
    13|};
    14|var __copyProps = (to, from, except, desc) => {
    15|  if (from && typeof from === "object" || typeof from === "function") {
    16|    for (let key of __getOwnPropNames(from))
    17|      if (!__hasOwnProp.call(to, key) && key !== except)
    18|        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    19|  }
    20|  return to;
    21|};
    22|var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    23|  // If the importer is in node compatibility mode or this is not an ESM
    24|  // file that has been converted to a CommonJS file using a Babel-
    25|  // compatible transform (i.e. "__esModule" has not been set), then set
    26|  // "default" to the CommonJS "module.exports" for node compatibility.
    27|  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    28|  mod
    29|));
    30|var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
    31|
    32|// src/kanban-parser.ts
    33|var kanban_parser_exports = {};
    34|__export(kanban_parser_exports, {
    35|  KanbanParser: () => KanbanParser
    36|});
    37|var import_obsidian, KanbanParser;
    38|var init_kanban_parser = __esm({
    39|  "src/kanban-parser.ts"() {
    40|    import_obsidian = require("obsidian");
    41|    KanbanParser = class {
    42|      constructor(app) {
    43|        this.app = app;
    44|      }
    45|      async listBoards(boardFolder) {
    46|        const folder = this.app.vault.getAbstractFileByPath((0, import_obsidian.normalizePath)(boardFolder));
    47|        const boards = [];
    48|        if (folder instanceof import_obsidian.TFolder) {
    49|          for (const child of folder.children) {
    50|            if (child instanceof import_obsidian.TFile && child.extension === "md") {
    51|              const content = await this.app.vault.read(child);
    52|              if (this.isKanbanBoard(content)) {
    53|                const parsed = this.parseBoard(child.path, child.basename, content);
    54|                boards.push({ id: child.path, title: child.basename, path: child.path, cardCount: parsed.cards.length });
    55|              }
    56|            }
    57|          }
    58|        }
    59|        return { ok: true, boards };
    60|      }
    61|      async getBoard(boardId) {
    62|        const file = this.app.vault.getAbstractFileByPath((0, import_obsidian.normalizePath)(boardId));
    63|        if (!(file instanceof import_obsidian.TFile))
    64|          return { ok: false, error: `Board not found: ${boardId}` };
    65|        const content = await this.app.vault.read(file);
    66|        return { ok: true, board: this.parseBoard(file.path, file.basename, content) };
    67|      }
    68|      async createBoard(body, defaultFolder) {
    69|        const columns = body.columns || ["Backlog", "To Do", "In Progress", "Review", "Done"];
    70|        const folder = body.boardFolder || defaultFolder;
    71|        const path = (0, import_obsidian.normalizePath)(`${folder}/${body.title}.md`);
    72|        const content = this.buildBoardMarkdown(body.title, columns);
    73|        await this.app.vault.adapter.mkdir((0, import_obsidian.normalizePath)(folder)).catch(() => {
    74|        });
    75|        await this.app.vault.create(path, content);
    76|        return { ok: true, board: { id: path, title: body.title, path, columns, cards: [] } };
    77|      }
    78|      async addCard(body) {
    79|        const file = this.app.vault.getAbstractFileByPath((0, import_obsidian.normalizePath)(body.boardId));
    80|        if (!(file instanceof import_obsidian.TFile))
    81|          return { ok: false, error: `Board not found: ${body.boardId}` };
    82|        const content = await this.app.vault.read(file);
    83|        const cardLine = this.formatCardLine(body);
    84|        const updated = this.insertCardIntoColumn(content, body.column, cardLine);
    85|        await this.app.vault.modify(file, updated);
    86|        const id = `${body.boardId}::${body.column}::${body.title}`;
    87|        return { ok: true, card: { id, title: body.title, column: body.column, boardId: body.boardId } };
    88|      }
    89|      async moveCard(body) {
    90|        const [boardId, fromColumn, ...titleParts] = body.cardId.split("::");
    91|        const title = titleParts.join("::");
    92|        const file = this.app.vault.getAbstractFileByPath((0, import_obsidian.normalizePath)(boardId));
    93|        if (!(file instanceof import_obsidian.TFile))
    94|          return { ok: false, error: `Board not found: ${boardId}` };
    95|        const content = await this.app.vault.read(file);
    96|        const lines = content.split("\n");
    97|        let cardLine = null;
    98|        let cardLineIdx = -1;
    99|        let inFromColumn = false;
   100|        for (let i = 0; i < lines.length; i++) {
   101|          const line = lines[i];
   102|          if (line.startsWith("## "))
   103|            inFromColumn = line.slice(3).trim() === fromColumn;
   104|          if (inFromColumn && (line.startsWith("- [ ]") || line.startsWith("- [x]"))) {
   105|            const lineTitle = this.extractTitleFromLine(line);
   106|            if (lineTitle === title) {
   107|              cardLine = line;
   108|              cardLineIdx = i;
   109|              break;
   110|            }
   111|          }
   112|        }
   113|        if (cardLineIdx === -1 || !cardLine) {
   114|          return { ok: false, error: `Card "${title}" not found in column "${fromColumn}"` };
   115|        }
   116|        lines.splice(cardLineIdx, 1);
   117|        const updated = this.insertCardIntoColumn(lines.join("\n"), body.toColumn, cardLine);
   118|        await this.app.vault.modify(file, updated);
   119|        return { ok: true, message: `Moved "${title}" from "${fromColumn}" to "${body.toColumn}"` };
   120|      }
   121|      async updateCard(cardId, body) {
   122|        const [boardId, column, ...titleParts] = cardId.split("::");
   123|        const title = titleParts.join("::");
   124|        const file = this.app.vault.getAbstractFileByPath((0, import_obsidian.normalizePath)(boardId));
   125|        if (!(file instanceof import_obsidian.TFile))
   126|          return { ok: false, error: `Board not found: ${boardId}` };
   127|        const content = await this.app.vault.read(file);
   128|        const lines = content.split("\n");
   129|        let updated = false;
   130|        let inColumn = false;
   131|        for (let i = 0; i < lines.length; i++) {
   132|          if (lines[i].startsWith("## "))
   133|            inColumn = lines[i].slice(3).trim() === column;
   134|          if (inColumn && (lines[i].startsWith("- [ ]") || lines[i].startsWith("- [x]"))) {
   135|            if (this.extractTitleFromLine(lines[i]) === title) {
   136|              lines[i] = this.formatCardLine({ ...body, title: body.title || title, column, boardId });
   137|              updated = true;
   138|              break;
   139|            }
   140|          }
   141|        }
   142|        if (!updated)
   143|          return { ok: false, error: `Card "${title}" not found` };
   144|        await this.app.vault.modify(file, lines.join("\n"));
   145|        return { ok: true, message: `Updated card "${title}"` };
   146|      }
   147|      async queryCards(filters) {
   148|        var _a;
   149|        const results = [];
   150|        const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
   151|        const files = [];
   152|        if (filters.boardId) {
   153|          const f = this.app.vault.getAbstractFileByPath((0, import_obsidian.normalizePath)(filters.boardId));
   154|          if (f instanceof import_obsidian.TFile)
   155|            files.push(f);
   156|        } else {
   157|          this.app.vault.getMarkdownFiles().forEach((f) => files.push(f));
   158|        }
   159|        for (const file of files) {
   160|          const content = await this.app.vault.read(file);
   161|          if (!this.isKanbanBoard(content))
   162|            continue;
   163|          const board = this.parseBoard(file.path, file.basename, content);
   164|          for (const card of board.cards) {
   165|            if (filters.column && card.column !== filters.column)
   166|              continue;
   167|            if (filters.tag && !((_a = card.tags) == null ? void 0 : _a.includes(filters.tag)))
   168|              continue;
   169|            if (filters.blocked !== void 0 && card.blocked !== filters.blocked)
   170|              continue;
   171|            if (filters.overdue && (!card.dueDate || card.dueDate >= today))
   172|              continue;
   173|            results.push(card);
   174|          }
   175|        }
   176|        return { ok: true, cards: results };
   177|      }
   178|      async generateStandup(body) {
   179|        const result = await this.queryCards({ boardId: body.boardId });
   180|        const inProgress = result.cards.filter((c) => c.column === "In Progress");
   181|        const blocked = result.cards.filter((c) => c.blocked);
   182|        const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
   183|        const dueSoon = result.cards.filter((c) => c.dueDate && c.dueDate <= today && c.column !== "Done");
   184|        return {
   185|          ok: true,
   186|          standup: {
   187|            generated: (/* @__PURE__ */ new Date()).toISOString(),
   188|            inProgress: inProgress.map((c) => ({ title: c.title, board: c.boardId, priority: c.priority })),
   189|            blocked: blocked.map((c) => ({ title: c.title, reason: c.blockerReason, board: c.boardId })),
   190|            dueSoon: dueSoon.map((c) => ({ title: c.title, dueDate: c.dueDate, column: c.column })),
   191|            summary: `${inProgress.length} in progress, ${blocked.length} blocked, ${dueSoon.length} due today/overdue`
   192|          }
   193|        };
   194|      }
   195|      async generateReview(body) {
   196|        const result = await this.queryCards({ boardId: body.boardId });
   197|        const done = result.cards.filter((c) => c.column === "Done");
   198|        const carryOver = result.cards.filter((c) => c.column !== "Done");
   199|        const blocked = result.cards.filter((c) => c.blocked);
   200|        return {
   201|          ok: true,
   202|          review: {
   203|            generated: (/* @__PURE__ */ new Date()).toISOString(),
   204|            completed: done.map((c) => ({ title: c.title, board: c.boardId })),
   205|            carryOver: carryOver.map((c) => ({ title: c.title, column: c.column, priority: c.priority })),
   206|            blocked: blocked.map((c) => ({ title: c.title, reason: c.blockerReason })),
   207|            velocity: done.length,
   208|            summary: `Completed: ${done.length}. Carry-over: ${carryOver.length}. Blocked: ${blocked.length}.`
   209|          }
   210|        };
   211|      }
   212|      /**
   213|       * Generate a velocity report showing weekly throughput.
   214|       * Scans all kanban boards for completed cards (via `completed: YYYY-MM-DD` metadata
   215|       * or cards in Done/Completed columns) and generates per-week stats.
   216|       */
   217|      async generateVelocityReport(boardFolder, weeks = 4) {
   218|        const result = await this.queryCards({});
   219|        const now = /* @__PURE__ */ new Date();
   220|        const todayStr = now.toISOString().slice(0, 10);
   221|        const completedCards = result.cards.filter((c) => {
   222|          if (c.completed)
   223|            return true;
   224|          const colLower = c.column.toLowerCase();
   225|          if (colLower.includes("done") || colLower.includes("completed"))
   226|            return true;
   227|          return false;
   228|        });
   229|        const weeklyCounts = /* @__PURE__ */ new Map();
   230|        for (const card of completedCards) {
   231|          let dateStr = card.completed;
   232|          if (!dateStr) {
   233|            dateStr = todayStr;
   234|          }
   235|          const d = /* @__PURE__ */ new Date(dateStr + "T00:00:00Z");
   236|          const isoWeek = this.getISOWeek(d);
   237|          weeklyCounts.set(isoWeek, (weeklyCounts.get(isoWeek) || 0) + 1);
   238|        }
   239|        const weekEntries = [];
   240|        const totalCount = completedCards.length;
   241|        const average = weeks > 0 ? totalCount / weeks : 0;
   242|        for (let i = weeks - 1; i >= 0; i--) {
   243|          const d = new Date(now);
   244|          d.setDate(d.getDate() - i * 7);
   245|          const isoWeek = this.getISOWeek(d);
   246|          const completed = weeklyCounts.get(isoWeek) || 0;
   247|          let trend = "\u2192";
   248|          if (i < weeks - 1) {
   249|            const prevDate = new Date(d);
   250|            prevDate.setDate(prevDate.getDate() - 7);
   251|            const prevWeek = this.getISOWeek(prevDate);
   252|            const prevCount = weeklyCounts.get(prevWeek) || 0;
   253|            if (completed > prevCount)
   254|              trend = "\u25B2";
   255|            else if (completed < prevCount)
   256|              trend = "\u25BC";
   257|            else
   258|              trend = "\u2192";
   259|          }
   260|          weekEntries.unshift({
   261|            week: isoWeek,
   262|            completed,
   263|            average: Math.round(average * 10) / 10,
   264|            trend
   265|          });
   266|        }
   267|        const currentWeekISO = this.getISOWeek(now);
   268|        const reportPath = `${boardFolder}/reports/velocity-${currentWeekISO}.md`;
   269|        const normalizedPath = (0, import_obsidian.normalizePath)(reportPath);
   270|        let content = `---
   271|kanban-plugin: board
   272|---
   273|
   274|# Velocity Report
   275|
   276|`;
   277|        content += `| Week | Completed | Average | Trend |
   278|`;
   279|        content += `|------|-----------|---------|-------|
   280|`;
   281|        for (const entry of weekEntries) {
   282|          content += `| ${entry.week} | ${entry.completed} | ${entry.average} | ${entry.trend} |
   283|`;
   284|        }
   285|        content += `
   286|**Total completed**: ${totalCount} over ${weeks} week(s)
   287|`;
   288|        content += `**Average per week**: ${Math.round(average * 10) / 10}
   289|`;
   290|        const folder = this.app.vault.getAbstractFileByPath((0, import_obsidian.normalizePath)(boardFolder));
   291|        let baseFolder = boardFolder;
   292|        if (folder instanceof import_obsidian.TFolder) {
   293|          baseFolder = folder.path;
   294|        }
   295|        const fullPath = (0, import_obsidian.normalizePath)(`${baseFolder}/reports/velocity-${currentWeekISO}.md`);
   296|        await this.app.vault.adapter.mkdir((0, import_obsidian.normalizePath)(`${baseFolder}/reports`));
   297|        const existingFile = this.app.vault.getAbstractFileByPath(fullPath);
   298|        if (existingFile instanceof import_obsidian.TFile) {
   299|          await this.app.vault.modify(existingFile, content);
   300|        } else {
   301|          await this.app.vault.create(fullPath, content);
   302|        }
   303|        return {
   304|          ok: true,
   305|          path: fullPath,
   306|          summary: {
   307|            weekEntries,
   308|            totalCompleted: totalCount,
   309|            averagePerWeek: Math.round(average * 10) / 10
   310|          }
   311|        };
   312|      }
   313|      /**
   314|       * Get ISO 8601 week string (e.g. "2025-W17") for a given date.
   315|       */
   316|      getISOWeek(date) {
   317|        const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
   318|        const dayNum = d.getUTCDay() || 7;
   319|        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
   320|        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
   321|        const weekNum = Math.ceil(((d.valueOf() - yearStart.valueOf()) / 864e5 + 1) / 7);
   322|        return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
   323|      }
   324|      // --- Private helpers ---
   325|      /**
   326|       * Process recurring cards — find Done cards with recur: field, re-create them in Backlog.
   327|       * Call this on a schedule (e.g. daily standup) to auto-refresh recurring tasks.
   328|       */
   329|      async processRecurring(body) {
   330|        const result = await this.queryCards({ boardId: body.boardId });
   331|        const today = /* @__PURE__ */ new Date();
   332|        const todayStr = today.toISOString().slice(0, 10);
   333|        const recreated = [];
   334|        for (const card of result.cards) {
   335|          if (!card.recur || !card.checked)
   336|            continue;
   337|          let shouldRecreate = false;
   338|          let nextDue;
   339|          if (card.recur === "daily") {
   340|            shouldRecreate = true;
   341|            nextDue = todayStr;
   342|          } else if (card.recur === "weekly") {
   343|            shouldRecreate = true;
   344|            const next = new Date(today);
   345|            next.setDate(next.getDate() + 7);
   346|            nextDue = next.toISOString().slice(0, 10);
   347|          } else if (card.recur === "monthly") {
   348|            shouldRecreate = true;
   349|            const next = new Date(today);
   350|            next.setMonth(next.getMonth() + 1);
   351|            nextDue = next.toISOString().slice(0, 10);
   352|          } else if (/^\d{4}-\d{2}-\d{2}$/.test(card.recur)) {
   353|            shouldRecreate = card.recur <= todayStr;
   354|            nextDue = card.recur;
   355|          }
   356|          if (shouldRecreate) {
   357|            await this.addCard({
   358|              boardId: card.boardId,
   359|              column: "Backlog",
   360|              title: card.title,
   361|              priority: card.priority,
   362|              tags: card.tags,
   363|              dueDate: nextDue,
   364|              recur: card.recur
   365|            });
   366|            recreated.push(card.title);
   367|          }
   368|        }
   369|        return { ok: true, recreated: recreated.length, cards: recreated };
   370|      }
   371|      /**
   372|       * Link two cards across boards. Adds a wikilink on the source card pointing to the target.
   373|       */
   374|      async linkCards(body) {
   375|        const [boardId, column, ...titleParts] = body.fromCardId.split("::");
   376|        const title = titleParts.join("::");
   377|        const file = this.app.vault.getAbstractFileByPath((0, import_obsidian.normalizePath)(boardId));
   378|        if (!(file instanceof import_obsidian.TFile))
   379|          return { ok: false, error: `Board not found: ${boardId}` };
   380|        const content = await this.app.vault.read(file);
   381|        const lines = content.split("\n");
   382|        let updated = false;
   383|        let inColumn = false;
   384|        for (let i = 0; i < lines.length; i++) {
   385|          if (lines[i].startsWith("## "))
   386|            inColumn = lines[i].slice(3).trim() === column;
   387|          if (inColumn && (lines[i].startsWith("- [ ]") || lines[i].startsWith("- [x]"))) {
   388|            if (this.extractTitleFromLine(lines[i]) === title) {
   389|              if (!lines[i].includes(`[[${body.toCardId}]]`)) {
   390|                lines[i] += ` | [[${body.toCardId}]]`;
   391|              }
   392|              updated = true;
   393|              break;
   394|            }
   395|          }
   396|        }
   397|        if (!updated)
   398|          return { ok: false, error: `Card "${title}" not found in "${column}"` };
   399|        await this.app.vault.modify(file, lines.join("\n"));
   400|        return { ok: true, message: `Linked "${body.fromCardId}" \u2192 "${body.toCardId}"` };
   401|      }
   402|      /**
   403|       * Get all linked cards for a given card ID.
   404|       */
   405|      async getCardLinks(cardId) {
   406|        const [boardId, column, ...titleParts] = cardId.split("::");
   407|        const title = titleParts.join("::");
   408|        const file = this.app.vault.getAbstractFileByPath((0, import_obsidian.normalizePath)(boardId));
   409|        if (!(file instanceof import_obsidian.TFile))
   410|          return { ok: false, error: `Board not found: ${boardId}` };
   411|        const content = await this.app.vault.read(file);
   412|        const lines = content.split("\n");
   413|        let inColumn = false;
   414|        for (const line of lines) {
   415|          if (line.startsWith("## "))
   416|            inColumn = line.slice(3).trim() === column;
   417|          if (inColumn && (line.startsWith("- [ ]") || line.startsWith("- [x]"))) {
   418|            if (this.extractTitleFromLine(line) === title) {
   419|              const links = [...line.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1]);
   420|              return { ok: true, links };
   421|            }
   422|          }
   423|        }
   424|        return { ok: false, error: `Card "${title}" not found` };
   425|      }
   426|      isKanbanBoard(content) {
   427|        return content.includes("## ") && (content.includes("- [ ]") || content.includes("- [x]") || content.includes("%% kanban"));
   428|      }
   429|      parseBoard(path, title, content) {
   430|        const lines = content.split("\n");
   431|        const columns = [];
   432|        const cards = [];
   433|        let currentColumn = "";
   434|        for (const line of lines) {
   435|          if (line.startsWith("## ") && !line.startsWith("%%")) {
   436|            currentColumn = line.slice(3).trim();
   437|            if (currentColumn && !columns.includes(currentColumn))
   438|              columns.push(currentColumn);
   439|          } else if (currentColumn && (line.startsWith("- [ ]") || line.startsWith("- [x]"))) {
   440|            cards.push(this.parseCardLine(line, currentColumn, path));
   441|          }
   442|        }
   443|        return { id: path, title, path, columns, cards };
   444|      }
   445|      parseCardLine(line, column, boardId) {
   446|        const checked = line.startsWith("- [x]");
   447|        const rest = line.replace(/^- \[.\] /, "");
   448|        const titleMatch = rest.match(/^([^|#@\[]+)/);
   449|        const title = titleMatch ? titleMatch[1].trim() : rest.trim();
   450|        const priorityMatch = rest.match(/#(high|medium|low)/i);
   451|        const priority = priorityMatch ? priorityMatch[1].toLowerCase() : void 0;
   452|        const dueDateMatch = rest.match(/due:(\d{4}-\d{2}-\d{2})/);
   453|        const dueDate = dueDateMatch ? dueDateMatch[1] : void 0;
   454|        const tagMatches = [...rest.matchAll(/@(\w+)/g)].map((m) => m[1]);
   455|        const blockedMatch = rest.match(/blocked:(.+?)(?:\||$)/);
   456|        const blocked = !!blockedMatch;
   457|        const blockerReason = blockedMatch ? blockedMatch[1].trim() : void 0;
   458|        const linkedMatches = [...rest.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1]);
   459|        const recurMatch = rest.match(/recur:(daily|weekly|monthly|\d{4}-\d{2}-\d{2})/i);
   460|        const recur = recurMatch ? recurMatch[1].toLowerCase() : void 0;
   461|        const completedMatch = rest.match(/completed:(\d{4}-\d{2}-\d{2})/i);
   462|        const completed = completedMatch ? completedMatch[1] : void 0;
   463|        return {
   464|          id: `${boardId}::${column}::${title}`,
   465|          title,
   466|          column,
   467|          boardId,
   468|          checked,
   469|          priority,
   470|          dueDate,
   471|          completed,
   472|          tags: tagMatches.length ? tagMatches : void 0,
   473|          blocked,
   474|          blockerReason,
   475|          linkedCards: linkedMatches.length ? linkedMatches : void 0,
   476|          recur
   477|        };
   478|      }
   479|      formatCardLine(card) {
   480|        var _a, _b;
   481|        let line = `- [ ] ${card.title}`;
   482|        if (card.checked)
   483|          line = `- [x] ${card.title}`;
   484|        if (card.priority)
   485|          line += ` | #${card.priority}`;
   486|        if (card.dueDate)
   487|          line += ` | due:${card.dueDate}`;
   488|        if (card.completed)
   489|          line += ` | completed:${card.completed}`;
   490|        if (card.recur)
   491|          line += ` | recur:${card.recur}`;
   492|        if ((_a = card.tags) == null ? void 0 : _a.length)
   493|          line += ` | ${card.tags.map((t) => `@${t}`).join(" ")}`;
   494|        if (card.blocked && card.blockerReason)
   495|          line += ` | blocked:${card.blockerReason}`;
   496|        if ((_b = card.linkedCards) == null ? void 0 : _b.length)
   497|          line += ` | ${card.linkedCards.map((l) => `[[${l}]]`).join(" ")}`;
   498|        return line;
   499|      }
   500|      extractTitleFromLine(line) {
   501|        const rest = line.replace(/^- \[.\] /, "");
   502|        const match = rest.match(/^([^|#@]+)/);
   503|        return match ? match[1].trim() : rest.trim();
   504|      }
   505|      insertCardIntoColumn(content, column, cardLine) {
   506|        const lines = content.split("\n");
   507|        let columnIdx = -1;
   508|        let insertIdx = -1;
   509|        for (let i = 0; i < lines.length; i++) {
   510|          if (lines[i].startsWith(`## ${column}`)) {
   511|            columnIdx = i;
   512|            continue;
   513|          }
   514|          if (columnIdx !== -1 && insertIdx === -1) {
   515|            if (lines[i].startsWith("## ") || lines[i].startsWith("%%")) {
   516|              insertIdx = i;
   517|              break;
   518|            }
   519|          }
   520|        }
   521|        if (columnIdx === -1) {
   522|          lines.push(``, `## ${column}`, cardLine, ``);
   523|        } else if (insertIdx === -1) {
   524|          lines.push(cardLine);
   525|        } else {
   526|          lines.splice(insertIdx, 0, cardLine);
   527|        }
   528|        return lines.join("\n");
   529|      }
   530|      buildBoardMarkdown(title, columns) {
   531|        const lines = [
   532|          `---`,
   533|          `kanban-plugin: board`,
   534|          `---`,
   535|          ``,
   536|          `# ${title}`,
   537|          ``
   538|        ];
   539|        for (const col of columns) {
   540|          lines.push(`## ${col}`, ``);
   541|        }
   542|        return lines.join("\n");
   543|      }
   544|      /**
   545|       * Archive done/completed cards older than the specified number of days.
   546|       * Moves them from the source board to an archive.md file.
   547|       */
   548|      async archiveCards(boardFolder, archiveFilePath, archiveDays) {
   549|        const today = /* @__PURE__ */ new Date();
   550|        const cutoffDate = new Date(today.getTime() - archiveDays * 864e5);
   551|        const cutoffStr = cutoffDate.toISOString().slice(0, 10);
   552|        const archiveDate = today.toISOString().slice(0, 10);
   553|        const normalizedArchivePath = (0, import_obsidian.normalizePath)(archiveFilePath);
   554|        const result = await this.queryCards({});
   555|        const doneCards = result.cards.filter((c) => {
   556|          const colLower = c.column.toLowerCase();
   557|          return colLower.includes("done") || colLower.includes("completed");
   558|        });
   559|        const toArchive = [];
   560|        for (const card of doneCards) {
   561|          let dateStr = card.completed;
   562|          if (!dateStr) {
   563|            dateStr = archiveDate;
   564|          }
   565|          if (dateStr < cutoffStr) {
   566|            toArchive.push(card);
   567|          }
   568|        }
   569|        if (toArchive.length === 0) {
   570|          return { ok: true, archived: 0, details: [] };
   571|        }
   572|        let existingContent = "";
   573|        const archiveFile = this.app.vault.getAbstractFileByPath(normalizedArchivePath);
   574|        if (archiveFile instanceof import_obsidian.TFile) {
   575|          existingContent = await this.app.vault.read(archiveFile);
   576|        }
   577|        const archiveEntries = this.buildArchiveEntries(toArchive, archiveDate);
   578|        let newContent;
   579|        if (existingContent && existingContent.trim()) {
   580|          if (existingContent.includes("</cards>")) {
   581|            const parts = existingContent.split("</cards>");
   582|            newContent = parts.slice(0, -1).join("</cards>") + archiveEntries + "</cards>";
   583|          } else {
   584|            newContent = existingContent.trimEnd() + "\n\n" + archiveEntries;
   585|          }
   586|        } else {
   587|          newContent = this.buildArchiveMarkdown(archiveEntries);
   588|        }
   589|        const archiveDir = normalizedArchivePath.substring(0, normalizedArchivePath.lastIndexOf("/"));
   590|        await this.app.vault.adapter.mkdir((0, import_obsidian.normalizePath)(archiveDir || ".")).catch(() => {
   591|        });
   592|        if (archiveFile instanceof import_obsidian.TFile) {
   593|          await this.app.vault.modify(archiveFile, newContent);
   594|        } else {
   595|          await this.app.vault.create(normalizedArchivePath, newContent);
   596|        }
   597|        const details = [];
   598|        for (const card of toArchive) {
   599|          const file = this.app.vault.getAbstractFileByPath((0, import_obsidian.normalizePath)(card.boardId));
   600|          if (!(file instanceof import_obsidian.TFile))
   601|            continue;
   602|          const content = await this.app.vault.read(file);
   603|          const lines = content.split("\n");
   604|          let inColumn = false;
   605|          let found = false;
   606|          for (let i = 0; i < lines.length; i++) {
   607|            if (lines[i].startsWith("## ")) {
   608|              inColumn = lines[i].slice(3).trim() === card.column;
   609|            }
   610|            if (inColumn && (lines[i].startsWith("- [ ]") || lines[i].startsWith("- [x]"))) {
   611|              if (this.extractTitleFromLine(lines[i]) === card.title) {
   612|                lines.splice(i, 1);
   613|                found = true;
   614|                details.push(`Archived "${card.title}" from "${card.boardId}"`);
   615|                break;
   616|              }
   617|            }
   618|          }
   619|          if (found) {
   620|            await this.app.vault.modify(file, lines.join("\n"));
   621|          }
   622|        }
   623|        return { ok: true, archived: toArchive.length, details };
   624|      }
   625|      /**
   626|       * Build archive entries as Markdown sections, grouped by board.
   627|       */
   628|      buildArchiveEntries(cards, archiveDate) {
   629|        var _a, _b;
   630|        const grouped = /* @__PURE__ */ new Map();
   631|        for (const card of cards) {
   632|          const boardName = ((_a = card.boardId.split("/").pop()) == null ? void 0 : _a.replace(".md", "")) || card.boardId;
   633|          if (!grouped.has(boardName))
   634|            grouped.set(boardName, []);
   635|          grouped.get(boardName).push(card);
   636|        }
   637|        let entries = "";
   638|        for (const [boardName, boardCards] of grouped) {
   639|          entries += `
   640|## Board: ${boardName}
   641|
   642|`;
   643|          for (const card of boardCards) {
   644|            entries += `### \u2705 ${card.title}
   645|`;
   646|            if (card.completed)
   647|              entries += `- completed: ${card.completed}
   648|`;
   649|            if (card.priority)
   650|              entries += `- #${card.priority}
   651|`;
   652|            if ((_b = card.tags) == null ? void 0 : _b.length)
   653|              entries += `- ${card.tags.map((t) => `@${t}`).join(" ")}
   654|`;
   655|            entries += `</cards>
   656|
   657|`;
   658|          }
   659|        }
   660|        return entries;
   661|      }
   662|      /**
   663|       * Build the full archive.md content with frontmatter.
   664|       */
   665|      buildArchiveMarkdown(entries) {
   666|        const archiveDate = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
   667|        return `---
   668|kanban-plugin: archived
   669|---
   670|
   671|# Archived Cards
   672|Archive date: ${archiveDate}
   673|${entries}`;
   674|      }
   675|    };
   676|  }
   677|});
   678|
   679|// src/main.ts
   680|var main_exports = {};
   681|__export(main_exports, {
   682|  PLUGIN_VERSION: () => PLUGIN_VERSION,
   683|  default: () => HermesKanbanPlugin
   684|});
   685|module.exports = __toCommonJS(main_exports);
   686|var import_obsidian5 = require("obsidian");
   687|
   688|// src/settings.ts
   689|var DEFAULT_SETTINGS = {
   690|  port: 27124,
   691|  boardFolder: "Kanban",
   692|  trustMode: "confirm",
   693|  enabled: true,
   694|  mcpEnabled: false,
   695|  notificationInterval: 15,
   696|  githubToken: "",
   697|  githubOwner: "",
   698|  githubRepo: "",
   699|  githubProjectId: 0,
   700|  syncIssues: "off",
   701|  syncProjects: "off",
   702|  archiveEnabled: false,
   703|  archiveDays: 30,
   704|  archiveFilePath: "Kanban/archive.md"
   705|};
   706|
   707|// src/server.ts
   708|var http = __toESM(require("http"));
   709|var import_obsidian3 = require("obsidian");
   710|init_kanban_parser();
   711|
   712|// src/notification.ts
   713|var import_obsidian2 = require("obsidian");
   714|async function checkDueDateNotifications(app, settings, parser, notifiedIds) {
   715|  var _a;
   716|  const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
   717|  const queryResult = await parser.queryCards({ overdue: true });
   718|  const overdue = queryResult.cards;
   719|  const notifiedCardIds = [];
   720|  for (const card of overdue) {
   721|    if (notifiedIds.has(card.id))
   722|      continue;
   723|    notifiedIds.add(card.id);
   724|    notifiedCardIds.push(card.id);
   725|    const boardName = ((_a = card.boardId.split("/").pop()) == null ? void 0 : _a.replace(".md", "")) || card.boardId;
   726|    new import_obsidian2.Notice(`Card "${card.title}" in board "${boardName}" is overdue`);
   727|  }
   728|  const overdueWithBoard = overdue.map((c) => {
   729|    var _a2;
   730|    return {
   731|      cardId: c.id,
   732|      title: c.title,
   733|      dueDate: c.dueDate,
   734|      board: ((_a2 = c.boardId.split("/").pop()) == null ? void 0 : _a2.replace(".md", "")) || c.boardId
   735|    };
   736|  });
   737|  const result = {
   738|    overdue: overdueWithBoard,
   739|    notified: notifiedCardIds
   740|  };
   741|  if (settings.archiveEnabled) {
   742|    try {
   743|      const archiveResult = await parser.archiveCards(
   744|        settings.boardFolder,
   745|        settings.archiveFilePath,
   746|        settings.archiveDays
   747|      );
   748|      if (archiveResult.archived > 0) {
   749|        result.archived = { archived: archiveResult.archived, details: archiveResult.details };
   750|      }
   751|    } catch (err) {
   752|      console.error("Error during auto-archive:", err);
   753|    }
   754|  }
   755|  return result;
   756|}
   757|function startNotificationScheduler(app, settings, parser, notifiedIds) {
   758|  checkDueDateNotifications(app, settings, parser, notifiedIds).catch((err) => {
   759|    console.error("Error checking due date notifications:", err);
   760|  });
   761|  if (settings.notificationInterval > 0) {
   762|    const intervalMs = settings.notificationInterval * 60 * 1e3;
   763|    const intervalId = setInterval(() => {
   764|      checkDueDateNotifications(app, settings, parser, notifiedIds).catch((err) => {
   765|        console.error("Error checking due date notifications:", err);
   766|      });
   767|    }, intervalMs);
   768|    return () => clearInterval(intervalId);
   769|  }
   770|  return () => {
   771|  };
   772|}
   773|
   774|// src/templates.ts
   775|var BOARD_TEMPLATES = [
   776|  {
   777|    name: "sprint",
   778|    columns: ["Backlog", "To Do", "In Progress", "Review", "Done", "Blocked"]
   779|  },
   780|  {
   781|    name: "bug-triage",
   782|    columns: ["Reported", "Triage", "In Progress", "Testing", "Released"]
   783|  },
   784|  {
   785|    name: "release",
   786|    columns: ["Backlog", "In Progress", "Staged", "Deployed", "Verified"]
   787|  },
   788|  {
   789|    name: "personal",
   790|    columns: ["Ideas", "To Do", "In Progress", "Done"]
   791|  }
   792|];
   793|function getTemplate(name) {
   794|  return BOARD_TEMPLATES.find((t) => t.name === name);
   795|}
   796|
   797|// src/server.ts
   798|var KanbanServer = class {
   799|  constructor(app, settings) {
   800|    this.server = null;
   801|    this.notifiedIds = /* @__PURE__ */ new Set();
   802|    this.stopNotifications = () => {
   803|    };
   804|    this.app = app;
   805|    this.settings = settings;
   806|    this.parser = new KanbanParser(app);
   807|  }
   808|  start() {
   809|    if (this.server)
   810|      this.stop();
   811|    this.server = http.createServer(async (req, res) => {
   812|      res.setHeader("Content-Type", "application/json");
   813|      res.setHeader("Access-Control-Allow-Origin", "*");
   814|      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
   815|      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
   816|      if (req.method === "OPTIONS") {
   817|        res.writeHead(204);
   818|        res.end();
   819|        return;
   820|      }
   821|      const url = new URL(req.url || "/", `http://localhost:${this.settings.port}`);
   822|      const body = await this.readBody(req);
   823|      try {
   824|        const result = await this.route(req.method || "GET", url.pathname, url.searchParams, body);
   825|        res.writeHead(200);
   826|        res.end(JSON.stringify(result));
   827|      } catch (err) {
   828|        const status = err.status || 500;
   829|        res.writeHead(status);
   830|        res.end(JSON.stringify({ ok: false, error: err.message || "Internal server error" }));
   831|      }
   832|    });
   833|    this.server.listen(this.settings.port, "0.0.0.0", () => {
   834|      console.log(`Hermes Kanban Bridge listening on port ${this.settings.port}`);
   835|      new import_obsidian3.Notice(`Hermes Kanban Bridge started on port ${this.settings.port}`);
   836|    });
   837|    this.stopNotifications = startNotificationScheduler(
   838|      this.app,
   839|      this.settings,
   840|      this.parser,
   841|      this.notifiedIds
   842|    );
   843|    this.server.on("error", (err) => {
   844|      if (err.code === "EADDRINUSE") {
   845|        new import_obsidian3.Notice(`Hermes Kanban Bridge: port ${this.settings.port} already in use. Change port in settings.`);
   846|      }
   847|      console.error("Hermes Kanban Bridge server error:", err);
   848|    });
   849|  }
   850|  stop() {
   851|    if (this.server) {
   852|      this.server.close();
   853|      this.server = null;
   854|      this.stopNotifications();
   855|      console.log("Hermes Kanban Bridge stopped");
   856|    }
   857|  }
   858|  async readBody(req) {
   859|    return new Promise((resolve) => {
   860|      let body = "";
   861|      req.on("data", (chunk) => body += chunk);
   862|      req.on("end", () => {
   863|        try {
   864|          resolve(body ? JSON.parse(body) : {});
   865|        } catch (e) {
   866|          resolve({});
   867|        }
   868|      });
   869|    });
   870|  }
   871|  async route(method, path, params, body) {
   872|    if (method === "GET" && path === "/health") {
   873|      return { ok: true, status: "running", port: this.settings.port, version: PLUGIN_VERSION };
   874|    }
   875|    if (method === "GET" && path === "/boards") {
   876|      return await this.parser.listBoards(this.settings.boardFolder);
   877|    }
   878|    if (method === "GET" && path.startsWith("/boards/")) {
   879|      const boardId = decodeURIComponent(path.slice("/boards/".length));
   880|      return await this.parser.getBoard(boardId);
   881|    }
   882|    if (method === "POST" && path === "/boards") {
   883|      return await this.parser.createBoard(body, this.settings.boardFolder);
   884|    }
   885|    if (method === "POST" && path === "/cards/move") {
   886|      return await this.parser.moveCard(body);
   887|    }
   888|    if (method === "POST" && path === "/cards") {
   889|      return await this.parser.addCard(body);
   890|    }
   891|    if (method === "PUT" && path.startsWith("/cards/")) {
   892|      const cardId = decodeURIComponent(path.slice("/cards/".length));
   893|      return await this.parser.updateCard(cardId, body);
   894|    }
   895|    if (method === "GET" && path === "/query") {
   896|      return await this.parser.queryCards({
   897|        boardId: params.get("boardId") || void 0,
   898|        column: params.get("column") || void 0,
   899|        tag: params.get("tag") || void 0,
   900|        blocked: params.get("blocked") === "true" ? true : void 0,
   901|        overdue: params.get("overdue") === "true" ? true : void 0
   902|      });
   903|    }
   904|    if (method === "POST" && path === "/cards/link") {
   905|      return await this.parser.linkCards(body);
   906|    }
   907|    if (method === "GET" && path === "/cards/links") {
   908|      const cardId = params.get("cardId");
   909|      if (!cardId) {
   910|        const e = new Error("cardId query param required");
   911|        e.status = 400;
   912|        throw e;
   913|      }
   914|      return await this.parser.getCardLinks(decodeURIComponent(cardId));
   915|    }
   916|    if (method === "POST" && path === "/cards/process-recurring") {
   917|      return await this.parser.processRecurring(body);
   918|    }
   919|    if (method === "POST" && path === "/ritual/standup") {
   920|      return await this.parser.generateStandup(body);
   921|    }
   922|    if (method === "POST" && path === "/ritual/review") {
   923|      return await this.parser.generateReview(body);
   924|    }
   925|    if (method === "GET" && path === "/notify/due") {
   926|      const result = await checkDueDateNotifications(
   927|        this.app,
   928|        this.settings,
   929|        this.parser,
   930|        this.notifiedIds
   931|      );
   932|      return { ok: true, ...result };
   933|    }
   934|    if (method === "GET" && path === "/report/velocity") {
   935|      const weeks = parseInt(params.get("weeks") || "4", 10);
   936|      return await this.parser.generateVelocityReport(this.settings.boardFolder, weeks);
   937|    }
   938|    if (method === "POST" && path === "/ritual/velocity") {
   939|      const weeks = (body == null ? void 0 : body.weeks) ? parseInt(String(body.weeks), 10) : 4;
   940|      return await this.parser.generateVelocityReport(this.settings.boardFolder, weeks);
   941|    }
   942|    const err = new Error(`Not found: ${method} ${path}`);
   943|    err.status = 404;
   944|    throw err;
   945|    if (method === "POST" && path === "/cards/archive") {
   946|      if (!this.settings.archiveEnabled) {
   947|        const e = new Error("Card archival is not enabled. Enable archiveEnabled in settings.");
   948|        e.status = 400;
   949|        throw e;
   950|      }
   951|      return await this.parser.archiveCards(
   952|        this.settings.boardFolder,
   953|        this.settings.archiveFilePath,
   954|        this.settings.archiveDays
   955|      );
   956|    }
   957|    if (method === "POST" && path === "/templates") {
   958|      return await this.createBoardFromTemplate(body);
   959|    }
   960|  }
   961|  /**
   962|   * Create a board from a preset template.
   963|   * Body: { template: string, boardTitle: string }
   964|   */
   965|  async createBoardFromTemplate(body) {
   966|    if (!body.template || !body.boardTitle) {
   967|      const e = new Error('Body requires "template" (template name) and "boardTitle"');
   968|      e.status = 400;
   969|      throw e;
   970|    }
   971|    const template = getTemplate(body.template);
   972|    if (!template) {
   973|      const e = new Error(`Template "${body.template}" not found. Available: ${["sprint", "bug-triage", "release", "personal"].join(", ")}`);
   974|      e.status = 404;
   975|      throw e;
   976|    }
   977|    await this.parser.createBoard({ title: body.boardTitle, columns: template.columns }, this.settings.boardFolder);
   978|    return { ok: true, path: `${this.settings.boardFolder}/${body.boardTitle}.md` };
   979|  }
   980|};
   981|
   982|// src/mcp-adapter.ts
   983|var import_obsidian4 = require("obsidian");
   984|var http2 = __toESM(require("http"));
   985|var McpAdapter = class {
   986|  constructor(app, settings, parser) {
   987|    this.server = null;
   988|    this.app = app;
   989|    this.settings = settings;
   990|    this.parser = parser;
   991|  }
   992|  get port() {
   993|    return this.settings.port + 1;
   994|  }
   995|  start() {
   996|    if (this.server)
   997|      this.stop();
   998|    this.server = http2.createServer(async (req, res) => {
   999|      res.setHeader("Access-Control-Allow-Origin", "*");
  1000|      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  1001|      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  1002|      if (req.method === "OPTIONS") {
  1003|        res.writeHead(204);
  1004|        res.end();
  1005|        return;
  1006|      }
  1007|      const url = new URL(req.url || "/", `http://localhost:${this.port}`);
  1008|      const body = await this.readBody(req);
  1009|      try {
  1010|        const result = await this.handleMcp(req.method || "GET", url.pathname, body);
  1011|        res.setHeader("Content-Type", "application/json");
  1012|        res.writeHead(200);
  1013|        res.end(JSON.stringify(result));
  1014|      } catch (err) {
  1015|        res.setHeader("Content-Type", "application/json");
  1016|        res.writeHead(err.status || 500);
  1017|        res.end(JSON.stringify({ error: { code: -32603, message: err.message } }));
  1018|      }
  1019|    });
  1020|    this.server.listen(this.port, "0.0.0.0", () => {
  1021|      console.log(`Hermes Kanban MCP adapter listening on port ${this.port}`);
  1022|      new import_obsidian4.Notice(`Hermes Kanban MCP ready on port ${this.port}`);
  1023|    });
  1024|  }
  1025|  stop() {
  1026|    if (this.server) {
  1027|      this.server.close();
  1028|      this.server = null;
  1029|    }
  1030|  }
  1031|  async handleMcp(method, path, body) {
  1032|    if (path === "/mcp" && method === "POST" && (body == null ? void 0 : body.method) === "initialize") {
  1033|      return {
  1034|        jsonrpc: "2.0",
  1035|        id: body.id,
  1036|        result: {
  1037|          protocolVersion: "2024-11-05",
  1038|          capabilities: { tools: {} },
  1039|          serverInfo: { name: "hermes-kanban-bridge", version: "1.8.0" }
  1040|        }
  1041|      };
  1042|    }
  1043|    if (path === "/mcp" && method === "POST" && (body == null ? void 0 : body.method) === "tools/list") {
  1044|      return {
  1045|        jsonrpc: "2.0",
  1046|        id: body.id,
  1047|        result: { tools: this.getTools() }
  1048|      };
  1049|    }
  1050|    if (path === "/mcp" && method === "POST" && (body == null ? void 0 : body.method) === "tools/call") {
  1051|      const { name, arguments: args } = body.params;
  1052|      const result = await this.callTool(name, args || {});
  1053|      return {
  1054|        jsonrpc: "2.0",
  1055|        id: body.id,
  1056|        result: {
  1057|          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
  1058|          isError: !result.ok
  1059|        }
  1060|      };
  1061|    }
  1062|    if (path === "/mcp/health" && method === "GET") {
  1063|      return { ok: true, transport: "http", port: this.port, tools: this.getTools().length };
  1064|    }
  1065|    const err = new Error(`Unknown MCP path: ${method} ${path}`);
  1066|    err.status = 404;
  1067|    throw err;
  1068|  }
  1069|  async callTool(name, args) {
  1070|    switch (name) {
  1071|      case "kanban_health":
  1072|        return { ok: true, status: "running", port: this.settings.port, version: "1.8.0" };
  1073|      case "kanban_list_boards":
  1074|        return await this.parser.listBoards(this.settings.boardFolder);
  1075|      case "kanban_get_board":
  1076|        return await this.parser.getBoard(args.boardId);
  1077|      case "kanban_create_board":
  1078|        return await this.parser.createBoard(args, this.settings.boardFolder);
  1079|      case "kanban_add_card":
  1080|        return await this.parser.addCard(args);
  1081|      case "kanban_move_card":
  1082|        return await this.parser.moveCard(args);
  1083|      case "kanban_update_card":
  1084|        return await this.parser.updateCard(args.cardId, args);
  1085|      case "kanban_query":
  1086|        return await this.parser.queryCards(args);
  1087|      case "kanban_standup":
  1088|        return await this.parser.generateStandup(args);
  1089|      case "kanban_review":
  1090|        return await this.parser.generateReview(args);
  1091|      default:
  1092|        return { ok: false, error: `Unknown tool: ${name}` };
  1093|    }
  1094|  }
  1095|  getTools() {
  1096|    return [
  1097|      {
  1098|        name: "kanban_health",
  1099|        description: "Check if the Hermes Kanban Bridge plugin is running",
  1100|        inputSchema: { type: "object", properties: {} }
  1101|      },
  1102|      {
  1103|        name: "kanban_list_boards",
  1104|        description: "List all Kanban boards in the vault",
  1105|        inputSchema: { type: "object", properties: {} }
  1106|      },
  1107|      {
  1108|        name: "kanban_get_board",
  1109|        description: "Get full board state including all columns and cards",
  1110|        inputSchema: {
  1111|          type: "object",
  1112|          properties: { boardId: { type: "string", description: "Board file path (e.g. Kanban/MyProject.md)" } },
  1113|          required: ["boardId"]
  1114|        }
  1115|      },
  1116|      {
  1117|        name: "kanban_create_board",
  1118|        description: "Create a new Kanban board with custom columns",
  1119|        inputSchema: {
  1120|          type: "object",
  1121|          properties: {
  1122|            title: { type: "string", description: "Board title" },
  1123|            columns: { type: "array", items: { type: "string" }, description: "Column names (default: Backlog, To Do, In Progress, Review, Done)" }
  1124|          },
  1125|          required: ["title"]
  1126|        }
  1127|      },
  1128|      {
  1129|        name: "kanban_add_card",
  1130|        description: "Add a new card to a Kanban board column",
  1131|        inputSchema: {
  1132|          type: "object",
  1133|          properties: {
  1134|            boardId: { type: "string", description: "Board file path" },
  1135|            column: { type: "string", description: "Target column name" },
  1136|            title: { type: "string", description: "Card title (verb phrase recommended)" },
  1137|            priority: { type: "string", enum: ["high", "medium", "low"] },
  1138|            dueDate: { type: "string", description: "ISO date YYYY-MM-DD" },
  1139|            tags: { type: "array", items: { type: "string" } },
  1140|            blocked: { type: "boolean" },
  1141|            blockerReason: { type: "string" }
  1142|          },
  1143|          required: ["boardId", "column", "title"]
  1144|        }
  1145|      },
  1146|      {
  1147|        name: "kanban_move_card",
  1148|        description: "Move a card from one column to another",
  1149|        inputSchema: {
  1150|          type: "object",
  1151|          properties: {
  1152|            cardId: { type: "string", description: "Card ID: boardPath::column::title" },
  1153|            toColumn: { type: "string", description: "Destination column name" }
  1154|          },
  1155|          required: ["cardId", "toColumn"]
  1156|        }
  1157|      },
  1158|      {
  1159|        name: "kanban_update_card",
  1160|        description: "Update card metadata (priority, due date, tags, blocked status)",
  1161|        inputSchema: {
  1162|          type: "object",
  1163|          properties: {
  1164|            cardId: { type: "string", description: "Card ID: boardPath::column::title" },
  1165|            priority: { type: "string", enum: ["high", "medium", "low"] },
  1166|            dueDate: { type: "string" },
  1167|            tags: { type: "array", items: { type: "string" } },
  1168|            blocked: { type: "boolean" },
  1169|            blockerReason: { type: "string" }
  1170|          },
  1171|          required: ["cardId"]
  1172|        }
  1173|      },
  1174|      {
  1175|        name: "kanban_query",
  1176|        description: "Query cards across boards with filters",
  1177|        inputSchema: {
  1178|          type: "object",
  1179|          properties: {
  1180|            boardId: { type: "string", description: "Filter to specific board (optional)" },
  1181|            column: { type: "string" },
  1182|            tag: { type: "string" },
  1183|            blocked: { type: "boolean" },
  1184|            overdue: { type: "boolean" }
  1185|          }
  1186|        }
  1187|      },
  1188|      {
  1189|        name: "kanban_standup",
  1190|        description: "Generate a daily standup summary \u2014 in progress, blocked, and overdue cards",
  1191|        inputSchema: {
  1192|          type: "object",
  1193|          properties: { boardId: { type: "string", description: "Specific board (optional, omit for all boards)" } }
  1194|        }
  1195|      },
  1196|      {
  1197|        name: "kanban_review",
  1198|        description: "Generate a weekly review report \u2014 completed, carry-over, velocity",
  1199|        inputSchema: {
  1200|          type: "object",
  1201|          properties: { boardId: { type: "string", description: "Specific board (optional, omit for all boards)" } }
  1202|        }
  1203|      }
  1204|    ];
  1205|  }
  1206|  async readBody(req) {
  1207|    return new Promise((resolve) => {
  1208|      let body = "";
  1209|      req.on("data", (chunk) => body += chunk);
  1210|      req.on("end", () => {
  1211|        try {
  1212|          resolve(body ? JSON.parse(body) : {});
  1213|        } catch (e) {
  1214|          resolve({});
  1215|        }
  1216|      });
  1217|    });
  1218|  }
  1219|};
  1220|
  1221|// src/main.ts
  1222|var PLUGIN_VERSION = "1.8.0";
  1223|var HermesKanbanPlugin = class extends import_obsidian5.Plugin {
  1224|  constructor() {
  1225|    super(...arguments);
  1226|    this.settings = DEFAULT_SETTINGS;
  1227|    this.server = null;
  1228|    this.mcpAdapter = null;
  1229|  }
  1230|  async onload() {
  1231|    await this.loadSettings();
  1232|    this.server = new KanbanServer(this.app, this.settings);
  1233|    if (this.settings.enabled) {
  1234|      this.server.start();
  1235|    }
  1236|    if (this.settings.mcpEnabled && this.server) {
  1237|      const { KanbanParser: KanbanParser2 } = await Promise.resolve().then(() => (init_kanban_parser(), kanban_parser_exports));
  1238|      const parser = new KanbanParser2(this.app);
  1239|      this.mcpAdapter = new McpAdapter(this.app, this.settings, parser);
  1240|      this.mcpAdapter.start();
  1241|    }
  1242|    this.addSettingTab(new HermesKanbanSettingTab(this.app, this));
  1243|    this.addCommand({
  1244|      id: "toggle-server",
  1245|      name: "Toggle Hermes Kanban Bridge server",
  1246|      callback: () => {
  1247|        if (this.server) {
  1248|          this.settings.enabled = !this.settings.enabled;
  1249|          this.settings.enabled ? this.server.start() : this.server.stop();
  1250|          this.saveSettings();
  1251|        }
  1252|      }
  1253|    });
  1254|    this.addCommand({
  1255|      id: "toggle-mcp",
  1256|      name: "Toggle Hermes Kanban MCP adapter",
  1257|      callback: async () => {
  1258|        var _a;
  1259|        this.settings.mcpEnabled = !this.settings.mcpEnabled;
  1260|        if (this.settings.mcpEnabled) {
  1261|          const { KanbanParser: KanbanParser2 } = await Promise.resolve().then(() => (init_kanban_parser(), kanban_parser_exports));
  1262|          const parser = new KanbanParser2(this.app);
  1263|          this.mcpAdapter = new McpAdapter(this.app, this.settings, parser);
  1264|          this.mcpAdapter.start();
  1265|        } else {
  1266|          (_a = this.mcpAdapter) == null ? void 0 : _a.stop();
  1267|          this.mcpAdapter = null;
  1268|        }
  1269|        this.saveSettings();
  1270|      }
  1271|    });
  1272|    this.addCommand({
  1273|      id: "brat-check-update",
  1274|      name: "Check for BRAT Updates",
  1275|      callback: async () => {
  1276|        const releaseUrl = "https://github.com/GumbyEnder/hermes-kanban/releases";
  1277|        await navigator.clipboard.writeText(releaseUrl);
  1278|        new import_obsidian5.Notice("Hermes Kanban Bridge: Release URL copied to clipboard. Check BRAT for updates on GitHub Releases.");
  1279|      }
  1280|    });
  1281|    console.log("Hermes Kanban Bridge loaded");
  1282|  }
  1283|  onunload() {
  1284|    var _a, _b;
  1285|    (_a = this.server) == null ? void 0 : _a.stop();
  1286|    (_b = this.mcpAdapter) == null ? void 0 : _b.stop();
  1287|    console.log("Hermes Kanban Bridge unloaded");
  1288|  }
  1289|  async loadSettings() {
  1290|    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  1291|  }
  1292|  async saveSettings() {
  1293|    await this.saveData(this.settings);
  1294|  }
  1295|};
  1296|var HermesKanbanSettingTab = class extends import_obsidian5.PluginSettingTab {
  1297|  constructor(app, plugin) {
  1298|    super(app, plugin);
  1299|    this.plugin = plugin;
  1300|  }
  1301|  display() {
  1302|    const { containerEl } = this;
  1303|    containerEl.empty();
  1304|    containerEl.createEl("h2", { text: "Hermes Kanban Bridge Settings" });
  1305|    new import_obsidian5.Setting(containerEl).setName("Port").setDesc("Local port for the REST API (default: 27124)").addText((text) => text.setPlaceholder("27124").setValue(String(this.plugin.settings.port)).onChange(async (value) => {
  1306|      const port = parseInt(value);
  1307|      if (!isNaN(port) && port > 1024 && port < 65535) {
  1308|        this.plugin.settings.port = port;
  1309|        await this.plugin.saveSettings();
  1310|      }
  1311|    }));
  1312|    new import_obsidian5.Setting(containerEl).setName("Board folder").setDesc("Vault folder where Kanban boards are stored").addText((text) => text.setPlaceholder("Kanban").setValue(this.plugin.settings.boardFolder).onChange(async (value) => {
  1313|      this.plugin.settings.boardFolder = value;
  1314|      await this.plugin.saveSettings();
  1315|    }));
  1316|    new import_obsidian5.Setting(containerEl).setName("Trust mode").setDesc("Confirm: show approval modal. Auto: allow writes without prompting.").addDropdown((drop) => drop.addOption("confirm", "Confirm (ask before writing)").addOption("auto", "Auto-trust (no prompts)").setValue(this.plugin.settings.trustMode).onChange(async (value) => {
  1317|      this.plugin.settings.trustMode = value;
  1318|      await this.plugin.saveSettings();
  1319|    }));
  1320|    new import_obsidian5.Setting(containerEl).setName("Enable server").setDesc("Start the REST API server when Obsidian loads").addToggle((toggle) => toggle.setValue(this.plugin.settings.enabled).onChange(async (value) => {
  1321|      var _a, _b;
  1322|      this.plugin.settings.enabled = value;
  1323|      await this.plugin.saveSettings();
  1324|      value ? (_a = this.plugin.server) == null ? void 0 : _a.start() : (_b = this.plugin.server) == null ? void 0 : _b.stop();
  1325|    }));
  1326|    new import_obsidian5.Setting(containerEl).setName("Due date notification interval").setDesc("Check for overdue cards every N minutes (0 = disabled). Shows an Obsidian notice for each overdue card.").addText((text) => text.setPlaceholder("15").setValue(String(this.plugin.settings.notificationInterval)).onChange(async (value) => {
  1327|      const minutes = parseInt(value);
  1328|      if (!isNaN(minutes) && minutes >= 0) {
  1329|        this.plugin.settings.notificationInterval = minutes;
  1330|        await this.plugin.saveSettings();
  1331|      }
  1332|    }));
  1333|    new import_obsidian5.Setting(containerEl).setName("Enable MCP adapter").setDesc("Expose Kanban tools via MCP on port " + (this.plugin.settings.port + 1) + " (Claude Desktop, Cursor, Zed, etc.)").addToggle((toggle) => toggle.setValue(this.plugin.settings.mcpEnabled).onChange(async (value) => {
  1334|      var _a;
  1335|      this.plugin.settings.mcpEnabled = value;
  1336|      await this.plugin.saveSettings();
  1337|      if (value) {
  1338|        Promise.resolve().then(() => (init_kanban_parser(), kanban_parser_exports)).then(({ KanbanParser: KanbanParser2 }) => {
  1339|          var _a2;
  1340|          const parser = new KanbanParser2(this.plugin.app);
  1341|          this.plugin.mcpAdapter = new McpAdapter(this.plugin.app, this.plugin.settings, parser);
  1342|          (_a2 = this.plugin.mcpAdapter) == null ? void 0 : _a2.start();
  1343|        });
  1344|      } else {
  1345|        (_a = this.plugin.mcpAdapter) == null ? void 0 : _a.stop();
  1346|        this.plugin.mcpAdapter = null;
  1347|      }
  1348|    }));
  1349|    containerEl.createEl("hr");
  1350|    containerEl.createEl("h3", { text: "GitHub Integration" });
  1351|    new import_obsidian5.Setting(containerEl).setName("GitHub Token").setDesc("Personal access token with repo access. Stored locally only.").addText((text) => {
  1352|      text.inputEl.type = "password";
  1353|      text.setValue(this.plugin.settings.githubToken).onChange(async (value) => {
  1354|        this.plugin.settings.githubToken = value;
  1355|        await this.plugin.saveSettings();
  1356|      });
  1357|    });
  1358|    new import_obsidian5.Setting(containerEl).setName("GitHub Owner").setDesc("Your GitHub username or organization name.").addText((text) => text.setPlaceholder("Username or org").setValue(this.plugin.settings.githubOwner).onChange(async (value) => {
  1359|      this.plugin.settings.githubOwner = value;
  1360|      await this.plugin.saveSettings();
  1361|    }));
  1362|    new import_obsidian5.Setting(containerEl).setName("GitHub Repo").setDesc("The repository name to sync issues with.").addText((text) => text.setPlaceholder("repo-name").setValue(this.plugin.settings.githubRepo).onChange(async (value) => {
  1363|      this.plugin.settings.githubRepo = value;
  1364|      await this.plugin.saveSettings();
  1365|    }));
  1366|    new import_obsidian5.Setting(containerEl).setName("GitHub Project ID").setDesc("Numeric ID of the GitHub Projects board for card sync.").addText((text) => text.setPlaceholder("0").setValue(String(this.plugin.settings.githubProjectId)).onChange(async (value) => {
  1367|      const id = parseInt(value);
  1368|      this.plugin.settings.githubProjectId = isNaN(id) ? 0 : id;
  1369|      await this.plugin.saveSettings();
  1370|    }));
  1371|    new import_obsidian5.Setting(containerEl).setName("Sync Issues").setDesc("How to sync Kanban cards with GitHub Issues.").addDropdown((drop) => drop.addOption("off", "Off (no sync)").addOption("push", "Push only (Kanban to GitHub)").addOption("pull", "Pull only (GitHub to Kanban)").addOption("bidirectional", "Bidirectional").setValue(this.plugin.settings.syncIssues).onChange(async (value) => {
  1372|      this.plugin.settings.syncIssues = value;
  1373|      await this.plugin.saveSettings();
  1374|    }));
  1375|    new import_obsidian5.Setting(containerEl).setName("Sync Projects").setDesc("How to sync Kanban cards with GitHub Projects board.").addDropdown((drop) => drop.addOption("off", "Off (no sync)").addOption("push", "Push only (Kanban to GitHub)").addOption("pull", "Pull only (GitHub to Kanban)").addOption("bidirectional", "Bidirectional").setValue(this.plugin.settings.syncProjects).onChange(async (value) => {
  1376|      this.plugin.settings.syncProjects = value;
  1377|      await this.plugin.saveSettings();
  1378|    }));
  1379|  }
  1380|};
  1381|