import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
const paid = ['r7_2', 'r7_1', 'r6_2', 'r6_1'];
const manifest = JSON.parse(await fs.readFile('functions/private-content/manifest.json','utf8'));
const site = 'dist-private-site';
const js = (await Promise.all((await fs.readdir(`${site}/assets`)).filter(name=>name.endsWith('.js')).map(name=>fs.readFile(`${site}/assets/${name}`,'utf8')))).join('\n');
const free = JSON.parse(await fs.readFile('src/data/exams/r8_1.json','utf8'));
let count=0;
for (const exam of paid) {
  const content = JSON.parse(await fs.readFile(`functions/private-content/exams/${exam}.json`, 'utf8'));
  assert.equal(content.questions.length,50);
  for (const question of content.questions) {
    assert.equal(question.examId,exam); count++;
    if (!free.some(q=>q.question===question.question) && question.question.length>15) assert.ok(!js.includes(question.question), `${exam}/${question.id} is in public JS`);
  }
  for (const kind of ['pages','crops','choices']) await assert.rejects(fs.stat(`${site}/${kind}/${exam}`));
}
assert.equal(count,200);
assert.ok(manifest.length>200);
assert.ok(js.includes(free[0].question));
// Service Workerは認証/API/外部通信を横取りしない。
const callbacks={};
vm.runInNewContext(await fs.readFile('public/sw.js','utf8'), {self:{location:{origin:'https://example.com'}, addEventListener:(name,fn)=>callbacks[name]=fn},URL});
for (const [url,auth] of [['https://example.com/api/content?exam=r7_2',false],['https://example.com/choices/r7_2/4.webp',true],['https://other.example/image.png',false]]) {
  let intercepted=false;
  callbacks.fetch({request:{method:'GET',url,headers:{has:()=>auth}},respondWith:()=>intercepted=true});
  assert.equal(intercepted,false);
}
console.log(`PASS: ${count} private questions separated, private images excluded, latest question retained, authenticated requests not cached`);
