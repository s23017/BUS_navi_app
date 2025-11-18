'use client';

import { useRouter } from 'next/navigation';

export default function SettingsPage() {
  const router = useRouter();

  return (
    <div style={{ padding: '20px' }}>
      <div style={{ 
        backgroundColor: '#007bff', 
        color: 'white', 
        padding: '16px 20px', 
        display: 'flex', 
        alignItems: 'center', 
        gap: '16px', 
        marginBottom: '20px',
        borderRadius: '8px'
      }}>
        <button 
          onClick={() => router.back()} 
          style={{ 
            background: 'none', 
            border: 'none', 
            color: 'white', 
            fontSize: '18px', 
            cursor: 'pointer',
            padding: '8px'
          }}
        >
          ←
        </button>
        <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 600 }}>設定</h1>
      </div>

      <div style={{ 
        backgroundColor: 'white', 
        borderRadius: '12px', 
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
        padding: '20px',
        textAlign: 'center'
      }}>
        <h2 style={{ marginBottom: '16px', color: '#666' }}>設定画面（開発中）</h2>
        <p style={{ color: '#999', marginBottom: '20px' }}>
          この画面は今後実装予定です。
        </p>
        <button 
          onClick={() => router.back()}
          style={{
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            padding: '12px 24px',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px'
          }}
        >
          戻る
        </button>
      </div>
    </div>
  );
}
