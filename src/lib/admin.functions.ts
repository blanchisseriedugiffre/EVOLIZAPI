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
      password: z.string().min(4).max(72),
      name: z.string().min(1).max(120),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: roleRow } = await supabaseAdmin
      .from("user_roles").select("role").eq("user_id", context.userId).eq("role", "admin").maybeSingle();
    if (!roleRow) throw new Error("Forbidden");

    const username = data.username.toLowerCase();
    const email = `${username}@${USERNAME_EMAIL_DOMAIN}`;

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      user_metadata: { name: data.name, username },
    });
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("profiles").update({ name: data.name }).eq("id", created.user.id);
    return { id: created.user.id, username };
  });

export const updateClientCredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      userId: z.string().uuid(),
      username: z.string().trim().min(2).max(60).regex(/^[a-zA-Z0-9._-]+$/, "Caractères autorisés : lettres, chiffres, . _ -").optional(),
      password: z.string().min(4).max(72).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: roleRow } = await supabaseAdmin
      .from("user_roles").select("role").eq("user_id", context.userId).eq("role", "admin").maybeSingle();
    if (!roleRow) throw new Error("Forbidden");

    const updates: { email?: string; password?: string; user_metadata?: Record<string, unknown> } = {};
    let newUsername: string | undefined;
    if (data.username) {
      newUsername = data.username.toLowerCase();
      updates.email = `${newUsername}@${USERNAME_EMAIL_DOMAIN}`;
      updates.user_metadata = { username: newUsername };
    }
    if (data.password) updates.password = data.password;
    if (!updates.email && !updates.password) return { ok: true };

    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, updates);
    if (error) throw new Error(error.message);
    if (updates.email) {
      await supabaseAdmin.from("profiles").update({ email: updates.email }).eq("id", data.userId);
    }
    return { ok: true, username: newUsername };
  });

export const updateOwnAdminCredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      identifier: z.string().trim().min(2).max(120).optional(),
      password: z.string().min(6).max(72).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: roleRow } = await supabaseAdmin
      .from("user_roles").select("role").eq("user_id", context.userId).eq("role", "admin").maybeSingle();
    if (!roleRow) throw new Error("Forbidden");

    const updates: { email?: string; password?: string; email_confirm?: boolean; user_metadata?: Record<string, unknown> } = {};
    if (data.identifier) {
      const id = data.identifier.trim();
      const email = id.includes("@") ? id.toLowerCase() : `${id.toLowerCase()}@${USERNAME_EMAIL_DOMAIN}`;
      updates.email = email;
      updates.email_confirm = true;
      updates.user_metadata = { username: id.includes("@") ? id.split("@")[0] : id.toLowerCase() };
    }
    if (data.password) updates.password = data.password;
    if (!updates.email && !updates.password) return { ok: true };

    const { error } = await supabaseAdmin.auth.admin.updateUserById(context.userId, updates);
    if (error) throw new Error(error.message);
    if (updates.email) {
      await supabaseAdmin.from("profiles").update({ email: updates.email }).eq("id", context.userId);
    }
    return { ok: true, email: updates.email };
  });

export const deleteClientAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: roleRow } = await supabaseAdmin
      .from("user_roles").select("role").eq("user_id", context.userId).eq("role", "admin").maybeSingle();
    if (!roleRow) throw new Error("Forbidden");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const DRIVER_USERNAME_DEFAULT = "chauffeur";

export const getDriverInfo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: roleRow } = await supabaseAdmin
      .from("user_roles").select("role").eq("user_id", context.userId).eq("role", "admin").maybeSingle();
    if (!roleRow) throw new Error("Forbidden");

    const { data: drivers } = await supabaseAdmin
      .from("user_roles").select("user_id").eq("role", "driver").limit(1);
    if (!drivers?.length) return { exists: false as const };
    const driverId = drivers[0].user_id;
    const { data: prof } = await supabaseAdmin
      .from("profiles").select("email").eq("id", driverId).maybeSingle();
    const email = prof?.email ?? "";
    const username = email.endsWith(`@${USERNAME_EMAIL_DOMAIN}`)
      ? email.slice(0, -(`@${USERNAME_EMAIL_DOMAIN}`.length))
      : email;
    return { exists: true as const, userId: driverId, username };
  });

export const upsertDriverAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      username: z.string().trim().min(2).max(60).regex(/^[a-zA-Z0-9._-]+$/, "Caractères autorisés : lettres, chiffres, . _ -"),
      password: z.string().min(4).max(72).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: roleRow } = await supabaseAdmin
      .from("user_roles").select("role").eq("user_id", context.userId).eq("role", "admin").maybeSingle();
    if (!roleRow) throw new Error("Forbidden");

    const username = data.username.toLowerCase();
    const email = `${username}@${USERNAME_EMAIL_DOMAIN}`;

    // Find existing driver
    const { data: drivers } = await supabaseAdmin
      .from("user_roles").select("user_id").eq("role", "driver").limit(1);

    if (drivers?.length) {
      const driverId = drivers[0].user_id;
      const updates: { email?: string; password?: string; user_metadata?: Record<string, unknown> } = {
        email,
        user_metadata: { username, name: "Chauffeur" },
      };
      if (data.password) updates.password = data.password;
      const { error } = await supabaseAdmin.auth.admin.updateUserById(driverId, updates);
      if (error) throw new Error(error.message);
      await supabaseAdmin.from("profiles").update({ email, name: "Chauffeur" }).eq("id", driverId);
      return { ok: true, userId: driverId, username };
    }

    if (!data.password) throw new Error("Mot de passe requis pour la création");

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      user_metadata: { name: "Chauffeur", username },
    });
    if (error) throw new Error(error.message);
    const driverId = created.user.id;
    await supabaseAdmin.from("profiles").update({ name: "Chauffeur" }).eq("id", driverId);
    // Replace default 'client' role with 'driver'
    await supabaseAdmin.from("user_roles").delete().eq("user_id", driverId);
    await supabaseAdmin.from("user_roles").insert({ user_id: driverId, role: "driver" });
    return { ok: true, userId: driverId, username };
  });
