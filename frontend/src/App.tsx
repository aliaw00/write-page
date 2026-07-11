import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Settings,
  Plus,
  Trash2,
  FolderOpen,
  Download,
  Share2,
  Sun,
  Moon,
  Eye,
  Columns,
  Keyboard,
  Volume2,
  VolumeX,
  X,
  Copy,
  ExternalLink,
  FileText,
  Lock,
  Cloud,
  Loader2,
  Bold,
  Italic,
  Heading1,
  Heading2,
  List,
  Quote,
  FileCode,
  LogOut,
  BookOpen,
  Maximize,
  Minimize,
  Link,
  Strikethrough,
  Code,
  CheckSquare,
  Minus
} from 'lucide-react';
import { marked } from 'marked';
import { playKeyClick, playBell } from './utils/typewriter';
import {
  signupAPI,
  loginAPI,
  syncAPI,
  toggleShareAPI,
  getSharedDocumentAPI
} from './utils/sync';
import type { Document } from './utils/sync';

// Generate standard client IDs offline
function generateUUID() {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15);
}

const DEFAULT_DOC_CONTENT = `# Welcome to Minimal Write

This is a distraction-free writing environment. It's designed to help you focus on your thoughts and words.

## Features:
1. **Markdown Support**: Style your text using standard Markdown tags.
2. **Local First**: Everything is saved automatically on your browser's localStorage.
3. **Typewriter Sound**: Turn on the typewriter toggle in settings for responsive audio feedback.
4. **Cloud Sync**: Register a free account to sync your documents securely across devices.
5. **Print & PDF Export**: Hit export to print a clean page or download a PDF.

Start writing, or clear this text to begin a blank page.`;

