import { useEffect, useState } from 'react';
import { fetchTenantMembers } from '@/features/corretores/services/tenantMembersService';

interface BrokerPhotoLookup {
  byUserId: Map<string, string>;
  byNormalizedName: Map<string, string>;
  byEmail: Map<string, string>;
}

const EMPTY_LOOKUP: BrokerPhotoLookup = {
  byUserId: new Map(),
  byNormalizedName: new Map(),
  byEmail: new Map(),
};

const COMBINING_MARKS = /[̀-ͯ]/g;

const normalizeName = (value: string | null | undefined) =>
  String(value || '')
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .trim();

const emailToName = (email: string) => {
  const local = email.split('@')[0] || email;
  return local.replace(/[._-]+/g, ' ');
};

export function useTenantBrokerPhotos(tenantId: string | null | undefined) {
  const [lookup, setLookup] = useState<BrokerPhotoLookup>(EMPTY_LOOKUP);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!tenantId || tenantId === 'owner') {
      setLookup(EMPTY_LOOKUP);
      return;
    }

    setIsLoading(true);
    fetchTenantMembers(tenantId)
      .then((members) => {
        if (cancelled) return;
        const byUserId = new Map<string, string>();
        const byNormalizedName = new Map<string, string>();
        const byEmail = new Map<string, string>();

        members.forEach((member) => {
          const photo = (member.permissions as { photo?: string } | undefined)?.photo;
          if (!photo) return;
          if (member.user_id) byUserId.set(member.user_id, photo);
          if (member.email) {
            byEmail.set(member.email.toLowerCase().trim(), photo);
            const derivedName = normalizeName(emailToName(member.email));
            if (derivedName) byNormalizedName.set(derivedName, photo);
          }
        });

        setLookup({ byUserId, byNormalizedName, byEmail });
      })
      .catch(() => {
        if (!cancelled) setLookup(EMPTY_LOOKUP);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [tenantId]);

  const getPhoto = (params: { userId?: string | null; name?: string | null; email?: string | null }) => {
    const { userId, name, email } = params;
    if (userId && lookup.byUserId.has(userId)) return lookup.byUserId.get(userId);
    if (email) {
      const key = email.toLowerCase().trim();
      if (lookup.byEmail.has(key)) return lookup.byEmail.get(key);
    }
    if (name) {
      const key = normalizeName(name);
      if (lookup.byNormalizedName.has(key)) return lookup.byNormalizedName.get(key);
    }
    return undefined;
  };

  return { getPhoto, isLoading };
}
