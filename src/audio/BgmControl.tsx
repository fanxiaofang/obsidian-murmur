// src/audio/BgmControl.tsx

import React, { useEffect, useRef } from 'react';
import { Volume2, VolumeX } from 'lucide-react';

interface BgmControlProps {
  enabled: boolean;
  volume: number;
  onToggle: () => void;
  onSetVolume: (v: number) => void;
  onClose: () => void;
}

export const BgmControl: React.FC<BgmControlProps> = ({
  enabled, volume,
  onToggle, onSetVolume, onClose,
}) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const path = e.composedPath();
      if (ref.current && !path.includes(ref.current)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute bottom-full left-0 mb-2 w-48 bg-[#0c0c0c] border border-vintage-orange/20 
                 rounded-lg p-3 shadow-2xl z-[100]"
      style={{ minWidth: '180px' }}
    >
      <div className="text-[11px] font-mono text-vintage-orange/70 tracking-[0.15em] uppercase mb-3 text-center">
        夏日雨后
      </div>

      <div className="flex items-center gap-2">
        <style>{`
          .bgm-volume-slider::-webkit-slider-thumb {
            -webkit-appearance: none;
            height: 10px;
            width: 10px;
            border-radius: 50%;
            background: #f59e0b;
            cursor: pointer;
            box-shadow: 0 0 5px rgba(245, 158, 11, 0.5);
          }
          .bgm-volume-slider::-moz-range-thumb {
            height: 10px;
            width: 10px;
            border-radius: 50%;
            background: #f59e0b;
            cursor: pointer;
            border: none;
          }
        `}</style>
        <button
          onClick={(e) => { 
            e.stopPropagation(); 
            onToggle(); 
          }}
          className="text-stone-400 hover:text-vintage-orange transition-colors"
        >
          {enabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
        </button>
        <input
          type="range"
          min="0"
          max="100"
          value={Math.round(volume * 100)}
          onChange={(e) => onSetVolume(Number(e.target.value) / 100)}
          onMouseDown={(e) => e.stopPropagation()}
          className="flex-1 bgm-volume-slider cursor-pointer"
          style={{
            background: `linear-gradient(to right, #f59e0b ${volume * 100}%, rgba(255,255,255,0.1) ${volume * 100}%)`,
            borderRadius: '2px',
            WebkitAppearance: 'none',
            height: '3px',
            outline: 'none',
          }}
        />
        <span className="text-[10px] font-mono text-stone-500 w-7 text-right">
          {Math.round(volume * 100)}
        </span>
      </div>
    </div>
  );
};