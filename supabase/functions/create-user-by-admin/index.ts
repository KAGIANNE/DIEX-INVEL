import "@supabase/functions-js/edge-runtime.d.ts"
import { withSupabase } from "@supabase/server"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

const usernamePattern = /^[A-Za-z0-9]{3,15}$/
const passwordPattern = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{6,10}$/
const authDomain = "auth.diex.local"
const allowedRoles = new Set(["admin", "supervisor", "sales", "cashier", "mobile_sales"])

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
  const message = error instanceof Error ? error.message : "No se pudo crear el usuario."
  const separator = message.indexOf(":")
  const status = separator > 0 && /^\d+$/.test(message.slice(0, separator)) ? Number(message.slice(0, separator)) : 400
  return { status, message: separator > 0 ? message.slice(separator + 1) : message }
}

export default {
  fetch: withSupabase({ auth: "user" }, async (req, ctx) => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })

    let invitationId: string | null = null
    let createdUserId: string | null = null
    try {
      const callerId = ctx.userClaims?.sub ?? ctx.userClaims?.id
      if (!callerId) fail("Sesión no válida.", 401)

      const body = await req.json()
      const username = String(body.username || "").trim().toLowerCase()
      const password = String(body.password || "")
      const fullName = String(body.fullName || username).trim().slice(0, 120)
      const phone = String(body.phone || "").trim().slice(0, 40) || null
      const role = String(body.role || "sales")
      const branchId = body.branchId ? String(body.branchId) : null
      const warehouseId = body.warehouseId ? String(body.warehouseId) : null

      if (!usernamePattern.test(username)) fail("El usuario debe tener entre 3 y 15 caracteres, solo letras y números.")
      if (!passwordPattern.test(password)) fail("La contraseña debe tener entre 6 y 10 caracteres e incluir letras y números.")
      if (!allowedRoles.has(role)) fail("El rol seleccionado no es válido.")

      const { data: adminMembership, error: membershipError } = await ctx.supabaseAdmin
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", callerId)
        .eq("role", "admin")
        .eq("active", true)
        .limit(1)
        .maybeSingle()
      if (membershipError) throw membershipError
      if (!adminMembership?.organization_id) fail("Solo un administrador activo puede crear usuarios.", 403)
      const organizationId = adminMembership.organization_id

      if (branchId) {
        const { data: branch, error } = await ctx.supabaseAdmin
          .from("branches")
          .select("id")
          .eq("id", branchId)
          .eq("organization_id", organizationId)
          .eq("active", true)
          .maybeSingle()
        if (error) throw error
        if (!branch) fail("El local seleccionado no existe o está inactivo.")
      }

      if (warehouseId) {
        const { data: warehouse, error } = await ctx.supabaseAdmin
          .from("warehouses")
          .select("id,branch_id")
          .eq("id", warehouseId)
          .eq("organization_id", organizationId)
          .eq("active", true)
          .maybeSingle()
        if (error) throw error
        if (!warehouse) fail("El almacén seleccionado no existe o está inactivo.")
        if (branchId && warehouse.branch_id !== branchId) fail("El almacén no pertenece al local seleccionado.")
      }

      const { data: existingProfile, error: profileError } = await ctx.supabaseAdmin
        .from("user_profiles")
        .select("id")
        .eq("username", username)
        .maybeSingle()
      if (profileError) throw profileError
      if (existingProfile) fail("Ese usuario ya existe.")

      const authEmail = `${username}@${authDomain}`
      const { data: existingInvitation, error: invitationCheckError } = await ctx.supabaseAdmin
        .from("user_invitations")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("username", username)
        .eq("active", true)
        .maybeSingle()
      if (invitationCheckError) throw invitationCheckError
      if (existingInvitation) fail("Ese usuario ya tiene una invitación activa.")

      const { data: invitation, error: invitationError } = await ctx.supabaseAdmin
        .from("user_invitations")
        .insert({
          organization_id: organizationId,
          username,
          email: authEmail,
          full_name: fullName,
          phone,
          role,
          branch_id: branchId,
          warehouse_id: warehouseId,
          active: true,
          invited_by: callerId,
        })
        .select("id")
        .single()
      if (invitationError) throw invitationError
      invitationId = invitation.id

      const { data: created, error: createError } = await ctx.supabaseAdmin.auth.admin.createUser({
        email: authEmail,
        password,
        email_confirm: true,
        user_metadata: { username, full_name: fullName },
      })
      if (createError) throw createError
      if (!created.user?.id) throw new Error("Supabase no devolvió el usuario creado.")
      createdUserId = created.user.id

      // The Auth trigger normally performs this link. The upsert keeps the
      // operation safe if a project was created before the trigger existed.
      const { error: linkError } = await ctx.supabaseAdmin
        .from("organization_members")
        .upsert({
          organization_id: organizationId,
          user_id: createdUserId,
          role,
          branch_id: branchId,
          warehouse_id: warehouseId,
          active: true,
        }, { onConflict: "organization_id,user_id" })
      if (linkError) throw linkError

      await ctx.supabaseAdmin
        .from("user_invitations")
        .update({ active: false, accepted_user_id: createdUserId, accepted_at: new Date().toISOString() })
        .eq("id", invitationId)

      return json({ ok: true, user: { id: createdUserId, username } })
    } catch (error) {
      if (invitationId) await ctx.supabaseAdmin.from("user_invitations").delete().eq("id", invitationId)
      if (createdUserId) await ctx.supabaseAdmin.auth.admin.deleteUser(createdUserId)
      const parsed = parseError(error)
      return json({ error: parsed.message }, parsed.status)
    }
  }),
}
