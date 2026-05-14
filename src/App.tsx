/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  auth, 
  db, 
  googleProvider, 
  handleFirestoreError, 
  OperationType 
} from './lib/firebase';
import { 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged, 
  User 
} from 'firebase/auth';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc,
  doc, 
  Timestamp, 
  serverTimestamp 
} from 'firebase/firestore';
import { 
  Trash2,
  Layout, 
  MessageSquare, 
  FileText, 
  LogOut, 
  Plus, 
  Send, 
  ChevronRight, 
  ArrowLeft,
  Download, 
  User as UserIcon,
  Settings,
  History,
  Archive,
  Loader2,
  BrainCircuit,
  Database
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { generateInterviewResponse, generateFinalReport, MODELS } from './lib/gemini';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Types
interface Message {
  role: 'user' | 'model';
  text: string;
}

interface Chat {
  id: string;
  userId: string;
  messages: Message[];
  status: 'open' | 'closed';
  sector?: string;
  role?: string;
  model: string;
  createdAt: any;
  updatedAt: any;
}

interface Report {
  id: string;
  conversationId: string;
  userId: string;
  sector: string;
  role: string;
  content: {
    resumenEjecutivo: string;
    inventarioTareas: string; // Will store processes
    stackTecnologico: string; 
    oportunidadesAutomatizacion: string; // Will store AI solutions
    requerimientosTecnicos: string;
  };
  status?: 'open' | 'closed';
  createdAt: any;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [chats, setChats] = useState<Chat[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [activeChat, setActiveChat] = useState<Chat | null>(null);
  const [activeReport, setActiveReport] = useState<Report | null>(null);
  const [input, setInput] = useState('');
  const [selectedModel, setSelectedModel] = useState(MODELS.FLASH);
  const [isSending, setIsSending] = useState(false);
  const [view, setView] = useState<'chat' | 'report'>('chat');
  const [currentScreen, setCurrentScreen] = useState<'interviews' | 'repository'>('interviews');
  const [darkMode, setDarkMode] = useState(true);
  
  // Filters for repository
  const [filterRole, setFilterRole] = useState('');
  const [filterSector, setFilterSector] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [repoTab, setRepoTab] = useState<'open' | 'closed' | 'ongoing'>('open');
  const [selectedReports, setSelectedReports] = useState<string[]>([]);
  const [selectedChats, setSelectedChats] = useState<string[]>([]);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  const toggleDarkMode = () => {
    // Disabled logic
  };

  // Dark mode effect for initialization
  useEffect(() => {
    document.documentElement.classList.add('dark');
    document.body.classList.add('dark');
    localStorage.setItem('darkMode', 'true');
  }, []);

  // Auth
  useEffect(() => {
    import('./lib/firebase').then(m => m.testConnection());
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // Data fetching
  useEffect(() => {
    if (!user) return;

    const chatsQuery = query(
      collection(db, 'conversations'),
      where('userId', '==', user.uid),
      orderBy('updatedAt', 'desc')
    );

    const reportsQuery = query(
      collection(db, 'reports'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubChats = onSnapshot(chatsQuery, (snap) => {
      const chatList = snap.docs.map(d => ({ id: d.id, ...d.data() } as Chat));
      setChats(chatList);
      
      // Keep activeChat in sync with updates (like model messages arriving)
      setActiveChat(current => {
        if (!current) return null;
        const updated = chatList.find(c => c.id === current.id);
        return updated || current;
      });
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'conversations'));

    const unsubReports = onSnapshot(reportsQuery, (snap) => {
      const reportList = snap.docs.map(d => ({ id: d.id, ...d.data() } as Report));
      setReports(reportList);
      
      setActiveReport(current => {
        if (!current) return null;
        const updated = reportList.find(r => r.id === current.id);
        return updated || current;
      });
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'reports'));

    return () => {
      unsubChats();
      unsubReports();
    };
  }, [user]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeChat?.messages]);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      console.error("Login failed", e);
    }
  };

  const handleLogout = () => signOut(auth);

  const startNewChat = async () => {
    if (!user) return;
    const initialMessage: Message = {
      role: 'model',
      text: "Hola. Soy tu Analista de Procesos de Negocio y Arquitecto de Soluciones Senior. Estoy aquí para ayudarte a documentar tus procesos y encontrar oportunidades de automatización.\n\nPara comenzar, ¿podrías decirme el nombre exacto de tu puesto y cuál es la misión principal de tu cargo dentro de la empresa?"
    };

    try {
      const docRef = await addDoc(collection(db, 'conversations'), {
        userId: user.uid,
        messages: [initialMessage],
        status: 'open',
        model: selectedModel,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setInput(''); // Clear input
      setView('chat');
      setActiveReport(null);
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'conversations');
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || !activeChat || isSending) return;

    const userMessage: Message = { role: 'user', text: input };
    const updatedMessages = [...activeChat.messages, userMessage];
    setInput('');
    setIsSending(true);

    try {
      // Optimistic update
      const chatDocRef = doc(db, 'conversations', activeChat.id);
      await updateDoc(chatDocRef, {
        messages: updatedMessages,
        updatedAt: serverTimestamp()
      });

      // Special trigger for report generation
      if (input.toLowerCase().includes('generar requerimiento')) {
        await finalizeReport(activeChat.id, updatedMessages);
      } else {
        const stream = await generateInterviewResponse(updatedMessages, activeChat.model);
        let modelText = '';
        
        // Add placeholder message for streaming
        const messageWithPlaceholder = [...updatedMessages, { role: 'model', text: '' } as Message];
        
        for await (const chunk of stream) {
          modelText += chunk.text;
          // Update Firestore every chunk might be overkill, let's keep it local first if needed
        }

        await updateDoc(chatDocRef, {
          messages: [...updatedMessages, { role: 'model', text: modelText }],
          updatedAt: serverTimestamp()
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsSending(false);
    }
  };

  const finalizeReport = async (chatId: string, history: Message[]) => {
    if (!user) return;
    try {
      const historyText = history.map(m => `${m.role}: ${m.text}`).join('\n');
      const docData = await generateFinalReport(historyText, MODELS.PRO);
      
      if (docData) {
        const reportData = {
          conversationId: chatId,
          userId: user.uid,
          sector: docData.sector || 'General',
          role: docData.rol || 'Colaborador',
          content: {
            resumenEjecutivo: docData.resumenEjecutivo || '',
            inventarioTareas: docData.inventarioTareas || '',
            stackTecnologico: docData.stackTecnologico || '',
            oportunidadesAutomatizacion: docData.oportunidadesAutomatizacion || '',
            requerimientosTecnicos: docData.requerimientosTecnicos || ''
          },
          status: 'open' as const,
          createdAt: serverTimestamp()
        };

        const reportRef = await addDoc(collection(db, 'reports'), reportData);

        await updateDoc(doc(db, 'conversations', chatId), {
          status: 'closed',
          sector: docData.sector || 'General',
          role: docData.rol || 'Colaborador',
          updatedAt: serverTimestamp()
        });

        // Set the active report immediately for the view
        setActiveReport({ id: reportRef.id, ...reportData } as Report);
        setView('report');
      }
    } catch (e) {
      console.error("Report generation failed", e);
    }
  };

  const toggleReportStatus = async (report: Report) => {
    try {
      const newStatus = report.status === 'closed' ? 'open' : 'closed';
      await updateDoc(doc(db, 'reports', report.id), {
        status: newStatus
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, 'reports');
    }
  };

  const deleteReport = async (e: React.MouseEvent, reportId: string) => {
    e.stopPropagation();
    if (!window.confirm('¿Está seguro de que desea eliminar este caso? Esta acción no se puede deshacer.')) return;
    try {
      await deleteDoc(doc(db, 'reports', reportId));
      if (activeReport?.id === reportId) {
        setActiveReport(null);
        setView('chat');
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, 'reports');
    }
  };

  const deleteChat = async (e: React.MouseEvent, chatId: string) => {
    e.stopPropagation();
    if (!window.confirm('¿Está seguro de que desea eliminar esta entrevista? Esta acción no se puede deshacer.')) return;
    try {
      await deleteDoc(doc(db, 'conversations', chatId));
      if (activeChat?.id === chatId) {
        setActiveChat(null);
        setView('chat');
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, 'conversations');
    }
  };

  const deleteSelected = async () => {
    const isReports = repoTab !== 'ongoing';
    const itemsToDelete = isReports ? selectedReports : selectedChats;
    
    if (itemsToDelete.length === 0) return;
    if (!window.confirm(`¿Está seguro de que desea eliminar los ${itemsToDelete.length} elementos seleccionados? Esta acción no se puede deshacer.`)) return;

    try {
      const collectionName = isReports ? 'reports' : 'conversations';
      const promises = itemsToDelete.map(id => deleteDoc(doc(db, collectionName, id)));
      await Promise.all(promises);
      
      if (isReports) {
        if (activeReport && selectedReports.includes(activeReport.id)) {
          setActiveReport(null);
          setView('chat');
        }
        setSelectedReports([]);
      } else {
        if (activeChat && selectedChats.includes(activeChat.id)) {
          setActiveChat(null);
        }
        setSelectedChats([]);
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, isReports ? 'reports' : 'conversations');
    }
  };

  const toggleReportSelection = (e: React.SyntheticEvent, reportId: string) => {
    e.stopPropagation();
    setSelectedReports(prev => 
      prev.includes(reportId) ? prev.filter(id => id !== reportId) : [...prev, reportId]
    );
  };

  const toggleChatSelection = (e: React.SyntheticEvent, chatId: string) => {
    e.stopPropagation();
    setSelectedChats(prev => 
      prev.includes(chatId) ? prev.filter(id => id !== chatId) : [...prev, chatId]
    );
  };

  const [isDownloading, setIsDownloading] = useState(false);

  // PDF generation
  const downloadPDF = async (reportToDownload?: Report) => {
    if (reportToDownload && view !== 'report') {
      setActiveReport(reportToDownload);
      setView('report');
      // Wait for React to render and animations to settle
      setTimeout(() => downloadPDF(), 500);
      return;
    }

    const element = document.getElementById('report-content');
    if (!element) {
      console.error("Report content element not found");
      // Try one last time after a short delay
      setTimeout(() => {
        const retryElement = document.getElementById('report-content');
        if (retryElement) {
           downloadPDF();
        } else {
           alert("No se pudo encontrar el contenido del reporte. Por favor, abra el reporte primero.");
        }
      }, 500);
      return;
    }

    try {
      setIsDownloading(true);
      // Wait to ensure everything is settled
      await new Promise(resolve => setTimeout(resolve, 800));

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        onclone: (clonedDoc) => {
          const clonedElement = clonedDoc.getElementById('report-content');
          if (clonedElement) {
            // Remove everything else from the body to keep it clean
            clonedDoc.body.innerHTML = '';
            clonedDoc.body.appendChild(clonedElement);
            clonedElement.style.margin = '0';
            clonedElement.style.padding = '40px'; // Re-add some padding

            const allElements = clonedElement.getElementsByTagName('*');
            for (let i = 0; i < allElements.length; i++) {
              const el = allElements[i] as HTMLElement;
              const style = window.getComputedStyle(el);
              
              // Force conversion to RGB by re-applying style as inline
              // and stripping out any oklch/oklab references if found
              const color = style.color;
              const bgColor = style.backgroundColor;
              const borderColor = style.borderColor;
              
              if (color && (color.includes('oklch') || color.includes('oklab'))) {
                el.style.color = '#000000';
              } else {
                el.style.color = color;
              }
              
              if (bgColor && (bgColor.includes('oklch') || bgColor.includes('oklab'))) {
                el.style.backgroundColor = '#ffffff';
              } else {
                el.style.backgroundColor = bgColor;
              }

              if (borderColor && (borderColor.includes('oklch') || borderColor.includes('oklab'))) {
                el.style.borderColor = '#000000';
              } else {
                el.style.borderColor = borderColor;
              }
            }

            const statusButton = clonedElement.querySelector('button');
            if (statusButton) statusButton.remove();
          }
        }
      });
      
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      let heightLeft = pdfHeight;
      let position = 0;
      const pageHeight = pdf.internal.pageSize.getHeight();

      pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight, undefined, 'FAST');
      heightLeft -= pageHeight;

      while (heightLeft > 0) {
        position = heightLeft - pdfHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, pdfWidth, pdfHeight, undefined, 'FAST');
        heightLeft -= pageHeight;
      }

      const fileName = `Protocolo_IA_${(reportToDownload?.role || activeReport?.role || 'Reporte').replace(/\s+/g, '_')}.pdf`;
      pdf.save(fileName);
    } catch (error) {
      console.error("PDF generation failed:", error);
      alert("Error al generar el PDF. El sistema detectó un conflicto de color (oklab/oklch). Intentando simplificar automáticamente...");
    } finally {
      setIsDownloading(false);
    }
  };

  const [showProgress, setShowProgress] = useState(true);
  const progressTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (view === 'chat' && activeChat) {
      setShowProgress(true);
      if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
      progressTimerRef.current = setTimeout(() => {
        setShowProgress(false);
      }, 4000);
    }
    return () => {
      if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
    };
  }, [activeChat?.messages.length, view]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-editorial-bg">
        <Loader2 className="h-10 w-10 animate-spin text-editorial-accent dark:text-dark-accent" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className={cn(
        "flex h-screen flex-col items-center justify-center p-6 text-center transition-colors duration-500",
        darkMode ? "bg-dark-bg" : "bg-gradient-to-br from-editorial-bg to-editorial-highlight"
      )}>
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-editorial-highlight dark:bg-dark-surface p-10 rounded-none shadow-2xl border border-editorial-border dark:border-dark-border"
        >
          <div className="mb-8 flex justify-center">
            <div className="p-5 bg-editorial-accent dark:bg-dark-accent rounded-none shadow-lg shadow-editorial-accent/20">
              <BrainCircuit className="h-12 w-12 text-white dark:text-dark-bg" />
            </div>
          </div>
          <h1 className="text-4xl font-serif italic text-editorial-accent dark:text-dark-accent mb-3 tracking-tight">Analista AI</h1>
          <p className="text-editorial-muted dark:text-dark-muted mb-10 leading-relaxed uppercase text-[10px] tracking-[0.2em] font-bold">
            Business Process Architecture & Automation
          </p>
          <button 
            onClick={handleLogin}
            className="w-full flex items-center justify-center gap-4 bg-editorial-accent dark:bg-dark-accent text-white dark:text-dark-bg px-6 py-5 font-bold uppercase tracking-[0.3em] text-[10px] hover:bg-black dark:hover:bg-white transition-all shadow-[0_20px_25px_-5px_rgba(0,0,0,0.1),0_8px_10px_-6px_rgba(0,0,0,0.1)] active:scale-[0.98]"
          >
            <img src="https://www.google.com/favicon.ico" className="w-5 h-5 grayscale invert dark:grayscale-0 dark:invert-0" alt="Google" />
            Acceder con Google
          </button>
        </motion.div>
      </div>
    );
  }

  // Organization and Filtering of reports
  const filteredReports = reports.filter(report => {
    const matchesTab = repoTab === 'open' ? (report.status === 'open' || !report.status) : report.status === 'closed';
    if (repoTab === 'ongoing') return false; // Handled by separate list

    const matchesRole = !filterRole || report.role.toLowerCase().includes(filterRole.toLowerCase());
    const matchesSector = !filterSector || report.sector.toLowerCase().includes(filterSector.toLowerCase());
    const matchesSearch = !searchQuery || 
      report.role.toLowerCase().includes(searchQuery.toLowerCase()) || 
      report.sector.toLowerCase().includes(searchQuery.toLowerCase()) ||
      report.content.resumenEjecutivo.toLowerCase().includes(searchQuery.toLowerCase());
    
    return matchesTab && matchesRole && matchesSector && matchesSearch;
  });

  const availableRoles = Array.from(new Set(reports.map(r => r.role))).sort();
  const availableSectors = Array.from(new Set(reports.map(r => r.sector))).sort();

  return (
    <div className="flex h-screen bg-editorial-bg overflow-hidden font-sans text-editorial-text transition-colors duration-500">
      {/* Sidebar */}
      <aside className="w-80 flex-shrink-0 bg-editorial-highlight border-r border-editorial-border flex flex-col transition-all duration-300 shadow-2xl z-40">
        <div className="p-6 border-b border-editorial-border flex items-center justify-between bg-editorial-highlight">
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <BrainCircuit className="h-6 w-6 text-editorial-red dark:text-dark-accent" />
              <h1 className="text-xl font-serif italic text-editorial-accent dark:text-dark-text">AI Strategy</h1>
            </div>
          </div>
          <button 
            onClick={startNewChat}
            className="p-2 bg-editorial-accent dark:bg-dark-accent text-white dark:text-dark-bg hover:bg-black dark:hover:bg-white transition-all rounded-none"
            title="Nueva Entrevista"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {/* Main Navigation */}
        <div className="p-4 flex flex-col gap-1 border-b border-editorial-border dark:border-dark-border bg-editorial-bg/30 dark:bg-dark-bg/10">
          <button 
            onClick={() => setCurrentScreen('interviews')}
            className={cn(
              "flex items-center gap-3 px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em] transition-all",
              currentScreen === 'interviews' 
                ? "bg-editorial-accent dark:bg-dark-accent text-white dark:text-dark-bg shadow-lg" 
                : "text-editorial-muted dark:text-dark-muted hover:bg-white dark:hover:bg-dark-bg"
            )}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Entrevistas Activas
          </button>
          <button 
            onClick={() => setCurrentScreen('repository')}
            className={cn(
              "flex items-center gap-3 px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em] transition-all",
              currentScreen === 'repository' 
                ? "bg-editorial-accent dark:bg-dark-accent text-white dark:text-dark-bg shadow-lg" 
                : "text-editorial-muted dark:text-dark-muted hover:bg-white dark:hover:bg-dark-bg"
            )}
          >
            <History className="h-3.5 w-3.5" />
            Repositorio de Casos
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {currentScreen === 'interviews' ? (
            <div className="p-6">
              <h3 className="text-[10px] font-bold text-editorial-muted dark:text-dark-muted uppercase tracking-[0.15em] mb-4 flex items-center gap-2">
                Sesiones Abiertas
              </h3>
              <div className="space-y-2">
                {chats.filter(c => c.status === 'open').length === 0 && (
                  <p className="text-[10px] text-editorial-muted italic opacity-50">No hay entrevistas activas.</p>
                )}
                {chats.filter(c => c.status === 'open').map(chat => (
                  <button
                    key={chat.id}
                    onClick={() => { setActiveChat(chat); setView('chat'); setActiveReport(null); }}
                    className={cn(
                      "w-full text-left p-4 transition-all border-l-2 text-sm",
                      activeChat?.id === chat.id 
                        ? "bg-editorial-highlight border-editorial-red font-semibold text-editorial-accent" 
                        : "border-transparent text-editorial-muted hover:bg-editorial-bg hover:text-editorial-text"
                    )}
                  >
                    <p className="font-black truncate text-[11px] uppercase tracking-tight">
                      {chat.role || "Candidato a IA"}
                    </p>
                    <div className="text-[9px] uppercase tracking-tighter italic opacity-60 flex items-center gap-1.5 mt-1">
                      <div className={cn("w-1 h-1 rounded-full", activeChat?.id === chat.id ? "bg-editorial-red dark:bg-dark-accent" : "bg-editorial-muted dark:bg-dark-muted")} /> 
                      {chat.id.substring(0, 8)} • {chat.model.includes('flash') ? 'FLASH' : 'PRO'}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="p-6">
              <h3 className="text-[10px] font-bold text-editorial-muted dark:text-dark-muted uppercase tracking-[0.15em] mb-4">
                Filtros de Búsqueda
              </h3>
              <div className="space-y-4">
                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-bold uppercase tracking-widest text-editorial-muted">Cargos</label>
                  <select 
                    value={filterRole}
                    onChange={(e) => setFilterRole(e.target.value)}
                    className="w-full bg-editorial-bg dark:bg-dark-bg border border-editorial-border dark:border-dark-border p-2 text-[10px] font-bold uppercase tracking-wider outline-none focus:ring-1 focus:ring-editorial-accent"
                  >
                    <option value="">Todos los cargos</option>
                    {availableRoles.map(role => (
                      <option key={role} value={role}>{role}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-bold uppercase tracking-widest text-editorial-muted">Procesos / Sector</label>
                  <select 
                    value={filterSector}
                    onChange={(e) => setFilterSector(e.target.value)}
                    className="w-full bg-editorial-bg dark:bg-dark-bg border border-editorial-border dark:border-dark-border p-2 text-[10px] font-bold uppercase tracking-wider outline-none focus:ring-1 focus:ring-editorial-accent"
                  >
                    <option value="">Todos los procesos</option>
                    {availableSectors.map(sector => (
                      <option key={sector} value={sector}>{sector}</option>
                    ))}
                  </select>
                </div>
                <div className="pt-4 border-t border-editorial-border dark:border-dark-border">
                  <p className="text-[9px] font-black text-editorial-accent dark:text-dark-accent uppercase tracking-widest mb-2">Resultados: {filteredReports.length}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* User profile */}
        <div className="p-6 border-t border-editorial-border mt-auto bg-editorial-bg/50">
          <div className="flex items-center gap-3 mb-6">
            <img src={user.photoURL || ''} className="w-8 h-8 rounded-none border border-editorial-border dark:border-dark-border" alt={user.displayName || 'User'} />
            <div className="flex-1 truncate">
              <div className="text-[10px] font-bold text-editorial-accent dark:text-dark-text truncate uppercase tracking-widest">{user.displayName}</div>
              <div className="text-[9px] text-editorial-muted dark:text-dark-muted truncate italic">{user.email}</div>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3">
            <button 
              onClick={handleLogout}
              className="flex items-center justify-center gap-2 text-[10px] uppercase tracking-[0.2em] font-black py-2.5 bg-transparent text-editorial-red border-2 border-editorial-red hover:bg-editorial-red hover:text-white transition-all"
            >
              <LogOut className="h-3.5 w-3.5" /> SALIR DEL SISTEMA
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col relative overflow-hidden bg-editorial-bg transition-colors duration-500">
        {/* Header */}
        <header className="h-16 border-b border-editorial-border flex items-center justify-between px-8 bg-editorial-highlight backdrop-blur-sm sticky top-0 z-30 transition-all font-sans">
          <div className="flex items-center gap-4">
          <h2 className="text-[11px] font-black text-editorial-text dark:text-white uppercase tracking-[0.2em] flex items-center gap-3">
              {view === 'chat' ? (
                <>
                  <div className="w-2.5 h-2.5 bg-editorial-red dark:bg-dark-accent rounded-none animate-pulse" />
                  CONSULTORÍA ESTRATÉGICA IA
                </>
              ) : (
                <>
                  <div className="w-2.5 h-2.5 bg-editorial-navy dark:bg-dark-accent rounded-none" />
                  REPOSITORIO DE SOLUCIONES
                </>
              )}
            </h2>
          </div>

          <div className="flex items-center gap-8">
            {view === 'chat' && activeChat && (
              <div className="flex items-center gap-2 px-4 py-1.5 bg-editorial-bg border border-editorial-border">
                <span className="text-[10px] uppercase tracking-[0.15em] text-editorial-muted dark:text-dark-muted font-bold">Motor IA:</span>
                <select 
                  value={activeChat.model} 
                  onChange={(e) => {
                    const newModel = e.target.value;
                    setSelectedModel(newModel);
                    if (activeChat) {
                      updateDoc(doc(db, 'conversations', activeChat.id), { model: newModel });
                    }
                  }}
                  className="text-[10px] font-black bg-transparent border-none focus:ring-0 text-editorial-accent dark:text-dark-accent cursor-pointer uppercase tracking-tighter"
                >
                  <option value={MODELS.FLASH}>Gemini 3 Flash</option>
                  <option value={MODELS.PRO}>Gemini 3.1 Pro</option>
                </select>
              </div>
            )}
            {view === 'report' && activeReport && (
              <button 
                onClick={() => downloadPDF()}
                disabled={isDownloading}
                className={cn(
                  "px-6 py-2 text-[10px] font-bold uppercase tracking-[0.2em] transition-all shadow-lg flex items-center gap-3",
                  isDownloading 
                    ? "bg-[#94A3B8] cursor-not-allowed text-white" 
                    : "bg-editorial-accent dark:bg-dark-accent text-white dark:text-dark-bg hover:bg-editorial-red dark:hover:bg-white shadow-editorial-red/10"
                )}
              >
                {isDownloading ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Procesando...
                  </>
                ) : (
                  <>
                    <Download className="h-3 w-3" />
                    Exportar a PDF
                  </>
                )}
              </button>
            )}
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto bg-editorial-bg relative transition-all duration-300">
          <AnimatePresence mode="wait">
            {view === 'report' && activeReport ? (
              <motion.div 
                key="report-view"
                initial={{ opacity: 0, scale: 0.99 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.99 }}
                className="max-w-4xl mx-auto w-full p-12"
              >
                {/* Navigation Bar */}
                <div className="flex justify-between items-center mb-10 pb-6 border-b border-editorial-border dark:border-dark-border">
                  <button 
                    onClick={() => { setView('chat'); setActiveReport(null); }}
                    className="flex items-center gap-3 text-[11px] font-black uppercase tracking-[0.3em] text-editorial-muted dark:text-dark-muted hover:text-black dark:hover:text-white transition-all group"
                  >
                    <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
                    [ REGRESAR A {currentScreen === 'repository' ? 'REPOSITORIO' : 'ENTREVISTA'} ]
                  </button>

                  <div className="flex items-center gap-6">
                    <div className="flex items-center gap-4 border-r border-editorial-border dark:border-dark-border pr-6">
                      <span className="text-[10px] font-bold text-editorial-muted dark:text-dark-muted uppercase tracking-widest">Estado:</span>
                      <button 
                        onClick={() => toggleReportStatus(activeReport)}
                        style={{ backgroundColor: activeReport.status === 'closed' ? '#2A5A5A' : '#A52A2A' }}
                        className="px-6 py-2 text-[10px] font-black text-white uppercase tracking-[0.2em] shadow-lg hover:brightness-110 active:scale-95 transition-all"
                      >
                        {activeReport.status === 'closed' ? 'Caso Cerrado' : 'Caso Abierto'}
                      </button>
                    </div>

                    <button 
                      onClick={() => downloadPDF()}
                      disabled={isDownloading}
                      className="flex items-center gap-3 text-[11px] font-black uppercase tracking-[0.3em] text-editorial-red dark:text-dark-accent hover:text-black dark:hover:text-white transition-all group disabled:opacity-50"
                    >
                      {isDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4 group-hover:scale-110 transition-transform" />}
                      [ EXPORTAR PDF ]
                    </button>
                  </div>
                </div>

                <div id="report-content" className="bg-white p-16 border border-black/10 shadow-xl rounded-none relative text-black mx-auto max-w-[800px]">
                  {/* Editorial Watermark */}
                  <div className="absolute top-8 right-8 text-[8px] font-bold uppercase tracking-[0.5em] text-[#8C857D] select-none -rotate-90 origin-right">
                    OFFICIAL DOCUMENT // ARCHITECT AI v1.0
                  </div>

                  <div className="flex flex-col mb-16 border-b-4 border-black pb-12">
                    <div className="flex items-center gap-4 mb-10">
                      <div className="w-20 h-2.5 bg-[#A52A2A]"></div>
                      <span className="text-[12px] font-black text-editorial-text uppercase tracking-[0.5em]">AI Transformation Protocol</span>
                    </div>
                    
                    <h1 className="text-7xl font-serif text-editorial-text mb-8 leading-[1.05] tracking-tight">Estrategia de Implementación de Inteligencia Artificial</h1>
                    
                    <div className="grid grid-cols-2 gap-16 mt-6">
                      <div>
                        <div className="text-[10px] font-black text-[#64748B] uppercase tracking-[0.4em] mb-4">PERFIL DE ESTRUCTURA</div>
                        <div className="text-2xl font-serif italic text-editorial-text border-l-8 border-[#A52A2A] pl-8 py-2 bg-[#F8FAFC]">{activeReport.role}</div>
                      </div>
                      <div className="text-right flex flex-col items-end">
                        <div className="text-[10px] font-black text-[#64748B] uppercase tracking-[0.4em] mb-4 flex items-center gap-2">
                           ESTADO DEL CASO
                           <span 
                              style={{ backgroundColor: activeReport.status === 'closed' ? '#2A5A5A' : '#A52A2A' }}
                              className="w-1.5 h-1.5 rounded-full" 
                           />
                        </div>
                        <button 
                          onClick={() => toggleReportStatus(activeReport)}
                          style={{ backgroundColor: activeReport.status === 'closed' ? '#2A5A5A' : '#A52A2A' }}
                          className="text-[10px] font-black text-white uppercase tracking-[0.2em] px-6 py-2 mb-4 transition-all shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1),0_2px_4px_-1px_rgba(0,0,0,0.06)] active:scale-95"
                        >
                          {activeReport.status === 'closed' ? 'CERRADO (IMPLEMENTADO)' : 'ABIERTO (PENDIENTE)'}
                        </button>
                        <div className="text-[10px] font-black text-[#64748B] uppercase tracking-[0.4em] mb-4">FECHA DE PROTOCOLO</div>
                        <div className="text-sm font-black text-white uppercase tracking-[0.2em] bg-black inline-block px-6 py-3">
                           {activeReport.createdAt?.toDate().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-32">
                    <section>
                      <div className="flex items-baseline gap-8 mb-10">
                        <span className="text-5xl font-serif italic text-[rgba(165,42,42,0.1)]">01</span>
                        <h2 className="text-[14px] font-black text-black uppercase tracking-[0.4em] border-b-2 border-black flex-1 pb-3">Resumen Estratégico</h2>
                      </div>
                      <div className="text-2xl font-serif text-black leading-[1.7] italic pl-16 pr-12 text-justify">
                        "{activeReport.content.resumenEjecutivo || 'No disponible'}"
                      </div>
                    </section>

                    <section>
                      <div className="flex items-baseline gap-8 mb-10">
                        <span className="text-5xl font-serif italic text-[rgba(27,38,59,0.1)]">02</span>
                        <h2 className="text-[14px] font-black text-black uppercase tracking-[0.4em] border-b-2 border-black flex-1 pb-3">Procesos Transformables</h2>
                      </div>
                      <div className="pl-16">
                        <table className="w-full border-collapse border-2 border-black">
                           <thead>
                             <tr className="bg-black text-white">
                               <th className="p-4 text-left text-[11px] font-black uppercase tracking-widest border-r border-white">Descripción del Proceso</th>
                               <th className="p-4 text-left text-[11px] font-black uppercase tracking-widest">Impacto Estimado</th>
                             </tr>
                           </thead>
                           <tbody>
                             {(() => {
                               const content = activeReport.content.inventarioTareas;
                               const tasks = Array.isArray(content) ? content : (typeof content === 'string' ? content.split('\n') : []);
                               return tasks.filter(Boolean).map((task, i) => {
                                 const taskStr = String(task);
                                 const [desc, impact] = taskStr.includes(':') ? taskStr.split(':') : [taskStr, 'Alto'];
                                 return (
                                   <tr key={i} className="border-b-2 border-black hover:bg-[#F8FAFC] transition-colors">
                                     <td className="p-5 text-[13px] font-bold text-black border-r-2 border-black">{desc.trim().replace(/^[-*•]\s*/, '')}</td>
                                     <td className="p-5 text-[11px] font-black uppercase tracking-widest text-[#A52A2A]">{impact.trim()}</td>
                                   </tr>
                                 );
                               });
                             })()}
                           </tbody>
                        </table>
                      </div>
                    </section>

                    <section>
                      <div className="flex items-baseline gap-8 mb-10">
                        <span className="text-5xl font-serif italic text-[rgba(14,116,144,0.1)]">03</span>
                        <h2 className="text-[14px] font-black text-black uppercase tracking-[0.4em] border-b-2 border-black flex-1 pb-3">Ecosistema de Datos</h2>
                      </div>
                      <div className="pl-16 flex flex-wrap gap-5">
                        {(() => {
                          const content = activeReport.content.stackTecnologico;
                          const techs = Array.isArray(content) ? content : (typeof content === 'string' ? content.split(',') : []);
                          return techs.filter(Boolean).map((tech, i) => (
                            <div key={i} className="bg-white text-black border-4 border-black px-8 py-6 text-[12px] font-black uppercase tracking-[0.3em] shadow-[8px_8px_0px_0px_rgba(0,0,0,1)]">
                              {String(tech).trim()}
                            </div>
                          ));
                        })()}
                      </div>
                    </section>

                    <section>
                      <div className="flex items-baseline gap-8 mb-10">
                        <span className="text-5xl font-serif italic text-[rgba(42,90,90,0.1)]">04</span>
                        <h2 className="text-[14px] font-black text-black uppercase tracking-[0.4em] border-b-2 border-black flex-1 pb-3">Soluciones de IA</h2>
                      </div>
                      <div className="pl-16">
                        <div className="grid grid-cols-1 gap-6">
                          {(() => {
                            const content = activeReport.content.oportunidadesAutomatizacion;
                            const sols = Array.isArray(content) ? content : (typeof content === 'string' ? content.split('\n') : []);
                            return sols.filter(Boolean).map((sol, i) => (
                              <div key={i} className="bg-[#F8FAFC] p-10 border-l-[12px] border-[#2A5A5A] shadow-[0_20px_25px_-5px_rgba(0,0,0,0.1),0_8px_10px_-6px_rgba(0,0,0,0.1)] relative overflow-hidden">
                                <div className="text-xl text-black font-serif leading-relaxed italic">
                                  {String(sol).trim().replace(/^[-*•]\s*/, '')}
                                </div>
                              </div>
                            ));
                          })()}
                        </div>
                      </div>
                    </section>

                    <section>
                      <div className="flex items-baseline gap-8 mb-10">
                        <span className="text-5xl font-serif italic text-[rgba(107,27,27,0.1)]">05</span>
                        <h2 className="text-[14px] font-black text-black uppercase tracking-[0.4em] border-b-2 border-black flex-1 pb-3">Requerimientos Técnicos</h2>
                      </div>
                      <div className="pl-16">
                         <div className="bg-black text-white p-16 shadow-[20px_20px_0px_0px_rgba(239,68,68,0.2)]">
                           <table className="w-full">
                             <tbody>
                               {(() => {
                                 const content = activeReport.content.requerimientosTecnicos;
                                 const reqs = Array.isArray(content) ? content : (typeof content === 'string' ? content.split('\n') : []);
                                 return reqs.filter(Boolean).map((req, i) => (
                                   <tr key={i} className="border-b border-[#ffffff33] last:border-0">
                                     <td className="py-6 text-[12px] font-black uppercase tracking-[0.2em] leading-relaxed opacity-90">
                                       <div className="flex items-center gap-4">
                                          <div className="w-2 h-2 bg-[#A52A2A]" />
                                          {String(req).trim().replace(/^[-*•]\s*/, '')}
                                       </div>
                                     </td>
                                   </tr>
                                 ));
                               })()}
                             </tbody>
                           </table>
                         </div>
                      </div>
                    </section>
                  </div>

                  <div className="mt-64 pt-12 border-t-4 border-black flex justify-between items-center text-black text-[12px] font-black uppercase tracking-[0.5em]">
                    <div className="flex items-center gap-3">
                      <div className="w-3 h-3 bg-[#A52A2A]"></div>
                      <span>Architect AI // Sector: {activeReport.sector}</span>
                    </div>
                    <span>Hash: {activeReport.id.toUpperCase()}</span>
                  </div>
                </div>
              </motion.div>
            ) : currentScreen === 'repository' ? (
               <motion.div 
                key="repository-screen"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="max-w-6xl mx-auto w-full p-12"
               >
                 <div className="mb-12 flex flex-col gap-4">
                    <h2 className="text-5xl font-serif italic text-editorial-text dark:text-white">Archivo Maestro de Implementación IA</h2>
                    <p className="text-xs font-black uppercase tracking-[0.4em] text-editorial-muted dark:text-dark-muted">Repositorio centralizado de estrategias y requerimientos de automatización</p>
                    
                    <div className="flex gap-8 mt-8 border-b border-editorial-border dark:border-dark-border">
                      <button 
                        onClick={() => { setRepoTab('open'); setSelectedReports([]); }}
                        className={cn(
                          "pb-4 text-[11px] font-black uppercase tracking-[0.3em] transition-all relative",
                          repoTab === 'open' 
                            ? "text-editorial-red dark:text-editorial-red" 
                            : "text-editorial-muted hover:text-black dark:hover:text-white"
                        )}
                      >
                        Casos Abiertos ({reports.filter(r => r.status === 'open' || !r.status).length})
                        {repoTab === 'open' && <motion.div layoutId="repoTab" className="absolute bottom-0 left-0 w-full h-1 bg-editorial-red" />}
                      </button>
                      <button 
                        onClick={() => { setRepoTab('closed'); setSelectedReports([]); }}
                        className={cn(
                          "pb-4 text-[11px] font-black uppercase tracking-[0.3em] transition-all relative",
                          repoTab === 'closed' 
                            ? "text-editorial-teal dark:text-editorial-teal" 
                            : "text-editorial-muted hover:text-black dark:hover:text-white"
                        )}
                      >
                        Casos Cerrados ({reports.filter(r => r.status === 'closed').length})
                        {repoTab === 'closed' && <motion.div layoutId="repoTab" className="absolute bottom-0 left-0 w-full h-1 bg-editorial-teal" />}
                      </button>
                      <button 
                        onClick={() => { setRepoTab('ongoing'); setSelectedChats([]); }}
                        className={cn(
                          "pb-4 text-[11px] font-black uppercase tracking-[0.3em] transition-all relative",
                          repoTab === 'ongoing' 
                            ? "text-editorial-accent dark:text-dark-accent" 
                            : "text-editorial-muted hover:text-black dark:hover:text-white"
                        )}
                      >
                        Entrevistas ({chats.filter(c => c.status === 'open').length})
                        {repoTab === 'ongoing' && <motion.div layoutId="repoTab" className="absolute bottom-0 left-0 w-full h-1 bg-editorial-accent dark:bg-dark-accent" />}
                      </button>
                    </div>

                    <div className="flex items-center justify-between mt-6">
                      <div className="relative flex-1 max-w-lg">
                        <input 
                          type="text"
                          placeholder="BUSCAR POR CARGO, PROCESO O PALABRA CLAVE..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="w-full bg-white dark:bg-dark-surface border border-editorial-border dark:border-dark-border px-10 py-4 text-[10px] font-black uppercase tracking-widest focus:outline-none focus:border-editorial-accent transition-all"
                        />
                        <Layout className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-editorial-muted" />
                      </div>

                      <AnimatePresence>
                        {((repoTab === 'ongoing' && selectedChats.length > 0) || (repoTab !== 'ongoing' && selectedReports.length > 0)) && (
                          <motion.div 
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            className="flex items-center gap-6"
                          >
                            <span className="text-[10px] font-black text-editorial-muted uppercase tracking-widest">
                              {repoTab === 'ongoing' ? selectedChats.length : selectedReports.length} SELECCIONADOS
                            </span>
                            <button 
                              onClick={deleteSelected}
                              className="flex items-center gap-2 px-6 py-3 bg-editorial-red text-white text-[10px] font-black uppercase tracking-[0.2em] hover:bg-black transition-all shadow-lg"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              ELIMINAR SELECCIÓN
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                 </div>

                 {repoTab === 'ongoing' ? (
                   <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
                      {chats.filter(c => c.status === 'open').length === 0 ? (
                        <div className="col-span-full flex flex-col items-center justify-center p-24 border-2 border-dashed border-editorial-border dark:border-dark-border bg-white/50 dark:bg-dark-surface/30">
                           <MessageSquare className="h-16 w-16 mb-4 text-editorial-muted opacity-20" />
                           <p className="text-[10px] font-black uppercase tracking-[0.3em] text-editorial-muted">No hay entrevistas en curso en este momento</p>
                        </div>
                      ) : (
                        chats.filter(c => c.status === 'open').map(chat => (
                          <motion.div 
                            whileHover={{ y: -8, scale: 1.02 }}
                            key={chat.id}
                            className={cn(
                              "bg-white dark:bg-dark-surface p-8 border-t-4 border-t-editorial-red dark:border-t-editorial-red border border-editorial-border dark:border-dark-border shadow-[0_20px_25px_-5px_rgba(0,0,0,0.1),0_8px_10px_-6px_rgba(0,0,0,0.1)] group transition-all cursor-pointer relative flex flex-col h-full",
                              selectedChats.includes(chat.id) && "ring-2 ring-editorial-red border-editorial-red"
                            )}
                            onClick={() => { setActiveChat(chat); setView('chat'); setCurrentScreen('interviews'); }}
                          >
                            <div className="flex justify-between items-start mb-6">
                               <div className="w-10 h-10 bg-editorial-red/10 flex items-center justify-center">
                                 <MessageSquare className="h-5 w-5 text-editorial-red" />
                               </div>
                               <div className="flex items-center gap-3">
                                 <input 
                                   type="checkbox"
                                   checked={selectedChats.includes(chat.id)}
                                   onChange={(e) => toggleChatSelection(e, chat.id)}
                                   className="w-4 h-4 accent-editorial-red cursor-pointer"
                                 />
                                 <span className="text-[9px] font-black text-editorial-red uppercase tracking-widest bg-editorial-red/5 px-2 py-1">EN PROCESO</span>
                               </div>
                            </div>
                            
                            <h4 className="text-2xl font-serif italic text-black dark:text-white mb-4 leading-tight line-clamp-2">{chat.role || "Candidato a Solución IA"}</h4>
                            <p className="text-[11px] text-editorial-muted dark:text-dark-muted uppercase font-bold tracking-widest mb-6">
                              Sesión activa con el modelo {chat.model.includes('flash') ? 'FAST-IA' : 'PRO-IA'}
                            </p>
                            
                            <div className="mt-auto pt-6 border-t border-editorial-border dark:border-dark-border flex items-center justify-between">
                              <p className="text-[9px] text-editorial-muted dark:text-dark-muted uppercase font-black tracking-widest">{chat.createdAt?.toDate().toLocaleDateString()}</p>
                              <div className="flex items-center gap-2 text-[10px] font-black uppercase text-editorial-red animate-pulse">
                                <div className="w-2 h-2 bg-editorial-red rounded-full" />
                                REANUDAR
                              </div>
                            </div>
                          </motion.div>
                        ))
                      )}
                   </div>
                 ) : (
                   filteredReports.length === 0 ? (
                      <div className="flex flex-col items-center justify-center p-24 border-2 border-dashed border-editorial-border dark:border-dark-border bg-white/50 dark:bg-dark-surface/30">
                         <Database className="h-16 w-16 mb-4 text-editorial-muted opacity-20" />
                         <p className="text-[10px] font-black uppercase tracking-[0.3em] text-editorial-muted">
                           {repoTab === 'open' ? 'No hay casos pendientes de implementación' : 'No hay casos cerrados todavía'}
                         </p>
                      </div>
                   ) : (
                     <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
                        {filteredReports.map(report => (
                          <motion.div 
                            whileHover={{ y: -8, scale: 1.02 }}
                            key={report.id}
                            className={cn(
                              "bg-white dark:bg-dark-surface p-8 border-t-4 border border-editorial-border dark:border-dark-border shadow-[0_20px_25px_-5px_rgba(0,0,0,0.1),0_8px_10px_-6px_rgba(0,0,0,0.1)] group transition-all cursor-pointer relative flex flex-col h-full",
                              report.status === 'closed' ? "border-t-editorial-teal" : "border-t-editorial-red",
                              selectedReports.includes(report.id) && (report.status === 'closed' ? "ring-2 ring-editorial-teal border-editorial-teal" : "ring-2 ring-editorial-red border-editorial-red")
                            )}
                            onClick={() => { setActiveReport(report); setView('report'); }}
                          >
                            <div className="flex justify-between items-start mb-6">
                               <FileText className={cn("h-6 w-6 transition-colors", report.status === 'closed' ? "text-editorial-teal" : "text-black dark:text-white group-hover:text-editorial-red")} />
                               <div className="flex items-center gap-3">
                                 <input 
                                   type="checkbox"
                                   checked={selectedReports.includes(report.id)}
                                   onChange={(e) => toggleReportSelection(e, report.id)}
                                   className={cn(
                                     "w-4 h-4 cursor-pointer",
                                     report.status === 'closed' ? "accent-editorial-teal" : "accent-editorial-red"
                                   )}
                                 />
                                 <span className="text-[9px] font-black text-editorial-muted uppercase tracking-widest bg-editorial-bg dark:bg-dark-bg px-2 py-1">#{report.id.substring(0, 8)}</span>
                               </div>
                            </div>
                            
                            <div className="mb-2 flex items-center justify-between">
                              <span className="text-[9px] font-black text-editorial-red dark:text-dark-accent uppercase tracking-widest">{report.sector}</span>
                              <span className={cn(
                                "text-[8px] font-bold uppercase tracking-widest px-2 py-0.5",
                                report.status === 'closed' ? "bg-editorial-teal text-white" : "bg-editorial-red/10 text-editorial-red"
                              )}>
                                {report.status === 'closed' ? 'Implementado' : 'Abierto'}
                              </span>
                            </div>
                            <h4 className="text-2xl font-serif italic text-black dark:text-white mb-4 leading-tight group-hover:text-editorial-red transition-colors line-clamp-2">{report.role}</h4>
                            <p className="text-[11px] text-editorial-muted dark:text-dark-muted uppercase font-bold tracking-widest mb-6 leading-relaxed line-clamp-3">
                              {report.content.resumenEjecutivo}
                            </p>
                            
                            <div className="mt-auto pt-6 border-t border-editorial-border dark:border-dark-border flex items-center justify-between">
                              <p className="text-[9px] text-editorial-muted dark:text-dark-muted uppercase font-black tracking-widest">{report.createdAt?.toDate().toLocaleDateString()}</p>
                               <div className="flex items-center gap-2 text-[10px] font-black uppercase text-editorial-red opacity-0 group-hover:opacity-100 transition-all">
                                 [ VER PROTOCOLO ]
                                 <ChevronRight className="h-3 w-3" />
                               </div>
                            </div>
                          </motion.div>
                        ))}
                     </div>
                   )
                 )}
               </motion.div>
            ) : (
              <>
                {/* Progress Indicator for Chat */}
                {view === 'chat' && activeChat && (
                  <motion.div 
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: showProgress ? 1 : 0, y: showProgress ? 0 : -20 }}
                    transition={{ duration: 0.5 }}
                    className="sticky top-4 left-0 w-full flex justify-center py-2 z-20 pointer-events-none"
                  >
                    <div className="flex space-x-12 bg-white/95 dark:bg-dark-surface/95 backdrop-blur-md px-12 py-4 border-b-4 border-editorial-red dark:border-dark-accent rounded-none shadow-2xl pointer-events-auto">
                      {[
                        { label: 'Rol', color: 'bg-editorial-red dark:bg-dark-accent' },
                        { label: 'Mapeo', color: 'bg-editorial-navy dark:bg-editorial-teal' },
                        { label: 'Dolores', color: 'bg-editorial-burgundy dark:bg-editorial-navy' },
                        { label: 'Entregas', color: 'bg-editorial-teal dark:bg-white' }
                      ].map((fase, i) => {
                         const isActive = activeChat.messages.length > (i * 2 + 1);
                         return (
                          <div key={fase.label} className={cn("flex flex-col items-center gap-1.5", !isActive && "opacity-20")}>
                            <div className={cn("w-1.5 h-1.5 rounded-full mb-1", isActive ? fase.color : "bg-editorial-muted")} />
                            <span className="text-[8px] font-bold uppercase tracking-[0.3em] text-editorial-muted dark:text-dark-muted">Fase {i+1}</span>
                            <span className={cn(
                              "text-[10px] font-black uppercase tracking-widest", 
                              isActive ? "text-editorial-accent dark:text-dark-text border-b border-editorial-accent dark:border-dark-accent pb-0.5" : "text-editorial-muted dark:text-dark-muted"
                            )}>{fase.label}</span>
                          </div>
                         );
                      })}
                    </div>
                  </motion.div>
                )}
                {activeChat ? (
                  <motion.div 
                    key="chat-view"
                    initial={{ opacity: 0 }} 
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="max-w-3xl mx-auto w-full p-12 pt-24"
                  >
                    <div className="space-y-12">
                      {activeChat.messages.map((msg, i) => (
                        <motion.div 
                          key={i}
                          initial={{ opacity: 0, y: 15 }}
                          animate={{ opacity: 1, y: 0 }}
                          className={cn(
                            "flex flex-col gap-2 max-w-[90%]",
                            msg.role === 'user' ? "ml-auto items-end" : "items-start"
                          )}
                        >
                          <p className={cn(
                            "text-[9px] font-bold uppercase tracking-[0.3em] mb-1 px-1",
                            msg.role === 'user' ? "text-right text-editorial-navy dark:text-dark-accent" : "text-left text-editorial-red dark:text-dark-muted"
                          )}>
                            {msg.role === 'user' ? (user?.displayName || 'USUARIO') : 'ARQUITECTO SENIOR'}
                          </p>
                          <div className={cn(
                            "p-8 shadow-sm border text-[13px] leading-[1.8] tracking-wide transition-all",
                            msg.role === 'user' 
                              ? "bg-editorial-navy dark:bg-dark-highlight text-white dark:text-dark-text border-editorial-navy dark:border-dark-border rounded-none shadow-2xl" 
                              : "bg-white dark:bg-dark-surface text-editorial-text dark:text-dark-text border-editorial-border dark:border-dark-border rounded-none font-serif italic shadow-md"
                          )}>
                            {msg.text}
                          </div>
                        </motion.div>
                      ))}
                      {isSending && (
                        <div className="flex flex-col items-start gap-1">
                          <p className="text-[9px] font-bold uppercase tracking-[0.3em] mb-1 text-editorial-muted dark:text-dark-muted">PROCESANDO...</p>
                          <div className="bg-white dark:bg-dark-surface border border-editorial-border dark:border-dark-border p-5 rounded-none shadow-sm flex gap-3">
                            <div className="w-2 h-2 bg-editorial-red dark:bg-dark-accent animate-bounce"></div>
                            <div className="w-2 h-2 bg-editorial-red dark:bg-dark-accent animate-bounce [animation-delay:0.2s]"></div>
                            <div className="w-2 h-2 bg-editorial-red dark:bg-dark-accent animate-bounce [animation-delay:0.4s]"></div>
                          </div>
                        </div>
                      )}
                      <div ref={chatEndRef} />
                    </div>
                  </motion.div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-editorial-muted p-8 text-center bg-white dark:bg-dark-bg transition-colors duration-300">
                    <div className="h-40 w-px bg-editorial-accent dark:bg-dark-accent mb-10 opacity-30"></div>
                    <h3 className="text-3xl font-serif italic text-editorial-accent dark:text-dark-accent mb-4">Mesa de Trabajo Digital</h3>
                    <p className="max-w-sm mb-12 text-[10px] uppercase tracking-[0.4em] leading-loose font-bold opacity-70 dark:text-dark-muted">
                      INICIE UNA SESIÓN DE CONSULTORÍA ESTRATÉGICA PARA EL LEVANTAMIENTO DE ARQUITECTURA DE PROCESOS.
                    </p>
                    <button 
                      onClick={startNewChat}
                      className="bg-editorial-red dark:bg-dark-accent text-white dark:text-dark-bg px-14 py-4 text-[10px] font-bold uppercase tracking-[0.4em] hover:bg-black dark:hover:bg-white transition-all active:scale-[0.98] shadow-[0_20px_50px_rgba(165,42,42,0.2)] dark:shadow-dark-accent/20"
                    >
                      NUEVA SESIÓN
                    </button>
                  </div>
                )}
              </>
            )}
      </AnimatePresence>
        </div>

        {/* Input Area */}
        {view === 'chat' && activeChat && currentScreen === 'interviews' && (
          <div className="p-8 bg-editorial-highlight border-t-2 border-editorial-border sticky bottom-0 z-30 shadow-[0_-10px_60px_rgba(0,0,0,0.1)] transition-colors duration-500">
            <div className="max-w-3xl mx-auto flex flex-col gap-4">
              <div className="relative flex items-end gap-0">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                  rows={2}
                  placeholder="Escriba los detalles de su proceso aquí..."
                  className="flex-1 bg-white dark:bg-editorial-bg border-2 border-editorial-text px-8 py-5 text-[15px] font-medium tracking-normal focus:outline-none focus:ring-2 focus:ring-editorial-accent text-editorial-text dark:text-white transition-all outline-none placeholder:text-editorial-muted/50 resize-none custom-scrollbar min-h-[80px]"
                />
                <button 
                  onClick={sendMessage}
                  disabled={!input.trim() || isSending}
                  className={cn(
                    "px-10 h-full self-stretch flex items-center justify-center transition-all uppercase tracking-[0.4em] text-[12px] font-black",
                    !input.trim() || isSending 
                      ? "bg-editorial-highlight dark:bg-dark-surface text-editorial-muted dark:text-dark-muted cursor-not-allowed border border-editorial-border dark:border-dark-border" 
                      : "bg-editorial-accent dark:bg-dark-accent text-white dark:text-dark-bg hover:bg-black dark:hover:bg-white shadow-[0_20px_25px_-5px_rgba(0,0,0,0.1),0_8px_10px_-6px_rgba(0,0,0,0.1)] shadow-editorial-accent/20"
                  )}
                >
                  {isSending ? <Loader2 className="h-6 w-6 animate-spin" /> : "ENVIAR"}
                </button>
              </div>
              
              <div className="flex justify-between items-center">
                 <button 
                  onClick={() => finalizeReport(activeChat.id, activeChat.messages)}
                  className="text-[10px] font-black text-editorial-red dark:text-dark-accent hover:text-black dark:hover:text-white uppercase tracking-[0.3em] transition-all flex items-center gap-3 group"
                 >
                   <div className="w-6 h-px bg-editorial-red dark:bg-dark-accent group-hover:w-12 transition-all" />
                   [ FINALIZAR Y GENERAR PROTOCOLO IA ]
                 </button>
                 <div className="text-[9px] text-editorial-muted dark:text-dark-muted font-black uppercase tracking-[0.4em] italic opacity-60 flex items-center gap-2">
                    <div className="w-2 h-2 bg-editorial-red rounded-none" />
                    BPA ENGINE // IA ARCHITECT v1.2
                 </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 5px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #e2e8f0;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #cbd5e1;
        }
      `}</style>
    </div>
  );
}
