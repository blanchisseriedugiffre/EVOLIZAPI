import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { format } from "date-fns";

const EVOLIZ_LOGIN_URL = "https://www.evoliz.io/api/login";
const EVOLIZ_API_URL = "https://www.evoliz.io/api/v1/companies";

async function getEvolizToken(): Promise<string> {
  const companyId = process.env.EVOLIZ_COMPANY_ID;
  const publicKey = process.env.EVOLIZ_PUBLIC_KEY;
  const secretKey = process.env.EVOLIZ_SECRET_KEY;

  if (!companyId || !publicKey || !secretKey) {
    throw new Error("Variables Evoliz manquantes (EVOLIZ_COMPANY_ID, EVOLIZ_PUBLIC_KEY, EVOLIZ_SECRET_KEY)");
  }

  const response = await fetch(EVOLIZ_LOGIN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({ company_id: companyId, public_key: publicKey, secret_key: secretKey }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Erreur login Evoliz: ${response.status} ${text}`);
  }

  const data = await response.json() as { access_token?: string; token?: string };
  const token = data.access_token ?? data.token;
  if (!token) throw new Error("Token Evoliz introuvable dans la réponse");
  return token;
}

async function fetchPage(token: string, companyId: string, page: number): Promise<{ items: any[]; lastPage: number }> {
  const url = `${EVOLIZ_API_URL}/${companyId}/deliveries?per_page=100&page=${page}`;
  const response = await fetch(url, {
    headers: { "Authorization": `Bearer ${token}`, "Accept": "application/json" },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Erreur récupération BL: ${response.status} ${text}`);
  }
  const data = await response.json() as { data?: any[]; last_page?: number; meta?: { last_page?: number } };
  const lastPage = data.last_page ?? data.meta?.last_page ?? 1;
  return { items: data.data ?? [], lastPage };
}

export const syncEvolizDeliveries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: roleRow } = await supabaseAdmin
      .from("user_roles").select("role").eq("user_id", context.userId).eq("role", "admin").maybeSingle();
    if (!roleRow) throw new Error("Forbidden");

    const companyId = process.env.EVOLIZ_COMPANY_ID!;
    const today = format(new Date(), "yyyy-MM-dd");
    const token = await getEvolizToken();

    // Fetch page 1 to know the last page number, then work backwards
    const { items: firstItems, lastPage } = await fetchPage(token, companyId, 1);

    let todayItems: any[] = [];

    if (lastPage === 1) {
      todayItems = firstItems;
    } else {
      // Most recent BL are on the last pages — fetch backwards until dates go before today
      for (let page = lastPage; page >= 1; page--) {
        const { items } = await fetchPage(token, companyId, page);
        const matching = items.filter((d: any) => (d.documentdate ?? "").substring(0, 10) === today);
        todayItems.push(...matching);
        // If the earliest item on this page is already before today, stop
        const earliest = items.map((d: any) => (d.documentdate ?? "").substring(0, 10)).filter(Boolean).sort()[0];
        if (earliest && earliest < today) break;
        if (page === lastPage && items.length === 0) break;
      }
    }

    const result = todayItems.map((d: any) => ({
      bl_number: d.document_number ?? d.documentnumber ?? d.id,
      client_name: d.client?.name ?? d.clientname ?? "—",
      client_code: d.client?.code ?? d.clientcode ?? null,
      date: (d.documentdate ?? today).substring(0, 10),
    }));

    return { deliveries: result, count: result.length, date: today };
  });
