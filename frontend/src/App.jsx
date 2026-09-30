import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import './App.css'
import './ChatApp.css'

const chatEndpoint =
  import.meta.env.VITE_CHAT_WEBHOOK_URL || 'http://localhost:5678/webhook/chat'
const propertiesEndpoint =
  import.meta.env.VITE_PROPERTIES_API_URL || 'http://localhost:5678/webhook/properties'
const sessionStorageKey = 'agentic-estate-session-id'
const messagesStorageKey = 'agentic-estate-messages'

const propertyImages = [
  {
    src: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=800&q=85',
    alt: 'Bright contemporary living room with warm wood details',
  },
  {
    src: 'https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=800&q=85',
    alt: 'Sunlit modern home interior opening to a garden',
  },
  {
    src: 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=800&q=85',
    alt: 'Calm apartment living space with a view of greenery',
  },
]

const suggestedQuestions = [
  'Show me homes under ₹50 lakh',
  'What can I find in Pune?',
  'Tell me about Aakash Enclave',
  'Do you have any 2 BHK homes?',
]

function makeId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `message-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function createSessionId() {
  const existingId = sessionStorage.getItem(sessionStorageKey)
  if (existingId) return existingId

  const newId = crypto.randomUUID()
  sessionStorage.setItem(sessionStorageKey, newId)
  return newId
}

function readMessages(sessionId) {
  try {
    const messages = JSON.parse(localStorage.getItem(`${messagesStorageKey}:${sessionId}`) || '[]')
    return Array.isArray(messages) ? messages : []
  } catch {
    return []
  }
}

function getThinkingLabel(message) {
  if (/amenit|rera|possession|payment|builder|brochure|landmark|faq/i.test(message)) {
    return 'Checking brochures...'
  }
  if (/home|house|propert|price|budget|bed|bhk|city|pune|solapur|listing|available/i.test(message)) {
    return 'Searching listings...'
  }
  return 'Thinking through your request...'
}

function formatPrice(price) {
  const amount = Number(price)
  if (!Number.isFinite(amount)) return 'Price on request'
  if (amount >= 10000000) return `₹${(amount / 10000000).toFixed(amount % 10000000 ? 2 : 0)} crore`
  return `₹${(amount / 100000).toFixed(amount % 100000 ? 2 : 0)} lakh`
}

function getReply(payload) {
  const value = Array.isArray(payload) ? payload[0] : payload
  const reply = value?.reply ?? value?.output ?? value?.message

  if (typeof reply === 'string' && reply.trim()) return reply.trim()
  throw new Error('The assistant returned an empty reply.')
}

function Icon({ name, size = 20 }) {
  const paths = {
    home: <><path d="m3 10 9-7 9 7" /><path d="M5 9v11h14V9M9 20v-6h6v6" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    search: <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" /></>,
    send: <><path d="m21 3-7.2 18-3.6-7.2L3 10.2 21 3Z" /><path d="M10.2 13.8 15 9" /></>,
    arrow: <><path d="M7 17 17 7M7 7h10v10" /></>,
    chevron: <path d="m9 18 6-6-6-6" />,
    sparkle: <><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" /><path d="m19 15 .9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15Z" /></>,
    pin: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
  }

  return (
    <svg aria-hidden="true" className="icon" fill="none" height={size} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" viewBox="0 0 24 24" width={size}>
      {paths[name]}
    </svg>
  )
}

function App() {
  const [sessionId, setSessionId] = useState(createSessionId)
  const [messages, setMessages] = useState(() => readMessages(sessionId))
  const [draft, setDraft] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [propertiesOpen, setPropertiesOpen] = useState(() => window.matchMedia('(min-width: 1001px)').matches)
  const [propertyRefreshKey, setPropertyRefreshKey] = useState(0)
  const [properties, setProperties] = useState([])
  const [cityFilter, setCityFilter] = useState('')
  const [bedroomFilter, setBedroomFilter] = useState('')
  const [propertiesLoading, setPropertiesLoading] = useState(false)
  const [propertiesError, setPropertiesError] = useState('')
  const [selectedProperty, setSelectedProperty] = useState(null)
  const [thinkingLabel, setThinkingLabel] = useState('')
  const conversationRef = useRef(null)
  const composerRef = useRef(null)
  const bottomRef = useRef(null)
  const activeRequestRef = useRef(null)
  const sessionIdRef = useRef(sessionId)

  useEffect(() => {
    try {
      localStorage.setItem(`${messagesStorageKey}:${sessionId}`, JSON.stringify(messages))
    } catch {
      // Keep the conversation usable if browser storage is unavailable.
    }
  }, [messages, sessionId])

  useEffect(() => {
    if (!propertiesOpen) return undefined

    const controller = new AbortController()
    const timeoutId = window.setTimeout(async () => {
      setPropertiesLoading(true)
      setPropertiesError('')
      try {
        const query = new URLSearchParams()
        if (cityFilter.trim()) query.set('city', cityFilter.trim())
        if (bedroomFilter) query.set('bedrooms', bedroomFilter)
        const response = await fetch(`${propertiesEndpoint}?${query}`, { signal: controller.signal })
        if (!response.ok) throw new Error(`Property search failed (${response.status}).`)
        const payload = await response.json()
        const rows = Array.isArray(payload) ? payload : payload.properties
        if (!Array.isArray(rows)) throw new Error('Property search returned an invalid response.')
        setProperties(rows)
      } catch (error) {
        if (error.name !== 'AbortError') {
          setPropertiesError('Could not load homes. Check that the properties webhook is active, then retry.')
        }
      } finally {
        if (!controller.signal.aborted) setPropertiesLoading(false)
      }
    }, 180)

    return () => {
      window.clearTimeout(timeoutId)
      controller.abort()
    }
  }, [propertiesOpen, cityFilter, bedroomFilter, propertyRefreshKey])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, isSending])

  const sendMessage = async (text = draft) => {
    const message = text.trim()
    if (!message || isSending) return

    const requestSessionId = sessionId
    const controller = new AbortController()
    activeRequestRef.current = controller
    setDraft('')
    setThinkingLabel(getThinkingLabel(message))
    setMessages((current) => [
      ...current,
      { id: makeId(), role: 'user', content: message },
    ])
    setIsSending(true)

    try {
      const response = await fetch(chatEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, session_id: requestSessionId }),
        signal: controller.signal,
      })

      if (!response.ok) {
        throw new Error(`The assistant returned an error (${response.status}).`)
      }

      const reply = getReply(await response.json())
      if (requestSessionId === sessionIdRef.current) {
        setMessages((current) => [
          ...current,
          { id: makeId(), role: 'assistant', content: reply },
        ])
      }
    } catch (error) {
      if (error.name !== 'AbortError' && requestSessionId === sessionIdRef.current) {
        setMessages((current) => [
          ...current,
          {
            id: makeId(),
            role: 'assistant',
            content:
              'I couldn’t reach the property assistant just now. Check that the n8n workflow is running, then try again.',
            isError: true,
          },
        ])
      }
    } finally {
      if (requestSessionId === sessionIdRef.current) {
        setIsSending(false)
        setThinkingLabel('')
        activeRequestRef.current = null
        composerRef.current?.focus()
      }
    }
  }

  const startNewChat = () => {
    activeRequestRef.current?.abort()
    activeRequestRef.current = null
    const nextSessionId = crypto.randomUUID()
    sessionIdRef.current = nextSessionId
    sessionStorage.setItem(sessionStorageKey, nextSessionId)
    setSessionId(nextSessionId)
    setMessages([])
    setDraft('')
    setThinkingLabel('')
    setIsSending(false)
    if (conversationRef.current) conversationRef.current.scrollTop = 0
    composerRef.current?.focus()
  }

  useEffect(() => {
    const handleShortcut = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        startNewChat()
      }
    }
    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [])

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      sendMessage()
    }
  }

  const openProperties = () => {
    setPropertiesOpen(true)
    setPropertyRefreshKey((current) => current + 1)
    document.getElementById('property-panel')?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <>
    <div className="app-shell">
      <aside className="sidebar" aria-label="Main navigation">
        <a className="brand" href="#chat" aria-label="Agentic home">
          <span className="brand-mark"><Icon name="home" size={21} /></span>
          <span className="brand-copy"><strong>Agentic</strong><small>REAL ESTATE</small></span>
        </a>

        <button className="new-chat-button" onClick={startNewChat} type="button">
          <Icon name="plus" size={18} /><span>New conversation</span><kbd>⌘ K</kbd>
        </button>

        <div className="sidebar-section">
          <span className="sidebar-label">YOUR SPACE</span>
          <button className="sidebar-link active" type="button" onClick={startNewChat}>
            <Icon name="home" size={18} /><span>Property assistant</span>
          </button>
          <button className="sidebar-link" type="button" onClick={openProperties}>
            <Icon name="search" size={18} /><span>Explore homes</span><Icon name="chevron" size={16} />
          </button>
        </div>

        <div className="sidebar-note">
          <span className="note-icon"><Icon name="sparkle" size={17} /></span>
          <p>Good places start with the right questions.</p>
          <span>Here whenever you need us.</span>
        </div>

        <div className="sidebar-bottom">
          <span className="avatar">A</span>
          <span className="profile-copy"><strong>Home seeker</strong><small>Personal workspace</small></span>
          <button className="icon-button profile-menu" title="Workspace options" aria-label="Workspace options" type="button"><Icon name="menu" size={18} /></button>
        </div>
      </aside>

      <main className="main-area" id="chat">
        <header className="topbar">
          <div className="breadcrumbs"><span className="crumb-muted">Workspace</span><Icon name="chevron" size={15} /><span>Property assistant</span></div>
          <div className="topbar-actions">
            <span className="connection-state"><span className="connection-dot" /> Assistant ready</span>
            <button aria-expanded={propertiesOpen} aria-label={propertiesOpen ? 'Close property panel' : 'Open property panel'} className="icon-button mobile-properties-toggle" onClick={() => setPropertiesOpen((open) => !open)} title="Explore homes" type="button"><Icon name={propertiesOpen ? 'close' : 'search'} /></button>
          </div>
        </header>

        <div className="workspace-content">
          <section className="chat-panel" aria-label="Chat with the property assistant">
            <div className={`conversation ${messages.length ? 'has-messages' : ''}`} aria-live="polite" ref={conversationRef}>
              {messages.length === 0 ? (
                <div className="welcome-content">
                  <div className="welcome-kicker"><span /> YOUR NEXT CHAPTER, WELL FOUND</div>
                  <h1>A home search<br /><em>that feels like you.</em></h1>
                  <p className="welcome-copy">Tell us what matters. We’ll help you find a place that fits your life and your budget.</p>
                  <div className="prompt-grid" aria-label="Suggested questions">
                    {suggestedQuestions.map((question, index) => (
                      <button className="prompt-button" key={question} onClick={() => sendMessage(question)} type="button">
                        <span className={`prompt-symbol prompt-symbol-${index}`}><Icon name={index === 2 ? 'home' : index === 1 ? 'pin' : index === 3 ? 'search' : 'sparkle'} size={17} /></span>
                        <span>{question}</span><Icon name="arrow" size={15} />
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="message-list">
                  {messages.map((message) => (
                    <article className={`message-row ${message.role}`} key={message.id}>
                      {message.role === 'assistant' && <span className="assistant-avatar"><Icon name="home" size={16} /></span>}
                      <div className="message-content">
                        {message.role === 'assistant' && <span className="message-author">Agentic <span>·</span> PROPERTY ASSISTANT</span>}
                        <div className={`message-bubble ${message.isError ? 'error-bubble' : ''}`}>
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
                        </div>
                      </div>
                    </article>
                  ))}
                  {isSending && (
                    <article className="message-row assistant">
                      <span className="assistant-avatar"><Icon name="home" size={16} /></span>
                      <div className="message-content"><span className="message-author">Agentic <span>·</span> PROPERTY ASSISTANT</span><div className="agent-thinking"><Icon name="sparkle" size={14} /><span>{thinkingLabel}</span></div><div className="message-bubble typing-indicator" aria-label="Assistant is responding"><i /><i /><i /></div></div>
                    </article>
                  )}
                  <div ref={bottomRef} />
                </div>
              )}
            </div>

            <div className="composer-wrap">
              {messages.length > 0 && !isSending && (
                <div className="follow-up-prompts">
                  {suggestedQuestions.slice(0, 2).map((question) => <button key={question} onClick={() => sendMessage(question)} type="button">{question}</button>)}
                </div>
              )}
              <form className="composer" onSubmit={(event) => { event.preventDefault(); sendMessage() }}>
                <label className="sr-only" htmlFor="message-input">Ask about homes, locations, or your budget</label>
                <textarea id="message-input" maxLength={2000} onChange={(event) => setDraft(event.target.value)} onKeyDown={handleKeyDown} placeholder="Ask about homes, locations, or your budget..." ref={composerRef} rows={1} value={draft} />
                <div className="composer-footer">
                  <span className="composer-hint"><Icon name="sparkle" size={14} /> Answers grounded in local listings</span>
                  <div className="composer-actions"><span className="character-count">{draft.length}/2000</span><button className="send-button" disabled={!draft.trim() || isSending} aria-label="Send message" title="Send message" type="submit"><Icon name="send" size={18} /></button></div>
                </div>
              </form>
              <p className="disclaimer">Property information is subject to verification. Please confirm details before making a decision.</p>
            </div>
          </section>

          <aside className={`property-panel ${propertiesOpen ? 'open' : ''}`} id="property-panel" aria-label="Homes to explore" inert={!propertiesOpen}>
            <div className="panel-heading"><div><span className="panel-eyebrow">A GOOD PLACE TO BEGIN</span><h2>Homes to explore</h2></div><div className="panel-heading-actions"><span className="listing-count">{String(properties.length).padStart(2, '0')}</span><button aria-label="Close homes panel" className="icon-button panel-close" onClick={() => setPropertiesOpen(false)} title="Close homes panel" type="button"><Icon name="close" size={17} /></button></div></div>
            <p className="panel-intro">Explore current listings from our database.</p>
            <div className="property-filters">
              <label><span className="sr-only">Filter by city</span><input aria-label="Filter by city" onChange={(event) => setCityFilter(event.target.value)} placeholder="Any city" type="search" value={cityFilter} /></label>
              <label><span className="sr-only">Filter by bedrooms</span><select aria-label="Filter by bedrooms" onChange={(event) => setBedroomFilter(event.target.value)} value={bedroomFilter}><option value="">Any bedrooms</option><option value="1">1 bedroom</option><option value="2">2 bedrooms</option><option value="3">3 bedrooms</option></select></label>
            </div>
            <div className="property-list" aria-live="polite">
              {propertiesLoading ? <p className="property-message">Loading homes...</p> : propertiesError ? <p className="property-message property-error">{propertiesError}</p> : properties.length === 0 ? <p className="property-message">No homes match these filters.</p> : properties.map((property, index) => {
                const image = propertyImages[index % propertyImages.length]
                return (
                  <button className="property-item" key={property.id} onClick={() => setSelectedProperty({ ...property, image })} type="button">
                    <span className="property-image-wrap"><img alt={image.alt} className="property-image" loading={index === 0 ? 'eager' : 'lazy'} src={image.src} /><span className="property-status"><span />{property.status || 'Available'}</span></span>
                    <span className="property-details">
                      <span className="property-title-row"><strong>{property.title}</strong><Icon name="arrow" size={15} /></span>
                      <span className="property-location"><Icon name="pin" size={13} />{property.location}, {property.city}</span>
                      <span className="property-meta">{property.type}<i />{Number(property.area_sqft).toLocaleString()} sq ft</span>
                      <span className="property-price">{formatPrice(property.price)}</span>
                    </span>
                  </button>
                )
              })}
            </div>
            <div className="panel-footer"><div className="footer-mark"><Icon name="clock" size={17} /></div><p><strong>Thoughtful matches, no rush.</strong><span>We’ll help you compare at your pace.</span></p></div>
          </aside>
        </div>
      </main>
    </div>
      {selectedProperty && (
        <div className="property-detail-backdrop" onClick={() => setSelectedProperty(null)} role="presentation">
          <section aria-labelledby="property-detail-title" aria-modal="true" className="property-detail-dialog" onClick={(event) => event.stopPropagation()} role="dialog">
            <button aria-label="Close property details" className="icon-button detail-close" onClick={() => setSelectedProperty(null)} title="Close details" type="button"><Icon name="close" /></button>
            <img alt={selectedProperty.image.alt} className="detail-image" src={selectedProperty.image.src} />
            <div className="detail-copy">
              <span className="panel-eyebrow">{selectedProperty.status || 'Available'}</span>
              <h2 id="property-detail-title">{selectedProperty.title}</h2>
              <p className="detail-location"><Icon name="pin" size={15} />{selectedProperty.location}, {selectedProperty.city}</p>
              <strong className="detail-price">{formatPrice(selectedProperty.price)}</strong>
              <dl className="detail-facts">
                <div><dt>Configuration</dt><dd>{selectedProperty.type}</dd></div>
                <div><dt>Bedrooms</dt><dd>{selectedProperty.bedrooms}</dd></div>
                <div><dt>Bathrooms</dt><dd>{selectedProperty.bathrooms}</dd></div>
                <div><dt>Area</dt><dd>{Number(selectedProperty.area_sqft).toLocaleString()} sq ft</dd></div>
                <div><dt>Listing status</dt><dd>{selectedProperty.status}</dd></div>
              </dl>
              <button className="ask-property-button" onClick={() => { setDraft(`Tell me more about ${selectedProperty.title}`); setSelectedProperty(null); composerRef.current?.focus() }} type="button">Ask about this property <Icon name="arrow" size={15} /></button>
            </div>
          </section>
        </div>
      )}
    </>
  )
}

export default App
