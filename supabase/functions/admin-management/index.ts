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

function jsonResponse(request: Request, status: number, body: Record<string, unknown>, extraHeaders: Record<string, string> = {}): Response {
  const headers = responseHeaders(request)
  for (const [name, value] of Object.entries(extraHeaders)) headers.set(name, value)
  return new Response(JSON.stringify(body), { status, headers })
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

async function enforceAdminRequestLimit(request: Request, clients: FunctionClients, actor: Actor, isMutation: boolean): Promise<Response | null> {
  const { data, error } = await clients.admin.rpc('consume_admin_management_rate_limit', {
    p_actor_user_id: actor.id,
    p_bucket: isMutation ? 'mutation' : 'read',
    p_limit: isMutation ? 10 : 60,
    p_window_seconds: 60
  })
  if (error) return jsonResponse(request, 503, { error: 'Administrator request limits could not be checked. Please try again shortly.' })
  const result = Array.isArray(data) ? data[0] : null
  if (!result || typeof result.allowed !== 'boolean') {
    return jsonResponse(request, 503, { error: 'Administrator request limits could not be checked. Please try again shortly.' })
  }
  if (result.allowed) return null
  const retryAfter = Math.max(1, Math.min(60, Number(result.retry_after_seconds) || 1))
  return jsonResponse(request, 429, { error: 'Too many administrator requests. Please wait before trying again.' }, {
    'Retry-After': String(retryAfter),
    'Cache-Control': 'no-store'
  })
}

function isSafeProductMediaPath(productId: string, bucketId: unknown, objectPath: unknown): objectPath is string {
  if (bucketId !== 'kcbf-product-media' || typeof objectPath !== 'string' || objectPath.length > 1024) return false
  if (!objectPath.startsWith(productId + '/') || objectPath.includes('\\') || /%2f|%5c/i.test(objectPath)) return false
  return objectPath.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..')
}

async function processProductMediaCleanup(admin: any, productId: string): Promise<{ pendingCount: number | null }> {
  const { data: queueRows, error: queueError } = await admin
    .from('product_media_cleanup_queue')
    .select('id,bucket_id,object_path,attempt_count')
    .eq('deleted_product_id', productId)
    .limit(500)
  if (queueError) return { pendingCount: null }

  const validRows: Array<{ id: string; bucket_id: string; object_path: string; attempt_count: number }> = []
  for (const row of queueRows || []) {
    if (isSafeProductMediaPath(productId, row.bucket_id, row.object_path)) {
      validRows.push(row)
    } else {
      await admin.from('product_media_cleanup_queue')
        .update({ attempt_count: Number(row.attempt_count || 0) + 1, last_error: 'Stored object path failed safety validation.' })
        .eq('id', row.id)
    }
  }

  for (let start = 0; start < validRows.length; start += 100) {
    const batch = validRows.slice(start, start + 100)
    const paths = batch.map((row) => row.object_path)
    const { error: storageError } = await admin.storage.from('kcbf-product-media').remove(paths)
    if (storageError) {
      for (const row of batch) {
        await admin.from('product_media_cleanup_queue')
          .update({ attempt_count: Number(row.attempt_count || 0) + 1, last_error: 'Storage removal failed; retry is available.' })
          .eq('id', row.id)
      }
      continue
    }

    const { error: queueDeleteError } = await admin.from('product_media_cleanup_queue')
      .delete()
      .in('id', batch.map((row) => row.id))
    if (queueDeleteError) {
      for (const row of batch) {
        await admin.from('product_media_cleanup_queue')
          .update({ attempt_count: Number(row.attempt_count || 0) + 1, last_error: 'Storage was removed but the cleanup record remains pending.' })
          .eq('id', row.id)
      }
    }
  }

  const { count, error: countError } = await admin
    .from('product_media_cleanup_queue')
    .select('id', { count: 'exact', head: true })
    .eq('deleted_product_id', productId)
  return { pendingCount: countError ? null : Number(count || 0) }
}

async function countPendingProductMediaCleanup(admin: any): Promise<number | null> {
  const { count, error } = await admin
    .from('product_media_cleanup_queue')
    .select('id', { count: 'exact', head: true })
  return error ? null : Number(count || 0)
}

async function processAllProductMediaCleanup(admin: any): Promise<number | null> {
  const { data, error } = await admin
    .from('product_media_cleanup_queue')
    .select('deleted_product_id')
    .order('created_at', { ascending: true })
    .limit(500)
  if (error) return null
  const productIds: string[] = []
  for (const row of (data || []) as Array<{ deleted_product_id?: unknown }>) {
    const productId = row.deleted_product_id
    if (typeof productId === 'string' && UUID_PATTERN.test(productId) && !productIds.includes(productId)) {
      productIds.push(productId)
    }
  }
  for (const productId of productIds) {
    await processProductMediaCleanup(admin, productId)
  }
  return await countPendingProductMediaCleanup(admin)
}

async function authenticate(request: Request, clients: FunctionClients, requiredPermission = 'admins:manage'): Promise<{ actor: Actor | null; error: Response | null }> {
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
  if (actor.role !== 'super_admin' && !actor.permissions.includes(requiredPermission)) {
    const errorMessage = requiredPermission === 'catalog:write'
      ? 'Product catalog permission is required.'
      : 'Administrator-management permission is required.'
    return { actor: null, error: jsonResponse(request, 403, { error: errorMessage }) }
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

  let body: Record<string, unknown> = {}
  if (request.method !== 'GET') {
    try {
      body = await readJson(request)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid request body.'
      return jsonResponse(request, 400, { error: message })
    }
  }

  const isCatalogMutation = (request.method === 'DELETE' && body.action === 'delete-product')
    || (request.method === 'POST' && ['retry-product-media-cleanup', 'product-media-cleanup-status'].includes(String(body.action || '')))
  const requiredPermission = isCatalogMutation ? 'catalog:write' : 'admins:manage'
  const { actor, error: authError } = await authenticate(request, clients, requiredPermission)
  if (authError || !actor) return authError || jsonResponse(request, 401, { error: 'Sign in is required.' })

  const isMutationRequest = request.method === 'PATCH' || request.method === 'DELETE'
    || (request.method === 'POST' && ['invite', 'retry-product-media-cleanup'].includes(String(body.action || '')))
  const rateLimitResponse = await enforceAdminRequestLimit(request, clients, actor, isMutationRequest)
  if (rateLimitResponse) return rateLimitResponse

  if (request.method === 'GET') {
    const { data, error } = await clients.admin.rpc('list_admin_memberships_for_management')
    if (error) return jsonResponse(request, 503, { error: 'Administrator records could not be loaded.' })
    return jsonResponse(request, 200, { admins: data || [] })
  }

  if (request.method === 'POST' && body.action === 'product-media-cleanup-status') {
    const pendingCount = await countPendingProductMediaCleanup(clients.admin)
    if (pendingCount === null) return jsonResponse(request, 503, { error: 'Product media cleanup status could not be checked.' })
    return jsonResponse(request, 200, { pendingCount: pendingCount })
  }

  if (request.method === 'POST' && body.action === 'retry-product-media-cleanup') {
    let pendingCount: number | null
    if (body.productId === undefined || body.productId === '') {
      pendingCount = await processAllProductMediaCleanup(clients.admin)
    } else if (typeof body.productId === 'string' && UUID_PATTERN.test(body.productId)) {
      const cleanup = await processProductMediaCleanup(clients.admin, body.productId)
      pendingCount = cleanup.pendingCount
    } else {
      return jsonResponse(request, 400, { error: 'A valid product reference is required to retry media cleanup.' })
    }
    if (pendingCount === null) return jsonResponse(request, 503, { error: 'Product media cleanup could not be checked. Retry again shortly.' })
    return jsonResponse(request, 200, { productDeleted: false, pendingCount: pendingCount })
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

  if (request.method === 'DELETE' && body.action === 'delete-product') {
    const productId = typeof body.productId === 'string' && UUID_PATTERN.test(body.productId) ? body.productId : ''
    if (!productId) return jsonResponse(request, 400, { error: 'A valid product reference is required.' })
    const { data: productDeleted, error: deleteError } = await clients.admin.rpc('delete_catalog_product', {
      p_product_id: productId,
      p_actor_user_id: actor.id
    })
    if (deleteError) {
      if (deleteError.code === '42501') return jsonResponse(request, 403, { error: 'Active product catalog permission is required to delete products.' })
      return jsonResponse(request, 503, { error: 'The product was not deleted. The catalog deletion service may need setup or the record may have linked data that must be reviewed.' })
    }
    const cleanup = await processProductMediaCleanup(clients.admin, productId)
    return jsonResponse(request, 200, {
      productDeleted: Boolean(productDeleted),
      pendingCount: cleanup.pendingCount
    })
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
