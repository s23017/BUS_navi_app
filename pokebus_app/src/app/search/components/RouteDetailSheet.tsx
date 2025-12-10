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
  setIsSearchCollapsed: (collapsed: boolean) => void;
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
    setIsSearchCollapsed,
  } = props;

  if (!selectedTripId || routeStops.length === 0) return null;

  const uniqueRouteStops = routeStops.filter((rs, index, array) => index === array.findIndex(stop => stop.stop_id === rs.stop_id));
  const passedStopIds = new Set(busPassedStops.map(passed => passed.stopId));
  const nextUpcomingStopIndex = uniqueRouteStops.findIndex(rs => !passedStopIds.has(rs.stop_id) && !rs.isBeforeStart);
  const nextUpcomingStop = nextUpcomingStopIndex >= 0 ? uniqueRouteStops[nextUpcomingStopIndex] : null;
  const lastPassedStop = busPassedStops.length > 0 ? busPassedStops[busPassedStops.length - 1] : null;
  const distanceToNextStop = (() => {
    if (!nextUpcomingStop || !currentLocationRef.current || !nextUpcomingStop.stop_lat || !nextUpcomingStop.stop_lon) {
      return null;
    }
    try {
      const currentLat = currentLocationRef.current.lat();
      const currentLng = currentLocationRef.current.lng();
      return Math.round(getDistance(currentLat, currentLng, parseFloat(nextUpcomingStop.stop_lat), parseFloat(nextUpcomingStop.stop_lon)));
    } catch (error) {
      return null;
    }
  })();

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
            onClick={() => setIsSearchCollapsed(false)}
            style={{ fontSize: '12px', padding: '4px 8px' }}
          >
            再検索
          </button>
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
        const realtimeDelay = tripDelays[selectedTripId || ''];
        const inferredDelay = typeof lastPassedStop?.delay === 'number' ? lastPassedStop.delay : null;
        const effectiveDelay = typeof realtimeDelay === 'number' ? realtimeDelay : inferredDelay;
        const delayText =
          effectiveDelay === null || typeof effectiveDelay !== 'number'
            ? '情報なし'
            : effectiveDelay === 0
            ? '定刻'
            : `${Math.abs(effectiveDelay)}分${effectiveDelay > 0 ? '遅れ' : '早着'}`;
        const delayColor =
          effectiveDelay === null || typeof effectiveDelay !== 'number'
            ? '#555'
            : effectiveDelay > 0
            ? '#c82333'
            : effectiveDelay < 0
            ? '#218838'
            : '#0d6efd';
        const delaySuffix =
          effectiveDelay !== null && typeof effectiveDelay === 'number' && typeof realtimeDelay !== 'number'
            ? '・推定'
            : '';
        const lastPassedDelayText = lastPassedStop
          ? lastPassedStop.delay === 0
            ? '（定刻）'
            : `（${Math.abs(lastPassedStop.delay)}分${lastPassedStop.delay > 0 ? '遅れ' : '早着'}）`
          : '';
        return (
          <div>
            <div style={{ marginBottom: '12px', padding: '12px', backgroundColor: '#f8f9fa', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '16px', fontWeight: 700, color: '#004085' }}>🚌 {bus?.route_short_name || bus?.route_long_name || bus?.route_id}</span>
                <span style={{ fontSize: '13px', fontWeight: 600, color: delayColor }}>{delayText}{delaySuffix}</span>
              </div>
              <div style={{ fontSize: '14px', color: '#333' }}>{bus?.departure || '未定'} → {bus?.arrival || '未定'}</div>
              {nextUpcomingStop && (
                <div style={{ fontSize: '14px', color: '#212529', fontWeight: 600 }}>
                  ➡ 次 {nextUpcomingStop.stop_name}
                  {distanceToNextStop !== null ? `（約${distanceToNextStop}m）` : ''}
                </div>
              )}
              {lastPassedStop && (
                <div style={{ fontSize: '13px', color: '#555' }}>
                  ✓ {lastPassedStop.stopName}{lastPassedDelayText}
                  {lastPassedStop.username ? ` / ${lastPassedStop.username}` : ''}
                </div>
              )}
            </div>

            {selectedTripId && ridersLocations.length > 0 && (
              <div style={{ marginBottom: '12px', padding: '12px', backgroundColor: '#fff4e5', borderRadius: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '14px', fontWeight: 600, color: '#8a4b16' }}>
                  <span>👥 共有中 {ridersLocations.length}人</span>
                  <span style={{ fontSize: '12px', color: isLocationSharing ? '#d63384' : '#6c757d' }}>
                    {isLocationSharing ? '🔴 あなた共有中' : '⚪ 確認のみ'}
                  </span>
                </div>
                {process.env.NODE_ENV === 'development' && (
                  <button
                    onClick={() => { updateOtherRidersMarkers(); }}
                    style={{ alignSelf: 'flex-start', fontSize: '12px', padding: '4px 8px', borderRadius: '6px', backgroundColor: '#f1f3f5', border: '1px solid #ced4da', cursor: 'pointer' }}
                    title="開発用: マーカーを手動更新"
                  >
                    共有情報を再読込
                  </button>
                )}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {ridersLocations
                    .filter((rider, index, self) => index === self.findIndex(r => r.id === rider.id))
                    .map((rider, index) => {
                      const isCurrentUser = rider.id === currentUser?.uid;
                      const canViewProfile = rider.userId && rider.userId !== 'anonymous';
                      return (
                        <span
                          key={`${rider.id}_${index}`}
                          onClick={canViewProfile && !isCurrentUser ? () => { router.push(`/profile?userId=${rider.userId}&username=${encodeURIComponent(rider.username)}`); } : undefined}
                          style={{
                            fontSize: '12px',
                            backgroundColor: isCurrentUser ? '#007bff' : '#d4edda',
                            color: isCurrentUser ? 'white' : '#155724',
                            borderRadius: '999px',
                            padding: '4px 10px',
                            cursor: canViewProfile && !isCurrentUser ? 'pointer' : 'default',
                            textDecoration: canViewProfile && !isCurrentUser ? 'underline' : 'none'
                          }}
                          title={canViewProfile && !isCurrentUser ? `${rider.username}さんのプロフィールを見る` : isCurrentUser ? 'あなた' : undefined}
                        >
                          {isCurrentUser ? 'あなた' : rider.username}
                        </span>
                      );
                    })}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
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
                style={{
                  backgroundColor: ridingTripId === selectedTripId ? '#dc3545' : '#28a745',
                  color: 'white',
                  padding: '12px 16px',
                  fontSize: '15px',
                  borderRadius: '10px'
                }}
              >
                {ridingTripId === selectedTripId ? '下車する' : 'バス停付近で乗車'}
              </button>
              <button
                className={styles.smallButton}
                onClick={() => {
                  if (!mapInstance.current || uniqueRouteStops.length === 0) return;
                  const bounds = new window.google.maps.LatLngBounds();
                  if (currentLocationRef.current) {
                    bounds.extend(currentLocationRef.current);
                  }
                  uniqueRouteStops.forEach(stop => {
                    if (stop.stop_lat && stop.stop_lon) {
                      bounds.extend(new window.google.maps.LatLng(parseFloat(stop.stop_lat), parseFloat(stop.stop_lon)));
                    }
                  });
                  mapInstance.current.fitBounds(bounds);
                }}
                style={{ padding: '12px 16px', fontSize: '14px', borderRadius: '10px' }}
              >
                地図を合わせる
              </button>
            </div>

            <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '6px' }}>停車順</div>
            <div style={{ maxHeight: '30vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {uniqueRouteStops.map((rs, idx) => {
                const passedInfo = busPassedStops.find(passed => passed.stopId === rs.stop_id);
                const estimatedTime = estimatedArrivalTimes[rs.stop_id];
                let timeDisplay = passedInfo
                  ? `通過 ${passedInfo.passTime.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`
                  : `予定 ${estimatedTime || rs.arrival_time || rs.departure_time || '時刻未設定'}`;
                if (passedInfo && passedInfo.delay !== 0) {
                  timeDisplay += `（${passedInfo.delay > 0 ? '+' : ''}${passedInfo.delay}分）`;
                }
                let statusLabel = 'これから';
                let statusColor = '#0d6efd';
                let backgroundColor = '#ffffff';
                let borderColor = '#e0e0e0';
                if (passedInfo) {
                  statusLabel = passedInfo.inferred ? '通過（目安）' : '通過済み';
                  statusColor = '#6c757d';
                  backgroundColor = '#f1f3f5';
                  borderColor = '#ced4da';
                } else if (rs.isBeforeStart) {
                  statusLabel = '運行前';
                  statusColor = '#6c757d';
                } else if (nextUpcomingStop && rs.stop_id === nextUpcomingStop.stop_id) {
                  statusLabel = '次に停車';
                  statusColor = '#d35400';
                  backgroundColor = '#fff4d6';
                  borderColor = '#ffc107';
                }

                return (
                  <div
                    key={`route_stop_${rs.stop_id}_${idx}`}
                    style={{
                      border: `1px solid ${borderColor}`,
                      borderRadius: '10px',
                      padding: '10px 12px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      backgroundColor
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '15px', fontWeight: 600, color: '#212529' }}>{rs.stop_name}</div>
                      <div style={{ fontSize: '13px', color: '#555' }}>{timeDisplay}</div>
                    </div>
                    <div style={{ fontSize: '12px', fontWeight: 600, color: statusColor }}>{statusLabel}</div>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                className={styles.smallButton}
                onClick={(e) => {
                  e.stopPropagation();
                  setIsSearchCollapsed(false);
                }}
                style={{ fontSize: '11px', padding: '4px 8px' }}
              >
                再検索
              </button>
              <div style={{ fontSize: '12px', color: '#666' }}>タップで詳細 ▲</div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
