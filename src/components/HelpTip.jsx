import React, { useId, useState } from 'react';

// タップ・キーボードで開く補足。小さな画面でも見切れないよう本文を直下に展開する。
export default function HelpTip({ label, children, title }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return <span className={title ? "block w-full" : "inline-block max-w-full"} onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }}>
    <button type="button" aria-label={label} aria-expanded={open} aria-controls={id}
      onClick={() => setOpen(value => !value)}
      className={`${title ? "w-full flex items-center justify-between gap-2" : "min-w-[44px]"} min-h-[44px] rounded-lg text-sky-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300`}>{title && <span className="text-sm font-bold text-white">{title}</span>}<span aria-hidden="true">ⓘ</span></button>
    {open && <span id={id} className="block rounded-lg border border-slate-600 bg-slate-900 p-3 text-xs font-normal text-slate-300 leading-relaxed">{children}</span>}
  </span>;
}
