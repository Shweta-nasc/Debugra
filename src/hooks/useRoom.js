import { useState, useEffect, useCallback } from 'react';
import { doc, setDoc, updateDoc, onSnapshot, serverTimestamp, getDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import toast from 'react-hot-toast';

const ROOM_AUTH_PREFIX = 'debugra_roomAuth_';

async function hashRoomPassword(password, salt) {
  const encoded = new TextEncoder().encode(`${salt}:${password}`);
  const digest = await crypto.subtle.digest('SHA-256', encoded);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function createRoomSalt() {
  return crypto.randomUUID().replace(/-/g, '');
}

function rememberRoomAccess(roomId) {
  sessionStorage.setItem(`${ROOM_AUTH_PREFIX}${roomId}`, 'true');
}

function hasRememberedRoomAccess(roomId) {
  return sessionStorage.getItem(`${ROOM_AUTH_PREFIX}${roomId}`) === 'true';
}

/**
 * useRoom
 * Manages all Firebase Firestore room state:
 *   - Creating and joining rooms
 *   - Real-time code/language sync
 *   - Access control (request, approve, deny, revoke, take/release)
 *   - Active user presence list
 *
 * @param {{ uid, displayName, email }} user - the current Firebase user
 * @param {string} code - current editor code (for syncing)
 * @param {string} language - current editor language
 * @param {string} stdinValue - current stdin value
 * @param {Function} setCode - to apply remote code changes
 * @param {Function} setLanguage - to apply remote language changes
 * @param {Function} setStdinValue - to apply remote stdin changes
 */
export function useRoom({ user, code, language, stdinValue, setCode, setLanguage, setStdinValue }) {
  const [roomId, setRoomId] = useState(null);
  const [roomData, setRoomData] = useState(null);
  const [activeUsers, setActiveUsers] = useState([]);
  const [showOnlineDropdown, setShowOnlineDropdown] = useState(false);
  const [showRequestsDropdown, setShowRequestsDropdown] = useState(false);

  // ─── Derived permissions ────────────────────────────────────────────────────
  const myRole = roomData?.roles?.[user?.uid] || (roomData?.createdBy === user?.uid ? 'host' : 'viewer');
  const isHost = myRole === 'host';
  const isEditor = myRole === 'editor' || isHost;
  const isReadOnly = !isEditor;
  const currentEditorName = isEditor ? (user?.displayName || 'Editor') : 'Viewer';

  // ─── Live sync from Firestore ───────────────────────────────────────────────
  useEffect(() => {
    if (!roomId) return;
    const unsub = onSnapshot(doc(db, 'rooms', roomId), (snap) => {
      if (!snap.exists()) return;
      const data = snap.data();
      setRoomData(data);
      if (data.code !== undefined && data._lastEditor !== user?.uid) setCode(data.code);
      if (data.language) setLanguage(data.language);
      if (data.stdin !== undefined && data._lastEditor !== user?.uid) setStdinValue(data.stdin);
      setActiveUsers(data.activeUsers || []);
    });
    return unsub;
  }, [roomId, user]);

  // ─── Push local changes (debounced, editor-gated) ──────────────────────────
  useEffect(() => {
    if (!roomId || !user || !roomData) return;
    if (!isEditor) return;
    const timer = setTimeout(() => {
      updateDoc(doc(db, 'rooms', roomId), {
        code,
        language,
        stdin: stdinValue,
        _lastEditor: user.uid,
        updatedAt: serverTimestamp(),
      }).catch(() => {});
    }, 300);
    return () => clearTimeout(timer);
  }, [code, language, stdinValue, roomId, user, isEditor]);

  // ─── Sync active file (language) for presence ───────────────────────────────
  useEffect(() => {
    if (!roomId || !user || !roomData) return;
    const currentUsers = roomData.activeUsers || [];
    const myIndex = currentUsers.findIndex((u) => u.uid === user.uid);
    if (myIndex !== -1 && currentUsers[myIndex].activeFile !== language) {
      const newUsers = [...currentUsers];
      newUsers[myIndex] = { ...newUsers[myIndex], activeFile: language };
      updateDoc(doc(db, 'rooms', roomId), { activeUsers: newUsers }).catch(() => {});
    }
  }, [roomId, user, roomData, language]);

  // ─── Auto-join from local storage ───────────────────────────────────────────
  useEffect(() => {
    const savedRoomId = localStorage.getItem('debugra_roomId');
    if (user && savedRoomId && !roomId) {
      joinRoom(savedRoomId).catch(() => {
        localStorage.removeItem('debugra_roomId');
      });
    }
  }, [user, roomId]); // Join logic uses the function below

  // ─── Create room ────────────────────────────────────────────────────────────
  const createRoom = useCallback(
    async (roomPassword = '') => {
      if (!user) return false; // let caller show auth modal
      const id = crypto.randomUUID().slice(0, 8);
      const displayName = user.displayName || user.email?.split('@')[0] || 'Guest';
      const trimmedPassword = roomPassword.trim();
      const passwordSalt = trimmedPassword ? createRoomSalt() : null;
      const passwordHash = trimmedPassword
        ? await hashRoomPassword(trimmedPassword, passwordSalt)
        : null;

      await setDoc(doc(db, 'rooms', id), {
        name: `Room ${id}`,
        createdBy: user.uid,
        isPrivate: Boolean(passwordHash),
        passwordSalt,
        passwordHash,
        code,
        language,
        activeUsers: [{ uid: user.uid, displayName }],
        roles: { [user.uid]: 'host' },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setRoomId(id);
      localStorage.setItem('debugra_roomId', id);
      rememberRoomAccess(id);
      toast.success(`Room created! ID: ${id}`);
      navigator.clipboard.writeText(id);

      // Trigger Webhook via Backend API
      fetch(import.meta.env.VITE_API_URL + '/api/webhooks/room-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'room_created',
          roomId: id,
          userName: displayName,
          passwordProtected: Boolean(passwordHash)
        })
      }).catch(console.error);

      return true;
    },
    [user, code, language]
  );

  // ─── Join room ──────────────────────────────────────────────────────────────
  const joinRoom = useCallback(
    async (joinId, roomPassword = '') => {
      if (!user || !joinId.trim()) return false;
      const newRoomId = joinId.trim();
      try {
        const roomRef = doc(db, 'rooms', newRoomId);
        const roomSnap = await getDoc(roomRef);
        if (!roomSnap.exists()) {
          toast.error('Room not found');
          return false;
        }
        const data = roomSnap.data();
        const currentUsers = data.activeUsers || [];
        const isCreator = data.createdBy === user.uid;
        const isAllowed = data.allowedEditors?.includes(user.uid);
        const needsPassword =
          data.passwordHash && !isCreator && !isAllowed && !hasRememberedRoomAccess(newRoomId);

        if (needsPassword) {
          const suppliedPassword = roomPassword.trim();
          if (!suppliedPassword) {
            toast.error('Room passcode required');
            return false;
          }

          const suppliedHash = await hashRoomPassword(suppliedPassword, data.passwordSalt);
          if (suppliedHash !== data.passwordHash) {
            toast.error('Invalid room passcode');
            return false;
          }
        }

        const displayName = user.displayName || user.email?.split('@')[0] || 'Guest';
        const newRoles = { ...(data.roles || {}) };
        if (!newRoles[user.uid]) newRoles[user.uid] = 'viewer';

        if (!currentUsers.some((u) => u.uid === user.uid)) {
          await updateDoc(roomRef, {
            activeUsers: [...currentUsers, { uid: user.uid, displayName }],
            roles: newRoles,
          });
        } else if (!data.roles || !data.roles[user.uid]) {
          await updateDoc(roomRef, { roles: newRoles });
        }
        setRoomId(newRoomId);
        localStorage.setItem('debugra_roomId', newRoomId);
        rememberRoomAccess(newRoomId);
        toast.success(`Joined room: ${newRoomId}`);

        // Trigger Webhook via Backend API
        fetch(import.meta.env.VITE_API_URL + '/api/webhooks/room-event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: 'room_joined',
            roomId: newRoomId,
            userName: displayName
          })
        }).catch(console.error);

        return true;
      } catch {
        toast.error('Failed to join room');
        return false;
      }
    },
    [user]
  );

  // (Legacy access control methods removed for simpler role system)
  const requestAccess = useCallback(() => {}, []);
  const approveAccess = useCallback(() => {}, []);
  const denyAccess = useCallback(() => {}, []);
  const revokeAccess = useCallback(() => {}, []);
  const takeControl = useCallback(() => {}, []);
  const releaseControl = useCallback(() => {}, []);

  const leaveRoom = useCallback(async () => {
    if (!roomId) return;
    try {
      localStorage.removeItem('debugra_roomId');
      if (user && roomData) {
        const newUsers = (roomData.activeUsers || []).filter((u) => u.uid !== user.uid);
        await updateDoc(doc(db, 'rooms', roomId), { activeUsers: newUsers }).catch(() => {});
      }
    } catch (e) {
      console.error(e);
    }
    setRoomId(null);
    setRoomData(null);
    setActiveUsers([]);
    toast.success('Left the room');
  }, [roomId, user, roomData]);

  return {
    roomId,
    roomData,
    activeUsers,
    showOnlineDropdown,
    setShowOnlineDropdown,
    showRequestsDropdown,
    setShowRequestsDropdown,
    isHost,
    isEditor,
    isReadOnly,
    currentEditorName,
    createRoom,
    joinRoom,
    requestAccess,
    approveAccess,
    denyAccess,
    revokeAccess,
    takeControl,
    releaseControl,
    leaveRoom,
  };
}
