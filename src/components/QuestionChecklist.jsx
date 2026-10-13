import React, { useEffect, useMemo, useState } from 'react';
import { ClipboardCheck, AlertTriangle, CheckCircle2, ExternalLink } from 'lucide-react';
import { EXAM_LIST } from '../data/examList';
import { getExamQuestions, getSharedQuestionOverrides } from '../data/examLoader';
import { getCheatsheetsForQuestion } from '../data/cheatsheets';
import { cropKeyForDiagram, getActiveCropCoords } from '../utils/customCrops';
import { getQuestionOverrides } from '../utils/objections';
import { getResolvedObjections } from '../utils/objectionExams';
import { getAssetUrl } from '../utils/asset';

const CHOICE_IDS = ['イ', 'ロ', 'ハ', 'ニ'];

// 画像ファイルが読めるか（切り抜き座標が無い問題は、既定の画像ファイルを表示するため）
const imageExists = (path) => new Promise((resolve) => {
  const img = new Image();
  img.onload = () => resolve(img.naturalWidth > 0);
  img.onerror = () => resolve(false);
  img.src = getAssetUrl(path);
});

// 1問ぶんのチェック。problems は直すべき点、notes は参考情報
const checkQuestion = (q, examId, missingImages) => {
  const problems = [];
  const notes = [];

  const choices = Array.isArray(q.choices) ? q.choices : [];
  if (choices.length !== 4 || !CHOICE_IDS.every(id => choices.some(c => c.id === id))) {
    problems.push('選択肢がイ・ロ・ハ・ニの4つそろっていない');
  }
  if (choices.some(c => !String(c.text || '').trim())) problems.push('空の選択肢がある');
  if (!CHOICE_IDS.includes(q.answer) || !choices.some(c => c.id === q.answer)) problems.push('正解が選択肢にない');
  if (!String(q.question || '').trim()) problems.push('問題文が空');
  if (!String(q.explanation || '').trim()) problems.push('解説が空');
  if (!String(q.keyPoint || '').trim()) notes.push('要点なし');

  let image = 'なし';
  if (q.diagram) {
    const key = cropKeyForDiagram(q.id, q.diagram, examId);
    if (getActiveCropCoords(key)) {
      image = '切り抜き';
    } else if (missingImages.has(q.diagram)) {
      image = '画像なし';
      problems.push('画像ありだが、切り抜き位置も画像ファイルも無い（①で切り抜く）');
    } else {
      image = '既定画像';
    }
  }

  if (q.id >= 31 && !q.wiringMark) notes.push('配線図の記号（①など）が未設定');
  const cheatsheets = getCheatsheetsForQuestion(q).length;
  if (cheatsheets === 0) notes.push('早見表なし');

  return { problems, notes, image, cheatsheets };
};

/**
 * 全問題チェック一覧。年度ごとに、問題文・選択肢・正解・解説・画像などがそろっているかを一覧で確かめる。
 */
