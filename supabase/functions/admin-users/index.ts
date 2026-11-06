import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
})

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed.' })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const siteUrl = Deno.env.get('SITE_URL')?.replace(/\/$/, '')
  if (!supabaseUrl || !anonKey || !serviceKey || !siteUrl) return json(500, { error: 'Admin user service is not configured.' })

  const authorization = request.headers.get('Authorization') ?? ''
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  if (!token) return json(401, { error: 'Sign in with an administrator account.' })

  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const serviceClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data: callerData, error: callerError } = await callerClient.auth.getUser(token)
  if (callerError || !callerData.user) return json(401, { error: 'Your sign-in has expired. Please sign in again.' })

  const { data: callerProfile, error: callerProfileError } = await serviceClient
    .from('profiles').select('role').eq('id', callerData.user.id).maybeSingle()
  if (callerProfileError || callerProfile?.role !== 'admin') return json(403, { error: 'Administrator access is required.' })

  let body: Record<string, unknown>
  try { body = await request.json() } catch { return json(400, { error: 'Invalid request body.' }) }
  const action = body.action

  if (action === 'list') {
    const [{ data: profiles, error: profilesError }, { data: users, error: usersError }] = await Promise.all([
      serviceClient.from('profiles').select('id, first_name, last_name, username, role, created_at').order('created_at', { ascending: false }),
      serviceClient.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ])
    if (profilesError || usersError) return json(500, { error: profilesError?.message ?? usersError?.message ?? 'Could not load accounts.' })
    const emailById = new Map((users?.users ?? []).map((user) => [user.id, user.email ?? '']))
    return json(200, { users: (profiles ?? []).map((profile) => ({ ...profile, email: emailById.get(profile.id) ?? '' })) })
  }

  if (action === 'invite') {
    const email = String(body.email ?? '').trim().toLowerCase()
    const firstName = String(body.firstName ?? '').trim()
    const lastName = String(body.lastName ?? '').trim()
    const username = String(body.username ?? '').trim().toLowerCase() || null
    const role = body.role
    if (!/^\S+@\S+\.\S+$/.test(email) || !firstName || !lastName || !['buyer', 'admin'].includes(String(role))) {
      return json(400, { error: 'Enter a valid email, first and last name, and account role.' })
    }
    if (username && !/^[a-z0-9_]{3,20}$/.test(username)) return json(400, { error: 'Username must be 3–20 letters, numbers, or underscores.' })

    const { data, error } = await serviceClient.auth.admin.inviteUserByEmail(email, {
      data: { first_name: firstName, last_name: lastName, username },
      redirectTo: `${siteUrl}/reset-password`,
    })
    if (error || !data.user) return json(400, { error: error?.message ?? 'Could not invite this account.' })

    const { error: profileError } = await serviceClient.from('profiles').update({
      first_name: firstName,
      last_name: lastName,
      username,
      role,
    }).eq('id', data.user.id)
    if (profileError) return json(500, { error: `Invitation sent, but the account role could not be set: ${profileError.message}` })
    return json(200, { message: `Invitation sent to ${email}.`, userId: data.user.id })
  }

  if (action === 'update') {
    const userId = String(body.userId ?? '')
    const firstName = String(body.firstName ?? '').trim()
    const lastName = String(body.lastName ?? '').trim()
    const username = String(body.username ?? '').trim().toLowerCase() || null
    const role = body.role
    if (!userId || !firstName || !lastName || !['buyer', 'admin'].includes(String(role))) {
      return json(400, { error: 'Enter a first name, last name, and valid role.' })
    }
    if (username && !/^[a-z0-9_]{3,20}$/.test(username)) return json(400, { error: 'Username must be 3–20 letters, numbers, or underscores.' })
    if (userId === callerData.user.id && role !== 'admin') return json(400, { error: 'You cannot remove your own administrator access.' })
    if (role !== 'admin') {
      const { count, error: countError } = await serviceClient.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'admin')
      if (countError) return json(500, { error: countError.message })
      const { data: target } = await serviceClient.from('profiles').select('role').eq('id', userId).maybeSingle()
      if (target?.role === 'admin' && (count ?? 0) <= 1) return json(400, { error: 'The last administrator cannot be changed to a buyer.' })
    }
    const { error } = await serviceClient.from('profiles').update({ first_name: firstName, last_name: lastName, username, role }).eq('id', userId)
    if (error) return json(400, { error: error.message })
    return json(200, { message: 'Account details updated.' })
  }

  if (action === 'send_reset') {
    const userId = String(body.userId ?? '')
    const { data: user, error: userError } = await serviceClient.auth.admin.getUserById(userId)
    if (userError || !user.user?.email) return json(404, { error: 'Could not find an email for this account.' })
    const publicClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const { error } = await publicClient.auth.resetPasswordForEmail(user.user.email, {
      redirectTo: `${siteUrl}/reset-password`,
    })
    if (error) return json(400, { error: error.message })
    return json(200, { message: `Password reset email requested for ${user.user.email}.` })
  }

  return json(400, { error: 'Unknown admin user action.' })
})
