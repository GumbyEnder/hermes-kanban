export interface BoardTemplate {
  name: string;
  columns: string[];
}

export const BOARD_TEMPLATES: BoardTemplate[] = [
  {
    name: 'sprint',
    columns: ['Backlog', 'To Do', 'In Progress', 'Review', 'Done', 'Blocked'],
  },
  {
    name: 'bug-triage',
    columns: ['Reported', 'Triage', 'In Progress', 'Testing', 'Released'],
  },
  {
    name: 'release',
    columns: ['Backlog', 'In Progress', 'Staged', 'Deployed', 'Verified'],
  },
  {
    name: 'personal',
    columns: ['Ideas', 'To Do', 'In Progress', 'Done'],
  },
];

export function getTemplate(name: string): BoardTemplate | undefined {
  return BOARD_TEMPLATES.find(t => t.name === name);
}

export function buildBoardMarkdown(title: string, columns: string[]): string {
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
