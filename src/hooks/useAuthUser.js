import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { useLocation } from 'react-router-dom';
import { auth } from '../firebase';

export function useAuthUser() {
  const [user, setUser] = useState(() => auth.currentUser);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
    });

    return () => unsubscribe();
  }, []);

  return { user, authReady };
}

export function useNavigationKey() {
  const location = useLocation();
  return location.key;
}

export function useAuthReloadKey() {
  const navigationKey = useNavigationKey();
  const [pageshowKey, setPageshowKey] = useState(0);

  useEffect(() => {
    const handlePageShow = (event) => {
      if (event.persisted) {
        setPageshowKey((value) => value + 1);
      }
    };

    window.addEventListener('pageshow', handlePageShow);
    return () => window.removeEventListener('pageshow', handlePageShow);
  }, []);

  return `${navigationKey}:${pageshowKey}`;
}
