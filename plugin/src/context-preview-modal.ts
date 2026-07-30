import { App, ButtonComponent, Modal, TextAreaComponent } from 'obsidian';
import {
  ContextPacket,
  ContextPacketEstimate,
  estimateContextPacket,
  removeContextSource,
} from './context-packet';

/**
 * Human review step for future native Hermes dispatch.
 * This modal deliberately returns a packet only; it never calls a provider.
 */
export class ContextPreviewModal extends Modal {
  private packet: ContextPacket;
  private estimate: ContextPacketEstimate;
  private readonly onApprove: (packet: ContextPacket) => void;

  constructor(app: App, packet: ContextPacket, onApprove: (packet: ContextPacket) => void) {
    super(app);
    this.packet = packet;
    this.estimate = estimateContextPacket(packet);
    this.onApprove = onApprove;
  }

  onOpen(): void {
    this.render();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl('h2', { text: 'Review Hermes task context' });
    contentEl.createEl('p', {
      text: 'Preview only. Confirming this dialog does not create or dispatch a native Hermes task yet.',
    });

    const summary = contentEl.createEl('p', {
      text: `${this.estimate.sourceCount} source(s) · ${this.estimate.textBytes} text bytes · ${this.estimate.attachmentBytes} attachment bytes`,
    });
    summary.addClass('hermes-context-summary');

    contentEl.createEl('h3', { text: 'Included sources' });
    const sources = contentEl.createEl('div', { cls: 'hermes-context-sources' });
    for (const source of this.packet.sources) {
      const row = sources.createDiv({ cls: 'hermes-context-source' });
      row.createEl('strong', { text: source.kind });
      row.createEl('div', { text: source.title ?? source.name ?? source.path ?? 'Untitled source' });
      if (source.path) row.createEl('small', { text: source.path });
      if (source.excerpt) row.createEl('pre', { text: source.excerpt });
      new ButtonComponent(row)
        .setButtonText('Remove')
        .onClick(() => {
          this.packet = removeContextSource(this.packet, source.id);
          this.estimate = estimateContextPacket(this.packet);
          this.render();
        });
    }

    contentEl.createEl('h3', { text: 'Acceptance criteria' });
    const acceptance = new TextAreaComponent(contentEl)
      .setPlaceholder('What must be true before the future task can be considered complete?')
      .setValue(this.packet.acceptanceCriteria ?? '');
    acceptance.inputEl.rows = 4;
    acceptance.onChange(value => {
      this.packet = { ...this.packet, acceptanceCriteria: value.trim() || undefined };
      this.estimate = estimateContextPacket(this.packet);
    });

    contentEl.createEl('h3', { text: 'Constraints' });
    const constraints = new TextAreaComponent(contentEl)
      .setPlaceholder('Scope limits, safety rules, or things the worker must not do')
      .setValue(this.packet.constraints ?? '');
    constraints.inputEl.rows = 3;
    constraints.onChange(value => {
      this.packet = { ...this.packet, constraints: value.trim() || undefined };
      this.estimate = estimateContextPacket(this.packet);
    });

    const buttons = contentEl.createDiv({ cls: 'modal-button-container' });
    new ButtonComponent(buttons)
      .setButtonText('Save preview')
      .setCta()
      .onClick(() => {
        this.close();
        this.onApprove(this.packet);
      });
    new ButtonComponent(buttons)
      .setButtonText('Cancel')
      .onClick(() => this.close());
  }
}

export function contextPreviewCss(): string {
  return `
.hermes-context-summary { color: var(--text-muted); }
.hermes-context-source { border: 1px solid var(--background-modifier-border); border-radius: 6px; padding: 8px; margin: 8px 0; }
.hermes-context-source pre { white-space: pre-wrap; max-height: 9em; overflow: auto; background: var(--background-primary); padding: 6px; }
`;
}
