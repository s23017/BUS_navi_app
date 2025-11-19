// components/RealTimeRidersInfo.tsx - リアルタイム乗客情報
import React from 'react';
import { useRouter } from 'next/navigation';
import styles from '../search.module.css';

interface RiderLocation {
  id: string;
  username: string;
  userId?: string;
  position: google.maps.LatLng;
  timestamp: Date;
  lastActive?: Date;
}

interface PassedStopRecord {
  stopId: string;
  stopName: string;
  passTime: Date;
  scheduledTime?: string;
  delay: number;
  username?: string;
  userId?: string;
  inferred?: boolean;
}

interface RealTimeRidersInfoProps {
  ridersLocations: RiderLocation[];
  busLocation: google.maps.LatLng | null;
  busPassedStops: PassedStopRecord[];
  isLocationSharing: boolean;
  currentUser: any;
  onUpdateMarkers?: () => void;
}

export const RealTimeRidersInfo: React.FC<RealTimeRidersInfoProps> = ({
  ridersLocations,
  busLocation,
  busPassedStops,
  isLocationSharing,
  currentUser,
  onUpdateMarkers
}) => {
  const router = useRouter();

  if (ridersLocations.length === 0 && !isLocationSharing) {
    return null;
  }

  return (
    <div style={{ 
      marginBottom: '8px', 
      padding: '8px', 
      backgroundColor: isLocationSharing ? '#e8f5e8' : '#f0f8ff', 
      borderRadius: '6px' 
    }}>
      <div style={{ 
        fontSize: '12px', 
        color: isLocationSharing ? '#28a745' : '#0066cc', 
        fontWeight: 600, 
        marginBottom: '4px' 
      }}>
        {isLocationSharing ? '🔴 リアルタイム追跡中' : '👀 他のライダー情報'} ({ridersLocations.length}人が乗車中)
      </div>
      
      <div style={{ fontSize: '11px', color: '#666', marginBottom: '4px' }}>
        {isLocationSharing 
          ? '🚌 同じバスを選択したユーザー同士で位置情報を常時共有中（バス停通過時に通知）' 
          : '同じバスの他のライダーの位置情報を見ています'
        }
        <br />
        {isLocationSharing 
          ? '📍 位置情報を常時共有中（バス停通過時に自動通知）' 
          : '💡 「乗車中」ボタンを押すとあなたの位置も共有されます'
        }
      </div>
      
      {/* 乗車中のユーザー一覧 */}
      {ridersLocations.length > 0 && (
        <div style={{ marginBottom: '4px' }}>
          <div style={{ 
            fontSize: '10px', 
            color: '#666', 
            marginBottom: '2px', 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center' 
          }}>
            <span>
              {isLocationSharing ? `🚌 乗車中ライダー (${ridersLocations.length}名):` : `👥 位置情報共有中 (${ridersLocations.length}名):`}
            </span>
            {process.env.NODE_ENV === 'development' && onUpdateMarkers && (
              <button 
                onClick={onUpdateMarkers}
                style={{ 
                  fontSize: '8px', 
                  padding: '2px 4px', 
                  backgroundColor: '#f0f0f0',
                  border: '1px solid #ccc',
                  borderRadius: '3px',
                  cursor: 'pointer'
                }}
                title="開発用: マーカーを手動更新"
              >
                🔄
              </button>
            )}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
            {ridersLocations.length === 0 ? (
              <span style={{ fontSize: '9px', color: '#999', fontStyle: 'italic' }}>
                現在乗車中のライダーはいません
              </span>
            ) : (
              ridersLocations
                .filter((rider, index, self) => 
                  index === self.findIndex(r => r.id === rider.id)
                )
                .map((rider, index) => {
                  const isCurrentUser = rider.id === currentUser?.uid;
                  const canViewProfile = rider.userId && rider.userId !== 'anonymous';
                  
                  return (
                    <span 
                      key={`${rider.id}_${index}`} 
                      onClick={canViewProfile && !isCurrentUser ? () => {
                        router.push(`/profile?userId=${rider.userId}&username=${encodeURIComponent(rider.username)}`);
                      } : undefined}
                      style={{ 
                        fontSize: '9px', 
                        backgroundColor: isCurrentUser ? '#007BFF' : '#d4edda',
                        color: isCurrentUser ? 'white' : '#155724',
                        border: isCurrentUser ? '1px solid #0056b3' : '1px solid #c3e6cb',
                        borderRadius: '4px',
                        padding: '1px 4px',
                        cursor: canViewProfile && !isCurrentUser ? 'pointer' : 'default',
                        textDecoration: canViewProfile && !isCurrentUser ? 'underline' : 'none',
                        transition: 'all 0.2s ease'
                      }}
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
        <div style={{ fontSize: '11px', color: '#666' }}>
          バス推定位置: {busLocation.lat().toFixed(5)}, {busLocation.lng().toFixed(5)}
        </div>
      )}
      
      {busPassedStops.length > 0 && (
        <div style={{ fontSize: '11px', color: '#666' }}>
          直近通過: {busPassedStops[busPassedStops.length - 1].stopName} 
          ({busPassedStops[busPassedStops.length - 1].delay > 0 ? `${busPassedStops[busPassedStops.length - 1].delay}分遅れ` : 
            busPassedStops[busPassedStops.length - 1].delay < 0 ? `${-busPassedStops[busPassedStops.length - 1].delay}分早く` : '定刻'})
          {busPassedStops[busPassedStops.length - 1].username && (
            <span style={{ color: '#28a745', fontWeight: '500' }}>
              {' '}by{' '}
              <span 
                onClick={busPassedStops[busPassedStops.length - 1].userId && 
                        busPassedStops[busPassedStops.length - 1].userId !== 'anonymous' && 
                        busPassedStops[busPassedStops.length - 1].userId !== currentUser?.uid ? () => {
                  const lastPassage = busPassedStops[busPassedStops.length - 1];
                  router.push(`/profile?userId=${lastPassage.userId}&username=${encodeURIComponent(lastPassage.username || '')}`);
                } : undefined}
                style={{ 
                  cursor: busPassedStops[busPassedStops.length - 1].userId && 
                          busPassedStops[busPassedStops.length - 1].userId !== 'anonymous' && 
                          busPassedStops[busPassedStops.length - 1].userId !== currentUser?.uid ? 'pointer' : 'default',
                  textDecoration: busPassedStops[busPassedStops.length - 1].userId && 
                                  busPassedStops[busPassedStops.length - 1].userId !== 'anonymous' && 
                                  busPassedStops[busPassedStops.length - 1].userId !== currentUser?.uid ? 'underline' : 'none',
                  color: '#28a745'
                }}
                title={busPassedStops[busPassedStops.length - 1].userId && 
                       busPassedStops[busPassedStops.length - 1].userId !== 'anonymous' && 
                       busPassedStops[busPassedStops.length - 1].userId !== currentUser?.uid ? 
                       `${busPassedStops[busPassedStops.length - 1].username}のプロフィールを表示` : undefined}
              >
                {busPassedStops[busPassedStops.length - 1].username}
              </span>
            </span>
          )}
        </div>
      )}
      
      <div style={{ fontSize: '10px', color: '#999', marginTop: '4px', fontStyle: 'italic' }}>
        ✅ Firebase連携済み - リアルタイム共有が有効です
      </div>
    </div>
  );
};
