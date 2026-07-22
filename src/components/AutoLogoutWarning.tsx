import React, { useState, useEffect } from 'react';
import { useAutoLogout } from '../hooks/useAutoLogout';
import { useAuth } from '../contexts/AuthContext';

export const AutoLogoutWarning: React.FC = () => {
  const { user } = useAuth();
  const { getRemainingTime } = useAutoLogout();
  const [showWarning, setShowWarning] = useState(false);
  const [remainingTime, setRemainingTime] = useState(0);

  useEffect(() => {
    if (!user) {
      setShowWarning(false);
      return;
    }

    const interval = setInterval(() => {
      const timeLeft = getRemainingTime();
      setRemainingTime(timeLeft);

      // Show warning when 15 minutes or less remaining
      if (timeLeft <= 15 * 60 * 1000 && timeLeft > 0) {
        setShowWarning(true);
      } else {
        setShowWarning(false);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [user, getRemainingTime]);

  if (!showWarning || !user) {
    return null;
  }

  const minutes = Math.floor(remainingTime / 60000);
  const seconds = Math.floor((remainingTime % 60000) / 1000);

  return (
    <div className="fixed top-4 right-4 z-50 bg-yellow-100 border border-yellow-400 text-yellow-800 px-4 py-3 rounded-lg shadow-lg max-w-sm">
      <div className="flex items-center">
        <div className="flex-shrink-0">
          <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        </div>
        <div className="ml-3">
          <p className="text-sm font-medium">
            Session expires in {minutes}:{seconds.toString().padStart(2, '0')}
          </p>
          <p className="text-xs mt-1">
            Move your mouse or press a key to stay logged in
          </p>
        </div>
      </div>
    </div>
  );
};
