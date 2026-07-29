import assert from 'node:assert/strict';
import { HermesNativeProvider } from '../src/hermes-native-provider';

const originalFetch = globalThis.fetch;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function testMapsNativeReadOnlyResponses(): Promise<void> {
  const calls: string[] = [];
  globalThis.fetch = async (input: string | URL | Request) => {
    const url = String(input);
    calls.push(url);
    if (url.endsWith('/api/plugins/kanban/boards')) {
      return jsonResponse({
        boards: [{ slug: 'alpha', name: 'Alpha', description: 'Example', total: 1 }],
      });
    }
    if (url.includes('/api/plugins/kanban/board?board=alpha')) {
      return jsonResponse({
        columns: [{
          name: 'running',
          tasks: [{ id: 't_123', title: 'Investigate', status: 'running', unknown_native_field: 'keep-me' }],
        }],
      });
    }
    if (url.includes('/api/plugins/kanban/tasks/t_123?board=alpha')) {
      return jsonResponse({
        task: { id: 't_123', title: 'Investigate', status: 'running' },
        comments: [{ id: 1, body: 'working' }],
        events: [],
        attachments: [],
        links: { parents: [], children: [] },
        runs: [],
      });
    }
    if (url.endsWith('/api/plugins/kanban/profiles')) {
      return jsonResponse({ profiles: [{ name: 'worker', description: 'Does work' }] });
    }
    return jsonResponse({ detail: `unexpected ${url}` }, 404);
  };

  const provider = new HermesNativeProvider({ baseUrl: 'http://127.0.0.1:9120' });
  const health = await provider.health();
  const boards = await provider.listBoards();
  const board = await provider.getBoard('alpha');
  const task = await provider.getTask('t_123', 'alpha');
  const profiles = await provider.listProfiles();

  assert.equal(health.ok, true);
  assert.equal(boards[0].id, 'alpha');
  assert.equal(board.tasks[0].status, 'running');
  assert.equal(board.tasks[0].extensions?.unknown_native_field, 'keep-me');
  assert.equal(task.comments?.[0].body, 'working');
  assert.equal(profiles[0].name, 'worker');
  assert.ok(calls.every(url => url.startsWith('http://127.0.0.1:9120/')));
}

async function testRejectsRemoteEndpointByDefault(): Promise<void> {
  assert.throws(
    () => new HermesNativeProvider({ baseUrl: 'http://192.168.1.10:9120' }),
    /loopback/i,
  );

  assert.doesNotThrow(
    () => new HermesNativeProvider({
      baseUrl: 'http://192.168.1.10:9120',
      allowRemote: true,
    }),
  );
}

async function testReturnsStaleCacheAfterReadFailure(): Promise<void> {
  let online = true;
  globalThis.fetch = async () => {
    if (online) {
      return jsonResponse({ boards: [{ slug: 'cached', name: 'Cached', total: 0 }] });
    }
    throw new TypeError('network unavailable');
  };

  const provider = new HermesNativeProvider({ baseUrl: 'http://localhost:9120' });
  await provider.listBoards();
  online = false;
  const result = await provider.listBoardsWithState();

  assert.equal(result.stale, true);
  assert.equal(result.value[0].id, 'cached');
  assert.match(result.error ?? '', /network unavailable/);
}

async function main(): Promise<void> {
  try {
    await testMapsNativeReadOnlyResponses();
    await testRejectsRemoteEndpointByDefault();
    await testReturnsStaleCacheAfterReadFailure();
    console.log('hermes-native-provider tests: PASS');
  } finally {
    globalThis.fetch = originalFetch;
  }
}

void main();
