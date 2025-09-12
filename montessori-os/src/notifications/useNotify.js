import { useMemo } from 'react';
import { useNotificationContext } from './NotificationContext.jsx';

export default function useNotify() {
  const { notify } = useNotificationContext();

  return useMemo(() => {
    const base = (message, options) => notify(message, options);
    base.success = (message, options = {}) => notify(message, { variant: 'success', ...options });
    base.error = (message, options = {}) => notify(message, { variant: 'error', ariaLive: 'assertive', ...options });
    base.warning = (message, options = {}) => notify(message, { variant: 'warning', ...options });
    base.info = (message, options = {}) => notify(message, { variant: 'info', ...options });
    return base;
  }, [notify]);
}

