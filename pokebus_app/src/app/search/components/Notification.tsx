// components/Notification.tsx - 通知表示コンポーネント
import React from 'react';
import styles from '../search.module.css';

interface NotificationProps {
  message: string;
  isVisible: boolean;
}

export const Notification: React.FC<NotificationProps> = ({
  message,
  isVisible
}) => {
  if (!message) return null;

  return (
    <div className={`${styles.notification} ${isVisible ? styles.notificationVisible : ''}`}>
      {message}
    </div>
  );
};
