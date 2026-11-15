import { createClient } from 'npm:@supabase/supabase-js@^2.112.3'
import { corsHeaders as supabaseCorsHeaders } from 'npm:@supabase/supabase-js@^2.112.3/cors'

type Actor = {
  id: string
  role: string
  permissions: string[]
  status: string
}

type FunctionClients = {
  // The project schema is generated from applied migrations and is not yet
  // exported as a TypeScript Database type; runtime rows are validated below.
  admin: any
  publicKey: string
  url: string
}

const ALLOWED_ORIGIN = 'https://fkshopping.netlify.app'
const ACCOUNT_REDIRECT = 'https://fkshopping.netlify.app/multishop/account.html?invite=1'
const ALLOWED_PERMISSIONS = new Set(['catalog:write', 'content:write', 'admins:manage'])
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function responseHeaders(request: Request): Headers {
  const headers = new Headers(supabaseCorsHeaders)
  headers.set('Content-Type', 'application/json; charset=utf-8')
  headers.set('Vary', 'Origin')
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  if (request.headers.get('origin') === ALLOWED_ORIGIN) {
    headers.set('Access-Control-Allow-Origin', ALLOWED_ORIGIN)
  } else {
    headers.delete('Access-Control-Allow-Origin')
  }
  return headers
}

function jsonResponse(request: Request, status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: responseHeaders(request) })
}

function parseKeyDictionary(raw: string | undefined): Record<string, string> {
  if (!raw) return {}
  try {
    const value = JSON.parse(raw)
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, string> : {}
  } catch {
    return {}
  }
}

