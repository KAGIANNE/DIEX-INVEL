import "@supabase/functions-js/edge-runtime.d.ts"
import { withSupabase } from "@supabase/server"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

function fail(message: string, status = 400): never {
  throw new Error(`${status}:${message}`)
}

function parseError(error: unknown) {
  const message = error instanceof Error ? error.message : "No se pudo eliminar el usuario."
  const separator = message.indexOf(":")
  const status = separator > 0 && /^\d+$/.test(message.slice(0, separator)) ? Number(message.slice(0, separator)) : 400
  return { status, message: separator > 0 ? message.slice(separator + 1) : message }
}

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

    try {
      const callerId = ctx.userClaims?.sub ?? ctx.userClaims?.id
      if (!callerId) fail("Sesión no válida.", 401)
      const body = await req.json()
      const userId = String(body.userId || "")
      if (!/^[0-9a-f-]{36}$/i.test(userId)) fail("Usuario no válido.")
      if (userId === callerId) fail("No puedes eliminar permanentemente tu propio usuario.")

      const { data: callerMembership, error: callerError } = await ctx.supabaseAdmin
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", callerId)
        .eq("role", "admin")
        .eq("active", true)
        .limit(1)
        .maybeSingle()
      if (callerError) throw callerError
      if (!callerMembership?.organization_id) fail("Solo un administrador activo puede eliminar usuarios.", 403)

      const { data: targetMembership, error: targetError } = await ctx.supabaseAdmin
        .from("organization_members")
        .select("organization_id,role")
        .eq("organization_id", callerMembership.organization_id)
        .eq("user_id", userId)
        .maybeSingle()
      if (targetError) throw targetError
      if (!targetMembership) fail("El usuario no pertenece a esta organización.")

      if (targetMembership.role === "admin") {
        const { count, error: countError } = await ctx.supabaseAdmin
          .from("organization_members")
          .select("user_id", { count: "exact", head: true })
          .eq("organization_id", callerMembership.organization_id)
          .eq("role", "admin")
          .eq("active", true)
        if (countError) throw countError
        if ((count || 0) <= 1) fail("No puedes eliminar al último administrador activo.")
      }

      const { error: deleteError } = await ctx.supabaseAdmin.auth.admin.deleteUser(userId)
      if (deleteError) throw deleteError
      return json({ ok: true, userId })
    } catch (error) {
      const parsed = parseError(error)
      return json({ error: parsed.message }, parsed.status)
    }
  }),
}
