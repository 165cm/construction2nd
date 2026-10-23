import assert from 'node:assert/strict';

// 作成成功の応答を失っても「対象なし」と扱わないための先行記録。
export async function recordCalendarCreation({ state, save, kind, owner, create, onCreated }) {
  state.creations ??= [];
  const operation = { kind, owner, status: 'unconfirmed', startedAt: new Date().toISOString() };
  state.creations.push(operation); save();
  const value = await create();
  assert.equal(value.livemode, false);
  onCreated(value);
  operation.id = value.id; operation.status = 'received'; save();
  return value;
}

export function unconfirmedCalendarCreations(state) {
  return (state.creations || []).filter(operation => operation.status !== 'received')
    .map(() => ({ type: 'creation', id: state.runId, code: 'unconfirmed-creation-result' }));
}
