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

export default function RegionEditor({
  imageSrc,
  regions,
  onRegionsChange,
  suggestedRegions,
}: RegionEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState({ x: 0, y: 0 });
  const [drawCurrent, setDrawCurrent] = useState({ x: 0, y: 0 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);

  const getRelativePos = useCallback((e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    };
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('[data-region]')) return;
    
    const pos = getRelativePos(e);
    setDrawing(true);
    setDrawStart(pos);
    setDrawCurrent(pos);
    setSelectedId(null);
  }, [getRelativePos]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!drawing) return;
    setDrawCurrent(getRelativePos(e));
  }, [drawing, getRelativePos]);

  const handleMouseUp = useCallback(() => {
    if (!drawing) return;
    setDrawing(false);

    const x = Math.min(drawStart.x, drawCurrent.x);
    const y = Math.min(drawStart.y, drawCurrent.y);
    const width = Math.abs(drawCurrent.x - drawStart.x);
    const height = Math.abs(drawCurrent.y - drawStart.y);

    if (width < 0.01 || height < 0.01) return;

    const newRegion: DraftRegion = {
      id: `draft-${Date.now()}`,
      question_number: String(regions.length + 1),
      x, y, width, height,
    };
    onRegionsChange([...regions, newRegion]);
    setSelectedId(newRegion.id);
  }, [drawing, drawStart, drawCurrent, regions, onRegionsChange]);

  const handleDeleteRegion = useCallback((id: string) => {
    onRegionsChange(regions.filter((r) => r.id !== id));
    if (selectedId === id) setSelectedId(null);
  }, [regions, selectedId, onRegionsChange]);

  const handleUpdateQuestion = useCallback((id: string, qNum: string) => {
    onRegionsChange(
      regions.map((r) => (r.id === id ? { ...r, question_number: qNum } : r))
    );
  }, [regions, onRegionsChange]);

  const acceptSuggested = useCallback(() => {
    if (!suggestedRegions?.length) return;
    const newRegions: DraftRegion[] = suggestedRegions.map((s, i) => ({
      id: `suggested-${Date.now()}-${i}`,
      question_number: String(i + 1),
      x: s.x,
      y: s.y,
      width: s.width,
      height: s.height,
    }));
    onRegionsChange(newRegions);
  }, [suggestedRegions, onRegionsChange]);

  useEffect(() => {
    if (suggestedRegions?.length && regions.length === 0) {
      acceptSuggested();
    }
  }, [suggestedRegions]);

  const drawRect = drawing
    ? {
        x: Math.min(drawStart.x, drawCurrent.x),
        y: Math.min(drawStart.y, drawCurrent.y),
        width: Math.abs(drawCurrent.x - drawStart.x),
        height: Math.abs(drawCurrent.y - drawStart.y),
      }
    : null;

  return (
    <div className="flex gap-4">
      {/* Image + overlay */}
      <div className="flex-1 min-w-0">
        <div
          ref={containerRef}
          className="relative border border-gray-300 rounded-lg overflow-hidden cursor-crosshair select-none bg-gray-100"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => drawing && handleMouseUp()}
        >
          <img
            src={imageSrc}
            alt="답안지 템플릿"
            className="w-full h-auto block"
            draggable={false}
            onLoad={() => setImageLoaded(true)}
          />

          {imageLoaded && regions.map((region, idx) => (
            <div
              key={region.id}
              data-region="true"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedId(region.id);
              }}
              className={`absolute border-2 flex items-start justify-start cursor-pointer transition-colors ${
                selectedId === region.id ? 'ring-2 ring-offset-1' : ''
              }`}
              style={{
                left: `${region.x * 100}%`,
                top: `${region.y * 100}%`,
                width: `${region.width * 100}%`,
                height: `${region.height * 100}%`,
                borderColor: COLORS[idx % COLORS.length],
                backgroundColor: `${COLORS[idx % COLORS.length]}15`,
              }}
            >
              <span
                className="text-xs font-bold px-1.5 py-0.5 text-white rounded-br"
                style={{ backgroundColor: COLORS[idx % COLORS.length] }}
              >
                {region.question_number}
              </span>
            </div>
          ))}

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

      {/* Sidebar - region list */}
      <div className="w-64 flex-shrink-0">
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900 text-sm">
              영역 목록 ({regions.length})
            </h3>
            {suggestedRegions && suggestedRegions.length > 0 && (
              <button
                onClick={acceptSuggested}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
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
                    selectedId === region.id
                      ? 'border-blue-300 bg-blue-50'
                      : 'border-gray-100 hover:bg-gray-50'
                  }`}
                  onClick={() => setSelectedId(region.id)}
                >
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                  />
                  <input
                    type="text"
                    value={region.question_number}
                    onChange={(e) => handleUpdateQuestion(region.id, e.target.value)}
                    className="w-16 border border-gray-200 rounded px-1.5 py-0.5 text-xs text-center"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <span className="text-xs text-gray-400 flex-1 truncate">번</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteRegion(region.id);
                    }}
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
