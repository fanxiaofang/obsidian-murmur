import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Calendar,
  Hash,
  Waves,
  MoreHorizontal,
  MoreVertical,
  Plus,
  Search,
  Settings,
  Compass,
  X,
  Pencil,
  Trash2,
  ChevronRight,
  ChevronLeft,
  ChevronUp,
  Telescope,
  Gauge,
  Activity,
  Lock
} from 'lucide-react';
import { Notice, Platform, type App as ObsidianApp } from 'obsidian';
import { useBgm } from './audio/useBgm';
import { BgmControl } from './audio/BgmControl';
import type { BgmManager } from './audio/BgmManager';
import { motion, AnimatePresence } from 'motion/react';
import { useMurmurData } from './data/use-murmur-data';
import type { MurmurDataSource, Note } from './domain/types';

type FilterType = 'tag' | 'type' | 'text' | 'date';
type FilterAction = 'include' | 'exclude' | 'is' | 'isNot' | 'before' | 'after' | 'within';

interface FilterCondition {
  id: string;
  type: FilterType;
  action: FilterAction;
  value: any;
}

interface Paradigm {
  id: string;
  name: string;
  conditions: FilterCondition[];
  isActive: boolean;
}

const evaluateParadigm = (p: Paradigm, note: Note) => {
  if (!p.conditions || p.conditions.length === 0) return true;
  return p.conditions.every(c => {
    switch (c.type) {
      case 'tag':
        return c.action === 'include' ? note.tags.includes(c.value) : !note.tags.includes(c.value);
      case 'text':
        const content = note.content.toLowerCase();
        const val = (c.value || '').toLowerCase();
        return c.action === 'include' ? content.includes(val) : !content.includes(val);
      case 'type':
        if (c.value === 'link') return c.action === 'is' ? note.content.includes('[[') : !note.content.includes('[[');
        if (c.value === 'image') return c.action === 'is' ? note.content.includes('![[') : !note.content.includes('![[');
        if (c.value === 'no-tag') return c.action === 'is' ? note.tags.length === 0 : note.tags.length > 0;
        return true;
      case 'date': {
        const nd = new Date(note.date + 'T00:00:00');
        const noteDay = nd.getTime();
        if (isNaN(noteDay)) return true;

        let targetDay: number;
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        if (c.value === 'today') {
          targetDay = todayStart.getTime();
        } else if (c.value === 'yesterday') {
          const y = new Date(todayStart);
          y.setDate(y.getDate() - 1);
          targetDay = y.getTime();
        } else if (c.value?.endsWith('d')) {
          const d = parseInt(c.value);
          const past = new Date(todayStart);
          past.setDate(past.getDate() - d);
          targetDay = past.getTime();
        } else {
          const sd = new Date(c.value + 'T00:00:00');
          targetDay = sd.getTime();
        }

        if (isNaN(targetDay)) return true;
        if (c.action === 'is') return noteDay === targetDay;
        if (c.action === 'isNot') return noteDay !== targetDay;
        if (c.action === 'before') return noteDay < targetDay;
        if (c.action === 'after') return noteDay > targetDay;
        return true;
      }
      default: return true;
    }
  });
};

interface AppProps {
  app: ObsidianApp;
  dataSource: MurmurDataSource;
  bgmManager?: BgmManager | null;
  onOpenSettings?: () => void;
}

/**
 * Murmur 核心审美调色盘
 * 用于统一管理全插件的色彩系统，确保机械感视觉的一致性
 */
const MURMUR_COLORS = {
  // --- 核心品牌色 ---
  teal: '#4ad88c',          // 工业青 (用于导轨、主轨道、常规节点边框)
  gold: '#eab308',          // 琥珀金 (用于悬浮高亮、交互反馈、次级轨道)
  core: '#2dd4bf',          // 脉冲心 (用于节点中心极小点的强发光)
  orange: '#f59e0b',        // 橙色 (用于警示、特殊高亮)

  // --- 容器与背景 ---
  cardBg: '#1a1a1e',        // 笔记卡片基础背景色
  cardHover: '#252528',     // 笔记卡片悬浮时的加深背景色
  sidebar: '#141414',       // 侧边栏背景
  paper: '#0c0c0c',         // 主笔记区背景深色

  // --- 文字与墨水 ---
  ink: '#d1d1d1',           // 墨水白 (主要文字颜色)
  inkDim: 'rgba(209,209,209,0.3)', // 调暗的文字

  // --- 透明度与辅助色 ---
  border: 'rgba(255,255,255,0.05)', // 通用极细边框
  glowTeal: 'rgba(45,212,191,0.2)',  // 青色弥散阴影
  glowGold: 'rgba(234,179,8,0.2)',   // 琥珀色弥散阴影
};

type HeatmapCell = {
  date: string;
  count: number;
};

function formatDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatDateDisplay(date: string) {
  const d = new Date(date);
  if (isNaN(d.getTime())) return date;
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return `${year}.${month}.${day} ${weekDays[d.getDay()]}`;
}

function buildHeatmapCells(notes: Note[]): HeatmapCell[] {
  const counts = new Map<string, number>();
  notes.forEach((note) => {
    counts.set(note.date, (counts.get(note.date) || 0) + 1);
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Align start date to Sunday of 11 weeks ago (84 cells total = 12 columns)
  // today.getDay() returns 0 for Sunday, 1 for Monday, etc.
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - today.getDay() - (11 * 7));

  return Array.from({ length: 84 }, (_, index) => {
    const current = new Date(startDate);
    current.setDate(startDate.getDate() + index);
    const key = formatDateKey(current);

    return {
      date: key,
      count: counts.get(key) || 0,
    };
  });
}

function getHeatmapCellClasses(count: number) {
  // Lv.0 (无)
  let cellStyle = 'bg-[#1a110a]/60 border-white/5 transition-all duration-1000';
  let glowStyle = '';

  if (count <= 0) {
    return { cellStyle, glowStyle };
  }

  // Lv.1-4 (活跃)
  if (count >= 1 && count <= 4) {
    cellStyle = 'bg-[#fbbf24] border-[#fbbf24]/50 shadow-[inset_0_1px_1px_rgba(255,255,255,0.4)]';
  }
  // Lv.5-9 (高产)
  else if (count >= 5 && count <= 9) {
    cellStyle = 'bg-[#b45309] border-[#b45309]/50 shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)]';
  }
  // Lv.10+ (爆发)
  else if (count >= 10) {
    cellStyle = 'bg-[#d97706] border-[#f59e0b] shadow-[inset_0_1px_1px_rgba(255,255,255,0.4)]';
    glowStyle = 'shadow-[0_0_12px_#d97706] saturate-150 animate-pulse-slow';
  }

  return { cellStyle, glowStyle };
}

// --- Tag Dynamic Styling Logic ---
const getDynamicTagStyle = (name: string, active: boolean) => {
  // Generate deterministic HSL style for all tags
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;

  if (active) {
    return {
      className: 'bg-vintage-orange/10 border-vintage-orange/30 shadow-[0_0_10px_rgba(245,158,11,0.15)]',
      dotClassName: 'bg-vintage-orange shadow-[0_0_6px_rgba(245,158,11,0.8)]',
      textClassName: 'text-vintage-orange font-medium'
    };
  }

  return {
    className: 'border-transparent hover:bg-[var(--murmur-card)] hover:border-vintage-orange/20',
    style: {
      backgroundColor: `hsla(${h}, 35%, 15%, 0.4)`,
      borderColor: `hsla(${h}, 35%, 25%, 0.2)`,
    },
    dotStyle: {
      backgroundColor: `hsla(${h}, 60%, 60%, 0.6)`,
    },
    textStyle: {
      color: `hsla(${h}, 40%, 75%, 0.5)`,
    }
  };
};


// --- Components ---

const SunBirdIcon = ({ size = 24, className = "" }: { size?: number; className?: string }) => (
  <svg viewBox="0 0 100 100" width={size} height={size} className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* 核心旋转火芒 (12条) */}
    <g transform="translate(50, 50)">
      {[...Array(12)].map((_, i) => (
        <path
          key={i}
          d="M0 -15 C 10 -15, 15 -8, 15 0 C 15 8, 10 15, 0 15 L -4 0 Z"
          transform={`rotate(${i * 30 + 15}) translate(0, -8) skewX(-25)`}
          fill="currentColor"
          className="opacity-90"
        />
      ))}
    </g>
    {/* 四只环绕的神鸟 */}
    {[0, 90, 180, 270].map((rot) => (
      <g key={rot} transform={`rotate(${rot} 50 50)`}>
        {/* 飞行轨迹线 - 极淡 */}
        <circle cx="50" cy="50" r="38" stroke="currentColor" strokeWidth="0.5" className="opacity-10" />
        {/* 简化的神鸟剪影 */}
        <path
          d="M85 50 C 85 42, 80 38, 72 38 C 76 38, 80 34, 80 28 C 84 32, 92 38, 85 50 Z"
          fill="currentColor"
          className="opacity-70"
          transform="translate(2, -4) rotate(15 85 50)"
        />
      </g>
    ))}
  </svg>
);

