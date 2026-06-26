import { useState, useRef, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import { uploadTemplate, updateTemplateTextZones } from '../services/db'
import { RetroBox, RetroButton, RetroInput } from './retro'

// ─── Speech Bubble SVG overlay ───────────────────────────────────────────────
function SpeechBubble({ zone, onDelete, displayIdx, isEditing = false, onMouseDown, onTouchStart, onRotateStart }) {
  const { x, y, width, height, bubbleTail = 'bottom-left' } = zone
  return (
    <div
      id={`bubble-container-${zone.id}`}
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
      style={{
        position: 'absolute',
        left: `${x}%`,
        top: `${y}%`,
        width: `${width}%`,
        height: `${height}%`,
        pointerEvents: isEditing ? 'auto' : 'none',
        boxSizing: 'border-box',
        cursor: isEditing ? 'move' : 'default',
        transform: `rotate(${zone.rotation || 0}deg)`,
      }}
    >
      {isEditing && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          style={{
            position: 'absolute', top: '-8px', right: '-8px',
            background: '#ff0055', color: '#fff', border: 'none',
            borderRadius: '50%', width: '16px', height: '16px',
            cursor: 'pointer', fontSize: '9px', zIndex: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
          }}
        >✕</button>
      )}
      {isEditing && (
        <div
          onMouseDown={(e) => { e.stopPropagation(); onRotateStart(e) }}
          onTouchStart={(e) => { e.stopPropagation(); onRotateStart(e) }}
          style={{
            position: 'absolute', top: '-24px', left: '50%', transform: 'translateX(-50%)',
            width: '20px', height: '20px', borderRadius: '50%',
            backgroundColor: '#8bac0f', border: '2px solid #306230', color: '#fff',
            cursor: 'grab', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '11px', zIndex: 15, userSelect: 'none', lineHeight: 1,
          }}
          title="Faire pivoter la bulle"
        >
          ↻
        </div>
      )}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none"
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}>
        <ellipse cx="50" cy="45" rx="48" ry="43" fill="white" stroke="#000" strokeWidth="3" />
        {bubbleTail === 'bottom-left' && <polygon points="15,80 0,105 35,80" fill="white" stroke="#000" strokeWidth="2.5" strokeLinejoin="round" />}
        {bubbleTail === 'bottom-right' && <polygon points="85,80 100,105 65,80" fill="white" stroke="#000" strokeWidth="2.5" strokeLinejoin="round" />}
        {bubbleTail === 'top-left' && <polygon points="15,15 0,-10 35,15" fill="white" stroke="#000" strokeWidth="2.5" strokeLinejoin="round" />}
        {bubbleTail === 'top-right' && <polygon points="85,15 100,-10 65,15" fill="white" stroke="#000" strokeWidth="2.5" strokeLinejoin="round" />}
      </svg>
      <div style={{
        position: 'absolute', top: '12%', left: '10%', width: '80%', height: '65%',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        textAlign: 'center', fontSize: '9px', fontFamily: 'Arial, Helvetica, sans-serif',
        fontWeight: 'bold', color: '#000', wordBreak: 'break-word', lineHeight: 1.2,
        overflow: 'hidden', pointerEvents: 'none',
      }}>
        {zone.placeholder || `💬 ${displayIdx}`}
      </div>
      {isEditing && (
        <div style={{
          position: 'absolute', bottom: '3px', left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.7)', color: '#fff', fontSize: '7px',
          fontFamily: 'var(--font-press-start)', padding: '1px 3px', whiteSpace: 'nowrap', pointerEvents: 'none',
        }}>B{displayIdx}</div>
      )}
    </div>
  )
}

// Helper to convert base64 data URL back to Blob (Issue 5)
function dataURLtoBlob(dataurl) {
  var arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1],
      bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
  while(n--){
      u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], {type:mime});
}

