import { useConsoleCommunityStore } from '../stores/consoleCommunity';
import { fetchOrganizerPayoutPolicyStatus } from '../api/client';

export async function communityRouteGuard(to: any, _from: any, next: any) {
  const store = useConsoleCommunityStore();
  await store.loadCommunities();
  const communityId = to.params.communityId as string | undefined;
  if (!communityId || !store.hasCommunity(communityId)) {
    store.ensureActiveCommunity();
    if (store.activeCommunityId.value) {
      return next({
        name: 'console-community-events',
        params: { communityId: store.activeCommunityId.value },
      });
    }
    return next({ name: 'console-community-create' });
  }
  store.setActiveCommunity(communityId);
  return next();
}

export async function payoutPolicyGuard(to: any, _from: any, next: any) {
  try {
    const status = await fetchOrganizerPayoutPolicyStatus();
    if (status.acceptedAt) {
      return next();
    }
  } catch (error) {
    console.warn('Failed to load payout policy status', error);
  }
  return next({ path: '/organizer/payout-policy', query: { returnTo: to.fullPath } });
}