const ViewItem = ({
  name,
  count,
  active,
  onClick,
  onDelete,
  onPin
}: {
  name: string;
  count: number;
  active: boolean;
  onClick: () => void;
  onDelete?: () => void;
  onPin?: () => void;
  key?: string;
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };
    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showMenu]);

  return (
    <div
      onClick={onClick}
      onMouseLeave={() => setShowMenu(false)}
      className={`
      flex items-center justify-between px-4 py-3 cursor-pointer transition-all duration-500 group relative rounded-lg mx-1 overflow-visible
      ${active
          ? 'bg-white/[0.04] shadow-[0_4px_12px_rgba(0,0,0,0.3),inset_0_1px_1px_rgba(255,255,255,0.05)] text-white'
          : 'hover:bg-white/[0.02] text-ink/40'}
    `}>
      {/* Background Decorative Element */}
      <div className={`absolute inset-0 bg-gradient-to-r from-vintage-orange/5 to-transparent transition-opacity duration-700 rounded-lg ${active ? 'opacity-100' : 'opacity-0 group-hover:opacity-40'}`} />

      {/* Left Indicator Line */}
      <div className={`
        absolute left-0 top-2 bottom-2 transition-all duration-500 rounded-r z-20
        ${active
          ? 'w-[3px] bg-vintage-orange shadow-[0_0_12px_rgba(245,158,11,0.4)]'
          : 'w-[1px] bg-white/5 group-hover:bg-white/20 group-hover:w-[2px]'}
      `} />

      <div className="flex items-center gap-3 relative z-10 transition-transform duration-500 group-hover:translate-x-1">
        <span className={`text-sm tracking-wide transition-all duration-300 ${active ? 'font-bold opacity-100' : 'group-hover:text-ink/90'} uppercase font-serif`}>
          {name}
        </span>
      </div>

      <div className="flex items-center gap-3 relative z-10">
        <span className={`
          text-[11px] font-mono transition-all duration-500
          ${active ? 'text-vintage-orange font-black scale-110' : 'text-ink/20 group-hover:text-ink/60'}
        `}>
          {count.toString().padStart(2, '0')}
        </span>

        {(onDelete || onPin) && (
          <div className="relative" ref={menuRef}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(!showMenu);
              }}
              className="p-1 hover:bg-white/10 rounded transition-all opacity-0 group-hover:opacity-100 text-ink/30 hover:text-vintage-teal"
            >
              <MoreHorizontal size={14} />
            </button>

            <AnimatePresence>
              {showMenu && (
                <motion.div
                  initial={{ opacity: 0, y: 5, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 5, scale: 0.95 }}
                  className="absolute right-0 top-full mt-1 bg-[var(--murmur-card)] border border-[var(--murmur-border)] rounded-md shadow-2xl py-1 flex flex-col min-w-[80px] z-[60] overflow-hidden"
                >
                  {onPin && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onPin(); setShowMenu(false); }}
                      className="px-3 py-1.5 text-[11px] text-left hover:bg-white/5 flex items-center gap-2 text-ink/60 hover:text-white transition-colors"
                    >
                      <ChevronUp size={12} />
                      置顶
                    </button>
                  )}
                  {onDelete && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onDelete(); setShowMenu(false); }}
                      className="px-3 py-1.5 text-[11px] text-left hover:bg-white/5 flex items-center gap-2 text-red-400 hover:text-red-300 transition-colors"
                    >
                      <Trash2 size={12} />
                      删除
                    </button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Note Card Style Corners (Hover/Active) */}
      <div className={`absolute inset-0 pointer-events-none transition-opacity duration-500 rounded-lg overflow-hidden ${active ? 'opacity-30' : 'opacity-0 group-hover:opacity-20'}`}>
        <div className="absolute top-0 left-0 w-1.5 h-1.5 border-t border-l border-vintage-orange" />
        <div className="absolute bottom-0 right-0 w-1.5 h-1.5 border-b border-r border-vintage-orange" />
      </div>
    </div>
  );
};

const TagBadge = ({ name, count, active, onClick }: { name: string; count: number; active: boolean; onClick: () => void; key?: string }) => {
  const styles = getDynamicTagStyle(name, active);

  return (
    <div
      onClick={onClick}
      className={`
        flex items-center gap-1.5 group cursor-pointer py-1 px-2.5 rounded transition-all border
        ${styles.className}
      `}
      style={styles.style}
    >
      <div
        className={`w-1 h-1 rounded-full opacity-60 group-hover:opacity-100 transition-all ${styles.dotClassName || ''}`}
        style={styles.dotStyle}
      />
      <span
        className={`text-[12px] font-sans tracking-wide transition-colors ${styles.textClassName || ''}`}
        style={styles.textStyle}
      >
        {name}
      </span>
      <span className={`text-[10px] font-mono ${active ? 'text-vintage-orange/60' : 'text-ink/20 group-hover:text-ink/40'} ml-0.5`}>
        {count}
      </span>
    </div>
  );
};


// --- Paradigm Editor Components ---

