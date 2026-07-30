import assert from 'node:assert/strict';
import {
  addContextSource,
  buildContextPacket,
  estimateContextPacket,
  removeContextSource,
} from '../src/context-packet';

function testBuildsExplicitPacketOnly(): void {
  const packet = buildContextPacket({
    notePath: 'Projects/Alpha.md',
    noteTitle: 'Alpha',
    selection: 'Ship the provider read-only slice.',
    heading: 'Native integration',
    acceptanceCriteria: 'A task preview contains only selected context.',
    constraints: 'Do not dispatch.',
  });

  assert.equal(packet.sources.length, 2);
  assert.equal(packet.sources[0].kind, 'current-note');
  assert.equal(packet.sources[1].kind, 'selection');
  assert.equal(packet.sources[1].excerpt, 'Ship the provider read-only slice.');
  assert.equal(packet.acceptanceCriteria, 'A task preview contains only selected context.');
  assert.equal(packet.constraints, 'Do not dispatch.');
}

function testAddsAndRemovesOnlyExplicitSources(): void {
  const packet = buildContextPacket({ notePath: 'Projects/Alpha.md' });
  const withLinked = addContextSource(packet, {
    kind: 'linked-note', path: 'Projects/Decision.md', title: 'Decision', excerpt: 'Use native state.',
  });
  const withoutLinked = removeContextSource(withLinked, 'linked-note:Projects/Decision.md');

  assert.equal(withLinked.sources.length, 2);
  assert.equal(withoutLinked.sources.length, 1);
  assert.equal(withoutLinked.sources[0].path, 'Projects/Alpha.md');
}

function testEstimateIsDeterministic(): void {
  const packet = buildContextPacket({
    notePath: 'Projects/Alpha.md',
    selection: 'abc',
    attachments: [{ path: '/tmp/evidence.pdf', name: 'evidence.pdf', sizeBytes: 2048 }],
  });
  const first = estimateContextPacket(packet);
  const second = estimateContextPacket(packet);

  assert.deepEqual(first, second);
  assert.equal(first.attachmentBytes, 2048);
  assert.ok(first.textBytes >= 3);
}

function main(): void {
  testBuildsExplicitPacketOnly();
  testAddsAndRemovesOnlyExplicitSources();
  testEstimateIsDeterministic();
  console.log('context-packet tests: PASS');
}

main();
