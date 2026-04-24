export interface HermesKanbanSettings {
  port: number;
  boardFolder: string;
  trustMode: 'confirm' | 'auto';
  enabled: boolean;
  mcpEnabled: boolean;
  notificationInterval: number;
}

export const DEFAULT_SETTINGS: HermesKanbanSettings = {
  port: 27124,
  boardFolder: 'Kanban',
  trustMode: 'confirm',
  enabled: true,
  mcpEnabled: false,
  notificationInterval: 15,
};
