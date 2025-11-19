"use client";
import React from "react";
import styles from "../search.module.css";
import { X } from "lucide-react";

type Bus = any;

type Props = {
  visible: boolean;
  onClose: () => void;
  selectedStart: any;
  selectedDest: any;
  loadingRoute: boolean;
  routeError: string | null;
  routeBuses: Bus[];
  selectedTripId: string | null;
  handleSelectBus: (tripId: string) => void;
};

export default function BusRoutesModal({ visible, onClose, selectedStart, selectedDest, loadingRoute, routeError, routeBuses, selectedTripId, handleSelectBus }: Props) {
  if (!visible) return null;

  return (
    <div className={styles.modalOverlay} style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
    }}>
      <div className={styles.modalContent} style={{
        backgroundColor: 'white', borderRadius: '12px', padding: '0', maxWidth: '90vw', maxHeight: '80vh', width: '450px', boxShadow: '0 10px 25px rgba(0, 0, 0, 0.2)'
      }}>
        <div className={styles.modalHeader} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px', borderBottom: '1px solid #eee' }}>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600' }}>バス便選択</h3>
          <button className={styles.closeButton} onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: '4px' }}>
            <X size={24} />
          </button>
        </div>
        <div className={styles.routeInfo} style={{ padding: '16px 20px', backgroundColor: '#f8f9fa', borderBottom: '1px solid #eee' }}>
          <div className={styles.routePoints} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div className={styles.startPoint} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
              <span className={styles.pointIcon} style={{ marginRight: '8px' }}>🚏</span>
              <span style={{ fontSize: '14px', fontWeight: '500' }}>{selectedStart?.stop_name}</span>
            </div>
            <div className={styles.routeArrow} style={{ margin: '0 16px', color: '#007bff', fontWeight: 'bold' }}>→</div>
            <div className={styles.endPoint} style={{ display: 'flex', alignItems: 'center', flex: 1, justifyContent: 'flex-end' }}>
              <span style={{ fontSize: '14px', fontWeight: '500' }}>{selectedDest?.stop_name}</span>
              <span className={styles.pointIcon} style={{ marginLeft: '8px' }}>🎯</span>
            </div>
          </div>
        </div>
        <div className={styles.modalBody}>
          {loadingRoute && (
            <div className={styles.loadingSection}><div className={styles.spinner}></div><p>ルート情報を取得中...</p></div>
          )}
          {routeError && (
            <div className={styles.errorSection}><p>{routeError}</p></div>
          )}
          {routeBuses.length > 0 && (
            <div className={styles.busList}>
              {routeBuses.map((b: Bus) => (
                <div key={b.trip_id}
                  className={`${styles.busCard} ${selectedTripId === b.trip_id ? styles.selectedBus : ''}`}
                  onClick={() => handleSelectBus(b.trip_id)}
                  style={{ padding: '16px', marginBottom: '12px', border: selectedTripId === b.trip_id ? '2px solid #007bff' : '1px solid #e0e0e0', borderRadius: '8px', cursor: 'pointer', transition: 'all 0.2s ease', backgroundColor: selectedTripId === b.trip_id ? '#f0f8ff' : 'white' }}
                  onMouseEnter={(e) => { if (selectedTripId !== b.trip_id) { (e.currentTarget as HTMLElement).style.backgroundColor = '#f8f9fa'; (e.currentTarget as HTMLElement).style.borderColor = '#007bff'; } }}
                  onMouseLeave={(e) => { if (selectedTripId !== b.trip_id) { (e.currentTarget as HTMLElement).style.backgroundColor = 'white'; (e.currentTarget as HTMLElement).style.borderColor = '#e0e0e0'; } }}
                >
                  <div className={styles.busHeader} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div className={styles.busNumber} style={{ fontSize: '18px', fontWeight: '600', color: '#007bff' }}>🚌 {b.route_short_name || b.route_long_name || b.route_id}</div>
                    <div className={styles.busStatus} style={{ fontSize: '12px', color: selectedTripId === b.trip_id ? '#007bff' : '#666', fontWeight: '500' }}>{selectedTripId === b.trip_id ? '表示中' : 'タップして表示'}</div>
                  </div>
                  <div className={styles.busDetails} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div className={styles.timeDetail} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                      <span className={styles.timeLabel} style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>出発</span>
                      <span className={styles.timeValue} style={{ fontSize: '16px', fontWeight: '600', color: '#28a745' }}>{b.departure || '不明'}</span>
                    </div>
                    <div className={styles.timeDetail} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                      <span className={styles.timeLabel} style={{ fontSize: '12px', color: '#666', marginBottom: '4px' }}>到着</span>
                      <span className={styles.timeValue} style={{ fontSize: '16px', fontWeight: '600', color: '#dc3545' }}>{b.arrival || '不明'}</span>
                    </div>
                    <div className={styles.stopsCount} style={{ fontSize: '14px', color: '#666', backgroundColor: '#f8f9fa', padding: '4px 8px', borderRadius: '12px', fontWeight: '500' }}>{b.stops_count}駅</div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {!loadingRoute && routeBuses.length === 0 && selectedStart && selectedDest && (
            <div className={styles.noResultsSection}><p>該当するバス便が見つかりませんでした</p><p>別の出発地点をお試しください</p></div>
          )}
        </div>
      </div>
    </div>
  );
}
