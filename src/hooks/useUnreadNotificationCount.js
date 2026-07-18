import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

const normalizeBoatName = (boatName) => (boatName || '').trim().toLowerCase();

export function isNotificationUnread(notification) {
  return notification?.isRead !== true;
}

export function useUserUnreadNotificationCount(userId) {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!userId) {
      setUnreadCount(0);
      return undefined;
    }

    const q = query(
      collection(db, 'notifications'),
      where('userId', '==', userId),
      where('recipientType', '==', 'user')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const count = snapshot.docs.filter((docSnap) => isNotificationUnread(docSnap.data())).length;
      setUnreadCount(count);
    });

    return () => unsubscribe();
  }, [userId]);

  return unreadCount;
}

export function useAdminUnreadNotificationCount(assignedBoat, adminId) {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!assignedBoat) {
      setUnreadCount(0);
      return undefined;
    }

    const q = query(
      collection(db, 'notifications'),
      where('recipientType', '==', 'admin')
    );

    const assignedBoatNormalized = normalizeBoatName(assignedBoat);

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const count = snapshot.docs.filter((docSnap) => {
        const data = docSnap.data();
        if (!isNotificationUnread(data)) return false;

        const notificationBoat = normalizeBoatName(data.boat);
        if (notificationBoat) {
          return notificationBoat === assignedBoatNormalized;
        }
        if (data.adminId && adminId) {
          return data.adminId === adminId;
        }
        return true;
      }).length;

      setUnreadCount(count);
    });

    return () => unsubscribe();
  }, [assignedBoat, adminId]);

  return unreadCount;
}
