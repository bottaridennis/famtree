import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db, describeFirebaseError } from '../firebase';
import type { Person } from '../types';
import { buildDemoPeople } from '../lib/data';

/** Solo in sviluppo: `?mock` mostra dati d'esempio senza toccare Firestore. */
const MOCK = import.meta.env.DEV && new URLSearchParams(location.search).has('mock');

export function usePeople() {
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (MOCK) {
      let n = 0;
      setPeople(buildDemoPeople(() => `mock${++n}`));
      setLoading(false);
      return;
    }
    return onSnapshot(
        collection(db, 'people'),
        (snap) => {
          setPeople(
            snap.docs.map((d) => {
              const data = d.data() as Omit<Person, 'id'>;
              return {
                ...data,
                id: d.id,
                firstName: data.firstName ?? '',
                lastName: data.lastName ?? '',
                gender: data.gender ?? 'other',
              };
            }),
          );
          setLoading(false);
          setError(null);
        },
        (err) => {
          console.error(err);
          setError(describeFirebaseError(err));
          setLoading(false);
        },
      );
  }, []);

  return { people, loading, error };
}
