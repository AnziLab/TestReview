'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { DraftRegion } from '@/lib/types';

interface RegionEditorProps {
  imageSrc: string;
  regions: DraftRegion[];
  onRegionsChange: (regions: DraftRegion[]) => void;
  suggestedRegions?: Array<{ x: number; y: number; width: number; height: number }>;
}

const COLORS = [
  '#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6',
  '#EC4899', '#06B6D4', '#F97316', '#6366F1', '#14B8A6',
];

type InteractionMode =
  | { type: 'idle' }
  | { type: 'drawing'; startX: number; startY: number }
  | { type: 'moving'; regionId: string; offsetX: number; offsetY: number }
  | { type: 'resizing'; regionId: string; handle: string };

export default function RegionEditor({
  imageSrc,
  regions,
  onRegionsChange,
  suggestedRegions,
}: RegionEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<InteractionMode>({ type: 'idle' });
  const [drawCurrent, setDrawCurrent] = useState({ x: 0, y: 0 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const getRelativePos = useCallback((e: React.MouseEvent | MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    };
  }, []);

  // ── Drawing ──────────────────────────────────────────────────────────────

  const handleContainerMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-region]')) return;
    const pos = getRelativePos(e);
    setMode({ type: 'drawing', startX: pos.x, startY: pos.y });
    setDrawCurrent(pos);
    setSelectedId(null);
  }, [getRelativePos]);

  // ── Moving ───────────────────────────────────────────────────────────────

  const handleRegionMouseDown = useCallback((e: React.MouseEvent, regionId: string) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const pos = getRelativePos(e);
    const region = regions.find((r) => r.id === regionId);
    if (!region) return;
    setMode({
      type: 'moving',
      regionId,
      offsetX: pos.x - region.x,
      offsetY: pos.y - region.y,
    });
    setSelectedId(regionId);
  }, [getRelativePos, regions]);

  // ── Resizing ─────────────────────────────────────────────────────────────

  const handleResizeMouseDown = useCallback((e: React.MouseEvent, regionId: string, handle: string) => {
    e.stopPropagation();
    e.preventDefault();
    setMode({ type: 'resizing', regionId, handle });
    setSelectedId(regionId);
  }, []);

  // ── Global mouse move / up ────────────────────────────────────────────────

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      const m = modeRef.current;
      const pos = getRelativePos(e);

      if (m.type === 'drawing') {
        setDrawCurrent(pos);
      } else if (m.type === 'moving') {
        const region = regions.find((r) => r.id === m.regionId);
        if (!region) return;
        const newX = Math.max(0, Math.min(1 - region.width, pos.x - m.offsetX));
        const newY = Math.max(0, Math.min(1 - region.height, pos.y - m.offsetY));
        onRegionsChange(regions.map((r) =>
          r.id === m.regionId ? { ...r, x: newX, y: newY } : r
        ));
      } else if (m.type === 'resizing') {
        const region = regions.find((r) => r.id === m.regionId);
        if (!region) return;
        let { x, y, width, height } = region;
        const MIN = 0.02;

        if (m.handle.includes('e')) width = Math.max(MIN, Math.min(1 - x, pos.x - x));
        if (m.handle.includes('s')) height = Math.max(MIN, Math.min(1 - y, pos.y - y));
        if (m.handle.includes('w')) {
          const newX = Math.max(0, Math.min(x + width - MIN, pos.x));
          width = width + (x - newX);
          x = newX;
        }
        if (m.handle.includes('n')) {
          const newY = Math.max(0, Math.min(y + height - MIN, pos.y));
          height = height + (y - newY);
          y = newY;
        }
        onRegionsChange(regions.map((r) =>
          r.id === m.regionId ? { ...r, x, y, width, height } : r
        ));
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      const m = modeRef.current;
      if (m.type === 'drawing') {
        const pos = getRelativePos(e);
        const x = Math.min(m.startX, pos.x);
        const y = Math.min(m.startY, pos.y);
        const width = Math.abs(pos.x - m.startX);
        const height = Math.abs(pos.y - m.startY);
        if (width >= 0.01 && height >= 0.01) {
          const newRegion: DraftRegion = {
            id: `draft-${Date.now()}`,
            question_number: String(regions.length + 1),
            x, y, width, height,
          };
          onRegionsChange([...regions, newRegion]);
          setSelectedId(newRegion.id);
        }
      }
      setMode({ type: 'idle' });
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [regions, onRegionsChange, getRelativePos]);

  // ── Helpers ───────────────────────────────────────────────────────────────

  const handleDeleteRegion = useCallback((id: string) => {
    onRegionsChange(regions.filter((r) => r.id !== id));
    if (selectedId === id) setSelectedId(null);
  }, [regions, selectedId, onRegionsChange]);

  const handleUpdateQuestion = useCallback((id: string, qNum: string) => {
    onRegionsChange(regions.map((r) => (r.id === id ? { ...r, question_number: qNum } : r)));
  }, [regions, onRegionsChange]);

  const acceptSuggested = useCallback(() => {
    if (!suggestedRegions?.length) return;
    onRegionsChange(suggestedRegions.map((s, i) => ({
      id: `suggested-${Date.now()}-${i}`,
      question_number: String(i + 1),
      x: s.x, y: s.y, width: s.width, height: s.height,
    })));
  }, [suggestedRegions, onRegionsChange]);

  useEffect(() => {
    if (suggestedRegions?.length && regions.length === 0) acceptSuggested();
  }, [suggestedRegions]);

  // ── Draw preview rect ─────────────────────────────────────────────────────

  const drawRect = mode.type === 'drawing'
    ? {
        x: Math.min(mode.startX, drawCurrent.x),
        y: Math.min(mode.startY, drawCurrent.y),
        width: Math.abs(drawCurrent.x - mode.startX),
        height: Math.abs(drawCurrent.y - mode.startY),
      }
    : null;

  const isDragging = mode.type === 'moving' || mode.type === 'resizing';

  return (
    <div className="flex gap-4">
      {/* Image + overlay */}
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-400 mb-2">
          빈 영역 드래그: 새 영역 추가 &nbsp;|&nbsp; 영역 드래그: 이동 &nbsp;|&nbsp; 모서리 핸들: 크기 조정
        </p>
        <div
          ref={containerRef}
          className={`relative border border-gray-300 rounded-lg overflow-hidden select-none bg-gray-100 ${
            mode.type === 'moving' ? 'cursor-grabbing' : mode.type === 'resizing' ? 'cursor-nwse-resize' : 'cursor-crosshair'
          }`}
          onMouseDown={handleContainerMouseDown}
        >
          <img
            src={imageSrc}
            alt="답안지 템플릿"
            className="w-full h-auto block"
            draggable={false}
            onLoad={() => setImageLoaded(true)}
          />

          {imageLoaded && regions.map((region, idx) => {
            const color = COLORS[idx % COLORS.length];
            const isSelected = selectedId === region.id;

            return (
              <div
                key={region.id}
                data-region="true"
                onMouseDown={(e) => handleRegionMouseDown(e, region.id)}
                className={`absolute border-2 flex items-start justify-start ${
                  isDragging && mode.type !== 'idle' && (mode as { regionId?: string }).regionId === region.id
                    ? 'cursor-grabbing'
                    : 'cursor-grab'
                } ${isSelected ? 'ring-2 ring-white ring-offset-1' : ''}`}
                style={{
                  left: `${region.x * 100}%`,
                  top: `${region.y * 100}%`,
                  width: `${region.width * 100}%`,
                  height: `${region.height * 100}%`,
                  borderColor: color,
                  backgroundColor: `${color}20`,
                  zIndex: isSelected ? 10 : 1,
                }}
              >
                <span
                  className="text-xs font-bold px-1 py-0.5 text-white rounded-br leading-none"
                  style={{ backgroundColor: color }}
                >
                  {region.question_number}
                </span>

                {/* Delete button */}
                <button
                  className="absolute top-0 right-0 w-4 h-4 flex items-center justify-center text-white rounded-bl text-xs leading-none opacity-0 hover:opacity-100 transition-opacity"
                  style={{ backgroundColor: color }}
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); handleDeleteRegion(region.id); }}
                >
                  ×
                </button>

                {/* Resize handles — show only when selected */}
                {isSelected && (
                  <>
                    {[
                      { h: 'nw', style: { top: -4, left: -4, cursor: 'nw-resize' } },
                      { h: 'ne', style: { top: -4, right: -4, cursor: 'ne-resize' } },
                      { h: 'sw', style: { bottom: -4, left: -4, cursor: 'sw-resize' } },
                      { h: 'se', style: { bottom: -4, right: -4, cursor: 'se-resize' } },
                      { h: 'n',  style: { top: -4, left: '50%', transform: 'translateX(-50%)', cursor: 'n-resize' } },
                      { h: 's',  style: { bottom: -4, left: '50%', transform: 'translateX(-50%)', cursor: 's-resize' } },
                      { h: 'w',  style: { top: '50%', left: -4, transform: 'translateY(-50%)', cursor: 'w-resize' } },
                      { h: 'e',  style: { top: '50%', right: -4, transform: 'translateY(-50%)', cursor: 'e-resize' } },
                    ].map(({ h, style }) => (
                      <div
                        key={h}
                        className="absolute w-3 h-3 bg-white border-2 rounded-sm"
                        style={{ ...style, borderColor: color, zIndex: 20 }}
                        onMouseDown={(e) => handleResizeMouseDown(e, region.id, h)}
                      />
                    ))}
                  </>
                )}
              </div>
            );
          })}

          {drawRect && (
            <div
              className="absolute border-2 border-dashed border-blue-500 bg-blue-500/10 pointer-events-none"
              style={{
                left: `${drawRect.x * 100}%`,
                top: `${drawRect.y * 100}%`,
                width: `${drawRect.width * 100}%`,
                height: `${drawRect.height * 100}%`,
              }}
            />
          )}
        </div>
      </div>

      {/* Sidebar */}
      <div className="w-64 flex-shrink-0">
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900 text-sm">
              영역 목록 ({regions.length})
            </h3>
            {suggestedRegions && suggestedRegions.length > 0 && (
              <button onClick={acceptSuggested} className="text-xs text-blue-600 hover:text-blue-800">
                자동감지 적용
              </button>
            )}
          </div>

          {regions.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">
              이미지 위에 드래그하여<br />영역을 추가하세요
            </p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {regions.map((region, idx) => (
                <div
                  key={region.id}
                  className={`flex items-center gap-2 p-2 rounded-lg border text-sm transition-colors cursor-pointer ${
                    selectedId === region.id ? 'border-blue-300 bg-blue-50' : 'border-gray-100 hover:bg-gray-50'
                  }`}
                  onClick={() => setSelectedId(region.id)}
                >
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
                  <input
                    type="text"
                    value={region.question_number}
                    onChange={(e) => handleUpdateQuestion(region.id, e.target.value)}
                    className="w-16 border border-gray-200 rounded px-1.5 py-0.5 text-xs text-center"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <span className="text-xs text-gray-400 flex-1 truncate">번</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteRegion(region.id); }}
                    className="text-gray-400 hover:text-red-500 p-0.5"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
