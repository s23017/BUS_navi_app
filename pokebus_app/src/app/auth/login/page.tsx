"use client";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { loginUser } from "../../../../lib/authe";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const user = await loginUser(email, password);
      if (!user) throw new Error("ユーザーデータが見つかりません");
      // 成功したらホームへ
      router.push("/");
    } catch (err: any) {
      setError(err?.message || "ログインに失敗しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 480, margin: "40px auto" }}>
      <h1>ログイン</h1>

      <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
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
            style={{ width: "100%", padding: 8, marginTop: 6 }}
          />
        </label>

        <button type="submit" disabled={loading} style={{ padding: 10 }}>
          {loading ? "読み込み中..." : "ログイン"}
        </button>
      </form>

      {error && <div style={{ marginTop: 12, color: "crimson" }}>{error}</div>}

      <div style={{ marginTop: 18 }}>
        新規登録は <Link href="/auth/signup">こちら</Link>
      </div>
    </div>
  );
}