const DateSelector = ({ value, onChange }: { value: any, onChange: (val: any) => void }) => {
  const [showCalendar, setShowCalendar] = useState(false);
  const [calTop, setCalTop] = useState(0);
  const triggerRef = useRef<HTMLDivElement>(null);

  const openCalendar = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    setCalTop(rect ? rect.bottom + 8 : 0);
    setShowCalendar(true);
  };

  const today = new Date();
  const currentYear = today.getFullYear();
  const currentMonth = today.getMonth() + 1;
  const todayDay = today.getDate();
  const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
  const monthStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}`;

  const presets = [
    { label: '今天', value: 'today' },
    { label: '昨天', value: 'yesterday' },
    { label: '最近 7 天', value: '7d' },
    { label: '最近 30 天', value: '30d' },
    { label: '最近 90 天', value: '90d' },
    { label: '最近 180 天', value: '180d' },
    { label: '最近 365 天', value: '365d' },
  ];

  return (
    <div className="relative">
      <div
        ref={triggerRef}
        onClick={() => openCalendar()}
        className="flex items-center gap-2 px-3 py-1.5 bg-black/40 border border-white/5 rounded hover:border-vintage-orange/30 cursor-pointer transition-all"
      >
        <Calendar size={14} className="text-vintage-orange/60" />
        <span className="text-[11px] text-stone-400 font-mono">
          {typeof value === 'string' ? presets.find(p => p.value === value)?.label || value || '选择日期...' : '选择日期...'}
        </span>
      </div>

      <AnimatePresence>
        {showCalendar && (
          <>
            <div className="fixed inset-0 z-[100]" onClick={() => setShowCalendar(false)} />
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              className="z-[300] flex bg-[#0c0c0c] border border-white/10 rounded-lg shadow-2xl overflow-hidden"
              style={{ position: 'fixed', top: calTop, left: '50%', marginLeft: '-200px' }}
            >
              <div className="w-32 border-r border-white/5 py-2 bg-white/[0.02]">
                {presets.map(p => (
                  <button
                    key={p.value}
                    onClick={() => { onChange(p.value); setShowCalendar(false); }}
                    className="w-full px-4 py-2 text-left text-[11px] text-stone-500 hover:text-vintage-orange hover:bg-vintage-orange/5 transition-all font-mono"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <div className="p-4 w-64">
                <div className="grid grid-cols-7 gap-1 text-center">
                  {['日', '一', '二', '三', '四', '五', '六'].map(d => (
                    <span key={d} className="text-[10px] text-stone-600 mb-2">{d}</span>
                  ))}
                  {Array.from({ length: daysInMonth }).map((_, i) => {
                    const day = i + 1;
                    const dateStr = `${monthStr}-${String(day).padStart(2, '0')}`;
                    const isToday = day === todayDay;
                    return (
                      <button
                        key={i}
                        onClick={() => { onChange(dateStr); setShowCalendar(false); }}
                        className={`aspect-square flex items-center justify-center text-[11px] rounded hover:bg-vintage-orange/20 hover:text-vintage-orange transition-all font-mono ${isToday ? 'bg-vintage-orange/10 text-vintage-orange border border-vintage-orange/30' : 'text-stone-400'}`}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};

const stopKeyboardPropagation = (event: React.KeyboardEvent<HTMLElement>) => {
  event.stopPropagation();
  const nativeEvent = event.nativeEvent as KeyboardEvent & { stopImmediatePropagation?: () => void };
  nativeEvent.stopImmediatePropagation?.();
};

const ParadigmEditor = ({ isOpen, onClose, onSave }: any) => {
  const [draft, setDraft] = React.useState<Partial<Paradigm>>({ name: '', conditions: [] });

  React.useEffect(() => {
    if (isOpen) setDraft({ name: '', conditions: [] });
  }, [isOpen]);

  const handleSave = () => {
    if (!draft.name?.trim()) return;
    onSave({ ...draft, name: draft.name.trim(), conditions: draft.conditions || [] });
  };

  const addCondition = () => {
    const newCondition: FilterCondition = { id: Math.random().toString(36).substr(2, 9), type: 'tag', action: 'include', value: '' };
    setDraft({ ...draft, conditions: [...(draft.conditions || []), newCondition] });
  };
  const updateCondition = (id: string, updates: Partial<FilterCondition>) => {
    setDraft({ ...draft, conditions: draft.conditions?.map((c: any) => c.id === id ? { ...c, ...updates } : c) });
  };
  const removeCondition = (id: string) => {
    setDraft({ ...draft, conditions: draft.conditions?.filter((c: any) => c.id !== id) });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-[#0c0c0c]/95"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="paradigm-editor-modal relative z-10 w-full max-w-2xl bg-[#0c0c0c] border border-vintage-orange/20 rounded-xl shadow-[0_10px_25px_rgba(0,0,0,0.8)]"
            onClick={(e) => e.stopPropagation()}
            onKeyDownCapture={stopKeyboardPropagation}
          >
            <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-vintage-orange/10 rounded-lg"><Plus className="text-vintage-orange" size={18} /></div>
                <div>
                  <h2 className="text-lg font-serif font-bold text-vintage-orange tracking-wider">锻造新范式</h2>
                  <p className="text-[10px] text-stone-500 uppercase tracking-widest">Forge New Search Paradigm</p>
                </div>
              </div>
              <button onClick={onClose} className="text-stone-500 hover:text-white transition-colors"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto scrollbar-hide">
              <div className="space-y-2">
                <label className="text-[11px] text-vintage-orange/40 uppercase tracking-[0.2em] ml-1">范式名称</label>
                <input
                  type="text"
                  value={draft.name || ''}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="输入范式名称..."
                  className="w-full bg-black/40 border border-white/5 rounded-lg px-4 py-3 text-stone-300 focus:outline-none focus:border-vintage-orange/40 transition-all font-mono native-key-bindings"
                  autoFocus
                />
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] text-vintage-orange/40 uppercase tracking-[0.2em] ml-1">筛选器链</label>
                  <button onClick={addCondition} className="flex items-center gap-2 text-[10px] text-vintage-teal hover:text-teal-300 transition-colors font-bold uppercase tracking-widest"><Plus size={12} /> 添加检索条件</button>
                </div>
                <div className="space-y-3">
                  {draft.conditions?.map((c: FilterCondition) => (
                    <div key={c.id} className="group flex items-center gap-3 p-3 bg-white/[0.02] border border-white/5 rounded-lg">
                      <div className="flex items-center gap-2 min-w-[100px]">
                        <select
                          value={c.type}
                          onChange={(e) => {
                            const newType = e.target.value;
                            const defaultActions: Record<string, FilterAction> = { tag: 'include', type: 'is', text: 'include', date: 'is' };
                            updateCondition(c.id, { type: newType as any, action: defaultActions[newType] || 'include' });
                          }}
                          className="bg-black/40 text-[11px] text-vintage-orange/60 font-mono focus:outline-none cursor-pointer border border-white/5 rounded px-2 py-1"
                        >
                          <option value="tag" style={{ background: '#1a1a1a', color: '#d1d1d1' }}>标签</option>
                          <option value="type" style={{ background: '#1a1a1a', color: '#d1d1d1' }}>类型</option>
                          <option value="text" style={{ background: '#1a1a1a', color: '#d1d1d1' }}>文本</option>
                          <option value="date" style={{ background: '#1a1a1a', color: '#d1d1d1' }}>日期</option>
                        </select>
                      </div>
                      <select
                        value={c.action}
                        onChange={(e) => updateCondition(c.id, { action: e.target.value as any })}
                        className="bg-black/40 text-[11px] text-vintage-orange/60 font-mono focus:outline-none cursor-pointer border border-white/5 rounded px-2 py-1"
                      >
                        {c.type === 'tag' && <><option value="include" style={{ background: '#1a1a1a', color: '#d1d1d1' }}>包含</option><option value="exclude" style={{ background: '#1a1a1a', color: '#d1d1d1' }}>排除</option></>}
                        {c.type === 'type' && <><option value="is" style={{ background: '#1a1a1a', color: '#d1d1d1' }}>是</option><option value="isNot" style={{ background: '#1a1a1a', color: '#d1d1d1' }}>不是</option></>}
                        {c.type === 'text' && <><option value="include" style={{ background: '#1a1a1a', color: '#d1d1d1' }}>包含</option><option value="exclude" style={{ background: '#1a1a1a', color: '#d1d1d1' }}>排除</option></>}
                        {c.type === 'date' && <><option value="is" style={{ background: '#1a1a1a', color: '#d1d1d1' }}>是</option><option value="before" style={{ background: '#1a1a1a', color: '#d1d1d1' }}>之前</option><option value="after" style={{ background: '#1a1a1a', color: '#d1d1d1' }}>之后</option></>}
                      </select>
                      <div className="flex-1">
                        {c.type === 'tag' && (
                          <input
                            type="text"
                            value={c.value || ''}
                            onChange={(e) => updateCondition(c.id, { value: e.target.value })}
                            placeholder="输入标签..."
                            className="w-full bg-black/40 border border-white/5 rounded px-3 py-1.5 text-[11px] text-stone-400 font-mono native-key-bindings"
                          />
                        )}
                        {c.type === 'type' && (
                          <select
                            value={c.value}
                            onChange={(e) => updateCondition(c.id, { value: e.target.value })}
                            className="w-full bg-black/40 border border-white/5 rounded px-3 py-1.5 text-[11px] text-stone-400 font-mono"
                          >
                            <option value="" style={{ background: '#1a1a1a', color: '#d1d1d1' }}>选择类型...</option>
                            <option value="link" style={{ background: '#1a1a1a', color: '#d1d1d1' }}>有链接</option>
                            <option value="no-tag" style={{ background: '#1a1a1a', color: '#d1d1d1' }}>无标签</option>
                            <option value="image" style={{ background: '#1a1a1a', color: '#d1d1d1' }}>有图片</option>
                          </select>
                        )}
                        {c.type === 'text' && (
                          <input
                            type="text"
                            value={c.value || ''}
                            onChange={(e) => updateCondition(c.id, { value: e.target.value })}
                            placeholder="匹配文本..."
                            className="w-full bg-black/40 border border-white/5 rounded px-3 py-1.5 text-[11px] text-stone-400 font-mono native-key-bindings"
                          />
                        )}
                        {c.type === 'date' && <DateSelector value={c.value} onChange={(val) => updateCondition(c.id, { value: val })} />}
                      </div>
                      <button onClick={() => removeCondition(c.id)} className="p-1.5 text-stone-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"><Trash2 size={14} /></button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-white/5 bg-white/[0.01] flex items-center justify-between">
              <button onClick={onClose} className="text-[11px] font-mono text-stone-500 hover:text-white uppercase tracking-widest">Cancel</button>
              <button onClick={handleSave} disabled={!draft.name?.trim()} className={`px-8 py-2 rounded border font-mono font-bold text-[11px] tracking-[0.2em] uppercase transition-all ${draft.name?.trim() ? 'bg-vintage-orange/10 border-vintage-orange/40 text-vintage-orange hover:bg-vintage-orange hover:text-black' : 'bg-transparent border-white/5 text-white/10 cursor-not-allowed'}`}>Start_Forge</button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default function App({ app, dataSource, bgmManager = null, onOpenSettings }: AppProps) {
  const [isCreatingParadigm, setIsCreatingParadigm] = useState(false);

  const [paradigms, setParadigms] = useState<Paradigm[]>([]);
  const [activeParadigmId, setActiveParadigmId] = useState<string | null>(null);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [bgmMenuOpen, setBgmMenuOpen] = useState(false);

  const bgm = useBgm(bgmManager);

  const activeParadigm = activeParadigmId ? paradigms.find(p => p.id === activeParadigmId) || null : null;
  const { notes, stats, sortedTags, isLoading, error, refresh } = useMurmurData(dataSource);
  const filteredNotes = useMemo(() => {
    return notes.filter((note) => {
      const matchesTag = selectedTag ? note.tags.includes(selectedTag) : true;
      const matchesParadigm = activeParadigm ? evaluateParadigm(activeParadigm, note) : true;

      return matchesTag && matchesParadigm;
    });
  }, [activeParadigm, notes, selectedTag]);
  const groupedNotes = useMemo(() => {
    return filteredNotes.reduce<Record<string, Note[]>>((accumulator, note) => {
      if (!accumulator[note.date]) {
        accumulator[note.date] = [];
      }

      accumulator[note.date].push(note);
      return accumulator;
    }, {})
  }, [filteredNotes]);

  const paradigmCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of paradigms) {
      map.set(p.id, notes.filter(n => evaluateParadigm(p, n)).length);
    }
    return map;
  }, [paradigms, notes]);

  const MAX_INITIAL_DAYS = 14;
  const LOAD_MORE_BATCH = 14;
  const [visibleDayCount, setVisibleDayCount] = useState(MAX_INITIAL_DAYS);
  const visibleGroupedNotes = useMemo(() => {
    const entries = Object.entries(groupedNotes);
    return Object.fromEntries(entries.slice(0, visibleDayCount));
  }, [groupedNotes, visibleDayCount]);
  const totalDayCount = Object.keys(groupedNotes).length;
  const hasMoreDays = visibleDayCount < totalDayCount;

  const handleLoadMoreDays = React.useCallback(() => {
    if (scrollContainerRef.current) {
      const prevHeight = scrollContainerRef.current.scrollHeight;
      setVisibleDayCount((prev) => Math.min(prev + LOAD_MORE_BATCH, totalDayCount));
      requestAnimationFrame(() => {
        if (scrollContainerRef.current) {
          scrollContainerRef.current.scrollTop += scrollContainerRef.current.scrollHeight - prevHeight;
        }
      });
    } else {
      setVisibleDayCount((prev) => Math.min(prev + LOAD_MORE_BATCH, totalDayCount));
    }
  }, [totalDayCount]);

  React.useEffect(() => {
    setVisibleDayCount(MAX_INITIAL_DAYS);
  }, [notes]);

  const [inputText, setInputText] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const heatmapContainerRef = useRef<HTMLDivElement>(null);
  const appContainerRef = useRef<HTMLDivElement>(null);
  const [heatmapWidth, setHeatmapWidth] = useState(0);
  const [viewWidth, setViewWidth] = useState(0);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isMobile] = useState(() =>
    typeof document !== 'undefined' ? document.body.classList.contains('is-mobile') : false
  );
  // Force blur the main textarea when paradigm editor opens
  React.useEffect(() => {
    if (isCreatingParadigm && textareaRef.current) {
      textareaRef.current.blur();
      setIsFocused(false);
    }
  }, [isCreatingParadigm]);

  // ResizeObserver: track app container width for overall responsive layout
  React.useEffect(() => {
    const el = appContainerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(entries => {
      const newWidth = entries[0].contentRect.width;
      setViewWidth((prev) => Math.abs(prev - newWidth) < 10 ? prev : newWidth);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const isNarrow = (viewWidth === 0 && isMobile) || (viewWidth > 0 && viewWidth < 950);

  // Handle sidebar state during responsive transitions
  React.useEffect(() => {
    if (isNarrow) {
      // Auto-close when entering narrow mode to prevent content occlusion
      setIsSidebarOpen(false);
    } else {
      // Auto-expand when entering wide mode for better desktop experience
      setIsSidebarOpen(true);
    }
  }, [isNarrow]);

  // Handle scroll to show/hide back to top button (rAF throttled)
  const scrollRafRef = useRef<number | null>(null);
  const handleScroll = React.useCallback(() => {
    if (scrollRafRef.current) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      const scrollTop = scrollContainerRef.current?.scrollTop ?? 0;
      setShowScrollTop((prev) => {
        const visible = scrollTop > 400;
        return prev !== visible ? visible : prev;
      });
    });
  }, []);

  // ResizeObserver: track heatmap width for responsive layout
  React.useEffect(() => {
    const el = heatmapContainerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(entries => {
      const newWidth = entries[0].contentRect.width;
      setHeatmapWidth((prev) => Math.abs(prev - newWidth) < 5 ? prev : newWidth);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);


  const scrollToTop = () => {
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Close menu when clicking elsewhere
  const closeMenu = () => setActiveMenuId(null);

  const handleCommit = React.useCallback(async () => {
    const trimmed = inputText.trim();
    if (!trimmed || isSubmitting) return;

    setIsSubmitting(true);
    try {
      if (editingNote) {
        await dataSource.updateEntry(editingNote, trimmed);
      } else {
        await dataSource.createEntry(trimmed);
      }
      setInputText('');
      setEditingNote(null);
      if (textareaRef.current) {
        textareaRef.current.setCssProps({ '--textarea-height': 'auto' });
      }
      await refresh();
      // Auto-scroll to top after commitment to see the new entry
      scrollToTop();
    } catch (commitError) {
      console.error('Failed to create Murmur entry', commitError);
      const message = commitError instanceof Error ? commitError.message : '提交失败，请重试。';
      new Notice(message);
    } finally {
      setIsSubmitting(false);
    }
  }, [inputText, isSubmitting, editingNote, dataSource, refresh, scrollToTop]);

  const commitRef = useRef(handleCommit);
  commitRef.current = handleCommit;

  const [hotkeyText, setHotkeyText] = useState('NOT SET');

  const updateHotkeyText = React.useCallback(() => {
    // @ts-ignore
    const commands = app.commands?.commands || {};
    const commandId = Object.keys(commands).find(id => id.endsWith(':quick-submit')) || 'murmur:quick-submit';

    // @ts-ignore
    const hkMgr = app.hotkeyManager;
    // @ts-ignore
    const hk = app.hotkeys;
    const cmd = commands[commandId];

    // Try every known path for hotkey storage
    const hotkeys =
      hkMgr?.getHotkeys?.(commandId) ||
      hkMgr?.customKeys?.[commandId] ||
      hkMgr?.defaultKeys?.[commandId] ||
      hk?.getHotkeys?.(commandId) ||
      hk?.customKeys?.[commandId] ||
      cmd?.hotkeys;

    if (!hotkeys || hotkeys.length === 0) {
      setHotkeyText('NOT SET');
      return;
    }

    const hotkey = hotkeys[0];
    const isMac = Platform.isMacOS;
    const modifiers = (hotkey.modifiers || []).map((m: string) => {
      if (m === 'Mod') return isMac ? 'CMD' : 'CTRL';
      if (m === 'Meta') return 'CMD';
      return m.toUpperCase();
    });

    setHotkeyText([...modifiers, hotkey.key.toUpperCase()].join(' + '));
  }, [app]);

  React.useEffect(() => {
    updateHotkeyText();
    // Refresh again after a short delay to ensure Obsidian commands are fully loaded
    const timer = setTimeout(updateHotkeyText, 1000);
    return () => clearTimeout(timer);
  }, [updateHotkeyText]);

  // Update hotkey text when the app gains focus or window gains focus
  React.useEffect(() => {
    if (isFocused) {
      updateHotkeyText();
    }
    
    window.addEventListener('focus', updateHotkeyText);
    return () => window.removeEventListener('focus', updateHotkeyText);
  }, [isFocused, updateHotkeyText]);

  React.useEffect(() => {
    const onQuickSubmit = () => {
      void commitRef.current();
    };
    app.workspace.on('murmur:quick-submit' as any, onQuickSubmit);
    return () => {
      app.workspace.off('murmur:quick-submit' as any, onQuickSubmit);
    };
  }, [app]);

  const handleOpenNote = useCallback(async (note: Note) => {
    try {
      await dataSource.openNote(note);
    } catch (openError) {
      console.error('Failed to open Murmur note', openError);
    }
  }, [dataSource]);

  const handleStartEdit = useCallback((note: Note) => {
    setEditingNote(note);
    setInputText(note.content);
    setIsFocused(true);

    queueMicrotask(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setCssProps({ '--textarea-height': 'auto' });
        textareaRef.current.setCssProps({ '--textarea-height': `${textareaRef.current.scrollHeight}px` });
      }
    });
  }, [setEditingNote, setInputText, setIsFocused, textareaRef]);

  const handleDeleteEntry = useCallback(async (note: Note) => {
    try {
      await dataSource.deleteEntry(note);
      if (editingNote?.id === note.id) {
        setEditingNote(null);
        setInputText('');
        if (textareaRef.current) {
          textareaRef.current.setCssProps({ '--textarea-height': 'auto' });
        }
      }
      await refresh();
    } catch (deleteError) {
      console.error('Failed to delete Murmur note', deleteError);
    }
  }, [dataSource, editingNote?.id, refresh, textareaRef]);

  const noteCardBaseShadow = 'inset 0 1px 0 rgba(255,255,255,0.02), 0 10px 25px rgba(0,0,0,0.5)';
  const noteCardHoverShadow = `inset 0 1px 0 rgba(255,255,255,0.03), ${noteCardBaseShadow}, 0 0 10px ${MURMUR_COLORS.glowGold}`;

  const clearEditingBuffer = useCallback(() => {
    setEditingNote(null);
    setInputText('');
    if (textareaRef.current) {
      textareaRef.current.setCssProps({ '--textarea-height': 'auto' });
    }
  }, []);

  const handleAddHash = () => {
    const space = (inputText === '' || inputText.endsWith(' ') || inputText.endsWith('\n')) ? '' : ' ';
    setInputText(prev => prev + space + '#');

    // Focus and position cursor
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.setSelectionRange(textareaRef.current.value.length, textareaRef.current.value.length);
      }
    }, 0);
  };

  const formatPeakDay = (dateStr: string) => {
    if (dateStr === '---') return dateStr;
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    return `${parts[0].slice(2)}.${parts[1]}.${parts[2]}`;
  };

  const sidebarHistoryStats = [
    { label: '总计', value: stats.totalNotes, unit: '篇' },
    { label: '积日', value: stats.totalDays, unit: '日' },
    { label: '连缀', value: stats.streak, unit: '天' },
    { label: '盛辰', value: formatPeakDay(stats.peakDay), unit: '', isDate: true },
  ];
  const heatmapCells = useMemo(() => buildHeatmapCells(notes), [notes]);
  const consoleStatusText = error
    ? 'Folder_Not_Set'
    : isSubmitting
      ? 'Committing_Data'
      : editingNote
        ? 'Edit_Buffer_Active'
        : isLoading
          ? 'Vault_Syncing'
          : isFocused
            ? 'Input_Console_Active'
            : 'Input_Console_Standby';
  const timelineStatusText = error ? 'SYNC_ALERT' : isLoading ? 'SYNCING_VAULT' : 'ADA01_1013';


  const MAX_PARADIGMS = 10;
  const paradigmCount = paradigms.length;
  const canAddParadigm = paradigmCount < MAX_PARADIGMS;

  const handlePinParadigm = (id: string) => {
    setParadigms(prev => {
      const item = prev.find(p => p.id === id);
      if (!item) return prev;
      return [item, ...prev.filter(p => p.id !== id)];
    });
  };

  const handleDeleteParadigm = (id: string) => {
    setParadigms(prev => prev.filter(p => p.id !== id));
    if (activeParadigmId === id) setActiveParadigmId(null);
  };

  return (
    <div ref={appContainerRef} className="relative h-full flex murmur-app-root overflow-hidden">
      <div className="paper-grain" />

      <aside
        className={`
          flex flex-col p-8 z-[100] transition-[width,opacity] duration-300 overflow-y-auto
          ${isNarrow
            ? `fixed inset-y-0 left-0 w-72 bg-[var(--murmur-sidebar)] shadow-2xl h-full ${isSidebarOpen ? 'block' : 'hidden'}`
            : `${isSidebarOpen ? 'relative w-72 border-r border-vintage-border' : 'w-0 overflow-hidden opacity-0 p-0 border-none'} flex-shrink-0 sticky top-0 h-full bg-[var(--murmur-sidebar)] block`}
        `}
      >
        <div className="flex flex-col space-y-8 pb-24">
          {/* Panel Edge Highlight (Polished Edge) */}
          <div
            className="absolute right-0 top-0 bottom-0 w-px z-20 opacity-20"
            style={{ backgroundColor: MURMUR_COLORS.teal }}
          />

          {/* Brand Section */}
          <div className="relative group">
            <div className="absolute -inset-2 bg-gradient-to-r from-vintage-orange/10 via-vintage-teal/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 blur-sm" />
            <div className="flex items-center gap-4 relative">
              <div className="relative">
                <div className="w-12 h-12 flex items-center justify-center relative">
                  <svg className="w-10 h-10 text-vintage-orange filter drop-shadow-[0_0_6px_rgba(245,158,11,0.4)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round">
                    <path d="M5 12c1-2 2-2 3.5 0s2.5 2 3.5 0 2.5-2 3.5 0 2.5 2 3.5 0" className="opacity-100" />
                    <path d="M5 8c1-2 2-2 3.5 0s2.5 2 3.5 0 2.5-2 3.5 0 2.5 2 3.5 0" className="opacity-40" />
                    <path d="M5 16c1-2 2-2 3.5 0s2.5 2 3.5 0 2.5-2 3.5 0 2.5 2 3.5 0" className="opacity-60" />
                  </svg>
                  <div className="absolute inset-0 bg-vintage-orange/10 rounded-full animate-pulse-slow" />
                </div>
              </div>
              <div>
                <h1 className={`${isNarrow ? 'text-xl' : 'text-2xl'} font-serif font-bold tracking-[0.15em] flex items-baseline`}>
                  <span style={{ color: MURMUR_COLORS.gold }}>Mur</span>
                  <span className="italic" style={{ color: MURMUR_COLORS.teal }}>mur</span>
                </h1>
              </div>

              {/* Header Action Buttons */}
              <div className="ml-auto flex items-center gap-1">
                {/* Always show Settings */}
                <button
                  onClick={onOpenSettings}
                  className="text-amber-dim-30 hover:text-vintage-orange/60 transition-all p-2 hover:bg-white/[0.02] rounded-lg border border-transparent relative group/settings"
                >
                  <Settings size={16} strokeWidth={1.5} />

                  <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-2 py-1 bg-[#0c0c0c] border border-vintage-orange/40 border-solid text-[10px] font-sans text-vintage-orange/70 rounded-sm opacity-0 group-hover/settings:opacity-100 pointer-events-none transition-all duration-200 translate-y-1 group-hover/settings:translate-y-0 whitespace-nowrap z-50 shadow-2xl tracking-[0.15em]">
                    Settings
                  </div>
                </button>

                {/* Only show Collapse in Narrow mode */}
                {isNarrow && (
                  <button
                    onClick={() => setIsSidebarOpen(false)}
                    className="text-amber-dim-30 hover:text-vintage-orange transition-all p-2 group/retract relative"
                  >
                    <div className="flex items-center">
                      <ChevronLeft size={16} strokeWidth={3} className="group-hover/retract:-translate-x-0.5 transition-transform" />
                      <div className="w-[1.5px] h-3 bg-current opacity-20 ml-1 rounded-full group-hover/retract:opacity-60 transition-opacity" />
                    </div>
                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-2 py-1 bg-[#0c0c0c] border border-vintage-orange/40 border-solid text-[10px] font-sans text-vintage-orange/70 rounded-sm opacity-0 group-hover/retract:opacity-100 pointer-events-none transition-all duration-200 translate-y-1 group-hover/retract:translate-y-0 whitespace-nowrap z-50 shadow-2xl tracking-[0.15em]">
                      收起侧栏
                    </div>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* 炽频时序计量台 (Heatmap) */}
          <div className="space-y-4">
            <div className="text-[11px] uppercase tracking-[0.25em] font-bold px-1 flex items-center gap-2.5 transition-colors group-hover:text-ink" style={{ color: MURMUR_COLORS.inkDim }}>
              <Activity size={14} strokeWidth={2.5} />
              <span>炽频时序计量台</span>
            </div>

            {/* Wooden Frame & Brass Panel Container */}
            <div className="p-1 rounded-sm bg-[#2a1a10] shadow-[0_4px_12px_rgba(0,0,0,0.4),inset_0_1px_2px_rgba(255,255,255,0.05)] border-2 border-[#1a0f0a] relative group/heatmap">
              {/* Brass Panel Background — rivets in corners, grid contained inside them */}
              <div className="p-5 bg-gradient-to-br from-[#3d2b1f] to-[#1a110a] rounded-[1px] border border-[#523b2b] relative overflow-hidden shadow-inner">

                {/* Panel Rivets — corner decorations, z-10 to stay above grid */}
                <div
                  className="absolute top-2 left-2 w-1.5 h-1.5 rounded-full opacity-40 z-10"
                  style={{ backgroundColor: MURMUR_COLORS.gold, boxShadow: `0 0 4px ${MURMUR_COLORS.gold}` }}
                />
                <div
                  className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full opacity-40 z-10"
                  style={{ backgroundColor: MURMUR_COLORS.gold, boxShadow: `0 0 4px ${MURMUR_COLORS.gold}` }}
                />
                <div
                  className="absolute bottom-2 left-2 w-1.5 h-1.5 rounded-full opacity-40 z-10"
                  style={{ backgroundColor: MURMUR_COLORS.gold, boxShadow: `0 0 4px ${MURMUR_COLORS.gold}` }}
                />
                <div
                  className="absolute bottom-2 right-2 w-1.5 h-1.5 rounded-full opacity-40 z-10"
                  style={{ backgroundColor: MURMUR_COLORS.gold, boxShadow: `0 0 4px ${MURMUR_COLORS.gold}` }}
                />

                {/* Minimal Gloss Over Panel */}
                <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/[0.02] to-transparent pointer-events-none z-20" />

                {/* A. GROUP HOVER: Y-Axis Labels slide in from left */}
                <div className="flex relative z-10 w-full">
                  <div
                    className="flex flex-col justify-between py-0.5 opacity-0 w-0 group-hover/heatmap:opacity-100 group-hover/heatmap:w-3 group-hover/heatmap:mr-1 transition-all duration-500 font-serif text-[11px] pointer-events-none select-none overflow-hidden flex-shrink-0"
                    style={{ color: MURMUR_COLORS.gold, filter: `drop-shadow(0 0 3px ${MURMUR_COLORS.gold}80)` }}
                  >
                    <span className="h-[12px] flex items-center justify-end">日</span>
                    <span className="h-[12px] flex items-center justify-end"></span>
                    <span className="h-[12px] flex items-center justify-end">二</span>
                    <span className="h-[12px] flex items-center justify-end"></span>
                    <span className="h-[12px] flex items-center justify-end">四</span>
                    <span className="h-[12px] flex items-center justify-end"></span>
                    <span className="h-[12px] flex items-center justify-end">六</span>
                  </div>

                  {/* B. GRID: fills full panel width, 12 cols × 7 rows, column-first flow */}
                  <div ref={heatmapContainerRef} className="flex-1 overflow-hidden">
                    <div
                      className={`grid grid-rows-7 grid-flow-col w-full ${heatmapWidth > 0 && heatmapWidth < 180 ? 'gap-[1px]' : 'gap-[3px]'
                        }`}
                      style={{ gridTemplateColumns: 'repeat(12, 1fr)' }}
                    >
                      {heatmapCells.map((cell, index) => {
                        const { cellStyle, glowStyle } = getHeatmapCellClasses(cell.count);
                        const isNarrow = heatmapWidth > 0 && heatmapWidth < 180;
                        const colIndex = Math.floor(index / 7);
                        // Last 2 cols scale from right edge to stay in viewport
                        const transformOrigin = colIndex >= 10 ? 'right center' : 'center';

                        return (
                          <div
                            key={`${cell.date}-${index}`}
                            className={`
                            aspect-square rounded-[1px] border relative
                            ${cellStyle} ${glowStyle}
                            ${isNarrow ? 'hover:scale-110' : 'hover:scale-125'} hover:z-30 hover:cursor-crosshair
                            transition-all duration-150
                            ${cell.count >= 10 ? 'hover:shadow-[0_0_20px_#d97706,0_0_40px_rgba(217,119,6,0.6)]' : ''}
                          `}
                            style={{ transformOrigin }}
                            title={`${cell.date} | 活跃度: ${cell.count}`}
                          >
                            <div className="absolute inset-0 bg-gradient-to-tr from-white/5 to-transparent pointer-events-none opacity-40" />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="px-1 flex items-center justify-between text-[10px] font-mono tracking-[0.25em] uppercase text-vintage-orange/25">
              <span>Low</span>
              <div className="flex items-center gap-1">
                <div className="w-3 h-[3px] rounded-full bg-[var(--murmur-sidebar)] border border-[var(--murmur-border)]" />
                <div className="w-3 h-[3px] rounded-full bg-[#fbbf24]/80 border border-[#fde68a]/40" />
                <div className="w-3 h-[3px] rounded-full bg-[#b45309]/80 border border-[#d97706]/40" />
                <div className="w-3 h-[3px] rounded-full bg-[#d97706] shadow-[0_0_6px_rgba(217,119,6,0.35)]" />
              </div>
              <span>High</span>
            </div>
          </div>

          {/* Navigation (寻溯范式) */}
          <div className="space-y-3">
            <div className="text-[11px] uppercase tracking-[0.25em] font-bold px-1 flex items-center justify-between group/header" style={{ color: MURMUR_COLORS.inkDim }}>
              <div className="flex items-center gap-2.5">
                <Telescope size={14} strokeWidth={2.5} />
                <span>寻溯范式</span>
              </div>
              <button
                onClick={() => canAddParadigm ? setIsCreatingParadigm(true) : null}
                className={`p-1 hover:bg-vintage-teal/10 rounded-sm transition-all opacity-0 group-hover/header:opacity-100 relative group/new-p ${!canAddParadigm ? 'cursor-not-allowed opacity-30' : ''}`}
                style={{ color: MURMUR_COLORS.teal }}
              >
                <Plus size={14} />
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-2 py-1 bg-[#0c0c0c] border border-vintage-orange/40 border-solid text-[10px] font-sans font-normal text-vintage-orange/70 rounded-sm opacity-0 group-hover/new-p:opacity-100 pointer-events-none transition-all duration-200 translate-y-1 group-hover/new-p:translate-y-0 whitespace-nowrap z-50 shadow-2xl tracking-[0.15em]">
                  {canAddParadigm ? '新增范式' : `已达上限 ${MAX_PARADIGMS} 个`}
                </div>
              </button>
            </div>
            <div className="space-y-1 max-h-[320px]">
              {paradigms.map(p => (
                <ViewItem
                  key={p.id}
                  name={p.name}
                  count={paradigmCounts.get(p.id) ?? 0}
                  active={activeParadigmId === p.id}
                  onClick={() => {
                    setActiveParadigmId(activeParadigmId === p.id ? null : p.id);
                    if (isNarrow) setIsSidebarOpen(false);
                  }}
                  onDelete={() => handleDeleteParadigm(p.id)}
                  onPin={() => handlePinParadigm(p.id)}
                />
              ))}
            </div>
          </div>

          {/* 辰衡统纪 (Chronos Balance Statistics) */}
          <div className="space-y-3">
            <div className="text-[11px] uppercase tracking-[0.25em] font-bold px-1 flex items-center gap-2.5" style={{ color: MURMUR_COLORS.inkDim }}>
              <Gauge size={14} strokeWidth={2.5} />
              <span>辰衡统纪</span>
            </div>
            <div className="grid grid-cols-2 gap-2 px-1">
              {sidebarHistoryStats.map(stat => (
                <div key={stat.label} className="bg-[var(--murmur-card)] border border-[var(--murmur-border)] rounded-lg p-3 flex flex-col items-center justify-center group hover:bg-[var(--murmur-border)] hover:border-vintage-orange/30 transition-all shadow-[inset_0_1px_4px_var(--murmur-contrast)] relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-br from-vintage-orange/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <span className="text-[11px] uppercase tracking-[0.2em] text-ink/20 group-hover:text-vintage-orange/40 transition-colors mb-1 relative z-10">{stat.label}</span>
                  <div className="flex items-baseline gap-1 relative z-10">
                    <span className={`${(stat as any).isDate ? 'text-xs tracking-tighter' : 'text-lg'} font-mono font-bold text-vintage-orange/70 group-hover:text-vintage-orange transition-colors`}>{stat.value}</span>
                    {stat.unit && <span className="text-[10px] font-serif text-ink/10">{stat.unit}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Taxonomy (榜列机枢) */}
          <div className="flex-1 space-y-3 min-h-0 flex flex-col">
            <div className="text-[11px] uppercase tracking-[0.25em] font-bold px-1 flex items-center justify-between" style={{ color: MURMUR_COLORS.inkDim }}>
              <div className="flex items-center gap-2.5">
                <Compass size={14} strokeWidth={2.5} />
                <span>榜列机枢</span>
              </div>
              {selectedTag && (
                <button
                  onClick={() => setSelectedTag(null)}
                  className="text-[13px] text-vintage-teal/40 hover:text-vintage-orange transition-colors font-mono tracking-normal"
                >
                  [ 归序 ]
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2 pr-2 max-h-[160px] overflow-hidden content-start scrollbar-hide py-1">
              {sortedTags.map(tag => (
                <TagBadge
                  key={tag.name}
                  name={tag.name}
                  count={tag.count}
                  active={selectedTag === tag.name}
                  onClick={() => setSelectedTag(tag.name === selectedTag ? null : tag.name)}
                />
              ))}
            </div>
            {sortedTags.length > 15 && (
              <div className="h-6 bg-gradient-to-t from-[var(--murmur-sidebar)] to-transparent -mt-6 pointer-events-none" />
            )}
          </div>
        </div>
      </aside>


      {/* --- PHYSICAL MECHANICAL CONNECTION RAIL 物理机械连接轨 --- */}

      {/* --- PHYSICAL MECHANICAL CONNECTION RAIL 物理机械连接轨 --- */}
      <div className="w-[24px] flex-shrink-0 bg-[var(--murmur-rail)] relative z-20 flex flex-col items-center py-12 space-y-24 overflow-hidden shadow-[inset_0_0_12px_rgba(0,0,0,0.5)]">
        {/* Central Bronze Pipe (Ancient Style) */}
        <div
          className="absolute inset-y-0 w-[3px] left-1/2 -translate-x-1/2 shadow-[inset_0_0_2px_rgba(0,0,0,0.8),2px_0_10px_rgba(0,0,0,0.3)] z-10"
          style={{ background: 'linear-gradient(to right, #1e2923, #4d6b63, #1e2923)' }}
        />

        {/* Bronze Pipe Patina Highlight */}
        <div
          className="absolute inset-y-0 w-0.5 left-[49%] blur-[0.3px] z-11 pointer-events-none"
          style={{ backgroundColor: 'rgba(77, 107, 99, 0.4)' }}
        />

        {/* Top Pressure Gauge (Refined Dark Mode - Matching Image 1) */}
        <div className="relative z-30 w-5 h-5 flex items-center justify-center">
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 20 20">
            {/* 1. 外层深色底盘 */}
            <circle cx="10" cy="10" r="9" style={{ fill: '#1a1a1a' }} stroke="#3a4a45" strokeWidth="1.5" />
            {/* 2. 金色装饰圆环 (匹配想要的效果) */}
            <circle cx="10" cy="10" r="7" fill="none" style={{ stroke: '#d4af37' }} strokeWidth="1.2" opacity="0.8" />
            <circle cx="10" cy="10" r="4" fill="none" style={{ stroke: '#d4af37' }} strokeWidth="0.5" opacity="0.4" />
          </svg>
          {/* Needle Layer */}
          <div
            className="w-0.5 h-3 rounded-full origin-bottom -mt-3 animate-murmur-gauge-slow z-20 relative"
            style={{ backgroundColor: '#991b1b' }}
          />
          {/* 金色中心销钉 */}
          <div className="absolute w-1.5 h-1.5 rounded-full z-30" style={{ backgroundColor: '#d4af37', top: '50%', left: '50%', transform: 'translate(-50%, -50%) shadow(0 1px 2px rgba(0,0,0,0.5))' }} />
        </div>


        {/* Rotating Miniature Gear 1 */}
        <div
          className="relative z-30 opacity-70 animate-murmur-spin"
          style={{ color: '#c29b40' }} // 恢复黄铜金
        >
          <Settings size={18} strokeWidth={1.5} />
        </div>

        {/* Deep Rivets Group */}
        <div className="flex flex-col gap-10 items-center py-4 relative z-20">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="w-1.5 h-1.5 rounded-full shadow-[1px_1px_2px_rgba(255,255,255,0.05),-1px_-1px_1px_rgba(0,0,0,0.8)] border border-white/5"
              style={{ background: 'linear-gradient(to bottom right, #1a1a1a, #000000)' }}
            />
          ))}
        </div>

        {/* Rotating Miniature Gear 2 */}
        <div
          className="relative z-30 opacity-50 animate-murmur-spin-reverse"
          style={{ color: '#c29b40' }} // 恢复黄铜金
        >
          <Settings size={14} strokeWidth={2} />
        </div>

        {/* Bottom Pressure Gauge (Refined Dark Mode) */}
        <div className="relative z-30 w-4 h-4 flex items-center justify-center">
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 16 16">
            <circle cx="8" cy="8" r="7" style={{ fill: '#1a1a1a' }} stroke="#3a4a45" strokeWidth="1.5" />
            <circle cx="8" cy="8" r="5" fill="none" style={{ stroke: '#d4af37' }} strokeWidth="1" opacity="0.6" />
          </svg>
          <div
            className="w-0.5 h-2.5 bg-black rounded-full origin-bottom -mt-2.5 animate-murmur-gauge-fast z-20 relative"
          />
          <div className="absolute w-1 h-1 rounded-full z-30" style={{ backgroundColor: '#d4af37', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }} />
        </div>

        {/* Continuous Side Rail Rivets (Visual Lock) */}
        <div className="absolute inset-y-0 left-0 w-full flex flex-col justify-between py-2 px-0.5 opacity-60">
          {[...Array(24)].map((_, i) => (
            <div
              key={i}
              className="w-1 h-1 rounded-full border border-white/5 shadow-inner"
              style={{ backgroundColor: '#000000' }}
            />
          ))}
        </div>
      </div>

      {/* --- MAIN CONTENT --- */}
      <main
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className={`flex-1 z-10 w-full overflow-y-auto font-sans bg-paper relative ${isMobile ? '' : 'scroll-smooth'}`}
        style={isMobile ? ({ WebkitOverflowScrolling: 'touch' } as React.CSSProperties) : undefined}
      >
        <div className="absolute left-0 top-0 bottom-0 w-2 bg-gradient-to-r from-black/60 to-transparent z-20 pointer-events-none opacity-40" />

        <div className={`w-full max-w-[800px] ${isNarrow ? 'px-6' : 'px-12'} flex flex-col min-h-full mx-auto relative`}>
          {/* Fixed Header Container (Input + Birds) */}
          <div
            className={`${isMobile ? 'relative' : 'sticky'} z-50 bg-paper/95 ${isMobile ? 'pt-[44px]' : isNarrow ? 'pt-2' : 'pt-8'} pb-4 border-none transition-all duration-300`}
            style={isMobile ? undefined : { top: 0 }}
          >
            {/* Editor Area */}
            <div className="mb-6">
              <div className="relative group w-full mx-auto">
                {/* Glow Wrapper: Handles the outer illumination */}
                <div
                  className="relative transition-all duration-700"
                  style={{
                    filter: (isFocused || isSubmitting)
                      ? 'drop-shadow(0 0 4px rgba(234, 179, 8, 0.3))'
                      : 'none',
                    transform: (isFocused || isSubmitting) ? 'translateY(-1px)' : 'none'
                  }}
                >
                  {/* Inner Container: Handles borders, background, and corner clipping */}
                  <div className={`
                    relative bg-[#0c0c0c] border border-white/10 rounded-xl transition-all duration-700 shadow-[0_0_1px_rgba(255,255,255,0.03)]
                    ${isFocused || isSubmitting ? 'border-vintage-orange/40' : ''}
                  `}>
                    {/* Terminal Header Bar */}
                    <div className="flex items-center justify-between px-4 py-1.5 border-b border-vintage-orange/10 bg-white/[0.04] relative z-20 rounded-t-xl">
                      <div className="flex items-center gap-3">
                        {isNarrow && !isSidebarOpen && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setIsSidebarOpen(true);
                            }}
                            className="mr-1.5 text-vintage-orange/30 hover:text-vintage-orange transition-all flex items-center group/toggle relative"
                          >
                            <div className="flex items-center">
                              <div className="w-[1.2px] h-2.5 bg-current opacity-20 mr-0.5 rounded-full group-hover/toggle:opacity-60 transition-opacity" />
                              <ChevronRight size={12} strokeWidth={3} className="group-hover/toggle:translate-x-0.5 transition-transform" />
                            </div>
                            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-2 py-1 bg-[#0c0c0c] border border-vintage-orange/40 border-solid text-[10px] font-sans text-vintage-orange/70 rounded-sm opacity-0 group-hover/toggle:opacity-100 pointer-events-none transition-all duration-200 translate-y-1 group-hover/toggle:translate-y-0 whitespace-nowrap z-50 shadow-2xl tracking-[0.15em]">
                              召唤侧栏
                            </div>
                          </button>
                        )}
                        <div className="flex gap-1.5">
                          <div className={`w-2 h-2 rounded-full border border-vintage-orange/20 ${isFocused ? 'bg-vintage-red animate-pulse' : 'bg-vintage-red/20'}`}></div>
                          <div className={`w-2 h-2 rounded-full border border-vintage-orange/20 ${isLoading ? 'bg-amber-500/50 shadow-[0_0_4px_rgba(245,158,11,0.25)]' : 'bg-amber-500/10'}`}></div>
                          <div className={`w-2 h-2 rounded-full border border-vintage-orange/20 ${error ? 'bg-red-500/40' : isSubmitting ? 'bg-emerald-500/50 shadow-[0_0_4px_rgba(16,185,129,0.25)]' : 'bg-emerald-500/10'}`}></div>
                        </div>
                        {activeParadigm && (
                          <div className="flex items-center gap-1 ml-2 px-2 py-0.5 rounded-full bg-vintage-teal/8 border border-vintage-teal/20 shadow-[0_0_6px_rgba(45,212,191,0.08)] group/filter">
                            <Telescope size={10} className="text-vintage-teal/60 flex-shrink-0" />
                            <span className="text-[10px] font-mono text-vintage-teal/80 tracking-wider max-w-[100px] truncate">
                              {activeParadigm.name}
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveParadigmId(null);
                              }}
                              className="relative !bg-transparent !border-none !shadow-none p-0 text-vintage-teal/50 hover:text-vintage-orange transition-all flex-shrink-0 group/clear"
                            >
                              <X size={11} />
                              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-2 py-1 bg-[#0c0c0c] border border-vintage-orange/40 border-solid text-[10px] font-sans text-vintage-orange/70 rounded-sm opacity-0 group-hover/clear:opacity-100 pointer-events-none transition-all duration-200 translate-y-1 group-hover/clear:translate-y-0 whitespace-nowrap z-50 shadow-2xl tracking-[0.15em]">
                                清除范式筛选
                              </div>
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-[1px] w-4 bg-vintage-orange/20"></div>
                        <span className="text-[11px] font-mono text-vintage-orange/30 tracking-[0.3em] uppercase">
                          {isMobile
                            ? consoleStatusText.replace(/(?:Input_Console_|Edit_Buffer_|Folder_Not_|Committing_|Vault_)/g, '')
                            : consoleStatusText}
                        </span>
                        <div className="h-[1px] w-4 bg-vintage-orange/20"></div>
                      </div>
                    </div>

                    <div className="relative overflow-hidden">
                      <textarea
                        className={`w-full px-5 py-4 pb-10 bg-transparent resize-none border-none focus:ring-0 focus:outline-none text-base font-mono text-stone-300/90 placeholder:text-vintage-orange/20 leading-relaxed min-h-[100px] max-h-[40vh] relative z-10 tracking-widest transition-all duration-500 ${isMobile ? '' : 'overflow-y-auto'} scrollbar-hide`}
                        style={{ height: 'var(--textarea-height, auto)' }}
                        placeholder={isFocused ? "" : editingNote ? "editing_buffer_..." : error ? "folder_unset_..." : "此刻，你在想什么..."}
                        onFocus={() => setIsFocused(true)}
                        onBlur={() => setIsFocused(false)}
                        value={inputText}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape' && editingNote) {
                            e.preventDefault();
                            e.stopPropagation();
                            clearEditingBuffer();
                          }
                        }}
                        ref={(el) => {
                          (textareaRef as React.MutableRefObject<HTMLTextAreaElement | null>).current = el;
                        }}
                        onChange={(e) => {
                          const val = e.target.value;
                          // Limit individual tag length to 30 chars
                          const processedValue = val.split(/(\s+)/).map(part => {
                            if (part.startsWith('#') && part.length > 30) {
                              return part.slice(0, 30);
                            }
                            return part;
                          }).join('');

                          setInputText(processedValue);
                          if (textareaRef.current) {
                            textareaRef.current.setCssProps({ '--textarea-height': 'auto' });
                            textareaRef.current.setCssProps({ '--textarea-height': `${textareaRef.current.scrollHeight}px` });
                          }
                        }}
                      />

                      {/* Shortcut Hint */}
                      <div className={`
                    absolute bottom-2 right-6 z-20 flex items-center gap-2 transition-all duration-500
                    ${isFocused ? 'opacity-40 translate-y-0' : 'opacity-0 translate-y-1'}
                  `}>
                        <span className="text-[11px] font-mono text-vintage-orange tracking-tighter">
                          [ <span className="text-vintage-orange font-bold px-1 select-none">{hotkeyText}</span> ] TO COMMIT
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between px-4 py-1.5 bg-white/[0.04] border-t border-vintage-orange/10 relative z-20 h-9 rounded-b-xl">
                      <div className="flex items-center gap-5 text-vintage-orange/30 h-full">
                        {/* Hash / Tag Button */}
                        <button
                          onClick={handleAddHash}
                          className="transition-all hover:scale-110 active:scale-95 group/btn relative h-full flex items-center"
                        >
                          <Hash size={14} className="text-vintage-orange/30 group-hover/btn:text-vintage-teal transition-colors duration-300" />
                          <div className="absolute bottom-full left-0 mb-3 px-1.5 py-0.5 bg-[#080808] border border-vintage-orange/40 text-[9px] font-sans text-vintage-orange/80 rounded-sm opacity-0 group-hover/btn:opacity-100 pointer-events-none transition-all duration-200 translate-y-1 group-hover/btn:translate-y-0 whitespace-nowrap z-50 shadow-2xl tracking-[0.2em] border-solid">
                            插入标签
                          </div>
                        </button>


                        <div className="relative h-full flex items-center">
                          <button
                            onClick={() => {
                              if (bgmManager) setBgmMenuOpen(v => !v);
                            }}
                            className="hover:text-vintage-teal transition-all hover:scale-110 active:scale-90 h-full flex items-center group/wav relative"
                          >
                            <Waves 
                              size={14} 
                              className={`transition-all duration-300 group-hover/wav:text-vintage-teal ${bgm.enabled ? 'text-vintage-teal animate-pulse [filter:drop-shadow(0_0_3px_rgba(45,212,191,0.5))]' : 'text-vintage-orange/30'}`} 
                            />
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 px-1.5 py-0.5 bg-[#080808] border border-vintage-orange/40 text-[9px] font-sans text-vintage-orange/80 rounded-sm opacity-0 group-hover/wav:opacity-100 pointer-events-none transition-all duration-200 translate-y-1 group-hover/wav:translate-y-0 whitespace-nowrap z-50 shadow-2xl tracking-[0.2em] border-solid">
                              夏日雨后
                            </div>
                          </button>
                          {bgmMenuOpen && (
                            <BgmControl
                              enabled={bgm.enabled}
                              volume={bgm.volume}
                              onToggle={() => {
                                bgm.toggle();
                              }}
                              onSetVolume={(v) => bgm.setVolume(v)}
                              onClose={() => setBgmMenuOpen(false)}
                            />
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-4 h-full">
                        {editingNote && (
                          <button
                            onClick={clearEditingBuffer}
                            className="text-[10px] font-mono tracking-[0.2em] uppercase text-vintage-orange/40 hover:text-vintage-orange transition-colors"
                          >
                            取消编辑当前笔记
                          </button>
                        )}
                        <div className="group/commit relative h-full flex items-center">
                          <button
                            onClick={() => void handleCommit()}
                            disabled={!inputText.trim() || isSubmitting}
                            className={`
                          px-4 py-1 rounded-sm border font-mono font-bold text-[10px] tracking-widest transition-all uppercase flex items-center gap-2 h-[26px]
                          ${inputText.trim() && !isSubmitting
                                ? 'bg-transparent border-vintage-orange/30 text-vintage-orange/30 hover:bg-vintage-orange hover:text-black hover:border-vintage-orange hover:shadow-[0_0_8px_rgba(245,158,11,0.4)] active:scale-95 cursor-pointer'
                                : 'bg-transparent border-white/5 text-white/10 cursor-default'
                              }
                        `}
                          >
                            {(!inputText.trim() || isSubmitting) ? (
                              <Lock size={10} className="text-stone-600" />
                            ) : (
                              <Plus size={10} className="animate-pulse" />
                            )}
                            {isSubmitting ? 'Committing' : editingNote ? 'Commit_Edit' : 'Commit_Data'}
                          </button>

                          {(!inputText.trim() || isSubmitting) && !isSubmitting && (
                            <div className="absolute bottom-full right-0 mb-3 px-2 py-1 bg-[#0c0c0c] border border-red-400/40 border-solid text-[10px] font-sans text-red-400/80 rounded-sm opacity-0 group-hover/commit:opacity-100 pointer-events-none transition-all duration-200 translate-y-1 group-hover/commit:translate-y-0 whitespace-nowrap z-50 shadow-2xl tracking-[0.15em]">
                              请输入有效内容
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Timeline Header (Birds + Version) */}
            <div className="flex items-center header-sweep py-2 rounded-r-3xl">
              <div className="flex items-center">
                {/* Fixed center alignment with the timeline line at 11px */}
                <div className="w-[23px] flex items-center justify-center">
                  <div className="text-vintage-orange">
                    <SunBirdIcon size={isNarrow ? 20 : 28} />
                  </div>
                </div>
                {/* Text Starts at 48px to match 3.4.C Specification */}
                <div className="pl-[25px] py-1 flex items-center border-none">
                  <div className="flex items-center gap-2 mt-0">
                    <div className="px-2 py-0.5 flex items-center gap-2 border-none">
                      <div className={`status-blinker ${isLoading ? 'opacity-100' : 'opacity-70'} ${error ? 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.8)]' : ''}`} />
                      <p className="text-[11px] uppercase tracking-[0.4em] text-vintage-orange/30 font-mono font-bold">{timelineStatusText}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Timeline Entries */}
          <div className="relative space-y-2">
            {/* Timeline Rail */}
            <div className="absolute left-[8px] top-10 bottom-10 w-[6px] pointer-events-none z-10">
              <div className="absolute left-1/2 -translate-x-1/2 w-[1.5px] h-full bg-[#ffffff1a]" />
            </div>

            {Object.entries(visibleGroupedNotes).map(([date, dayNotes], groupIdx) => {
              const notes = dayNotes as Note[];
              const hasActiveMenu = notes.some(n => n.id === activeMenuId);
              const isTodayGroup = date === formatDateKey(new Date());

              return (
                <motion.div
                  key={date}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6, delay: groupIdx * 0.1 }}
                  className={`relative mt-0 ${hasActiveMenu ? 'z-[40]' : 'z-0'}`}
                >
                  {!isTodayGroup && (
                    <div className="flex items-center gap-4 mb-0 relative z-10">
                      <div className="flex items-center gap-2 font-mono text-[13px] font-bold text-stone-500/70 bg-transparent py-2 tracking-[0.15em] whitespace-nowrap group-hover:text-vintage-orange/80 transition-colors pl-[48px]">
                        <span>{formatDateDisplay(date)}</span>
                      </div>
                      <div className="h-[1px] flex-1 bg-gradient-to-r from-vintage-border/40 to-transparent rounded-full mt-1"></div>
                    </div>
                  )}

                  <div className={`space-y-2.5 pl-[48px] relative z-10 ${isTodayGroup ? 'pt-5' : 'mt-1'}`}>
                    {(dayNotes as Note[]).map((note, noteIdx) => (
                      <motion.div
                        key={note.id}
                        className="relative group pb-1"
                        initial={{ opacity: 0, x: -20 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.5, delay: noteIdx * 0.1 }}
                      >

                        {/* Orbital Node Indicator - Standardized to 3 Sizes (14, 18, 16) */}
                        <div className={`absolute -left-[37px] top-[20px] ${['w-[14px] h-[14px]', 'w-[18px] h-[18px]', 'w-[16px] h-[16px]'][noteIdx % 3]} -translate-x-1/2 -translate-y-1/2 flex items-center justify-center pointer-events-none z-50`}>
                          {/* Outer Orbit (Teal) */}
                          <div
                            className="absolute inset-0 rounded-full border-1 border-solid opacity-50 group-hover:opacity-100 group-hover:scale-110 transition-all duration-700 shadow-[0_0_4px_rgba(45,212,191,0.2)]"
                            style={{ borderColor: MURMUR_COLORS.teal }}
                          />

                          {/* Inner Orbit (Gold Semi-circle SVG) */}
                          <div className="absolute inset-[2px] opacity-40 group-hover:opacity-100 group-hover:rotate-[180deg] transition-all duration-1000">
                            <svg className="w-full h-full" viewBox="0 0 20 20">
                              <path
                                d="M 10,2 A 8,8 0 0 1 10,18"
                                fill="none"
                                stroke={MURMUR_COLORS.gold}
                                strokeWidth="1.2"
                                strokeLinecap="round"
                              />
                            </svg>
                          </div>

                          {/* Central Core */}
                          <div
                            className="w-[3px] h-[3px] rounded-full relative z-20"
                            style={{
                              backgroundColor: MURMUR_COLORS.core,
                              boxShadow: `0 0 10px ${MURMUR_COLORS.core}`
                            }}
                          />
                        </div>

                        {/* Connection line: node → card edge (hover) */}
                        <div className="absolute -left-[31px] top-[20px] w-[28px] h-px bg-vintage-teal/30 opacity-0 group-hover:opacity-100 transition-all duration-500 z-30 pointer-events-none" />

                        <div
                          className={`border border-white/5 border-solid border-l-[3px] rounded-md px-6 py-2.5 transition-all duration-500 relative min-h-0 h-auto overflow-visible ${activeMenuId === note.id ? 'z-50' : 'z-10'}`}
                          style={isMobile
                            ? { backgroundColor: MURMUR_COLORS.cardBg, borderLeftColor: MURMUR_COLORS.teal, boxShadow: '0 4px 6px rgba(0,0,0,0.3)' }
                            : { backgroundColor: MURMUR_COLORS.cardBg, borderLeftColor: MURMUR_COLORS.teal, boxShadow: noteCardBaseShadow }}
                          onMouseEnter={(e) => {
                            if (isMobile) return;
                            e.currentTarget.style.backgroundColor = MURMUR_COLORS.cardHover;
                            e.currentTarget.style.borderLeftColor = MURMUR_COLORS.gold;
                            e.currentTarget.style.boxShadow = noteCardHoverShadow;
                          }}
                          onMouseLeave={(e) => {
                            if (isMobile) return;
                            e.currentTarget.style.backgroundColor = MURMUR_COLORS.cardBg;
                            e.currentTarget.style.borderLeftColor = MURMUR_COLORS.teal;
                            e.currentTarget.style.boxShadow = noteCardBaseShadow;
                          }}
                        >

                          {/* Right-side instrument stack: indicators + navigation + menu */}
                          <div className="absolute right-2 top-2 flex flex-col items-center gap-1 z-20">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveMenuId(activeMenuId === note.id ? null : note.id);
                              }}
                              className="p-1 rounded-md hover:bg-white/5 text-white/20 hover:text-vintage-orange transition-all active:scale-90 opacity-0 group-hover:opacity-100"
                            >
                              <MoreVertical size={14} />
                            </button>
                          </div>

                          {/* Three-dots Dropdown Panel */}
                          <div className="absolute top-7 right-2.5 z-30">
                            <AnimatePresence>
                              {activeMenuId === note.id && (
                                <>
                                  {/* Overlay to close menu when clicking outside */}
                                  <div
                                    className="fixed inset-0 z-[15] cursor-default"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      closeMenu();
                                    }}
                                  />
                                  <motion.div
                                    initial={{ opacity: 0, scale: 0.95, y: -10 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.95, y: -10 }}
                                    className="absolute right-0 mt-1 w-32 bg-[#0c0c0c]/95 border border-white/10 rounded-lg shadow-[0_10px_25px_rgba(0,0,0,0.8)] z-20 py-1 overflow-hidden"
                                  >
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleStartEdit(note);
                                        closeMenu();
                                      }}
                                      className="w-full px-3 py-2.5 flex items-center gap-2 text-[11px] text-white/40 hover:bg-vintage-teal/10 hover:text-vintage-teal transition-all duration-300 font-mono group/edit"
                                    >
                                      <Pencil size={12} className="opacity-40 group-hover/edit:opacity-100" />
                                      <span>调校</span>
                                    </button>

                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        void handleDeleteEntry(note);
                                        closeMenu();
                                      }}
                                      className="w-full px-3 py-2.5 flex items-center gap-2 text-[11px] text-white/40 hover:bg-red-500/10 hover:text-red-400 transition-all duration-300 font-mono group/del"
                                    >
                                      <Trash2 size={12} className="opacity-40 group-hover/del:opacity-100" />
                                      <span>清档</span>
                                    </button>


                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        void handleOpenNote(note);
                                        closeMenu();
                                      }}
                                      className="w-full px-3 py-2.5 flex items-center gap-2 text-[11px] text-white/40 hover:bg-vintage-orange/10 hover:text-vintage-orange transition-all duration-300 font-mono group/jump"
                                    >
                                      <Compass size={12} className="opacity-40 group-hover/jump:opacity-100" />
                                      <span>溯源</span>
                                    </button>
                                  </motion.div>
                                </>
                              )}
                            </AnimatePresence>
                          </div>


                          <div className="flex flex-col relative z-20 group-hover:-translate-y-px transition-transform duration-500">
                            {/* Terminal Header: Minimal Timestamp */}
                            <div className="flex items-center mb-0.5 relative z-20">
                              <div className="flex items-center gap-2 group-hover:translate-x-0.5 transition-transform duration-500 pl-0.5">
                                <span className="font-mono text-sm text-stone-500/40 group-hover:text-stone-300 tracking-[0.2em] font-bold uppercase transition-colors whitespace-nowrap">
                                  {note.time}
                                </span>
                              </div>
                            </div>

                            <div className="relative pl-0.5">
                              <p className="font-mono font-light text-base leading-snug text-stone-300/90 group-hover:text-ink transition-all duration-500 whitespace-pre-wrap selection:bg-vintage-orange/20">
                                {note.content.split(/(#[^\s#]+)/g).map((part, i) =>
                                  part.startsWith('#') ? (
                                    <span key={i} className="inline-flex items-center font-serif px-2 py-0.5 rounded bg-vintage-teal/20 text-vintage-teal shadow-[0_0_4px_rgba(45,212,191,0.15)] mx-0.5 transition-colors">
                                      {part}
                                    </span>
                                  ) : part
                                )}
                              </p>
                            </div>
                          </div>

                        </div>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )
            })}

            {hasMoreDays && (
              <div className="flex justify-center pt-4 pb-2">
                <button
                  onClick={handleLoadMoreDays}
                  className="px-8 py-2.5 border border-vintage-orange/20 rounded-lg bg-[#0c0c0c] text-vintage-orange/60 hover:text-vintage-orange hover:border-vintage-orange/40 transition-all font-mono text-[11px] tracking-[0.2em] uppercase"
                >
                  加载更早条目 · 还有 {totalDayCount - visibleDayCount} 天
                </button>
              </div>
            )}
          </div>

          {/* Sidebar Backdrop Overlay (Narrow mode only) */}
          <AnimatePresence>
            {isNarrow && isSidebarOpen && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsSidebarOpen(false)}
                className={`fixed inset-0 bg-black/80 z-[90]`}
              />
            )}
          </AnimatePresence>

        </div>

        {/* Back to Top Button - Sticky at the bottom of the viewport */}
        <div className="sticky bottom-10 left-0 right-0 pointer-events-none z-50 flex justify-center mt-10">
          <div className="w-full max-w-[800px] relative px-12 flex justify-center">
            <AnimatePresence>
              {showScrollTop && (
                <motion.div
                  initial={{ opacity: 0, y: 20, scale: 0.8 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 20, scale: 0.8 }}
                  onClick={scrollToTop}
                  role="button"
                  className="pointer-events-auto flex flex-col items-center group cursor-pointer"
                >
                  <div className="relative p-3 bg-[#0c0c0c]/90 backdrop-blur-md border border-vintage-orange/30 rounded-full shadow-[0_12px_24px_rgba(0,0,0,0.6)] transition-all group-hover:border-vintage-orange group-hover:shadow-[0_0_20px_rgba(245,158,11,0.2)] active:scale-90 overflow-hidden">
                    <ChevronUp className="text-vintage-orange/40 group-hover:text-vintage-orange transition-colors relative z-10" size={20} />
                    <div className="absolute inset-0 bg-gradient-to-b from-white/[0.03] to-transparent pointer-events-none" />
                  </div>
                  <div className="mt-2 flex flex-col items-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-y-1 group-hover:translate-y-0">
                    <span className="text-[10px] font-mono text-vintage-orange/60 tracking-[0.4em] uppercase leading-none">
                      Ascend
                    </span>
                    <div className="w-6 h-[1px] bg-vintage-orange/10" />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </main>

      {/* Paradigm Forge Editor Modal */}
      <ParadigmEditor
        isOpen={isCreatingParadigm}
        onClose={() => setIsCreatingParadigm(false)}
        onSave={(newP: Paradigm) => {
          if (paradigms.length >= MAX_PARADIGMS) {
            new Notice(`范式数量已达上限 ${MAX_PARADIGMS} 个，请先删除旧范式。`);
            return;
          }
          const id = Date.now().toString();
          setParadigms((prev) => [...prev, { ...newP, id, conditions: newP.conditions, isActive: false }]);
          setActiveParadigmId(id);
          setIsCreatingParadigm(false);
          if (isNarrow) setIsSidebarOpen(false);
        }}
      />
    </div>
  );
}