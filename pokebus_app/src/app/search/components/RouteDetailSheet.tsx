"use client";
import React from "react";
import styles from "../search.module.css";
import { X } from "lucide-react";
import { useRouter } from "next/navigation";

type Props = {
  selectedTripId: string | null;
  routeStops: any[];
  isMobileViewport: boolean;
  sheetTouchStartYRef: React.MutableRefObject<number | null>;
  sheetDraggingRef: React.MutableRefObject<boolean>;
  sheetTranslateYRef: React.MutableRefObject<number>;
  sheetTranslateY: number;
  setSheetTranslateY: (n: number) => void;
  isSheetMinimized: boolean;
  setIsSheetMinimized: (b: boolean) => void;
  routeBuses: any[];
  tripDelays: Record<string, number | null>;
  ridersLocations: any[];
  isLocationSharing: boolean;
  currentUser: any;
  updateOtherRidersMarkers: () => void;
  busLocation: any;
  busPassedStops: any[];
  estimatedArrivalTimes: Record<string, string>;
  ridingTripId: string | null;
  setRidingTripId: (id: string | null) => void;
  getActiveTripId: () => string | undefined | null;
  stopLocationSharing: (tripId?: string) => void;
  startLocationSharing: (tripId: string) => void;
  mapInstance: React.MutableRefObject<any>;
  currentLocationRef: React.MutableRefObject<any>;
  setSelectedTripId: (id: string | null) => void;
  setRouteStops: (stops: any[]) => void;
  routeMarkersRef: React.MutableRefObject<any[]>;
  routePolylineRef: React.MutableRefObject<any>;
  getDistance: (a: number, b: number, c: number, d: number) => number;
  isWithinPastHours: (timeStr: string, hours: number) => boolean;
};

