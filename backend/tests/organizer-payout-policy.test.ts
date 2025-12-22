import test from 'node:test';
import assert from 'node:assert/strict';
import { OrganizersService } from '../src/organizers/organizers.service';
import { PermissionsService } from '../src/auth/permissions.service';

type UserRecord = {
  id: string;
  organizerPayoutPolicyAcceptedAt: Date | null;
};

const pickSelect = (record: UserRecord, select?: Record<string, boolean>) => {
  if (!select) return record;
  const result: Record<string, any> = {};
  Object.keys(select).forEach((key) => {
    if (select[key]) {
      result[key] = (record as any)[key];
    }
  });
  return result;
};

class PrismaStub {
  private userRecord: UserRecord | null;

  constructor(user: UserRecord | null) {
    this.userRecord = user;
  }

  user = {
    findUnique: async (args: { where: { id: string }; select?: Record<string, boolean> }) => {
      if (!this.userRecord || this.userRecord.id !== args.where.id) return null;
      return pickSelect(this.userRecord, args.select);
    },
    update: async (args: { where: { id: string }; data: Partial<UserRecord>; select?: Record<string, boolean> }) => {
      if (!this.userRecord || this.userRecord.id !== args.where.id) {
        throw new Error('User not found');
      }
      this.userRecord = { ...this.userRecord, ...args.data };
      return pickSelect(this.userRecord, args.select);
    },
  };
}

test('organizer payout policy status reflects stored acceptance', async () => {
  const user = { id: 'user-1', organizerPayoutPolicyAcceptedAt: null };
  const prisma = new PrismaStub(user) as any;
  const service = new OrganizersService(prisma);

  const status = await service.getPayoutPolicyStatus('user-1');
  assert.equal(status.acceptedAt, null);

  const accepted = await service.acceptPayoutPolicy('user-1');
  assert.ok(accepted.acceptedAt);

  const statusAfter = await service.getPayoutPolicyStatus('user-1');
  assert.ok(statusAfter.acceptedAt);
});

test('payout policy acceptance is required before onboarding', async () => {
  const user = { id: 'user-2', organizerPayoutPolicyAcceptedAt: null };
  const prisma = new PrismaStub(user) as any;
  const permissions = new PermissionsService(prisma);

  await assert.rejects(() => permissions.assertOrganizerPayoutPolicyAccepted('user-2'));

  user.organizerPayoutPolicyAcceptedAt = new Date();
  await assert.doesNotReject(() => permissions.assertOrganizerPayoutPolicyAccepted('user-2'));
});