// ─── Crop Overlay (drawn on top of image) ────────────────────────────────────
function CropOverlay({ cropRect, containerRef, onCropChange }) {
  const isDrawingRef = useRef(false)
  const startRef = useRef({ x: 0, y: 0 })
  const activeCornerRef = useRef(null)
  const fixedPointRef = useRef({ x: 0, y: 0 })

  const getRelCoords = (clientX, clientY) => {
    const rect = containerRef.current.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100)),
      y: Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100)),
    }
  }

  const startCornerDrag = (corner, e) => {
    e.preventDefault()
    e.stopPropagation()
    activeCornerRef.current = corner

    let fixedX = 0
    let fixedY = 0
    if (corner === 'nw') {
      fixedX = cropRect.x + cropRect.width
      fixedY = cropRect.y + cropRect.height
    } else if (corner === 'ne') {
      fixedX = cropRect.x
      fixedY = cropRect.y + cropRect.height
    } else if (corner === 'sw') {
      fixedX = cropRect.x + cropRect.width
      fixedY = cropRect.y
    } else if (corner === 'se') {
      fixedX = cropRect.x
      fixedY = cropRect.y
    }
    fixedPointRef.current = { x: fixedX, y: fixedY }
  }

  const updateCropFromCorner = (mouseX, mouseY) => {
    const corner = activeCornerRef.current
    if (!corner) return

    let targetX = mouseX
    let targetY = mouseY

    if (corner === 'nw') {
      targetX = Math.max(0, Math.min(fixedPointRef.current.x - 5, targetX))
      targetY = Math.max(0, Math.min(fixedPointRef.current.y - 5, targetY))
    } else if (corner === 'ne') {
      targetX = Math.min(100, Math.max(fixedPointRef.current.x + 5, targetX))
      targetY = Math.max(0, Math.min(fixedPointRef.current.y - 5, targetY))
    } else if (corner === 'sw') {
      targetX = Math.max(0, Math.min(fixedPointRef.current.x - 5, targetX))
      targetY = Math.min(100, Math.max(fixedPointRef.current.y + 5, targetY))
    } else if (corner === 'se') {
      targetX = Math.min(100, Math.max(fixedPointRef.current.x + 5, targetX))
      targetY = Math.min(100, Math.max(fixedPointRef.current.y + 5, targetY))
    }

    onCropChange({
      x: Math.min(fixedPointRef.current.x, targetX),
      y: Math.min(fixedPointRef.current.y, targetY),
      width: Math.abs(fixedPointRef.current.x - targetX),
      height: Math.abs(fixedPointRef.current.y - targetY),
    })
  }

  const handleMouseDown = (e) => {
    e.preventDefault()
    e.stopPropagation()
    isDrawingRef.current = true
    const { x, y } = getRelCoords(e.clientX, e.clientY)
    startRef.current = { x, y }
    onCropChange({ x, y, width: 0, height: 0 })
  }

  const handleMouseMove = (e) => {
    if (activeCornerRef.current) {
      e.preventDefault()
      const { x, y } = getRelCoords(e.clientX, e.clientY)
      updateCropFromCorner(x, y)
      return
    }
    if (!isDrawingRef.current) return
    const { x, y } = getRelCoords(e.clientX, e.clientY)
    const rx = Math.min(startRef.current.x, x)
    const ry = Math.min(startRef.current.y, y)
    onCropChange({ x: rx, y: ry, width: Math.abs(x - startRef.current.x), height: Math.abs(y - startRef.current.y) })
  }

  const handleMouseUp = () => {
    isDrawingRef.current = false
    activeCornerRef.current = null
  }

  // Touch support
  const handleTouchStart = (e) => {
    e.stopPropagation()
    isDrawingRef.current = true
    const { x, y } = getRelCoords(e.touches[0].clientX, e.touches[0].clientY)
    startRef.current = { x, y }
    onCropChange({ x, y, width: 0, height: 0 })
  }

  const handleTouchMove = (e) => {
    if (activeCornerRef.current) {
      e.preventDefault()
      const { x, y } = getRelCoords(e.touches[0].clientX, e.touches[0].clientY)
      updateCropFromCorner(x, y)
      return
    }
    if (!isDrawingRef.current) return
    const { x, y } = getRelCoords(e.touches[0].clientX, e.touches[0].clientY)
    const rx = Math.min(startRef.current.x, x)
    const ry = Math.min(startRef.current.y, y)
    onCropChange({ x: rx, y: ry, width: Math.abs(x - startRef.current.x), height: Math.abs(y - startRef.current.y) })
  }

  const hasCrop = cropRect && cropRect.width > 2 && cropRect.height > 2

  const corners = [
    { key: 'nw', cx: 0, cy: 0, cursor: 'nwse-resize' },
    { key: 'ne', cx: 100, cy: 0, cursor: 'nesw-resize' },
    { key: 'sw', cx: 0, cy: 100, cursor: 'nesw-resize' },
    { key: 'se', cx: 100, cy: 100, cursor: 'nwse-resize' }
  ]

  return (
    <div
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleMouseUp}
      style={{
        position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
        cursor: 'crosshair', touchAction: 'none', zIndex: 20,
      }}
    >
      {/* Dark overlay outside crop */}
      {hasCrop && (
        <>
          {/* Top */}
          <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: `${cropRect.y}%`, background: 'rgba(0,0,0,0.55)', pointerEvents: 'none' }} />
          {/* Bottom */}
          <div style={{ position: 'absolute', top: `${cropRect.y + cropRect.height}%`, left: 0, width: '100%', bottom: 0, background: 'rgba(0,0,0,0.55)', pointerEvents: 'none' }} />
          {/* Left */}
          <div style={{ position: 'absolute', top: `${cropRect.y}%`, left: 0, width: `${cropRect.x}%`, height: `${cropRect.height}%`, background: 'rgba(0,0,0,0.55)', pointerEvents: 'none' }} />
          {/* Right */}
          <div style={{ position: 'absolute', top: `${cropRect.y}%`, left: `${cropRect.x + cropRect.width}%`, right: 0, height: `${cropRect.height}%`, background: 'rgba(0,0,0,0.55)', pointerEvents: 'none' }} />
          {/* Crop border + rule-of-thirds grid */}
          <div style={{
            position: 'absolute',
            left: `${cropRect.x}%`, top: `${cropRect.y}%`,
            width: `${cropRect.width}%`, height: `${cropRect.height}%`,
            border: '2px solid #00ffcc',
            pointerEvents: 'none',
            boxSizing: 'border-box',
          }}>
            {/* Rule of thirds lines */}
            {[33.33, 66.66].map(p => (
              <div key={`h${p}`} style={{ position: 'absolute', top: `${p}%`, left: 0, width: '100%', height: '1px', background: 'rgba(255,255,255,0.35)' }} />
            ))}
            {[33.33, 66.66].map(p => (
              <div key={`v${p}`} style={{ position: 'absolute', left: `${p}%`, top: 0, height: '100%', width: '1px', background: 'rgba(255,255,255,0.35)' }} />
            ))}
            {/* Corner handles */}
            {corners.map(({ key, cx, cy, cursor }) => (
              <div
                key={key}
                onMouseDown={(e) => startCornerDrag(key, e)}
                onTouchStart={(e) => startCornerDrag(key, e)}
                style={{
                  position: 'absolute', width: '12px', height: '12px',
                  left: `${cx}%`, top: `${cy}%`,
                  transform: 'translate(-50%,-50%)',
                  background: '#00ffcc', border: '2px solid #000',
                  cursor: cursor,
                  pointerEvents: 'auto',
                  zIndex: 25,
                }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}


// ─── Main Component ───────────────────────────────────────────────────────────
export default function ImageZoneEditor({ 
  theme = 'default', 
  onUploadSuccess,
  editMode = false,
  templateRecord = null,
  onSaveSuccess = null,
  onCancel = null
}) {
  const { user, role } = useAuth()

  const [imageFile, setImageFile] = useState(null)
  const [imageSrc, setImageSrc] = useState(templateRecord ? templateRecord.url : '')
  const [templateName, setTemplateName] = useState(templateRecord ? templateRecord.name : '')

  // Undo / Redo history
  const [history, setHistory] = useState([templateRecord ? (templateRecord.text_zones || []) : []])
  const [historyIdx, setHistoryIdx] = useState(0)
  const zones = history[historyIdx]


  const pushZones = useCallback((newZones) => {
    setHistory(prev => [...prev.slice(0, historyIdx + 1), newZones])
    setHistoryIdx(prev => prev + 1)
  }, [historyIdx])

  const undo = () => { if (historyIdx > 0) setHistoryIdx(i => i - 1) }
  const redo = () => { if (historyIdx < history.length - 1) setHistoryIdx(i => i + 1) }

  const [isDrawing, setIsDrawing] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [dragCurrent, setDragCurrent] = useState({ x: 0, y: 0 })
  const [drawMode, setDrawMode] = useState('text') // 'text' | 'bubble'

  // Dragging state
  const [draggingZoneId, setDraggingZoneId] = useState(null)
  const dragOffsetRef = useRef({ x: 0, y: 0 })
  const dragStartZonesRef = useRef(null)

  const handleZoneDragStart = (zoneId, e) => {
    e.stopPropagation()
    if (e.touches) {
      // Prevent browser default behavior like scroll/zoom when dragging on mobile
      e.preventDefault()
    }
    const clientX = e.clientX !== undefined ? e.clientX : e.touches?.[0]?.clientX
    const clientY = e.clientY !== undefined ? e.clientY : e.touches?.[0]?.clientY
    if (clientX === undefined || clientY === undefined) return
    
    const { x, y } = getCoords(clientX, clientY)
    const zone = zones.find(z => z.id === zoneId)
    if (zone) {
      dragOffsetRef.current = {
        x: x - zone.x,
        y: y - zone.y
      }
      dragStartZonesRef.current = [...zones]
      setDraggingZoneId(zoneId)
    }
  }

  // Rotating state
  const [rotatingZoneId, setRotatingZoneId] = useState(null)
  const rotateCenterRef = useRef({ x: 0, y: 0 })

  const handleRotateStart = (zoneId, e) => {
    e.stopPropagation()
    if (e.touches) {
      e.preventDefault()
    }
    const clientX = e.clientX !== undefined ? e.clientX : e.touches?.[0]?.clientX
    const clientY = e.clientY !== undefined ? e.clientY : e.touches?.[0]?.clientY
    if (clientX === undefined || clientY === undefined) return

    const element = document.getElementById(`bubble-container-${zoneId}`)
    if (element) {
      const rect = element.getBoundingClientRect()
      const centerX = rect.left + rect.width / 2
      const centerY = rect.top + rect.height / 2
      rotateCenterRef.current = { x: centerX, y: centerY }
      dragStartZonesRef.current = [...zones]
      setRotatingZoneId(zoneId)
    }
  }

  // Crop state
  const [cropMode, setCropMode] = useState(false)
  const [cropRect, setCropRect] = useState(null)

  const [uploading, setUploading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [showPreviewModal, setShowPreviewModal] = useState(false)
  const [showSuccessToast, setShowSuccessToast] = useState(false)

  const containerRef = useRef(null)
  const imgRef = useRef(null)

  // ── Coordinate helpers ────────────────────────────────────────────────────
  const getCoords = (clientX, clientY) => {
    const rect = containerRef.current.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100)),
      y: Math.max(0, Math.min(100, ((clientY - rect.top) / rect.height) * 100)),
    }
  }

  // ── File ──────────────────────────────────────────────────────────────────
  const handleFileChange = (e) => {
    const file = e.target.files[0]
    if (file) {
      setImageFile(file)
      setHistory([[]]); setHistoryIdx(0)
      setErrorMsg(''); setSuccessMsg('')
      setCropMode(false); setCropRect(null)
      const reader = new FileReader()
      reader.onload = () => setImageSrc(reader.result)
      reader.readAsDataURL(file)
    }
  }

  // ── Apply crop using Canvas API ───────────────────────────────────────────
  const applyCrop = useCallback(() => {
    if (!cropRect || cropRect.width < 2 || cropRect.height < 2) return
    const img = imgRef.current
    if (!img) return

    try {
      console.log('Starting crop application with rect:', cropRect)
      const naturalW = img.naturalWidth
      const naturalH = img.naturalHeight

      const sx = (cropRect.x / 100) * naturalW
      const sy = (cropRect.y / 100) * naturalH
      const sw = (cropRect.width / 100) * naturalW
      const sh = (cropRect.height / 100) * naturalH

      const canvas = document.createElement('canvas')
      canvas.width = Math.round(sw)
      canvas.height = Math.round(sh)
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)

      // Use toDataURL (Issue 5)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.92)
      console.log('toDataURL generated successfully')

      const blob = dataURLtoBlob(dataUrl)
      console.log('dataURL converted to Blob successfully:', blob)

      const croppedFile = new File([blob], imageFile?.name || 'cropped.jpg', { type: 'image/jpeg' })
      
      setImageFile(croppedFile)
      setImageSrc(dataUrl)
      
      // Reset zones and editor state since crop changed the image geometry
      setHistory([[]])
      setHistoryIdx(0)
      setCropMode(false)
      setCropRect(null)
      console.log('Crop successfully applied and state updated')
    } catch (err) {
      console.error('Error applying crop:', err)
      setErrorMsg('Erreur lors du recadrage de l\'image: ' + err.message)
    }
  }, [cropRect, imageFile])

  // ── Mouse handlers (zone drawing) ─────────────────────────────────────────
  const handleMouseDown = (e) => {
    if (cropMode || !imageSrc || !containerRef.current || e.button !== 0) return
    const { x, y } = getCoords(e.clientX, e.clientY)
    setIsDrawing(true); setDragStart({ x, y }); setDragCurrent({ x, y })
  }

  const handleMouseMove = (e) => {
    if (cropMode || !containerRef.current) return

    if (rotatingZoneId) {
      const clientX = e.clientX !== undefined ? e.clientX : e.touches?.[0]?.clientX
      const clientY = e.clientY !== undefined ? e.clientY : e.touches?.[0]?.clientY
      if (clientX !== undefined && clientY !== undefined && rotateCenterRef.current) {
        const dx = clientX - rotateCenterRef.current.x
        const dy = clientY - rotateCenterRef.current.y
        let angle = Math.atan2(dy, dx) * (180 / Math.PI) + 90
        if (angle < 0) angle += 360
        angle = Math.round(angle)

        const updated = zones.map(z => z.id === rotatingZoneId ? {
          ...z,
          rotation: angle
        } : z)
        
        setHistory(prev => {
          const next = [...prev]
          next[historyIdx] = updated
          return next
        })
      }
      return
    }

    if (draggingZoneId) {
      const { x, y } = getCoords(e.clientX, e.clientY)
      let newX = x - dragOffsetRef.current.x
      let newY = y - dragOffsetRef.current.y
      
      const zone = zones.find(z => z.id === draggingZoneId)
      if (zone) {
        newX = Math.max(0, Math.min(100 - zone.width, newX))
        newY = Math.max(0, Math.min(100 - zone.height, newY))

        const updated = zones.map(z => z.id === draggingZoneId ? {
          ...z,
          x: parseFloat(newX.toFixed(2)),
          y: parseFloat(newY.toFixed(2))
        } : z)
        
        setHistory(prev => {
          const next = [...prev]
          next[historyIdx] = updated
          return next
        })
      }
      return
    }

    if (cropMode || !isDrawing || !containerRef.current) return
    const { x, y } = getCoords(e.clientX, e.clientY)
    setDragCurrent({ x, y })
  }

  const handleTouchStart = (e) => {
    if (cropMode || !imageSrc || !containerRef.current) return
    const { x, y } = getCoords(e.touches[0].clientX, e.touches[0].clientY)
    setIsDrawing(true); setDragStart({ x, y }); setDragCurrent({ x, y })
  }

  const handleTouchMove = (e) => {
    if (cropMode || !containerRef.current) return

    if (rotatingZoneId) {
      e.preventDefault()
      const clientX = e.touches[0].clientX
      const clientY = e.touches[0].clientY
      if (clientX !== undefined && clientY !== undefined && rotateCenterRef.current) {
        const dx = clientX - rotateCenterRef.current.x
        const dy = clientY - rotateCenterRef.current.y
        let angle = Math.atan2(dy, dx) * (180 / Math.PI) + 90
        if (angle < 0) angle += 360
        angle = Math.round(angle)

        const updated = zones.map(z => z.id === rotatingZoneId ? {
          ...z,
          rotation: angle
        } : z)
        
        setHistory(prev => {
          const next = [...prev]
          next[historyIdx] = updated
          return next
        })
      }
      return
    }

    if (draggingZoneId) {
      e.preventDefault()
      const { x, y } = getCoords(e.touches[0].clientX, e.touches[0].clientY)
      let newX = x - dragOffsetRef.current.x
      let newY = y - dragOffsetRef.current.y
      
      const zone = zones.find(z => z.id === draggingZoneId)
      if (zone) {
        newX = Math.max(0, Math.min(100 - zone.width, newX))
        newY = Math.max(0, Math.min(100 - zone.height, newY))

        const updated = zones.map(z => z.id === draggingZoneId ? {
          ...z,
          x: parseFloat(newX.toFixed(2)),
          y: parseFloat(newY.toFixed(2))
        } : z)
        
        setHistory(prev => {
          const next = [...prev]
          next[historyIdx] = updated
          return next
        })
      }
      return
    }

    if (cropMode || !isDrawing || !containerRef.current) return
    const { x, y } = getCoords(e.touches[0].clientX, e.touches[0].clientY)
    setDragCurrent({ x, y })
  }

  const handleMouseUp = () => {
    if (rotatingZoneId) {
      const finalZones = zones
      setRotatingZoneId(null)
      if (dragStartZonesRef.current) {
        const startZone = dragStartZonesRef.current.find(z => z.id === rotatingZoneId)
        const endZone = finalZones.find(z => z.id === rotatingZoneId)
        if (startZone && endZone && startZone.rotation !== endZone.rotation) {
          setHistory(prev => {
            const next = [...prev]
            next[historyIdx] = dragStartZonesRef.current
            return next
          })
          pushZones(finalZones)
        }
      }
      return
    }

    if (draggingZoneId) {
      const finalZones = zones
      setDraggingZoneId(null)
      if (dragStartZonesRef.current) {
        const startZone = dragStartZonesRef.current.find(z => z.id === draggingZoneId)
        const endZone = finalZones.find(z => z.id === draggingZoneId)
        if (startZone && endZone && (startZone.x !== endZone.x || startZone.y !== endZone.y)) {
          setHistory(prev => {
            const next = [...prev]
            next[historyIdx] = dragStartZonesRef.current
            return next
          })
          pushZones(finalZones)
        }
      }
      return
    }

    if (!isDrawing) return
    setIsDrawing(false)
    const x = Math.min(dragStart.x, dragCurrent.x)
    const y = Math.min(dragStart.y, dragCurrent.y)
    const w = Math.abs(dragStart.x - dragCurrent.x)
    const h = Math.abs(dragStart.y - dragCurrent.y)
    if (w < 2 || h < 2) return

    if (drawMode === 'bubble') {
      const tailX = dragStart.x <= dragCurrent.x ? 'left' : 'right'
      const tailY = dragStart.y <= dragCurrent.y ? 'top' : 'bottom'
      const bubbleTail = `${tailY}-${tailX}`
      const normalBubbles = zones.filter(z => z.isBubble)
      pushZones([...zones, {
        id: Date.now(), isBubble: true, bubbleTail,
        x: parseFloat(x.toFixed(2)), y: parseFloat(y.toFixed(2)),
        width: parseFloat(w.toFixed(2)), height: parseFloat(h.toFixed(2)),
        w: parseFloat(w.toFixed(2)), h: parseFloat(h.toFixed(2)),
        placeholder: `TEXTE BULLE ${normalBubbles.length + 1}`,
      }])
    } else {
      const normalZones = zones.filter(z => !z.isHeader && !z.isBubble)
      pushZones([...zones, {
        id: Date.now(),
        x: parseFloat(x.toFixed(2)), y: parseFloat(y.toFixed(2)),
        width: parseFloat(w.toFixed(2)), height: parseFloat(h.toFixed(2)),
        w: parseFloat(w.toFixed(2)), h: parseFloat(h.toFixed(2)),
        placeholder: `TEXTE ${normalZones.length + 1}`,
      }])
    }
  }

  // ── Zone helpers ──────────────────────────────────────────────────────────
  const deleteZone = (id) => pushZones(zones.filter(z => z.id !== id))
  const addHeader = () => pushZones([{ id: 'header', isHeader: true, x: 0, y: 0, width: 100, height: 0, w: 100, h: 0, placeholder: 'EN-TÊTE' }, ...zones])
  const removeHeader = () => pushZones(zones.filter(z => !z.isHeader))

  // ── Upload ────────────────────────────────────────────────────────────────
  const handleUpload = async (e) => {
    if (e) e.preventDefault()
    if (!imageSrc) { setErrorMsg('Veuillez sélectionner une image.'); return }
    if (!templateName.trim()) { setErrorMsg('Veuillez donner un nom au modèle.'); return }
    if (zones.length === 0) { setErrorMsg('Veuillez définir au moins une zone de texte.'); return }
    setUploading(true); setErrorMsg(''); setSuccessMsg('')
    try {
      const textZonesData = zones.map((z, idx) => ({
        id: z.id === 'header' ? 'header' : idx + 1,
        x: z.x, y: z.y, width: z.width, height: z.height, w: z.w, h: z.h,
        placeholder: z.placeholder,
        isHeader: z.isHeader || false,
        isBubble: z.isBubble || false,
        bubbleTail: z.bubbleTail || null,
        rotation: z.rotation || 0,
      }))
      if (editMode && templateRecord) {
        await updateTemplateTextZones(templateRecord.id, textZonesData, templateName)
        setSuccessMsg('Modèle mis à jour avec succès !')
        setShowSuccessToast(true)
        setTimeout(() => setShowSuccessToast(false), 3000)
        if (onSaveSuccess) onSaveSuccess()
      } else {
        await uploadTemplate(imageFile, templateName, user.id, role, textZonesData)
        setSuccessMsg('Modèle téléversé avec succès !' + (role !== 'creator' ? ' En attente de modération.' : ''))
        setShowSuccessToast(true)
        setTimeout(() => setShowSuccessToast(false), 6000)
        setImageFile(null); setImageSrc(''); setTemplateName('')
        setHistory([[]]); setHistoryIdx(0)
        if (onUploadSuccess) onUploadSuccess()
      }
    } catch (err) {
      console.error(err)
      setErrorMsg('Erreur lors de la sauvegarde: ' + err.message)
    } finally {
      setUploading(false)
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const drawX = Math.min(dragStart.x, dragCurrent.x)
  const drawY = Math.min(dragStart.y, dragCurrent.y)
  const drawW = Math.abs(dragStart.x - dragCurrent.x)
  const drawH = Math.abs(dragStart.y - dragCurrent.y)
  const canUndo = historyIdx > 0
  const canRedo = historyIdx < history.length - 1
  const normalZones = zones.filter(z => !z.isHeader && !z.isBubble)
  const bubbleZones = zones.filter(z => z.isBubble)

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <RetroBox title="ÉDITEUR DE ZONE D'IMAGE" theme={theme} className="main-card">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <p style={{ margin: 0, fontSize: '18px' }}>
          Importez une image, recadrez-la si besoin, puis dessinez des zones de texte ou des bulles de BD.
        </p>

        {errorMsg && (
          <div style={{ color: '#c21a1a', border: '2px solid #c21a1a', padding: '8px', fontFamily: 'var(--font-press-start)', fontSize: '12px' }}>
            [ERREUR] {errorMsg}
          </div>
        )}
        {successMsg && (
          <div style={{ color: '#306230', border: '2px solid #306230', padding: '8px', fontFamily: 'var(--font-press-start)', fontSize: '12px' }}>
            [SUCCÈS] {successMsg}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', minHeight: '300px' }} className="editor-grid">

          {/* ── Left: image canvas ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>

            {/* Tool bar */}
            {imageSrc && (
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                {/* Mode buttons (disabled during crop) */}
                <RetroButton
                  onClick={() => { setCropMode(false); setDrawMode('text') }}
                  disabled={cropMode}
                  theme={theme}
                  style={{
                    flex: 1, fontSize: '10px', minWidth: '80px',
                    backgroundColor: !cropMode && drawMode === 'text' ? 'var(--accent-bg)' : 'var(--code-bg)',
                    color: !cropMode && drawMode === 'text' ? 'var(--accent)' : 'var(--text)',
                    outline: !cropMode && drawMode === 'text' ? '2px solid var(--accent)' : 'none',
                    opacity: cropMode ? 0.4 : 1,
                  }}
                >📝 TEXTE</RetroButton>

                <RetroButton
                  onClick={() => { setCropMode(false); setDrawMode('bubble') }}
                  disabled={cropMode}
                  theme={theme}
                  style={{
                    flex: 1, fontSize: '10px', minWidth: '80px',
                    backgroundColor: !cropMode && drawMode === 'bubble' ? '#8bac0f' : 'var(--code-bg)',
                    color: !cropMode && drawMode === 'bubble' ? '#fff' : 'var(--text)',
                    outline: !cropMode && drawMode === 'bubble' ? '2px solid #8bac0f' : 'none',
                    opacity: cropMode ? 0.4 : 1,
                  }}
                >💬 BULLE</RetroButton>

                <RetroButton
                  onClick={() => { setDrawMode('text'); setCropMode(true); setCropRect(null) }}
                  theme={theme}
                  style={{
                    flex: 1, fontSize: '10px', minWidth: '80px',
                    backgroundColor: cropMode ? '#e07000' : 'var(--code-bg)',
                    color: cropMode ? '#fff' : 'var(--text)',
                    outline: cropMode ? '2px solid #e07000' : 'none',
                  }}
                >✂️ RECADRER</RetroButton>

                {/* Undo / Redo */}
                <RetroButton onClick={undo} disabled={!canUndo || cropMode} theme={theme}
                  style={{ padding: '6px 10px', fontSize: '14px', opacity: canUndo && !cropMode ? 1 : 0.35 }} title="Annuler">↩</RetroButton>
                <RetroButton onClick={redo} disabled={!canRedo || cropMode} theme={theme}
                  style={{ padding: '6px 10px', fontSize: '14px', opacity: canRedo && !cropMode ? 1 : 0.35 }} title="Rétablir">↪</RetroButton>
              </div>
            )}

            {/* Crop mode hint banner */}
            {cropMode && (
              <div style={{
                background: '#e07000', color: '#fff', padding: '6px 10px',
                fontFamily: 'var(--font-press-start)', fontSize: '10px', textAlign: 'center',
                border: '2px solid #8a4400',
              }}>
                ✂️ MODE RECADRAGE — Glissez pour sélectionner la zone à conserver
              </div>
            )}

            <RetroBox title="IMAGE" theme={theme} style={{ padding: '8px', minHeight: '260px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' }}>
              {!imageSrc ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                  <input type="file" accept="image/*" id="template-file-input" onChange={handleFileChange} style={{ display: 'none' }} />
                  <RetroButton onClick={() => document.getElementById('template-file-input').click()} theme={theme}>
                    CHOISIR UNE IMAGE
                  </RetroButton>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', backgroundColor: '#fff', width: 'fit-content', maxWidth: '100%', margin: '0 auto', border: '1px solid #ccc' }}>
                  {/* Optional white header preview */}
                  {zones.find(z => z.isHeader) && (
                    <div style={{
                      backgroundColor: '#fff', color: '#000', padding: '16px 20px',
                      fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '22px', fontWeight: 'bold',
                      textAlign: 'center', wordBreak: 'break-word',
                    }}>
                      {zones.find(z => z.isHeader).placeholder}
                    </div>
                  )}

                  {/* Image drawing / crop canvas */}
                  <div
                    ref={containerRef}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={() => isDrawing && handleMouseUp()}
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleMouseUp}
                    style={{
                      position: 'relative', display: 'inline-block',
                      cursor: cropMode ? 'default' : (drawMode === 'bubble' ? 'cell' : 'crosshair'),
                      userSelect: 'none', maxWidth: '100%', touchAction: 'none',
                    }}
                  >
                    <img
                      ref={imgRef}
                      src={imageSrc}
                      alt="Template preview"
                      style={{ maxHeight: '400px', maxWidth: '100%', display: 'block', pointerEvents: 'none' }}
                    />

                    {/* Regular text zones */}
                    {!cropMode && normalZones.map((zone) => (
                      <div key={zone.id}
                        onMouseDown={(e) => handleZoneDragStart(zone.id, e)}
                        onTouchStart={(e) => handleZoneDragStart(zone.id, e)}
                        style={{
                          position: 'absolute', left: `${zone.x}%`, top: `${zone.y}%`,
                          width: `${zone.width}%`, height: `${zone.height}%`,
                          border: '2px dashed #ff0055', backgroundColor: 'rgba(255,0,85,0.15)',
                          fontSize: '12px', fontFamily: 'var(--font-press-start)', padding: '2px',
                          boxSizing: 'border-box', overflow: 'hidden', display: 'flex',
                          flexDirection: 'column', justifyContent: 'space-between',
                          cursor: 'move',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', background: 'rgba(0,0,0,0.5)', padding: '2px' }}>
                          <span style={{ fontSize: '10px', color: '#fff' }}>T{normalZones.indexOf(zone) + 1}</span>
                          <button onClick={(e) => { e.stopPropagation(); deleteZone(zone.id) }}
                            style={{ background: '#ff0055', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '9px', padding: '0 4px', lineHeight: '12px' }}>X</button>
                        </div>
                        <div style={{ fontSize: '9px', color: '#fff', background: 'rgba(0,0,0,0.5)', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {zone.placeholder}
                        </div>
                      </div>
                    ))}

                    {/* Speech bubble zones */}
                    {!cropMode && bubbleZones.map((zone) => (
                      <SpeechBubble key={zone.id} zone={zone} displayIdx={bubbleZones.indexOf(zone) + 1}
                        isEditing={true} onDelete={() => deleteZone(zone.id)}
                        onMouseDown={(e) => handleZoneDragStart(zone.id, e)}
                        onTouchStart={(e) => handleZoneDragStart(zone.id, e)}
                        onRotateStart={(e) => handleRotateStart(zone.id, e)} />
                    ))}

                    {/* Live draw preview */}
                    {!cropMode && isDrawing && drawW > 1 && drawH > 1 && (
                      drawMode === 'bubble' ? (
                        <div style={{ position: 'absolute', left: `${drawX}%`, top: `${drawY}%`, width: `${drawW}%`, height: `${drawH}%`, pointerEvents: 'none' }}>
                          <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0.6 }}>
                            <ellipse cx="50" cy="45" rx="48" ry="43" fill="white" stroke="#8bac0f" strokeWidth="4" />
                            <polygon points="15,80 0,105 35,80" fill="white" stroke="#8bac0f" strokeWidth="3" strokeLinejoin="round" />
                          </svg>
                        </div>
                      ) : (
                        <div style={{ position: 'absolute', left: `${drawX}%`, top: `${drawY}%`, width: `${drawW}%`, height: `${drawH}%`, border: '2px solid #00ffcc', backgroundColor: 'rgba(0,255,204,0.25)', pointerEvents: 'none' }} />
                      )
                    )}

                    {/* Crop overlay */}
                    {cropMode && (
                      <CropOverlay
                        cropRect={cropRect}
                        containerRef={containerRef}
                        onCropChange={setCropRect}
                      />
                    )}
                  </div>
                </div>
              )}
            </RetroBox>

            {/* Image / header action buttons */}
            {imageSrc && !cropMode && (
              <div style={{ display: 'flex', gap: '10px' }}>
                <RetroButton onClick={() => { setImageSrc(''); setImageFile(null); setHistory([[]]); setHistoryIdx(0); setCropMode(false); setCropRect(null) }}
                  theme={theme} style={{ flex: 1, fontSize: '14px' }}>
                  CHANGER D'IMAGE
                </RetroButton>
                {zones.find(z => z.isHeader) ? (
                  <RetroButton onClick={removeHeader} theme={theme} style={{ flex: 1, backgroundColor: '#c21a1a', color: '#fff', fontSize: '14px' }}>
                    ENLEVER L'EN-TÊTE
                  </RetroButton>
                ) : (
                  <RetroButton onClick={addHeader} theme={theme} style={{ flex: 1, fontSize: '14px' }}>
                    AJOUTER EN-TÊTE BLANC
                  </RetroButton>
                )}
              </div>
            )}

            {/* Crop controls when cropMode is active (Issue 3) */}
            {imageSrc && cropMode && (
              <div style={{ display: 'flex', gap: '10px' }}>
                {cropRect && cropRect.width > 2 && cropRect.height > 2 ? (
                  <button
                    onClick={applyCrop}
                    style={{
                      flex: 1,
                      background: '#8bac0f', color: '#fff', border: '2px solid #306230',
                      fontFamily: 'var(--font-press-start)', fontSize: '10px',
                      padding: '8px 12px', cursor: 'pointer',
                    }}
                  >✔ APPLIQUER</button>
                ) : (
                  <div style={{ flex: 1, background: 'rgba(0,0,0,0.7)', color: '#fff', fontFamily: 'var(--font-press-start)', fontSize: '9px', padding: '8px 10px', display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', border: '2px solid #333' }}>
                    GLISSEZ POUR SÉLECTIONNER LA ZONE
                  </div>
                )}
                <button
                  onClick={() => { setCropMode(false); setCropRect(null) }}
                  style={{
                    flex: 1,
                    background: '#c21a1a', color: '#fff', border: '2px solid #8a0000',
                    fontFamily: 'var(--font-press-start)', fontSize: '10px',
                    padding: '8px 12px', cursor: 'pointer',
                  }}
                >✕ ANNULER</button>
              </div>
            )}
          </div>

          {/* ── Right: metadata & zone list ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <RetroInput label="NOM DU MODÈLE" value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="Ex: Drake mécontent/content" theme={theme} />

            <RetroBox title="ZONES DE TEXTE" theme={theme} style={{ flexGrow: 1, padding: '10px', maxHeight: '320px', overflowY: 'auto' }}>
              {zones.length === 0 ? (
                <p style={{ margin: 0, color: '#666', fontSize: '16px', fontStyle: 'italic' }}>
                  Aucune zone définie. Sélectionnez un mode et dessinez sur l'image.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {zones.map((zone) => {
                    const label = zone.isHeader ? '🔲 EN-TÊTE :'
                      : zone.isBubble ? `💬 B${bubbleZones.indexOf(zone) + 1} :`
                      : `📝 T${normalZones.indexOf(zone) + 1} :`
                    return (
                      <div key={zone.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px dashed var(--border)', paddingBottom: '8px' }}>
                        <span style={{ fontSize: '10px', fontFamily: 'var(--font-press-start)', minWidth: '72px', flexShrink: 0 }}>{label}</span>
                        <div style={{ flexGrow: 1, fontFamily: 'var(--font-press-start)', fontSize: '10px', color: 'var(--text)' }}>
                          {zone.placeholder}
                        </div>
                        <RetroButton onClick={() => deleteZone(zone.id)} theme={theme}
                          style={{ backgroundColor: '#c21a1a', color: '#fff', fontSize: '12px', padding: '6px 10px', flexShrink: 0 }}>
                          SUPPR
                        </RetroButton>
                      </div>
                    )
                  })}
                </div>
              )}
            </RetroBox>

            <RetroButton onClick={() => setShowPreviewModal(true)} disabled={!imageSrc} theme={theme}
              style={{ width: '100%', backgroundColor: 'var(--accent-bg)', color: 'var(--accent)', marginBottom: '10px', marginTop: 'auto' }}>
              PREVISUALISER LE RENDU
            </RetroButton>

            <div style={{ display: 'flex', gap: '10px', width: '100%', marginTop: 'auto' }}>
              {editMode && onCancel && (
                <RetroButton onClick={onCancel} disabled={uploading} theme={theme}
                  style={{ flex: 1, backgroundColor: '#c21a1a', color: '#fff' }}>
                  ANNULER
                </RetroButton>
              )}
              <RetroButton onClick={handleUpload}
                disabled={uploading || (!editMode && !imageFile) || zones.length === 0 || !templateName.trim()} theme={theme}
                style={{
                  flex: editMode ? 1 : undefined,
                  width: editMode ? undefined : '100%',
                  backgroundColor: (uploading || (!editMode && !imageFile) || zones.length === 0 || !templateName.trim()) ? '' : '#8bac0f',
                  color: (uploading || (!editMode && !imageFile) || zones.length === 0 || !templateName.trim()) ? '' : '#fff'
                }}>
                {uploading 
                  ? (editMode ? 'SAUVEGARDE...' : 'TÉLÉVERSEMENT EN COURS...') 
                  : (editMode ? 'SAUVEGARDER' : 'TÉLÉVERSER LE MODÈLE')}
              </RetroButton>
            </div>
          </div>
        </div>
      </div>

      {/* ── Preview modal ── */}
      {showPreviewModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center',
          alignItems: 'center', zIndex: 9999, padding: '20px', boxSizing: 'border-box',
        }}>
          <RetroBox title="APERÇU DE VOTRE MEME EN JEU" theme={theme} style={{ maxWidth: '550px', width: '100%', backgroundColor: 'var(--bg)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', alignItems: 'center' }}>
              <p style={{ margin: 0, textAlign: 'center', fontFamily: 'var(--font-vt323)', fontSize: '20px' }}>
                Voici comment le mème apparaîtra aux joueurs :
              </p>
              <div style={{ backgroundColor: '#000', padding: '12px', display: 'inline-block', maxWidth: '100%', border: '2px solid var(--border)', boxSizing: 'border-box' }}>
                <div style={{ display: 'flex', flexDirection: 'column', backgroundColor: '#fff', width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
                  {zones.find(z => z.isHeader) && (
                    <div style={{ backgroundColor: '#fff', color: '#000', padding: '16px 20px', fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '22px', fontWeight: 'bold', textAlign: 'center', wordBreak: 'break-word', width: '100%', boxSizing: 'border-box' }}>
                      {zones.find(z => z.isHeader).placeholder || "TEXTE DE L'EN-TÊTE"}
                    </div>
                  )}
                  <div style={{ position: 'relative', display: 'inline-block', maxWidth: '100%', backgroundColor: '#000' }}>
                    <img src={imageSrc} alt="Meme preview" style={{ maxWidth: '100%', maxHeight: '350px', display: 'block' }} />
                    {normalZones.map((zone) => (
                      <div key={zone.id} style={{
                        position: 'absolute', left: `${zone.x}%`, top: `${zone.y}%`,
                        width: `${zone.width}%`, height: `${zone.height}%`,
                        color: '#fff', textShadow: '2px 2px 0 #000,-2px -2px 0 #000,2px -2px 0 #000,-2px 2px 0 #000,0 2px 0 #000,2px 0 0 #000,0 -2px 0 #000,-2px 0 0 #000',
                        fontFamily: 'var(--font-press-start)', fontSize: '12px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        textAlign: 'center', wordBreak: 'break-word', pointerEvents: 'none', lineHeight: '1.2', textTransform: 'uppercase',
                      }}>
                        {zone.placeholder || `TEXTE ${normalZones.indexOf(zone) + 1}`}
                      </div>
                    ))}
                    {bubbleZones.map((zone) => (
                      <SpeechBubble key={zone.id} zone={zone} displayIdx={bubbleZones.indexOf(zone) + 1} isEditing={false} />
                    ))}
                  </div>
                </div>
              </div>
              <RetroButton onClick={() => setShowPreviewModal(false)} theme={theme} style={{ width: '100%', backgroundColor: '#c21a1a', color: '#fff' }}>
                RETOURNER A L'EDITEUR
              </RetroButton>
            </div>
          </RetroBox>
        </div>
      )}

      {/* ── Success toast ── */}
      {showSuccessToast && (
        <div style={{ position: 'fixed', bottom: '20px', right: '20px', zIndex: 10000, width: '320px' }}>
          <RetroBox title="🔔 NOTIFICATION" theme={theme} style={{ backgroundColor: '#e0f8cf', border: '4px solid #306230', color: '#081820', padding: '12px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontFamily: 'var(--font-vt323)', fontSize: '20px' }}>
              <div style={{ fontWeight: 'bold', color: '#306230', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>✔</span> SUCCÈS
              </div>
              <div style={{ lineHeight: '1.3', color: '#081820' }}>
                Votre modèle de mème a bien été téléversé avec succès !{' '}
                {role !== 'creator' ? 'Il est en attente de modération par un créateur.' : 'Il est disponible directement en jeu.'}
              </div>
              <RetroButton onClick={() => setShowSuccessToast(false)} theme={theme}
                style={{ padding: '4px 8px', fontSize: '12px', marginTop: '5px', backgroundColor: '#306230', color: '#fff', width: 'fit-content', alignSelf: 'flex-end' }}>
                FERMER
              </RetroButton>
            </div>
          </RetroBox>
        </div>
      )}
    </RetroBox>
  )
}
