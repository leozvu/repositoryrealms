// v3.41 (Chương 1) — ÁP MẪU DỰ ÁN TRONG MỘT GIAO DỊCH.
//
// Trước đây việc này chạy ở trình duyệt: gọi lần lượt vài chục request tạo phase → task →
// mốc. Mất mạng giữa chừng để lại một dự án dở dang (có phase, thiếu việc) mà không ai
// biết, phải dọn tay. Nay server làm trọn gói: hoặc đủ, hoặc không có gì.
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentUser } from '@/lib/auth';
import { hasAny } from '@/lib/perm';
import { parseItems } from '@/lib/format';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const addDays = (isoDate, days) => {
  const base = new Date(`${isoDate}T00:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() + (Number(days) || 0));
  return base.toISOString().slice(0, 10);
};

export async function POST(request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized', code: 'unauthorized' }, { status: 401 });
  if (!hasAny(user, ['PM', 'LEAD'])) return NextResponse.json({ error: 'Chỉ PM hoặc Trưởng nhóm áp được mẫu dự án' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const projectId = String(body.projectId || '');
  const templateId = String(body.templateId || '');
  const [project, template] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId } }),
    prisma.projectTemplate.findUnique({ where: { id: templateId } }),
  ]);
  if (!project) return NextResponse.json({ error: 'Không tìm thấy dự án' }, { status: 404 });
  if (!template) return NextResponse.json({ error: 'Không tìm thấy mẫu dự án' }, { status: 404 });

  const start = project.startDate || new Date().toISOString().slice(0, 10);
  const phases = parseItems(template.phases);
  const milestones = parseItems(template.milestones);

  const created = await prisma.$transaction(async (tx) => {
    let phaseCount = 0;
    let taskCount = 0;
    for (const [index, phase] of phases.entries()) {
      const phaseRow = await tx.phase.create({
        data: { projectId: project.id, name: String(phase.name || `Giai đoạn ${index + 1}`).slice(0, 120), order: index },
      });
      phaseCount += 1;
      for (const task of (phase.tasks || [])) {
        await tx.task.create({
          data: {
            title: String(task.title || 'Công việc').slice(0, 180),
            projectId: project.id,
            phaseId: phaseRow.id,
            status: 'todo',
            estHours: Number(task.estHours) || 0,
            dueDate: task.offsetDays !== undefined ? addDays(start, task.offsetDays) : null,
            // v3.41: mang theo phân loại để việc sinh từ mẫu có đối chứng giờ lịch sử.
            // Trước đây thiếu workType nên nhóm việc từ mẫu không bao giờ có baseline.
            workType: task.workType || null,
            complexity: task.complexity || null,
          },
        });
        taskCount += 1;
      }
    }
    for (const milestone of milestones) {
      await tx.milestone.create({
        data: {
          projectId: project.id,
          name: String(milestone.name || 'Mốc').slice(0, 120),
          date: addDays(start, milestone.offsetDays),
        },
      });
    }
    // v3.41: ngân sách giờ của mẫu chảy vào dự án (trước đây bị bỏ quên)
    if (Number(template.budgetHours) > 0 && !project.budgetHours) {
      await tx.project.update({ where: { id: project.id }, data: { budgetHours: Number(template.budgetHours) } });
    }
    return { phaseCount, taskCount, milestoneCount: milestones.length };
  });

  await prisma.auditLog.create({ data: {
    userId: user.id, userName: user.name, action: 'apply_template', entity: 'projects', refId: project.id,
    detail: `Áp mẫu "${template.name}": ${created.phaseCount} giai đoạn, ${created.taskCount} việc, ${created.milestoneCount} mốc`,
  } }).catch(() => {});

  return NextResponse.json({ ok: true, ...created });
}
