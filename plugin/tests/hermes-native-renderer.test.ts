import assert from 'node:assert/strict';
import { formatBoardSummary, formatTaskSummary, parseBlockConfig } from '../src/hermes-native-renderer';

function testParsesBlockConfig(): void {
  assert.deepEqual(parseBlockConfig('id: t_123\nboard: alpha\nmode: compact'), {
    id: 't_123', board: 'alpha', mode: 'compact',
  });
}

function testFormatsTaskState(): void {
  const text = formatTaskSummary({
    id: 't_123',
    title: 'Investigate provider',
    status: 'blocked',
    assignee: 'researcher',
    blocker: 'Waiting on access',
    result: 'Prior attempt complete',
  });
  assert.match(text, /Investigate provider/);
  assert.match(text, /blocked/i);
  assert.match(text, /researcher/);
  assert.match(text, /Waiting on access/);
}

function testFormatsBoardSummary(): void {
  const text = formatBoardSummary({
    id: 'alpha', name: 'Alpha', tasks: [
      { id: 't_1', title: 'Ready', status: 'ready' },
      { id: 't_2', title: 'Blocked', status: 'blocked' },
      { id: 't_3', title: 'Done', status: 'done' },
    ],
  });
  assert.match(text, /Alpha/);
  assert.match(text, /ready: 1/i);
  assert.match(text, /blocked: 1/i);
  assert.match(text, /done: 1/i);
}

function main(): void {
  testParsesBlockConfig();
  testFormatsTaskState();
  testFormatsBoardSummary();
  console.log('hermes-native-renderer tests: PASS');
}

main();
