// components/NearbyStopsList.tsx - 元のモーダル形式の近隣バス停リスト
import React from 'react';
import { X } from 'lucide-react';
import styles from '../search.module.css';

interface NearbyStopsListProps {
  nearbyStops: any[];
  loadingStops: boolean;
  stopsError: string | null;
  showStopCandidates: boolean;
  onSelectStop: (stop: any) => void;
  onClose: () => void;
}

export function NearbyStopsList({
  nearbyStops,
  loadingStops,
  stopsError,
  showStopCandidates,
  onSelectStop,
  onClose
}: NearbyStopsListProps) {
  // showStopCandidatesがtrueの場合、またはローディング中やエラーがある場合に表示
  if (!showStopCandidates && !loadingStops && !stopsError) {
    return null;
  }

  return (
    <div className={styles.modalOverlay} style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div className={styles.modalContent} style={{
        backgroundColor: 'white',
        borderRadius: '12px',
        padding: '0',
        maxWidth: '90vw',
        maxHeight: '80vh',
        width: '400px',
        boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)'
      }}>
        <div className={styles.modalHeader} style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '1rem 1.5rem',
          borderBottom: '1px solid #e5e7eb',
          backgroundColor: '#f9fafb'
        }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '600' }}>
            {loadingStops ? '検索中...' : '出発地点を選択'}
          </h3>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '1.5rem',
              cursor: 'pointer',
              padding: '0.25rem',
              color: '#6b7280'
            }}
          >
            <X size={20} />
          </button>
        </div>
        
        <div style={{
          maxHeight: 'calc(80vh - 120px)',
          overflowY: 'auto',
          padding: '1rem'
        }}>
          {loadingStops && (
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              height: '200px'
            }}>
              <span style={{ color: '#6b7280' }}>検索中...</span>
            </div>
          )}
          
          {stopsError && (
            <div style={{
              color: '#b91c1c',
              padding: '1rem',
              textAlign: 'center'
            }}>
              エラー: {stopsError}
            </div>
          )}
          
          {showStopCandidates && nearbyStops.length > 0 && (
            <div>
              <p style={{
                margin: '0 0 1rem 0',
                color: '#6b7280',
                fontSize: '0.9rem'
              }}>
                目的地への経路があるバス停が見つかりました。
              </p>
              {nearbyStops.map((stop, index) => (
                <div
                  key={stop.stop_id || index}
                  style={{
                    padding: '0.75rem',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px',
                    marginBottom: '0.5rem',
                    cursor: 'pointer',
                    transition: 'background-color 0.2s',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                  className={styles.nearbyItem}
                  onClick={() => onSelectStop(stop)}
                >
                  <div>
                    <div style={{
                      fontWeight: '600',
                      color: '#1f2937',
                      marginBottom: '0.25rem'
                    }}>
                      {stop.stop_name}
                    </div>
                    <div style={{
                      color: '#6b7280',
                      fontSize: '0.8rem'
                    }}>
                      約 {Math.round(stop.distance)}m
                    </div>
                  </div>
                  <button
                    style={{
                      backgroundColor: '#3b82f6',
                      color: 'white',
                      padding: '0.25rem 0.75rem',
                      borderRadius: '6px',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '0.8rem'
                    }}
                  >
                    選択
                  </button>
                </div>
              ))}
            </div>
          )}
          
          {showStopCandidates && nearbyStops.length === 0 && !loadingStops && !stopsError && (
            <div style={{
              textAlign: 'center',
              color: '#6b7280',
              padding: '2rem'
            }}>
              目的地への経路があるバス停が見つかりませんでした。
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
