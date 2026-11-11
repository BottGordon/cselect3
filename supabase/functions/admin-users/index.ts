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
  if (!supabaseUrl || !anonKey || !serviceKey) return json(500, { error: 'Admin user service is not configured.' })

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
    const authUsers: Array<{
      id: string
      email?: string | null
      user_metadata?: Record<string, unknown> | null
    }> = []
    for (let page = 1; ; page += 1) {
      const { data, error } = await serviceClient.auth.admin.listUsers({ page, perPage: 1000 })
      if (error) return json(500, { error: error.message })
      authUsers.push(...data.users)
      if (data.users.length < 1000) break
    }

    const profiles = []
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await serviceClient
        .from('profiles')
        .select('id, first_name, last_name, username, role, created_at')
        .order('created_at', { ascending: false })
        .range(offset, offset + 999)
      if (error) return json(500, { error: error.message })
      profiles.push(...(data ?? []))
      if ((data ?? []).length < 1000) break
    }

    const profileById = new Map(profiles.map((profile) => [profile.id, profile]))
    const missingProfiles = authUsers
      .filter((user) => !profileById.has(user.id))
      .map((user) => ({
        id: user.id,
        first_name: String(user.user_metadata?.first_name ?? '').trim(),
        last_name: String(user.user_metadata?.last_name ?? '').trim(),
        username: null,
        role: 'buyer' as const,
      }))

    if (missingProfiles.length > 0) {
      const { data: repairedProfiles, error: repairError } = await serviceClient
        .from('profiles')
        .upsert(missingProfiles, { onConflict: 'id' })
        .select('id, first_name, last_name, username, role, created_at')
      if (repairError) return json(500, { error: `Could not restore missing account profiles: ${repairError.message}` })
      for (const profile of repairedProfiles ?? []) profileById.set(profile.id, profile)
    }

    const emailById = new Map(authUsers.map((user) => [user.id, user.email ?? '']))
    const listedProfiles = [...profileById.values()].sort((left, right) =>
      right.created_at.localeCompare(left.created_at),
    )
    return json(200, { users: listedProfiles.map((profile) => ({ ...profile, email: emailById.get(profile.id) ?? '' })) })
  }

  if (action === 'invite') {
    if (!siteUrl) return json(500, { error: 'Set the SITE_URL secret before sending account invitations.' })
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
    if (!siteUrl) return json(500, { error: 'Set the SITE_URL secret before sending password resets.' })
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
