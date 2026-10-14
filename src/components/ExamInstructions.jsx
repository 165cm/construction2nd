import React from 'react';

export default function ExamInstructions({ question }) {
  const wiring = question.id >= 31;
  return (
    <details className="mb-3 text-xs text-slate-300 rounded-xl border border-slate-700 px-3">
      <summary className="cursor-pointer min-h-[44px] flex items-center">{wiring ? '配線図問題の共通条件を確認' : '計算問題の共通条件を確認'}</summary>
      {wiring ? (
        <ul className="list-disc pl-4 pb-3 space-y-2 leading-relaxed">
          <li>{question.examId === 'r6_2'
            ? '特記のない屋内配線は、電灯回路に600Vビニル絶縁ビニルシースケーブル平形（VVF）、動力回路に600V架橋ポリエチレン絶縁ビニルシースケーブル（CV）を使用します。'
            : '特記のない屋内配線は、600Vビニル絶縁ビニルシースケーブル平形（VVF）によるケーブル工事です。'}</li>
          <li>屋内配線等の電線の本数、電線の太さ、その他、問いに直接関係のない部分は簡略化又は省略されています。</li>
          <li>漏電遮断器は、定格感度電流30 mA、動作時間0.1秒以内のものを使用しています。</li>
          <li>選択肢の写真にあるコンセント及び点滅器は、特記のない限りJIS C 0303:2000の「一般形」で示されています。</li>
          {question.examId === 'r8_1'
            ? <li>図記号で示す一般用照明にはLED照明器具を使用し、選択肢の照明器具もすべてLED照明器具です。</li>
            : question.examId !== 'r6_2' && <li>{question.examId === 'r6_1' ? '配電盤及び動力分電盤' : question.examId === 'r7_1' ? '配電盤、分電盤及び制御盤' : '分電盤'}の外箱は金属製です。</li>}
          <li>ジョイントボックスを経由する電線は、すべて接続箇所を設けています。</li>
          <li>3路スイッチの「0」端子には、電源側又は負荷側の電線を結線します。</li>
        </ul>
      ) : <p className="pb-3 leading-relaxed">√2 = 1.41、√3 = 1.73、π = 3.14 を用います。選択肢が数値の場合は、最も近い値を選んでください。</p>}
    </details>
  );
}