export default function App() {
  // --- UI Modes ---
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('theme');
    if (saved) return saved === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  const [previewMode, setPreviewMode] = useState<'editor' | 'split' | 'preview'>('editor');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);

  const [isMobile, setIsMobile] = useState<boolean>(() => window.innerWidth < 768);
  const [mobileTab, setMobileTab] = useState<'write' | 'preview'>('write');

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  // UI chrome fade state
  const [uiVisible, setUiVisible] = useState(true);
  const fadeTimeoutRef = useRef<number | null>(null);

  // --- Shared Reader Mode ---
  const [sharedDoc, setSharedDoc] = useState<Document | null>(null);
  const [isReaderMode, setIsReaderMode] = useState(false);
  const [loadingShared, setLoadingShared] = useState(false);

  // --- Zen Mode State ---
  const [zenMode, setZenMode] = useState<boolean>(() => {
    return localStorage.getItem('zen_mode') === 'true';
  });

  useEffect(() => {
    localStorage.setItem('zen_mode', zenMode ? 'true' : 'false');
  }, [zenMode]);

  // --- Settings State ---
  interface EditorSettings {
    fontFamily: 'serif' | 'sans' | 'mono';
    fontSize: number;
    lineHeight: 'tight' | 'normal' | 'loose';
    maxWidth: 'narrow' | 'medium' | 'wide' | 'full';
    typewriterSounds: boolean;
    spellCheck: boolean;
    focusMode: boolean;
    writingGoal: number;
    showFormattingToolbar: boolean;
    showWordCount: boolean;
  }

  const [settings, setSettings] = useState<EditorSettings>(() => {
    const saved = localStorage.getItem('editor_settings');
    const defaults = {
      fontFamily: 'serif' as const,
      fontSize: 18,
      lineHeight: 'normal' as const,
      maxWidth: 'medium' as const,
      typewriterSounds: false,
      spellCheck: true,
      focusMode: false,
      writingGoal: 0,
      showFormattingToolbar: true,
      showWordCount: true,
    };
    return saved ? { ...defaults, ...JSON.parse(saved) } : defaults;
  });

  // --- Document State ---
  const [documents, setDocuments] = useState<Document[]>(() => {
    const saved = localStorage.getItem('documents');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.length > 0) return parsed;
    }
    const initialId = generateUUID();
    const now = Date.now();
    return [{
      id: initialId,
      title: 'Untitled Document',
      content: DEFAULT_DOC_CONTENT,
      updated_at: now,
      created_at: now,
      is_deleted: false
    }];
  });

  const [activeDocId, setActiveDocId] = useState<string>(() => {
    const saved = localStorage.getItem('active_doc_id');
    if (saved) return saved;
    return documents[0]?.id || '';
  });

  const activeDoc = documents.find(d => d.id === activeDocId) || documents[0];

  // --- Sync & Auth State ---
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('sync_token'));
  const [username, setUsername] = useState<string | null>(() => localStorage.getItem('sync_username'));
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'error' | 'success'>('idle');
  const [lastSyncTime, setLastSyncTime] = useState<number>(() => Number(localStorage.getItem('last_sync_timestamp') || '0'));
  
  // Auth Form
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [formUser, setFormUser] = useState('');
  const [formPass, setFormPass] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // File picker Ref
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // --- Persist state ---
  useEffect(() => {
    localStorage.setItem('theme', darkMode ? 'dark' : 'light');
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  useEffect(() => {
    localStorage.setItem('editor_settings', JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    localStorage.setItem('documents', JSON.stringify(documents));
  }, [documents]);

  useEffect(() => {
    if (activeDocId) {
      localStorage.setItem('active_doc_id', activeDocId);
    }
  }, [activeDocId]);

  // --- Check for shared link on load ---
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const shareId = params.get('share');
    if (shareId) {
      setIsReaderMode(true);
      setLoadingShared(true);
      getSharedDocumentAPI(shareId)
        .then(doc => {
          setSharedDoc(doc);
        })
        .catch(err => {
          alert(err.message || 'Failed to load shared document');
          setIsReaderMode(false);
        })
        .finally(() => {
          setLoadingShared(false);
        });
    }
  }, []);

  // --- Trigger UI Chrome Fade ---
  const triggerUiVisibility = useCallback(() => {
    setUiVisible(true);
    if (fadeTimeoutRef.current) {
      window.clearTimeout(fadeTimeoutRef.current);
    }
    // Only fade when editor is focused and we aren't in split/preview modes and sidebars are closed
    if (
      document.activeElement === textareaRef.current && 
      previewMode === 'editor' &&
      !sidebarOpen &&
      !syncModalOpen &&
      !shortcutsOpen &&
      !shareModalOpen
    ) {
      fadeTimeoutRef.current = window.setTimeout(() => {
        setUiVisible(false);
      }, 2500);
    }
  }, [previewMode, sidebarOpen, syncModalOpen, shortcutsOpen, shareModalOpen]);

  // Trigger fade on hover/mouse moves
  useEffect(() => {
    const handleMouseMove = () => {
      triggerUiVisibility();
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [triggerUiVisibility]);

  // --- Word/Char Counts ---
  const getCounts = useCallback((text = '') => {
    const chars = text.length;
    const trimmed = text.trim();
    const words = trimmed ? trimmed.split(/\s+/).length : 0;
    const paragraphs = trimmed ? trimmed.split(/\n\s*\n/).length : 0;
    return { chars, words, paragraphs };
  }, []);

  const counts = getCounts(activeDoc?.content || '');

  // --- Sync Action ---
  const performSync = useCallback(async (authToken: string) => {
    if (syncStatus === 'syncing') return;
    setSyncStatus('syncing');
    try {
      // Find non-deleted local docs, and deleted ones we should sync as tombstones
      const payloadDocs = documents;
      const res = await syncAPI(authToken, payloadDocs, lastSyncTime);
      
      const newDocsMap = new Map<string, Document>();
      // Put existing local docs in map
      documents.forEach(d => newDocsMap.set(d.id, d));

      // Merge server updates
      res.updates.forEach((serverDoc) => {
        const localDoc = newDocsMap.get(serverDoc.id);
        if (!localDoc) {
          if (!serverDoc.is_deleted) {
            newDocsMap.set(serverDoc.id, serverDoc);
          }
        } else {
          // If server's update is newer or local is same
          if (serverDoc.updated_at >= localDoc.updated_at) {
            if (serverDoc.is_deleted) {
              newDocsMap.delete(serverDoc.id);
            } else {
              newDocsMap.set(serverDoc.id, serverDoc);
            }
          }
        }
      });

      // Filter out physically deleted or tombstoned items
      const mergedDocs = Array.from(newDocsMap.values());
      
      setDocuments(mergedDocs.length > 0 ? mergedDocs : [{
        id: generateUUID(),
        title: 'Untitled Document',
        content: '',
        updated_at: Date.now(),
        created_at: Date.now(),
        is_deleted: false
      }]);

      setLastSyncTime(res.server_time);
      localStorage.setItem('last_sync_timestamp', res.server_time.toString());
      setSyncStatus('success');
      setTimeout(() => setSyncStatus('idle'), 3000);
    } catch (err) {
      console.error(err);
      setSyncStatus('error');
    }
  }, [documents, lastSyncTime, syncStatus]);

  // Debounced Sync on Changes
  useEffect(() => {
    if (!token) return;
    const timer = setTimeout(() => {
      performSync(token);
    }, 5000); // Sync 5 seconds after last change
    return () => clearTimeout(timer);
  }, [activeDoc?.content, token]);

  // --- Auth Handlers ---
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);
    try {
      let data;
      if (authMode === 'signup') {
        data = await signupAPI(formUser, formPass);
      } else {
        data = await loginAPI(formUser, formPass);
      }
      setToken(data.token);
      setUsername(data.user.username);
      localStorage.setItem('sync_token', data.token);
      localStorage.setItem('sync_username', data.user.username);
      setFormUser('');
      setFormPass('');
      // Perform initial sync
      performSync(data.token);
    } catch (err: any) {
      setAuthError(err.message || 'Authentication failed');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    setToken(null);
    setUsername(null);
    localStorage.removeItem('sync_token');
    localStorage.removeItem('sync_username');
    localStorage.removeItem('last_sync_timestamp');
    setLastSyncTime(0);
    setSyncStatus('idle');
  };

  // --- Content Editing & Audio Synthesis ---
  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    
    // Automatically infer title from first line if title is "Untitled Document" or empty
    let newTitle = activeDoc.title;
    if (newTitle === 'Untitled Document' || newTitle === '') {
      const firstLine = newContent.trim().split('\n')[0] || '';
      // Strip markdown header symbols
      const cleanFirstLine = firstLine.replace(/^[#\s*>-]+/, '').trim().substring(0, 30);
      if (cleanFirstLine) {
        newTitle = cleanFirstLine;
      }
    }

    setDocuments(prev => prev.map(d => {
      if (d.id === activeDocId) {
        return { ...d, content: newContent, title: newTitle, updated_at: Date.now() };
      }
      return d;
    }));

    triggerUiVisibility();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (settings.typewriterSounds) {
      if (e.key === 'Enter') {
        playBell();
      } else if (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Delete') {
        playKeyClick();
      }
    }
  };

  // --- Formatting Toolbar Functions ---
  const applyFormatting = (prefix: string, suffix = '') => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selection = text.substring(start, end);

    const replacement = prefix + selection + suffix;
    
    setDocuments(prev => prev.map(d => {
      if (d.id === activeDocId) {
        return {
          ...d,
          content: text.substring(0, start) + replacement + text.substring(end),
          updated_at: Date.now()
        };
      }
      return d;
    }));

    // Focus back and select formatted text
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + prefix.length, start + prefix.length + selection.length);
    }, 0);
  };

  // --- File Handlers ---
  const handleNewDocument = () => {
    const newId = generateUUID();
    const now = Date.now();
    const newDoc: Document = {
      id: newId,
      title: 'Untitled Document',
      content: '',
      updated_at: now,
      created_at: now,
      is_deleted: false
    };
    setDocuments(prev => [...prev, newDoc]);
    setActiveDocId(newId);
    setSidebarOpen(false);
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  const handleDeleteDocument = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (documents.length <= 1) {
      alert("You must keep at least one document.");
      return;
    }
    if (confirm("Are you sure you want to delete this document?")) {
      const remaining = documents.filter(d => d.id !== id);
      setDocuments(prev => prev.map(d => d.id === id ? { ...d, is_deleted: true, updated_at: Date.now() } : d));
      // physically delete if local only, or keep tombstone if cloud sync exists
      if (!token) {
        setDocuments(remaining);
      }
      if (activeDocId === id) {
        const nextDoc = remaining[0] || documents.find(d => d.id !== id);
        setActiveDocId(nextDoc?.id || '');
      }
    }
  };

  const handleOpenFile = () => {
    fileInputRef.current?.click();
  };

  const handleFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const title = file.name.replace(/\.[^/.]+$/, ""); // strip extension

      const newId = generateUUID();
      const now = Date.now();
      const newDoc: Document = {
        id: newId,
        title: title || 'Imported Document',
        content,
        updated_at: now,
        created_at: now,
        is_deleted: false
      };

      setDocuments(prev => [...prev, newDoc]);
      setActiveDocId(newId);
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset file input
  };

  const handleDownload = (format: 'md' | 'txt' | 'html') => {
    let output = activeDoc.content;
    let mime = 'text/markdown';
    let ext = 'md';

    if (format === 'html') {
      output = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${activeDoc.title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; max-width: 800px; margin: 40px auto; padding: 0 20px; color: #333; }
    h1, h2, h3 { color: #111; margin-top: 1.5em; }
    pre { background: #f4f4f4; padding: 10px; border-radius: 4px; overflow-x: auto; }
    code { font-family: Consolas, Monaco, monospace; background: #f4f4f4; padding: 2px 4px; border-radius: 3px; }
    blockquote { border-left: 4px solid #ddd; padding-left: 15px; color: #666; font-style: italic; margin-left: 0; }
  </style>
</head>
<body>
  ${marked.parse(activeDoc.content) as string}
</body>
</html>`;
      mime = 'text/html';
      ext = 'html';
    } else if (format === 'txt') {
      mime = 'text/plain';
      ext = 'txt';
    }

    const blob = new Blob([output], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeDoc.title || 'untitled'}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = () => {
    window.print();
  };

  // --- Clone Shared Doc locally ---
  const handleCloneShared = () => {
    if (!sharedDoc) return;
    const newId = generateUUID();
    const now = Date.now();
    const newDoc: Document = {
      ...sharedDoc,
      id: newId,
      updated_at: now,
      created_at: now,
    };
    setDocuments(prev => [...prev, newDoc]);
    setActiveDocId(newId);
    setIsReaderMode(false);
    setSharedDoc(null);
    // Clear query parameter
    window.history.replaceState({}, document.title, window.location.pathname);
  };

  // --- Keyboard Shortcuts Listener ---
  useEffect(() => {
    const handleGlobalShortcuts = (e: KeyboardEvent) => {
      // Toggle dark mode (Ctrl + Shift + D)
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        setDarkMode(prev => !prev);
      }
      // Toggle preview (Ctrl + P)
      if (e.ctrlKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setPreviewMode(prev => {
          if (prev === 'editor') return 'split';
          if (prev === 'split') return 'preview';
          return 'editor';
        });
      }
      // Save file (Ctrl + S)
      if (e.ctrlKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleDownload('md');
      }
      // Open file (Ctrl + O)
      if (e.ctrlKey && e.key.toLowerCase() === 'o') {
        e.preventDefault();
        handleOpenFile();
      }
      // New file (Ctrl + N)
      if (e.ctrlKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        handleNewDocument();
      }
      // Fullscreen (Ctrl + Shift + F)
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen().catch(() => {});
        } else {
          document.exitFullscreen().catch(() => {});
        }
      }
      // Toggle formatting toolbar (Ctrl + Shift + T)
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 't') {
        e.preventDefault();
        setSettings(prev => ({ ...prev, showFormattingToolbar: !prev.showFormattingToolbar }));
      }
      // Toggle word count (Ctrl + Shift + W)
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'w') {
        e.preventDefault();
        setSettings(prev => ({ ...prev, showWordCount: !prev.showWordCount }));
      }
      // Toggle Zen mode (Ctrl + Shift + Z)
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        setZenMode(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleGlobalShortcuts);
    return () => window.removeEventListener('keydown', handleGlobalShortcuts);
  }, [activeDoc, documents]);

  // --- Toggle Fullscreen browser mode ---
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  // Determine typography classes based on settings
  const fontClass =
    settings.fontFamily === 'serif'
      ? 'font-serif-editor'
      : settings.fontFamily === 'mono'
      ? 'font-mono-editor'
      : 'font-sans';

  const sizeStyle = { fontSize: `${settings.fontSize}px` };

  const heightClass =
    settings.lineHeight === 'tight'
      ? 'leading-relaxed'
      : settings.lineHeight === 'loose'
      ? 'leading-loose'
      : 'leading-normal';

  const maxWidthClass =
    settings.maxWidth === 'narrow'
      ? 'max-w-[600px]'
      : settings.maxWidth === 'wide'
      ? 'max-w-[1000px]'
      : settings.maxWidth === 'full'
      ? 'max-w-full px-8'
      : 'max-w-[800px]';

  // --- Reader Mode View ---
  if (isReaderMode) {
    return (
      <div className={`min-h-screen ${darkMode ? 'bg-[#0d0e12] text-[#dbdbdf]' : 'bg-[#f5f2eb] text-[#2b2622]'} py-12 px-6 flex flex-col items-center transition-colors duration-300`}>
        {loadingShared ? (
          <div className="flex flex-col items-center justify-center flex-1 space-y-4">
            <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
            <p className="text-sm text-zinc-400">Fetching shared document...</p>
          </div>
        ) : sharedDoc ? (
          <div className="w-full max-w-2xl flex flex-col flex-1">
            <header className="flex justify-between items-center pb-6 border-b border-zinc-200 dark:border-zinc-800 mb-8">
              <div className="flex items-center space-x-2 text-amber-500">
                <BookOpen className="w-5 h-5" />
                <span className="font-semibold text-sm tracking-wide uppercase">Shared View</span>
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={handleCloneShared}
                  className="flex items-center space-x-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-md text-xs font-semibold shadow-md transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Import to Editor</span>
                </button>
                <button
                  onClick={() => {
                    setIsReaderMode(false);
                    setSharedDoc(null);
                    window.history.replaceState({}, document.title, window.location.pathname);
                  }}
                  className="px-4 py-2 border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md text-xs font-semibold transition-colors"
                >
                  Go to App
                </button>
              </div>
            </header>

            <article className="markdown-body max-w-none flex-1 font-serif-editor">
              <h1 className="text-4xl font-extrabold mb-6 font-serif-editor leading-tight">{sharedDoc.title}</h1>
              <div
                className="mt-6 text-lg leading-relaxed font-serif-editor"
                dangerouslySetInnerHTML={{ __html: marked.parse(sharedDoc.content) as string }}
              />
            </article>

            <footer className="mt-16 text-center text-xs text-zinc-400 dark:text-zinc-600 pt-6 border-t border-zinc-200 dark:border-zinc-800">
              Published using Minimal Write Ecosystem • {new Date(sharedDoc.updated_at).toLocaleDateString()}
            </footer>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center flex-1 space-y-4">
            <X className="w-12 h-12 text-red-500" />
            <p className="font-medium">Failed to load the document.</p>
            <button
              onClick={() => {
                setIsReaderMode(false);
                window.history.replaceState({}, document.title, window.location.pathname);
              }}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-md text-sm transition-colors"
            >
              Go to my Editor
            </button>
          </div>
        )}
      </div>
    );
  }

  // --- Main App View ---
  return (
    <div className={`h-screen ${darkMode ? 'bg-[#0d0e12] text-[#dbdbdf]' : 'bg-[#f5f2eb] text-[#2b2622]'} transition-colors duration-300 flex flex-col font-sans relative overflow-hidden`}>
      
      {/* Hidden input for local file pick */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFilePicked}
        accept=".md,.txt,.html"
        className="hidden"
      />

      {/* --- TOP CHROME (HEADER) --- */}
      <header
        className={`fixed top-0 left-0 right-0 h-14 flex items-center justify-between px-6 z-30 transition-all duration-300 no-print ${
          uiVisible && !zenMode ? 'opacity-100 transform-none' : 'opacity-0 -translate-y-2 pointer-events-none'
        }`}
      >
        {/* Left Actions: Document Title & Sidebar Toggle */}
        <div className="flex items-center space-x-4">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 rounded-full transition-colors relative"
            title="My Documents"
          >
            <FileText className="w-5 h-5 text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200" />
            <span className="absolute top-0 right-0 w-2 h-2 bg-amber-500 rounded-full ring-2 ring-[#faf8f5] dark:ring-[#0d0e12]"></span>
          </button>
          <span className="text-sm font-semibold tracking-wide truncate max-w-[200px] sm:max-w-xs text-zinc-650 dark:text-zinc-350">
            {activeDoc?.title}
          </span>
        </div>

        {/* Right Actions: Theme, Sync, Preview, Settings */}
        <div className="flex items-center space-x-2">
          {/* Sync Button / Indicator */}
          <button
            onClick={() => setSyncModalOpen(true)}
            className={`p-2 rounded-full hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 transition-colors flex items-center space-x-1.5 ${
              token ? 'text-amber-500' : 'text-zinc-400 hover:text-zinc-600'
            }`}
            title={token ? `Logged in as ${username}. Click for sync options.` : "Enable Cloud Sync"}
          >
            {syncStatus === 'syncing' ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : token ? (
              <Cloud className="w-5 h-5" />
            ) : (
              <Cloud className="w-5 h-5 opacity-60" />
            )}
            {token && (
              <span className="hidden md:inline text-xs font-semibold uppercase tracking-wider">{username}</span>
            )}
          </button>

          {/* Theme Toggle */}
          <button
            onClick={() => setDarkMode(!darkMode)}
            className="p-2 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 rounded-full transition-colors text-zinc-550 dark:text-zinc-400"
            title="Toggle Theme"
          >
            {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>

          {/* Fullscreen Toggle */}
          <button
            onClick={toggleFullscreen}
            className="p-2 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/50 rounded-full transition-colors text-zinc-550 dark:text-zinc-400"
            title="Toggle Fullscreen"
          >
            {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
          </button>

          {/* Layout Split Modes */}
          <button
            onClick={() => {
              setPreviewMode(prev => {
                if (prev === 'editor') return 'split';
                if (prev === 'split') return 'preview';
                return 'editor';
              });
            }}
            className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-850 rounded-full transition-colors text-zinc-550 dark:text-zinc-400"
            title="Toggle Split Preview"
          >
            {previewMode === 'editor' ? (
              <Eye className="w-5 h-5" />
            ) : previewMode === 'split' ? (
              <Columns className="w-5 h-5 text-amber-500" />
            ) : (
              <Columns className="w-5 h-5 opacity-50" />
            )}
          </button>

          {/* Shortcuts Info */}
          <button
            onClick={() => setShortcutsOpen(true)}
            className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-850 rounded-full transition-colors text-zinc-550 dark:text-zinc-400"
            title="Keyboard Shortcuts"
          >
            <Keyboard className="w-5 h-5" />
          </button>

          {/* Settings / Styling Gear */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-850 rounded-full transition-colors text-zinc-550 dark:text-zinc-400"
            title="Style & Settings"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* --- SIDEBAR DRAWER (Documents & Styles) --- */}
      <div
        className={`fixed inset-y-0 right-0 w-full sm:w-80 bg-[#faf8f5] dark:bg-[#13151a] shadow-2xl border-l border-zinc-150 dark:border-zinc-800/60 z-50 transform transition-transform duration-350 ease-out no-print ${
          sidebarOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full">
          <div className="h-14 flex items-center justify-between px-6 border-b border-zinc-150 dark:border-zinc-800">
            <span className="font-bold text-sm uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Settings & Files</span>
            <button
              onClick={() => setSidebarOpen(false)}
              className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors"
            >
              <X className="w-5 h-5 text-zinc-400" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
            {/* File Actions Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">Documents</h3>
                <button
                  onClick={handleNewDocument}
                  className="flex items-center space-x-1 px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded text-xs font-semibold transition-colors shadow-sm"
                >
                  <Plus className="w-3 h-3" />
                  <span>New</span>
                </button>
              </div>

              {/* Document List */}
              <div className="space-y-1.5 max-h-48 overflow-y-auto custom-scrollbar">
                {documents.filter(d => !d.is_deleted).map(doc => (
                  <div
                    key={doc.id}
                    onClick={() => {
                      setActiveDocId(doc.id);
                      setSidebarOpen(false);
                    }}
                    className={`group flex items-center justify-between px-3 py-2 rounded-md text-sm cursor-pointer transition-colors ${
                      doc.id === activeDocId
                        ? 'bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 font-medium'
                        : 'hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-650 dark:text-zinc-350'
                    }`}
                  >
                    <span className="truncate flex-1 pr-2">{doc.title || 'Untitled'}</span>
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex space-x-1.5">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveDocId(doc.id);
                          setShareModalOpen(true);
                        }}
                        className="p-1 hover:text-amber-500 text-zinc-400 dark:hover:text-amber-400 transition-colors"
                        title="Share Document"
                      >
                        <Share2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => handleDeleteDocument(doc.id, e)}
                        className="p-1 hover:text-red-500 text-zinc-400 dark:hover:text-red-400 transition-colors"
                        title="Delete Document"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* File Ops */}
              <div className="grid grid-cols-2 gap-2 pt-2">
                <button
                  onClick={handleOpenFile}
                  className="flex items-center justify-center space-x-1.5 px-3 py-2 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-md text-xs font-semibold text-zinc-600 dark:text-zinc-400 transition-colors"
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>Open Local</span>
                </button>
                <div className="relative group">
                  <button
                    className="w-full flex items-center justify-center space-x-1.5 px-3 py-2 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-md text-xs font-semibold text-zinc-600 dark:text-zinc-400 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download</span>
                  </button>
                  <div className="absolute right-0 bottom-full mb-1 bg-white dark:bg-[#222] border border-zinc-200 dark:border-zinc-800 rounded-md shadow-xl py-1 hidden group-hover:block w-36 z-50 text-left">
                    <button onClick={() => handleDownload('md')} className="w-full text-left px-3 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-xs text-zinc-600 dark:text-zinc-400">Markdown (.md)</button>
                    <button onClick={() => handleDownload('txt')} className="w-full text-left px-3 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-xs text-zinc-600 dark:text-zinc-400">Plain Text (.txt)</button>
                    <button onClick={() => handleDownload('html')} className="w-full text-left px-3 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-xs text-zinc-600 dark:text-zinc-400">HTML Web (.html)</button>
                    <button onClick={handleExportPDF} className="w-full text-left px-3 py-1.5 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-xs text-zinc-600 dark:text-zinc-400 border-t border-zinc-100 dark:border-zinc-800">Print / PDF</button>
                  </div>
                </div>
              </div>
            </div>

            {/* Typography Options */}
            <div className="space-y-4 pt-4 border-t border-zinc-150 dark:border-zinc-800">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">Typography</h3>
              
              {/* Font Family */}
              <div className="space-y-2">
                <label className="text-xs text-zinc-500 dark:text-zinc-400">Font Style</label>
                <div className="grid grid-cols-3 gap-1 bg-zinc-50 dark:bg-zinc-900 p-1 rounded-md">
                  {(['serif', 'sans', 'mono'] as const).map(f => (
                    <button
                      key={f}
                      onClick={() => setSettings(prev => ({ ...prev, fontFamily: f }))}
                      className={`py-1 text-xs font-medium rounded capitalize transition-all ${
                        settings.fontFamily === f
                          ? 'bg-white dark:bg-zinc-800 text-amber-600 dark:text-amber-400 shadow-sm'
                          : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              {/* Font Size */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-xs text-zinc-500 dark:text-zinc-400">Size ({settings.fontSize}px)</label>
                </div>
                <input
                  type="range"
                  min="14"
                  max="28"
                  step="2"
                  value={settings.fontSize}
                  onChange={(e) => setSettings(prev => ({ ...prev, fontSize: parseInt(e.target.value) }))}
                  className="w-full accent-amber-500 bg-zinc-200 dark:bg-zinc-800 h-1 rounded-lg cursor-pointer"
                />
              </div>

              {/* Line Height */}
              <div className="space-y-2">
                <label className="text-xs text-zinc-500 dark:text-zinc-400">Line Spacing</label>
                <div className="grid grid-cols-3 gap-1 bg-zinc-50 dark:bg-zinc-900 p-1 rounded-md">
                  {(['tight', 'normal', 'loose'] as const).map(lh => (
                    <button
                      key={lh}
                      onClick={() => setSettings(prev => ({ ...prev, lineHeight: lh }))}
                      className={`py-1 text-xs font-medium rounded capitalize transition-all ${
                        settings.lineHeight === lh
                          ? 'bg-white dark:bg-zinc-800 text-amber-600 dark:text-amber-400 shadow-sm'
                          : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400'
                      }`}
                    >
                      {lh}
                    </button>
                  ))}
                </div>
              </div>

              {/* Max Page Width */}
              <div className="space-y-2">
                <label className="text-xs text-zinc-500 dark:text-zinc-400">Writing Width</label>
                <div className="grid grid-cols-4 gap-1 bg-zinc-50 dark:bg-zinc-900 p-1 rounded-md">
                  {(['narrow', 'medium', 'wide', 'full'] as const).map(w => (
                    <button
                      key={w}
                      onClick={() => setSettings(prev => ({ ...prev, maxWidth: w }))}
                      className={`py-1 text-[10px] font-bold rounded capitalize transition-all ${
                        settings.maxWidth === w
                          ? 'bg-white dark:bg-zinc-800 text-amber-600 dark:text-amber-400 shadow-sm'
                          : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400'
                      }`}
                    >
                      {w}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Writing Assistant options */}
            <div className="space-y-4 pt-4 border-t border-zinc-150 dark:border-zinc-800">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">Preferences</h3>
              
              {/* Typewriter Audio */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-550 dark:text-zinc-400 flex items-center space-x-1.5">
                  {settings.typewriterSounds ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4 opacity-50" />}
                  <span>Typewriter Clicks</span>
                </span>
                <input
                  type="checkbox"
                  checked={settings.typewriterSounds}
                  onChange={(e) => setSettings(prev => ({ ...prev, typewriterSounds: e.target.checked }))}
                  className="w-8 h-4 rounded-full bg-zinc-300 dark:bg-zinc-750 checked:bg-amber-500 appearance-none relative cursor-pointer before:absolute before:content-[''] before:h-3 before:w-3 before:bg-white before:rounded-full before:top-[2px] before:left-[2px] checked:before:translate-x-4 before:transition-transform duration-200"
                />
              </div>

              {/* Native Spell Check */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-550 dark:text-zinc-400">Spell Check</span>
                <input
                  type="checkbox"
                  checked={settings.spellCheck}
                  onChange={(e) => setSettings(prev => ({ ...prev, spellCheck: e.target.checked }))}
                  className="w-8 h-4 rounded-full bg-zinc-300 dark:bg-zinc-750 checked:bg-amber-500 appearance-none relative cursor-pointer before:absolute before:content-[''] before:h-3 before:w-3 before:bg-white before:rounded-full before:top-[2px] before:left-[2px] checked:before:translate-x-4 before:transition-transform duration-200"
                />
              </div>

              {/* Focus mode (dim non-active lines) */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-550 dark:text-zinc-400">Focus Mode (UI Dim)</span>
                <input
                  type="checkbox"
                  checked={settings.focusMode}
                  onChange={(e) => setSettings(prev => ({ ...prev, focusMode: e.target.checked }))}
                  className="w-8 h-4 rounded-full bg-zinc-300 dark:bg-zinc-750 checked:bg-amber-500 appearance-none relative cursor-pointer before:absolute before:content-[''] before:h-3 before:w-3 before:bg-white before:rounded-full before:top-[2px] before:left-[2px] checked:before:translate-x-4 before:transition-transform duration-200"
                />
              </div>

              {/* Zen Mode */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-550 dark:text-zinc-400">Zen Mode (Ultra-minimal)</span>
                <input
                  type="checkbox"
                  checked={zenMode}
                  onChange={(e) => setZenMode(e.target.checked)}
                  className="w-8 h-4 rounded-full bg-zinc-300 dark:bg-zinc-750 checked:bg-amber-500 appearance-none relative cursor-pointer before:absolute before:content-[''] before:h-3 before:w-3 before:bg-white before:rounded-full before:top-[2px] before:left-[2px] checked:before:translate-x-4 before:transition-transform duration-200"
                />
              </div>

              {/* Writing Target (Word Goal) */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-xs text-zinc-550 dark:text-zinc-400">Daily Word Goal</label>
                  {settings.writingGoal > 0 && (
                    <span className="text-xs font-bold text-amber-500">{settings.writingGoal} words</span>
                  )}
                </div>
                <input
                  type="number"
                  placeholder="e.g. 500 (0 to disable)"
                  value={settings.writingGoal || ''}
                  onChange={(e) => setSettings(prev => ({ ...prev, writingGoal: Math.max(0, parseInt(e.target.value) || 0) }))}
                  className="w-full px-3 py-1.5 text-xs bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>
          </div>
          
          <div className="p-6 border-t border-zinc-150 dark:border-zinc-800 text-center text-[10px] text-zinc-400">
            Minimal Write Ecosystem v1.0.0 • Local First
          </div>
        </div>
      </div>

      {/* --- MAIN WRITING CANVAS --- */}
      <main className="flex-1 flex flex-col pt-16 pb-6 relative w-full min-h-0 overflow-hidden">
        {/* Progress bar for Writing Word Goal */}
        {settings.writingGoal > 0 && (
          <div className="fixed top-14 left-0 right-0 h-1 bg-zinc-200 dark:bg-zinc-800 z-20 no-print">
            <div
              className="h-full bg-amber-500 transition-all duration-300"
              style={{ width: `${Math.min(100, (counts.words / settings.writingGoal) * 100)}%` }}
              title={`Goal: ${counts.words}/${settings.writingGoal} words`}
            ></div>
          </div>
        )}

        {/* Mobile Write/Preview Tabs */}
        {isMobile && (
          <div className="flex border-b border-zinc-150 dark:border-zinc-800/80 bg-white/60 dark:bg-black/30 backdrop-blur no-print select-none">
            <button
              onClick={() => setMobileTab('write')}
              className={`flex-1 py-2.5 text-center text-xs font-bold uppercase tracking-wider transition-colors ${
                mobileTab === 'write'
                  ? 'text-amber-500 border-b-2 border-amber-500'
                  : 'text-zinc-400 dark:text-zinc-650'
              }`}
            >
              Write
            </button>
            <button
              onClick={() => setMobileTab('preview')}
              className={`flex-1 py-2.5 text-center text-xs font-bold uppercase tracking-wider transition-colors ${
                mobileTab === 'preview'
                  ? 'text-amber-500 border-b-2 border-amber-500'
                  : 'text-zinc-400 dark:text-zinc-650'
              }`}
            >
              Preview
            </button>
          </div>
        )}

        <div className="flex-1 flex flex-col md:flex-row items-stretch justify-center w-full min-h-0 overflow-hidden">
          {/* EDITOR SCREEN */}
          {(((!isMobile && (previewMode === 'editor' || previewMode === 'split')) || (isMobile && mobileTab === 'write')) || zenMode) && (
            <div
              className={`flex-1 flex flex-col items-center overflow-y-auto px-6 h-full custom-scrollbar transition-opacity duration-300 ${
                settings.focusMode && !uiVisible ? 'opacity-85' : 'opacity-100'
              }`}
            >
              <textarea
                ref={textareaRef}
                value={activeDoc?.content || ''}
                onChange={handleContentChange}
                onKeyDown={handleKeyDown}
                spellCheck={settings.spellCheck}
                placeholder="Start typing your story here... Supports markdown formatting."
                className={`w-full flex-1 focus:outline-none resize-none bg-transparent ${fontClass} ${heightClass} ${maxWidthClass} custom-scrollbar pt-6 pb-24`}
                style={sizeStyle}
              />
            </div>
          )}

          {/* SPLIT / PREVIEW SCREEN */}
          {((!isMobile && (previewMode === 'preview' || previewMode === 'split')) || (isMobile && mobileTab === 'preview')) && !zenMode && (
            <div className={`flex-1 overflow-y-auto px-8 py-6 h-full border-t-0 md:border-l border-zinc-200 dark:border-zinc-800/60 custom-scrollbar flex flex-col items-center bg-[#f5f2eb]/40 dark:bg-[#13151a]/30`}>
              <div className={`w-full ${maxWidthClass} markdown-body font-serif-editor`}>
                <h1 className="text-3xl font-extrabold pb-4 border-b border-zinc-100 dark:border-zinc-800 leading-tight">
                  {activeDoc?.title}
                </h1>
                <div
                  className="mt-6 text-base leading-relaxed print-content"
                  dangerouslySetInnerHTML={{ __html: marked.parse(activeDoc?.content || '') as string }}
                />
              </div>
            </div>
          )}
        </div>
      </main>

      {/* --- FORMATTING TOOLBAR (BOTTOM CENTER) --- */}
      {settings.showFormattingToolbar && !zenMode && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#faf8f5] dark:bg-[#13151a] shadow-xl border border-zinc-150 dark:border-zinc-800 px-4 py-2 rounded-full flex items-center space-x-1 z-35 transition-all duration-300 no-print max-w-[90vw] overflow-x-auto no-scrollbar flex-nowrap ${
            uiVisible ? 'opacity-100 transform -translate-x-1/2' : 'opacity-0 translate-y-3 pointer-events-none'
          }`}
        >
          <button onClick={() => applyFormatting('**', '**')} className="p-2 hover:bg-zinc-50 dark:hover:bg-zinc-850 rounded-full transition-colors text-zinc-500 hover:text-zinc-850 dark:text-zinc-400 dark:hover:text-zinc-200" title="Bold"><Bold className="w-4 h-4" /></button>
          <button onClick={() => applyFormatting('*', '*')} className="p-2 hover:bg-zinc-50 dark:hover:bg-zinc-850 rounded-full transition-colors text-zinc-500 hover:text-zinc-850 dark:text-zinc-400 dark:hover:text-zinc-200" title="Italic"><Italic className="w-4 h-4" /></button>
          <button onClick={() => applyFormatting('# ')} className="p-2 hover:bg-zinc-50 dark:hover:bg-zinc-850 rounded-full transition-colors text-zinc-500 hover:text-zinc-850 dark:text-zinc-400 dark:hover:text-zinc-200" title="Heading 1"><Heading1 className="w-4 h-4" /></button>
          <button onClick={() => applyFormatting('## ')} className="p-2 hover:bg-zinc-50 dark:hover:bg-zinc-850 rounded-full transition-colors text-zinc-500 hover:text-zinc-850 dark:text-zinc-400 dark:hover:text-zinc-200" title="Heading 2"><Heading2 className="w-4 h-4" /></button>
          <button onClick={() => applyFormatting('- ')} className="p-2 hover:bg-zinc-50 dark:hover:bg-zinc-855 rounded-full transition-colors text-zinc-500 hover:text-zinc-850 dark:text-zinc-400 dark:hover:text-zinc-200" title="Bullet List"><List className="w-4 h-4" /></button>
          <button onClick={() => applyFormatting('> ')} className="p-2 hover:bg-zinc-50 dark:hover:bg-zinc-850 rounded-full transition-colors text-zinc-500 hover:text-zinc-850 dark:text-zinc-400 dark:hover:text-zinc-200" title="Quote"><Quote className="w-4 h-4" /></button>
          <button onClick={() => applyFormatting('```\n', '\n```')} className="p-2 hover:bg-zinc-50 dark:hover:bg-zinc-850 rounded-full transition-colors text-zinc-500 hover:text-zinc-850 dark:text-zinc-400 dark:hover:text-zinc-200" title="Code Block"><FileCode className="w-4 h-4" /></button>
          
          <span className="w-px h-4 bg-zinc-200 dark:bg-zinc-800 mx-1 flex-shrink-0" />
          
          <button onClick={() => applyFormatting('[', '](url)')} className="p-2 hover:bg-zinc-50 dark:hover:bg-zinc-855 rounded-full transition-colors text-zinc-500 hover:text-zinc-850 dark:text-zinc-400 dark:hover:text-zinc-200" title="Link"><Link className="w-4 h-4" /></button>
          <button onClick={() => applyFormatting('~~', '~~')} className="p-2 hover:bg-zinc-50 dark:hover:bg-zinc-850 rounded-full transition-colors text-zinc-500 hover:text-zinc-850 dark:text-zinc-400 dark:hover:text-zinc-200" title="Strikethrough"><Strikethrough className="w-4 h-4" /></button>
          <button onClick={() => applyFormatting('`', '`')} className="p-2 hover:bg-zinc-50 dark:hover:bg-zinc-850 rounded-full transition-colors text-zinc-500 hover:text-zinc-850 dark:text-zinc-400 dark:hover:text-zinc-200" title="Inline Code"><Code className="w-4 h-4" /></button>
          <button onClick={() => applyFormatting('- [ ] ')} className="p-2 hover:bg-zinc-50 dark:hover:bg-zinc-850 rounded-full transition-colors text-zinc-500 hover:text-zinc-850 dark:text-zinc-400 dark:hover:text-zinc-200" title="Task List"><CheckSquare className="w-4 h-4" /></button>
          <button onClick={() => applyFormatting('\n---\n')} className="p-2 hover:bg-zinc-50 dark:hover:bg-zinc-850 rounded-full transition-colors text-zinc-500 hover:text-zinc-850 dark:text-zinc-400 dark:hover:text-zinc-200" title="Horizontal Line"><Minus className="w-4 h-4" /></button>
        </div>
      )}

      {/* --- WORD & LINE COUNTS (BOTTOM RIGHT) --- */}
      {settings.showWordCount && !zenMode && (
        <footer
          className={`fixed bottom-6 right-6 text-xs text-zinc-400 dark:text-zinc-550 z-30 transition-all duration-300 bg-white/60 dark:bg-black/30 backdrop-blur-sm px-3 py-1.5 rounded-md border border-zinc-150/40 dark:border-zinc-800/40 no-print ${
            uiVisible ? 'opacity-100 transform-none' : 'opacity-0 translate-y-1 pointer-events-none'
          }`}
        >
          <span className="font-medium mr-3">{counts.words} words</span>
          <span className="font-medium">{counts.chars} characters</span>
        </footer>
      )}

      {/* --- MODAL: SYNC & AUTH --- */}
      {syncModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#faf8f5] dark:bg-[#13151a] rounded-xl w-full max-w-md border border-zinc-200 dark:border-zinc-800 shadow-2xl p-6 relative">
            <button
              onClick={() => setSyncModalOpen(false)}
              className="absolute top-4 right-4 p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors"
            >
              <X className="w-5 h-5 text-zinc-400" />
            </button>

            {token ? (
              // Authenticated view
              <div className="space-y-6">
                <div className="flex items-center space-x-3 text-amber-500">
                  <Cloud className="w-8 h-8" />
                  <div>
                    <h3 className="font-bold text-lg">Cloud Sync Enabled</h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Authenticated as {username}</p>
                  </div>
                </div>

                <div className="bg-zinc-50 dark:bg-zinc-900 rounded-lg p-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Sync Status:</span>
                    <span className="font-semibold text-green-600 dark:text-green-400 capitalize">{syncStatus === 'success' ? 'Synced successfully' : syncStatus === 'syncing' ? 'Syncing...' : 'Connected'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Last Synced:</span>
                    <span className="text-zinc-600 dark:text-zinc-400">{lastSyncTime > 0 ? new Date(lastSyncTime).toLocaleTimeString() : 'Never'}</span>
                  </div>
                </div>

                <div className="flex space-x-3 pt-2">
                  <button
                    onClick={() => performSync(token)}
                    disabled={syncStatus === 'syncing'}
                    className="flex-1 flex items-center justify-center space-x-2 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-400 text-white rounded-md py-2.5 text-sm font-semibold shadow-md transition-colors"
                  >
                    {syncStatus === 'syncing' && <Loader2 className="w-4 h-4 animate-spin" />}
                    <span>Sync Now</span>
                  </button>
                  <button
                    onClick={handleLogout}
                    className="flex items-center justify-center space-x-1.5 px-4 py-2 border border-zinc-200 dark:border-zinc-800 hover:bg-red-50 dark:hover:bg-red-950/20 text-red-500 rounded-md text-sm font-semibold transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Log Out</span>
                  </button>
                </div>
              </div>
            ) : (
              // Auth forms (login / signup)
              <div className="space-y-6">
                <div>
                  <h3 className="font-bold text-xl flex items-center space-x-2">
                    <Lock className="w-5 h-5 text-amber-500" />
                    <span>{authMode === 'login' ? 'Sign In to Cloud Sync' : 'Create Sync Account'}</span>
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                    Store and sync your documents securely on your private server or minimal-write instance.
                  </p>
                </div>

                {authError && (
                  <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-lg p-3 text-xs text-red-600 dark:text-red-400 font-medium">
                    {authError}
                  </div>
                )}

                <form onSubmit={handleAuth} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-1.5">Username</label>
                    <input
                      type="text"
                      required
                      value={formUser}
                      onChange={(e) => setFormUser(e.target.value)}
                      placeholder="Enter username"
                      className="w-full px-3.5 py-2.5 text-sm bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg focus:outline-none focus:border-amber-500 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-1.5">Password</label>
                    <input
                      type="password"
                      required
                      value={formPass}
                      onChange={(e) => setFormPass(e.target.value)}
                      placeholder="Enter password"
                      className="w-full px-3.5 py-2.5 text-sm bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg focus:outline-none focus:border-amber-500 transition-colors"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={authLoading}
                    className="w-full flex items-center justify-center space-x-2 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-400 text-white rounded-lg py-2.5 text-sm font-semibold shadow-md transition-colors"
                  >
                    {authLoading && <Loader2 className="w-4.5 h-4.5 animate-spin" />}
                    <span>{authMode === 'login' ? 'Sign In' : 'Sign Up & Get Syncing'}</span>
                  </button>
                </form>

                <div className="text-center text-xs">
                  {authMode === 'login' ? (
                    <p className="text-zinc-500">
                      New to cloud sync?{' '}
                      <button onClick={() => { setAuthMode('signup'); setAuthError(''); }} className="text-amber-500 hover:underline font-semibold">Create account</button>
                    </p>
                  ) : (
                    <p className="text-zinc-500">
                      Already have an account?{' '}
                      <button onClick={() => { setAuthMode('login'); setAuthError(''); }} className="text-amber-500 hover:underline font-semibold">Sign In</button>
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- MODAL: SHORTCUTS GUIDE --- */}
      {shortcutsOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#faf8f5] dark:bg-[#13151a] rounded-xl w-full max-w-md border border-zinc-200 dark:border-zinc-800 shadow-2xl p-6 relative">
            <button
              onClick={() => setShortcutsOpen(false)}
              className="absolute top-4 right-4 p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors"
            >
              <X className="w-5 h-5 text-zinc-400" />
            </button>

            <div className="space-y-4">
              <h3 className="font-bold text-lg flex items-center space-x-2">
                <Keyboard className="w-5 h-5 text-amber-500" />
                <span>Keyboard Shortcuts</span>
              </h3>
              
              <div className="space-y-2.5 text-sm">
                <div className="flex justify-between py-1.5 border-b border-zinc-100 dark:border-zinc-800">
                  <span className="text-zinc-500">New Document</span>
                  <kbd className="px-2 py-0.5 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded text-xs font-mono">Ctrl + N</kbd>
                </div>
                <div className="flex justify-between py-1.5 border-b border-zinc-100 dark:border-zinc-800">
                  <span className="text-zinc-500">Open Local File</span>
                  <kbd className="px-2 py-0.5 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded text-xs font-mono">Ctrl + O</kbd>
                </div>
                <div className="flex justify-between py-1.5 border-b border-zinc-100 dark:border-zinc-800">
                  <span className="text-zinc-500">Save / Download Markdown</span>
                  <kbd className="px-2 py-0.5 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded text-xs font-mono">Ctrl + S</kbd>
                </div>
                <div className="flex justify-between py-1.5 border-b border-zinc-100 dark:border-zinc-800">
                  <span className="text-zinc-500">Toggle Split Preview</span>
                  <kbd className="px-2 py-0.5 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded text-xs font-mono">Ctrl + P</kbd>
                </div>
                <div className="flex justify-between py-1.5 border-b border-zinc-100 dark:border-zinc-800">
                  <span className="text-zinc-500">Toggle Fullscreen</span>
                  <kbd className="px-2 py-0.5 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded text-xs font-mono">Ctrl + Shift + F</kbd>
                </div>
                <div className="flex justify-between py-1.5 border-b border-zinc-100 dark:border-zinc-800">
                  <span className="text-zinc-500">Toggle Dark / Light Mode</span>
                  <kbd className="px-2 py-0.5 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded text-xs font-mono">Ctrl + Shift + D</kbd>
                </div>
                <div className="flex justify-between py-1.5 border-b border-zinc-100 dark:border-zinc-800">
                  <span className="text-zinc-500">Toggle Accessibility Navbar</span>
                  <kbd className="px-2 py-0.5 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded text-xs font-mono">Ctrl + Shift + T</kbd>
                </div>
                <div className="flex justify-between py-1.5 border-b border-zinc-100 dark:border-zinc-800">
                  <span className="text-zinc-500">Toggle Word / Line Count</span>
                  <kbd className="px-2 py-0.5 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded text-xs font-mono">Ctrl + Shift + W</kbd>
                </div>
                <div className="flex justify-between py-1.5 border-b border-zinc-100 dark:border-zinc-800">
                  <span className="text-zinc-500">Toggle Zen Mode (Centered Focus)</span>
                  <kbd className="px-2 py-0.5 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded text-xs font-mono">Ctrl + Shift + Z</kbd>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL: SHARING SYSTEM --- */}
      {shareModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#faf8f5] dark:bg-[#13151a] rounded-xl w-full max-w-md border border-zinc-200 dark:border-zinc-800 shadow-2xl p-6 relative">
            <button
              onClick={() => setShareModalOpen(false)}
              className="absolute top-4 right-4 p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors"
            >
              <X className="w-5 h-5 text-zinc-400" />
            </button>

            <div className="space-y-6">
              <div>
                <h3 className="font-bold text-lg flex items-center space-x-2">
                  <Share2 className="w-5 h-5 text-amber-500" />
                  <span>Document Sharing</span>
                </h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                  Publish this document as a read-only link. Sync account must be active.
                </p>
              </div>

              {!token ? (
                <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-lg p-4 text-xs text-amber-800 dark:text-amber-400 font-medium space-y-3">
                  <p>You need to sign in with a cloud sync account before you can publish and share documents.</p>
                  <button
                    onClick={() => { setShareModalOpen(false); setSyncModalOpen(true); }}
                    className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded text-xs font-bold transition-colors shadow-sm"
                  >
                    Connect Sync Account
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Share Status Toggle */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">Public Sharing</span>
                    <button
                      onClick={async () => {
                        try {
                          const isSharing = !!activeDoc.share_id;
                          const nextShareId = await toggleShareAPI(token, activeDoc.id, !isSharing);
                          setDocuments(prev => prev.map(d => d.id === activeDoc.id ? { ...d, share_id: nextShareId } : d));
                        } catch (err: any) {
                          alert(err.message || 'Sharing update failed');
                        }
                      }}
                      className={`px-4 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider transition-colors ${
                        activeDoc.share_id
                          ? 'bg-green-100 hover:bg-green-200 text-green-700 dark:bg-green-950/20 dark:text-green-400'
                          : 'bg-zinc-150 hover:bg-zinc-200 text-zinc-650 dark:bg-zinc-800 dark:text-zinc-400'
                      }`}
                    >
                      {activeDoc.share_id ? 'Enabled' : 'Disabled'}
                    </button>
                  </div>

                  {activeDoc.share_id && (
                    <div className="space-y-2 pt-2">
                      <label className="block text-xs font-semibold text-zinc-500 dark:text-zinc-400">Shareable Web Link</label>
                      <div className="flex space-x-2">
                        <input
                          type="text"
                          readOnly
                          value={`${window.location.origin}/?share=${activeDoc.share_id}`}
                          className="w-full text-xs px-3 py-2 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-md focus:outline-none"
                        />
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(`${window.location.origin}/?share=${activeDoc.share_id}`);
                            alert('Copied link to clipboard!');
                          }}
                          className="p-2 bg-amber-500 hover:bg-amber-600 text-white rounded-md transition-colors"
                          title="Copy Link"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                        <a
                          href={`/?share=${activeDoc.share_id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="p-2 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-md transition-colors flex items-center justify-center"
                          title="View Page"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
