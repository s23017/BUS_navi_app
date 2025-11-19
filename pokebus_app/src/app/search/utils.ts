// ユーティリティ関数
import { PassedStopRecord, BusStop } from './types';

/**
 * ゲストユーザーIDを生成
 */
export const generateGuestUserId = (): string => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  } else {
    return 'guest_' + Math.random().toString(36).substr(2, 9);
  }
};

/**
 * 2点間の距離を計算（メートル単位）
 */
export const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371000; // 地球の半径（メートル）
  
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

/**
 * ユーザー表示名を取得
 */
export const getUserDisplayName = (user: any): string => {
  if (user?.displayName) return user.displayName;
  if (user?.email) return user.email.split('@')[0];
  return 'ゲスト';
};

/**
 * 通過記録をマージ（重複除去）
 */
export const mergePassedStopRecords = (existing: PassedStopRecord[], additions: PassedStopRecord[]): PassedStopRecord[] => {
  const merged = [...existing];
  
  additions.forEach(addition => {
    const existingIndex = merged.findIndex(record => record.stopId === addition.stopId);
    if (existingIndex === -1) {
      merged.push(addition);
    } else if (merged[existingIndex].passTime < addition.passTime) {
      merged[existingIndex] = addition;
    }
  });
  
  return merged.sort((a, b) => a.passTime.getTime() - b.passTime.getTime());
};

/**
 * バス停の重複を除去
 */
export const removeDuplicateStops = (stops: BusStop[]): BusStop[] => {
  return stops.filter((stop, index, self) => 
    index === self.findIndex(s => s.stop_id === stop.stop_id)
  );
};

/**
 * 時刻文字列をDateオブジェクトに変換
 */
export const parseTimeString = (timeStr: string): Date => {
  const [hours, minutes, seconds] = timeStr.split(':').map(Number);
  const date = new Date();
  date.setHours(hours, minutes, seconds || 0, 0);
  return date;
};

/**
 * 現在時刻が指定時刻を過ぎているかチェック
 */
export const isTimePassed = (scheduledTime: string): boolean => {
  if (!scheduledTime) return false;
  
  try {
    const scheduled = parseTimeString(scheduledTime);
    const now = new Date();
    
    // 24時間制での比較
    const scheduledMinutes = scheduled.getHours() * 60 + scheduled.getMinutes();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    
    return nowMinutes >= scheduledMinutes;
  } catch (error) {
    console.warn('時刻解析エラー:', scheduledTime, error);
    return false;
  }
};

/**
 * デバッグ用：オブジェクトを安全に文字列化
 */
export const safeStringify = (obj: any): string => {
  try {
    return JSON.stringify(obj, null, 2);
  } catch (error) {
    return String(obj);
  }
};

/**
 * 座標の有効性をチェック
 */
export const isValidCoordinate = (lat: number | string, lng: number | string): boolean => {
  const numLat = typeof lat === 'string' ? parseFloat(lat) : lat;
  const numLng = typeof lng === 'string' ? parseFloat(lng) : lng;
  
  return !isNaN(numLat) && !isNaN(numLng) && 
         numLat >= -90 && numLat <= 90 && 
         numLng >= -180 && numLng <= 180;
};
