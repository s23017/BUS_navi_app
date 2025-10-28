import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, updateProfile, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { FirebaseError } from "firebase/app";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { auth, db } from "./firebase";

interface UserProfile {
  uid: string;
  username: string;
  email: string;
  createdAt: string;
}


export async function registerUser(email: string, password: string, username: string) {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // displayName を更新
    await updateProfile(user, { displayName: username });

    // Firestore にユーザープロファイルを作成
    const userRef = doc(db, "Users", user.uid);
    const userData: UserProfile = {
      uid: user.uid,
      username,
      email,
      createdAt: new Date().toISOString(),
    };
    await setDoc(userRef, userData);

    return userData;
  } catch (err) {
    // FirebaseError のコードを日本語化して投げ直す
    if ((err as FirebaseError).code) {
      const code = (err as FirebaseError).code;
      let message = (err as FirebaseError).message || "登録に失敗しました";
      switch (code) {
        case "auth/operation-not-allowed":
          message = "メール/パスワード認証が無効になっています。Firebase コンソールの認証方法で Email/Password を有効にしてください。";
          break;
        case "auth/email-already-in-use":
          message = "そのメールアドレスは既に使用されています。ログインを試すか、別のメールアドレスを使用してください。";
          break;
        case "auth/invalid-email":
          message = "メールアドレスの形式が正しくありません。";
          break;
        case "auth/weak-password":
          message = "パスワードが弱すぎます。6文字以上のパスワードを使用してください。";
          break;
        // 必要なら他のコードを追加
      }
      throw new Error(message);
    }
    throw err;
  }
}


export async function loginUser(email: string, password: string) {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // Firestore の Users ドキュメントを取得。存在しなければ作成して返す。
    const userRef = doc(db, "Users", user.uid);
    const userDoc = await getDoc(userRef);
    if (userDoc.exists()) {
      return userDoc.data();
    }

    // ドキュメントが無ければ最低限の情報で作成
    const userData: UserProfile = {
      uid: user.uid,
      username: user.displayName || "",
      email: user.email || email,
      createdAt: new Date().toISOString(),
    };
    await setDoc(userRef, userData);
    return userData;
  } catch (err) {
    if ((err as FirebaseError).code) {
      const code = (err as FirebaseError).code;
      let message = (err as FirebaseError).message || "ログインに失敗しました";
      switch (code) {
        case "auth/user-not-found":
          message = "そのメールアドレスのユーザーは見つかりません。新規登録を行ってください。";
          break;
        case "auth/wrong-password":
          message = "パスワードが正しくありません。";
          break;
        case "auth/too-many-requests":
          message = "試行回数が多すぎます。後でもう一度試してください。";
          break;
        case "auth/invalid-email":
          message = "メールアドレスの形式が正しくありません。";
          break;
      }
      throw new Error(message);
    }
    throw err;
  }
}


export async function logoutUser() {
  await signOut(auth);
}


export async function loginWithGoogle() {
  try {
    const provider = new GoogleAuthProvider();
    const userCredential = await signInWithPopup(auth, provider);
    const user = userCredential.user;

    // Firestore の Users ドキュメントを取得または作成
    const userRef = doc(db, "Users", user.uid);
    const userDoc = await getDoc(userRef);
    
    if (userDoc.exists()) {
      return userDoc.data();
    }

    // ドキュメントが無ければGoogleアカウント情報で作成
    const userData: UserProfile = {
      uid: user.uid,
      username: user.displayName || "Googleユーザー",
      email: user.email || "",
      createdAt: new Date().toISOString(),
    };
    await setDoc(userRef, userData);
    return userData;
  } catch (err) {
    if ((err as FirebaseError).code) {
      const code = (err as FirebaseError).code;
      let message = (err as FirebaseError).message || "Googleログインに失敗しました";
      switch (code) {
        case "auth/popup-closed-by-user":
          message = "ログインがキャンセルされました。";
          break;
        case "auth/popup-blocked":
          message = "ポップアップがブロックされました。ブラウザの設定を確認してください。";
          break;
        case "auth/operation-not-allowed":
          message = "Googleログインが無効になっています。Firebase コンソールでGoogle認証を有効にしてください。";
          break;
      }
      throw new Error(message);
    }
    throw err;
  }
}

export function getCurrentUser() {
  return auth.currentUser;
}
