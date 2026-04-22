import { Plugin, PluginSettingTab, App, Setting } from 'obsidian';
import { HermesKanbanSettings, DEFAULT_SETTINGS } from './settings';
import { KanbanServer } from './server';

export default class HermesKanbanPlugin extends Plugin {
  settings: HermesKanbanSettings = DEFAULT_SETTINGS;
  server: KanbanServer | null = null;

  async onload() {
    await this.loadSettings();
    this.server = new KanbanServer(this.app, this.settings);

    if (this.settings.enabled) {
      this.server.start();
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

    console.log('Hermes Kanban Bridge loaded');
  }

  onunload() {
    this.server?.stop();
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
        }));
  }
}
