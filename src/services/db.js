import { supabase } from '../supabase'

// ============================================================================
// 1. PROFILE SERVICES
// ============================================================================

/**
 * Fetch a profile by ID
 */
export const getProfile = async (userId) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()

  if (error) throw error
  return data
}

/**
 * Upsert user profile metadata
 */
export const upsertProfile = async (profile) => {
  const { data, error } = await supabase
    .from('profiles')
    .upsert(profile)
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Update user profile avatar
 */
export const updateProfileAvatar = async (userId, avatarUrl) => {
  const { data, error } = await supabase
    .from('profiles')
    .update({ avatar_url: avatarUrl })
    .eq('id', userId)
    .select()
    .single()

  if (error) throw error
  return data
}

// ============================================================================
// 2. LOBBY & PLAYER SERVICES
// ============================================================================

/**
 * Generates a random 4-letter uppercase code
 */
const generateLobbyCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  let code = ''
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

/**
 * Creates a new lobby with a unique 4-letter code, and joins the creator as a player
 */
export const createLobby = async (creatorId) => {
  let lobby = null
  let attempts = 0
  const maxAttempts = 5

  while (!lobby && attempts < maxAttempts) {
    const code = generateLobbyCode()
    try {
      const { data, error } = await supabase
        .from('lobbies')
        .insert({
          code,
          creator_id: creatorId,
          status: 'lobby'
        })
        .select()
        .single()

      if (error) {
        // If error is code collision (unique constraint), retry
        if (error.code === '23505') {
          attempts++
          continue
        }
        throw error
      }
      lobby = data
    } catch (err) {
      if (attempts >= maxAttempts - 1) throw err
      attempts++
    }
  }

  if (!lobby) {
    throw new Error('Failed to generate a unique lobby code after multiple attempts.')
  }

  // Auto-join the creator to the lobby players list
  await joinLobby(lobby.code, creatorId)

  return lobby
}

/**
 * Join an existing lobby using its 4-letter code
 */
export const joinLobby = async (lobbyCode, profileId) => {
  const uppercaseCode = lobbyCode.trim().toUpperCase()

  // Find the lobby
  const { data: lobby, error: lobbyError } = await supabase
    .from('lobbies')
    .select('*')
    .eq('code', uppercaseCode)
    .single()

  if (lobbyError || !lobby) {
    throw new Error('Lobby not found with code: ' + uppercaseCode)
  }

  // Insert player mapping
  const { data: player, error: playerError } = await supabase
    .from('players')
    .upsert({
      lobby_id: lobby.id,
      profile_id: profileId,
      score: 0,
      is_ready: false
    }, {
      onConflict: 'lobby_id,profile_id'
    })
    .select()
    .single()

  if (playerError) throw playerError

  return { lobby, player }
}

/**
 * Joins or creates the single global lobby (code 'GAME')
 */
export const joinOrCreateGlobalLobby = async (profileId) => {
  const code = 'GAME'
  
  // 1. Try to find the lobby
  let { data: lobby, error: lobbyError } = await supabase
    .from('lobbies')
    .select('*')
    .eq('code', code)
    .maybeSingle()

  if (lobbyError) throw lobbyError

  // 2. If it doesn't exist, create it
  if (!lobby) {
    const { data: newLobby, error: createError } = await supabase
      .from('lobbies')
      .insert({
        code,
        creator_id: profileId,
        status: 'lobby'
      })
      .select()
      .single()

    if (createError) throw createError
    lobby = newLobby
  } else {
    // Self-healing: check player count and reset if the lobby is empty
    const { count, error: countError } = await supabase
      .from('players')
      .select('*', { count: 'exact', head: true })
      .eq('lobby_id', lobby.id)

    if (countError) throw countError

    if (count === 0 && lobby.status !== 'lobby') {
      // Reset status and round to 'lobby'/0 when completely empty
      const { error: resetError } = await supabase
        .rpc('reset_lobby_if_empty', { p_lobby_id: lobby.id })

      if (resetError) throw resetError
    }

    // Always clean stale memes/votes when lobby is in 'lobby' status (covers finished games
    // that ended without going through handleRestartLobby, e.g. crash or window close)
    const currentStatus = count === 0 && lobby.status !== 'lobby' ? 'lobby' : lobby.status
    if (currentStatus === 'lobby') {
      const { error: rpcError } = await supabase.rpc('clear_lobby_memes_and_votes', { p_lobby_id: lobby.id })
      if (rpcError) {
        console.warn('RPC clear_lobby_memes_and_votes failed in lobby join, falling back to client delete:', rpcError)
        const { data: staleMemes } = await supabase
          .from('memes')
          .select('id')
          .eq('lobby_id', lobby.id)
        if (staleMemes && staleMemes.length > 0) {
          const staleMemeIds = staleMemes.map(m => m.id)
          await supabase.from('votes').delete().in('meme_id', staleMemeIds)
          await supabase.from('memes').delete().eq('lobby_id', lobby.id)
        }
      }
    }

    // Refetch the lobby state to get current values after potential reset
    if (count === 0 && lobby.status !== 'lobby') {
      const { data: refetchedLobby, error: refetchError } = await supabase
        .from('lobbies')
        .select('*')
        .eq('id', lobby.id)
        .single()

      if (refetchError) throw refetchError
      lobby = refetchedLobby
    }
  }

  // 3. Check if player already in the lobby
  const { data: existingPlayer, error: checkError } = await supabase
    .from('players')
    .select('*')
    .eq('lobby_id', lobby.id)
    .eq('profile_id', profileId)
    .maybeSingle()

  if (checkError) throw checkError

  let player = existingPlayer

  if (!player) {
    const { data: newPlayer, error: playerError } = await supabase
      .from('players')
      .insert({
        lobby_id: lobby.id,
        profile_id: profileId,
        score: 0,
        is_ready: false
      })
      .select()
      .single()

    if (playerError) throw playerError
    player = newPlayer
  }

  return { lobby, player }
}


/**
 * Leave a lobby (remove the player record)
 */
export const leaveLobby = async (lobbyId, profileId) => {
  const { error } = await supabase
    .from('players')
    .delete()
    .eq('lobby_id', lobbyId)
    .eq('profile_id', profileId)

  if (error) throw error
}

/**
 * Update the state of a lobby ('lobby', 'writing', 'voting', 'ended')
 */
export const updateLobbyStatus = async (lobbyId, status) => {
  const { data, error } = await supabase
    .from('lobbies')
    .update({ status })
    .eq('id', lobbyId)
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Update lobby settings (max_rounds, writing_duration, voting_duration, swap_limit)
 */
export const updateLobbySettings = async (lobbyId, settings) => {
  const { max_rounds, writing_duration, voting_duration, swap_limit, voting_mode } = settings
  const { data, error } = await supabase
    .from('lobbies')
    .update({ max_rounds, writing_duration, voting_duration, swap_limit, voting_mode })
    .eq('id', lobbyId)
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Update the current round number for a lobby
 */
export const updateLobbyRound = async (lobbyId, roundNumber) => {
  const { data, error } = await supabase
    .from('lobbies')
    .update({ current_round: roundNumber })
    .eq('id', lobbyId)
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Fetch lobby settings (max_rounds, current_round, writing_duration, voting_duration, swap_limit, voting_mode)
 */
export const getLobbySettings = async (lobbyId) => {
  const { data, error } = await supabase
    .from('lobbies')
    .select('max_rounds, current_round, writing_duration, voting_duration, swap_limit, voting_mode')
    .eq('id', lobbyId)
    .single()

  if (error) throw error
  return data
}

/**
 * Fetch all players in a specific lobby (including profile details) ordered by score descending
 */
export const getLobbyPlayers = async (lobbyId) => {
  try {
    await supabase.rpc('clean_stale_players')
  } catch (e) {
    console.error('Error running presence cleanup:', e)
  }

  const { data, error } = await supabase
    .from('players')
    .select('*, profiles(username, role, avatar_url)')
    .eq('lobby_id', lobbyId)
    .order('score', { ascending: false })

  if (error) throw error
  return data
}

/**
 * Mark a player as ready or not ready
 */
export const updatePlayerReady = async (lobbyId, profileId, isReady) => {
  const { data, error } = await supabase
    .from('players')
    .update({ is_ready: isReady })
    .eq('lobby_id', lobbyId)
    .eq('profile_id', profileId)
    .select()
    .single()

  if (error) throw error
  return data
}

// ============================================================================
// 3. IMAGE / TEMPLATE SERVICES
// ============================================================================

/**
 * Upload a meme template image to storage and insert metadata into database
 * Approved automatically if uploaded by a 'creator' role, otherwise false
 */
export const uploadTemplate = async (file, name, profileId, role, textZones = []) => {
  // Generate unique file path
  const fileExt = file.name.split('.').pop()
  const fileName = `${Math.random().toString(36).substring(2, 15)}-${Date.now()}.${fileExt}`
  const filePath = `templates/${fileName}`

  // Upload to Supabase Storage Bucket 'meme-templates'
  const { error: uploadError } = await supabase.storage
    .from('meme-templates')
    .upload(filePath, file)

  if (uploadError) throw uploadError

  // Get the public URL for the uploaded file
  const { data: { publicUrl } } = supabase.storage
    .from('meme-templates')
    .getPublicUrl(filePath)

  // Insert image metadata
  const { data, error: dbError } = await supabase
    .from('images')
    .insert({
      url: publicUrl,
      name: name || 'Sans titre',
      uploaded_by: profileId,
      approved: role === 'creator', // Automatically approved if creator uploaded it
      text_zones: textZones
    })
    .select()
    .single()

  if (dbError) throw dbError
  return data
}

/**
 * Fetch approved meme templates
 */
export const getApprovedTemplates = async () => {
  const { data, error } = await supabase
    .from('images')
    .select('*')
    .eq('approved', true)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data
}

/**
 * Fetch pending templates awaiting moderation (admin/creator tool)
 */
export const getPendingTemplates = async () => {
  const { data, error } = await supabase
    .from('images')
    .select('*, profiles(username)')
    .eq('approved', false)
    .order('created_at', { ascending: true })

  if (error) throw error
  return data
}

/**
 * Fetch all templates (approved + pending)
 */
export const getAllTemplates = async () => {
  const { data, error } = await supabase
    .from('images')
    .select('*, profiles(username)')
    .order('created_at', { ascending: false })

  if (error) throw error
  return data
}

/**
 * Approve or Reject (Delete) a pending image template
 */
export const moderateTemplate = async (imageId, approve) => {
  if (approve) {
    // Approve image template
    const { data, error } = await supabase
      .from('images')
      .update({ approved: true })
      .eq('id', imageId)
      .select()
      .single()

    if (error) throw error
    return data
  } else {
    // Reject and delete image template (database + storage cleanup)
    const { data: img, error: fetchError } = await supabase
      .from('images')
      .select('*')
      .eq('id', imageId)
      .single()

    if (fetchError) throw fetchError

    // 1. Delete database row (returns cascade constraint deletes if any)
    const { error: deleteDbError } = await supabase
      .from('images')
      .delete()
      .eq('id', imageId)

    if (deleteDbError) throw deleteDbError

    // 2. Extract path from the public URL and remove object from storage bucket
    try {
      const parts = img.url.split('/meme-templates/')
      if (parts.length > 1) {
        const storagePath = decodeURIComponent(parts[1])
        await supabase.storage.from('meme-templates').remove([storagePath])
      }
    } catch (storageErr) {
      console.error('Failed to remove file from Supabase storage:', storageErr)
    }

    return { success: true, message: 'Template successfully rejected and deleted.' }
  }
}

/**
 * Update the text zones and name of a template (admin/creator tool)
 */
export const updateTemplateTextZones = async (templateId, textZones, name) => {
  const { data, error } = await supabase
    .from('images')
    .update({ text_zones: textZones, name: name })
    .eq('id', templateId)
    .select()
    .single()

  if (error) throw error
  return data
}

// ============================================================================
// 4. MEME SERVICES
// ============================================================================

/**
 * Submit or update a meme for a player in a lobby
 * textZones format: Array of text blocks with positioning [{ text: "...", x: 0.1, y: 0.2 }]
 */
export const submitMeme = async (lobbyId, imageId, profileId, textZones) => {
  const { data, error } = await supabase
    .from('memes')
    .upsert({
      lobby_id: lobbyId,
      image_id: imageId,
      profile_id: profileId,
      text_zones: textZones
    }, {
      onConflict: 'lobby_id,profile_id'
    })
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Get all submitted memes for a lobby (along with creator username and template metadata)
 */
export const getLobbyMemes = async (lobbyId) => {
  const { data, error } = await supabase
    .from('memes')
    .select('*, profiles(username, avatar_url), images(*)')
    .eq('lobby_id', lobbyId)

  if (error) throw error
  return data
}

/**
 * Clear all memes and their associated votes for a lobby (called at start of each new round)
 */
export const clearLobbyMemesAndVotes = async (lobbyId) => {
  const { error } = await supabase.rpc('clear_lobby_memes_and_votes', { p_lobby_id: lobbyId })
  if (error) {
    console.warn('RPC clear_lobby_memes_and_votes failed, falling back to client delete:', error)
    // 1. Fetch all meme IDs in this lobby
    const { data: memes, error: memesError } = await supabase
      .from('memes')
      .select('id')
      .eq('lobby_id', lobbyId)

    if (memesError) throw memesError

    // 2. Delete all votes for these memes
    if (memes && memes.length > 0) {
      const memeIds = memes.map(m => m.id)
      const { error: votesError } = await supabase
        .from('votes')
        .delete()
        .in('meme_id', memeIds)

      if (votesError) throw votesError
    }

    // 3. Delete all memes in this lobby
    const { error: deleteMemesError } = await supabase
      .from('memes')
      .delete()
      .eq('lobby_id', lobbyId)

    if (deleteMemesError) throw deleteMemesError
  }
}

// ============================================================================
// 5. VOTE & SCORE SERVICES
// ============================================================================

/**
 * Submit or update a vote on a specific meme
 * voteValue must be either 'bien', 'mouais', or 'nul'
 */
export const submitVote = async (memeId, voterId, voteValue, pokeballBonus = false) => {
  if (!['masterclass', 'pas mal', 'mouais', 'guez'].includes(voteValue)) {
    throw new Error("Invalid vote value. Must be 'masterclass', 'pas mal', 'mouais', or 'guez'")
  }

  const { data, error } = await supabase
    .from('votes')
    .upsert({
      meme_id: memeId,
      voter_id: voterId,
      vote: voteValue,
      pokeball_bonus: pokeballBonus
    }, {
      onConflict: 'meme_id,voter_id'
    })
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Fetch all votes for a single meme
 */
export const getMemeVotes = async (memeId) => {
  const { data, error } = await supabase
    .from('votes')
    .select('*')
    .eq('meme_id', memeId)

  if (error) throw error
  return data
}

/**
 * Tally all votes for memes in a lobby and assign scores to the respective creators
 * Rules:
 * - 'bien' = +2 points
 * - 'mouais' = +1 point
 * - 'nul' = 0 points
 * - Self-votes are excluded from points calculation.
 */
export const tallyVotesAndAssignScores = async (lobbyId) => {
  // 1. Fetch all memes in this lobby
  const memes = await getLobbyMemes(lobbyId)
  if (!memes || memes.length === 0) return { playerScores: {}, scoreAdditions: {} }

  // 2. Fetch all votes for these memes
  const memeIds = memes.map(m => m.id)
  const { data: votes, error: votesError } = await supabase
    .from('votes')
    .select('*')
    .in('meme_id', memeIds)

  if (votesError) throw votesError

  // 3. Calculate per-round score additions
  const scoreAdditions = {}
  memes.forEach(m => {
    scoreAdditions[m.profile_id] = 0
  })

  votes.forEach(v => {
    const meme = memes.find(m => m.id === v.meme_id)
    if (meme) {
      const creatorId = meme.profile_id
      // Exclude self-voting (cannot score points on own meme)
      if (v.voter_id !== creatorId) {
        if (v.vote === 'masterclass') {
          scoreAdditions[creatorId] += 1000
        } else if (v.vote === 'pas mal') {
          scoreAdditions[creatorId] += 400
        } else if (v.vote === 'mouais') {
          scoreAdditions[creatorId] += 0
        } else if (v.vote === 'guez') {
          scoreAdditions[creatorId] -= 500
        } else if (!isNaN(parseInt(v.vote, 10))) {
          // Slider note sur 10: chaque point donne +100 points
          scoreAdditions[creatorId] += parseInt(v.vote, 10) * 100
        }

        if (v.pokeball_bonus) {
          scoreAdditions[creatorId] += 200
        }
      }
    }
  })

  // 4. Fetch current scores and add round additions (cumulative)
  const { data: players, error: playersError } = await supabase
    .from('players')
    .select('profile_id, score')
    .eq('lobby_id', lobbyId)

  if (playersError) throw playersError

  const playerScores = {}
  const updatePromises = Object.entries(scoreAdditions).map(([profileId, addition]) => {
    const existingPlayer = players.find(p => p.profile_id === profileId)
    const currentScore = existingPlayer ? existingPlayer.score : 0
    const newScore = currentScore + addition
    playerScores[profileId] = newScore

    return supabase
      .from('players')
      .update({ score: newScore })
      .eq('lobby_id', lobbyId)
      .eq('profile_id', profileId)
  })

  await Promise.all(updatePromises)

  return { playerScores, scoreAdditions }
}

/**
 * Fetch players currently in the global lobby ('GAME')
 */
export const getGlobalLobbyPlayers = async () => {
  try {
    await supabase.rpc('clean_stale_players')
  } catch (e) {
    console.error('Error running presence cleanup:', e)
  }

  const { data: lobby, error: lobbyError } = await supabase
    .from('lobbies')
    .select('id')
    .eq('code', 'GAME')
    .maybeSingle()

  if (lobbyError || !lobby) return []

  const { data: players, error: playersError } = await supabase
    .from('players')
    .select('*, profiles(username, role, avatar_url)')
    .eq('lobby_id', lobby.id)
    .order('joined_at', { ascending: true })

  if (playersError) throw playersError
  return players
}

// ============================================================================
// 6. STATISTICS & RANKING SERVICES
// ============================================================================

/**
 * Record final results of a game (update games played, points, wins)
 */
export const recordGameResults = async (winnerIds, playerResults) => {
  const { error } = await supabase.rpc('record_game_results', {
    winner_ids: winnerIds,
    player_results: playerResults
  })

  if (error) throw error
}

/**
 * Record round winners (increment rounds won)
 */
export const recordRoundWinners = async (winnerIds) => {
  const { error } = await supabase.rpc('record_round_winners', {
    winner_ids: winnerIds
  })

  if (error) throw error
}

/**
 * Record round votes/ratings to accumulate vote data for profiles
 */
export const recordRoundVotes = async (votesData) => {
  const { error } = await supabase.rpc('record_round_votes', {
    votes_data: votesData
  })

  if (error) throw error
}

/**
 * Fetch all profiles with their accumulated statistics
 */
export const getAllPlayersStats = async () => {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, avatar_url, role, games_played, games_won, total_points, rounds_won, total_votes_count, total_votes_value_sum')
    .order('games_won', { ascending: false })

  if (error) throw error
  return data
}

// ============================================================================
// 7. HALL OF FAME SERVICES
// ============================================================================

/**
 * Save the winning meme of a round to the hall of fame
 */
export const saveWinningMemeToHallOfFame = async ({
  imageUrl,
  templateName,
  textZones,
  winnerProfileId,
  winnerUsername,
  winnerAvatarUrl,
  scoreEarned,
}) => {
  const { data, error } = await supabase
    .from('meme_hall_of_fame')
    .insert({
      image_url: imageUrl,
      template_name: templateName || 'Mème sans titre',
      text_zones: textZones || [],
      winner_profile_id: winnerProfileId || null,
      winner_username: winnerUsername || 'Anonyme',
      winner_avatar_url: winnerAvatarUrl || null,
      score_earned: scoreEarned || 0,
    })
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Fetch the last N winning memes from the hall of fame
 */
export const getHallOfFame = async (limit = 10) => {
  const { data, error } = await supabase
    .from('meme_hall_of_fame')
    .select('*')
    .order('won_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return data || []
}
