import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { getPendingTemplates, getAllTemplates, moderateTemplate } from '../services/db'
import { RetroBox, RetroButton } from './retro'
import ImageZoneEditor from './ImageZoneEditor'

export default function AdminPanel({ theme = 'default' }) {
  const { isAdmin } = useAuth()
  const [pending, setPending] = useState([])
  const [allTemplates, setAllTemplates] = useState([])
  const [activeSubTab, setActiveSubTab] = useState('pending') // 'pending' or 'all'
  const [loading, setLoading] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const [editingTemplate, setEditingTemplate] = useState(null)

  const fetchData = async () => {
    try {
      const pendingData = await getPendingTemplates()
      setPending(pendingData)
      const allData = await getAllTemplates()
      setAllTemplates(allData)
    } catch (err) {
      console.error(err)
      setErrorMsg('Impossible de charger les modèles.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isAdmin) {
      setTimeout(() => {
        fetchData()
      }, 0)
    }
  }, [isAdmin])

  const handleModerate = async (id, approve) => {
    setErrorMsg('')
    setSuccessMsg('')
    try {
      await moderateTemplate(id, approve)
      setSuccessMsg(approve ? 'Modèle approuvé avec succès !' : 'Modèle supprimé avec succès.')
      // Refresh lists
      fetchData()
    } catch (err) {
      console.error(err)
      setErrorMsg('Erreur lors de la modération : ' + err.message)
    }
  }

  if (!isAdmin) {
    return (
      <RetroBox title="ACCÈS REFUSÉ" theme={theme}>
        <p style={{ color: '#c21a1a', textAlign: 'center', margin: 0, fontFamily: 'var(--font-press-start)', fontSize: '14px' }}>
          ERREUR: VOUS N'AVEZ PAS LES DROITS CRÉATEUR POUR MODÉRER.
        </p>
      </RetroBox>
    )
  }

  if (editingTemplate) {
    return (
      <ImageZoneEditor
        key={editingTemplate.id}
        theme={theme}
        editMode={true}
        templateRecord={editingTemplate}
        onSaveSuccess={() => {
          setEditingTemplate(null)
          fetchData()
        }}
        onCancel={() => setEditingTemplate(null)}
      />
    )
  }

  const displayedList = activeSubTab === 'pending' ? pending : allTemplates

  return (
    <RetroBox title="PANEL DE MODÉRATION (CRÉATEUR)" theme={theme} className="main-card">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <p style={{ margin: 0, fontSize: '18px' }}>
          Gérez les modèles de meme de la plateforme. Approuvez les nouveaux modèles ou supprimez les anciens.
        </p>

        {/* Tab switcher */}
        <div style={{ display: 'flex', gap: '15px', borderBottom: '2px solid var(--border)', paddingBottom: '10px' }}>
          <RetroButton
            onClick={() => setActiveSubTab('pending')}
            theme={theme}
            style={{
              backgroundColor: activeSubTab === 'pending' ? 'var(--accent-bg)' : 'var(--code-bg)',
              color: activeSubTab === 'pending' ? 'var(--accent)' : 'var(--text)',
              fontSize: '12px',
            }}
          >
            EN ATTENTE ({pending.length})
          </RetroButton>
          <RetroButton
            onClick={() => setActiveSubTab('all')}
            theme={theme}
            style={{
              backgroundColor: activeSubTab === 'all' ? 'var(--accent-bg)' : 'var(--code-bg)',
              color: activeSubTab === 'all' ? 'var(--accent)' : 'var(--text)',
              fontSize: '12px',
            }}
          >
            TOUS LES MODÈLES ({allTemplates.length})
          </RetroButton>
        </div>

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

        {loading ? (
          <p style={{ textAlign: 'center', margin: '20px 0' }}>CHARGEMENT DES MODÈLES...</p>
        ) : displayedList.length === 0 ? (
          <p style={{ textAlign: 'center', margin: '20px 0', color: '#666', fontStyle: 'italic' }}>
            {activeSubTab === 'pending' ? 'Aucun modèle en attente de modération.' : 'Aucun modèle téléversé.'}
          </p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
            {displayedList.map((img) => (
              <RetroBox key={img.id} title={img.name || 'Sans titre'} theme={theme} style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  backgroundColor: '#fff',
                  width: '100%',
                  height: '180px',
                  border: '1px solid #ccc',
                  boxSizing: 'border-box',
                  overflow: 'hidden',
                  position: 'relative'
                }}>
                  {img.text_zones?.find(z => z.isHeader) && (
                    <div style={{
                      backgroundColor: '#fff',
                      color: '#000',
                      padding: '6px 8px',
                      fontFamily: 'Arial, Helvetica, sans-serif',
                      fontSize: '11px',
                      fontWeight: 'bold',
                      textAlign: 'center',
                      wordBreak: 'break-word',
                      width: '100%',
                      boxSizing: 'border-box',
                    }}>
                      {img.text_zones.find(z => z.isHeader).placeholder}
                    </div>
                  )}
                  <div style={{
                    position: 'relative',
                    flexGrow: 1,
                    width: '100%',
                    backgroundColor: '#000',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    overflow: 'hidden'
                  }}>
                    <img
                      src={img.url}
                      alt={img.name}
                      style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain', display: 'block' }}
                    />
                    {img.text_zones?.filter(z => !z.isHeader).map((zone) => {
                      const normalZones = img.text_zones.filter(z => !z.isHeader);
                      return (
                        <div
                          key={zone.id}
                          style={{
                            position: 'absolute',
                            left: `${zone.x}%`,
                            top: `${zone.y}%`,
                            width: `${zone.width}%`,
                            height: `${zone.height}%`,
                            color: '#fff',
                            textShadow: '1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000',
                            fontFamily: 'var(--font-press-start)',
                            fontSize: '6px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            textAlign: 'center',
                            wordBreak: 'break-word',
                            pointerEvents: 'none',
                            lineHeight: '1.2',
                            textTransform: 'uppercase',
                          }}
                        >
                          {zone.placeholder || `TEXTE ${normalZones.indexOf(zone) + 1}`}
                        </div>
                      )
                    })}
                  </div>
                  {/* Status overlay badge in 'all' view */}
                  {activeSubTab === 'all' && (
                    <div style={{
                      position: 'absolute',
                      bottom: '5px',
                      right: '5px',
                      backgroundColor: img.approved ? '#306230' : '#c21a1a',
                      color: '#fff',
                      padding: '2px 6px',
                      fontSize: '9px',
                      fontFamily: 'var(--font-press-start)',
                    }}>
                      {img.approved ? 'APPROUVÉ' : 'EN ATTENTE'}
                    </div>
                  )}
                </div>
                <div style={{ fontSize: '14px', lineHeight: '1.4' }}>
                  <div style={{ wordBreak: 'break-all' }}>
                    <strong>Auteur :</strong> {img.profiles?.username || 'Anonyme'}
                  </div>
                  <div>
                    <strong>Zones de texte :</strong> {img.text_zones?.length || 0}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: 'auto' }}>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    {!img.approved ? (
                      <>
                        <RetroButton
                          onClick={() => handleModerate(img.id, true)}
                          theme={theme}
                          style={{ flex: 1, backgroundColor: 'var(--accent-bg)', color: 'var(--accent)', fontSize: '12px', padding: '8px' }}
                        >
                          APPROUVER
                        </RetroButton>
                        <RetroButton
                          onClick={() => handleModerate(img.id, false)}
                          theme={theme}
                          style={{ flex: 1, backgroundColor: '#c21a1a', color: '#fff', fontSize: '12px', padding: '8px' }}
                        >
                          REFUSER
                        </RetroButton>
                      </>
                    ) : (
                      <RetroButton
                        onClick={() => handleModerate(img.id, false)}
                        theme={theme}
                        style={{ flex: 1, backgroundColor: '#c21a1a', color: '#fff', fontSize: '12px', padding: '8px' }}
                      >
                        SUPPRIMER
                      </RetroButton>
                    )}
                  </div>
                  <RetroButton
                    onClick={() => setEditingTemplate(img)}
                    theme={theme}
                    style={{ backgroundColor: 'var(--code-bg)', color: 'var(--text)', fontSize: '12px', padding: '8px', width: '100%' }}
                  >
                    MODIFIER ZONES
                  </RetroButton>
                </div>
              </RetroBox>
            ))}
          </div>
        )}
      </div>
    </RetroBox>
  )
}
