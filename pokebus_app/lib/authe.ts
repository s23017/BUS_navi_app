import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, updateProfile } from "firebase/auth";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { auth, db } from "./firebase";

interface UserProfile {
  uid: string;
  username: string;
  email: string;
  createdAt: string;
}


export async function registerUser(email: string, password: string, username: string) {
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  const user = userCredential.user;

 
  await updateProfile(user, { displayName: username });

  
  const userRef = doc(db, "Users", user.uid);
  const userData: UserProfile = {
    uid: user.uid,
    username,
    email,
    createdAt: new Date().toISOString(),
  };
  await setDoc(userRef, userData);

  return userData;
}


export async function loginUser(email: string, password: string) {
  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  const user = userCredential.user;

 
  const userDoc = await getDoc(doc(db, "Users", user.uid));
  return userDoc.exists() ? userDoc.data() : null;
}


export async function logoutUser() {
  await signOut(auth);
}


export function getCurrentUser() {
  return auth.currentUser;
}
