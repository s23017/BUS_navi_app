// components/BusStopsList.tsx - 詳細なバス停リスト表示
import React from 'react';
import { useRouter } from 'next/navigation';
import styles from '../search.module.css';
import { BusStop, PassedStopRecord } from '../types';
import { getDistance } from '../utils';

interface BusStopsListProps {
  routeStops: BusStop[];
  busPassedStops: PassedStopRecord[];
  estimatedArrivalTimes: Record<string, string>;
  currentLocationRef: React.MutableRefObject<google.maps.LatLng | null>;
  currentUser: any;
  onFitBounds: () => void;
}

export const BusStopsList: React.FC<BusStopsListProps> = ({
  routeStops,
  busPassedStops,
  estimatedArrivalTimes,
  currentLocationRef,
  currentUser,
  onFitBounds
}) => {
  const router = useRouter();

  // 指定した時刻が「現在時刻から見て過去N時間以内」であれば true を返す
  const isWithinPastHours = (timeStr?: string, hours = 2) => {
    if (!timeStr) return true;
    
    try {
      const parts = timeStr.split(":");
      if (parts.length < 2) return true;
      let hh = parseInt(parts[0]);
      const mm = parseInt(parts[1]) || 0;
      const ss = parts[2] ? parseInt(parts[2]) : 0;
      if (isNaN(hh) || isNaN(mm)) return true;
      
      const now = new Date();
      const base = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      const extraDays = Math.floor(hh / 24);
      hh = hh % 24;
      base.setHours(hh, mm, ss, 0);
      if (extraDays > 0) base.setDate(base.getDate() + extraDays);
      
      const cutoff = Date.now() - hours * 3600 * 1000;
      return base.getTime() >= cutoff;
    } catch (e) {
      return true;
    }
  };

  return (
    <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>
      停車順
      <button 
        className={styles.smallButton} 
        onClick={onFitBounds}
        style={{ marginLeft: '8px', fontSize: '12px', padding: '4px 8px' }}
      >
        表示範囲
      </button>
      <div style={{ maxHeight: '28vh', overflowY: 'auto', marginTop: '6px' }}>
        {routeStops
          .filter(rs => {
            // 出発地点より前のバス停は時刻に関係なく常に表示
            if (rs.isBeforeStart) {
              console.log(`Before start stop ${rs.stop_name}: showing regardless of time`);
              return true;
            }
            // その他の停留所は予定時刻が現在時刻から過去2時間を超える場合は表示しない
            const scheduled = rs.arrival_time || rs.departure_time;
            if (scheduled && !isWithinPastHours(scheduled, 2)) {
              console.log(`Stop ${rs.stop_name}: filtered out by time (${scheduled})`);
              return false;
            }
            console.log(`Stop ${rs.stop_name}: showing (time check passed)`);
            return true;
          })
          // 表示時にも重複除去を追加
          .filter((rs, index, array) => {
            const isDuplicate = index !== array.findIndex(stop => stop.stop_id === rs.stop_id);
            if (isDuplicate) {
              console.log(`Stop ${rs.stop_name}: filtered out as duplicate`);
            }
            return !isDuplicate;
          })
          .map((rs, idx) => {
            let isNearest = false;
            let nearestDistance = Infinity;
            
            try {
              if (currentLocationRef.current && rs.stop_lat && rs.stop_lon) {
                const curLat = (currentLocationRef.current as google.maps.LatLng).lat();
                const curLon = (currentLocationRef.current as google.maps.LatLng).lng();
                const d = getDistance(curLat, curLon, parseFloat(String(rs.stop_lat)), parseFloat(String(rs.stop_lon)));
                nearestDistance = d;
                isNearest = d < 150; // 150m以内を「現在地に近い」とする
                
                if (d < 250) { // 250m以内の場合はデバッグログ出力
                  console.log(`Stop ${rs.stop_name}: distance=${d.toFixed(0)}m, isNearest=${isNearest}`);
                }
              }
            } catch (e) {
              isNearest = false;
            }

            // 通過情報をチェック
            const passedInfo = busPassedStops.find(passed => passed.stopId === rs.stop_id);
            const estimatedTime = estimatedArrivalTimes[rs.stop_id];
            const isBeforeStart = rs.isBeforeStart; // 出発地点より前のバス停かどうか
            
            return (
              <div 
                key={`route_stop_${rs.stop_id}_${idx}`} 
                style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center', 
                  padding: '6px 8px', 
                  background: 
                    passedInfo ? (passedInfo.inferred ? '#fff4e6' : '#ffe6e6') : 
                    isNearest ? '#e6f7ff' : 
                    isBeforeStart ? '#f5f5f5' : 'transparent', 
                  borderRadius: '6px', 
                  marginBottom: '6px',
                  borderLeft: 
                    passedInfo ? (passedInfo.inferred ? '3px solid #ff9900' : '3px solid #ff4444') : 
                    isNearest ? '3px solid #007bff' : 
                    isBeforeStart ? '3px solid #ccc' : 'none',
                  opacity: isBeforeStart ? 0.7 : 1 // 出発地点より前は少し薄く表示
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: '13px' }}>
                    {passedInfo && (passedInfo.inferred ? '〜 ' : '✓ ')}
                    {isBeforeStart && '← '}
                    {rs.stop_name}
                  </div>
                  <div style={{ fontSize: '11px', color: '#666' }}>
                    {passedInfo ? (
                      <span>
                        {passedInfo.inferred ? '推定通過' : '通過'}: {passedInfo.passTime.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })} 
                        ({passedInfo.delay > 0 ? `+${passedInfo.delay}分` : passedInfo.delay < 0 ? `${passedInfo.delay}分` : '定刻'})
                        {passedInfo.username && (
                          <span style={{ color: '#28a745', fontWeight: '500' }}>
                            {' '}by{' '}
                            <span 
                              onClick={passedInfo.userId && passedInfo.userId !== 'anonymous' && passedInfo.userId !== currentUser?.uid ? () => {
                                router.push(`/profile?userId=${passedInfo.userId}&username=${encodeURIComponent(passedInfo.username || '')}`);
                              } : undefined}
                              style={{ 
                                cursor: passedInfo.userId && passedInfo.userId !== 'anonymous' && passedInfo.userId !== currentUser?.uid ? 'pointer' : 'default',
                                textDecoration: passedInfo.userId && passedInfo.userId !== 'anonymous' && passedInfo.userId !== currentUser?.uid ? 'underline' : 'none',
                                color: '#28a745'
                              }}
                              title={passedInfo.userId && passedInfo.userId !== 'anonymous' && passedInfo.userId !== currentUser?.uid ? `${passedInfo.username}のプロフィールを表示` : undefined}
                            >
                              {passedInfo.username}
                            </span>
                          </span>
                        )}
                      </span>
                    ) : estimatedTime ? (
                      `予測: ${estimatedTime} (元: ${rs.arrival_time || rs.departure_time || ''})`
                    ) : (
                      rs.arrival_time || rs.departure_time || ''
                    )}
                  </div>
                </div>
                <div style={{ 
                  fontSize: '12px', 
                  color: 
                    passedInfo ? (passedInfo.inferred ? '#ff9900' : '#ff4444') : 
                    isNearest ? '#007bff' : 
                    isBeforeStart ? '#999' : '#666',
                  fontWeight: passedInfo ? 600 : 'normal'
                }}>
                  {passedInfo ? (passedInfo.inferred ? '推定通過済み' : '通過済み') : 
                   isNearest ? '現在地近く' : 
                   isBeforeStart ? '出発前' : `${idx+1}`}
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
};
