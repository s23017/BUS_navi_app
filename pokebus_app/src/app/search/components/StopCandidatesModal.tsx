"use client";
import React from "react";
import styles from "../search.module.css";
import { X } from "lucide-react";

type Stop = any;

type Props = {
  visible: boolean;
  setVisible: (b: boolean) => void;
  loadingStops: boolean;
  stopsError: string | null;
  nearbyStops: Stop[];
  selectedDest: any;
  handleSelectStartStop: (s: Stop) => void;
};

export default function StopCandidatesModal({
  visible,
  setVisible,
  loadingStops,
  stopsError,
  nearbyStops,
  selectedDest,
  handleSelectStartStop,
}: Props) {
  if (!visible) return null;

  return (
    <div className={styles.modalOverlay} style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
    }}>
      <div className={styles.modalContent} style={{
        backgroundColor: 'white', borderRadius: '12px', padding: '0', maxWidth: '90vw', maxHeight: '80vh', width: '400px', boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)'
      }}>
        <div className={styles.modalHeader} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px', borderBottom: '1px solid #eee' }}>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600' }}>出発地点を選択</h3>
          <button className={styles.closeButton} onClick={() => setVisible(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: '4px' }}>
            <X size={24} />
          </button>
        </div>
        <div className={styles.modalBody} style={{ padding: '20px', maxHeight: '60vh', overflowY: 'auto' }}>
          {loadingStops && (
            <div className={styles.loadingSection} style={{ textAlign: 'center', padding: '40px' }}>
              <div className={styles.spinner} style={{ width: '40px', height: '40px', border: '4px solid #f3f3f3', borderTop: '4px solid #007bff', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 16px' }} />
              <p>検索中...</p>
            </div>
          )}

          {stopsError && (
            <div className={styles.errorSection} style={{ textAlign: 'center', padding: '40px', color: '#dc3545' }}>
              <p>{stopsError}</p>
            </div>
          )}

          {nearbyStops.length > 0 && (
            <div className={styles.stopsList}>
              {nearbyStops.map((s: Stop, index: number) => (
                <div
                  key={`nearby_${s.stop_id}_${index}`}
                  className={styles.stopCard}
                  onClick={() => handleSelectStartStop(s)}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', marginBottom: '8px', border: '1px solid #e0e0e0', borderRadius: '8px', cursor: 'pointer', transition: 'all 0.2s ease', backgroundColor: 'white' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = '#f8f9fa'; (e.currentTarget as HTMLElement).style.borderColor = '#007bff'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'white'; (e.currentTarget as HTMLElement).style.borderColor = '#e0e0e0'; }}
                >
                  <div className={styles.stopInfo}>
                    <div className={styles.stopName} style={{ fontSize: '16px', fontWeight: '500', marginBottom: '4px' }}>{s.stop_name}</div>
                    <div className={styles.stopDistance} style={{ fontSize: '14px', color: '#666' }}>📍 {s.distance ? `${Math.round(s.distance)}m` : '距離不明'}</div>
                  </div>
                  <div className={styles.selectArrow} style={{ color: '#007bff', fontSize: '18px' }}>▶</div>
                </div>
              ))}
            </div>
          )}

          {!loadingStops && nearbyStops.length === 0 && selectedDest && (
            <div className={styles.noResultsSection} style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
              <p>該当する停留所が見つかりませんでした</p>
              <p>検索条件を変更してお試しください</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
