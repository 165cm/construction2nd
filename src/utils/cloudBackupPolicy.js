export function assertCloudWrite(payload, expectedRevision, currentRevision) {
  if (typeof payload !== 'string' || new TextEncoder().encode(payload).length > 800000) {
    throw new Error('記録が大きいためクラウドに保存できません。ファイルへ書き出して保管してください');
  }
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || expectedRevision !== currentRevision) {
    throw new Error('別の端末で記録が更新されています。「クラウドの状態を再確認」してから保存してください');
  }
}
