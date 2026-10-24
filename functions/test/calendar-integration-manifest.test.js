import test from 'node:test';
import assert from 'node:assert/strict';
import { recordCalendarCreation, unconfirmedCalendarCreations } from '../../scripts/calendarIntegrationManifest.mjs';

test('作成前に未確定を永続化し、IDと親の記録を同じ保存へ確定する', async () => {
  const state = { runId: 'fixture' }, saves = [];
  const value = await recordCalendarCreation({ state, kind: 'customer', owner: 'fake-user',
    save: () => saves.push(structuredClone(state)),
    create: async () => { assert.equal(saves.length, 1); assert.equal(saves[0].creations[0].status, 'unconfirmed'); return { id: 'cus_fixture', livemode: false }; },
    onCreated: result => { state.customerId = result.id; },
  });
  assert.equal(value.id, 'cus_fixture'); assert.equal(saves.length, 2);
  assert.equal(saves[1].customerId, 'cus_fixture'); assert.equal(saves[1].creations[0].id, 'cus_fixture');
  assert.deepEqual(unconfirmedCalendarCreations(state), []);
});
test('作成応答喪失は秘密の例外本文を記録せず、未確定エラーとして残す', async () => {
  const state = { runId: 'fixture' }, saves = [];
  await assert.rejects(recordCalendarCreation({ state, save: () => saves.push(structuredClone(state)), kind: 'price', owner: 'initial',
    create: async () => { throw Error('private-response'); }, onCreated: () => assert.fail(),
  }));
  assert.equal(saves.length, 1);
  assert.deepEqual(unconfirmedCalendarCreations(state), [{ type: 'creation', id: 'fixture', code: 'unconfirmed-creation-result' }]);
  assert.ok(!JSON.stringify(state).includes('private-response'));
});
test('先行保存が失敗すれば外部作成しない。本番応答も確定扱いしない', async () => {
  let called = false;
  await assert.rejects(recordCalendarCreation({ state: {}, save: () => { throw Error('disk-full'); }, kind: 'product', owner: 'fixture',
    create: async () => { called = true; }, onCreated() {},
  }));
  assert.equal(called, false);
  const state = { runId: 'fixture' };
  await assert.rejects(recordCalendarCreation({ state, save() {}, kind: 'product', owner: 'fixture',
    create: async () => ({ id: 'prod_live', livemode: true }), onCreated: () => assert.fail(),
  }));
  assert.equal(unconfirmedCalendarCreations(state).length, 1);
});
