import { App, Modal, ButtonComponent } from 'obsidian';

export class ConfirmModal extends Modal {
  private message: string;
  private onConfirm: () => void;
  private onCancel: () => void;

  constructor(app: App, message: string, onConfirm: () => void, onCancel: () => void) {
    super(app);
    this.message = message;
    this.onConfirm = onConfirm;
    this.onCancel = onCancel;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl('h3', { text: 'Hermes Kanban Bridge' });
    contentEl.createEl('p', { text: this.message });

    const btnRow = contentEl.createDiv({ cls: 'modal-button-container' });

    new ButtonComponent(btnRow)
      .setButtonText('Confirm')
      .setCta()
      .onClick(() => { this.close(); this.onConfirm(); });

    new ButtonComponent(btnRow)
      .setButtonText('Cancel')
      .onClick(() => { this.close(); this.onCancel(); });
  }

  onClose() {
    this.contentEl.empty();
  }
}
