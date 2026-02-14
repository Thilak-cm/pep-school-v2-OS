import { useEffect, useMemo, useState } from 'react';
import { getSaveQueueSnapshot, subscribeSaveQueue } from '../services/saveQueue';

export default function useSaveQueue(studentId = null) {
  const [items, setItems] = useState(() => getSaveQueueSnapshot());

  useEffect(() => {
    const unsubscribe = subscribeSaveQueue((snapshot) => {
      setItems(snapshot);
    });
    return unsubscribe;
  }, []);

  return useMemo(() => {
    if (!studentId) return items;
    return items.filter((item) => item.studentId === studentId);
  }, [items, studentId]);
}
