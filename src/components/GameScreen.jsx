import { useEffect, useState, useRef, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../supabase'
import {
  getApprovedTemplates,
  submitMeme,
  getLobbyMemes,
  submitVote,
  getMemeVotes,
  tallyVotesAndAssignScores,
  getLobbyPlayers,
  updateLobbyStatus,
  recordGameResults,
  recordRoundWinners,
  recordRoundVotes,
} from '../services/db'
import { RetroBox, RetroButton, RetroInput } from './retro'

// ── Inline DB helpers (since we cannot modify db.js) ─────────────────────────
async function clearLobbyMemesAndVotes(lobbyId) {
  // Delete votes for memes in this lobby first
  const { data: memes } = await supabase
    .from('memes')
    .select('id')
    .eq('lobby_id', lobbyId)
  if (memes && memes.length > 0) {
    const memeIds = memes.map(m => m.id)
    await supabase.from('votes').delete().in('meme_id', memeIds)
  }
  // Then delete the memes
  await supabase.from('memes').delete().eq('lobby_id', lobbyId)
}

async function updateLobbyRound(lobbyId, roundNumber) {
  await supabase
    .from('lobbies')
    .update({ current_round: roundNumber })
    .eq('id', lobbyId)
}

async function getLobbySettings(lobbyId) {
  const { data, error } = await supabase
    .from('lobbies')
    .select('max_rounds, current_round, writing_duration, voting_duration, swap_limit, voting_mode')
    .eq('id', lobbyId)
    .single()
  if (error) throw error
  return data
}

// ── Fisher-Yates shuffle ─────────────────────────────────────────────────────
function shuffleArray(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ── Dynamic font size helper ─────────────────────────────────────────────────
function dynamicFontSize(text, baseSize) {
  return Math.max(8, baseSize - Math.floor((text || '').length / 10) * 2)
}

// ── SVG Speech Bubble rendered on top of a meme image ───────────────────────
function SpeechBubble({ zone, text, inputMode = false, onInputChange, onDragStart, onResizeStart }) {
  const { x, y, width, height, bubbleTail = 'bottom-left' } = zone
  return (
    <div style={{
      position: 'absolute',
      left: `${x}%`,
      top: `${y}%`,
      width: `${width}%`,
      height: `${height}%`,
      pointerEvents: inputMode ? 'auto' : 'none',
      boxSizing: 'border-box',
      transform: `rotate(${zone.rotation || 0}deg)`,
    }}>
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
      >
        <ellipse cx="50" cy="45" rx="48" ry="43" fill="white" stroke="#000" strokeWidth="3" />
        {bubbleTail === 'bottom-left' && <polygon points="15,80 0,105 35,80" fill="white" stroke="#000" strokeWidth="2.5" strokeLinejoin="round" />}
        {bubbleTail === 'bottom-right' && <polygon points="85,80 100,105 65,80" fill="white" stroke="#000" strokeWidth="2.5" strokeLinejoin="round" />}
        {bubbleTail === 'top-left' && <polygon points="15,15 0,-10 35,15" fill="white" stroke="#000" strokeWidth="2.5" strokeLinejoin="round" />}
        {bubbleTail === 'top-right' && <polygon points="85,15 100,-10 65,15" fill="white" stroke="#000" strokeWidth="2.5" strokeLinejoin="round" />}
      </svg>
      {inputMode ? (
        <textarea
          value={text || ''}
          onChange={(e) => onInputChange && onInputChange(e.target.value)}
          placeholder={zone.placeholder}
          rows={1}
          onInput={(e) => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
          style={{
            position: 'absolute',
            top: '12%', left: '10%', width: '80%', height: '60%',
            background: 'transparent',
            border: 'none',
            textAlign: 'center',
            fontFamily: "'Impact', 'Arial Black', sans-serif",
            fontWeight: 'bold',
            fontSize: `${dynamicFontSize(text, 14)}px`,
            color: '#000',
            outline: 'none',
            cursor: 'text',
            resize: 'none',
            overflow: 'hidden',
          }}
        />
      ) : (
        <div style={{
          position: 'absolute',
          top: '12%', left: '10%', width: '80%', height: '60%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          textAlign: 'center',
          fontFamily: "'Impact', 'Arial Black', sans-serif",
          fontWeight: 'bold',
          fontSize: '13px',
          color: '#000',
          wordBreak: 'break-word',
          lineHeight: 1.2,
          overflow: 'hidden',
        }}>
          {text || ''}
        </div>
      )}
      {/* Handles for dragging and resizing when in inputMode */}
      {inputMode && onDragStart && (
        <div
          onMouseDown={onDragStart}
          onTouchStart={onDragStart}
          style={{
            position: 'absolute',
            top: '-14px',
            left: '-14px',
            width: '20px',
            height: '20px',
            backgroundColor: '#333',
            color: '#fff',
            border: '2px solid #000',
            cursor: 'move',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '50%',
            zIndex: 25,
            fontSize: '11px',
            userSelect: 'none',
          }}
          title="Déplacer la bulle"
        >
          ✥
        </div>
      )}
      {inputMode && onResizeStart && (
        <div
          onMouseDown={onResizeStart}
          onTouchStart={onResizeStart}
          style={{
            position: 'absolute',
            bottom: '-14px',
            right: '-14px',
            width: '20px',
            height: '20px',
            backgroundColor: '#333',
            color: '#fff',
            border: '2px solid #000',
            cursor: 'nwse-resize',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '50%',
            zIndex: 25,
            fontSize: '11px',
            userSelect: 'none',
          }}
          title="Agrandir la bulle"
        >
          ⤡
        </div>
      )}
    </div>
  )
}

// ── Meme Download Helper ─────────────────────────────────────────────────────
async function downloadMemeAsImage(memeRecord) {
  if (!memeRecord) return
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')

  const imgUrl = memeRecord.images?.url
  if (!imgUrl) return

  const img = new Image()
  img.crossOrigin = 'anonymous'

  await new Promise((resolve, reject) => {
    img.onload = resolve
    img.onerror = reject
    img.src = imgUrl
  })

  const headerZone = memeRecord.text_zones?.find(z => z.isHeader)
  const headerText = headerZone?.text || ''
  
  let headerHeight = 0
  let wrappedLines = []
  let canvasFontSize = 24

  if (headerText) {
    canvasFontSize = Math.max(20, Math.floor(img.width * 0.045))
    ctx.font = `bold ${canvasFontSize}px Arial, Helvetica, sans-serif`
    const paddingX = 40 // left and right padding inside the header
    
    // Inline simple word wrapping helper
    const words = headerText.split(' ')
    let currentLine = words[0] || ''
    for (let i = 1; i < words.length; i++) {
      const word = words[i]
      const width = ctx.measureText(currentLine + ' ' + word).width
      if (width < img.width - paddingX) {
        currentLine += ' ' + word
      } else {
        wrappedLines.push(currentLine)
        currentLine = word
      }
    }
    if (currentLine) {
      wrappedLines.push(currentLine)
    }

    const lineHeight = canvasFontSize * 1.3
    const paddingY = canvasFontSize * 0.8
    headerHeight = wrappedLines.length * lineHeight + paddingY * 2
  }

  canvas.width = img.width
  canvas.height = img.height + headerHeight

  // White background
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  // Header text
  if (headerText && wrappedLines.length > 0) {
    ctx.fillStyle = '#000'
    ctx.font = `bold ${canvasFontSize}px Arial, Helvetica, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    
    const lineHeight = canvasFontSize * 1.3
    const paddingY = canvasFontSize * 0.8
    wrappedLines.forEach((line, index) => {
      ctx.fillText(line, canvas.width / 2, paddingY + index * lineHeight)
    })
  }

  // Draw template image
  ctx.drawImage(img, 0, headerHeight, img.width, img.height)

  // Draw text overlays
  const textZones = memeRecord.text_zones?.filter(z => !z.isHeader && !z.isBubble) || []
  textZones.forEach(zone => {
    const zx = (zone.x / 100) * img.width
    const zy = (zone.y / 100) * img.height + headerHeight
    const zw = (zone.width / 100) * img.width
    const zh = (zone.height / 100) * img.height
    const text = zone.text || ''
    if (!text) return

    const style = zone.style || 'white'
    const fontSize = Math.max(12, Math.floor(zw / 10))

    if (style === 'transparent') {
      ctx.font = `bold ${fontSize}px 'Impact', 'Arial Black', sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = '#fff'
      ctx.strokeStyle = '#000'
      ctx.lineWidth = 3
      ctx.strokeText(text.toUpperCase(), zx + zw / 2, zy + zh / 2, zw - 4)
      ctx.fillText(text.toUpperCase(), zx + zw / 2, zy + zh / 2, zw - 4)
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.85)'
      ctx.fillRect(zx, zy, zw, zh)
      ctx.fillStyle = '#000'
      ctx.font = `bold ${fontSize}px 'Impact', 'Arial Black', sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(text.toUpperCase(), zx + zw / 2, zy + zh / 2, zw - 4)
    }
  })

  // Bubble text
  const bubbleZones = memeRecord.text_zones?.filter(z => z.isBubble) || []
  bubbleZones.forEach(zone => {
    const zx = (zone.x / 100) * img.width
    const zy = (zone.y / 100) * img.height + headerHeight
    const zw = (zone.width / 100) * img.width
    const zh = (zone.height / 100) * img.height
    const text = zone.text || ''
    if (!text) return

    // Draw bubble background (ellipse + tail)
    ctx.save()
    const cx = zx + zw / 2
    const cy = zy + zh * 0.45
    const rx = 0.48 * zw
    const ry = 0.43 * zh
    const tail = zone.bubbleTail || 'bottom-left'

    ctx.fillStyle = '#fff'
    ctx.strokeStyle = '#000'
    ctx.lineWidth = Math.max(1.5, Math.floor(zw / 80))

    // Draw tail polygon first
    ctx.beginPath()
    if (tail === 'bottom-left') {
      ctx.moveTo(zx + 0.15 * zw, zy + 0.8 * zh)
      ctx.lineTo(zx + 0.0 * zw, zy + 1.05 * zh)
      ctx.lineTo(zx + 0.35 * zw, zy + 0.8 * zh)
    } else if (tail === 'bottom-right') {
      ctx.moveTo(zx + 0.85 * zw, zy + 0.8 * zh)
      ctx.lineTo(zx + 1.0 * zw, zy + 1.05 * zh)
      ctx.lineTo(zx + 0.65 * zw, zy + 0.8 * zh)
    } else if (tail === 'top-left') {
      ctx.moveTo(zx + 0.15 * zw, zy + 0.15 * zh)
      ctx.lineTo(zx + 0.0 * zw, zy - 0.1 * zh)
      ctx.lineTo(zx + 0.35 * zw, zy + 0.15 * zh)
    } else if (tail === 'top-right') {
      ctx.moveTo(zx + 0.85 * zw, zy + 0.15 * zh)
      ctx.lineTo(zx + 1.0 * zw, zy - 0.1 * zh)
      ctx.lineTo(zx + 0.65 * zw, zy + 0.15 * zh)
    }
    ctx.closePath()
    ctx.fill()
    ctx.stroke()

    // Draw ellipse
    ctx.beginPath()
    if (ctx.ellipse) {
      ctx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI)
    } else {
      ctx.arc(cx, cy, Math.min(rx, ry), 0, 2 * Math.PI)
    }
    ctx.fill()
    ctx.stroke()
    ctx.restore()

    const fontSize = Math.max(10, Math.floor(zw / 12))
    ctx.fillStyle = '#000'
    ctx.font = `bold ${fontSize}px 'Impact', 'Arial Black', sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, zx + zw / 2, zy + zh * 0.45, zw * 0.8)
  })

  canvas.toBlob((blob) => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `meme-${Date.now()}.png`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, 'image/png')
}

