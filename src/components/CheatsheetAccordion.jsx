import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Table, Lightbulb, BookmarkCheck } from 'lucide-react';
import { playClick } from '../utils/sound';

export default function CheatsheetAccordion({ cheatsheets }) {
  const [expandedId, setExpandedId] = useState(null);

  if (!cheatsheets || cheatsheets.length === 0) return null;

  const toggleExpand = (id) => {
    playClick();
    setExpandedId(prev => (prev === id ? null : id));
  };

  return (
    <div className="space-y-2 mt-2.5">
      {cheatsheets.map((sheet) => {
        const isExpanded = expandedId === sheet.id;

        return (
          <div
            key={sheet.id}
            className="rounded-xl border border-sky-500/40 bg-gradient-to-r from-slate-900/90 to-sky-950/50 shadow-md overflow-hidden transition"
          >
            {/* Header / Trigger Bar */}
            <button
              type="button"
              onClick={() => toggleExpand(sheet.id)}
              className="w-full p-2.5 sm:p-3 flex items-center justify-between text-left hover:bg-sky-900/20 active:scale-[0.99] transition"
            >
              <div className="flex items-center space-x-2 min-w-0 pr-2">
                <div className="w-6 h-6 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center shrink-0 border border-sky-500/30">
                  <Table size={13} />
                </div>
                <div className="truncate">
                  <div className="flex items-center gap-1.5 leading-none mb-0.5">
                    <span className="text-[10px] font-black text-amber-300 bg-amber-500/20 px-1.5 py-0.5 rounded border border-amber-500/30">
                      {sheet.badge || '必修暗記'}
                    </span>
                    <span className="text-[10px] text-sky-400 font-bold">
                      🔍 ついでに丸暗記！
                    </span>
                  </div>
                  <h5 className="text-xs font-bold text-slate-100 truncate">
                    {sheet.title}
                  </h5>
                </div>
              </div>

              <div className="flex items-center space-x-1.5 shrink-0 text-slate-400 text-[11px] font-semibold">
                <span className="text-sky-300 hidden xs:inline">
                  {isExpanded ? '閉じる' : '早見表を見る'}
                </span>
                {isExpanded ? (
                  <ChevronUp size={16} className="text-sky-400" />
                ) : (
                  <ChevronDown size={16} className="text-sky-400" />
                )}
              </div>
            </button>

            {/* Expanded Content Table */}
            {isExpanded && (
              <div className="p-3 pt-0 border-t border-sky-500/20 bg-slate-950/70 animate-fadeIn">
                {/* Mnemonics Tip Banner */}
                {sheet.mnemonics && (
                  <div className="my-2.5 p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200 flex items-center gap-2 text-xs">
                    <Lightbulb size={14} className="text-amber-400 shrink-0" />
                    <span className="font-bold leading-tight">
                      語呂合わせ: <strong className="text-amber-300 font-black">{sheet.mnemonics}</strong>
                    </span>
                  </div>
                )}

                {/* Table */}
                <div className="overflow-x-auto rounded-lg border border-slate-700/80 bg-slate-900/90 no-scrollbar shadow-inner my-2">
                  <table className="w-full text-left border-collapse text-[11px]">
                    <thead>
                      <tr className="bg-slate-800 text-sky-300 border-b border-slate-700 font-bold">
                        {sheet.headers.map((h, hIdx) => (
                          <th key={hIdx} className="py-2 px-2.5 whitespace-nowrap text-center">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80">
                      {sheet.rows.map((row, rIdx) => {
                        const cols = Object.keys(row)
                          .filter(k => k.startsWith('col'))
                          .sort()
                          .map(k => row[k]);

                        return (
                          <tr
                            key={rIdx}
                            className={`transition ${
                              row.highlight
                                ? 'bg-amber-500/15 text-amber-100 font-bold border-l-2 border-l-amber-400'
                                : rIdx % 2 === 0
                                ? 'bg-slate-900/40 text-slate-300'
                                : 'bg-slate-800/30 text-slate-300'
                            }`}
                          >
                            {cols.map((val, cIdx) => (
                              <td
                                key={cIdx}
                                className={`py-1.5 px-2.5 leading-snug ${
                                  cIdx === 0
                                    ? 'font-bold text-slate-200 text-center whitespace-nowrap'
                                    : cIdx === 1 && cols.length > 2
                                    ? 'font-semibold text-center'
                                    : ''
                                }`}
                              >
                                {val}
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Footnote note */}
                {sheet.note && (
                  <p className="text-[10px] text-slate-400 leading-normal mt-1.5">
                    {sheet.note}
                  </p>
                )}

                {/* Close button */}
                <div className="mt-2.5 text-center">
                  <button
                    type="button"
                    onClick={() => toggleExpand(sheet.id)}
                    className="text-[11px] text-slate-400 hover:text-sky-300 underline font-medium"
                  >
                    ▲ 早見表を折りたたむ
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
