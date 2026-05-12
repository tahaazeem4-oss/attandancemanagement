import { useCallback, useEffect, useState } from 'react';
import api from '../services/api';

export default function useUnreadNotifications(path) {
  const [count, setCount] = useState(0);

  const fetchUnread = useCallback(() => {
    if (!path) return;
    api.get(path)
      .then(({ data }) => setCount(data.count || 0))
      .catch(() => setCount(0));
  }, [path]);

  useEffect(() => {
    fetchUnread();
  }, [fetchUnread]);

  return { count, fetchUnread };
}