// ── Style helper for text zone rendering ─────────────────────────────────────
function getTextZoneDisplayStyle(zone, fontSize = '12px') {
  const style = zone.style || 'white'
  if (style === 'transparent') {
    return {
      position: 'absolute',
      left: `${zone.x}%`,
      top: `${zone.y}%`,
      width: `${zone.width}%`,
      height: `${zone.height}%`,
      color: '#fff',
      textShadow: '2px 2px 0 #000, -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 0 2px 0 #000, 2px 0 0 #000, 0 -2px 0 #000, -2px 0 0 #000',
      fontFamily: "'Impact', 'Arial Black', sans-serif",
      fontSize,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
      wordBreak: 'break-word',
      pointerEvents: 'none',
      lineHeight: '1.2',
      textTransform: 'uppercase',
      backgroundColor: 'transparent',
    }
  }
  // Default white background style
  return {
    position: 'absolute',
    left: `${zone.x}%`,
    top: `${zone.y}%`,
    width: `${zone.width}%`,
    height: `${zone.height}%`,
    color: '#000',
    fontFamily: "'Impact', 'Arial Black', sans-serif",
    fontSize,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    wordBreak: 'break-word',
    pointerEvents: 'none',
    lineHeight: '1.2',
    textTransform: 'uppercase',
    backgroundColor: 'rgba(255,255,255,0.85)',
    padding: '2px',
    boxSizing: 'border-box',
  }
}

