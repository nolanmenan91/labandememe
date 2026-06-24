import { useState, useEffect } from 'react'
import { AuthProvider, useAuth } from './context/AuthContext'
import { joinOrCreateGlobalLobby, updateProfileAvatar, getGlobalLobbyPlayers, leaveLobby } from './services/db'
import { supabase } from './supabase'
import './App.css'

// Import Retro UI components
import {
  RetroBox,
  RetroButton,
  RetroInput,
  RetroHeader,
  RetroCrt
} from './components/retro'

// Game components
import ImageZoneEditor from './components/ImageZoneEditor'
import Lobby from './components/Lobby'
import GameScreen from './components/GameScreen'
import AdminPanel from './components/AdminPanel'
import PlayerStatsPanel from './components/PlayerStatsPanel'

// Assets
import heroImg from './assets/chen.png'
import oakDefault from './assets/oak_avatar_default.png'
import oakGen1 from './assets/oak_avatar_gen1.png'
import oakGen1rb from './assets/oak_avatar_gen1rb.png'
import oakGen3 from './assets/oak_avatar_gen3.png'

const POKEMON_AVATARS = [
  { name: 'Bulbizarre', url: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/1.png' },
  { name: 'Salamèche', url: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/4.png' },
  { name: 'Carapuce', url: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/7.png' },
  { name: 'Pikachu', url: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/25.png' },
  { name: 'Rondoudou', url: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/39.png' },
  { name: 'Miaouss', url: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/52.png' },
  { name: 'Psykokwak', url: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/54.png' },
  { name: 'Ectoplasma', url: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/94.png' },
  { name: 'Magicarp', url: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/129.png' },
  { name: 'Léviator', url: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/130.png' },
  { name: 'Metamorph', url: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/132.png' },
  { name: 'Évoli', url: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/133.png' },
  { name: 'Ronflex', url: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/143.png' },
  { name: 'Mewtwo', url: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/150.png' },
  { name: 'Mew', url: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/151.png' },
  { name: 'Carabaffe', url: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/8.png' },
  { name: 'Tortank', url: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/9.png' },
  { name: 'Reptincel', url: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/5.png' },
  { name: 'Dracaufeu', url: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/6.png' },
  { name: 'Herbizarre', url: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/2.png' },
  { name: 'Florizarre', url: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/3.png' }
]

const getOakSpriteForTheme = (currentTheme) => {
  switch (currentTheme) {
    case 'dmg':
      return oakGen1
    case 'red':
    case 'blue':
      return oakGen1rb
    case 'yellow':
      return oakGen1
    default:
      return oakGen3
  }
}

const POKEMON_ANECDOTES = {
  'Bulbizarre': 'Bulbizarre ! Un Pokémon de départ très docile. Il adore faire la sieste au soleil pendant que sa graine grandit !',
  'Salamèche': 'Salamèche ! La flamme au bout de sa queue indique sa santé et sa force. Garde-la toujours bien allumée !',
  'Carapuce': 'Carapuce ! Sa carapace n\'est pas seulement protectrice, elle réduit aussi sa résistance à l\'eau pour nager très vite !',
  'Pikachu': 'Pikachu ! Il stocke de l\'électricité dans ses joues. S\'il est irrité, il peut libérer de puissantes décharges !',
  'Rondoudou': 'Rondoudou ! Ses yeux ronds fascinent sa cible avant qu\'il n\'entonne une douce berceuse qui endort tout le monde !',
  'Miaouss': 'Miaouss ! Il adore tout ce qui brille, en particulier les pièces de monnaie. C\'est un vrai petit rôdeur nocturne !',
  'Psykokwak': 'Psykokwak ! Il est constamment sujet à des maux de tête. Quand la douleur s\'accentue, il utilise d\'étranges pouvoirs psy !',
  'Ectoplasma': 'Ectoplasma ! Il se cache dans l\'ombre pour surprendre ses proies. Si tu ressens un frisson soudain, il est sûrement là !',
  'Magicarp': 'Magicarp ! On dit qu\'il est le Pokémon le plus faible au monde... Pourtant, sa ténacité et son évolution sont légendaires !',
  'Léviator': 'Léviator ! Un Pokémon d\'une brutalité incroyable. Il apparaît dans les récits de tempêtes pour tout détruire !',
  'Metamorph': 'Metamorph ! Il peut modifier sa structure moléculaire pour copier l\'apparence exacte de n\'importe quel Pokémon !',
  'Évoli': 'Évoli ! Son code génétique instable lui permet de s\'adapter et d\'évoluer de huit façons différentes !',
  'Ronflex': 'Ronflex ! Son estomac résiste à toutes les toxines. Il ne s\'arrête de dormir que pour manger des montagnes de nourriture !',
  'Mewtwo': 'Mewtwo ! Créé artificiellement par des scientifiques à partir de Mew. Son cœur est froid et son pouvoir psychique immense !',
  'Mew': 'Mew ! Un Pokémon fabuleux et extrêmement rare. On raconte qu\'il contient l\'ADN originel de tous les Pokémon !',
  'Carabaffe': 'Carabaffe ! Sa queue touffue est très prisée comme symbole de longévité. C\'est un nageur agile et très robuste !',
  'Tortank': 'Tortank ! Les canons à eau sur sa carapace peuvent percer l\'acier trempé. Un colosse des océans !',
  'Reptincel': 'Reptincel ! Il possède un tempérament bagarreur. Au combat, il lacère ses ennemis avec ses griffes acérées !',
  'Dracaufeu': 'Dracaufeu ! Ses ailes lui permettent de voler très haut. Il crache un feu si chaud qu\'il peut faire fondre la roche !',
  'Herbizarre': 'Herbizarre ! La force de ses pattes soutient le bourgeon sur son dos. Quand il est prêt à fleurir, il dégage un parfum doux !',
  'Florizarre': 'Florizarre ! Sa fleur s\'épanouit sous le soleil. Le parfum qui s\'en dégage apaise les Pokémon alentour.'
}


function AppContent() {
  const { user, profile, loading, login, signUp, logout, isAdmin, refreshProfile } = useAuth()
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('theme') || 'blueblack'
  })
  const [designMode, setDesignMode] = useState(() => {
    return localStorage.getItem('designMode') || 'retro'
  })
  const [enableCrt, setEnableCrt] = useState(false)
  const [avatarLoading, setAvatarLoading] = useState(false)
  const [oakReaction, setOakReaction] = useState(null)

  const handleAvatarSelect = async (avatarUrl) => {
    if (avatarLoading) return
    setAvatarLoading(true)
    try {
      await updateProfileAvatar(user.id, avatarUrl)
      await refreshProfile()
      
      const pokemon = POKEMON_AVATARS.find(p => p.url === avatarUrl)
      const pokemonName = pokemon ? pokemon.name : ''
      const anecdote = POKEMON_ANECDOTES[pokemonName] || `C'est un Pokémon fascinant, n'est-ce pas ?`
      
      setOakReaction({
        text: `CHEN : Oh ! Tu as choisi ${pokemonName.toUpperCase()} ! ${anecdote}`,
        sprite: getOakSpriteForTheme(theme)
      })
    } catch (err) {
      console.error('Failed to update avatar:', err)
    } finally {
      setAvatarLoading(false)
    }
  }

  const handleThemeChange = (newTheme) => {
    setTheme(newTheme)
    localStorage.setItem('theme', newTheme)
    let text
    let sprite
    switch (newTheme) {
      case 'blueblack':
        text = "CHEN : L'édition BLUE & BLACK ! Un thème sombre et confortable, parfait pour les longues sessions de mèmes !"
        sprite = oakGen1rb
        break
      case 'dmg':
        text = "CHEN : Oh, la nostalgie de la Game Boy originale (DMG-01) ! Quel affichage magnifique !"
        sprite = oakGen1
        break
      case 'red':
        text = "CHEN : La version ROUGE ! Prépare-toi à une aventure intense à nos côtés !"
        sprite = oakGen1rb
        break
      case 'blue':
        text = "CHEN : La version BLEUE ! Une aventure gravée dans nos mémoires de Dresseur !"
        sprite = oakGen1rb
        break
      case 'yellow':
        text = "CHEN : La version JAUNE ! L'édition spéciale où Pikachu marche à tes côtés !"
        sprite = oakGen1
        break
      case 'black':
        text = "CHEN : La version NOIRE ! Une obscurité absolue pour un style sobre, moderne et ultra-minimaliste !"
        sprite = oakGen3
        break
      default:
        text = "CHEN : Le style CLASSIQUE ! Idéal pour la création de mèmes modernes et épurés !"
        sprite = oakGen3
        break
    }
    setOakReaction({ text, sprite })
  }

  const handleDesignModeChange = (newMode) => {
    setDesignMode(newMode)
    localStorage.setItem('designMode', newMode)
    let text
    let sprite = getOakSpriteForTheme(theme)
    if (newMode === 'minimalist') {
      text = "CHEN : Le style MINIMALISTE ! Un design épuré, classique et moderne pour naviguer avec élégance !"
    } else if (newMode === 'glass') {
      text = "CHEN : Le style LIQUID GLASS ! Une interface futuriste en verre dépoli avec de magnifiques effets de lumière et lueurs néon !"
    } else {
      text = "CHEN : Le style RÉTRO ! La puissance des pixels et des consoles d'époque !"
    }
    setOakReaction({ text, sprite })
  }

  const handleDesignModeCycle = () => {
    let nextMode = 'retro'
    if (designMode === 'retro') nextMode = 'minimalist'
    else if (designMode === 'minimalist') nextMode = 'glass'
    else nextMode = 'retro'
    handleDesignModeChange(nextMode)
  }

  const getDesignModeButtonLabel = () => {
    if (designMode === 'retro') return '✨ MINIMALISTE'
    if (designMode === 'minimalist') return '🔮 GLASS'
    return '👾 RÉTRO'
  }

  const handleTabChange = (tab) => {
    setActiveTab(tab)
    const username = profile?.username?.toUpperCase() || 'DRESSEUR'
    let text = ""
    let sprite = getOakSpriteForTheme(theme)
    if (tab === 'play') {
      const playerCount = onlinePlayers.length
      if (playerCount === 0) {
        text = `CHEN : Prêt à jouer, ${username} ? Rejoins le salon unique ! Aucun autre dresseur n'est en ligne, parfait pour s'entraîner !`
      } else {
        text = `CHEN : Prêt à jouer, ${username} ? Il y a actuellement ${playerCount} dresseur${playerCount > 1 ? 's' : ''} en ligne pour t'affronter !`
      }
      sprite = theme === 'default' ? oakGen3 : getOakSpriteForTheme(theme)
    } else if (tab === 'stats') {
      text = `CHEN : Regarde ça, ${username} ! Voici le tableau des scores et des exploits de tous les dresseurs ! Qui sera le meilleur ?`
      sprite = theme === 'default' ? oakDefault : getOakSpriteForTheme(theme)
    } else if (tab === 'upload') {
      text = `CHEN : Quel modèle de mème veux-tu créer, ${username} ? Choisis une image et définis les zones de texte !`
      sprite = theme === 'default' ? oakDefault : getOakSpriteForTheme(theme)
    } else if (tab === 'moderate') {
      text = `CHEN : Ah, l'espace de modération ! Veillons ensemble à ce que le salon reste convivial et propre.`
      sprite = theme === 'default' ? oakGen1rb : getOakSpriteForTheme(theme)
    }
    setOakReaction({ text, sprite })

    if (window.innerWidth <= 768) {
      document.getElementById('center')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  // Auth Flow State
  const [introStage, setIntroStage] = useState(0) // 0: Greeting, 1: Intro2, 2: Decision, 3: Login, 4: Register
  const [authPassword, setAuthPassword] = useState('')
  const [authUsername, setAuthUsername] = useState('')
  const [authRole, setAuthRole] = useState('player') // 'player' or 'creator'
  const [authError, setAuthError] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  // Dashboard / Active game State
  const [activeTab, setActiveTab] = useState('play') // 'play', 'upload', 'moderate'
  const [activeLobby, setActiveLobby] = useState(null)
  const [lobbyError, setLobbyError] = useState('')
  const [lobbyLoading, setLobbyLoading] = useState(false)
  const [onlinePlayers, setOnlinePlayers] = useState([])

  // Cleanup any existing player record for this user when App mounts or user changes
  useEffect(() => {
    if (!user || activeLobby) return

    const cleanupOwnStaleRecord = async () => {
      try {
        await supabase
          .from('players')
          .delete()
          .eq('profile_id', user.id)
      } catch (err) {
        console.error('Error cleaning up own stale player records:', err)
      }
    }

    cleanupOwnStaleRecord()
  }, [user, activeLobby])

  // Handle beforeunload to clean up player row when tab/browser is closed
  useEffect(() => {
    if (!activeLobby || !user) return

    const handleBeforeUnload = () => {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
      if (supabaseUrl && supabaseKey) {
        const url = `${supabaseUrl}/rest/v1/players?lobby_id=eq.${activeLobby.id}&profile_id=eq.${user.id}`
        fetch(url, {
          method: 'DELETE',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
          },
          keepalive: true
        })
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [activeLobby, user])

  // Heartbeat to update player's last_seen_at status and clean up stale players globally
  useEffect(() => {
    if (!user) return

    const runHeartbeat = async () => {
      try {
        // 1. If in a lobby, update own last_seen_at timestamp
        if (activeLobby) {
          await supabase
            .from('players')
            .update({ last_seen_at: new Date().toISOString() })
            .eq('lobby_id', activeLobby.id)
            .eq('profile_id', user.id)
        }

        // 2. Trigger RPC to clean up any stale players across the game
        await supabase.rpc('clean_stale_players')
      } catch (err) {
        console.error('Error in presence heartbeat:', err)
      }
    }

    // Run heartbeat immediately
    runHeartbeat()

    // Send heartbeat every 10 seconds (10000ms)
    const interval = setInterval(runHeartbeat, 10000)

    return () => {
      clearInterval(interval)
    }
  }, [activeLobby, user])


  // Fetch online players on dashboard (for the play tab)
  useEffect(() => {
    if (!user || activeTab !== 'play' || activeLobby) return

    let isMounted = true

    const fetchOnlinePlayers = async () => {
      try {
        const playersList = await getGlobalLobbyPlayers()
        if (isMounted) {
          setOnlinePlayers(playersList)
        }
      } catch (err) {
        console.error('Error fetching online players:', err)
      }
    }

    setTimeout(() => {
      fetchOnlinePlayers()
    }, 0)

    // Subscribe to player updates
    const channel = supabase
      .channel('dashboard-players')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'players',
        },
        () => {
          fetchOnlinePlayers()
        }
      )
      .subscribe()

    return () => {
      isMounted = false
      supabase.removeChannel(channel)
    }
  }, [user, activeTab, activeLobby])

  // Handle setting the theme class directly on the root element and body
  useEffect(() => {
    const rootEl = document.getElementById('root')
    const allThemeClasses = ['theme-blueblack', 'theme-dmg', 'theme-red', 'theme-blue', 'theme-yellow', 'theme-black']
    const allDesignClasses = ['design-retro', 'design-minimalist', 'design-glass']
    if (rootEl) {
      rootEl.classList.remove(...allThemeClasses)
      document.body.classList.remove(...allThemeClasses)
      if (theme !== 'default') {
        rootEl.classList.add(`theme-${theme}`)
        document.body.classList.add(`theme-${theme}`)
      }

      rootEl.classList.remove(...allDesignClasses)
      document.body.classList.remove(...allDesignClasses)
      rootEl.classList.add(`design-${designMode}`)
      document.body.classList.add(`design-${designMode}`)
    }
  }, [theme, designMode])

  // Login handler
  const handleLogin = async (e) => {
    e.preventDefault()
    if (!authUsername || !authPassword) {
      setAuthError('Veuillez remplir tous les champs.')
      return
    }
    setAuthLoading(true)
    setAuthError('')
    const { error } = await login(authUsername, authPassword)
    setAuthLoading(false)
    if (error) {
      setAuthError(error.message || 'Identifiants incorrects.')
    }
  }

  // Register handler
  const handleRegister = async (e) => {
    e.preventDefault()
    if (!authPassword || !authUsername) {
      setAuthError('Veuillez remplir tous les champs.')
      return
    }
    if (authUsername.length > 12) {
      setAuthError('Nom trop long ! Max 12 caractères.')
      return
    }
    setAuthLoading(true)
    setAuthError('')
    const { error } = await signUp(authUsername, authPassword, authRole)
    setAuthLoading(false)
    if (error) {
      setAuthError(error.message || "Erreur lors de l'inscription.")
    } else {
      // Direct message to log in after signing up successfully
      setAuthError("Compte créé ! Connectez-vous à l'étape précédente.")
      setIntroStage(3)
    }
  }

  // Join Global Lobby
  const handleJoinGlobalLobby = async () => {
    setLobbyLoading(true)
    setLobbyError('')
    try {
      const { lobby } = await joinOrCreateGlobalLobby(user.id)
      setActiveLobby(lobby)
    } catch (err) {
      console.error(err)
      setLobbyError(err.message || 'Impossible de rejoindre le salon.')
    } finally {
      setLobbyLoading(false)
    }
  }

  const handleGameStarted = (updatedLobby) => {
    setActiveLobby(updatedLobby)
  }

  const handleLeaveLobby = async () => {
    if (activeLobby && user) {
      try {
        await leaveLobby(activeLobby.id, user.id)
      } catch (err) {
        console.error('Error leaving lobby:', err)
      }
    }
    setActiveLobby(null)
  }

  const handleKickPlayer = async (lobbyId, playerProfileId) => {
    try {
      const { error } = await supabase.rpc('kick_player', {
        p_lobby_id: lobbyId,
        p_profile_id: playerProfileId
      })
      
      if (error) {
        // If the function doesn't exist in the schema cache, try to delete directly.
        // This will succeed for the lobby creator due to Row Level Security policies.
        if (error.message && error.message.includes('Could not find the function')) {
          console.warn('kick_player RPC not found. Falling back to direct database delete.')
          const { error: deleteError } = await supabase
            .from('players')
            .delete()
            .eq('lobby_id', lobbyId)
            .eq('profile_id', playerProfileId)
          
          if (deleteError) throw deleteError
        } else {
          throw error
        }
      }
      
      // Refresh the online players list immediately
      const playersList = await getGlobalLobbyPlayers()
      setOnlinePlayers(playersList)
    } catch (err) {
      console.error('Error kicking player:', err)
      alert("Impossible d'exclure le joueur : " + err.message)
    }
  }

  const handleLobbyUpdate = (updatedLobby) => {
    setActiveLobby(prev => ({ ...prev, ...updatedLobby }))
  }

  // Loading Session State
  if (loading) {
    return (
      <>
        <RetroCrt scanlines={enableCrt} flicker={enableCrt} vignette={enableCrt} />
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
          <p style={{ fontFamily: 'var(--font-press-start)' }}>DÉMARRAGE DE LA CONSOLE...</p>
        </div>
      </>
    )
  }

  // ============================================================================
  // RENDER INTRO SEQUENCE (PROFESSOR OAK STYLE)
  // ============================================================================
  if (!user) {
    return (
      <>
        <RetroCrt scanlines={enableCrt} flicker={enableCrt} vignette={enableCrt} />
        <RetroHeader title="LA BANDE MEME" subtitle="VITE x REACT RETRO STYLER" theme={theme} />

        <section id="center" style={{ display: 'flex', flexDirection: 'column', gap: '20px', alignItems: 'center' }}>
          <div className="hero">
            <img src={heroImg} className="base" width="170" height="179" alt="Professeur Chen" />
          </div>

          <div style={{ width: '100%', maxWidth: '600px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {introStage === 0 && (
              <RetroBox title="PROF. CHEN" theme={theme} hasCursor={true} onClick={() => setIntroStage(1)}>
                <p style={{ margin: 0, fontSize: '22px', lineHeight: '1.5' }}>
                  CHEN : Bonjour ! Bienvenue dans le monde merveilleux de LA BANDE MÈME ! Mon nom est CHEN.
                  <span style={{ display: 'block', fontSize: '12px', color: '#666', marginTop: '10px', textAlign: 'right' }}>
                    (Cliquez sur la boîte pour continuer)
                  </span>
                </p>
              </RetroBox>
            )}

            {introStage === 1 && (
              <RetroBox title="PROF. CHEN" theme={theme} hasCursor={true} onClick={() => setIntroStage(3)}>
                <p style={{ margin: 0, fontSize: '22px', lineHeight: '1.5' }}>
                  CHEN : Ici, les Dresseurs s'affrontent à coups de mèmes pixelisés hilarants en temps réel !
                  <span style={{ display: 'block', fontSize: '12px', color: '#666', marginTop: '10px', textAlign: 'right' }}>
                    (Cliquez sur la boîte pour continuer)
                  </span>
                </p>
              </RetroBox>
            )}

            {introStage === 2 && (
              <RetroBox title="PROF. CHEN" theme={theme}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  <p style={{ margin: 0, fontSize: '22px', lineHeight: '1.5' }}>
                    CHEN : Tout d'abord, dis-moi... Es-tu prêt à entrer dans la compétition ?
                  </p>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <RetroButton theme={theme} style={{ flex: 1 }} onClick={() => { setIntroStage(3); setAuthError(''); }}>
                      SE CONNECTER
                    </RetroButton>
                    <RetroButton theme={theme} style={{ flex: 1 }} onClick={() => { setIntroStage(4); setAuthError(''); }}>
                      S'INSCRIRE
                    </RetroButton>
                  </div>
                </div>
              </RetroBox>
            )}

            {introStage === 3 && (
              <RetroBox title="CONNEXION DRESSEUR" theme={theme}>
                <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  {authError && (
                    <div style={{ color: '#c21a1a', border: '2px solid #c21a1a', padding: '6px', fontSize: '12px', fontFamily: 'var(--font-press-start)' }}>
                      [ERREUR] {authError}
                    </div>
                  )}

                  <RetroInput
                    label="NOM DE DRESSEUR"
                    type="text"
                    value={authUsername}
                    onChange={(e) => setAuthUsername(e.target.value)}
                    placeholder="Saisir nom de dresseur..."
                    theme={theme}
                  />

                  <div style={{ position: 'relative' }}>
                    <RetroInput
                      label="MOT DE PASSE"
                      type={showPassword ? 'text' : 'password'}
                      value={authPassword}
                      onChange={(e) => setAuthPassword(e.target.value)}
                      placeholder="Saisir mot de passe..."
                      theme={theme}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(v => !v)}
                      style={{
                        position: 'absolute',
                        right: '10px',
                        bottom: '10px',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: '2px',
                        display: 'flex',
                        alignItems: 'center',
                        color: 'var(--text)',
                        opacity: 0.7,
                        fontSize: '20px',
                        lineHeight: 1,
                      }}
                      title={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                    >
                      {showPassword ? '🙈' : '👁️'}
                    </button>
                  </div>

                  <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                    <RetroButton theme={theme} style={{ flex: 1 }} onClick={() => setIntroStage(1)}>
                      RETOUR
                    </RetroButton>
                    <RetroButton theme={theme} style={{ flex: 2 }} type="submit" disabled={authLoading}>
                      {authLoading ? 'CONNEXION...' : 'ENTRER'}
                    </RetroButton>
                  </div>
                </form>
              </RetroBox>
            )}

            {introStage === 4 && (
              <RetroBox title="NOUVEL ENREGISTREMENT" theme={theme}>
                <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                  {authError && (
                    <div style={{ color: '#c21a1a', border: '2px solid #c21a1a', padding: '6px', fontSize: '12px', fontFamily: 'var(--font-press-start)' }}>
                      {authError.includes('[ERREUR]') || authError.includes('Compte créé') ? authError : `[ERREUR] ${authError}`}
                    </div>
                  )}

                  <RetroInput
                    label="NOM DE DRESSEUR"
                    type="text"
                    value={authUsername}
                    onChange={(e) => setAuthUsername(e.target.value)}
                    placeholder="Ex: RED, GREEN..."
                    theme={theme}
                  />

                  <RetroInput
                    label="MOT DE PASSE"
                    type="password"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    placeholder="Saisir mot de passe..."
                    theme={theme}
                  />

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '16px', fontFamily: 'var(--font-press-start)' }}>CHOIX DU RÔLE :</label>
                    <select
                      value={authRole}
                      onChange={(e) => setAuthRole(e.target.value)}
                      style={{
                        padding: '10px',
                        fontSize: '18px',
                        fontFamily: 'var(--font-vt323)',
                        border: '4px solid var(--border)',
                        backgroundColor: 'var(--retro-box-bg)',
                        color: 'var(--text)',
                      }}
                    >
                      <option value="player">JOUEUR (NORMAL)</option>
                      <option value="creator">CRÉATEUR (MODÉRATEUR/ADMIN)</option>
                    </select>
                  </div>

                  <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                    <RetroButton theme={theme} style={{ flex: 1 }} onClick={() => setIntroStage(2)}>
                      RETOUR
                    </RetroButton>
                    <RetroButton theme={theme} style={{ flex: 2 }} type="submit" disabled={authLoading}>
                      {authLoading ? 'CRÉATION...' : 'CRÉER DRESSEUR'}
                    </RetroButton>
                  </div>
                  <div style={{ textAlign: 'center', marginTop: '15px' }}>
                    <span 
                      onClick={() => { setIntroStage(3); setAuthError(''); }}
                      style={{ fontSize: '14px', textDecoration: 'underline', cursor: 'pointer', opacity: 0.8 }}
                    >
                      Déjà dresseur ? Se connecter
                    </span>
                  </div>
                </form>
              </RetroBox>
            )}

            {/* Design & Version Selectors inside Intro */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '24px', alignItems: 'center' }}>
              {/* Selector Style de Design */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
                <span style={{ fontSize: '10px', fontFamily: 'var(--font-press-start)', color: 'var(--text-h)', textTransform: 'uppercase' }}>
                  STYLE VISUEL
                </span>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
                  <RetroButton 
                    onClick={() => handleDesignModeChange('retro')} 
                    theme={theme}
                    style={designMode === 'retro' ? { outline: '3px dotted var(--border)', fontWeight: 'bold' } : { opacity: 0.6 }}
                  >
                    👾 RÉTRO
                  </RetroButton>
                  <RetroButton 
                    onClick={() => handleDesignModeChange('minimalist')} 
                    theme={theme}
                    style={designMode === 'minimalist' ? { outline: '3px dotted var(--border)', fontWeight: 'bold' } : { opacity: 0.6 }}
                  >
                    ✨ MINIMALISTE
                  </RetroButton>
                  <RetroButton 
                    onClick={() => handleDesignModeChange('glass')} 
                    theme={theme}
                    style={designMode === 'glass' ? { outline: '3px dotted var(--border)', fontWeight: 'bold' } : { opacity: 0.6 }}
                  >
                    🔮 GLASS
                  </RetroButton>
                </div>
              </div>

              {/* Selector Version de Couleur */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
                <span style={{ fontSize: '10px', fontFamily: 'var(--font-press-start)', color: 'var(--text-h)', textTransform: 'uppercase' }}>
                  VERSION DE COULEUR
                </span>
                <div className="theme-selector-container" style={{ margin: 0, justifyContent: 'center' }}>
                  <RetroButton onClick={() => handleThemeChange('blueblack')} theme="blueblack" style={theme === 'blueblack' ? { outline: '4px dotted #3b82f6' } : {}}>
                    ✦ BLUE & BLACK
                  </RetroButton>
                  <RetroButton onClick={() => handleThemeChange('black')} theme="black" style={theme === 'black' ? { outline: '4px dotted #ffffff' } : {}}>
                    ✦ BLACK EDITION
                  </RetroButton>
                  <RetroButton onClick={() => handleThemeChange('default')} theme="default" style={theme === 'default' ? { outline: '4px dotted var(--border)' } : {}}>
                    CLASSIC
                  </RetroButton>
                  <RetroButton onClick={() => handleThemeChange('dmg')} theme="dmg" style={theme === 'dmg' ? { outline: '4px dotted var(--border)' } : {}}>
                    DMG GREEN
                  </RetroButton>
                  <RetroButton onClick={() => handleThemeChange('red')} theme="red" style={theme === 'red' ? { outline: '4px dotted var(--border)' } : {}}>
                    RED
                  </RetroButton>
                  <RetroButton onClick={() => handleThemeChange('blue')} theme="blue" style={theme === 'blue' ? { outline: '4px dotted var(--border)' } : {}}>
                    BLUE
                  </RetroButton>
                  <RetroButton onClick={() => handleThemeChange('yellow')} theme="yellow" style={theme === 'yellow' ? { outline: '4px dotted var(--border)' } : {}}>
                    YELLOW
                  </RetroButton>
                </div>
              </div>
            </div>
          </div>
        </section>
      </>
    )
  }

  // ============================================================================
  // RENDER ACTIVE GAME SCREEN
  // ============================================================================
  if (activeLobby) {
    return (
      <>
        <RetroCrt scanlines={enableCrt} flicker={enableCrt} vignette={enableCrt} />
        <RetroHeader title={`SALON: ${activeLobby.code}`} subtitle={`STATUT: ${activeLobby.status.toUpperCase()}`} theme={theme}>
          <button 
            className="retro-btn" 
            onClick={handleDesignModeCycle} 
            style={{ fontSize: '14px', marginRight: '10px' }}
          >
            {getDesignModeButtonLabel()}
          </button>
          {designMode === 'retro' && (
            <button className="retro-btn" onClick={() => setEnableCrt(!enableCrt)} style={{ fontSize: '14px' }}>
              CRT {enableCrt ? 'ON' : 'OFF'}
            </button>
          )}
          <button 
            className="retro-btn" 
            onClick={() => {
              if (window.confirm("Quitter le salon de jeu ?")) {
                handleLeaveLobby()
              }
            }}
            style={{ fontSize: '14px', marginLeft: '10px', backgroundColor: '#c21a1a', color: '#fff' }}
          >
            🚪 QUITTER
          </button>
        </RetroHeader>

        <section id="center" style={{ padding: '20px 10px' }}>
          {activeLobby.status === 'lobby' ? (
            <Lobby
              lobby={activeLobby}
              onLeave={handleLeaveLobby}
              onGameStart={handleGameStarted}
              onLobbyUpdate={handleLobbyUpdate}
              theme={theme}
            />
          ) : (
            <GameScreen
              lobby={activeLobby}
              onLeave={handleLeaveLobby}
              onLobbyUpdate={handleLobbyUpdate}
              theme={theme}
            />
          )}
        </section>
      </>
    )
  }

  // ============================================================================
  // RENDER DASHBOARD (MAIN PANEL)
  // ============================================================================
  const headerNav = [
    { label: 'JOUER', onClick: () => handleTabChange('play'), active: activeTab === 'play' },
    { label: 'CLASSEMENT', onClick: () => handleTabChange('stats'), active: activeTab === 'stats' },
    { label: 'CRÉER MODÈLE', onClick: () => handleTabChange('upload'), active: activeTab === 'upload' },
    ...(isAdmin ? [{ label: 'MODÉRATION', onClick: () => handleTabChange('moderate'), active: activeTab === 'moderate' }] : []),
  ]

  return (
    <>
      <RetroCrt scanlines={enableCrt} flicker={enableCrt} vignette={enableCrt} />
      <RetroHeader title="LA BANDE MEME" subtitle="TABLEAU DE BORD" navItems={headerNav} theme={theme}>
        <button 
          className="retro-btn" 
          onClick={handleDesignModeCycle} 
          style={{ fontSize: '14px', marginRight: '10px' }}
        >
          {getDesignModeButtonLabel()}
        </button>
        {designMode === 'retro' && (
          <button className="retro-btn" onClick={() => setEnableCrt(!enableCrt)} style={{ fontSize: '14px', marginRight: '10px' }}>
            CRT {enableCrt ? 'ON' : 'OFF'}
          </button>
        )}
        <button className="retro-btn" onClick={logout} style={{ fontSize: '14px', backgroundColor: '#c21a1a', color: '#fff' }}>
          DÉCONNEXION
        </button>
      </RetroHeader>

      <section id="center" style={{ display: 'flex', flexDirection: 'column', gap: '20px', padding: '20px 10px', width: '100%', maxWidth: '1200px', margin: '0 auto', boxSizing: 'border-box' }}>
        
        {/* Professor Oak Area with Speech Bubble */}
        <div className="oak-area-wrapper" style={{ display: 'flex', gap: '24px', alignItems: 'center', width: '100%', boxSizing: 'border-box', margin: '10px 0' }}>
          {/* Sprite & Name Badge */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            <img 
              className="oak-avatar-img"
              src={oakReaction?.sprite || getOakSpriteForTheme(theme)} 
              alt="Professeur Chen" 
              style={{ 
                width: '80px', 
                height: '80px', 
                imageRendering: 'pixelated', 
                border: '4px solid var(--border)',
                backgroundColor: 'var(--bg)',
                padding: '4px',
                boxShadow: '4px 4px 0px var(--border)',
                flexShrink: 0
              }} 
            />
            <span className="oak-badge" style={{ 
              fontFamily: 'var(--font-press-start)', 
              fontSize: '10px', 
              textTransform: 'uppercase', 
              border: '2px solid var(--border)', 
              padding: '4px 8px', 
              background: 'var(--bg)', 
              boxShadow: '2px 2px 0px var(--border)',
              whiteSpace: 'nowrap'
            }}>
              PROF. CHEN
            </span>
          </div>

          {/* Speech Bubble */}
          <div className="retro-speech-bubble" style={{ flexGrow: 1, position: 'relative' }}>
            <RetroBox theme={theme} style={{ width: '100%', boxSizing: 'border-box' }}>
              <p style={{ margin: 0, fontSize: '22px', fontFamily: 'var(--font-vt323)', lineHeight: '1.4', wordBreak: 'break-word' }}>
                {oakReaction?.text || (profile?.username 
                  ? `CHEN : Bonjour ${profile.username.toUpperCase()} ! Prêt à rejoindre le salon de mèmes et défier d'autres Dresseurs ?`
                  : "Bienvenue dans le salon, Dresseur ! Es-tu prêt à créer quelques mèmes légendaires ?")}
              </p>
            </RetroBox>
          </div>
        </div>

        {/* Existing Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '20px', width: '100%', boxSizing: 'border-box' }} className="editor-grid">
          {/* Left card: Trainer summary */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }} className="dashboard-sidebar">
            <RetroBox title="CARTE DRESSEUR" theme={theme}>
              <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                {profile?.avatar_url ? (
                  <img 
                    src={profile.avatar_url} 
                    alt="Avatar" 
                    style={{ 
                      width: '70px', 
                      height: '70px', 
                      imageRendering: 'pixelated', 
                      border: '4px solid var(--border)',
                      backgroundColor: 'var(--bg)',
                      padding: '2px',
                      flexShrink: 0
                    }} 
                  />
                ) : (
                  <div 
                    style={{ 
                      width: '70px', 
                      height: '70px', 
                      border: '4px dashed var(--border)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '16px',
                      fontFamily: 'var(--font-press-start)',
                      backgroundColor: 'var(--code-bg)',
                      flexShrink: 0
                    }}
                  >
                    ?
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ fontSize: '22px', fontFamily: 'var(--font-press-start)', wordBreak: 'break-all', lineHeight: '1.2' }}>
                    {profile?.username?.toUpperCase() || 'DRESSEUR'}
                  </div>
                  <div style={{ fontSize: '14px', lineHeight: '1.3' }}>
                    <div>RÔLE: {profile?.role === 'creator' ? 'CRÉATEUR' : 'JOUEUR'}</div>
                    <div style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>ID: {user.email}</div>
                  </div>
                </div>
              </div>
            </RetroBox>

            <RetroBox title="CHOISIR MON AVATAR" theme={theme}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px', maxHeight: '180px', overflowY: 'auto', padding: '4px' }}>
                {POKEMON_AVATARS.map((p) => (
                  <img
                    key={p.name}
                    src={p.url}
                    alt={p.name}
                    title={p.name}
                    onClick={() => handleAvatarSelect(p.url)}
                    style={{
                      width: '36px',
                      height: '36px',
                      cursor: 'pointer',
                      imageRendering: 'pixelated',
                      border: profile?.avatar_url === p.url ? '3px solid var(--accent)' : '2px solid var(--border)',
                      backgroundColor: profile?.avatar_url === p.url ? 'var(--accent-bg)' : 'transparent',
                      padding: '2px',
                      transition: 'all 0.1s ease',
                      opacity: avatarLoading ? 0.6 : 1
                    }}
                  />
                ))}
              </div>
            </RetroBox>

            <RetroBox title="ÉDITIONS & STYLE DE JEU" theme={theme}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                {/* Design Mode Selection */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span style={{ fontSize: '10px', fontFamily: 'var(--font-press-start)', color: 'var(--text-h)', textTransform: 'uppercase' }}>
                    STYLE VISUEL
                  </span>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <RetroButton 
                      onClick={() => handleDesignModeChange('retro')} 
                      theme={theme}
                      style={{ flex: '1 1 60px', padding: '8px 4px', fontSize: '10px', ...(designMode === 'retro' ? { outline: '3px dotted var(--border)' } : { opacity: 0.7 }) }}
                    >
                      👾 RÉTRO
                    </RetroButton>
                    <RetroButton 
                      onClick={() => handleDesignModeChange('minimalist')} 
                      theme={theme}
                      style={{ flex: '1 1 60px', padding: '8px 4px', fontSize: '10px', ...(designMode === 'minimalist' ? { outline: '3px dotted var(--border)' } : { opacity: 0.7 }) }}
                    >
                      ✨ MINI
                    </RetroButton>
                    <RetroButton 
                      onClick={() => handleDesignModeChange('glass')} 
                      theme={theme}
                      style={{ flex: '1 1 60px', padding: '8px 4px', fontSize: '10px', ...(designMode === 'glass' ? { outline: '3px dotted var(--border)' } : { opacity: 0.7 }) }}
                    >
                      🔮 GLASS
                    </RetroButton>
                  </div>
                </div>

                <div style={{ borderTop: '2px dashed var(--border)', margin: '5px 0' }} />

                {/* Color Theme Selection */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span style={{ fontSize: '10px', fontFamily: 'var(--font-press-start)', color: 'var(--text-h)', textTransform: 'uppercase' }}>
                    VERSION DE COULEUR
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <RetroButton onClick={() => handleThemeChange('blueblack')} theme="blueblack" style={theme === 'blueblack' ? { outline: '3px dotted #3b82f6' } : {}}>
                      ✦ BLUE & BLACK
                    </RetroButton>
                    <RetroButton onClick={() => handleThemeChange('black')} theme="black" style={theme === 'black' ? { outline: '3px dotted #ffffff' } : {}}>
                      ✦ BLACK EDITION
                    </RetroButton>
                    <RetroButton onClick={() => handleThemeChange('default')} theme="default" style={theme === 'default' ? { outline: '4px dotted var(--border)' } : {}}>
                      CLASSIC
                    </RetroButton>
                    <RetroButton onClick={() => handleThemeChange('dmg')} theme="dmg" style={theme === 'dmg' ? { outline: '4px dotted var(--border)' } : {}}>
                      DMG GREEN
                    </RetroButton>
                    <RetroButton onClick={() => handleThemeChange('red')} theme="red" style={theme === 'red' ? { outline: '4px dotted var(--border)' } : {}}>
                      RED VERSION
                    </RetroButton>
                    <RetroButton onClick={() => handleThemeChange('blue')} theme="blue" style={theme === 'blue' ? { outline: '4px dotted var(--border)' } : {}}>
                      BLUE VERSION
                    </RetroButton>
                    <RetroButton onClick={() => handleThemeChange('yellow')} theme="yellow" style={theme === 'yellow' ? { outline: '4px dotted var(--border)' } : {}}>
                      YELLOW
                    </RetroButton>
                  </div>
                </div>
              </div>
            </RetroBox>
          </div>

          {/* Right card: Active Tab content */}
          <div className="dashboard-content">
            {activeTab === 'play' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <RetroBox title="REJOINDRE LE SALON" theme={theme}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', alignItems: 'center', padding: '10px 0' }}>
                    <div style={{ position: 'relative', width: '100%', display: 'flex', flexDirection: 'column', gap: '20px', alignItems: 'center' }}>


                      {lobbyError && (
                        <div style={{ color: '#c21a1a', border: '2px solid #c21a1a', padding: '6px', fontSize: '12px', fontFamily: 'var(--font-press-start)', width: '100%', boxSizing: 'border-box' }}>
                          [ERREUR] {lobbyError}
                        </div>
                      )}

                      <p style={{ fontSize: '18px', textAlign: 'center', margin: '5px 0', fontFamily: 'var(--font-vt323)' }}>
                        Cliquez ci-dessous pour vous connecter au salon unique et jouer avec les autres dresseurs !
                      </p>

                      <RetroButton onClick={handleJoinGlobalLobby} disabled={lobbyLoading} theme={theme} style={{ width: '100%' }}>
                        {lobbyLoading ? 'CONNEXION...' : 'REJOINDRE LE SALON'}
                      </RetroButton>
                    </div>

                    <div style={{ width: '100%', borderTop: '2px dashed var(--border)', paddingTop: '15px', marginTop: '10px' }}>
                      <div style={{ fontSize: '14px', fontFamily: 'var(--font-press-start)', marginBottom: '10px', textAlign: 'center' }}>
                        DRESSEURS EN LIGNE ({onlinePlayers.length})
                      </div>
                      {onlinePlayers.length === 0 ? (
                        <p style={{ textAlign: 'center', fontSize: '18px', color: '#666', fontStyle: 'italic', margin: 0, fontFamily: 'var(--font-vt323)' }}>
                          Aucun dresseur n'est connecté pour le moment.
                        </p>
                      ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '10px', width: '100%' }}>
                          {onlinePlayers.map((plyr) => (
                            <div
                              key={plyr.id}
                              style={{
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '8px',
                                border: '2px solid var(--border)',
                                backgroundColor: 'var(--bg)',
                                textAlign: 'center',
                                overflow: 'hidden'
                              }}
                            >
                              {plyr.profiles?.avatar_url ? (
                                <img
                                  src={plyr.profiles.avatar_url}
                                  alt="Avatar"
                                  style={{
                                    width: '45px',
                                    height: '45px',
                                    imageRendering: 'pixelated',
                                    border: '2px solid var(--border)',
                                    backgroundColor: 'var(--retro-box-bg)',
                                    padding: '1px'
                                  }}
                                />
                              ) : (
                                <div
                                  style={{
                                    width: '45px',
                                    height: '45px',
                                    border: '2px dashed var(--border)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '14px',
                                    fontFamily: 'var(--font-press-start)',
                                    backgroundColor: 'var(--code-bg)',
                                  }}
                                >
                                  ?
                                </div>
                              )}
                              <span
                                style={{
                                  fontSize: '11px',
                                  fontFamily: 'var(--font-press-start)',
                                  width: '100%',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                                title={plyr.profiles?.username || 'Anonyme'}
                              >
                                {plyr.profiles?.username || 'Anonyme'}
                              </span>

                              {isAdmin && plyr.profile_id !== user.id && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    if (window.confirm(`Exclure ${plyr.profiles?.username || 'ce dresseur'} ?`)) {
                                      handleKickPlayer(plyr.lobby_id, plyr.profile_id)
                                    }
                                  }}
                                  style={{
                                    marginTop: '6px',
                                    fontSize: '9px',
                                    fontFamily: 'var(--font-press-start)',
                                    color: '#fff',
                                    backgroundColor: '#c21a1a',
                                    border: '2px solid var(--border)',
                                    padding: '3px 6px',
                                    cursor: 'pointer',
                                    outline: 'none',
                                    imageRendering: 'pixelated'
                                  }}
                                >
                                  EXCLURE
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </RetroBox>
              </div>
            )}

            {activeTab === 'stats' && (
              <PlayerStatsPanel theme={theme} designMode={designMode} />
            )}

            {activeTab === 'upload' && (
              <ImageZoneEditor theme={theme} />
            )}

            {activeTab === 'moderate' && isAdmin && (
              <AdminPanel theme={theme} />
            )}
          </div>
        </div>
      </section>
    </>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}
