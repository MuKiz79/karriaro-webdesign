/**
 * Firebase Wrapper — Auth + Firestore operations
 */

function fb() { return window.__firebase; }

export function isLoggedIn() { return !!fb()?.auth?.currentUser; }
export function currentUser() { return fb()?.auth?.currentUser; }

export async function signIn() {
    if (!fb()) return;
    const provider = new fb().fns.GoogleAuthProvider();
    return fb().fns.signInWithPopup(fb().auth, provider);
}

export async function signOutUser() {
    if (!fb()) return;
    return fb().fns.signOut(fb().auth);
}

export function onAuth(callback) {
    if (!fb()) return;
    fb().fns.onAuthStateChanged(fb().auth, callback);
}
