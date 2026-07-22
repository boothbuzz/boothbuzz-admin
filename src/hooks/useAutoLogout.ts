import { useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';

const AUTO_LOGOUT_TIME = 24 * 60 * 60 * 1000; // 24 hours

export const useAutoLogout = () => {
  const { user, logout } = useAuth();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastActivityRef = useRef<number>(Date.now());

  const resetTimer = useCallback(() => {
    if (!user) return;

    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Set new timeout for auto-logout
    timeoutRef.current = setTimeout(() => {
      console.log('Auto-logout: User inactive for 24 hours, logging out...');
      logout();
    }, AUTO_LOGOUT_TIME);

    lastActivityRef.current = Date.now();
  }, [user, logout]);

  const handleActivity = useCallback(() => {
    if (!user) return;
    resetTimer();
  }, [user, resetTimer]);

  useEffect(() => {
    if (!user) {
      // Clear timer when user logs out
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      return;
    }

    // Initialize timer when user logs in
    resetTimer();

    // Add event listeners for user activity
    const events = [
      'mousedown',
      'mousemove',
      'keypress',
      'scroll',
      'touchstart',
      'click'
    ];

    events.forEach(event => {
      document.addEventListener(event, handleActivity, true);
    });

    // Cleanup function
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      
      events.forEach(event => {
        document.removeEventListener(event, handleActivity, true);
      });
    };
  }, [user, resetTimer, handleActivity]);

  // Return remaining time for potential UI display
  const getRemainingTime = useCallback(() => {
    if (!user || !timeoutRef.current) return 0;
    
    const elapsed = Date.now() - lastActivityRef.current;
    return Math.max(0, AUTO_LOGOUT_TIME - elapsed);
  }, [user]);

  return {
    getRemainingTime,
    resetTimer
  };
};
