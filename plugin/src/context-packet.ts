export type ContextSourceKind = 'current-note' | 'selection' | 'linked-note' | 'attachment';

export interface ContextSource {
  id: string;
  kind: ContextSourceKind;
  path?: string;
  title?: string;
  excerpt?: string;
  name?: string;
  sizeBytes?: number;
}

export interface ContextPacket {
  version: 1;
  source: { notePath?: string; noteTitle?: string; heading?: string };
  sources: ContextSource[];
  acceptanceCriteria?: string;
  constraints?: string;
}

export interface ContextPacketInput {
  notePath?: string;
  noteTitle?: string;
  heading?: string;
  selection?: string;
  acceptanceCriteria?: string;
  constraints?: string;
  attachments?: Array<{ path: string; name?: string; sizeBytes?: number }>;
}

export interface ContextPacketEstimate {
  textBytes: number;
  attachmentBytes: number;
  sourceCount: number;
}

export function buildContextPacket(input: ContextPacketInput): ContextPacket {
  const packet: ContextPacket = {
    version: 1,
    source: { notePath: input.notePath, noteTitle: input.noteTitle, heading: input.heading },
    sources: [],
    acceptanceCriteria: input.acceptanceCriteria?.trim() || undefined,
    constraints: input.constraints?.trim() || undefined,
  };
  if (input.notePath) {
    packet.sources.push({ id: `current-note:${input.notePath}`, kind: 'current-note', path: input.notePath, title: input.noteTitle });
  }
  if (input.selection?.trim()) {
    packet.sources.push({ id: `selection:${input.notePath ?? 'untitled'}`, kind: 'selection', path: input.notePath, title: input.heading, excerpt: input.selection.trim() });
  }
  for (const attachment of input.attachments ?? []) {
    packet.sources.push({ id: `attachment:${attachment.path}`, kind: 'attachment', path: attachment.path, name: attachment.name ?? attachment.path.split('/').pop(), sizeBytes: attachment.sizeBytes ?? 0 });
  }
  return packet;
}

export function addContextSource(packet: ContextPacket, source: Omit<ContextSource, 'id'>): ContextPacket {
  const identity = source.path ?? source.name ?? source.excerpt ?? 'source';
  const id = `${source.kind}:${identity}`;
  if (packet.sources.some(existing => existing.id === id)) return packet;
  return { ...packet, sources: [...packet.sources, { ...source, id }] };
}

export function removeContextSource(packet: ContextPacket, sourceId: string): ContextPacket {
  return { ...packet, sources: packet.sources.filter(source => source.id !== sourceId) };
}

export function estimateContextPacket(packet: ContextPacket): ContextPacketEstimate {
  const text = [
    packet.source.notePath,
    packet.source.noteTitle,
    packet.source.heading,
    packet.acceptanceCriteria,
    packet.constraints,
    ...packet.sources.map(source => `${source.path ?? ''}\n${source.title ?? ''}\n${source.excerpt ?? ''}`),
  ].filter(Boolean).join('\n');
  return {
    textBytes: new TextEncoder().encode(text).byteLength,
    attachmentBytes: packet.sources.reduce((sum, source) => sum + (source.kind === 'attachment' ? source.sizeBytes ?? 0 : 0), 0),
    sourceCount: packet.sources.length,
  };
}

/** Preview phase deliberately does not dispatch or mutate native Hermes tasks. */
export function previewOnly(packet: ContextPacket): ContextPacket {
  return packet;
}
