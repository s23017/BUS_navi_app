'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { registerUser, loginUser, loginWithGoogle } from '../../../lib/authe';
import styles from './simple.module.css';

export default function LoginPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (isLogin) {
        // ログイン処理
        const userData = await loginUser(email, password);
        if (userData) {
          router.push('/search');
        } else {
          setError('ユーザー情報の取得に失敗しました');
        }
      } else {
        // 新規登録処理
        if (!username.trim()) {
          setError('ユーザー名を入力してください');
          setLoading(false);
          return;
        }
        await registerUser(email, password, username);
        
        // 新規登録成功後、自動的にログイン処理を実行
        try {
          const userData = await loginUser(email, password);
          if (userData) {
            router.push('/search');
          } else {
            // 自動ログインに失敗した場合は、ログインモードに切り替え
            setIsLogin(true);
            setUsername('');
            setError('新規登録は完了しました。ログインしてください。');
          }
        } catch (loginError) {
          // 自動ログインに失敗した場合は、ログインモードに切り替え
          setIsLogin(true);
          setUsername('');
          setError('新規登録は完了しました。ログインしてください。');
        }
      }
    } catch (error: any) {
      console.error('Authentication error:', error);
      console.error('Error code:', error.code);
      console.error('Error message:', error.message);
      
      // Firebase認証エラーメッセージの日本語化
      switch (error.code) {
        case 'permission-denied':
          setError('Firestoreへのアクセス権限がありません。Firebase Consoleでセキュリティルールを確認してください。');
          break;
        case 'auth/operation-not-allowed':
          setError('この認証方法は有効になっていません。Firebase Consoleで Email/Password 認証を有効にしてください。');
          break;
        case 'auth/email-already-in-use':
          setError('このメールアドレスは既に使用されています');
          break;
        case 'auth/weak-password':
          setError('パスワードは6文字以上で入力してください');
          break;
        case 'auth/invalid-email':
          setError('有効なメールアドレスを入力してください');
          break;
        case 'auth/user-not-found':
          setError('ユーザーが見つかりません');
          break;
        case 'auth/wrong-password':
          setError('パスワードが間違っています');
          break;
        case 'auth/invalid-credential':
          setError('メールアドレスまたはパスワードが間違っています');
          break;
        default:
          setError('認証に失敗しました。もう一度お試しください');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError('');

    try {
      const userData = await loginWithGoogle();
      if (userData) {
        router.push('/search');
      }
    } catch (error: any) {
      console.error('Google login error:', error);
      setError(error.message || 'Googleログインに失敗しました');
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = () => {
    setIsLogin(!isLogin);
    setError('');
    setEmail('');
    setPassword('');
    setUsername('');
  };

  return (
    <div className={styles.container}>
      <div className={styles.formContainer}>
        <h1 className={styles.title}>
          {isLogin ? 'ログイン' : '新規登録'}
        </h1>

        <div className={styles.inputContainer}>
          {!isLogin && (
            <input
              type="text"
              placeholder="ユーザー名"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={styles.input}
              required={!isLogin}
            />
          )}
          
          <input
            type="email"
            placeholder="メールアドレス"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={styles.input}
            required
          />
          
          <input
            type="password"
            placeholder="パスワード"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={styles.input}
            required
            minLength={6}
          />
        </div>

        {error && <p className={styles.error}>{error}</p>}

        <button
          onClick={(e) => {
            e.preventDefault();
            handleSubmit(e as any);
          }}
          disabled={loading}
          className={styles.submitButton}
        >
          {loading ? '処理中...' : isLogin ? 'ログイン' : '新規登録'}
        </button>

        <div className={styles.divider}>
          <div className={styles.dividerLine}></div>
          <span className={styles.dividerText}>または</span>
          <div className={styles.dividerLine}></div>
        </div>

        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          className={styles.googleButton}
        >
          <svg className={styles.googleIcon} viewBox="0 0 24 24">
            <path fill="#4285f4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34a853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#fbbc05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#ea4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Googleでログイン
        </button>

        <p className={styles.toggleText}>
          {isLogin ? 'アカウントをお持ちでない方は' : 'すでにアカウントをお持ちの方は'}{' '}
          <button
            onClick={toggleMode}
            className={styles.toggleButton}
          >
            {isLogin ? '新規登録' : 'ログイン'}
          </button>
        </p>
      </div>
    </div>
  );
}