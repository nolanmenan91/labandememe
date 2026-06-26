import { useEffect, useState } from 'react'
import { getAllPlayersStats, getHallOfFame } from '../services/db'
import { RetroBox, RetroInput } from './retro'

export default function PlayerStatsPanel({ theme, designMode }) {
  const [stats, setStats] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [sortBy, setSortBy] = useState('games_won')
  const [sortOrder, setSortOrder] = useState('desc')
  const [hallOfFame, setHallOfFame] = useState([])
  const [hofLoading, setHofLoading] = useState(true)

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setLoading(true)
        const data = await getAllPlayersStats()
        setStats(data || [])
      } catch (err) {
        console.error('Error fetching player stats:', err)
        setError('Impossible de charger les statistiques.')
      } finally {
        setLoading(false)
      }
    }
    fetchStats()
  }, [])

  useEffect(() => {
    const fetchHallOfFame = async () => {
      try {
        setHofLoading(true)
        const data = await getHallOfFame(10)
        setHallOfFame(data || [])
      } catch (err) {
        console.error('Error fetching hall of fame:', err)
      } finally {
        setHofLoading(false)
      }
    }
    fetchHallOfFame()
  }, [])

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc')
    } else {
      setSortBy(field)
      setSortOrder('desc')
    }
  }

  // 1. Group statistics by username (case-insensitive) to consolidate duplicate accounts
  const consolidatedStats = []
  stats.forEach(item => {
    if (!item.username) return
    const normName = item.username.trim().toUpperCase()
    const existing = consolidatedStats.find(g => g.username.trim().toUpperCase() === normName)
    
    const gamesPlayed = item.games_played || 0
    const gamesWon = item.games_won || 0
    const totalPoints = item.total_points || 0
    const roundsWon = item.rounds_won || 0
    const totalVotesCount = item.total_votes_count || 0
    const totalVotesValueSum = parseFloat(item.total_votes_value_sum) || 0

    if (existing) {
      existing.games_played += gamesPlayed
      existing.games_won += gamesWon
      existing.total_points += totalPoints
      existing.rounds_won += roundsWon
      existing.total_votes_count += totalVotesCount
      existing.total_votes_value_sum += totalVotesValueSum
      if (!existing.avatar_url && item.avatar_url) {
        existing.avatar_url = item.avatar_url
      }
    } else {
      consolidatedStats.push({
        ...item,
        games_played: gamesPlayed,
        games_won: gamesWon,
        total_points: totalPoints,
        rounds_won: roundsWon,
        total_votes_count: totalVotesCount,
        total_votes_value_sum: totalVotesValueSum
      })
    }
  })

  // 2. Pre-calculate win rates and average ratings
  const processedStats = consolidatedStats.map(item => {
    const winRate = item.games_played > 0 
      ? parseFloat(((item.games_won / item.games_played) * 100).toFixed(1))
      : 0
    const avgRating = item.total_votes_count > 0 
      ? parseFloat((item.total_votes_value_sum / item.total_votes_count).toFixed(1))
      : 0
    return {
      ...item,
      winRate,
      avgRating
    }
  })

  // 3. Filter based on search term
  const filteredStats = processedStats.filter(item => 
    item.username.toLowerCase().includes(searchTerm.toLowerCase())
  )

  // 4. Sort based on selected column
  const sortedStats = [...filteredStats].sort((a, b) => {
    let valA = a[sortBy]
    let valB = b[sortBy]

    if (valA < valB) return sortOrder === 'desc' ? 1 : -1
    if (valA > valB) return sortOrder === 'desc' ? -1 : 1
    return 0
  })

  const isModern = designMode === 'minimalist' || designMode === 'glass'
  const isMinimalist = designMode === 'minimalist'
  const fontTitle = isModern ? 'var(--font-outfit), sans-serif' : 'var(--font-press-start)'
  const fontBody = isModern ? 'var(--font-outfit), sans-serif' : 'var(--font-vt323)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%', boxSizing: 'border-box' }}>
      <RetroBox title="STATISTIQUES DRESSEURS" theme={theme} className="main-card">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', width: '100%', boxSizing: 'border-box' }}>
          
          {/* Controls Header */}
          <div 
            style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'flex-end', 
              gap: '20px', 
              flexWrap: 'wrap',
              width: '100%'
            }}
          >
            <div style={{ flex: '1 1 280px' }}>
              <RetroInput
                label="RECHERCHER UN DRESSEUR"
                type="text"
                placeholder="Nom du dresseur..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                theme={theme}
              />
            </div>
            
            {/* Quick Metrics */}
            <div 
              style={{ 
                display: 'flex', 
                gap: '15px', 
                fontFamily: fontBody, 
                fontSize: isMinimalist ? '16px' : '20px',
                backgroundColor: 'var(--code-bg)',
                padding: '10px 15px',
                border: isMinimalist ? '1px solid var(--border)' : '2px dashed var(--border)',
                alignItems: 'center',
                flexShrink: 0
              }}
            >
              <div>Total Unique: <strong style={{ color: 'var(--text-h)' }}>{consolidatedStats.length}</strong></div>
              <div style={{ borderLeft: '2px solid var(--border)', height: '16px', opacity: 0.5 }}></div>
              <div>Parties Jouées: <strong style={{ color: 'var(--text-h)' }}>{consolidatedStats.reduce((acc, s) => acc + (s.games_played || 0), 0)}</strong></div>
            </div>
          </div>

          {/* Explicit sort buttons row for better UX and clickability */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
            <span style={{ fontSize: isMinimalist ? '13px' : '9px', fontFamily: fontTitle, color: 'var(--text-h)', textTransform: 'uppercase' }}>
              Classer le tableau par :
            </span>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {[
                { label: '🏆 Victoires', field: 'games_won' },
                { label: '📈 % Victoire', field: 'winRate' },
                { label: '⭐ Points', field: 'total_points' },
                { label: '🎮 Part. Jouées', field: 'games_played' },
                { label: '🔥 Rds Gagnés', field: 'rounds_won' },
                { label: '💬 Note Moy.', field: 'avgRating' }
              ].map(opt => {
                const isActive = sortBy === opt.field
                return (
                  <button
                    key={opt.field}
                    onClick={() => handleSort(opt.field)}
                    className="retro-btn"
                    style={{
                      fontFamily: fontBody,
                      fontSize: isMinimalist ? '14px' : '18px',
                      padding: '6px 12px',
                      backgroundColor: isActive ? 'var(--accent-bg)' : 'var(--bg)',
                      color: isActive ? 'var(--text-h)' : 'var(--text)',
                      border: '2px solid var(--border)',
                      outline: isActive ? '2px dotted var(--border)' : 'none',
                      cursor: 'pointer',
                      boxShadow: isMinimalist ? 'none' : (isActive ? 'none' : '2px 2px 0px var(--border)'),
                      transform: !isMinimalist && isActive ? 'translate(2px, 2px)' : 'none',
                      transition: 'all 0.1s ease',
                      textTransform: 'uppercase'
                    }}
                  >
                    {opt.label} {isActive ? (sortOrder === 'desc' ? '▼' : '▲') : ''}
                  </button>
                )
              })}
            </div>
          </div>

          {error && (
            <div style={{ 
              color: '#c21a1a', 
              border: '2px solid #c21a1a', 
              padding: '10px', 
              fontFamily: fontTitle,
              fontSize: '12px'
            }}>
              [ERREUR] {error}
            </div>
          )}

          {loading ? (
            <div style={{ 
              textAlign: 'center', 
              fontFamily: fontTitle, 
              fontSize: isMinimalist ? '18px' : '12px', 
              padding: '40px 0',
              opacity: 0.8
            }}>
              {isMinimalist ? 'Chargement du classement...' : 'CHARGEMENT DES STATISTIQUES...'}
            </div>
          ) : sortedStats.length === 0 ? (
            <div style={{ 
              textAlign: 'center', 
              fontFamily: fontBody, 
              fontSize: isMinimalist ? '18px' : '22px', 
              color: '#666',
              padding: '40px 0' 
            }}>
              Aucun dresseur trouvé.
            </div>
          ) : (
            <div style={{ overflowX: 'auto', width: '100%', border: isMinimalist ? 'none' : '2px solid var(--border)' }}>
              <table style={{ 
                width: '100%', 
                borderCollapse: 'collapse', 
                fontFamily: fontBody,
                fontSize: isMinimalist ? '16px' : '22px',
                textAlign: 'left'
              }}>
                <thead>
                  <tr style={{ 
                    borderBottom: isMinimalist ? '2px solid var(--border)' : '4px solid var(--border)',
                    fontFamily: fontTitle,
                    fontSize: isMinimalist ? '14px' : '10px',
                    backgroundColor: isMinimalist ? 'transparent' : 'var(--bg)',
                    color: 'var(--text-h)'
                  }}>
                    <th style={{ padding: '12px 10px', textAlign: 'center', width: '60px' }}>RANG</th>
                    <th style={{ padding: '12px 10px' }}>DRESSEUR</th>
                    <th 
                      onClick={() => handleSort('winRate')} 
                      style={{ padding: '12px 10px', cursor: 'pointer', userSelect: 'none', textAlign: 'center' }}
                      title="Parties gagnées / Parties jouées (Taux de victoire)"
                    >
                      % VICT. {sortBy === 'winRate' ? (sortOrder === 'desc' ? '▼' : '▲') : '♢'}
                    </th>
                    <th 
                      onClick={() => handleSort('games_won')} 
                      style={{ padding: '12px 10px', cursor: 'pointer', userSelect: 'none', textAlign: 'center' }}
                    >
                      VIC. {sortBy === 'games_won' ? (sortOrder === 'desc' ? '▼' : '▲') : '♢'}
                    </th>
                    <th 
                      onClick={() => handleSort('games_played')} 
                      style={{ padding: '12px 10px', cursor: 'pointer', userSelect: 'none', textAlign: 'center' }}
                    >
                      JOUÉES {sortBy === 'games_played' ? (sortOrder === 'desc' ? '▼' : '▲') : '♢'}
                    </th>
                    <th 
                      onClick={() => handleSort('total_points')} 
                      style={{ padding: '12px 10px', cursor: 'pointer', userSelect: 'none', textAlign: 'center' }}
                    >
                      PTS TOTAL {sortBy === 'total_points' ? (sortOrder === 'desc' ? '▼' : '▲') : '♢'}
                    </th>
                    <th 
                      onClick={() => handleSort('rounds_won')} 
                      style={{ padding: '12px 10px', cursor: 'pointer', userSelect: 'none', textAlign: 'center' }}
                    >
                      R. GAGNÉS {sortBy === 'rounds_won' ? (sortOrder === 'desc' ? '▼' : '▲') : '♢'}
                    </th>
                    <th 
                      onClick={() => handleSort('avgRating')} 
                      style={{ padding: '12px 10px', cursor: 'pointer', userSelect: 'none', textAlign: 'center' }}
                      title="Note moyenne sur 10 reçue pour ses mèmes"
                    >
                      NOTE MOY. {sortBy === 'avgRating' ? (sortOrder === 'desc' ? '▼' : '▲') : '♢'}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedStats.map((item, idx) => {
                    const isTop1 = idx === 0 && sortOrder === 'desc' && sortBy === 'games_won'
                    const isTop2 = idx === 1 && sortOrder === 'desc' && sortBy === 'games_won'
                    const isTop3 = idx === 2 && sortOrder === 'desc' && sortBy === 'games_won'
                    
                    let rowBg = 'transparent'
                    if (!isMinimalist) {
                      rowBg = idx % 2 === 0 ? 'var(--retro-box-bg)' : 'var(--bg)'
                    } else {
                      rowBg = idx % 2 === 0 ? 'rgba(128, 128, 128, 0.05)' : 'transparent'
                    }

                    return (
                      <tr 
                        key={item.id} 
                        style={{ 
                          backgroundColor: rowBg,
                          borderBottom: isMinimalist ? '1px solid rgba(128, 128, 128, 0.2)' : '2px dashed var(--border)',
                        }}
                      >
                        {/* Rank */}
                        <td style={{ padding: '10px', textAlign: 'center', fontWeight: 'bold' }}>
                          {isTop1 ? '🏆' : isTop2 ? '🥈' : isTop3 ? '🥉' : idx + 1}
                        </td>
                        
                        {/* Trainer info */}
                        <td style={{ padding: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                          {item.avatar_url ? (
                            <img 
                              src={item.avatar_url} 
                              alt="Avatar" 
                              style={{ 
                                width: '32px', 
                                height: '32px', 
                                imageRendering: 'pixelated', 
                                border: '2px solid var(--border)',
                                padding: '1px',
                                flexShrink: 0
                              }} 
                            />
                          ) : (
                            <div style={{ 
                              width: '32px', 
                              height: '32px', 
                              border: '2px dashed var(--border)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: isMinimalist ? '12px' : '10px',
                              fontFamily: 'var(--font-press-start)',
                              backgroundColor: 'var(--code-bg)',
                              flexShrink: 0
                            }}>?</div>
                          )}
                          <span style={{ 
                            textTransform: 'uppercase',
                            fontWeight: isTop1 ? 'bold' : 'normal',
                            color: isTop1 ? 'var(--text-h)' : 'var(--text)'
                          }}>{item.username}</span>
                        </td>

                        {/* Win Rate */}
                        <td style={{ padding: '10px', textAlign: 'center' }}>
                          {item.winRate.toFixed(1)}%
                        </td>

                        {/* Games Won */}
                        <td style={{ padding: '10px', textAlign: 'center', fontWeight: sortBy === 'games_won' ? 'bold' : 'normal' }}>
                          {item.games_won}
                        </td>

                        {/* Games Played */}
                        <td style={{ padding: '10px', textAlign: 'center', fontWeight: sortBy === 'games_played' ? 'bold' : 'normal' }}>
                          {item.games_played}
                        </td>

                        {/* Total Points */}
                        <td style={{ padding: '10px', textAlign: 'center', fontWeight: sortBy === 'total_points' ? 'bold' : 'normal' }}>
                          {item.total_points}
                        </td>

                        {/* Rounds Won */}
                        <td style={{ padding: '10px', textAlign: 'center', fontWeight: sortBy === 'rounds_won' ? 'bold' : 'normal' }}>
                          {item.rounds_won}
                        </td>

                        {/* Average Rating */}
                        <td style={{ padding: '10px', textAlign: 'center', fontWeight: sortBy === 'avgRating' ? 'bold' : 'normal' }}>
                          {item.avgRating.toFixed(1)}/10
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

        </div>
      </RetroBox>

      {/* ── HALL OF FAME ─────────────────────────────────────── */}
      <RetroBox title="🏆 HALL OF FAME — LES 10 DERNIERS MÈMES GAGNANTS" theme={theme} className="main-card">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0px', width: '100%' }}>
          {hofLoading ? (
            <div style={{ textAlign: 'center', fontFamily: fontTitle, fontSize: isMinimalist ? '16px' : '11px', padding: '30px 0', opacity: 0.7 }}>
              {isMinimalist ? 'Chargement...' : 'CHARGEMENT DU HALL OF FAME...'}
            </div>
          ) : hallOfFame.length === 0 ? (
            <div style={{ textAlign: 'center', fontFamily: fontBody, fontSize: isMinimalist ? '18px' : '22px', color: '#666', padding: '30px 0' }}>
              Aucun mème dans le hall of fame pour l'instant. Jouez une partie !
            </div>
          ) : (
            hallOfFame.map((entry, idx) => {
              const wonDate = new Date(entry.won_at)
              const now = new Date()
              const diffMs = now - wonDate
              const diffMin = Math.floor(diffMs / 60000)
              const diffH = Math.floor(diffMs / 3600000)
              const diffD = Math.floor(diffMs / 86400000)
              const timeAgo = diffD > 0 ? `Il y a ${diffD}j` : diffH > 0 ? `Il y a ${diffH}h` : diffMin > 0 ? `Il y a ${diffMin}min` : 'À l\'instant'

              return (
                <div
                  key={entry.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '40px 120px 1fr',
                    gap: '16px',
                    alignItems: 'center',
                    padding: '14px 10px',
                    borderBottom: isMinimalist ? '1px solid rgba(128,128,128,0.2)' : '2px dashed var(--border)',
                    backgroundColor: idx % 2 === 0 ? (isMinimalist ? 'rgba(128,128,128,0.04)' : 'var(--retro-box-bg)') : 'transparent',
                  }}
                >
                  {/* Rank */}
                  <div style={{ textAlign: 'center', fontFamily: fontTitle, fontSize: isMinimalist ? '20px' : '14px', fontWeight: 'bold', color: idx === 0 ? '#f5c518' : 'var(--text-h)' }}>
                    {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`}
                  </div>

                  {/* Meme image preview */}
                  <div style={{ position: 'relative', width: '120px', height: '80px', flexShrink: 0, border: '2px solid var(--border)', backgroundColor: '#000', overflow: 'hidden' }}>
                    <img
                      src={entry.image_url}
                      alt={entry.template_name || 'Mème'}
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                    {/* Overlay text zones */}
                    {(entry.text_zones || []).map((zone, zi) => {
                      if (!zone.text) return null
                      return (
                        <div
                          key={zi}
                          style={{
                            position: 'absolute',
                            left: `${zone.x}%`,
                            top: `${zone.y}%`,
                            width: `${zone.width}%`,
                            fontSize: '6px',
                            color: '#fff',
                            fontFamily: "'Impact', 'Arial Black', sans-serif",
                            fontWeight: 'bold',
                            textAlign: 'center',
                            textShadow: '1px 1px 0 #000, -1px -1px 0 #000',
                            textTransform: 'uppercase',
                            lineHeight: 1.2,
                            wordBreak: 'break-word',
                            pointerEvents: 'none',
                          }}
                        >
                          {zone.text}
                        </div>
                      )
                    })}
                  </div>

                  {/* Info */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 }}>
                    {/* Winner */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {entry.winner_avatar_url ? (
                        <img
                          src={entry.winner_avatar_url}
                          alt=""
                          style={{ width: '24px', height: '24px', imageRendering: 'pixelated', border: '1px solid var(--border)', flexShrink: 0 }}
                        />
                      ) : (
                        <div style={{ width: '24px', height: '24px', border: '1px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', flexShrink: 0 }}>?</div>
                      )}
                      <span style={{ fontFamily: fontTitle, fontSize: isMinimalist ? '15px' : '10px', color: 'var(--text-h)', textTransform: 'uppercase', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {entry.winner_username}
                      </span>
                    </div>

                    {/* Template name */}
                    <div style={{ fontFamily: fontBody, fontSize: isMinimalist ? '14px' : '18px', color: 'var(--text)', opacity: 0.8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {entry.template_name || 'Mème sans titre'}
                    </div>

                    {/* Score + time */}
                    <div style={{ display: 'flex', gap: '12px', fontFamily: fontBody, fontSize: isMinimalist ? '13px' : '17px' }}>
                      <span style={{ color: '#f5c518', fontWeight: 'bold' }}>+{entry.score_earned} pts</span>
                      <span style={{ opacity: 0.5 }}>{timeAgo}</span>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </RetroBox>
    </div>
  )
}
