import React from 'react';
import { Zap, Flame, Clock, BookOpen, Trophy } from 'lucide-react';
import { playClick } from '../utils/sound';

export default function BottomNav({ currentMode, onSelectMode, reviewCount, onOpenStats }) {
  const tabs = [
    { id: 'quiz', label: '通常サクサク', icon: Zap },
    { id: 'review', label: '弱点特訓', icon: Flame, badge: reviewCount },
    { id: 'exam', label: '本番模試', icon: Clock },
    { id: 'list', label: '問題一覧', icon: BookOpen },
    { id: 'stats', label: '成績・実績', icon: Trophy, isAction: true },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 pb-[env(safe-area-inset-bottom,0px)] shadow-2xl">
      <div className="flex items-center justify-around h-14 max-w-lg mx-auto px-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = currentMode === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => {
                playClick();
                if (tab.isAction) {
                  onOpenStats();
                } else {
                  onSelectMode(tab.id);
                }
              }}
              className={`flex-1 flex flex-col items-center justify-center py-1 relative transition active:scale-90 ${
                isActive ? 'text-sky-400 font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="relative">
                <Icon size={20} className={isActive ? 'stroke-[2.5]' : 'stroke-2'} />
                {tab.badge > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 bg-rose-500 text-white text-[9px] font-black px-1.5 py-0.2 rounded-full min-w-[14px] text-center animate-pulse">
                    {tab.badge}
                  </span>
                )}
              </div>
              <span className="text-[10px] mt-0.5 leading-none">
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
