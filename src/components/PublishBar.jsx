import React, { useEffect, useState } from 'react';
import { Copy, Check, CloudUpload } from 'lucide-react';
import { buildPublishBundle, countUnpublishedChanges } from '../utils/publishSync';

/**
 * 管理画面の上部に出す「公開サイトに未反映の変更」バー。
 * 件数と、AIに渡す反映用データのコピーボタン。
 */
export default function PublishBar() {
  const [counts, setCounts] = useState(() => countUnpublishedChanges());
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const refresh = () => setCounts(countUnpublishedChanges());
    window.addEventListener('custom-crops-updated', refresh);
    window.addEventListener('question-overrides-updated', refresh);
    return () => {
      window.removeEventListener('custom-crops-updated', refresh);
      window.removeEventListener('question-overrides-updated', refresh);
    };
  }, []);

  const handleCopy = async () => {
    const text = JSON.stringify(buildPublishBundle(), null, 2);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch (e) {
      window.prompt('自動コピーできませんでした。下の文字をすべて選択してコピーしてください', text);
    }
  };

  const hasChanges = counts.total > 0;

  return (
    <div className={`border-b ${hasChanges ? 'bg-amber-950/70 border-amber-500/40' : 'bg-emerald-950/40 border-emerald-500/30'}`}>
      <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between gap-2 flex-wrap text-xs">
        <div className="flex items-center gap-2">
          <CloudUpload size={16} className={hasChanges ? 'text-amber-300' : 'text-emerald-400'} />
          {hasChanges ? (
            <span className="text-amber-100">
              <strong className="text-amber-300">公開サイトに未反映の変更が {counts.total} 件</strong>
              <span className="text-amber-200/80">（画像 {counts.crops} 件・問題文 {counts.questions} 件）</span>
              <span className="block text-[11px] text-amber-200/70">このブラウザにだけ保存されています。コピーしてAIに貼り付け、「反映して」と伝えてください。</span>
            </span>
          ) : (
            <span className="text-emerald-300 font-bold">✅ 公開サイトとこのブラウザの内容は同じです</span>
          )}
        </div>
        <button
          onClick={handleCopy}
          className={`min-h-[44px] px-3 rounded-xl font-black flex items-center gap-1.5 transition active:scale-95 ${
            hasChanges ? 'bg-amber-400 text-slate-950 hover:bg-amber-300' : 'bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700'
          }`}
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          <span>{copied ? 'コピーしました' : '反映用データをコピー'}</span>
        </button>
      </div>
    </div>
  );
}
