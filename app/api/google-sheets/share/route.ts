import {
  upsertEquipmentSalesShare,
  type EquipmentSalesShareNote,
} from "@/app/google-sheets/team-share";
import { getSiteUser } from "@/app/site-user";

export async function POST(request: Request) {
  const user = await getSiteUser();
  if (!user?.email) return Response.json({ error: "ChatGPT 로그인이 필요합니다." }, { status: 401 });
  try {
    const body = await request.json() as { taskType?: string; note?: EquipmentSalesShareNote };
    if (body.taskType !== "equipment_sales" || !body.note || typeof body.note !== "object") {
      return Response.json({ error: "지원하지 않는 팀 공유 요청입니다." }, { status: 400 });
    }
    return Response.json(
      await upsertEquipmentSalesShare(user.email.trim().toLowerCase(), body.note),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /이미 .*공유하는 중/.test(message) ? 409 : 400;
    return Response.json({ error: message }, { status });
  }
}
