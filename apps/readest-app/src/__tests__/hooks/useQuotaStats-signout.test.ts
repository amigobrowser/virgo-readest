import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

// The entitlement caches are read synchronously by non-React gates
// (`resolveCloudSyncGate`), so this exercises the plan reset on sign-out.

const auth = vi.hoisted(() => ({ token: null as string | null, user: null as unknown }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => auth }));

const cache = vi.hoisted(() => ({
  setCachedUserPlan: vi.fn(),
  setCachedCustomizationPurchased: vi.fn(),
}));
vi.mock('@/services/sync/cloudSyncProvider', () => cache);

vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => (s: string) => s }));

vi.mock('@/utils/access', () => ({
  getStoragePlanData: () => ({ plan: 'free', usage: 0, quota: 1000 }),
  getTranslationPlanData: () => ({ plan: 'free', usage: 0, quota: 1000 }),
  getUserProfilePlan: (token: string | null) => (token ? 'purchase' : 'pro'),
  getCustomizationPurchased: () => true,
}));

import { useQuotaStats } from '@/hooks/useQuotaStats';

beforeEach(() => {
  cache.setCachedUserPlan.mockReset();
  cache.setCachedCustomizationPurchased.mockReset();
});

describe('useQuotaStats — sign-out resets the entitlement caches', () => {
  it('caches the entitlement while signed in', () => {
    auth.token = 'a-token';
    auth.user = { id: 'user-1' };

    const { result } = renderHook(() => useQuotaStats());

    expect(result.current.customizationPurchased).toBe(true);
    expect(cache.setCachedCustomizationPurchased).toHaveBeenLastCalledWith(true);
  });

  it('resolves the plan to pro and clears the customization cache when the session goes away', () => {
    auth.token = 'a-token';
    auth.user = { id: 'user-1' };
    const { rerender, result } = renderHook(() => useQuotaStats());
    expect(cache.setCachedCustomizationPurchased).toHaveBeenLastCalledWith(true);

    auth.token = null;
    auth.user = null;
    rerender();

    expect(cache.setCachedCustomizationPurchased).toHaveBeenLastCalledWith(false);
    expect(cache.setCachedUserPlan).toHaveBeenLastCalledWith('pro');
    expect(result.current.userProfilePlan).toBe('pro');
    // Derived from the token, so the rendered value flips in the same pass
    // rather than a render later.
    expect(result.current.customizationPurchased).toBe(false);
  });
});
