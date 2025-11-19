// components/BottomSheet.tsx - ドラッグ可能なボトムシート
import React, { useRef, useState } from 'react';
import styles from '../search.module.css';

interface BottomSheetProps {
  isMinimized: boolean;
  onToggleMinimize: (minimized: boolean) => void;
  onClose: () => void;
  children: React.ReactNode;
  minimizedContent?: React.ReactNode;
}

export const BottomSheet: React.FC<BottomSheetProps> = ({
  isMinimized,
  onToggleMinimize,
  onClose,
  children,
  minimizedContent
}) => {
  const [sheetTranslateY, setSheetTranslateY] = useState(0);
  const sheetTouchStartY = useRef<number | null>(null);
  const sheetTranslateYRef = useRef<number>(0);
  const sheetDraggingRef = useRef(false);
  const [isMobileViewport, setIsMobileViewport] = useState(true);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!isMobileViewport) return;
    if (!e.touches || e.touches.length === 0) return;

    const touchTarget = e.target as HTMLElement | null;
    const isHandleTouch = !!touchTarget?.closest('[data-sheet-handle="true"]');
    const shouldDrag = isHandleTouch || isMinimized;

    if (!shouldDrag) {
      sheetDraggingRef.current = false;
      sheetTouchStartY.current = null;
      sheetTranslateYRef.current = 0;
      return;
    }

    sheetTouchStartY.current = e.touches[0].clientY;
    sheetDraggingRef.current = true;
    sheetTranslateYRef.current = 0;
    setSheetTranslateY(0);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isMobileViewport) return;
    if (!sheetDraggingRef.current || !sheetTouchStartY.current) return;
    
    try { e.preventDefault(); } catch (err) {}
    
    const curY = e.touches[0].clientY;
    const rawDelta = curY - sheetTouchStartY.current;
    const maxDown = window.innerHeight * 0.9;
    const maxUp = 140;
    const clampedDelta = isMinimized
      ? Math.max(-maxUp, Math.min(rawDelta, maxDown))
      : Math.max(0, Math.min(rawDelta, maxDown));
    
    sheetTranslateYRef.current = clampedDelta;
    setSheetTranslateY(clampedDelta);
  };

  const handleTouchEnd = () => {
    if (!isMobileViewport) return;
    if (!sheetDraggingRef.current) return;
    
    sheetDraggingRef.current = false;
    const delta = sheetTranslateYRef.current;
    
    if (delta > 120) {
      if (isMinimized) {
        onClose();
      } else {
        onToggleMinimize(true);
      }
    } else if (delta < -80 && isMinimized) {
      onToggleMinimize(false);
    }
    
    // animate back
    sheetTranslateYRef.current = 0;
    setSheetTranslateY(0);
    sheetTouchStartY.current = null;
  };

  return (
    <div
      className={styles.routeDetailContainer}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{ 
        transform: `translateY(${sheetTranslateY}px)`,
        maxHeight: isMinimized ? '80px' : '50vh',
        transition: isMinimized ? 'max-height 0.3s ease' : 'none',
        touchAction: isMobileViewport ? (isMinimized ? 'none' : 'pan-y') : 'auto',
        userSelect: isMobileViewport ? 'none' : 'auto',
        WebkitUserSelect: isMobileViewport ? 'none' : 'auto',
        overflowY: isMinimized ? 'hidden' : 'auto'
      }}
    >
      <div className={styles.sheetHandle} data-sheet-handle="true" />
      {isMinimized ? minimizedContent : children}
    </div>
  );
};