export default function RouteDetailSheet(props: Props) {
  const router = useRouter();
  const {
    selectedTripId,
    routeStops,
    isMobileViewport,
    sheetTouchStartYRef,
    sheetDraggingRef,
    sheetTranslateYRef,
    sheetTranslateY,
    setSheetTranslateY,
    isSheetMinimized,
    setIsSheetMinimized,
    routeBuses,
    tripDelays,
    ridersLocations,
    isLocationSharing,
    currentUser,
    updateOtherRidersMarkers,
    busLocation,
    busPassedStops,
    estimatedArrivalTimes,
    ridingTripId,
    setRidingTripId,
    getActiveTripId,
    stopLocationSharing,
    startLocationSharing,
    mapInstance,
    currentLocationRef,
    setSelectedTripId,
    setRouteStops,
    routeMarkersRef,
    routePolylineRef,
    getDistance,
    isWithinPastHours,
  } = props;

  if (!selectedTripId || routeStops.length === 0) return null;

  return (
    <div
      className={styles.routeDetailContainer}
      onTouchStart={(e) => {
        if (!isMobileViewport) return;
        if (!e.touches || e.touches.length === 0) return;

        const touchTarget = e.target as HTMLElement | null;
        const isHandleTouch = !!touchTarget?.closest('[data-sheet-handle="true"]');
        const shouldDrag = isHandleTouch || isSheetMinimized;

        if (!shouldDrag) {
          sheetDraggingRef.current = false;
          sheetTouchStartYRef.current = null;
          sheetTranslateYRef.current = 0;
          return;
        }

        sheetTouchStartYRef.current = e.touches[0].clientY;
        sheetDraggingRef.current = true;
        sheetTranslateYRef.current = 0;
        setSheetTranslateY(0);
      }}
      onTouchMove={(e) => {
        if (!isMobileViewport) return;
        if (!sheetDraggingRef.current || !sheetTouchStartYRef.current) return;
        try { e.preventDefault(); } catch (err) {}
        const curY = e.touches[0].clientY;
        const rawDelta = curY - sheetTouchStartYRef.current!;
        const maxDown = window.innerHeight * 0.9;
        const maxUp = 140;
        const clampedDelta = isSheetMinimized
          ? Math.max(-maxUp, Math.min(rawDelta, maxDown))
          : Math.max(0, Math.min(rawDelta, maxDown));
        sheetTranslateYRef.current = clampedDelta;
        setSheetTranslateY(clampedDelta);
      }}
      onTouchEnd={() => {
        if (!isMobileViewport) return;
        if (!sheetDraggingRef.current) return;
        sheetDraggingRef.current = false;
        const delta = sheetTranslateYRef.current;
        if (delta > 120) {
          if (isSheetMinimized) {
            setSelectedTripId(null);
            setRouteStops([]);
            setIsSheetMinimized(false);
            routeMarkersRef.current.forEach((m: any) => m.setMap(null));
            if (routePolylineRef.current) { routePolylineRef.current.setMap(null); routePolylineRef.current = null; }
          } else {
            setIsSheetMinimized(true);
          }
        } else if (delta < -80 && isSheetMinimized) {
          setIsSheetMinimized(false);
        }
        sheetTranslateYRef.current = 0;
        setSheetTranslateY(0);
        sheetTouchStartYRef.current = null;
      }}
      style={{
        transform: `translateY(${sheetTranslateY}px)`,
        maxHeight: isSheetMinimized ? '80px' : '50vh',
        transition: isSheetMinimized ? 'max-height 0.3s ease' : 'none',
        touchAction: isMobileViewport ? (isSheetMinimized ? 'none' : 'pan-y') : 'auto',
        userSelect: isMobileViewport ? 'none' : 'auto',
        WebkitUserSelect: isMobileViewport ? 'none' : 'auto',
        overflowY: isSheetMinimized ? 'hidden' : 'auto'
      }}
    >
      <div className={styles.sheetHandle} data-sheet-handle="true" />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <div style={{ fontWeight: 700 }}>便情報</div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className={styles.smallButton}
            onClick={() => setIsSheetMinimized(!isSheetMinimized)}
            style={{ fontSize: '12px', padding: '4px 8px' }}
          >
            {isSheetMinimized ? '展開' : '最小化'}
          </button>
        </div>
      </div>

      {!isSheetMinimized && (() => {
        const bus = routeBuses.find(b => b.trip_id === selectedTripId);
        const delay = tripDelays[selectedTripId || ''] ?? null;
        return (
          <div>
            <div style={{ marginBottom: '8px' }}>
              <div style={{ fontSize: '14px', color: '#007bff', fontWeight: 700 }}>🚌 {bus?.route_short_name || bus?.route_long_name || bus?.route_id}</div>
              <div style={{ fontSize: '12px', color: '#666' }}>出発: {bus?.departure || '不明'} • 到着: {bus?.arrival || '不明'}</div>
            </div>
            <div style={{ marginBottom: '8px' }}>
              <div style={{ fontSize: '12px', color: '#666' }}>遅延情報</div>
              <div style={{ fontWeight: 600 }}>{delay === null ? '遅延情報なし' : `${delay} 分遅延`}</div>
            </div>

            {selectedTripId && ridersLocations.length > 0 && (
              <div style={{ marginBottom: '8px', padding: '8px', backgroundColor: isLocationSharing ? '#e8f5e8' : '#f0f8ff', borderRadius: '6px' }}>
                <div style={{ fontSize: '12px', color: isLocationSharing ? '#28a745' : '#0066cc', fontWeight: 600, marginBottom: '4px' }}>
                  {isLocationSharing ? '🔴 リアルタイム追跡中' : '👀 他のライダー情報'} ({ridersLocations.length}人が乗車中)
                </div>
                <div style={{ fontSize: '11px', color: '#666', marginBottom: '4px' }}>
                  {isLocationSharing
                    ? '🚌 同じバスを選択したユーザー同士で位置情報を常時共有中（バス停通過時に通知）'
                    : '同じバスの他のライダーの位置情報を見ています'}
                  <br />
                  {isLocationSharing
                    ? '📍 位置情報を常時共有中（バス停通過時に自動通知）'
                    : '💡 「乗車中」ボタンを押すとあなたの位置も共有されます'}
                </div>

                {ridersLocations.length > 0 && (
                  <div style={{ marginBottom: '4px' }}>
                    <div style={{ fontSize: '10px', color: '#666', marginBottom: '2px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span>{isLocationSharing ? `🚌 乗車中ライダー (${ridersLocations.length}名):` : `👥 位置情報共有中 (${ridersLocations.length}名):`}</span>
                      {process.env.NODE_ENV === 'development' && (
                        <button
                          onClick={() => { updateOtherRidersMarkers(); }}
                          style={{ fontSize: '8px', padding: '2px 4px', backgroundColor: '#f0f0f0', border: '1px solid #ccc', borderRadius: '3px', cursor: 'pointer' }}
                          title="開発用: マーカーを手動更新"
                        >
                          🔄
                        </button>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                      {ridersLocations.length === 0 ? (
                        <span style={{ fontSize: '9px', color: '#999', fontStyle: 'italic' }}>現在乗車中のライダーはいません</span>
                      ) : (
                        ridersLocations
                          .filter((rider, index, self) => index === self.findIndex(r => r.id === rider.id))
                          .map((rider, index) => {
                            const isCurrentUser = rider.id === currentUser?.uid;
                            const canViewProfile = rider.userId && rider.userId !== 'anonymous';
                            return (
                              <span
                                key={`${rider.id}_${index}`}
                                onClick={canViewProfile && !isCurrentUser ? () => { router.push(`/profile?userId=${rider.userId}&username=${encodeURIComponent(rider.username)}`); } : undefined}
                                style={{ fontSize: '9px', backgroundColor: isCurrentUser ? '#007BFF' : '#d4edda', color: isCurrentUser ? 'white' : '#155724', border: isCurrentUser ? '1px solid #0056b3' : '1px solid #c3e6cb', borderRadius: '4px', padding: '1px 4px', cursor: canViewProfile && !isCurrentUser ? 'pointer' : 'default', textDecoration: canViewProfile && !isCurrentUser ? 'underline' : 'none', transition: 'all 0.2s ease' }}
                                title={canViewProfile && !isCurrentUser ? `${rider.username}のプロフィールを表示` : isCurrentUser ? 'あなた' : undefined}
                              >
                                {isCurrentUser ? '👤' : '🚌'} {rider.username}
                              </span>
                            );
                          })
                      )}
                    </div>
                  </div>
                )}

                {busLocation && (
                  <div style={{ fontSize: '11px', color: '#666' }}>バス推定位置: {busLocation.lat().toFixed(5)}, {busLocation.lng().toFixed(5)}</div>
                )}
                {busPassedStops.length > 0 && (
                  <div style={{ fontSize: '11px', color: '#666' }}>
                    直近通過: {busPassedStops[busPassedStops.length - 1].stopName}
                    ({busPassedStops[busPassedStops.length - 1].delay > 0 ? `${busPassedStops[busPassedStops.length - 1].delay}分遅れ` : busPassedStops[busPassedStops.length - 1].delay < 0 ? `${-busPassedStops[busPassedStops.length - 1].delay}分早く` : '定刻'})
                    {busPassedStops[busPassedStops.length - 1].username && (
                      <span style={{ color: '#28a745', fontWeight: '500' }}> {' '}by{' '}
                        <span
                          onClick={busPassedStops[busPassedStops.length - 1].userId && busPassedStops[busPassedStops.length - 1].userId !== 'anonymous' && busPassedStops[busPassedStops.length - 1].userId !== currentUser?.uid ? () => { const lastPassage = busPassedStops[busPassedStops.length - 1]; router.push(`/profile?userId=${lastPassage.userId}&username=${encodeURIComponent(lastPassage.username || '')}`); } : undefined}
                          style={{ cursor: busPassedStops[busPassedStops.length - 1].userId && busPassedStops[busPassedStops.length - 1].userId !== 'anonymous' && busPassedStops[busPassedStops.length - 1].userId !== currentUser?.uid ? 'pointer' : 'default', textDecoration: busPassedStops[busPassedStops.length - 1].userId && busPassedStops[busPassedStops.length - 1].userId !== 'anonymous' && busPassedStops[busPassedStops.length - 1].userId !== currentUser?.uid ? 'underline' : 'none', color: '#28a745' }}
                          title={busPassedStops[busPassedStops.length - 1].userId && busPassedStops[busPassedStops.length - 1].userId !== 'anonymous' && busPassedStops[busPassedStops.length - 1].userId !== currentUser?.uid ? `${busPassedStops[busPassedStops.length - 1].username}のプロフィールを表示` : undefined}
                        >
                          {busPassedStops[busPassedStops.length - 1].username}
                        </span>
                      </span>
                    )}
                  </div>
                )}
                <div style={{ fontSize: '10px', color: '#999', marginTop: '4px', fontStyle: 'italic' }}>✅ Firebase連携済み - リアルタイム共有が有効です</div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <button
                className={styles.selectButton}
                onClick={() => {
                  if (ridingTripId === selectedTripId) {
                    const activeTripId = getActiveTripId();
                    setRidingTripId(null);
                    stopLocationSharing(activeTripId || undefined);
                  } else {
                    setRidingTripId(selectedTripId);
                    if (selectedTripId) {
                      startLocationSharing(selectedTripId);
                    }
                  }
                }}
                style={{ backgroundColor: ridingTripId === selectedTripId ? '#dc3545' : '#28a745', color: 'white' }}
              >
                {ridingTripId === selectedTripId ? '下車する' : 'バス停付近で乗車'}
              </button>
              <button className={styles.smallButton} onClick={() => { mapInstance.current && routeStops.length > 0 && mapInstance.current.fitBounds((() => { const b = new window.google.maps.LatLngBounds(); if (currentLocationRef.current) b.extend(currentLocationRef.current); routeStops.forEach((rs)=>{ if (rs.stop_lat && rs.stop_lon) b.extend(new window.google.maps.LatLng(parseFloat(rs.stop_lat), parseFloat(rs.stop_lon))); }); return b; })()); }}>表示範囲</button>
            </div>

            <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '6px' }}>停車順</div>
            <div style={{ maxHeight: '28vh', overflowY: 'auto' }}>
              {routeStops
                .filter(rs => {
                  if (rs.isBeforeStart) return true;
                  const scheduled = rs.arrival_time || rs.departure_time;
                  if (scheduled && !isWithinPastHours(scheduled, 2)) return false;
                  return true;
                })
                .filter((rs, index, array) => index === array.findIndex(stop => stop.stop_id === rs.stop_id))
                .map((rs, idx) => {
                  let isNearest = false;
                  let nearestDistance = Infinity;
                  try {
                    if (currentLocationRef.current && rs.stop_lat && rs.stop_lon) {
                      const curLat = (currentLocationRef.current as any).lat();
                      const curLon = (currentLocationRef.current as any).lng();
                      const d = getDistance(curLat, curLon, parseFloat(rs.stop_lat), parseFloat(rs.stop_lon));
                      nearestDistance = d;
                      isNearest = d < 150;
                      if (d < 250) {
                        // debug
                      }
                    }
                  } catch (e) {
                    isNearest = false;
                  }

                  const passedInfo = busPassedStops.find(passed => passed.stopId === rs.stop_id);
                  const estimatedTime = estimatedArrivalTimes[rs.stop_id];
                  const isBeforeStart = rs.isBeforeStart;

                  return (
                    <div key={`route_stop_${rs.stop_id}_${idx}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 8px', background: passedInfo ? (passedInfo.inferred ? '#fff4e6' : '#ffe6e6') : isNearest ? '#e6f7ff' : isBeforeStart ? '#f5f5f5' : 'transparent', borderRadius: '6px', marginBottom: '6px', borderLeft: passedInfo ? (passedInfo.inferred ? '3px solid #ff9900' : '3px solid #ff4444') : isNearest ? '3px solid #007bff' : isBeforeStart ? '3px solid #ccc' : 'none', opacity: isBeforeStart ? 0.7 : 1 }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '13px' }}>{passedInfo && (passedInfo.inferred ? '〜 ' : '✓ ')}{isBeforeStart && '← '}{rs.stop_name}</div>
                        <div style={{ fontSize: '11px', color: '#666' }}>
                          {passedInfo ? (
                            <span>
                              {passedInfo.inferred ? '推定通過' : '通過'}: {passedInfo.passTime.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })} ({passedInfo.delay > 0 ? `+${passedInfo.delay}分` : passedInfo.delay < 0 ? `${passedInfo.delay}分` : '定刻'})
                              {passedInfo.username && (
                                <span style={{ color: '#28a745', fontWeight: '500' }}> {' '}by{' '}
                                  <span onClick={passedInfo.userId && passedInfo.userId !== 'anonymous' && passedInfo.userId !== currentUser?.uid ? () => { router.push(`/profile?userId=${passedInfo.userId}&username=${encodeURIComponent(passedInfo.username || '')}`); } : undefined} style={{ cursor: passedInfo.userId && passedInfo.userId !== 'anonymous' && passedInfo.userId !== currentUser?.uid ? 'pointer' : 'default', textDecoration: passedInfo.userId && passedInfo.userId !== 'anonymous' && passedInfo.userId !== currentUser?.uid ? 'underline' : 'none', color: '#28a745' }} title={passedInfo.userId && passedInfo.userId !== 'anonymous' && passedInfo.userId !== currentUser?.uid ? `${passedInfo.username}のプロフィールを表示` : undefined}>{passedInfo.username}</span>
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
                      <div style={{ fontSize: '12px', color: passedInfo ? (passedInfo.inferred ? '#ff9900' : '#ff4444') : isNearest ? '#007bff' : isBeforeStart ? '#999' : '#666', fontWeight: passedInfo ? 600 : 'normal' }}>
                        {passedInfo ? (passedInfo.inferred ? '推定通過済み' : '通過済み') : isNearest ? '現在地近く' : isBeforeStart ? '出発前' : `${idx+1}`}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        );
      })()}

      {isSheetMinimized && (() => {
        const bus = routeBuses.find(b => b.trip_id === selectedTripId);
        return (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', cursor: 'pointer' }} onClick={() => setIsSheetMinimized(false)}>
            <div>
              <div style={{ fontSize: '14px', color: '#007bff', fontWeight: 700 }}>🚌 {bus?.route_short_name || bus?.route_long_name || bus?.route_id}</div>
              <div style={{ fontSize: '12px', color: '#666' }}>出発: {bus?.departure || '不明'} • 到着: {bus?.arrival || '不明'}</div>
            </div>
            <div style={{ fontSize: '12px', color: '#666' }}>タップして詳細を表示 ▲</div>
          </div>
        );
      })()}
    </div>
  );
}
