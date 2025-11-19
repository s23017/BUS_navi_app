// components/MapComponent.tsx - 地図表示コンポーネント
import React, { useEffect } from 'react';
import styles from '../search.module.css';

interface MapComponentProps {
  mapRef: React.RefObject<HTMLDivElement | null>;
  mapLoaded: boolean;
}

export const MapComponent: React.FC<MapComponentProps> = ({ mapRef, mapLoaded }) => {
  useEffect(() => {
    if (mapLoaded && window.google && mapRef.current) {
      // 地図のリサイズトリガー
      setTimeout(() => {
        const event = new Event('resize');
        window.dispatchEvent(event);
      }, 100);
    }
  }, [mapLoaded, mapRef]);

  return (
    <div className={styles.mapContainer}>
      <div 
        ref={mapRef} 
        className={styles.map}
        style={{
          width: '100%',
          height: '100%',
          position: 'relative'
        }}
      />
      
      {!mapLoaded && (
        <div className={styles.mapLoading}>
          地図を読み込み中...
        </div>
      )}
    </div>
  );
};