export default function QuestionChecklist({ onOpenEditor }) {
  const [examId, setExamId] = useState('r8_1');
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [missingImages, setMissingImages] = useState(() => new Set());
  const [checkingImages, setCheckingImages] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const refresh = () => setVersion(v => v + 1);
    window.addEventListener('custom-crops-updated', refresh);
    window.addEventListener('question-overrides-updated', refresh);
    window.addEventListener('objections-updated', refresh);
    return () => {
      window.removeEventListener('custom-crops-updated', refresh);
      window.removeEventListener('question-overrides-updated', refresh);
      window.removeEventListener('objections-updated', refresh);
    };
  }, []);

  const questions = useMemo(
    () => getExamQuestions(examId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [examId, version]
  );

  // 切り抜き位置が無い「画像あり」の問題は、既定の画像ファイルが本当にあるか確かめる
  useEffect(() => {
    let alive = true;
    const paths = [...new Set(questions
      .filter(q => q.diagram && !getActiveCropCoords(cropKeyForDiagram(q.id, q.diagram, examId)))
      .map(q => q.diagram))];
    if (paths.length === 0) {
      setMissingImages(new Set());
      return undefined;
    }
    setCheckingImages(true);
    Promise.all(paths.map(p => imageExists(p).then(ok => (ok ? null : p)))).then((results) => {
      if (!alive) return;
      setMissingImages(new Set(results.filter(Boolean)));
      setCheckingImages(false);
    });
    return () => { alive = false; };
  }, [questions, examId]);

  const localOverrides = getQuestionOverrides()[examId] || {};
  const sharedOverrides = getSharedQuestionOverrides()[examId] || {};
  // 年度を取り違えて保存された古い報告も、正しい年度に読み替えてから数える
  const pendingObjections = getResolvedObjections().filter(o => o.status === 'pending' && o.examId === examId);

  const rows = questions.map((q) => {
    const result = checkQuestion(q, examId, missingImages);
    const objections = pendingObjections.filter(o => String(o.questionId) === String(q.id)).length;
    if (objections > 0) result.problems.push(`未対応の異議あり ${objections} 件`);
    return {
      q,
      ...result,
      editedLocal: Boolean(localOverrides[q.id]),
      editedShared: Boolean(sharedOverrides[String(q.id)])
    };
  });

  const problemCount = rows.filter(r => r.problems.length > 0).length;
  const shown = onlyProblems ? rows.filter(r => r.problems.length > 0) : rows;

  return (
    <div className="space-y-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <ClipboardCheck size={20} className="text-sky-400" />
            <div>
              <h2 className="text-sm font-black text-white">全問題チェック一覧</h2>
              <p className="text-[11px] text-slate-400">問題文・選択肢・正解・解説・画像がそろっているかを確かめます。行を押すと②エディタで開きます。</p>
            </div>
          </div>
          <div className={`px-3 py-1.5 rounded-xl text-xs font-black border ${
            problemCount > 0 ? 'bg-amber-500/15 text-amber-300 border-amber-500/40' : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
          }`}>
            {problemCount > 0 ? `⚠️ 直すところがある問題：${problemCount} 問` : '✅ 直すところはありません'}
            {checkingImages && <span className="ml-1 text-slate-400 font-normal">（画像を確認中…）</span>}
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {EXAM_LIST.map(e => (
            <button
              key={e.id}
              onClick={() => setExamId(e.id)}
              className={`min-h-[44px] px-3 rounded-xl text-xs font-bold border transition ${
                e.id === examId ? 'bg-sky-500 text-slate-950 border-sky-400' : 'bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800'
              }`}
            >
              {e.name}
            </button>
          ))}
          <label className="ml-auto flex items-center gap-1.5 text-xs text-slate-300 min-h-[44px] cursor-pointer">
            <input type="checkbox" checked={onlyProblems} onChange={(ev) => setOnlyProblems(ev.target.checked)} />
            直すところがある問題だけ
          </label>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-950 text-slate-400">
              <tr>
                <th className="px-3 py-2 text-left">問</th>
                <th className="px-3 py-2 text-left">分野</th>
                <th className="px-3 py-2 text-left">正解</th>
                <th className="px-3 py-2 text-left">画像</th>
                <th className="px-3 py-2 text-left">早見表</th>
                <th className="px-3 py-2 text-left">修正</th>
                <th className="px-3 py-2 text-left">チェック結果</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {shown.map(({ q, problems, notes, image, cheatsheets, editedLocal, editedShared }) => (
                <tr
                  key={q.id}
                  onClick={() => onOpenEditor?.(examId, q.id)}
                  className={`border-t border-slate-800 cursor-pointer hover:bg-slate-800/60 ${problems.length ? 'bg-amber-950/20' : ''}`}
                >
                  <td className="px-3 py-2 font-black text-sky-300 whitespace-nowrap">問{q.number || q.id}</td>
                  <td className="px-3 py-2 text-slate-300 whitespace-nowrap">{q.category}</td>
                  <td className="px-3 py-2 font-black text-emerald-300">{q.answer}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className={image === '画像なし' ? 'text-rose-300 font-bold' : image === 'なし' ? 'text-slate-500' : 'text-slate-200'}>{image}</span>
                  </td>
                  <td className="px-3 py-2 text-slate-300">{cheatsheets > 0 ? `${cheatsheets}件` : '—'}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {editedShared && <span className="mr-1 px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30">公開済</span>}
                    {editedLocal && <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">この端末</span>}
                    {!editedShared && !editedLocal && <span className="text-slate-600">—</span>}
                  </td>
                  <td className="px-3 py-2">
                    {problems.length === 0 ? (
                      <span className="text-emerald-400 flex items-center gap-1"><CheckCircle2 size={13} />OK</span>
                    ) : (
                      <ul className="text-amber-300 space-y-0.5">
                        {problems.map(p => <li key={p} className="flex items-start gap-1"><AlertTriangle size={12} className="mt-0.5 shrink-0" />{p}</li>)}
                      </ul>
                    )}
                    {notes.length > 0 && <div className="text-[10px] text-slate-500 mt-0.5">{notes.join('・')}</div>}
                  </td>
                  <td className="px-3 py-2 text-slate-500"><ExternalLink size={13} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {shown.length === 0 && (
          <div className="p-6 text-center text-xs text-emerald-300">✅ この年度に直すところがある問題はありません</div>
        )}
      </div>
    </div>
  );
}
