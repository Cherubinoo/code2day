import React, { useState, useEffect, useRef } from "react";
import { 
  MessageSquare, Users, Send, Search, 
  User, LayoutGrid, Hash, Trophy, 
  Trash, Bell, CheckCircle, UserPlus,
  ArrowLeft, Info, AlertTriangle, ChevronRight,
  BarChart2, Plus, X as CloseIcon
} from "lucide-react";
import { buildJsonPostOptions } from "../../../lib/appUtils";

function DiscussPage({ userType, studentProfile, staffProfile }) {
  // Initialize recipient from URL query parameters if provided
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reg = params.get('reg');
    const name = params.get('name');
    if (reg) {
      setActiveRecipientReg(reg);
      setActiveTab("individual");
    }
    if (name) setActiveRecipientName(name);
  }, []);

  const profile = studentProfile || staffProfile;

  const [activeTab, setActiveTab] = useState("general"); 
  const [activeThreadId, setActiveThreadId] = useState("general");
  const [activeBatch, setActiveBatch] = useState(studentProfile?.batch || "");
  const [activeRecipientReg, setActiveRecipientReg] = useState("");
  const [activeRecipientName, setActiveRecipientName] = useState("");
  
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  
  // For students: List of staff from their department
  const [deptStaff, setDeptStaff] = useState([]);
  const [loadingStaff, setLoadingStaff] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [loadingNotifications, setLoadingNotifications] = useState(false);
  
  // For staff: Active conversation threads and batch list
  const [threads, setThreads] = useState([]);
  const [batches, setBatches] = useState([]);
  const [loadingThreads, setLoadingThreads] = useState(false);
  
  const scrollRef = useRef(null);
  const [viewingProfile, setViewingProfile] = useState(null);

  const isAdmin = userType === "admin";
  const isHOD = userType === "hod";
  const isStaff = userType === "staff" || isHOD || userType === "tpu" || userType === "ja" || userType === "tpo";
  const isStudent = userType === "student";
  const canCreatePoll = isStaff || isAdmin || userType === "inst_admin";

  // Poll creation state
  const [showPollCreator, setShowPollCreator] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);

  // Load messages for current thread
  useEffect(() => {
    fetchProfile();
    fetchThreads();
    fetchBatches();
    fetchNotifications();
    if (!isStudent) fetchDeptStaff();
  }, []);

  useEffect(() => {
    loadMessages();
    const interval = setInterval(loadMessages, 5000);
    const notifInterval = setInterval(fetchNotifications, 10000);
    return () => {
      clearInterval(interval);
      clearInterval(notifInterval);
    };
  }, [activeTab, activeRecipientReg, activeBatch]);

  // Helper to check if a channel has unread messages
  const hasUnread = (threadType, batchName = null) => {
    return notifications.some(n => {
      if (n.is_read) return false;
      const expectedLink = `/discuss?thread_type=${threadType}${batchName ? `&batch_name=${batchName}` : ''}`;
      return n.link === expectedLink;
    });
  };

  // Load staff list for students
  useEffect(() => {
    fetchThreads();
    if (isStudent) {
      fetchDeptStaff();
    } else {
      fetchBatches();
    }
  }, []);

  // Handle searching
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.trim().length >= 2) {
        performSearch();
      } else {
        setSearchResults([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  async function fetchDeptStaff() {
    setLoadingStaff(true);
    try {
      const res = await fetch("/api/discussions/staff-dept-list/", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setDeptStaff(Array.isArray(data) ? data : (data.results ?? []));
      }
    } catch (err) {
      console.error("Failed to load staff list", err);
    } finally {
      setLoadingStaff(false);
    }
  }

  async function fetchThreads() {
    setLoadingThreads(true);
    try {
      const res = await fetch("/api/discussions/threads/", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setThreads(Array.isArray(data) ? data : (data.results ?? []));
      }
    } catch (err) {
      console.error("Failed to load threads", err);
    } finally {
      setLoadingThreads(false);
    }
  }

  async function fetchNotifications() {
    try {
      const res = await fetch("/api/notifications/", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setNotifications(Array.isArray(data) ? data : (data.results || []));
      }
    } catch (err) {
      console.error("Failed to load notifications", err);
    }
  }

  async function fetchProfile() {
    // Already passed via props, but we can sync if needed
    // For now, the profile comes from props studentProfile/staffProfile
  }

  async function fetchBatches() {
    try {
      const res = await fetch("/api/batches/", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setBatches(Array.isArray(data) ? data : (data.batches || data.results || []));
      }
    } catch (err) {
      console.error("Failed to load batches", err);
    }
  }

  async function performSearch() {
    try {
      const res = await fetch(`/api/auth/register-numbers/?q=${encodeURIComponent(searchQuery)}`, {
        credentials: "include"
      });
      if (res.ok) {
        const data = await res.json();
        setSearchResults(data);
      }
    } catch (err) {
      console.error("Search failed", err);
    }
  }

  async function loadMessages() {
    const params = new URLSearchParams();
    params.append("thread_type", activeTab);

    if (activeTab === "general") {
      params.append("batch_name", activeBatch);
    } else if (activeTab === "individual") {
      if (!activeRecipientReg) return; // Individual needs a recipient
      params.append("other_user_reg", activeRecipientReg);
    }
    // For 'staff' and 'hod_tp_ja', no extra params needed currently

    try {
      const res = await fetch(`/api/discussions/?${params.toString()}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        const serverMessages = Array.isArray(data) ? data : (data.results ?? []);
        
        setMessages(prev => {
          // Keep optimistic messages that haven't appeared in the server results yet
          // Only keep them if they were sent in the last 10 seconds to avoid ghosts
          const recentOptimistic = prev.filter(m => 
            m.is_optimistic && (Date.now() - m.sent_at < 10000)
          );

          // Filter out optimistic messages that are now confirmed by the server
          // (matching by body and sender for simplicity)
          const pendingOptimistic = recentOptimistic.filter(om => 
            !serverMessages.some(sm => sm.body === om.body && (sm.sender_reg === om.sender_reg || sm.is_self))
          );

          return [...serverMessages, ...pendingOptimistic];
        });

        // After messages are loaded (and marked as read on backend), refresh threads to clear badges
        fetchThreads();
      }
    } catch (err) {
      console.error("Failed to load messages", err);
    }
  }

  async function sendMessage(e) {
    e.preventDefault();
    if (!draft.trim() || busy) return;

    const payload = {
      body: draft,
      thread_type: activeTab,
    };

    if (activeTab === "general") {
      payload.batch_name = activeBatch;
    } else if (activeTab === "individual") {
      payload.recipient_reg = activeRecipientReg;
    }

    setBusy(true);
    // Optimistic update
    const tempMsg = {
      id: Date.now(),
      body: draft,
      sender_name: profile?.name || "Me",
      sender_reg: profile?.register_number || profile?.faculty_id,
      created_at: new Date().toISOString(),
      is_self: true,
      is_optimistic: true,
      sent_at: Date.now()
    };
    setMessages(prev => [...prev, tempMsg]);
    setDraft("");

    try {
      const res = await fetch("/api/discussions/", buildJsonPostOptions(payload));
      if (res.ok) {
        // Sync with server after a short delay to ensure DB persistence/indexing
        setTimeout(loadMessages, 500);
      } else {
        // If send failed, remove the optimistic message
        setMessages(prev => prev.filter(m => m.id !== tempMsg.id));
      }
    } catch (err) {
      console.error("Failed to send message", err);
    } finally {
      setBusy(false);
    }
  }

  async function handleVote(pollId, optionIndex) {
    try {
      const res = await fetch(`/api/discussions/${pollId}/vote/`, buildJsonPostOptions({ option_index: optionIndex }));
      if (res.ok) {
        const updatedPoll = await res.json();
        setMessages(prev => prev.map(m => m.id === pollId ? updatedPoll : m));
      }
    } catch (err) {
      console.error("Failed to vote", err);
    }
  }

  async function createPoll(e) {
    e.preventDefault();
    if (!pollQuestion.trim() || pollOptions.filter(o => o.trim()).length < 2) return;

    const payload = {
      body: pollQuestion,
      thread_type: activeTab,
      is_poll: true,
      poll_options: pollOptions.filter(opt => opt.trim() !== "")
    };

    if (activeTab === "general") {
      payload.batch_name = activeBatch;
    } else if (activeTab === "individual") {
      payload.recipient_reg = activeRecipientReg;
    }

    try {
      setBusy(true);
      const res = await fetch("/api/discussions/", buildJsonPostOptions(payload));
      if (res.ok) {
        setShowPollCreator(false);
        setPollQuestion("");
        setPollOptions(["", ""]);
        loadMessages();
      }
    } catch (err) {
      console.error("Failed to create poll", err);
    } finally {
      setBusy(false);
    }
  }

  const startDirectMessage = (user) => {
    setActiveTab("individual");
    setActiveRecipientReg(user.register_number || user.faculty_id);
    setActiveRecipientName(user.name);
    setIsSearching(false);
    setSearchResults([]);
  };

  const channels = [
    { 
      id: "general", 
      label: isStudent ? "Batch Chat" : "General Chat", 
      icon: isStudent ? Trophy : Hash, 
      visible: true 
    },
    { id: "staff", label: "Staff Room", icon: LayoutGrid, visible: isStaff || isAdmin },
    { id: "hod_tp_ja", label: "HOD & Admin", icon: Users, visible: isHOD || isAdmin || userType === "tpu" || userType === "ja" },
  ];

  return (
    <div className="discuss-layout-v2">
      {/* Sidebar */}
      <aside className="discuss-sidebar-v2">
        <div className="sidebar-brand-v2">
          <div className="brand-icon-box">
            <MessageSquare size={22} />
          </div>
          <div className="brand-text">
            <h3>Discussions</h3>
            <span className="brand-status">Institutional Network</span>
          </div>
        </div>

        <div className="sidebar-scroll-v2">
          <div className="sidebar-user-v2">
            <div className="user-avatar-v2">
              {profile?.name?.[0] || "?"}
            </div>
            <div className="author-info-v2">
              <span>{profile?.name || "Loading..."}</span>
              <span className="batch-v2">{profile?.register_number || profile?.faculty_id || "Profile"}</span>
            </div>
          </div>

          <div className="sidebar-group-v2">
            <span className="sidebar-group-label-v2">Communications</span>
            {channels.filter(c => c.visible).map(ch => (
              <React.Fragment key={ch.id}>
                <button 
                  className={`sidebar-item-v2 ${activeTab === ch.id ? "active" : ""}`}
                  onClick={() => {
                    setActiveTab(ch.id);
                    setActiveRecipientReg("");
                    setIsSearching(false);
                    // Force a notification sync when switching tabs
                    fetchNotifications();
                  }}
                >
                  <div className="item-icon-box">
                    <ch.icon size={18} />
                    {hasUnread(ch.id) && <span className="unread-badge-dot"></span>}
                  </div>
                  <span className="item-label">{ch.label}</span>
                </button>
                
                {ch.id === "general" && activeTab === "general" && isStaff && (
                  <div className="batch-filter-box">
                    <select value={activeBatch} onChange={(e) => setActiveBatch(e.target.value)}>
                      <option value="">Select Batch...</option>
                      {batches.map(b => (
                        <option key={b.batch} value={b.batch}>{b.batch}</option>
                      ))}
                    </select>
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>

          <div className="sidebar-group-v2">
            <div className="sidebar-group-header-v2">
              <span className="sidebar-group-label-v2">Direct Messages</span>
              {!isStudent && (
                <button className="add-dm-btn" onClick={() => setIsSearching(true)} title="New Message">
                  <UserPlus size={16} />
                </button>
              )}
            </div>

            <div className="contacts-list-v2">
              {isStudent ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {/* Active Threads first for students */}
                  {threads.length > 0 && (
                    <div className="threads-section">
                      {threads.map((thread) => (
                        <button 
                          key={thread.thread_id}
                          className={`contact-item-v2 ${activeRecipientReg === thread.other_user_reg ? "active" : ""}`}
                          onClick={() => startDirectMessage({ 
                            register_number: thread.other_user_reg, 
                            name: thread.other_user_name 
                          })}
                        >
                          <div className="contact-avatar-v2">
                            {(thread.other_user_name || "?")[0]}
                            {thread.unread_count > 0 && <span className="unread-badge-dot">{thread.unread_count}</span>}
                          </div>
                          <div className="contact-info-v2">
                            <div className="contact-top-v2">
                              <span className="contact-name-v2">{thread.other_user_name || "Unknown"}</span>
                              <span className="contact-time-v2">
                                {thread.timestamp ? new Date(thread.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ""}
                              </span>
                            </div>
                            <span className="contact-preview-v2">{thread.latest_message}</span>
                          </div>
                        </button>
                      ))}
                      <div style={{ height: 1, background: 'var(--bg-2)', margin: '12px 10px' }} />
                    </div>
                  )}

                  {/* Then the department staff list */}
                  <div className="dept-staff-section">
                    <span style={{ fontSize: '10px', fontWeight: '700', color: 'var(--text-soft)', padding: '0 12px', marginBottom: 8, display: 'block', textTransform: 'uppercase' }}>Department Faculty</span>
                    {deptStaff.map(staffMember => (
                      <button 
                        key={staffMember.faculty_id}
                        className={`contact-item-v2 ${activeRecipientReg === staffMember.faculty_id ? "active" : ""}`}
                        onClick={() => startDirectMessage(staffMember)}
                      >
                        <div className="contact-avatar-v2">
                          {(staffMember.name || "?")[0]}
                          <span className="contact-status online"></span>
                        </div>
                        <div className="contact-info-v2">
                          <span className="contact-name-v2">{staffMember.name}</span>
                          <span className="contact-role-v2">{staffMember.role}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  {threads.length > 0 ? (
                    threads.map((thread) => (
                      <button 
                        key={thread.thread_id}
                        className={`contact-item-v2 ${activeRecipientReg === thread.other_user_reg ? "active" : ""}`}
                        onClick={() => startDirectMessage({ 
                          register_number: thread.other_user_reg, 
                          name: thread.other_user_name 
                        })}
                      >
                        <div className="contact-avatar-v2">
                          {(thread.other_user_name || "?")[0]}
                          {thread.unread_count > 0 && <span className="unread-badge-dot">{thread.unread_count}</span>}
                        </div>
                        <div className="contact-info-v2">
                          <div className="contact-top-v2">
                            <span className="contact-name-v2">{thread.other_user_name || "Unknown"}</span>
                            <span className="contact-time-v2">
                              {thread.timestamp ? new Date(thread.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ""}
                            </span>
                          </div>
                          <span className="contact-preview-v2">{thread.latest_message}</span>
                        </div>
                      </button>
                    ))
                  ) : (
                    activeRecipientReg && (
                      <button className="contact-item-v2 active">
                        <div className="contact-avatar-v2">
                          {(activeRecipientName || "?")[0]}
                          <span className="contact-status online"></span>
                        </div>
                        <div className="contact-info-v2">
                          <span className="contact-name-v2">{activeRecipientName}</span>
                          <span className="contact-role-v2">Staff/Student</span>
                        </div>
                      </button>
                    )
                  )}
                  {!activeRecipientReg && threads.length === 0 && (
                    <div className="no-contacts-v2">
                      <MessageSquare size={32} opacity={0.2} />
                      <p>No active conversations</p>
                    </div>
                  )}
                </>
              )}
              {isStudent && deptStaff.length === 0 && !loadingStaff && (
                <div className="empty-contacts">No staff members found.</div>
              )}
              {loadingStaff && (
                <div className="loading-contacts">Loading staff list...</div>
              )}
            </div>
          </div>
        </div>

        <div className="sidebar-footer-v2">
          <div className="persistence-hint">
            <Info size={14} />
            <span>Messages are cleared every 24h</span>
          </div>
        </div>
      </aside>

      {/* Main Chat Area */}
      <main className="chat-area">
        {isSearching && !isStudent ? (
          <div className="search-overlay-v2">
            <div className="search-box-v2">
              <header className="search-header-v2">
                <h2>Start a conversation</h2>
                <p>Search for students or staff by name or ID</p>
              </header>
              
              <div className="search-input-field-v2">
                <Search size={20} />
                <input 
                  type="text" 
                  placeholder="Search..." 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="search-results-v2 scroll-column">
                {searchResults.length === 0 && searchQuery && (
                  <div className="no-results">No matches found for "{searchQuery}"</div>
                )}
                {searchResults.map(user => (
                  <button 
                    key={user.register_number} 
                    className="search-result-item-v2"
                    onClick={() => startDirectMessage(user)}
                  >
                    <div className="result-avatar-v2">{(user.name || "?")[0]}</div>
                    <div className="result-info-v2">
                      <strong>{user.name}</strong>
                      <span className="result-meta-v2">{user.register_number || user.faculty_id} \u2022 {user.batch || "Staff"}</span>
                    </div>
                    <ChevronRight size={18} />
                  </button>
                ))}
                {!searchQuery && (
                  <div className="search-empty-v2">
                    <Users size={48} opacity={0.1} />
                    <p>Enter a name or ID to find someone</p>
                  </div>
                )}
              </div>
              
              <button className="search-close-v2" onClick={() => setIsSearching(false)}>
                Close
              </button>
            </div>
          </div>
        ) : null}

        <header className="chat-header-v2">
          <div className="chat-header-info-v2">
            <div className="chat-header-icon-v2">
              {activeTab === "general" ? (isStudent ? <Trophy size={20} /> : <Hash size={20} />) : <User size={20} />}
            </div>
            <div>
              <h2>{activeTab === "general" ? (activeBatch ? `Batch ${activeBatch}` : (isStudent ? "Batch Chat" : "General Chat")) : (activeRecipientName || "Direct Message")}</h2>
              {activeTab !== "general" && activeRecipientReg && (
                <span className="recipient-reg-v2">{activeRecipientReg}</span>
              )}
            </div>
          </div>
          <div className="chat-header-actions-v2">
            {activeTab === "general" && !isStudent && (
              <span className="batch-label-v2">{activeBatch || "No Batch Selected"}</span>
            )}
            <button className="header-action-btn-v2" title="Thread Info">
              <Info size={18} />
            </button>
          </div>
        </header>

        <div className="messages-container-v2 scroll-column" ref={scrollRef}>
          {messages.length === 0 ? (
            <div className="messages-empty-v2">
              <div className="empty-chat-icon">
                <MessageSquare size={40} />
              </div>
              <h3>No messages here yet</h3>
              <p>Be the first to start the conversation!</p>
            </div>
          ) : (
            messages.map((msg) => (
              <div key={msg.id} className={`message-wrapper-v2 ${msg.is_self ? "self" : ""}`}>
                {!msg.is_self && (
                  <div className="message-avatar-v2" onClick={() => setViewingProfile(msg)}>
                    {(msg.sender_name || "?")[0]}
                  </div>
                )}
                <div className="message-content-v2">
                  {!msg.is_self && <span className="message-author-v2">{msg.sender_name}</span>}
                  <div className="message-bubble-v2">
                    {msg.is_poll ? (
                      <div className="poll-container-v2">
                        <div className="poll-question-v2">{msg.body}</div>
                        <div className="poll-options-v2">
                          {msg.poll_options.map((option, idx) => {
                            const voteCount = msg.poll_results ? msg.poll_results[idx] : 0;
                            const totalVotes = msg.poll_results ? msg.poll_results.reduce((a, b) => a + b, 0) : 0;
                            const percent = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;
                            const hasVoted = msg.user_vote === idx;
                            
                            return (
                              <button 
                                key={idx} 
                                className={`poll-option-v2 ${hasVoted ? 'voted' : ''}`}
                                onClick={() => handleVote(msg.id, idx)}
                              >
                                <div className="poll-option-bg-v2" style={{ width: `${percent}%` }}></div>
                                <div className="poll-option-content-v2">
                                  <div className="poll-option-label-v2">
                                    {hasVoted && <div className="voted-check-v2">✓</div>}
                                    <span>{option}</span>
                                  </div>
                                  <span className="poll-option-percent-v2">{percent}%</span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                        <div className="poll-footer-v2">
                          <Users size={14} />
                          {msg.poll_results?.reduce((a, b) => a + b, 0) || 0} total votes
                        </div>
                      </div>
                    ) : (
                      <p>{msg.body || msg.content}</p>
                    )}
                    <span className="message-time-v2">
                      {new Date(msg.created_at || msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <footer className="chat-footer-v2">
          {activeTab === "general" && !activeBatch && isStaff ? (
            <div className="footer-blocked-v2">
              <AlertTriangle size={16} />
              <span>Select a batch in the sidebar to start chatting</span>
            </div>
          ) : (
            <form className="message-input-wrapper-v2" onSubmit={sendMessage}>
              {canCreatePoll && (
                <button 
                  type="button" 
                  className="poll-footer-btn" 
                  onClick={() => setShowPollCreator(true)}
                  title="Create a Poll"
                >
                  <Plus size={22} />
                </button>
              )}
              <input 
                type="text" 
                placeholder={activeTab === "general" ? "Message batch..." : "Type a message..."} 
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                disabled={busy}
              />
              <button 
                type="submit" 
                className="send-button-v2" 
                disabled={!draft.trim() || busy || (activeTab === "individual" && !activeRecipientReg)}
              >
                <Send size={18} />
              </button>
            </form>
          )}
        </footer>
      </main>

      {/* Profile Modal */}
      {viewingProfile && (
        <div className="profile-modal-overlay" onClick={() => setViewingProfile(null)}>
          <div className="profile-modal-card" onClick={e => e.stopPropagation()}>
            <div className="profile-modal-header">
              <div className="profile-modal-avatar">{viewingProfile.sender_name[0]}</div>
              <h3>{viewingProfile.sender_name}</h3>
              <span>{viewingProfile.sender_reg}</span>
            </div>
            <div className="profile-modal-body">
              <div className="profile-detail-item">
                <label>Identifier</label>
                <p>{viewingProfile.sender_reg}</p>
              </div>
              <div className="profile-detail-item">
                <label>Department</label>
                <p>Engineering</p>
              </div>
            </div>
            <div className="profile-modal-footer">
              {!viewingProfile.is_self && (
                <button 
                  className="primary-button"
                  onClick={() => {
                    startDirectMessage({ register_number: viewingProfile.sender_reg, name: viewingProfile.sender_name });
                    setViewingProfile(null);
                  }}
                >
                  <MessageSquare size={16} />
                  Message
                </button>
              )}
              <button className="ghost-button" onClick={() => setViewingProfile(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Poll Creation Modal */}
      {showPollCreator && (
        <div className="poll-modal-overlay">
          <div className="poll-modal">
            <div className="poll-modal-header">
              <h3>Create a Poll</h3>
              <button onClick={() => setShowPollCreator(false)}><CloseIcon size={20} /></button>
            </div>
            <form onSubmit={createPoll} className="poll-modal-form">
              <div className="poll-form-section">
                <label className="poll-form-label">Question</label>
                <input 
                  type="text" 
                  className="poll-question-input"
                  placeholder="What would you like to ask?"
                  value={pollQuestion}
                  onChange={(e) => setPollQuestion(e.target.value)}
                  required
                />
              </div>

              <div className="poll-form-section">
                <label className="poll-form-label">Options</label>
                <div className="poll-options-list">
                  {pollOptions.map((opt, idx) => (
                    <div key={idx} className="poll-option-field">
                      <div className="poll-option-input-wrapper">
                        <input 
                          type="text" 
                          className="poll-option-input"
                          placeholder={`Option ${idx + 1}`}
                          value={opt}
                          onChange={(e) => {
                            const newOpts = [...pollOptions];
                            newOpts[idx] = e.target.value;
                            setPollOptions(newOpts);
                          }}
                          required={idx < 2}
                        />
                      </div>
                      {pollOptions.length > 2 && (
                        <button 
                          type="button" 
                          className="remove-option-btn"
                          onClick={() => setPollOptions(pollOptions.filter((_, i) => i !== idx))}
                        >
                          <CloseIcon size={16} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {pollOptions.length < 5 && (
                  <button 
                    type="button" 
                    className="add-option-btn"
                    onClick={() => setPollOptions([...pollOptions, ""])}
                  >
                    <Plus size={16} /> Add another option
                  </button>
                )}
              </div>

              <div className="poll-modal-actions">
                <button 
                  type="button" 
                  className="poll-btn-cancel" 
                  onClick={() => setShowPollCreator(false)}
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  className="poll-btn-create" 
                  disabled={busy || !pollQuestion.trim() || pollOptions.filter(o => o.trim()).length < 2}
                >
                  {busy ? "Creating..." : "Create Poll"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default DiscussPage;