function getClients(): FunctionClients | null {
  const url = Deno.env.get('SUPABASE_URL')?.trim() || ''
  const publicKeys = parseKeyDictionary(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS'))
  const secretKeys = parseKeyDictionary(Deno.env.get('SUPABASE_SECRET_KEYS'))
  const publicKey = publicKeys.default || Deno.env.get('SUPABASE_ANON_KEY') || ''
  const secretKey = secretKeys.default || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  if (!url || !publicKey || !secretKey) return null

  const admin = createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
  return { admin, publicKey, url }
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  const length = Number(request.headers.get('content-length') || 0)
  if (length > 16_384) throw new Error('Request body is too large.')
  const text = await request.text()
  if (text.length > 16_384) throw new Error('Request body is too large.')
  const parsed = text ? JSON.parse(text) : {}
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('A JSON object is required.')
  return parsed as Record<string, unknown>
}

function rpcErrorMessage(error: { message?: string; code?: string }): string {
  const message = error.message || ''
  if (message.includes('already has administrator access')) return 'This account already has administrator access.'
  if (message.includes('membership was not found')) return 'The administrator account was not found.'
  if (message.includes('Super Admin account cannot be changed')) return 'The Super Admin account cannot be changed through this operation.'
  if (message.includes('cannot change their own access')) return 'You cannot change or remove your own administrator access.'
  if (message.includes('permission is required')) return 'Administrator-management permission is required.'
  if (message.includes('email does not match')) return 'The account email could not be verified.'
  if (message.includes('permissions')) return 'The requested administrator permissions are invalid.'
  if (error.code === '42501') return 'This administrator operation is not permitted.'
  return 'The administrator change could not be saved. Check the account and permissions, then try again.'
}

function validEmail(value: unknown): string | null {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (email.length < 3 || email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null
  return email
}

async function authenticate(request: Request, clients: FunctionClients): Promise<{ actor: Actor | null; error: Response | null }> {
  const authorization = request.headers.get('authorization') || ''
  const match = authorization.match(/^Bearer\s+(.+)$/i)
  if (!match) return { actor: null, error: jsonResponse(request, 401, { error: 'Sign in is required.' }) }

  const userClient = createClient(clients.url, clients.publicKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
  const { data: userData, error: userError } = await userClient.auth.getUser(match[1])
  const user = userData?.user
  if (userError || !user) return { actor: null, error: jsonResponse(request, 401, { error: 'Your session is invalid or expired. Sign in again.' }) }
  if (!user.email_confirmed_at) return { actor: null, error: jsonResponse(request, 403, { error: 'Confirm your email before using administrator tools.' }) }

  const { data: member, error: memberError } = await clients.admin
    .from('admin_memberships')
    .select('role,permissions,status')
    .eq('user_id', user.id)
    .maybeSingle()
  if (memberError) return { actor: null, error: jsonResponse(request, 503, { error: 'Administrator access could not be checked.' }) }
  if (!member || member.status !== 'active' || !['super_admin', 'admin'].includes(member.role)) {
    return { actor: null, error: jsonResponse(request, 403, { error: 'Administrator access is required.' }) }
  }

  const actor: Actor = {
    id: user.id,
    role: member.role,
    permissions: Array.isArray(member.permissions) ? member.permissions : [],
    status: member.status
  }
  if (actor.role !== 'super_admin' && !actor.permissions.includes('admins:manage')) {
    return { actor: null, error: jsonResponse(request, 403, { error: 'Administrator-management permission is required.' }) }
  }
  return { actor, error: null }
}

async function handleRequest(request: Request): Promise<Response> {
  const origin = request.headers.get('origin')
  if (request.method === 'OPTIONS') {
    if (origin && origin !== ALLOWED_ORIGIN) return new Response(null, { status: 403 })
    return new Response(null, { status: 204, headers: responseHeaders(request) })
  }
  if (origin && origin !== ALLOWED_ORIGIN) return jsonResponse(request, 403, { error: 'This origin is not allowed.' })
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(request.method)) {
    return jsonResponse(request, 405, { error: 'Method not allowed.' })
  }

  const clients = getClients()
  if (!clients) return jsonResponse(request, 503, { error: 'The administrator service is not configured.' })
  const { actor, error: authError } = await authenticate(request, clients)
  if (authError || !actor) return authError || jsonResponse(request, 401, { error: 'Sign in is required.' })

  if (request.method === 'GET') {
    const { data, error } = await clients.admin.rpc('list_admin_memberships_for_management')
    if (error) return jsonResponse(request, 503, { error: 'Administrator records could not be loaded.' })
    return jsonResponse(request, 200, { admins: data || [] })
  }

  let body: Record<string, unknown>
  try {
    body = await readJson(request)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid request body.'
    return jsonResponse(request, 400, { error: message })
  }

  if (request.method === 'POST') {
    if (body.action !== 'invite') return jsonResponse(request, 400, { error: 'Unsupported administrator action.' })
    const email = validEmail(body.email)
    if (!email) return jsonResponse(request, 400, { error: 'Enter a valid email address.' })
    if (!Array.isArray(body.permissions)) return jsonResponse(request, 400, { error: 'Select at least one administrator permission.' })
    const permissions = [...new Set(body.permissions.filter((item): item is string => typeof item === 'string'))]
    if (!permissions.length || permissions.some((permission) => !ALLOWED_PERMISSIONS.has(permission))) {
      return jsonResponse(request, 400, { error: 'The requested administrator permissions are invalid.' })
    }
    if (permissions.includes('admins:manage') && actor.role !== 'super_admin') {
      return jsonResponse(request, 403, { error: 'Only the Super Admin can grant administrator-management permission.' })
    }

    const { data: matchingUsers, error: lookupError } = await clients.admin.rpc('lookup_auth_user_for_admin_invite', { p_email: email })
    if (lookupError) return jsonResponse(request, 503, { error: 'The account could not be checked. Try again later.' })
    const existing = Array.isArray(matchingUsers) ? matchingUsers[0] : null
    let targetUserId = existing?.user_id as string | undefined
    let emailConfirmed = Boolean(existing?.email_confirmed)
    let invited = false

    if (!targetUserId) {
      const { data: invitation, error: inviteError } = await clients.admin.auth.admin.inviteUserByEmail(email, {
        redirectTo: ACCOUNT_REDIRECT
      })
      if (inviteError || !invitation?.user?.id) {
        return jsonResponse(request, 502, { error: 'The invitation could not be emailed. Configure a production SMTP sender or ask the person to create and confirm an account first.' })
      }
      targetUserId = invitation.user.id
      invited = true
    }

    if (targetUserId === actor.id) return jsonResponse(request, 400, { error: 'You cannot invite yourself.' })
    const { error: membershipError } = await clients.admin.rpc('manage_admin_membership', {
      p_actor_user_id: actor.id,
      p_target_user_id: targetUserId,
      p_email: email,
      p_permissions: permissions,
      p_status: 'active',
      p_action: 'invite'
    })
    if (membershipError) return jsonResponse(request, 409, { error: rpcErrorMessage(membershipError) })
    return jsonResponse(request, 201, { invited, emailConfirmed, userId: targetUserId })
  }

  const userId = typeof body.userId === 'string' && UUID_PATTERN.test(body.userId) ? body.userId : ''
  if (!userId) return jsonResponse(request, 400, { error: 'A valid administrator account is required.' })

  if (request.method === 'PATCH') {
    if (body.action !== 'update' || !['active', 'suspended'].includes(String(body.status))) {
      return jsonResponse(request, 400, { error: 'Select a supported administrator status.' })
    }
    const { data: existing, error: existingError } = await clients.admin
      .from('admin_memberships')
      .select('email,permissions,role')
      .eq('user_id', userId)
      .maybeSingle()
    if (existingError) return jsonResponse(request, 503, { error: 'Administrator records could not be checked.' })
    if (!existing) return jsonResponse(request, 404, { error: 'The administrator account was not found.' })
    if (existing.role === 'super_admin') return jsonResponse(request, 403, { error: 'The Super Admin account cannot be changed through this operation.' })
    const { error: updateError } = await clients.admin.rpc('manage_admin_membership', {
      p_actor_user_id: actor.id,
      p_target_user_id: userId,
      p_email: existing.email,
      p_permissions: existing.permissions,
      p_status: body.status,
      p_action: 'update'
    })
    if (updateError) return jsonResponse(request, 409, { error: rpcErrorMessage(updateError) })
    return jsonResponse(request, 200, { updated: true })
  }

  if (request.method === 'DELETE') {
    const { error: removeError } = await clients.admin.rpc('manage_admin_membership', {
      p_actor_user_id: actor.id,
      p_target_user_id: userId,
      p_email: null,
      p_permissions: null,
      p_status: null,
      p_action: 'remove'
    })
    if (removeError) return jsonResponse(request, 409, { error: rpcErrorMessage(removeError) })
    return jsonResponse(request, 200, { removed: true })
  }

  return jsonResponse(request, 405, { error: 'Method not allowed.' })
}

Deno.serve(async (request: Request) => {
  try {
    return await handleRequest(request)
  } catch {
    return jsonResponse(request, 500, { error: 'The administrator service could not complete this request.' })
  }
})
