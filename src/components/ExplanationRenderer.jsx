import React from 'react';

// Helper to clean any raw LaTeX / math commands into user-friendly text
export function cleanLatex(text) {
  if (!text || typeof text !== 'string') return text;
  return text
    .replace(/\\text\{([^}]+)\}/g, '$1')
    .replace(/\\mathbf\{([^}]+)\}/g, '$1')
    .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '$1 / $2')
    .replace(/\\sqrt\{([^}]+)\}/g, '√$1')
    .replace(/\\times/g, '×')
    .replace(/\\Omega/g, 'Ω')
    .replace(/\\fallingdotseq/g, '≒')
    .replace(/\\leqq/g, '≦')
    .replace(/\\geqq/g, '≧')
    .replace(/\\rho/g, 'ρ')
    .replace(/\\\(/g, '')
    .replace(/\\\)/g, '')
    .replace(/\\/g, '');
}

// Helper to render inline markdown highlights (**bold**, ◯, ✕, 正解 badges)
export function renderFormattedText(rawText, isAnswerRow = false) {
  if (!rawText) return null;
  const text = cleanLatex(rawText);

  // Split by bold markdown **...**
  const parts = text.split(/(\*\*.*?\*\*)/g);

  return parts.map((part, idx) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      const inner = part.slice(2, -2);
      // Highlight bold text
      return (
        <strong
          key={idx}
          className={`${
            isAnswerRow ? 'text-emerald-300 font-black' : 'text-volt-electric font-bold'
          }`}
        >
          {inner}
        </strong>
      );
    }

    // Replace ◯, ✕, 正解 badges with visual pills
    // We split by badges
    const badgeParts = part.split(/(◯\s*(?:正|適合|適切)?|✕\s*(?:誤|不適合|不適切|不可)?|正解)/g);

    return (
      <React.Fragment key={idx}>
        {badgeParts.map((bPart, bIdx) => {
          if (bPart.startsWith('◯')) {
            return (
              <span
                key={bIdx}
                className="inline-flex items-center px-1.5 py-0.2 mx-0.5 rounded text-[10px] font-black bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shrink-0"
              >
                {bPart.trim()}
              </span>
            );
          }
          if (bPart.startsWith('✕')) {
            return (
              <span
                key={bIdx}
                className="inline-flex items-center px-1.5 py-0.2 mx-0.5 rounded text-[10px] font-black bg-rose-500/20 text-rose-400 border border-rose-500/30 shrink-0"
              >
                {bPart.trim()}
              </span>
            );
          }
          if (bPart === '正解') {
            return (
              <span
                key={bIdx}
                className="inline-flex items-center px-1.5 py-0.2 mx-0.5 rounded text-[10px] font-black bg-amber-500/20 text-amber-300 border border-amber-500/30 shrink-0"
              >
                ★正解
              </span>
            );
          }
          return bPart;
        })}
      </React.Fragment>
    );
  });
}

// Parses markdown text into blocks (tables vs text paragraphs)
export default function ExplanationRenderer({ explanation, answerChoice }) {
  if (!explanation) return null;

  const lines = explanation.split('\n');
  const blocks = [];
  let currentTable = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Check if line is a table row: starts and ends with '|'
    if (line.startsWith('|') && line.endsWith('|')) {
      if (!currentTable) {
        currentTable = [];
      }
      currentTable.push(line);
    } else {
      if (currentTable) {
        blocks.push({ type: 'table', rows: currentTable });
        currentTable = null;
      }
      if (line.length > 0) {
        blocks.push({ type: 'text', content: line });
      }
    }
  }

  if (currentTable) {
    blocks.push({ type: 'table', rows: currentTable });
  }

  return (
    <div className="space-y-2.5 text-xs">
      {blocks.map((block, bIdx) => {
        if (block.type === 'text') {
          return (
            <p key={bIdx} className="leading-relaxed text-slate-300 text-[11.5px]">
              {renderFormattedText(block.content)}
            </p>
          );
        }

        // Render Markdown Table
        const rows = block.rows;
        // 管理画面で保存された1行だけの表も、解説を消さずに表示する。
        if (rows.length < 2) return <p key={bIdx} className="leading-relaxed text-slate-300">{renderFormattedText(rows[0].slice(1, -1).replaceAll('|', ' ／ '))}</p>;

        // Parse header
        const headerCells = rows[0]
          .slice(1, -1)
          .split('|')
          .map(c => c.trim());

        // Skip row 1 if it's separator row (contains '---')
        const dataRows = rows.slice(rows[1].includes('---') ? 2 : 1);

        return (
          <div
            key={bIdx}
            className="overflow-x-auto rounded-xl border border-slate-700/80 bg-slate-900/90 shadow-md my-2 no-scrollbar"
          >
            <table className="w-full text-left border-collapse text-[11px]">
              <thead>
                <tr className="bg-slate-800/90 text-sky-400 border-b border-slate-700 font-bold">
                  {headerCells.map((h, hIdx) => (
                    <th key={hIdx} className="py-2 px-2.5 whitespace-nowrap text-center">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {dataRows.map((rStr, rIdx) => {
                  const cells = rStr
                    .slice(1, -1)
                    .split('|')
                    .map(c => c.trim());

                  // Check if row contains the correct answer choice
                  const rowText = rStr;
                  const isAnswerRow =
                    rowText.includes('正解') ||
                    (answerChoice &&
                      (cells[0]?.includes(answerChoice) ||
                        rowText.includes(`**${answerChoice}**`)));

                  return (
                    <tr
                      key={rIdx}
                      className={`transition ${
                        isAnswerRow
                          ? 'bg-emerald-950/40 border-l-2 border-l-emerald-400 font-medium'
                          : rIdx % 2 === 0
                          ? 'bg-slate-900/40'
                          : 'bg-slate-800/30'
                      }`}
                    >
                      {cells.map((cell, cIdx) => (
                        <td
                          key={cIdx}
                          className={`py-2 px-2.5 leading-snug ${
                            cIdx === 0
                              ? 'text-center font-bold text-slate-200'
                              : 'text-slate-300'
                          }`}
                        >
                          {renderFormattedText(cell, isAnswerRow)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
