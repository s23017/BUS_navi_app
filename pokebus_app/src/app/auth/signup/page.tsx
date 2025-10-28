"use client";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { registerUser } from "../../../../lib/authe";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!username.trim()) return setError("ユーザー名を入力してください");
    if (password.length < 6) return setError("パスワードは6文字以上にしてください");
    if (password !== confirm) return setError("パスワードが一致しません");

    setLoading(true);
    try {
      await registerUser(email, password, username);
      // 登録成功後はログイン画面へ
      router.push("/auth/login");
    } catch (err: any) {
      setError(err?.message || "登録に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 520, margin: "40px auto" }}>
      <h1>新規登録</h1>

      <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
        <label>
          ユーザー名
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            style={{ width: "100%", padding: 8, marginTop: 6 }}
          />
        </label>

        <label>
          メールアドレス
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{ width: "100%", padding: 8, marginTop: 6 }}
          />
        </label>

        <label>
          パスワード
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            style={{ width: "100%", padding: 8, marginTop: 6 }}
          />
        </label>

        <label>
          パスワード（確認）
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={6}
            style={{ width: "100%", padding: 8, marginTop: 6 }}
          />
        </label>

        <button type="submit" disabled={loading} style={{ padding: 10 }}>
          {loading ? "登録中..." : "登録する"}
        </button>
      </form>

      {error && <div style={{ marginTop: 12, color: "crimson" }}>{error}</div>}

      <div style={{ marginTop: 18 }}>
        すでにアカウントをお持ちですか？ <Link href="/auth/login">ログイン</Link>
      </div>
    </div>
  );
}
