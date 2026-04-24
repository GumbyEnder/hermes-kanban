import { Plugin, PluginSettingTab, App, Setting } from 'obsidian';
import { HermesKanbanSettings, DEFAULT_SETTINGS } from './settings';
import { KanbanServer } from './server';
import { McpAdapter } from './mcp-adapter';

// Keep this in sync with manifest.json and package.json version
export const PLUGIN_VERSION = '1.3.0';

export default class HermesKanbanPlugin extends Plugin {
  settings: HermesKanbanSettings = DEFAULT_SETTINGS;
  server: KanbanServer | null = null;
  mcpAdapter: McpAdapter | null = null;

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
      const { KanbanParser } = await import('./kanban-parser');
      const parser = new KanbanParser(this.app);
      this.mcpAdapter = new McpAdapter(this.app, this.settings, parser);
      this.mcpAdapter.start();
    }

    this.addSettingTab(new HermesKanbanSettingTab(this.app, this));

    this.addCommand({
      id: 'toggle-server',
      name: 'Toggle Hermes Kanban Bridge server',
      callback: () => {
        if (this.server) {
          this.settings.enabled = !this.settings.enabled;
          this.settings.enabled ? this.server.start() : this.server.stop();
          this.saveSettings();
        }
      }
    });

    this.addCommand({
      id: 'toggle-mcp',
      name: 'Toggle Hermes Kanban MCP adapter',
      callback: async () => {
        this.settings.mcpEnabled = !this.settings.mcpEnabled;
        if (this.settings.mcpEnabled) {
          const { KanbanParser } = await import('./kanban-parser');
          const parser = new KanbanParser(this.app);
          this.mcpAdapter = new McpAdapter(this.app, this.settings, parser);
          this.mcpAdapter.start();
        } else {
          this.mcpAdapter?.stop();
          this.mcpAdapter = null;
        }
        this.saveSettings();
      }
    });

    console.log('Hermes Kanban Bridge loaded');
  }

  onunload() {
    this.server?.stopNotifier();
    this.server?.stop();
    this.mcpAdapter?.stop();
    console.log('Hermes Kanban Bridge unloaded');
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

class HermesKanbanSettingTab extends PluginSettingTab {
  plugin: HermesKanbanPlugin;

  constructor(app: App, plugin: HermesKanbanPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'Hermes Kanban Bridge Settings' });

    new Setting(containerEl)
      .setName('Port')
      .setDesc('Local port for the REST API (default: 27124)')
      .addText(text => text
        .setPlaceholder('27124')
        .setValue(String(this.plugin.settings.port))
        .onChange(async (value) => {
          const port = parseInt(value);
          if (!isNaN(port) && port > 1024 && port < 65535) {
            this.plugin.settings.port = port;
            await this.plugin.saveSettings();
          }
        }));

    new Setting(containerEl)
      .setName('Board folder')
      .setDesc('Vault folder where Kanban boards are stored')
      .addText(text => text
        .setPlaceholder('Kanban')
        .setValue(this.plugin.settings.boardFolder)
        .onChange(async (value) => {
          this.plugin.settings.boardFolder = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Trust mode')
      .setDesc('Confirm: show approval modal. Auto: allow writes without prompting.')
      .addDropdown(drop => drop
        .addOption('confirm', 'Confirm (ask before writing)')
        .addOption('auto', 'Auto-trust (no prompts)')
        .setValue(this.plugin.settings.trustMode)
        .onChange(async (value) => {
          this.plugin.settings.trustMode = value as 'confirm' | 'auto';
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Enable server')
      .setDesc('Start the REST API server when Obsidian loads')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.enabled)
        .onChange(async (value) => {
          this.plugin.settings.enabled = value;
          await this.plugin.saveSettings();
          value ? this.plugin.server?.start() : this.plugin.server?.stop();
          if (value && this.plugin.settings.notificationInterval > 0) {
            this.plugin.server?.startNotifier(this.plugin.settings.notificationInterval);
          } else {
            this.plugin.server?.stopNotifier();
          }
        }));

    new Setting(containerEl)
      .setName('Due date notification interval')
      .setDesc('Check for overdue cards every N minutes (0 = disabled). Shows an Obsidian notice for each overdue card.')
      .addText(text => text
        .setPlaceholder('15')
        .setValue(String(this.plugin.settings.notificationInterval))
        .onChange(async (value) => {
          const minutes = parseInt(value);
          if (!isNaN(minutes) && minutes >= 0) {
            this.plugin.settings.notificationInterval = minutes;
            await this.plugin.saveSettings();
            if (minutes > 0 && this.plugin.settings.enabled) {
              this.plugin.server?.startNotifier(minutes);
            } else {
              this.plugin.server?.stopNotifier();
            }
          }
        }));

    new Setting(containerEl)
      .setName('Enable MCP adapter')
      .setDesc(`Expose Kanban tools via MCP on port ${this.plugin.settings.port + 1} (Claude Desktop, Cursor, Zed, etc.)`)
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.mcpEnabled)
        .onChange(async (value) => {
          this.plugin.settings.mcpEnabled = value;
          await this.plugin.saveSettings();
          if (value) {
            import('./kanban-parser').then(({ KanbanParser }) => {
              const parser = new KanbanParser(this.plugin.app);
              this.plugin.mcpAdapter = new McpAdapter(this.plugin.app, this.plugin.settings, parser);
              this.plugin.mcpAdapter?.start();
            });
          } else {
            this.plugin.mcpAdapter?.stop();
            this.plugin.mcpAdapter = null;
          }
        }));
  }
}