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

export const syncEvolizDeliveries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: roleRow } = await supabaseAdmin
      .from("user_roles").select("role").eq("user_id", context.userId).eq("role", "admin").maybeSingle();
    if (!roleRow) throw new Error("Forbidden");

    const companyId = process.env.EVOLIZ_COMPANY_ID;
    const today = format(new Date(), "yyyy-MM-dd");

    const token = await getEvolizToken();

    const url = `${EVOLIZ_API_URL}/${companyId}/deliveries?per_page=100`;
    const response = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Erreur récupération BL: ${response.status} ${text}`);
    }

    const data = await response.json() as { data?: any[] };
    const deliveries = data.data ?? [];

    const result = deliveries.map((d: any) => ({
      bl_number: d.document_number ?? d.documentnumber ?? d.id,
      client_name: d.client?.name ?? d.clientname ?? "—",
      client_code: d.client?.code ?? d.clientcode ?? null,
      date: d.documentdate ?? today,
    }));

    return { deliveries: result, count: result.length, date: today };
  });

