export interface HermesKanbanSettings {
  port: number;
  boardFolder: string;
  trustMode: 'confirm' | 'auto';
  enabled: boolean;
  mcpEnabled: boolean;
  /** v2 execution backend. Legacy Markdown remains the default. */
  executionProvider: 'legacy-markdown' | 'hermes-native';
  /** Native Hermes dashboard URL. v2 only accepts loopback by default. */
  hermesNativeBaseUrl: string;
  /** Advanced opt-in; remote mode is not otherwise supported in v2. */
  hermesNativeAllowRemote: boolean;
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
  executionProvider: 'legacy-markdown',
  hermesNativeBaseUrl: 'http://127.0.0.1:9120',
  hermesNativeAllowRemote: false,
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