export default function GameScreen({ lobby, onLeave, onLobbyUpdate, theme = 'default' }) {
  const { user, profile, isAdmin } = useAuth()
  const [phase, setPhase] = useState('writing') // writing, voting, results, ended
  const [currentImage, setCurrentImage] = useState(null)
  const [countdown, setCountdown] = useState(lobby.writing_duration || 60)
  const [textInputs, setTextInputs] = useState({})
  const [textStyles, setTextStyles] = useState({}) // Change #6: per-zone style toggle
  const [submitted, setSubmitted] = useState(false)

  // Change #3: Swap state
  const [swapsLeft, setSwapsLeft] = useState(lobby.swap_limit || 3)
  const [allTemplates, setAllTemplates] = useState([])

  const [showSettings, setShowSettings] = useState(false)
  const [settings, setSettings] = useState({
    max_rounds: lobby.max_rounds || 3,
    writing_duration: lobby.writing_duration || 60,
    voting_duration: lobby.voting_duration || 15,
    swap_limit: lobby.swap_limit || 3,
    voting_mode: lobby.voting_mode || 'buttons',
  })

  const saveSettings = async (newSettings) => {
    try {
      const updated = await updateLobbySettings(lobby.id, newSettings)
      if (onLobbyUpdate) {
        onLobbyUpdate(updated)
      }
    } catch (err) {
      console.error('Error updating settings:', err)
      setErrorMsg('Erreur lors de la mise à jour des paramètres.')
    }
  }

  const settingsConfig = [
    { key: 'max_rounds', label: 'Nombre de manches', min: 1, max: 10 },
    { key: 'writing_duration', label: 'Temps d\'écriture', min: 10, max: 300, suffix: 's' },
    { key: 'voting_duration', label: 'Temps de vote', min: 5, max: 120, suffix: 's' },
    { key: 'swap_limit', label: 'Nombre de Swaps', min: 0, max: 50 },
  ]

  const renderSettingsModal = () => {
    if (!showSettings) return null
    return (
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
          <RetroBox title="PARAMÈTRES" theme={theme} style={{ position: 'relative' }}>
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
    )
  }

  // Voting Phase State
  const [allMemes, setAllMemes] = useState([])
  const [currentMemeIndex, setCurrentMemeIndex] = useState(0)
  const [myVotes, setMyVotes] = useState({})
  const [myPokeballMemeId, setMyPokeballMemeId] = useState(null)
  const [votingMode, setVotingMode] = useState(lobby.voting_mode || 'buttons')
  const [sliderValue, setSliderValue] = useState(5)

  // Results & Leaderboard Phase State
  const [players, setPlayers] = useState([])
  const [votesData, setVotesData] = useState([])
  const [roundWinners, setRoundWinners] = useState([])

  // Change #7: Submission count tracking
  const [submittedPlayers, setSubmittedPlayers] = useState(new Set())

  // Change #12: Rounds loop
  const [currentRound, setCurrentRound] = useState(lobby.current_round || 0)
  const [maxRounds, setMaxRounds] = useState(lobby.max_rounds || 3)

  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')

  const [myTextZones, setMyTextZones] = useState([])
  const containerRef = useRef(null)
  const [draggingZoneId, setDraggingZoneId] = useState(null)
  const [resizingZoneId, setResizingZoneId] = useState(null)
  const dragStartPosRef = useRef({ x: 0, y: 0 })
  const dragStartZoneRef = useRef(null)

  useEffect(() => {
    if (currentImage) {
      setMyTextZones(currentImage.text_zones || [])
    } else {
      setMyTextZones([])
    }
  }, [currentImage])

  const getCoords = (clientX, clientY) => {
    if (!containerRef.current) return { x: 0, y: 0 }
    const rect = containerRef.current.getBoundingClientRect()
    return {
      x: ((clientX - rect.left) / rect.width) * 100,
      y: ((clientY - rect.top) / rect.height) * 100,
    }
  }

  const handleZoneDragStart = (zoneId, e) => {
    e.stopPropagation()
    const zone = myTextZones.find(z => z.id === zoneId)
    if (!zone) return

    const clientX = e.clientX !== undefined ? e.clientX : e.touches?.[0]?.clientX
    const clientY = e.clientY !== undefined ? e.clientY : e.touches?.[0]?.clientY
    if (clientX === undefined || clientY === undefined) return

    const coords = getCoords(clientX, clientY)
    dragStartPosRef.current = {
      x: coords.x - zone.x,
      y: coords.y - zone.y
    }
    setDraggingZoneId(zoneId)
  }

  const handleZoneResizeStart = (zoneId, e) => {
    e.stopPropagation()
    e.preventDefault()
    const zone = myTextZones.find(z => z.id === zoneId)
    if (!zone) return

    const clientX = e.clientX !== undefined ? e.clientX : e.touches?.[0]?.clientX
    const clientY = e.clientY !== undefined ? e.clientY : e.touches?.[0]?.clientY
    if (clientX === undefined || clientY === undefined) return

    const coords = getCoords(clientX, clientY)
    dragStartPosRef.current = { x: coords.x, y: coords.y }
    dragStartZoneRef.current = { ...zone }
    setResizingZoneId(zoneId)
  }

  useEffect(() => {
    const handleMove = (e) => {
      if (!draggingZoneId && !resizingZoneId) return
      
      const clientX = e.clientX !== undefined ? e.clientX : e.touches?.[0]?.clientX
      const clientY = e.clientY !== undefined ? e.clientY : e.touches?.[0]?.clientY
      if (clientX === undefined || clientY === undefined) return

      const coords = getCoords(clientX, clientY)

      if (draggingZoneId) {
        setMyTextZones(prev => prev.map(z => {
          if (z.id === draggingZoneId) {
            let newX = coords.x - dragStartPosRef.current.x
            let newY = coords.y - dragStartPosRef.current.y
            newX = Math.max(0, Math.min(100 - z.width, newX))
            newY = Math.max(0, Math.min(100 - z.height, newY))
            return {
              ...z,
              x: parseFloat(newX.toFixed(2)),
              y: parseFloat(newY.toFixed(2))
            }
          }
          return z
        }))
      }

      if (resizingZoneId) {
        setMyTextZones(prev => prev.map(z => {
          if (z.id === resizingZoneId) {
            const startZone = dragStartZoneRef.current
            const startPos = dragStartPosRef.current
            
            const dx = coords.x - startPos.x
            const dy = coords.y - startPos.y
            
            let newW = startZone.width + dx
            let newH = startZone.height + dy
            
            newW = Math.max(5, Math.min(100 - startZone.x, newW))
            newH = Math.max(5, Math.min(100 - startZone.y, newH))
            
            return {
              ...z,
              width: parseFloat(newW.toFixed(2)),
              height: parseFloat(newH.toFixed(2)),
              w: parseFloat(newW.toFixed(2)),
              h: parseFloat(newH.toFixed(2))
            }
          }
          return z
        }))
      }
    }

    const handleUp = () => {
      setDraggingZoneId(null)
      setResizingZoneId(null)
    }

    if (draggingZoneId || resizingZoneId) {
      window.addEventListener('mousemove', handleMove)
      window.addEventListener('mouseup', handleUp)
      window.addEventListener('touchmove', handleMove, { passive: false })
      window.addEventListener('touchend', handleUp)
    }

    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
      window.removeEventListener('touchmove', handleMove)
      window.removeEventListener('touchend', handleUp)
    }
  }, [draggingZoneId, resizingZoneId])

  // Determine if this user is the host.
  // If admin players are present, only admins are hosts; otherwise fallback to lobby creator.
  const computeIsHost = useCallback(() => {
    const adminPlayers = players.filter(p => p.profiles?.role === 'creator')
    if (adminPlayers.length > 0) {
      return adminPlayers.some(p => p.profile_id === user.id)
    }
    return lobby.creator_id === user.id
  }, [players, user.id, lobby.creator_id])

  const [isHost, setIsHost] = useState(lobby.creator_id === user.id)
  const isHostRef = useRef(lobby.creator_id === user.id)

  const setHostState = useCallback((val) => {
    setIsHost(val)
    isHostRef.current = val
  }, [])

  useEffect(() => {
    setHostState(computeIsHost())
  }, [computeIsHost, setHostState])

  useEffect(() => {
    if (allMemes[currentMemeIndex]) {
      const existingVote = myVotes[allMemes[currentMemeIndex].id]
      if (existingVote && !isNaN(parseInt(existingVote, 10))) {
        setSliderValue(parseInt(existingVote, 10))
      } else {
        setSliderValue(5)
      }
    }
  }, [currentMemeIndex, allMemes, myVotes])

  const channelRef = useRef(null)
  const timerRef = useRef(null)
  const hostInitializedRef = useRef(false)

  const fetchPlayers = async () => {
    try {
      const plyrs = await getLobbyPlayers(lobby.id)
      setPlayers(plyrs)
    } catch (err) {
      console.error(err)
    }
  }

  // Setup broadcast channel and listen to updates
  useEffect(() => {
    setTimeout(() => {
      fetchPlayers()
    }, 0)

    const channel = supabase.channel(`lobby-game-${lobby.id}`, {
      config: {
        broadcast: { self: true },
      },
    })

    channelRef.current = channel

    channel
      .on('broadcast', { event: 'START_ROUND' }, ({ payload }) => {
        setPhase('writing')
        // Change #2: unique template per player
        if (payload.playerImages && payload.playerImages[user.id]) {
          setCurrentImage(payload.playerImages[user.id])
        } else {
          // fallback for non-mapped players (spectators joining mid-round)
          setCurrentImage(payload.image || null)
        }
        setCountdown(payload.duration || 60)
        setTextInputs({})
        setTextStyles({}) // Reset text styles
        setSubmitted(false)
        setAllMemes([])
        setCurrentMemeIndex(0)
        setMyVotes({})
        setMyPokeballMemeId(null)
        setSubmittedPlayers(new Set()) // Reset submission tracking
        // Change #3: set allTemplates and reset swaps
        setAllTemplates(payload.allTemplates || [])
        setSwapsLeft(payload.swapLimit || lobby.swap_limit || 3)
        // Change #12: set current round
        if (payload.roundNumber !== undefined) {
          setCurrentRound(payload.roundNumber)
        }
        if (payload.votingMode !== undefined) {
          setVotingMode(payload.votingMode)
        }
        setLoading(false)
      })
      .on('broadcast', { event: 'TIMER_TICK' }, ({ payload }) => {
        setCountdown(payload.countdown)
      })
      .on('broadcast', { event: 'START_VOTING' }, ({ payload }) => {
        setPhase('voting')
        setAllMemes(payload.memes)
        setCurrentMemeIndex(0)
        setCountdown(payload.voteDuration || 15)
        setMyVotes({})
        setMyPokeballMemeId(null)
        setLoading(false)
      })
      .on('broadcast', { event: 'VOTE_TICK' }, ({ payload }) => {
        setCurrentMemeIndex(payload.memeIndex)
        setCountdown(payload.countdown)
      })
      .on('broadcast', { event: 'START_RESULTS' }, ({ payload }) => {
        setPhase('results')
        setPlayers(payload.players)
        setVotesData(payload.votesData || [])
        setRoundWinners(payload.roundWinners || [])
        if (payload.roundNumber !== undefined) {
          setCurrentRound(payload.roundNumber)
        }
        if (payload.maxRounds !== undefined) {
          setMaxRounds(payload.maxRounds)
        }
        if (payload.votingMode !== undefined) {
          setVotingMode(payload.votingMode)
        }
        setLoading(false)
      })
      .on('broadcast', { event: 'GAME_OVER' }, () => {
        setPhase('ended')
        fetchPlayers()
      })
      .on('broadcast', { event: 'RESTART_GAME' }, () => {
        onLeave() // return to dashboard/lobby list
      })
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
      // Change #7: Listen for meme submissions
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'memes',
          filter: `lobby_id=eq.${lobby.id}`,
        },
        (payload) => {
          if (payload.new?.profile_id) {
            setSubmittedPlayers(prev => new Set([...prev, payload.new.profile_id]))
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'memes',
          filter: `lobby_id=eq.${lobby.id}`,
        },
        (payload) => {
          if (payload.new?.profile_id) {
            setSubmittedPlayers(prev => new Set([...prev, payload.new.profile_id]))
          }
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
        async (payload) => {
          if (payload.new) {
            if (onLobbyUpdate) {
              onLobbyUpdate(payload.new)
            }
            // Sync settings state
            setSettings({
              max_rounds: payload.new.max_rounds ?? 3,
              writing_duration: payload.new.writing_duration ?? 60,
              voting_duration: payload.new.voting_duration ?? 15,
              swap_limit: payload.new.swap_limit ?? 3,
              voting_mode: payload.new.voting_mode ?? 'buttons',
            })
            if (payload.new.status === 'voting') {
              setPhase((prevPhase) => {
                if (prevPhase === 'writing') {
                  setLoading(true)
                  getLobbyMemes(lobby.id).then(async (memes) => {
                    let settings = {}
                    try {
                      settings = await getLobbySettings(lobby.id)
                    } catch (e) {}
                    const votingDuration = settings.voting_duration || lobby.voting_duration || 15
                    setAllMemes(memes)
                    setCurrentMemeIndex(0)
                    setCountdown(votingDuration)
                    setMyVotes({})
                    setMyPokeballMemeId(null)
                    setLoading(false)
                  }).catch(err => {
                    console.error(err)
                    setLoading(false)
                  })
                  return 'voting'
                }
                return prevPhase
              })
            }
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED' && !hostInitializedRef.current) {
          // We'll check host after players load
          setTimeout(async () => {
            const plyrs = await getLobbyPlayers(lobby.id)
            setPlayers(plyrs)
            const amIHost = lobby.creator_id === user.id
            if (amIHost && !hostInitializedRef.current) {
              hostInitializedRef.current = true
              setHostState(true)
              
              if (!lobby.current_round || lobby.current_round === 0) {
                startNewRound(plyrs)
              } else if (lobby.status === 'writing') {
                // Resume writing phase timer on host reconnect/refresh
                let settings = {}
                try {
                  settings = await getLobbySettings(lobby.id)
                } catch (e) {}
                const writingDuration = settings.writing_duration || lobby.writing_duration || 60
                runWritingTimer(writingDuration)
              } else if (lobby.status === 'voting') {
                // Resume voting phase loop on host reconnect/refresh
                try {
                  const memesList = await getLobbyMemes(lobby.id)
                  let settings = {}
                  try {
                    settings = await getLobbySettings(lobby.id)
                  } catch (e) {}
                  const votingDuration = settings.voting_duration || lobby.voting_duration || 15
                  runVotingLoop(memesList, votingDuration, 0)
                } catch (e) {
                  console.error('Failed to resume voting loop on host reconnect:', e)
                }
              }
            }
          }, 500)
        }
      })

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lobby.id])



  // ============================================================================
  // HOST-ONLY GAME LOOPS
  // ============================================================================

  async function startNewRound(playersOverride) {
    if (!isHostRef.current && !isAdmin && !playersOverride) return
    setLoading(true)
    setErrorMsg('')
    try {
      const templates = await getApprovedTemplates()
      if (templates.length === 0) {
        setErrorMsg("Aucun modèle de meme approuvé dans la base de données. Veuillez d'abord en ajouter.")
        setLoading(false)
        return
      }

      // Change #12: increment round, clear previous data
      const newRound = currentRound + 1
      setCurrentRound(newRound)
      await clearLobbyMemesAndVotes(lobby.id)
      await updateLobbyRound(lobby.id, newRound)
      await updateLobbyStatus(lobby.id, 'writing')

      // Change #13: get lobby settings for durations
      let settings = {}
      try {
        settings = await getLobbySettings(lobby.id)
      } catch (e) { /* use defaults */ }
      const writingDuration = settings.writing_duration || lobby.writing_duration || 60
      const votingDuration = settings.voting_duration || lobby.voting_duration || 15
      const swapLimit = settings.swap_limit || lobby.swap_limit || 3
      const votingMode = settings.voting_mode || lobby.voting_mode || 'buttons'

      // Change #2: Unique template per player
      const currentPlayers = playersOverride || await getLobbyPlayers(lobby.id)
      const shuffledTemplates = shuffleArray(templates)
      const playerImages = {}
      currentPlayers.forEach((plyr, index) => {
        playerImages[plyr.profile_id] = shuffledTemplates[index % shuffledTemplates.length]
      })

      // Broadcast round start to all players
      channelRef.current.send({
        type: 'broadcast',
        event: 'START_ROUND',
        payload: {
          playerImages,
          image: shuffledTemplates[0], // fallback for spectators
          duration: writingDuration,
          allTemplates: templates,
          swapLimit,
          roundNumber: newRound,
          votingMode,
        },
      })

      // Run writing timer
      runWritingTimer(writingDuration)
    } catch (err) {
      console.error(err)
      setErrorMsg('Erreur lors du lancement de la manche: ' + err.message)
      setLoading(false)
    }
  }

  function runWritingTimer(duration) {
    let remaining = duration
    if (timerRef.current) clearInterval(timerRef.current)

    timerRef.current = setInterval(async () => {
      remaining -= 1
      channelRef.current.send({
        type: 'broadcast',
        event: 'TIMER_TICK',
        payload: { countdown: remaining },
      })

      if (remaining <= 0) {
        clearInterval(timerRef.current)
        // Change #8: Grace period before transitioning to voting
        setTimeout(async () => {
          await transitionToVoting()
        }, 1500)
      }
    }, 1000)
  }

  async function transitionToVoting() {
    if (!isHostRef.current && !isAdmin) return
    setLoading(true)
    try {
      if (timerRef.current) clearInterval(timerRef.current)

      // Update database status to voting so clients can sync
      await updateLobbyStatus(lobby.id, 'voting')

      // Fetch all memes submitted in this lobby for the current image
      const memes = await getLobbyMemes(lobby.id)

      // Change #13: pass voting duration
      let settings = {}
      try {
        settings = await getLobbySettings(lobby.id)
      } catch (e) { /* defaults */ }
      const votingDuration = settings.voting_duration || lobby.voting_duration || 15

      // Broadcast start of voting phase with the list of memes
      channelRef.current.send({
        type: 'broadcast',
        event: 'START_VOTING',
        payload: { memes, voteDuration: votingDuration },
      })

      if (memes.length === 0) {
        // No memes submitted, skip to results
        await transitionToResults()
        return
      }

      // Run voting loop
      runVotingLoop(memes, votingDuration, 0)
    } catch (err) {
      console.error(err)
      setErrorMsg('Erreur lors du passage aux votes.')
      setLoading(false)
    }
  }

  function runVotingLoop(memesList, voteDuration = 15, startIndex = 0) {
    let memeIndex = startIndex
    let remaining = voteDuration

    if (timerRef.current) clearInterval(timerRef.current)

    // Broadcast initial state of the first/next mème
    channelRef.current.send({
      type: 'broadcast',
      event: 'VOTE_TICK',
      payload: { memeIndex, countdown: remaining, isNewMeme: true },
    })

    timerRef.current = setInterval(async () => {
      remaining -= 1

      channelRef.current.send({
        type: 'broadcast',
        event: 'VOTE_TICK',
        payload: { memeIndex, countdown: remaining, isNewMeme: false },
      })

      if (remaining <= 0) {
        // Go to next meme or end voting
        memeIndex += 1
        if (memeIndex < memesList.length) {
          remaining = voteDuration
          channelRef.current.send({
            type: 'broadcast',
            event: 'VOTE_TICK',
            payload: { memeIndex, countdown: remaining, isNewMeme: true },
          })
        } else {
          clearInterval(timerRef.current)
          // All memes voted, transition to results
          await transitionToResults(memesList)
        }
      }
    }, 1000)
  }

  const handleHostForceNextMeme = () => {
    if (!isHostRef.current && !isAdmin) return
    if (timerRef.current) clearInterval(timerRef.current)

    const nextIndex = currentMemeIndex + 1
    if (nextIndex < allMemes.length) {
      const votingDuration = lobby.voting_duration || 15
      runVotingLoop(allMemes, votingDuration, nextIndex)
    } else {
      transitionToResults(allMemes)
    }
  }

  async function transitionToResults(memesList = []) {
    if (!isHostRef.current && !isAdmin) return
    setLoading(true)
    try {
      // Get settings for voting mode
      let settings = {}
      try {
        settings = await getLobbySettings(lobby.id)
      } catch (e) { /* use default */ }
      const votingMode = settings.voting_mode || lobby.voting_mode || 'buttons'

      // 1. Tally votes and assign scores to player records in database
      const { scoreAdditions } = await tallyVotesAndAssignScores(lobby.id)

      // 2. Fetch updated players list (with cumulative scores)
      const updatedPlayers = await getLobbyPlayers(lobby.id)

      // 3. Fetch votes for each meme to show voting statistics
      const allVotes = []
      for (const m of memesList) {
        const votes = await getMemeVotes(m.id)
        allVotes.push({
          memeId: m.id,
          username: m.profiles?.username,
          avatarUrl: m.profiles?.avatar_url,
          votes,
        })
      }

      // 4. Calculate round winners (highest points scored in this round)
      let highestPoints = -1
      let winners = []
      let roundWinnerIds = []
      Object.entries(scoreAdditions).forEach(([profId, points]) => {
        if (points > highestPoints) {
          highestPoints = points
          const plyr = updatedPlayers.find((p) => p.profile_id === profId)
          winners = [plyr?.profiles?.username || 'Anonyme']
          roundWinnerIds = [profId]
        } else if (points === highestPoints) {
          const plyr = updatedPlayers.find((p) => p.profile_id === profId)
          winners.push(plyr?.profiles?.username || 'Anonyme')
          roundWinnerIds.push(profId)
        }
      })

      // 5. Record round stats and round winners in database (run on the host side)
      try {
        const getNumericVoteValue = (vote) => {
          if (!isNaN(parseInt(vote, 10))) {
            return parseInt(vote, 10)
          }
          switch (vote) {
            case 'masterclass': return 10
            case 'pas mal': return 7
            case 'mouais': return 5
            case 'guez': return 2
            default: return 5
          }
        }

        const votesDataForDb = memesList.map(m => {
          const votesForMeme = allVotes.find(v => v.memeId === m.id)?.votes || []
          const validVotes = votesForMeme.filter(v => v.voter_id !== m.profile_id)
          const count = validVotes.length
          const sum = validVotes.reduce((acc, v) => acc + getNumericVoteValue(v.vote), 0)
          return {
            profile_id: m.profile_id,
            votes_count: count,
            votes_value_sum: sum
          }
        }).filter(v => v.votes_count > 0)

        if (votesDataForDb.length > 0) {
          await recordRoundVotes(votesDataForDb)
        }

        if (highestPoints > 0 && roundWinnerIds.length > 0) {
          await recordRoundWinners(roundWinnerIds)
        }
      } catch (statsErr) {
        console.error('Failed to update round statistics in DB:', statsErr)
      }

      // Broadcast results
      channelRef.current.send({
        type: 'broadcast',
        event: 'START_RESULTS',
        payload: {
          players: updatedPlayers,
          votesData: allVotes,
          roundWinners: highestPoints > 0 ? winners : [],
          roundNumber: currentRound,
          maxRounds: maxRounds,
          votingMode,
        },
      })
    } catch (err) {
      console.error(err)
      setErrorMsg('Erreur lors du calcul des scores.')
      setLoading(false)
    }
  }

  const handleEndGame = async () => {
    if (!isHostRef.current && !isAdmin) return
    setLoading(true)
    try {
      if (players && players.length > 0) {
        // Determine the highest score among all players
        const highestScore = Math.max(...players.map(p => p.score))
        
        // Winners are players with the highest score, and they must have scored more than 0 points
        const winners = players.filter(p => p.score === highestScore && p.score > 0)
        const winnerIds = winners.map(w => w.profile_id)
        
        const playerResults = players.map(p => ({
          profile_id: p.profile_id,
          score: p.score
        }))

        // Call database function to record final stats
        await recordGameResults(winnerIds, playerResults)
      }
    } catch (err) {
      console.error('Failed to save final game statistics:', err)
    } finally {
      setLoading(false)
    }

    channelRef.current.send({
      type: 'broadcast',
      event: 'GAME_OVER',
    })
  }

  const handleRestartLobby = async () => {
    if (!isHostRef.current && !isAdmin) return
    try {
      // Update status back to lobby
      await updateLobbyStatus(lobby.id, 'lobby')

      // Reset scores of players
      const plyrs = await getLobbyPlayers(lobby.id)
      const resetPromises = plyrs.map((p) => {
        return supabase
          .from('players')
          .update({ score: 0, is_ready: false })
          .eq('id', p.id)
      })
      await Promise.all(resetPromises)

      // Reset round counter
      await updateLobbyRound(lobby.id, 0)
      setCurrentRound(0)

      // Broadcast restart
      channelRef.current.send({
        type: 'broadcast',
        event: 'RESTART_GAME',
      })
    } catch (err) {
      console.error(err)
      setErrorMsg('Erreur lors de la réinitialisation.')
    }
  }

  // ============================================================================
  // CLIENT ACTIONS (SUBMISSIONS & VOTES)
  // ============================================================================

  const handleInputChange = (zoneId, val) => {
    setTextInputs((prev) => ({
      ...prev,
      [zoneId]: val,
    }))
  }

  // Change #6: toggle text zone style
  const handleStyleToggle = (zoneId) => {
    setTextStyles((prev) => ({
      ...prev,
      [zoneId]: prev[zoneId] === 'transparent' ? 'white' : 'transparent',
    }))
  }

  const handleSubmitMeme = async () => {
    if (submitted || !currentImage) return
    try {
      // Prepare text zones to save, injecting user texts and styles
      const submittedTextZones = myTextZones.map((zone) => ({
        ...zone,
        text: textInputs[zone.id] || '',
        style: zone.isHeader || zone.isBubble ? undefined : (textStyles[zone.id] || 'white'), // Change #6
      }))

      await submitMeme(lobby.id, currentImage.id, user.id, submittedTextZones)
      setSubmitted(true)
    } catch (err) {
      console.error(err)
      setErrorMsg('Erreur lors de la soumission du meme.')
    }
  }

  // Change #3: Swap image handler
  const handleSwapImage = () => {
    if (swapsLeft <= 0 || !allTemplates || allTemplates.length <= 1) return
    const otherTemplates = allTemplates.filter(t => t.id !== currentImage?.id)
    if (otherTemplates.length === 0) return
    const newTemplate = otherTemplates[Math.floor(Math.random() * otherTemplates.length)]
    setCurrentImage(newTemplate)
    setTextInputs({})
    setTextStyles({})
    setSwapsLeft(prev => prev - 1)
  }

  // Auto-submit when countdown hits zero
  useEffect(() => {
    if (phase === 'writing' && countdown === 0 && !submitted) {
      setTimeout(() => {
        handleSubmitMeme()
      }, 0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countdown, phase, submitted])

  // Auto-transition to voting when all players have submitted their memes
  useEffect(() => {
    if (!isHost || phase !== 'writing' || players.length === 0) return

    if (submittedPlayers.size >= players.length) {
      if (timerRef.current) clearInterval(timerRef.current)
      transitionToVoting()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submittedPlayers, players.length, isHost, phase])

  const handleVote = async (voteValue) => {
    const currentMeme = allMemes[currentMemeIndex]
    if (!currentMeme || currentMeme.profile_id === user.id) return // Cannot vote on own meme

    try {
      const isPokeball = myPokeballMemeId === currentMeme.id
      await submitVote(currentMeme.id, user.id, voteValue, isPokeball)
      setMyVotes((prev) => ({ ...prev, [currentMeme.id]: voteValue }))
    } catch (err) {
      console.error(err)
    }
  }

  const handlePokeballToggle = async () => {
    const currentMeme = allMemes[currentMemeIndex]
    if (!currentMeme || currentMeme.profile_id === user.id) return

    const isCurrentPokeball = myPokeballMemeId === currentMeme.id
    
    try {
      if (isCurrentPokeball) {
        const voteVal = myVotes[currentMeme.id] || 'mouais'
        await submitVote(currentMeme.id, user.id, voteVal, false)
        setMyPokeballMemeId(null)
      } else {
        if (myPokeballMemeId) {
          const oldMeme = allMemes.find(m => m.id === myPokeballMemeId)
          if (oldMeme) {
            const oldVoteVal = myVotes[oldMeme.id] || 'mouais'
            await submitVote(oldMeme.id, user.id, oldVoteVal, false)
          }
        }
        const voteVal = myVotes[currentMeme.id] || 'mouais'
        await submitVote(currentMeme.id, user.id, voteVal, true)
        setMyPokeballMemeId(currentMeme.id)
      }
    } catch (err) {
      console.error(err)
    }
  }

  // ============================================================================
  // RENDERING HELPERS
  // ============================================================================

  // Change #10: Calculate best meme of the round (for results phase)
  const getBestMemeIds = () => {
    if (!votesData || votesData.length === 0) return new Set()
    let maxPoints = 0
    const bestIds = new Set()
    votesData.forEach(data => {
      let points = 0
      data.votes.forEach(v => {
        const meme = allMemes.find(m => m.id === data.memeId)
        if (meme && v.voter_id !== meme.profile_id) {
          if (v.vote === 'masterclass') points += 1000
          else if (v.vote === 'pas mal') points += 400
          else if (v.vote === 'mouais') points += 0
          else if (v.vote === 'guez') points -= 500
          else if (!isNaN(parseInt(v.vote, 10))) points += parseInt(v.vote, 10) * 100
          
          if (v.pokeball_bonus) points += 200
        }
      })
      if (points > maxPoints && points > 0) {
        maxPoints = points
        bestIds.clear()
        bestIds.add(data.memeId)
      } else if (points === maxPoints && points > 0) {
        bestIds.add(data.memeId)
      }
    })
    return bestIds
  }

  const isSpectating = !currentImage

  if (loading && phase === 'writing' && !isSpectating) {
    return (
      <div style={{ textAlign: 'center', padding: '50px' }}>
        <p style={{ fontFamily: 'var(--font-press-start)' }}>MANCHE EN COURS DE Lancement...</p>
      </div>
    )
  }

  if (isSpectating && phase === 'writing') {
    return (
      <>
        <div style={{ display: 'grid', gridTemplateColumns: '2.5fr 1fr', gap: '20px', maxWidth: '1100px', margin: '0 auto' }} className="game-grid">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <span style={{ fontFamily: 'var(--font-press-start)', fontSize: '14px' }}>
                ÉCRAN SPECTATEUR
                <span style={{ fontSize: '10px', opacity: 0.7, marginLeft: '8px' }}>MANCHE {currentRound}/{maxRounds}</span>
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                {(isHost || isAdmin) && (
                  <button
                    onClick={transitionToVoting}
                    className="retro-button-danger"
                    style={{
                      fontFamily: 'var(--font-press-start)',
                      fontSize: '10px',
                      padding: '6px 12px',
                      backgroundColor: '#e63946',
                      color: '#fff',
                      border: '2px solid var(--border)',
                      cursor: 'pointer',
                      borderRadius: '4px',
                      boxShadow: '2px 2px 0 var(--border)',
                    }}
                  >
                    ⚡ PASSER AUX VOTES
                  </button>
                )}
                <div
                  style={{
                    fontFamily: 'var(--font-press-start)',
                    fontSize: '18px',
                    color: countdown <= 10 ? '#c21a1a' : 'inherit',
                    border: '2px solid var(--border)',
                    padding: '4px 10px',
                  }}
                >
                  TEMPS: {countdown}s
                </div>
              </div>
            </div>

            <RetroBox title="SPECTATEUR" theme={theme}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px', padding: '20px 0' }}>
                <span style={{ fontSize: '48px', animation: 'retro-bounce 1.5s steps(4, end) infinite' }}>🎮</span>
                <h2 style={{ fontFamily: 'var(--font-press-start)', fontSize: '18px', textAlign: 'center', margin: 0 }}>
                  PARTIE EN COURS
                </h2>
                <p style={{ textAlign: 'center', fontSize: '20px', fontFamily: 'var(--font-vt323)', margin: 0, lineHeight: 1.4 }}>
                  Une manche est actuellement en cours. Vous participerez automatiquement à la prochaine manche !
                </p>
                <div style={{ display: 'flex', gap: '10px', marginTop: '10px', width: '100%' }}>
                  <RetroButton onClick={onLeave} theme={theme} style={{ flex: 1, backgroundColor: '#c21a1a', color: '#fff' }}>
                    QUITTER LE SALON
                  </RetroButton>
                </div>
              </div>
            </RetroBox>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <RetroButton
              onClick={() => setShowSettings(true)}
              theme={theme}
              style={{ width: '100%', backgroundColor: 'var(--code-bg)', color: 'var(--text)', marginBottom: '5px' }}
            >
              ⚙ PARAMÈTRES
            </RetroButton>
            <RetroBox title="JOUEURS EN LIGNE" theme={theme}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {players.length === 0 ? (
                  <p style={{ fontSize: '14px', fontFamily: 'var(--font-press-start)', color: '#666', margin: 0, textAlign: 'center' }}>Aucun joueur</p>
                ) : (
                  players.map((plyr) => (
                    <div
                      key={plyr.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '6px 8px',
                        border: '2px solid var(--border)',
                        backgroundColor: plyr.profile_id === user.id ? 'var(--code-bg)' : 'transparent',
                        gap: '10px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                        {plyr.profiles?.avatar_url ? (
                          <img
                            src={plyr.profiles.avatar_url}
                            alt=""
                            style={{
                              width: '28px',
                              height: '28px',
                              imageRendering: 'pixelated',
                              border: '2px solid var(--border)',
                              backgroundColor: 'var(--retro-box-bg)',
                              flexShrink: 0
                            }}
                          />
                        ) : (
                          <div
                            style={{
                              width: '28px',
                              height: '28px',
                              border: '2px dashed var(--border)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '10px',
                              fontFamily: 'var(--font-press-start)',
                              backgroundColor: 'var(--code-bg)',
                              flexShrink: 0
                            }}
                          >
                            ?
                          </div>
                        )}
                        <span 
                          style={{ 
                            overflow: 'hidden', 
                            textOverflow: 'ellipsis', 
                            whiteSpace: 'nowrap', 
                            fontSize: '11px',
                            fontFamily: 'var(--font-press-start)'
                          }}
                        >
                          {plyr.profiles?.username || 'Anonyme'}
                        </span>
                      </div>
                      <span style={{ fontSize: '11px', fontFamily: 'var(--font-press-start)', fontWeight: 'bold', flexShrink: 0 }}>
                        {plyr.score} PTS
                      </span>
                    </div>
                  ))
                )}
              </div>
            </RetroBox>
          </div>
        </div>
        {renderSettingsModal()}
      </>
    )
  }

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: '2.5fr 1fr', gap: '20px', maxWidth: '1100px', margin: '0 auto' }} className="game-grid">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {errorMsg && (
          <div style={{ color: '#c21a1a', border: '2px solid #c21a1a', padding: '8px', fontFamily: 'var(--font-press-start)', fontSize: '12px', textAlign: 'center' }}>
            [ERREUR] {errorMsg}
          </div>
        )}

      {/* PHASE 1: WRITING PHASE */}
      {phase === 'writing' && currentImage && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
            <span style={{ fontFamily: 'var(--font-press-start)', fontSize: '14px' }}>
              CRÉEZ VOTRE MEME ! {/* Change #12 */}
              <span style={{ fontSize: '10px', opacity: 0.7, marginLeft: '8px' }}>MANCHE {currentRound}/{maxRounds}</span>
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
              {(isHost || isAdmin) && (
                <button
                  onClick={transitionToVoting}
                  className="retro-button-danger"
                  style={{
                    fontFamily: 'var(--font-press-start)',
                    fontSize: '10px',
                    padding: '6px 12px',
                    backgroundColor: '#e63946',
                    color: '#fff',
                    border: '2px solid var(--border)',
                    cursor: 'pointer',
                    borderRadius: '4px',
                    boxShadow: '2px 2px 0 var(--border)',
                  }}
                >
                  ⚡ PASSER AUX VOTES
                </button>
              )}
              <div
                style={{
                  fontFamily: 'var(--font-press-start)',
                  fontSize: '18px',
                  color: countdown <= 10 ? '#c21a1a' : 'inherit',
                  border: '2px solid var(--border)',
                  padding: '4px 10px',
                }}
              >
                TEMPS: {countdown}s
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }} className="editor-grid">
            {/* Visual template showcase with overlay inputs */}
            <RetroBox title={currentImage?.name ? currentImage.name.toUpperCase() : "MODÈLE DE MEME"} theme={theme} style={{ padding: '8px', backgroundColor: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', zIndex: 10005 }}>
              <div style={{ display: 'flex', flexDirection: 'column', backgroundColor: '#fff', width: '100%', maxWidth: '100%', border: '1px solid #ccc', boxSizing: 'border-box' }}>
                {currentImage.text_zones.find(z => z.isHeader) && (() => {
                  const headerZone = currentImage.text_zones.find(z => z.isHeader)
                  const headerText = textInputs[headerZone.id] || ''
                  const headerFontSize = dynamicFontSize(headerText, 24)
                  return (
                    <div style={{
                      backgroundColor: '#fff',
                      color: '#000',
                      padding: '16px 20px',
                      display: 'flex',
                      justifyContent: 'center',
                      boxSizing: 'border-box',
                    }}>
                      {!submitted ? (
                        <textarea
                          value={headerText}
                          onChange={(e) => handleInputChange(headerZone.id, e.target.value)}
                          placeholder={headerZone.placeholder}
                          rows={1}
                          onInput={(e) => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
                          style={{
                            width: '100%',
                            border: '2px dashed #000',
                            padding: '6px',
                            textAlign: 'center',
                            fontFamily: "Arial, Helvetica, sans-serif",
                            fontSize: `${headerFontSize}px`,
                            fontWeight: 'bold',
                            backgroundColor: '#f9f9f9',
                            color: '#000',
                            resize: 'none',
                            overflow: 'hidden',
                          }}
                        />
                      ) : (
                        <div style={{
                          color: '#000',
                          fontFamily: "Arial, Helvetica, sans-serif",
                          fontSize: `${headerFontSize}px`,
                          fontWeight: 'bold',
                          textAlign: 'center',
                          wordBreak: 'break-word',
                          width: '100%',
                        }}>
                          {headerText}
                        </div>
                      )}
                    </div>
                  )
                })()}
                <div ref={containerRef} style={{ position: 'relative', display: 'inline-block', width: '100%', backgroundColor: '#000' }}>
                  <img
                    src={currentImage.url}
                    alt="Meme template"
                    style={{
                      width: '100%',
                      maxHeight: '400px',
                      objectFit: 'contain',
                      display: 'block',
                    }}
                  />

                  {/* Overlay text inputs on top of correct positions (regular zones, excluding header & bubbles) */}
                  {!submitted &&
                    myTextZones.filter(z => !z.isHeader && !z.isBubble).map((zone) => {
                      const zoneText = textInputs[zone.id] || ''
                      const zoneFontSize = dynamicFontSize(zoneText, 16)
                      const zoneStyle = textStyles[zone.id] || 'white'
                      return (
                        <div key={zone.id} style={{
                          position: 'absolute',
                          left: `${zone.x}%`,
                          top: `${zone.y}%`,
                          width: `${zone.width}%`,
                          height: `${zone.height}%`,
                          boxSizing: 'border-box',
                        }}>
                          <textarea
                            value={zoneText}
                            onChange={(e) => handleInputChange(zone.id, e.target.value)}
                            placeholder={zone.placeholder}
                            rows={1}
                            onInput={(e) => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
                            style={{
                              width: '100%',
                              height: '100%',
                              backgroundColor: zoneStyle === 'transparent' ? 'transparent' : 'rgba(255, 255, 255, 0.75)',
                              border: zoneStyle === 'transparent' ? '2px dashed rgba(255,255,255,0.5)' : '2px solid #000',
                              fontFamily: "'Impact', 'Arial Black', sans-serif",
                              fontSize: `${zoneFontSize}px`,
                              textAlign: 'center',
                              boxSizing: 'border-box',
                              padding: '2px',
                              color: zoneStyle === 'transparent' ? '#fff' : '#000',
                              textShadow: zoneStyle === 'transparent' ? '2px 2px 0 #000, -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000' : 'none',
                              resize: 'none',
                              overflow: 'hidden',
                              outline: 'none',
                            }}
                          />
                          {/* Change #6: Style toggle button */}
                          <button
                            onClick={() => handleStyleToggle(zone.id)}
                            title={zoneStyle === 'transparent' ? 'Mode: transparent' : 'Mode: fond blanc'}
                            style={{
                              position: 'absolute',
                              top: '-14px',
                              right: '-14px',
                              width: '20px',
                              height: '20px',
                              borderRadius: '50%',
                              border: '2px solid #000',
                              backgroundColor: zoneStyle === 'transparent' ? '#333' : '#fff',
                              color: zoneStyle === 'transparent' ? '#fff' : '#000',
                              fontSize: '10px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              padding: 0,
                              lineHeight: 1,
                              zIndex: 25,
                            }}
                          >
                            {zoneStyle === 'transparent' ? 'T' : 'W'}
                          </button>
                          {/* Drag handle */}
                          <div
                            onMouseDown={(e) => handleZoneDragStart(zone.id, e)}
                            onTouchStart={(e) => handleZoneDragStart(zone.id, e)}
                            style={{
                              position: 'absolute',
                              top: '-14px',
                              left: '-14px',
                              width: '20px',
                              height: '20px',
                              backgroundColor: '#333',
                              color: '#fff',
                              border: '2px solid #000',
                              cursor: 'move',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              borderRadius: '50%',
                              zIndex: 25,
                              fontSize: '11px',
                              userSelect: 'none',
                            }}
                            title="Déplacer"
                          >
                            ✥
                          </div>
                          {/* Resize handle */}
                          <div
                            onMouseDown={(e) => handleZoneResizeStart(zone.id, e)}
                            onTouchStart={(e) => handleZoneResizeStart(zone.id, e)}
                            style={{
                              position: 'absolute',
                              bottom: '-14px',
                              right: '-14px',
                              width: '20px',
                              height: '20px',
                              backgroundColor: '#333',
                              color: '#fff',
                              border: '2px solid #000',
                              cursor: 'nwse-resize',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              borderRadius: '50%',
                              zIndex: 25,
                              fontSize: '11px',
                              userSelect: 'none',
                            }}
                            title="Agrandir"
                          >
                            ⤡
                          </div>
                        </div>
                      )
                    })}

                  {/* Speech bubble zones - input mode */}
                  {!submitted &&
                    myTextZones.filter(z => z.isBubble).map((zone) => (
                      <SpeechBubble
                        key={zone.id}
                        zone={zone}
                        text={textInputs[zone.id] || ''}
                        inputMode={true}
                        onInputChange={(val) => handleInputChange(zone.id, val)}
                        onDragStart={(e) => handleZoneDragStart(zone.id, e)}
                        onResizeStart={(e) => handleZoneResizeStart(zone.id, e)}
                      />
                    ))}

                  {/* If submitted, show static text (regular zones, excluding header & bubbles) */}
                  {submitted &&
                    myTextZones.filter(z => !z.isHeader && !z.isBubble).map((zone) => {
                      const zoneStyle = textStyles[zone.id] || 'white'
                      return (
                        <div
                          key={zone.id}
                          style={getTextZoneDisplayStyle({ ...zone, style: zoneStyle }, '12px')}
                        >
                          {textInputs[zone.id] || ''}
                        </div>
                      )
                    })}

                  {/* Speech bubble zones - static display after submit */}
                  {submitted &&
                    myTextZones.filter(z => z.isBubble).map((zone) => (
                      <SpeechBubble
                        key={zone.id}
                        zone={zone}
                        text={textInputs[zone.id] || ''}
                        inputMode={false}
                      />
                    ))}
                </div>
              </div>
            </RetroBox>

            {/* Submissions side panel */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <RetroBox title="RÉDACTION" theme={theme} style={{ flexGrow: 1, padding: '10px' }}>
                {submitted ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '10px' }}>
                    <span style={{ fontSize: '32px' }}>✔</span>
                    <p style={{ textAlign: 'center', fontFamily: 'var(--font-press-start)', fontSize: '14px' }}>
                      MEME ENVOYÉ ! ATTENTE DES AUTRES JOUEURS...
                    </p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <p style={{ fontSize: '16px', margin: 0 }}>Remplissez les zones de texte à gauche ou ci-dessous :</p>
                    {currentImage.text_zones.map((zone) => {
                      const normalZones = currentImage.text_zones.filter(z => !z.isHeader && !z.isBubble);
                      const bubbleZones = currentImage.text_zones.filter(z => z.isBubble);
                      const label = zone.isHeader
                        ? '🔲 EN-TÊTE'
                        : zone.isBubble
                          ? `💬 BULLE ${bubbleZones.indexOf(zone) + 1}`
                          : `📝 TEXTE ${normalZones.indexOf(zone) + 1}`;
                      return (
                        <div key={zone.id} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <label style={{ fontFamily: 'var(--font-press-start)', fontSize: '10px' }}>{label}</label>
                          <textarea
                            value={textInputs[zone.id] || ''}
                            onChange={(e) => handleInputChange(zone.id, e.target.value)}
                            placeholder={zone.placeholder}
                            rows={2}
                            onInput={(e) => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
                            style={{
                              width: '100%',
                              padding: '6px 8px',
                              border: '2px solid var(--border)',
                              fontFamily: "'Impact', 'Arial Black', sans-serif",
                              fontSize: '14px',
                              backgroundColor: 'var(--code-bg)',
                              color: 'var(--text)',
                              resize: 'none',
                              overflow: 'hidden',
                              boxSizing: 'border-box',
                            }}
                          />
                        </div>
                      )
                    })}
                  </div>
                )}
              </RetroBox>

              {/* Change #3: Swap image button */}
              {!submitted && (
                <RetroButton
                  onClick={handleSwapImage}
                  theme={theme}
                  style={{
                    width: '100%',
                    opacity: swapsLeft <= 0 ? 0.5 : 1,
                    cursor: swapsLeft <= 0 ? 'not-allowed' : 'pointer',
                  }}
                  disabled={swapsLeft <= 0}
                >
                  🔄 CHANGER D'IMAGE ({swapsLeft} restants)
                </RetroButton>
              )}

              {!submitted && (
                <RetroButton onClick={handleSubmitMeme} theme={theme} style={{ width: '100%' }}>
                  VALIDER LE MEME !
                </RetroButton>
              )}
            </div>
          </div>
        </div>
      )}

      {/* PHASE 2: VOTING PHASE */}
      {phase === 'voting' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {allMemes.length === 0 ? (
            <RetroBox title="VOTES" theme={theme}>
              <p style={{ textAlign: 'center' }}>Aucun meme n'a été soumis cette manche...</p>
            </RetroBox>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                <span style={{ fontFamily: 'var(--font-press-start)', fontSize: '12px' }}>
                  MEME {currentMemeIndex + 1} SUR {allMemes.length}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                  {(isHost || isAdmin) && (
                    <button
                      onClick={handleHostForceNextMeme}
                      className="retro-button-danger"
                      style={{
                        fontFamily: 'var(--font-press-start)',
                        fontSize: '10px',
                        padding: '6px 12px',
                        backgroundColor: '#e63946',
                        color: '#fff',
                        border: '2px solid var(--border)',
                        cursor: 'pointer',
                        borderRadius: '4px',
                        boxShadow: '2px 2px 0 var(--border)',
                      }}
                    >
                      ⚡ {currentMemeIndex + 1 < allMemes.length ? 'MEME SUIVANT' : 'VOIR RÉSULTATS'}
                    </button>
                  )}
                  <div
                    style={{
                      fontFamily: 'var(--font-press-start)',
                      fontSize: '18px',
                      color: countdown <= 5 ? '#c21a1a' : 'inherit',
                      border: '2px solid var(--border)',
                      padding: '4px 10px',
                    }}
                  >
                    TEMPS: {countdown}s
                  </div>
                </div>
              </div>

              {allMemes[currentMemeIndex] && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
                  <RetroBox
                    title={
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {allMemes[currentMemeIndex].profiles?.avatar_url && (
                          <img
                            src={allMemes[currentMemeIndex].profiles.avatar_url}
                            alt=""
                            style={{ width: '20px', height: '20px', imageRendering: 'pixelated' }}
                          />
                        )}
                        <span>MEME DE: {allMemes[currentMemeIndex].profiles?.username?.toUpperCase() || 'ANONYME'}</span>
                      </div>
                    }
                    theme={theme}
                    style={{ padding: '8px', backgroundColor: '#000', display: 'inline-block', maxWidth: '100%' }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', backgroundColor: '#fff', width: '100%', maxWidth: '100%', border: '1px solid #ccc', boxSizing: 'border-box' }}>
                      {allMemes[currentMemeIndex].text_zones.find(z => z.isHeader) && (() => {
                        const headerText = allMemes[currentMemeIndex].text_zones.find(z => z.isHeader).text || ''
                        const headerFontSize = dynamicFontSize(headerText, 24)
                        return (
                          <div style={{
                            backgroundColor: '#fff',
                            color: '#000',
                            padding: '16px 20px',
                            fontFamily: "Arial, Helvetica, sans-serif",
                            fontSize: `${headerFontSize}px`,
                            fontWeight: 'bold',
                            textAlign: 'center',
                            wordBreak: 'break-word',
                            width: '100%',
                            boxSizing: 'border-box',
                          }}>
                            {headerText}
                          </div>
                        )
                      })()}
                      <div style={{ position: 'relative', display: 'inline-block', maxWidth: '100%', backgroundColor: '#000' }}>
                        <img
                          src={allMemes[currentMemeIndex].images?.url}
                          alt="Submitted Meme"
                          style={{
                            maxWidth: '100%',
                            maxHeight: '400px',
                            display: 'block',
                          }}
                        />
                        {allMemes[currentMemeIndex].text_zones.filter(z => !z.isHeader && !z.isBubble).map((zone) => (
                          <div
                            key={zone.id}
                            style={getTextZoneDisplayStyle(zone, '12px')}
                          >
                            {zone.text || ''}
                          </div>
                        ))}
                        {allMemes[currentMemeIndex].text_zones.filter(z => z.isBubble).map((zone) => (
                          <SpeechBubble
                            key={zone.id}
                            zone={zone}
                            text={zone.text || ''}
                            inputMode={false}
                          />
                        ))}
                      </div>
                    </div>
                  </RetroBox>

                  {/* Vote Buttons / Slider */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', width: '100%' }}>
                    {allMemes[currentMemeIndex].profile_id === user.id ? (
                      <p style={{ fontFamily: 'var(--font-press-start)', fontSize: '14px', color: '#666', margin: 0 }}>
                        C'est votre meme ! (Vous ne pouvez pas voter)
                      </p>
                    ) : (
                      <>
                        {votingMode === 'slider' ? (
                          <>
                            <p style={{ fontFamily: 'var(--font-press-start)', fontSize: '14px', margin: '0 0 10px 0' }}>NOTEZ CE MEME :</p>
                            
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', maxWidth: '400px', gap: '15px' }}>
                              <span style={{ fontSize: '32px', fontFamily: "'Impact', 'Arial Black', sans-serif", color: 'var(--accent)', fontWeight: 'bold' }}>
                                {sliderValue} / 10
                              </span>
                              
                              <input
                                type="range"
                                min="0"
                                max="10"
                                step="1"
                                value={sliderValue}
                                onChange={(e) => setSliderValue(parseInt(e.target.value, 10))}
                                style={{
                                  width: '100%',
                                  cursor: 'pointer',
                                  accentColor: 'var(--accent)',
                                  height: '8px',
                                  backgroundColor: 'var(--code-bg)',
                                  border: '2px solid var(--border)'
                                }}
                              />
                              
                              <RetroButton
                                onClick={() => handleVote(sliderValue.toString())}
                                theme={theme}
                                style={{
                                  width: '100%',
                                  backgroundColor: myVotes[allMemes[currentMemeIndex].id] === sliderValue.toString() ? '#306230' : 'var(--accent-bg)',
                                  color: myVotes[allMemes[currentMemeIndex].id] === sliderValue.toString() ? '#fff' : 'var(--accent)',
                                }}
                              >
                                {myVotes[allMemes[currentMemeIndex].id] === sliderValue.toString() ? '✓ NOTE ENREGISTRÉE' : 'VALIDER LA NOTE'}
                              </RetroButton>
                              
                              <p style={{
                                fontFamily: 'var(--font-press-start)',
                                fontSize: '9px',
                                color: 'var(--text)',
                                opacity: 0.7,
                                textAlign: 'center',
                                margin: '10px 0 0 0',
                                lineHeight: '1.4'
                              }}>
                                Aide : Chaque point donne +100 points au créateur du meme (ex: 8/10 = +800 pts).
                              </p>
                            </div>
                          </>
                        ) : (
                          <>
                            <p style={{ fontFamily: 'var(--font-press-start)', fontSize: '14px', margin: 0 }}>VOTEZ POUR CE MEME :</p>
                            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center', width: '100%', maxWidth: '600px' }}>
                              <RetroButton
                                onClick={() => handleVote('masterclass')}
                                theme={theme}
                                style={{
                                  flex: '1 1 45%',
                                  backgroundColor: myVotes[allMemes[currentMemeIndex].id] === 'masterclass' ? '#ffd700' : 'var(--code-bg)',
                                  color: myVotes[allMemes[currentMemeIndex].id] === 'masterclass' ? '#000' : 'var(--text)',
                                }}
                              >
                                MASTERCLASS (+1000)
                              </RetroButton>
                              <RetroButton
                                onClick={() => handleVote('pas mal')}
                                theme={theme}
                                style={{
                                  flex: '1 1 45%',
                                  backgroundColor: myVotes[allMemes[currentMemeIndex].id] === 'pas mal' ? '#8bac0f' : 'var(--code-bg)',
                                  color: myVotes[allMemes[currentMemeIndex].id] === 'pas mal' ? '#fff' : 'var(--text)',
                                }}
                              >
                                PAS MAL (+400)
                              </RetroButton>
                              <RetroButton
                                onClick={() => handleVote('mouais')}
                                theme={theme}
                                style={{
                                  flex: '1 1 45%',
                                  backgroundColor: myVotes[allMemes[currentMemeIndex].id] === 'mouais' ? '#888' : 'var(--code-bg)',
                                  color: myVotes[allMemes[currentMemeIndex].id] === 'mouais' ? '#fff' : 'var(--text)',
                                }}
                              >
                                MOUAIS (0)
                              </RetroButton>
                              <RetroButton
                                onClick={() => handleVote('guez')}
                                theme={theme}
                                style={{
                                  flex: '1 1 45%',
                                  backgroundColor: myVotes[allMemes[currentMemeIndex].id] === 'guez' ? '#c21a1a' : 'var(--code-bg)',
                                  color: myVotes[allMemes[currentMemeIndex].id] === 'guez' ? '#fff' : 'var(--text)',
                                }}
                              >
                                GUEZ (-500)
                              </RetroButton>
                            </div>

                            {/* Pokéball Bonus Button */}
                            <RetroButton
                              onClick={handlePokeballToggle}
                              theme={theme}
                              style={{
                                backgroundColor: myPokeballMemeId === allMemes[currentMemeIndex].id ? '#ffcb05' : 'var(--code-bg)',
                                color: myPokeballMemeId === allMemes[currentMemeIndex].id ? '#000' : 'var(--text)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '8px',
                                padding: '8px 16px',
                                border: '2px solid var(--border)',
                                fontFamily: 'var(--font-press-start)',
                                fontSize: '11px',
                                marginTop: '10px'
                              }}
                            >
                              <svg width="18" height="18" viewBox="0 0 24 24" style={{ display: 'inline-block' }}>
                                <circle cx="12" cy="12" r="10" fill="#fff" stroke="#000" strokeWidth="2" />
                                <path d="M 2 12 A 10 10 0 0 1 22 12 Z" fill="#e21a1a" stroke="#000" strokeWidth="2" />
                                <line x1="2" y1="12" x2="22" y2="12" stroke="#000" strokeWidth="2" />
                                <circle cx="12" cy="12" r="3" fill="#fff" stroke="#000" strokeWidth="2" />
                              </svg>
                              {myPokeballMemeId === allMemes[currentMemeIndex].id ? 'BONUS POKÉBALL ACTIVÉ (+200)' : 'BONUS POKÉBALL (+200)'}
                            </RetroButton>
                          </>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* PHASE 3: RESULTS PHASE */}
      {phase === 'results' && (() => {
        const bestMemeIds = getBestMemeIds()
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <RetroBox title="RÉSULTATS DE LA MANCHE" theme={theme}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px' }}>
                {/* Change #12: show round number */}
                <h2 style={{ fontSize: '28px', margin: '0', textAlign: 'center' }}>🏆 MANCHE {currentRound}/{maxRounds} — GAGNANTS 🏆</h2>
                {roundWinners.length > 0 ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', justifyContent: 'center' }}>
                    {roundWinners.map((w, i) => (
                      <span
                        key={i}
                        style={{
                          fontFamily: 'var(--font-press-start)',
                          fontSize: '18px',
                          backgroundColor: 'var(--accent-bg)',
                          color: 'var(--accent)',
                          padding: '6px 12px',
                          border: '2px solid var(--accent-border)',
                        }}
                      >
                        {w.toUpperCase()}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p style={{ margin: 0, fontStyle: 'italic' }}>Aucun meme n'a marqué de points ce round.</p>
                )}
              </div>
            </RetroBox>

            {/* List of Memes Submitted with Votes count — Change #9: Larger cards */}
            <RetroBox title="DÉTAIL DES VOTES" theme={theme}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                {votesData.map((data, index) => {
                  const memeRecord = allMemes.find((m) => m.id === data.memeId)
                  const masterclassVotes = data.votes.filter((v) => v.vote === 'masterclass').length
                  const pasMalVotes = data.votes.filter((v) => v.vote === 'pas mal').length
                  const mouaisVotes = data.votes.filter((v) => v.vote === 'mouais').length
                  const guezVotes = data.votes.filter((v) => v.vote === 'guez').length
                  const pokeballVotes = data.votes.filter((v) => v.pokeball_bonus).length
                  
                  let pointsGained = 0
                  data.votes.forEach(v => {
                    if (memeRecord && v.voter_id !== memeRecord.profile_id) {
                      if (v.vote === 'masterclass') pointsGained += 1000
                      else if (v.vote === 'pas mal') pointsGained += 400
                      else if (v.vote === 'mouais') pointsGained += 0
                      else if (v.vote === 'guez') pointsGained -= 500
                      else if (!isNaN(parseInt(v.vote, 10))) pointsGained += parseInt(v.vote, 10) * 100
                      
                      if (v.pokeball_bonus) pointsGained += 200
                    }
                  })
                  const isBestMeme = bestMemeIds.has(data.memeId)

                  // Calculate average rating for slider mode
                  let avgRating = 0
                  const sliderVotes = data.votes.filter(v => !isNaN(parseInt(v.vote, 10)))
                  if (sliderVotes.length > 0) {
                    const sum = sliderVotes.reduce((acc, v) => acc + parseInt(v.vote, 10), 0)
                    avgRating = (sum / sliderVotes.length).toFixed(1)
                  }

                  return (
                    <div
                      key={index}
                      style={{
                        borderBottom: index < votesData.length - 1 ? '2px dashed var(--border)' : 'none',
                        paddingBottom: '24px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '12px',
                        alignItems: 'center',
                      }}
                    >
                      {/* Change #10: Best meme badge */}
                      {isBestMeme && (
                        <div style={{
                          background: 'linear-gradient(135deg, #ffd700, #ffaa00)',
                          color: '#000',
                          fontFamily: 'var(--font-press-start)',
                          fontSize: '12px',
                          padding: '6px 16px',
                          border: '3px solid #000',
                          textAlign: 'center',
                          animation: 'retro-blink 1s steps(2, end) infinite',
                        }}>
                          🌟 MEILLEUR MEME DU ROUND 🌟
                        </div>
                      )}

                      {/* Change #9: Larger meme display - vertical layout */}
                      {memeRecord && (
                        <div style={{
                          display: 'flex',
                          flexDirection: 'column',
                          backgroundColor: '#fff',
                          width: '100%',
                          maxWidth: '500px',
                          border: '1px solid #ccc',
                          boxSizing: 'border-box'
                        }}>
                          {memeRecord.text_zones.find(z => z.isHeader) && (() => {
                            const headerText = memeRecord.text_zones.find(z => z.isHeader).text || ''
                            const headerFontSize = dynamicFontSize(headerText, 22)
                            return (
                              <div style={{
                                backgroundColor: '#fff',
                                color: '#000',
                                padding: '16px 20px',
                                fontFamily: "Arial, Helvetica, sans-serif",
                                fontSize: `${headerFontSize}px`,
                                fontWeight: 'bold',
                                textAlign: 'center',
                                wordBreak: 'break-word',
                                width: '100%',
                                boxSizing: 'border-box',
                              }}>
                                {headerText}
                              </div>
                            )
                          })()}
                          <div style={{ position: 'relative', width: '100%', backgroundColor: '#000', boxSizing: 'border-box' }}>
                            <img
                              src={memeRecord.images?.url}
                              alt="Thumb"
                              style={{ width: '100%', display: 'block', maxHeight: '400px', objectFit: 'contain' }}
                            />
                            {memeRecord.text_zones.filter(z => !z.isHeader && !z.isBubble).map((zone) => (
                               <div
                                 key={zone.id}
                                 style={getTextZoneDisplayStyle(zone, '14px')}
                               >
                                 {zone.text || ''}
                               </div>
                             ))}
                             {memeRecord.text_zones.filter(z => z.isBubble).map((zone) => (
                               <SpeechBubble
                                 key={zone.id}
                                 zone={zone}
                                 text={zone.text || ''}
                                 inputMode={false}
                               />
                             ))}
                          </div>
                        </div>
                      )}

                      {/* Votes breakdown */}
                      <div style={{ width: '100%', maxWidth: '500px', textAlign: 'center' }}>
                        <p style={{ margin: '0 0 8px 0', fontFamily: 'var(--font-press-start)', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                          {data.avatarUrl && (
                            <img
                              src={data.avatarUrl}
                              alt=""
                              style={{ width: '20px', height: '20px', imageRendering: 'pixelated' }}
                            />
                          )}
                          <span>Créateur: {data.username}</span>
                        </p>
                        {votingMode === 'slider' ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', alignItems: 'center' }}>
                            <span style={{ color: 'var(--accent)', fontFamily: 'var(--font-press-start)', fontSize: '12px', fontWeight: 'bold' }}>
                              NOTE MOYENNE : {avgRating} / 10
                            </span>
                            <span style={{ fontSize: '10px', color: 'var(--text)', opacity: 0.6, fontFamily: 'var(--font-press-start)' }}>
                              ({sliderVotes.length} vote{sliderVotes.length > 1 ? 's' : ''})
                            </span>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', fontSize: '14px', justifyContent: 'center' }}>
                            <span style={{ color: '#ffd700', fontFamily: 'var(--font-press-start)', fontSize: '11px' }}>MASTERCLASS: {masterclassVotes}</span>
                            <span style={{ color: '#8bac0f', fontFamily: 'var(--font-press-start)', fontSize: '11px' }}>PAS MAL: {pasMalVotes}</span>
                            <span style={{ color: '#888', fontFamily: 'var(--font-press-start)', fontSize: '11px' }}>MOUAIS: {mouaisVotes}</span>
                            <span style={{ color: '#c21a1a', fontFamily: 'var(--font-press-start)', fontSize: '11px' }}>GUEZ: {guezVotes}</span>
                            {pokeballVotes > 0 && (
                              <span style={{ color: '#ffcb05', fontFamily: 'var(--font-press-start)', fontSize: '11px' }}>🔴 POKÉBALL: {pokeballVotes}</span>
                            )}
                          </div>
                        )}
                        <p style={{ margin: '8px 0 0 0', fontSize: '18px', fontWeight: 'bold' }}>
                          POINTS GAGNÉS: {pointsGained >= 0 ? `+${pointsGained}` : pointsGained}
                        </p>
                        {/* Change #11: Download button */}
                        {memeRecord && (
                          <RetroButton
                            onClick={() => downloadMemeAsImage(memeRecord)}
                            theme={theme}
                            style={{ marginTop: '8px', fontSize: '11px' }}
                          >
                            📥 TÉLÉCHARGER
                          </RetroButton>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </RetroBox>

            {/* Cumulative Scoreboard */}
            <RetroBox title="SCOREBOARD GÉNÉRAL" theme={theme}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {players.map((plyr, idx) => (
                  <div
                    key={plyr.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '8px 12px',
                      border: '2px solid var(--border)',
                    }}
                  >
                    <span style={{ fontSize: '18px', fontFamily: 'var(--font-press-start)' }}>
                      #{idx + 1} {plyr.profiles?.username}
                    </span>
                    <span style={{ fontSize: '20px', fontWeight: 'bold' }}>{plyr.score} PTS</span>
                  </div>
                ))}
              </div>
            </RetroBox>

            {/* Host Next Steps Controls — Change #12: rounds loop */}
            {(isHost || isAdmin) && (
              <div style={{ display: 'flex', gap: '15px' }}>
                {currentRound >= maxRounds ? (
                  <RetroButton onClick={handleEndGame} theme={theme} style={{ flex: 1, backgroundColor: '#ffd700', color: '#000' }}>
                    🏆 VOIR LE PODIUM
                  </RetroButton>
                ) : (
                  <>
                    <RetroButton onClick={() => startNewRound()} theme={theme} style={{ flex: 1 }}>
                      MANCHE SUIVANTE
                    </RetroButton>
                    <RetroButton onClick={handleEndGame} theme={theme} style={{ flex: 1, backgroundColor: '#c21a1a', color: '#fff' }}>
                      TERMINER LE JEU
                    </RetroButton>
                  </>
                )}
              </div>
            )}
          </div>
        )
      })()}

      {/* PHASE 4: GAME OVER / PODIUM PHASE */}
      {phase === 'ended' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <RetroBox title="FIN DE LA PARTIE - PODIUM" theme={theme}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '30px', padding: '20px 0' }}>
              <h1 style={{ fontFamily: 'var(--font-press-start)', fontSize: '28px', margin: 0, textAlign: 'center' }}>
                FIN DU MATCH !
              </h1>

              {/* Graphical Podium */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-end',
                  justifyContent: 'center',
                  gap: '20px',
                  width: '100%',
                  maxWidth: '500px',
                  height: '240px',
                  borderBottom: '4px solid var(--border)',
                  paddingBottom: '10px',
                }}
              >
                {/* 2nd Place */}
                {players[1] && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100px' }}>
                    {players[1].profiles?.avatar_url && (
                      <img
                        src={players[1].profiles.avatar_url}
                        alt=""
                        style={{ width: '48px', height: '48px', imageRendering: 'pixelated', marginBottom: '4px' }}
                      />
                    )}
                    <span style={{ fontSize: '14px', fontFamily: 'var(--font-press-start)', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>
                      {players[1].profiles?.username}
                    </span>
                    <span style={{ fontSize: '12px', color: '#666' }}>{players[1].score} pts</span>
                    <div
                      style={{
                        width: '100%',
                        height: '100px',
                        backgroundColor: '#cfcfcf',
                        border: '4px solid var(--border)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontFamily: 'var(--font-press-start)',
                        fontSize: '24px',
                      }}
                    >
                      2
                    </div>
                  </div>
                )}

                {/* 1st Place */}
                {players[0] && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '120px' }}>
                    <span style={{ fontSize: '24px', margin: '0 0 -5px 0' }}>👑</span>
                    {players[0].profiles?.avatar_url && (
                      <img
                        src={players[0].profiles.avatar_url}
                        alt=""
                        style={{ width: '64px', height: '64px', imageRendering: 'pixelated', marginBottom: '4px' }}
                      />
                    )}
                    <span style={{ fontSize: '16px', fontFamily: 'var(--font-press-start)', fontWeight: 'bold', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>
                      {players[0].profiles?.username}
                    </span>
                    <span style={{ fontSize: '14px', fontWeight: 'bold' }}>{players[0].score} pts</span>
                    <div
                      style={{
                        width: '100%',
                        height: '140px',
                        backgroundColor: '#ffd700',
                        border: '4px solid var(--border)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontFamily: 'var(--font-press-start)',
                        fontSize: '32px',
                      }}
                    >
                      1
                    </div>
                  </div>
                )}

                {/* 3rd Place */}
                {players[2] && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100px' }}>
                    {players[2].profiles?.avatar_url && (
                      <img
                        src={players[2].profiles.avatar_url}
                        alt=""
                        style={{ width: '40px', height: '40px', imageRendering: 'pixelated', marginBottom: '4px' }}
                      />
                    )}
                    <span style={{ fontSize: '14px', fontFamily: 'var(--font-press-start)', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>
                      {players[2].profiles?.username}
                    </span>
                    <span style={{ fontSize: '12px', color: '#666' }}>{players[2].score} pts</span>
                    <div
                      style={{
                        width: '100%',
                        height: '70px',
                        backgroundColor: '#cd7f32',
                        border: '4px solid var(--border)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontFamily: 'var(--font-press-start)',
                        fontSize: '20px',
                      }}
                    >
                      3
                    </div>
                  </div>
                )}
              </div>
            </div>
          </RetroBox>

          {/* Full Scores List */}
          <RetroBox title="SCORES FINAUX" theme={theme}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {players.map((plyr, idx) => (
                <div
                  key={plyr.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 12px',
                    border: '2px solid var(--border)',
                  }}
                >
                  <span style={{ fontSize: '18px', fontFamily: 'var(--font-press-start)' }}>
                    #{idx + 1} {plyr.profiles?.username}
                  </span>
                  <span style={{ fontSize: '20px', fontWeight: 'bold' }}>{plyr.score} PTS</span>
                </div>
              ))}
            </div>
          </RetroBox>

          {/* Host Replay Controls */}
          {isHost || isAdmin ? (
            <RetroButton onClick={handleRestartLobby} theme={theme} style={{ width: '100%' }}>
              REJOUER (RETOUR AU SALON)
            </RetroButton>
          ) : (
            <RetroButton onClick={onLeave} theme={theme} style={{ width: '100%' }}>
              QUITTER LE SALON
            </RetroButton>
          )}
        </div>
      )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <RetroButton
          onClick={() => setShowSettings(true)}
          theme={theme}
          style={{ width: '100%', backgroundColor: 'var(--code-bg)', color: 'var(--text)', marginBottom: '5px' }}
        >
          ⚙ PARAMÈTRES
        </RetroButton>
        {/* Change #7: Submission count in title during writing phase */}
        <RetroBox
          title={
            phase === 'writing'
              ? `JOUEURS EN LIGNE (${submittedPlayers.size}/${players.length} soumis)`
              : 'JOUEURS EN LIGNE'
          }
          theme={theme}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {players.length === 0 ? (
              <p style={{ fontSize: '14px', fontFamily: 'var(--font-press-start)', color: '#666', margin: 0, textAlign: 'center' }}>Aucun joueur</p>
            ) : (
              players.map((plyr) => (
                <div
                  key={plyr.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 8px',
                    border: '2px solid var(--border)',
                    backgroundColor: plyr.profile_id === user.id ? 'var(--code-bg)' : 'transparent',
                    gap: '10px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                    {plyr.profiles?.avatar_url ? (
                      <img
                        src={plyr.profiles.avatar_url}
                        alt=""
                        style={{
                          width: '28px',
                          height: '28px',
                          imageRendering: 'pixelated',
                          border: '2px solid var(--border)',
                          backgroundColor: 'var(--retro-box-bg)',
                          flexShrink: 0
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          width: '28px',
                          height: '28px',
                          border: '2px dashed var(--border)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '10px',
                          fontFamily: 'var(--font-press-start)',
                          backgroundColor: 'var(--code-bg)',
                          flexShrink: 0
                        }}
                      >
                        ?
                      </div>
                    )}
                    <span 
                      style={{ 
                        overflow: 'hidden', 
                        textOverflow: 'ellipsis', 
                        whiteSpace: 'nowrap', 
                        fontSize: '11px',
                        fontFamily: 'var(--font-press-start)'
                      }}
                    >
                      {plyr.profiles?.username || 'Anonyme'}
                      {/* Change #7: submission checkmark */}
                      {phase === 'writing' && submittedPlayers.has(plyr.profile_id) && ' ✅'}
                    </span>
                  </div>
                  <span style={{ fontSize: '11px', fontFamily: 'var(--font-press-start)', fontWeight: 'bold', flexShrink: 0 }}>
                    {plyr.score} PTS
                  </span>
                </div>
              ))
            )}
          </div>
        </RetroBox>
      </div>
    </div>

      {renderSettingsModal()}
    </>
  )
}
