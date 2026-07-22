import { createRealmInventory } from './realm-inventory.js';
import { buildRealmQuestLinks, createRealmErpBridge } from './realm-business-bridge.js';
import { loadRealmCompanyModules } from './realm-access.js';
import { modOn } from './modules.js';
import { createRealmSyncEnvelope, normalizeRealmProfileVersion } from './realm-sync.js';
import { RealmOperationError, normalizeRealmIdempotencyKey } from './realm-operation.js';

const PROFILE_COLOR = /^#[0-9a-f]{6}$/i;
const REALM_CLASSES = new Set(['Realm Builder', 'Questsmith', 'Guild Master', 'Alchemist', 'Scout']);

export { RealmOperationError, normalizeRealmIdempotencyKey } from './realm-operation.js';

const safeJsonArray = (value) => {
  try {
    const parsed = JSON.parse(value || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

export function realmTaskProgress(task) {
  const checklist = safeJsonArray(task?.checklist);
  if (!checklist.length) return { progress: task?.status === 'done' ? 1 : 0, total: 1 };
  return {
    progress: task?.status === 'done' ? checklist.length : checklist.filter((item) => item?.done === true).length,
    total: checklist.length,
  };
}

export function mapErpTaskToRealmQuest(task, rewardedSourceIds = new Set(), accessContext = {}) {
  const reward = task?.realmQuest;
  const approvedStatus = reward?.status ? reward.status === 'approved' : Boolean(reward?.approvedAt);
  const approved = Boolean(reward?.active && approvedStatus && reward?.approvedAt && reward.gold > 0);
  const rewarded = rewardedSourceIds.has(task.id);
  const { progress, total } = realmTaskProgress(task);
  const status = rewarded ? 'claimed' : task.status === 'done' && approved ? 'ready' : 'active';
  const priority = task.priority === 'high' ? 'Epic' : task.priority === 'low' ? 'Common' : 'Skilled';
  return {
    id: `erp-task:${task.id}`,
    businessRef: task.id,
    module: 'Tasks',
    title: task.title,
    project: task.project?.name || 'Công việc nội bộ',
    owner: task.assignee?.name || '',
    approval: approved
      ? `Đã duyệt bởi ${reward.approvedBy?.name || 'quản lý'}`
      : reward?.status === 'pending'
        ? 'Đang chờ duyệt reward'
        : reward?.status === 'rejected'
          ? 'Reward cần điều chỉnh'
          : 'Chưa cấu hình reward',
    reviewer: reward?.approvedBy?.name || 'Quản lý',
    reward: approved ? reward.gold : 0,
    renown: approved ? reward.renown : 0,
    status,
    priority,
    due: task.dueDate instanceof Date ? task.dueDate.toISOString().slice(0, 10) : task.dueDate || 'Chưa có hạn',
    progress,
    total,
    remote: true,
    erpStatus: task.status,
    rewardApproved: approved,
    links: buildRealmQuestLinks(task, accessContext),
  };
}

export function serializeRealmErpSnapshot({ user, profile, tasks = [], entries = [], modules = null }) {
  const rewardedSourceIds = new Set(entries
    .filter((entry) => entry.type === 'quest_reward' && entry.sourceType === 'task' && entry.sourceId)
    .map((entry) => entry.sourceId));
  const { loadout } = createRealmInventory(entries);
  const ledger = entries.map((entry) => ({
    id: entry.id,
    at: entry.createdAt instanceof Date ? entry.createdAt.toISOString() : String(entry.createdAt || ''),
    type: entry.type || (entry.amount >= 0 ? 'earn' : 'spend'),
    amount: entry.amount,
    label: entry.label,
    sourceId: entry.sourceId || undefined,
  }));
  const snapshot = {
    source: 'erp',
    bridge: createRealmErpBridge({ user, tasks, modules }),
    profile: {
      name: user.name,
      role: profile?.realmClass || user.title || 'Realm Builder',
      color: PROFILE_COLOR.test(profile?.color || '') ? profile.color : '#3b8061',
      loadout,
    },
    operations: {
      quests: tasks.map((task) => mapErpTaskToRealmQuest(task, rewardedSourceIds, { user, modules })),
      ledger,
      wallet: ledger.reduce((sum, entry) => sum + entry.amount, 0),
      renown: entries.reduce((sum, entry) => sum + Math.max(0, entry.renown || 0), 0),
      completedQuests: entries.filter((entry) => entry.type === 'quest_reward').length,
      streakDays: profile?.streakDays || 0,
    },
  };
  return {
    ...snapshot,
    sync: createRealmSyncEnvelope(snapshot, { profileUpdatedAt: profile?.updatedAt }),
  };
}

export async function loadRealmErpSnapshot(db, user) {
  const modules = await loadRealmCompanyModules(db);
  const tasksEnabled = modOn('tasks', modules);
  const [dbUser, profile, tasks, entries] = await Promise.all([
    db.user.findUnique({ where: { id: user.id }, select: { id: true, name: true, title: true } }),
    db.realmProfile.findUnique({ where: { userId: user.id } }),
    tasksEnabled ? db.task.findMany({
      where: { assigneeId: user.id },
      include: {
        project: { select: { id: true, name: true } },
        assignee: { select: { id: true, name: true } },
        realmQuest: { include: { approvedBy: { select: { id: true, name: true } } } },
      },
      orderBy: [{ status: 'asc' }, { dueDate: 'asc' }],
      take: 50,
    }) : Promise.resolve([]),
    db.realmGoldEntry.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 100 }),
  ]);
  if (!dbUser) throw new RealmOperationError('Không tìm thấy hồ sơ nhân sự.', 404, 'user_not_found');
  const bridgeUser = {
    ...dbUser,
    role: user.role,
    roles: user.roles,
    teamId: user.teamId,
    userType: user.userType,
  };
  return serializeRealmErpSnapshot({ user: bridgeUser, profile, tasks, entries, modules });
}

export async function updateRealmErpProfile(db, user, input, { expectedProfileVersion } = {}) {
  const realmClass = String(input?.role || '').trim();
  const color = String(input?.color || '').trim().toLowerCase();
  const normalizedExpectedVersion = normalizeRealmProfileVersion(expectedProfileVersion);
  if (!REALM_CLASSES.has(realmClass)) throw new RealmOperationError('Class trong Realm không hợp lệ.', 400, 'invalid_realm_class');
  if (!PROFILE_COLOR.test(color)) throw new RealmOperationError('Màu huy hiệu không hợp lệ.', 400, 'invalid_profile_color');
  if (expectedProfileVersion !== undefined && normalizedExpectedVersion === undefined) {
    throw new RealmOperationError('Profile version không hợp lệ.', 400, 'invalid_profile_version');
  }
  try {
    return await db.$transaction(async (tx) => {
      if (expectedProfileVersion !== undefined) {
        const current = await tx.realmProfile.findUnique({ where: { userId: user.id }, select: { updatedAt: true } });
        const currentVersion = current?.updatedAt ? current.updatedAt.toISOString() : null;
        if (currentVersion !== normalizedExpectedVersion) {
          throw new RealmOperationError('Hồ sơ Realm đã thay đổi ở phiên khác. Hãy làm mới trước khi lưu lại.', 409, 'realm_profile_conflict');
        }
      }
      const profile = await tx.realmProfile.upsert({
        where: { userId: user.id },
        create: { userId: user.id, realmClass, color },
        update: { realmClass, color },
      });
      await tx.auditLog.create({
        data: { userId: user.id, userName: user.name, action: 'realm_profile', entity: 'users', refId: user.id, detail: `${realmClass} · ${color}` },
      });
      return profile;
    }, { isolationLevel: 'Serializable' });
  } catch (error) {
    if (expectedProfileVersion !== undefined && error?.code === 'P2034') {
      throw new RealmOperationError('Hồ sơ Realm vừa được cập nhật ở phiên khác. Hãy làm mới rồi thử lại.', 409, 'realm_profile_conflict');
    }
    throw error;
  }
}

function assertClaimableTask(task, userId) {
  if (!task) throw new RealmOperationError('Không tìm thấy Task.', 404, 'task_not_found');
  if (task.assigneeId !== userId) throw new RealmOperationError('Bạn chỉ được nhận reward từ Task của mình.', 403, 'not_task_assignee');
  if (task.status !== 'done') throw new RealmOperationError('Task phải hoàn thành trước khi nhận Gold.', 409, 'task_not_done');
  if (!task.realmQuest?.active || !task.realmQuest.approvedAt || task.realmQuest.gold <= 0) {
    throw new RealmOperationError('Reward chưa được quản lý phê duyệt.', 409, 'reward_not_approved');
  }
}

export async function claimRealmTaskReward(db, user, { taskId, idempotencyKey, modules = null }) {
  if (!modOn('tasks', modules)) {
    throw new RealmOperationError('Phân hệ Bảng công việc đang tắt trong Cài đặt công ty.', 403, 'realm_tasks_module_disabled');
  }
  const sourceId = String(taskId || '').trim();
  if (!sourceId || sourceId.length > 100) throw new RealmOperationError('Task ID không hợp lệ.', 400, 'invalid_task_id');
  const key = normalizeRealmIdempotencyKey(idempotencyKey);

  try {
    return await db.$transaction(async (tx) => {
      const byKey = await tx.realmGoldEntry.findUnique({ where: { idempotencyKey: key } });
      if (byKey) {
        if (byKey.userId !== user.id || byKey.sourceType !== 'task' || byKey.sourceId !== sourceId) {
          throw new RealmOperationError('Idempotency key đã được dùng cho thao tác khác.', 409, 'idempotency_conflict');
        }
        return { entry: byKey, idempotent: true };
      }

      const existing = await tx.realmGoldEntry.findFirst({
        where: { userId: user.id, type: 'quest_reward', sourceType: 'task', sourceId },
      });
      if (existing) return { entry: existing, idempotent: true };

      const task = await tx.task.findUnique({ where: { id: sourceId }, include: { realmQuest: true } });
      assertClaimableTask(task, user.id);
      const reward = task.realmQuest;
      const entry = await tx.realmGoldEntry.create({
        data: {
          userId: user.id,
          type: 'quest_reward',
          amount: reward.gold,
          renown: reward.renown,
          label: `Quest: ${task.title}`,
          sourceType: 'task',
          sourceId,
          idempotencyKey: key,
        },
      });
      await tx.taskEvent.create({
        data: { taskId: task.id, userId: user.id, userName: user.name, text: `Realm reward: +${reward.gold} Gold, +${reward.renown} Renown` },
      });
      await tx.auditLog.create({
        data: { userId: user.id, userName: user.name, action: 'realm_reward', entity: 'tasks', refId: task.id, detail: `+${reward.gold} Gold · +${reward.renown} Renown` },
      });
      return { entry, idempotent: false };
    }, { isolationLevel: 'Serializable' });
  } catch (error) {
    if (error?.code === 'P2002') {
      const existing = await db.realmGoldEntry.findFirst({
        where: { userId: user.id, type: 'quest_reward', sourceType: 'task', sourceId },
      });
      if (existing) return { entry: existing, idempotent: true };
    }
    throw error;
  }
}
