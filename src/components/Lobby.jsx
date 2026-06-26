import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { getLobbyPlayers, updatePlayerReady, updateLobbyStatus, leaveLobby, updateLobbySettings, updateLobbyRound, joinLobby, updateProfileAvatar } from '../services/db'
import { supabase } from '../supabase'
import { RetroBox, RetroButton, RetroInput } from './retro'
import { POKEMON_AVATARS } from '../services/avatars'

export default function Lobby({ lobby, onLeave, onGameStart, onLobbyUpdate, theme = 'default' }) {
  const { user, profile, isAdmin } = useAuth()
  const [players, setPlayers] = useState([])
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [chatMessages, setChatMessages] = useState([])
  const [chatInput, setChatInput] = useState('')
  const [avatarLoading, setAvatarLoading] = useState(false)
  const [isKicked, setIsKicked] = useState(false)

  const channelRef = useRef(null)
  const chatContainerRef = useRef(null)

  // Local settings state, synced from lobby prop and realtime updates
  const [settings, setSettings] = useState({
    max_rounds: lobby.max_rounds || 3,
    writing_duration: lobby.writing_duration || 60,
    voting_duration: lobby.voting_duration || 15,
    swap_limit: lobby.swap_limit || 3,
    voting_mode: lobby.voting_mode || 'buttons',
  })

  // Auto-scroll chat container to bottom without scrolling the whole page
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight
    }
  }, [chatMessages])

  // Determine host: admins take priority over lobby creator
  const isHost = useMemo(() => {
    // Check if any connected players are admins (profiles.role === 'creator')
    const adminPlayers = players.filter((p) => p.profiles?.role === 'creator')
    if (adminPlayers.length > 0) {
      // If there are admins, only admins are hosts
      return adminPlayers.some((p) => p.profile_id === user.id)
    }
    // No admins: fallback to lobby creator
    return lobby.creator_id === user.id
  }, [players, user.id, lobby.creator_id])

  // Determine which players should show the HÔTE badge
  const getIsPlayerHost = useCallback((player) => {
    const adminPlayers = players.filter((p) => p.profiles?.role === 'creator')
    if (adminPlayers.length > 0) {
      return player.profiles?.role === 'creator'
    }
    return player.profile_id === lobby.creator_id
  }, [players, lobby.creator_id])

  const myPlayer = players.find((p) => p.profile_id === user.id)

  const fetchPlayers = async () => {
    try {
      const data = await getLobbyPlayers(lobby.id)
      setPlayers(data)
    } catch (err) {
      console.error('Error fetching players:', err)
      setErrorMsg('Impossible de charger les joueurs.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    setTimeout(() => {
      fetchPlayers()
    }, 0)

    // Subscribe to realtime changes in players and lobby
    const channel = supabase
      .channel(`lobby-${lobby.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'players',
          filter: `lobby_id=eq.${lobby.id}`,
        },
        () => {
          fetchPlayers()
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'lobbies',
          filter: `id=eq.${lobby.id}`,
        },
        (payload) => {
          if (payload.new) {
            // Sync settings from realtime updates
            setSettings({
              max_rounds: payload.new.max_rounds ?? 3,
              writing_duration: payload.new.writing_duration ?? 60,
              voting_duration: payload.new.voting_duration ?? 15,
              swap_limit: payload.new.swap_limit ?? 3,
              voting_mode: payload.new.voting_mode ?? 'buttons',
            })

            if (onLobbyUpdate) {
              onLobbyUpdate(payload.new)
            }

            // Trigger game start if status changed
            if (payload.new.status !== 'lobby') {
              onGameStart(payload.new)
            }
          }
        }
      )
      .on('broadcast', { event: 'lobby_chat' }, ({ payload }) => {
        setChatMessages(prev => [...prev, payload])
      })
      .on('broadcast', { event: 'lobby_system' }, ({ payload }) => {
        setChatMessages(prev => [...prev, { ...payload, isSystem: true, id: Math.random().toString() }])
      })
      .on('broadcast', { event: 'player_kicked' }, ({ payload }) => {
        if (payload.profileId === user.id) {
          setIsKicked(true)
          onLeave()
        }
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          // Send join notification once we're subscribed
          setTimeout(() => {
            const myName = profile?.username || user.email?.split('@')[0] || 'Un dresseur'
            channel.send({
              type: 'broadcast',
              event: 'lobby_system',
              payload: { text: `CHEN : ${myName} a rejoint le salon !` }
            })
          }, 1000)
        }
      })

    channelRef.current = channel

    return () => {
      supabase.removeChannel(channel)
      channelRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lobby.id, profile?.username])

  // Auto-rejoin if player was deleted by a cleanup script or temporary network drop
  useEffect(() => {
    if (loading) return
    if (players.length === 0) return
    if (isKicked) return // Skip auto-rejoin if kicked!
    
    const myPlayer = players.find((p) => p.profile_id === user.id)
    if (!myPlayer) {
      console.log('Joueur non trouve dans la liste du salon. Reconnexion automatique...')
      joinLobby(lobby.code, user.id).catch((err) => {
        console.error('Erreur lors de la reconnexion automatique au salon :', err)
      })
    }
  }, [players, loading, user.id, lobby.code, isKicked])

  const handleAvatarSelect = async (avatarUrl) => {
    if (avatarLoading || !myPlayer) return
    setAvatarLoading(true)
    try {
      await updateProfileAvatar(user.id, avatarUrl)
      // Perform dummy update to players table to trigger realtime change event
      await supabase
        .from('players')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('lobby_id', lobby.id)
        .eq('profile_id', user.id)
      
      if (channelRef.current) {
        const pName = POKEMON_AVATARS.find(p => p.url === avatarUrl)?.name || 'un Pokémon'
        channelRef.current.send({
          type: 'broadcast',
          event: 'lobby_system',
          payload: { text: `CHEN : ${profile?.username || 'Quelqu\'un'} a choisi ${pName.toUpperCase()} !` }
        })
      }
    } catch (err) {
      console.error('Error changing avatar in lobby:', err)
      setErrorMsg("Impossible de changer d'avatar.")
    } finally {
      setAvatarLoading(false)
    }
  }

  const sendChatMessage = (e) => {
    e.preventDefault()
    if (!chatInput.trim() || !myPlayer) return
    
    const msg = {
      id: Math.random().toString(36).substring(2, 9),
      username: profile?.username || myPlayer.profiles?.username || 'Anonyme',
      avatarUrl: profile?.avatar_url || myPlayer.profiles?.avatar_url,
      text: chatInput.trim(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    }

    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'lobby_chat',
        payload: msg
      })
    }

    setChatMessages(prev => [...prev, msg])
    setChatInput('')
  }

  const handleKickPlayer = async (playerProfileId) => {
    try {
      // 1. Broadcast the kick event first, so they know they are kicked and exit
      if (channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'player_kicked',
          payload: { profileId: playerProfileId }
        })
      }
      
      // 2. Call RPC to delete from database
      const { error } = await supabase.rpc('kick_player', {
        p_lobby_id: lobby.id,
        p_profile_id: playerProfileId
      })
      
      if (error) {
        // fallback
        await supabase
          .from('players')
          .delete()
          .eq('lobby_id', lobby.id)
          .eq('profile_id', playerProfileId)
      }
    } catch (err) {
      console.error('Error kicking player:', err)
      setErrorMsg("Impossible d'exclure le joueur.")
    }
  }


  const handleToggleReady = async () => {
    if (!myPlayer) return
    try {
      await updatePlayerReady(lobby.id, user.id, !myPlayer.is_ready)
    } catch (err) {
      console.error(err)
      setErrorMsg('Erreur lors du changement de statut.')
    }
  }

  const handleLeave = async () => {
    try {
      await leaveLobby(lobby.id, user.id)
      onLeave()
    } catch (err) {
      console.error(err)
      setErrorMsg('Erreur lors du départ.')
    }
  }

  const handleStartGame = async () => {
    // Check if everyone (non-host) is ready
    const nonHostPlayers = players.filter((p) => !getIsPlayerHost(p))
    const allReady = nonHostPlayers.every((p) => p.is_ready)

    if (nonHostPlayers.length > 0 && !allReady) {
      setErrorMsg('Tous les joueurs doivent être prêts !')
      return
    }

    try {
      // Initialize current_round to 0 before starting (allows host to setup first round)
      await updateLobbyRound(lobby.id, 0)
      // Set status to writing, which will trigger the transition for everyone
      await updateLobbyStatus(lobby.id, 'writing')
    } catch (err) {
      console.error(err)
      setErrorMsg('Erreur lors du lancement du jeu.')
    }
  }

  const saveSettings = async (newSettings) => {
    try {
      const updated = await updateLobbySettings(lobby.id, newSettings)
      
      // Save settings to localStorage so they persist across game sessions
      localStorage.setItem('meme_game_settings', JSON.stringify({
        max_rounds: updated.max_rounds,
        writing_duration: updated.writing_duration,
        voting_duration: updated.voting_duration,
        swap_limit: updated.swap_limit,
        voting_mode: updated.voting_mode,
      }))

      if (onLobbyUpdate) {
        onLobbyUpdate(updated)
      }
    } catch (err) {
      console.error('Error updating settings:', err)
      setErrorMsg('Erreur lors de la mise à jour des paramètres.')
    }
  }

  // Load last used settings from localStorage and apply them to the lobby database row on host load
  useEffect(() => {
    if (!isHost) return

    const saved = localStorage.getItem('meme_game_settings')
    if (saved) {
      try {
        const parsedSettings = JSON.parse(saved)
        // Ensure values are within configured bounds
        const maxRounds = Math.max(1, Math.min(10, parsedSettings.max_rounds ?? 3))
        const writingDuration = Math.max(10, Math.min(300, parsedSettings.writing_duration ?? 60))
        const votingDuration = Math.max(5, Math.min(120, parsedSettings.voting_duration ?? 15))
        const swapLimit = Math.max(0, Math.min(50, parsedSettings.swap_limit ?? 3))
        const votingMode = parsedSettings.voting_mode || 'buttons'

        const finalSettings = {
          max_rounds: maxRounds,
          writing_duration: writingDuration,
          voting_duration: votingDuration,
          swap_limit: swapLimit,
          voting_mode: votingMode,
        }

        const databaseSettings = {
          max_rounds: lobby.max_rounds ?? 3,
          writing_duration: lobby.writing_duration ?? 60,
          voting_duration: lobby.voting_duration ?? 15,
          swap_limit: lobby.swap_limit ?? 3,
          voting_mode: lobby.voting_mode ?? 'buttons',
        }

        const hasDifference = 
          finalSettings.max_rounds !== databaseSettings.max_rounds ||
          finalSettings.writing_duration !== databaseSettings.writing_duration ||
          finalSettings.voting_duration !== databaseSettings.voting_duration ||
          finalSettings.swap_limit !== databaseSettings.swap_limit ||
          finalSettings.voting_mode !== databaseSettings.voting_mode

        if (hasDifference) {
          setTimeout(() => {
            setSettings(finalSettings)
            saveSettings(finalSettings)
          }, 0)
        }
      } catch (err) {
        console.error('Error parsing saved settings from localStorage:', err)
      }
    }
  }, [isHost, lobby.id])

  const allPlayersReady = players.length > 0 && players.filter(p => !getIsPlayerHost(p)).every(p => p.is_ready)

  // ---------- Settings constraints ----------
  const settingsConfig = [
    { key: 'max_rounds', label: 'Nombre de manches', min: 1, max: 10, suffix: '' },
    { key: 'writing_duration', label: 'Temps de création', min: 10, max: 300, suffix: 's' },
    { key: 'voting_duration', label: 'Temps de vote', min: 5, max: 120, suffix: 's' },
    { key: 'swap_limit', label: "Changements d'image", min: 0, max: 50, suffix: '' },
  ]

  return (
    <div style={{ 
      maxWidth: '1000px', 
      margin: '0 auto', 
      display: 'grid', 
      gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', 
      gap: '20px',
      width: '100%',
      boxSizing: 'border-box'
    }}>
      {/* Left Column: Players list & Lobby Controls */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {errorMsg && (
          <div style={{ color: '#c21a1a', border: '2px solid #c21a1a', padding: '8px', fontFamily: 'var(--font-press-start)', fontSize: '12px', textAlign: 'center' }}>
            [ERREUR] {errorMsg}
          </div>
        )}

        <RetroBox title="JOUEURS CONNECTÉS" theme={theme} className="main-card">
          {loading ? (
            <p style={{ textAlign: 'center', margin: '20px 0' }}>CHARGEMENT DES JOUEURS...</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {players.map((player) => {
                const isPlayerHostBadge = getIsPlayerHost(player)
                return (
                  <div
                    key={player.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '8px 12px',
                      border: '2px solid var(--border)',
                      backgroundColor: player.profile_id === user.id ? 'var(--code-bg)' : 'transparent',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {player.profiles?.avatar_url ? (
                        <img 
                          src={player.profiles.avatar_url} 
                          alt="Avatar" 
                          style={{ 
                            width: '32px', 
                            height: '32px', 
                            imageRendering: 'pixelated', 
                            border: '2px solid var(--border)',
                            backgroundColor: 'var(--bg)',
                            marginRight: '4px',
                            flexShrink: 0
                          }} 
                        />
                      ) : (
                        <div
                          style={{
                            width: '32px',
                            height: '32px',
                            border: '2px dashed var(--border)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '12px',
                            fontFamily: 'var(--font-press-start)',
                            backgroundColor: 'var(--code-bg)',
                            marginRight: '4px',
                            flexShrink: 0
                          }}
                        >
                          ?
                        </div>
                      )}
                      <span style={{ fontSize: '20px', fontFamily: 'var(--font-press-start)' }}>
                        {player.profiles?.username || 'Anonyme'}
                      </span>
                      {isPlayerHostBadge && (
                        <span
                          style={{
                            fontSize: '10px',
                            fontFamily: 'var(--font-press-start)',
                            backgroundColor: 'var(--accent-bg)',
                            color: 'var(--accent)',
                            padding: '2px 6px',
                            border: '1px solid var(--accent-border)',
                          }}
                        >
                          HÔTE
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div>
                        {isPlayerHostBadge ? (
                          <span style={{ fontFamily: 'var(--font-press-start)', fontSize: '12px', color: 'var(--accent)' }}>
                            PRÊT (HÔTE)
                          </span>
                        ) : player.is_ready ? (
                          <span style={{ fontFamily: 'var(--font-press-start)', fontSize: '12px', color: '#306230' }}>
                            ● PRÊT
                          </span>
                        ) : (
                          <span style={{ fontFamily: 'var(--font-press-start)', fontSize: '12px', color: '#c21a1a' }}>
                            ○ PAS PRÊT
                          </span>
                        )}
                      </div>
                      {isHost && player.profile_id !== user.id && (
                        <button
                          onClick={() => handleKickPlayer(player.profile_id)}
                          title="Exclure ce joueur"
                          style={{
                            backgroundColor: '#c21a1a',
                            color: '#fff',
                            border: '2px solid var(--border)',
                            cursor: 'pointer',
                            fontFamily: 'var(--font-press-start)',
                            fontSize: '10px',
                            padding: '2px 6px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            borderRadius: '0',
                            lineHeight: '1'
                          }}
                        >
                          X
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </RetroBox>

        {/* Settings button - visible to all players */}
        <RetroButton
          onClick={() => setShowSettings(true)}
          theme={theme}
          style={{ width: '100%', backgroundColor: 'var(--code-bg)', color: 'var(--text)' }}
        >
          ⚙ PARAMÈTRES
        </RetroButton>

        <div style={{ display: 'flex', gap: '15px', width: '100%' }}>
          <RetroButton onClick={handleLeave} theme={theme} className="btn-leave" style={{ flex: 1 }}>
            QUITTER
          </RetroButton>

          {!isHost ? (
            <RetroButton
              onClick={handleToggleReady}
              theme={theme}
              className={`btn-ready-toggle ${myPlayer?.is_ready ? 'is-ready' : 'retro-pulse'}`}
              style={{
                flex: 2,
                fontSize: '14px',
                fontWeight: 'bold'
              }}
            >
              {myPlayer?.is_ready ? '✓ PAS PRÊT' : '🎮 JE SUIS PRÊT !'}
            </RetroButton>
          ) : (
            <RetroButton
              onClick={handleStartGame}
              disabled={players.length < 1 || (players.length > 1 && !allPlayersReady)}
              theme={theme}
              className={`btn-start-game ${!(players.length < 1 || (players.length > 1 && !allPlayersReady)) ? 'retro-pulse' : ''}`}
              style={{
                flex: 2,
                fontSize: '14px',
                fontWeight: 'bold'
              }}
            >
              🚀 COMMENCER !
            </RetroButton>
          )}
        </div>
        {isHost && players.length > 1 && !allPlayersReady && (
          <p style={{ fontSize: '14px', color: '#c21a1a', textAlign: 'center', margin: 0 }}>
            En attente que tous les joueurs soient prêts...
          </p>
        )}
      </div>

      {/* Right Column: Avatar Customization & Live Chat */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Choisir mon avatar box */}
        <RetroBox title="CHOISIR MON AVATAR" theme={theme} className="main-card">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <p style={{ fontSize: '12px', fontFamily: 'var(--font-press-start)', margin: '0 0 4px 0', lineHeight: '1.4', opacity: 0.8 }}>
              Cliquez sur un Pokémon pour changer d'avatar en temps réel :
            </p>
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(5, 1fr)', 
              gap: '8px', 
              maxHeight: '140px', 
              overflowY: 'auto', 
              padding: '8px',
              border: '2px solid var(--border)',
              backgroundColor: 'var(--code-bg)'
            }}>
              {POKEMON_AVATARS.map((p) => {
                const isSelected = myPlayer?.profiles?.avatar_url === p.url
                return (
                  <img
                    key={p.name}
                    src={p.url}
                    alt={p.name}
                    title={p.name}
                    onClick={() => handleAvatarSelect(p.url)}
                    style={{
                      width: '100%',
                      aspectRatio: '1',
                      cursor: 'pointer',
                      imageRendering: 'pixelated',
                      border: isSelected ? '3px solid var(--accent)' : '2px solid var(--border)',
                      backgroundColor: isSelected ? 'var(--accent-bg)' : 'transparent',
                      padding: '2px',
                      boxSizing: 'border-box',
                      transition: 'all 0.1s ease',
                      opacity: avatarLoading ? 0.6 : 1
                    }}
                  />
                )
              })}
            </div>
          </div>
        </RetroBox>

        {/* Live Lobby Chat box */}
        <RetroBox title="TCHAT DU SALON" theme={theme} className="main-card">
          <div style={{ display: 'flex', flexDirection: 'column', height: '280px' }}>
            {/* Messages list */}
            <div 
              ref={chatContainerRef}
              style={{ 
                flex: 1, 
                overflowY: 'auto', 
                display: 'flex', 
                flexDirection: 'column', 
                gap: '8px', 
                padding: '8px', 
                border: '2px solid var(--border)', 
                backgroundColor: 'var(--code-bg)',
                marginBottom: '8px'
              }}
            >
              {chatMessages.length === 0 ? (
                <p style={{ textAlign: 'center', opacity: 0.5, fontSize: '18px', margin: 'auto', fontFamily: 'var(--font-vt323)' }}>
                  Aucun message pour l'instant. Dites bonjour !
                </p>
              ) : (
                chatMessages.map((msg) => {
                  if (msg.isSystem) {
                    return (
                      <div key={msg.id} style={{ 
                        color: 'var(--accent)', 
                        fontSize: '16px', 
                        fontFamily: 'var(--font-vt323)', 
                        padding: '2px 4px', 
                        borderLeft: '3px solid var(--accent)',
                        backgroundColor: 'rgba(139, 172, 15, 0.1)',
                        lineHeight: '1.2'
                      }}>
                        {msg.text}
                      </div>
                    )
                  }
                  return (
                    <div key={msg.id} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                      {msg.avatarUrl ? (
                        <img 
                          src={msg.avatarUrl} 
                          alt="avatar" 
                          style={{ width: '24px', height: '24px', imageRendering: 'pixelated', border: '1px solid var(--border)', flexShrink: 0, backgroundColor: 'var(--bg)' }} 
                        />
                      ) : (
                        <div style={{ width: '24px', height: '24px', border: '1px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', flexShrink: 0 }}>?</div>
                      )}
                      <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                          <span style={{ fontSize: '10px', fontFamily: 'var(--font-press-start)', color: 'var(--text-h)' }}>
                            {msg.username}
                          </span>
                          <span style={{ fontSize: '12px', opacity: 0.5 }}>{msg.timestamp}</span>
                        </div>
                        <p style={{ margin: '2px 0 0 0', fontSize: '20px', fontFamily: 'var(--font-vt323)', wordBreak: 'break-word', lineHeight: '1.2' }}>
                          {msg.text}
                        </p>
                      </div>
                    </div>
                  )
                })
              )}
            </div>

            {/* Input Form */}
            <form onSubmit={sendChatMessage} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <RetroInput 
                  placeholder="Écrire un message..." 
                  value={chatInput} 
                  onChange={(e) => setChatInput(e.target.value)} 
                  style={{ width: '100%' }}
                  theme={theme}
                />
              </div>
              <RetroButton type="submit" theme={theme} style={{ padding: '8px 12px', fontSize: '12px', height: '38px', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                ENVOYER
              </RetroButton>
            </form>
          </div>
        </RetroBox>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 20000,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowSettings(false)
          }}
        >
          <div style={{ width: '90%', maxWidth: '500px' }}>
            <RetroBox title="PARAMÈTRES" theme={theme} className="main-card no-float" style={{ position: 'relative' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {settingsConfig.map(({ key, label, min, max, suffix }) => (
                  <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label
                      style={{
                        fontFamily: 'var(--font-press-start)',
                        fontSize: '12px',
                        color: 'var(--text)',
                      }}
                    >
                      {label}
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="number"
                        min={min}
                        max={max}
                        value={settings[key]}
                        disabled={!(isHost || isAdmin)}
                        onChange={(e) => {
                          const rawVal = e.target.value
                          const newSettings = { ...settings, [key]: rawVal }
                          setSettings(newSettings)

                          const val = parseInt(rawVal, 10)
                          if (!isNaN(val) && val >= min && val <= max) {
                            saveSettings({ ...settings, [key]: val })
                          }
                        }}
                        onBlur={(e) => {
                          let val = parseInt(e.target.value, 10)
                          if (isNaN(val)) val = min
                          if (val < min) val = min
                          if (val > max) val = max
                          const newSettings = { ...settings, [key]: val }
                          setSettings(newSettings)
                          saveSettings(newSettings)
                        }}
                        style={{
                          flex: 1,
                          padding: '8px 12px',
                          fontFamily: 'var(--font-press-start)',
                          fontSize: '14px',
                          backgroundColor: (isHost || isAdmin) ? 'var(--bg)' : 'var(--code-bg)',
                          color: 'var(--text)',
                          border: '3px solid var(--border)',
                          borderRadius: '0',
                          outline: 'none',
                          opacity: (isHost || isAdmin) ? 1 : 0.7,
                          cursor: (isHost || isAdmin) ? 'text' : 'not-allowed',
                        }}
                      />
                      {suffix && (
                        <span style={{ fontFamily: 'var(--font-press-start)', fontSize: '12px', color: 'var(--text)' }}>
                          {suffix}
                        </span>
                      )}
                      <span style={{ fontFamily: 'var(--font-press-start)', fontSize: '9px', color: 'var(--text)', opacity: 0.5 }}>
                        ({min}-{max})
                      </span>
                    </div>
                  </div>
                ))}

                {/* Mode de vote setting */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label
                    style={{
                      fontFamily: 'var(--font-press-start)',
                      fontSize: '12px',
                      color: 'var(--text)',
                    }}
                  >
                    Mode de vote
                  </label>
                  <select
                    value={settings.voting_mode}
                    disabled={!(isHost || isAdmin)}
                    onChange={(e) => {
                      const val = e.target.value
                      const newSettings = { ...settings, voting_mode: val }
                      setSettings(newSettings)
                      saveSettings(newSettings)
                    }}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      fontFamily: 'var(--font-press-start)',
                      fontSize: '11px',
                      backgroundColor: (isHost || isAdmin) ? 'var(--bg)' : 'var(--code-bg)',
                      color: 'var(--text)',
                      border: '3px solid var(--border)',
                      borderRadius: '0',
                      outline: 'none',
                      opacity: (isHost || isAdmin) ? 1 : 0.7,
                      cursor: (isHost || isAdmin) ? 'pointer' : 'not-allowed',
                    }}
                  >
                    <option value="buttons">Boutons (Classique + Pokéball)</option>
                    <option value="slider">Curseur (Note sur 10)</option>
                  </select>
                  
                  <p style={{
                    fontFamily: 'var(--font-press-start)',
                    fontSize: '9px',
                    color: 'var(--text)',
                    opacity: 0.8,
                    lineHeight: '1.4',
                    marginTop: '4px',
                    backgroundColor: 'var(--code-bg)',
                    padding: '8px',
                    border: '1px dashed var(--border)'
                  }}>
                    {settings.voting_mode === 'buttons' 
                      ? "Règles : Boutons 'masterclass' (+1000), 'pas mal' (+400), 'mouais' (0), 'guez' (-500) + 1 Pokéball bonus (+200) par manche."
                      : "Règles : Notez chaque meme de 0 à 10. Chaque point donne +100 points au créateur (ex: 8/10 = +800 points). Pas de Pokéball."
                    }
                  </p>
                </div>

                {!(isHost || isAdmin) && (
                  <p style={{
                    fontFamily: 'var(--font-press-start)',
                    fontSize: '10px',
                    color: '#c21a1a',
                    textAlign: 'center',
                    margin: '4px 0 0 0',
                  }}>
                    Seul l&apos;hôte ou un admin peut modifier les paramètres.
                  </p>
                )}

                <RetroButton
                  onClick={() => setShowSettings(false)}
                  theme={theme}
                  style={{ width: '100%', marginTop: '8px' }}
                >
                  FERMER
                </RetroButton>
              </div>
            </RetroBox>
          </div>
        </div>
      )}
    </div>
  )
}
