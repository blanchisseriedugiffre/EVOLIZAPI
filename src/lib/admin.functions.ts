import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const USERNAME_EMAIL_DOMAIN = "atelier.local";

export const createClientAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      username: z.string().trim().min(2).max(60).regex(/^[a-zA-Z0-9._-]+$/, "Caractères autorisés : lettres, chiffres, . _ -"),
      password: z.string().min(8).max(72),
      name: z.string().min(1).max(120),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: roleRow } = await supabaseAdmin
      .from("user_roles").select("role").eq("user_id", context.userId).eq("role", "admin").maybeSingle();
    if (!roleRow) throw new Response("Forbidden", { status: 403 });

    const username = data.username.toLowerCase();
    const email = `${username}@${USERNAME_EMAIL_DOMAIN}`;

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      user_metadata: { name: data.name, username },
    });
    if (error) throw new Response(error.message, { status: 400 });
    await supabaseAdmin.from("profiles").update({ name: data.name }).eq("id", created.user.id);
    return { id: created.user.id, username };
  });

export const deleteClientAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: roleRow } = await supabaseAdmin
      .from("user_roles").select("role").eq("user_id", context.userId).eq("role", "admin").maybeSingle();
    if (!roleRow) throw new Response("Forbidden", { status: 403 });
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Response(error.message, { status: 400 });
    return { ok: true };
  });
