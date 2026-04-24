export interface HermesKanbanSettings {
  port: number;
  boardFolder: string;
  trustMode: 'confirm' | 'auto';
  enabled: boolean;
  mcpEnabled: boolean;
  notificationInterval: number;
  // GitHub integration
  githubToken: string;
  githubOwner: string;
  githubRepo: string;
  githubProjectId: number;
  syncIssues: 'off' | 'push' | 'pull' | 'bidirectional';
  syncProjects: 'off' | 'push' | 'pull' | 'bidirectional';
  // Card archival
  archiveEnabled: boolean;
  archiveDays: number;
  archiveFilePath: string;
}

export const DEFAULT_SETTINGS: HermesKanbanSettings = {
  port: 27124,
  boardFolder: 'Kanban',
  trustMode: 'confirm',
  enabled: true,
  mcpEnabled: false,
  notificationInterval: 15,
  githubToken: '',
  githubOwner: '',
  githubRepo: '',
  githubProjectId: 0,
  syncIssues: 'off',
  syncProjects: 'off',
  archiveEnabled: false,
  archiveDays: 30,
  archiveFilePath: 'Kanban/archive.md',
};
