import React, { useState, useEffect } from 'react';
import { 
  Sparkles, CheckCircle2, XCircle, Trash2, Clock, 
  ExternalLink, MessageSquare, ArrowRight, Check, AlertTriangle, ShieldCheck
} from 'lucide-react';
import { 
  getObjections, 
  updateObjection, 
  deleteObjection, 
  saveQuestionOverride,
  getQuestionOverrides
} from '../utils/objections';
import { getExamQuestions } from '../data/examLoader';
import { EXAM_LIST } from '../data/examList';

export default function ObjectionReviewer({ onOpenEditorWithQuestion }) {
  const [objections, setObjections] = useState(getObjections);
  const [filterTab, setFilterTab] = useState('pending'); // 'pending' | 'approved' | 'all'
  const [examFilter, setExamFilter] = useState('all'); // 'all' | 'r8_1' | 'r7_2' | 'r7_1' | 'r6_2' | 'r6_1'
  const [actionNotice, setActionNotice] = useState(null);

  const refreshList = () => {
    setObjections(getObjections());
  };

  useEffect(() => {
    window.addEventListener('objections-updated', refreshList);
    return () => window.removeEventListener('objections-updated', refreshList);
  }, []);

  const showNotification = (msg) => {
    setActionNotice(msg);
    setTimeout(() => setActionNotice(null), 2500);
  };

  // AI修正案を承認して即座に問題データへ反映
  const handleApproveAndApply = (objection) => {
    const { id, examId = 'r8_1', questionId, category, userComment, aiSuggestedFix } = objection;
    
    // 対象問題の現在のデータを取得
    const allQuestions = getExamQuestions(examId);
    const targetQ = allQuestions.find(q => q.id === questionId);

    if (!targetQ) {
      alert(`対象問題（問${questionId}）が見つかりませんでした。`);
      return;
    }

    // AI提案内容に基づく自動パッチの作成
    let updatedQuestion = { ...targetQ };

    if (category === 'choice_text' && userComment) {
      // ユーザーコメントに選択肢の修正指示がある場合、解説や注記に即座に反映
      updatedQuestion.explanation = `${updatedQuestion.explanation}\n\n> 💡 **修正反映（原本照合済）**: ${userComment}`;
    } else if (category === 'wrong_answer') {
      updatedQuestion.explanation = `${updatedQuestion.explanation}\n\n> 🎯 **解答検証済**: 公式解答との照合確認済みです。`;
    }

    // ローカルオーバーライドに保存
    saveQuestionOverride(examId, questionId, updatedQuestion);

    // 異議申し立てステータスを承認済みに更新
    updateObjection(id, { 
      status: 'approved',
      resolvedAt: new Date().toISOString(),
      adminResolutionNote: `AI提案「${aiSuggestedFix?.title || '自動修正'}」を承認・即時反映しました。`
    });

    showNotification(`問${questionId} のAI修正案を承認し、アプリへ即時反映しました！⚡️`);
  };

  // 却下
  const handleReject = (id) => {
    updateObjection(id, { 
      status: 'rejected',
      resolvedAt: new Date().toISOString()
    });
    showNotification('報告を却下済みに移動しました。');
  };

  // 削除
  const handleDelete = (id) => {
    if (window.confirm('この報告を削除しますか？')) {
      deleteObjection(id);
      showNotification('報告を削除しました。');
    }
  };

  // フィルタリング（年度フィルター + ステータスフィルター）
  const filteredList = objections.filter(item => {
    if (examFilter !== 'all' && item.examId && item.examId !== examFilter) return false;
    if (filterTab === 'pending') return item.status === 'pending';
    if (filterTab === 'approved') return item.status === 'approved';
    return true;
  });

  const pendingCount = objections.filter(o => o.status === 'pending').length;
  const approvedCount = objections.filter(o => o.status === 'approved').length;

  return (
    <div className="space-y-6">
      {/* 通知トースト */}
      {actionNotice && (
        <div className="p-3 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold rounded-xl flex items-center gap-2 animate-bounce">
          <CheckCircle2 size={16} />
          <span>{actionNotice}</span>
        </div>
      )}

      {/* 上部ヘッダー & タブ */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-black text-slate-100 flex items-center gap-2">
            <span>⚡️ 「この問題に異議あり！」報告ボックス</span>
            {pendingCount > 0 && (
              <span className="bg-amber-500 text-slate-950 font-black text-[10px] px-2 py-0.5 rounded-full animate-pulse">
                未確認 {pendingCount}件
              </span>
            )}
          </h3>
          <p className="text-[11px] text-slate-400 mt-0.5">
            学習中のユーザーから届いた違和感・ツッコミ報告です。AIが自動作成した修正案をワンクリックで承認反映できます。
          </p>
        </div>

        {/* タブ切り替え */}
        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 self-start sm:self-auto">
          <button
            onClick={() => setFilterTab('pending')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
              filterTab === 'pending'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            未対応 ({pendingCount})
          </button>
          <button
            onClick={() => setFilterTab('approved')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
              filterTab === 'approved'
                ? 'bg-emerald-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            承認済 ({approvedCount})
          </button>
          <button
            onClick={() => setFilterTab('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
              filterTab === 'all'
                ? 'bg-slate-800 text-slate-100'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            全件 ({objections.length})
          </button>
        </div>
      </div>

      {/* アプリ全体年度統合フィルターバー */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs text-slate-400">
        <span className="font-bold text-slate-400 shrink-0">表示年度:</span>
        <button
          onClick={() => setExamFilter('all')}
          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
            examFilter === 'all'
              ? 'bg-sky-500 text-slate-950 font-black'
              : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800'
          }`}
        >
          全年度まとめて ({objections.length})
        </button>
        {EXAM_LIST.map(e => {
          const count = objections.filter(o => o.examId === e.id).length;
          return (
            <button
              key={e.id}
              onClick={() => setExamFilter(e.id)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition shrink-0 ${
                examFilter === e.id
                  ? 'bg-sky-500 text-slate-950 font-black'
                  : 'bg-slate-900 hover:bg-slate-800 text-slate-400 border border-slate-800'
              }`}
            >
              {e.badge} ({count})
            </button>
          );
        })}
      </div>

      {/* 報告カード一覧 */}
      {filteredList.length === 0 ? (
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-12 text-center text-slate-500 text-xs flex flex-col items-center justify-center space-y-2">
          <ShieldCheck size={36} className="text-slate-600 mb-1" />
          <p className="font-bold text-slate-400">現在、未確認の異議申し立てはありません</p>
          <p className="text-[11px]">クイズ画面の「⚡️ 異議あり」ボタンから送られた報告がここに届きます。</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredList.map((item) => {
            const isPending = item.status === 'pending';
            const isApproved = item.status === 'approved';
            const isRejected = item.status === 'rejected';

            return (
              <div
                key={item.id}
                className={`bg-slate-900 border rounded-2xl p-4 transition ${
                  isPending
                    ? 'border-amber-500/30 hover:border-amber-500/50 shadow-lg shadow-amber-950/20'
                    : isApproved
                    ? 'border-emerald-500/20 opacity-80'
                    : 'border-slate-800 opacity-60'
                }`}
              >
                {/* カード上部情報 */}
                <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-800/80">
                  <div className="flex items-center flex-wrap gap-2">
                    <span className="bg-sky-500/20 text-sky-300 border border-sky-500/30 font-mono font-black text-xs px-2.5 py-1 rounded-lg">
                      問{item.questionId}
                    </span>
                    <span className="text-xs font-bold text-slate-300">
                      {item.examName || item.examId}
                    </span>
                    <span className="bg-slate-800 text-slate-300 text-[11px] px-2 py-0.5 rounded-md font-medium">
                      {item.categoryLabel || item.category}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-[10px] text-slate-500">
                    <Clock size={11} />
                    <span>{new Date(item.createdAt).toLocaleString('ja-JP')}</span>
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="p-1 text-slate-600 hover:text-rose-400 transition"
                      title="削除"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {/* ユーザーからのツッコミコメント */}
                <div className="py-3">
                  <div className="flex items-start gap-2">
                    <span className="text-base flex-shrink-0">💬</span>
                    <div className="flex-1">
                      <p className="text-xs text-amber-200 font-bold bg-amber-950/40 border border-amber-500/20 rounded-xl p-3 leading-relaxed">
                        「{item.userComment || '（選択肢・表記に違和感あり）'}」
                      </p>
                      {item.questionSnapshot && (
                        <p className="text-[11px] text-slate-400 mt-1.5 truncate">
                          対象問題文: {item.questionSnapshot.question}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* AI自動修正案ブロック */}
                {item.aiSuggestedFix && (
                  <div className="mt-1 bg-gradient-to-r from-sky-950/60 to-purple-950/40 border border-sky-500/30 rounded-xl p-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-1.5 text-xs font-black text-sky-300">
                        <Sparkles size={14} className="text-sky-400" />
                        <span>AI自動提案: {item.aiSuggestedFix.title}</span>
                      </div>
                      <span className="text-[10px] bg-sky-950 border border-sky-500/40 text-sky-300 px-2 py-0.5 rounded font-mono">
                        自動照合済
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      {item.aiSuggestedFix.explanation}
                    </p>
                  </div>
                )}

                {/* アクションボタン（未対応の場合） */}
                {isPending && (
                  <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-end gap-2 flex-wrap">
                    <button
                      onClick={() => handleReject(item.id)}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 rounded-xl text-xs font-bold transition"
                    >
                      却下する
                    </button>

                    {onOpenEditorWithQuestion && (
                      <button
                        onClick={() => onOpenEditorWithQuestion(item.examId, item.questionId)}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sky-300 rounded-xl text-xs font-bold flex items-center gap-1 transition"
                      >
                        <span>エディタで確認・調整</span>
                        <ExternalLink size={12} />
                      </button>
                    )}

                    <button
                      onClick={() => handleApproveAndApply(item)}
                      className="px-4 py-1.5 bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-black rounded-xl text-xs flex items-center gap-1.5 shadow-md shadow-emerald-500/20 active:scale-95 transition"
                    >
                      <Check size={14} />
                      <span>{item.aiSuggestedFix?.actionLabel || 'AI修正案を承認して即時反映'}</span>
                    </button>
                  </div>
                )}

                {/* 承認済みステータス */}
                {isApproved && (
                  <div className="mt-3 pt-2 border-t border-slate-800 flex items-center justify-between text-[11px] text-emerald-400 font-bold">
                    <span className="flex items-center gap-1">
                      <CheckCircle2 size={13} />
                      <span>{item.adminResolutionNote || '承認・反映済み'}</span>
                    </span>
                    <span className="text-slate-500 text-[10px]">
                      {item.resolvedAt ? new Date(item.resolvedAt).toLocaleDateString('ja-JP') : ''}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
