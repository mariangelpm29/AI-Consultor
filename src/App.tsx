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
  Menu,
  X,
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
import { generateInterviewResponse, generateFinalReport, MODELS, isApiKeySet, getApiKey } from './lib/gemini';
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
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

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

  // Beige mode effect for initialization
  useEffect(() => {
    document.documentElement.classList.remove('dark');
    document.body.classList.remove('dark');
    localStorage.setItem('darkMode', 'false');
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
      // For production/Vercel, ensuring popup is triggered by actual user click
      // which we already do. Adding a timeout check or better error detail.
      const result = await signInWithPopup(auth, googleProvider);
      if (result.user) {
        console.log("Login successful");
      }
    } catch (e: any) {
      console.error("Login failed:", e);
      if (e.code === 'auth/popup-blocked') {
        alert("El navegador bloqueó la ventana emergente de Google. Por favor, permita las ventanas emergentes para este sitio.");
      } else if (e.code === 'auth/unauthorized-domain') {
        alert("Este dominio no está autorizado en la consola de Firebase. Por favor, añada su dominio de Vercel a 'Dominios autorizados' en Authentication -> Settings.");
      } else {
        alert("Error al iniciar sesión: " + (e.message || "Error desconocido"));
      }
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
      if (!isApiKeySet && !getApiKey()) {
        throw new Error('MISSING_API_KEY');
      }
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
      // Show error in chat
      const chatDocRef = doc(db, 'conversations', activeChat.id);
      let errorMessage = 'Error de conexión con el asistente. Por favor, verifica tu clave de API o conexión a internet.';
      
      if (e instanceof Error) {
        if (e.message === 'MISSING_API_KEY') {
          errorMessage = '⚠️ No se ha configurado la clave de IA (VITE_GEMINI_API_KEY). Por favor, agrégala en los Ajustes > Secretos del panel de AI Studio.';
        } else {
          const errMsg = e.toString();
          const msgLower = errMsg.toLowerCase();
          let detail = e.message || errMsg;
          
          if (msgLower.includes('api_key_invalid') || msgLower.includes('not valid') || msgLower.includes('invalid key') || msgLower.includes('api key')) {
            detail = 'La clave API de Gemini no es válida. Por favor verifica que esté copiada perfectamente en Ajustes > Secretos del panel de AI Studio.';
          } else if (msgLower.includes('resource_exhausted') || msgLower.includes('rate limit') || msgLower.includes('quota') || msgLower.includes('exhausted')) {
            detail = 'Has excedido el límite de cuota o de peticiones por minuto permitidas por Google Gemini (Resource Exhausted). Por favor, espera un minuto antes de reintentar.';
          } else if (msgLower.includes('failed to fetch') || msgLower.includes('network error') || msgLower.includes('blocked by') || msgLower.includes('net::err')) {
            detail = 'Bloqueo de red directo desde tu navegador. Esto suele ser causado por extensiones bloqueadoras de anuncios (como AdBlock o uBlock Origin), Brave Shields, firewalls de empresas o VPNs activas que filtran solicitudes a dominios de Google (googleapis.com).';
          } else if (msgLower.includes('safety') || msgLower.includes('blocked')) {
            detail = 'El modelo de IA bloqueó la respuesta debido a sus políticas y filtros de seguridad.';
          }
          
          errorMessage = `Error de conexión con el asistente.\n\n🔍 Detalle técnico:\n${detail}\n\nPor favor, verifica tu configuración de red o clave en tus Ajustes > Secretos e inténtalo de nuevo.`;
        }
      }

      await updateDoc(chatDocRef, {
        messages: [...updatedMessages, { 
          role: 'model', 
          text: errorMessage 
        }],
        updatedAt: serverTimestamp()
      });
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
      setTimeout(() => downloadPDF(), 500);
      return;
    }

    const element = document.getElementById('report-content');
    if (!element) {
      alert("Cargando reporte... Intente de nuevo.");
      return;
    }

    const toSafeColor = (color: string) => {
      if (!color || typeof color !== 'string' || color === 'transparent' || color === 'initial' || color === 'inherit') return color;
      // If it's already a safe format, return it
      if (!color.includes('oklch') && !color.includes('oklab') && !color.includes('lch') && !color.includes('color(')) return color;
      
      try {
        const c = document.createElement('canvas');
        c.width = c.height = 1;
        const ctx = c.getContext('2d');
        if (!ctx) return '#111111';
        ctx.fillStyle = color;
        ctx.fillRect(0,0,1,1);
        const [r,g,b,a] = ctx.getImageData(0,0,1,1).data;
        if (a === 0) return 'transparent';
        return a === 255 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a/255})`;
      } catch(e) { 
        return color.toLowerCase().includes('white') ? '#ffffff' : '#111111'; 
      }
    };

    try {
      setIsDownloading(true);
      await new Promise(resolve => setTimeout(resolve, 800));

      const canvas = await html2canvas(element, {
        scale: 1.5,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        onclone: (clonedDoc) => {
          // 1. COMPLETELY REMOVE all existing styles to prevent html2canvas from parsing them
          const problematicStyles = clonedDoc.querySelectorAll('style, link[rel="stylesheet"]');
          problematicStyles.forEach(s => s.remove());

          const container = clonedDoc.getElementById('report-content');
          if (container) {
            // 2. Clear out any global document backgrounds
            clonedDoc.body.style.backgroundColor = '#ffffff';

            // Recursive function to copy computed styles from original element to cloned element
            const copyStyles = (originalNode: HTMLElement, clonedNode: HTMLElement) => {
              if (!originalNode || !clonedNode) return;
              const style = window.getComputedStyle(originalNode);
              
              clonedNode.style.color = toSafeColor(style.color) || '#111111';
              clonedNode.style.backgroundColor = toSafeColor(style.backgroundColor) || 'transparent';
              clonedNode.style.borderColor = toSafeColor(style.borderColor) || 'transparent';
              
              // Copy borders
              clonedNode.style.borderWidth = style.borderWidth;
              clonedNode.style.borderStyle = style.borderStyle;
              clonedNode.style.borderTopWidth = style.borderTopWidth;
              clonedNode.style.borderTopStyle = style.borderTopStyle;
              clonedNode.style.borderTopColor = toSafeColor(style.borderTopColor) || 'transparent';
              clonedNode.style.borderBottomWidth = style.borderBottomWidth;
              clonedNode.style.borderBottomStyle = style.borderBottomStyle;
              clonedNode.style.borderBottomColor = toSafeColor(style.borderBottomColor) || 'transparent';
              clonedNode.style.borderLeftWidth = style.borderLeftWidth;
              clonedNode.style.borderLeftStyle = style.borderLeftStyle;
              clonedNode.style.borderLeftColor = toSafeColor(style.borderLeftColor) || 'transparent';
              clonedNode.style.borderRightWidth = style.borderRightWidth;
              clonedNode.style.borderRightStyle = style.borderRightStyle;
              clonedNode.style.borderRightColor = toSafeColor(style.borderRightColor) || 'transparent';

              clonedNode.style.padding = style.padding;
              clonedNode.style.margin = style.margin;
              clonedNode.style.display = style.display;
              clonedNode.style.flexDirection = style.flexDirection;
              clonedNode.style.alignItems = style.alignItems;
              clonedNode.style.justifyContent = style.justifyContent;
              clonedNode.style.gap = style.gap;
              clonedNode.style.fontSize = style.fontSize;
              clonedNode.style.fontWeight = style.fontWeight;
              clonedNode.style.fontFamily = 'Montserrat, Inter, system-ui, sans-serif';
              clonedNode.style.lineHeight = style.lineHeight;
              clonedNode.style.borderRadius = style.borderRadius;
              
              // Copy size constraints to preserve formatting
              clonedNode.style.width = style.width;
              clonedNode.style.height = style.height;
              clonedNode.style.maxWidth = style.maxWidth;
              clonedNode.style.minWidth = style.minWidth;
              clonedNode.style.position = style.position;
              clonedNode.style.top = style.top;
              clonedNode.style.right = style.right;
              clonedNode.style.bottom = style.bottom;
              clonedNode.style.left = style.left;
              
              // Copy grid properties
              clonedNode.style.gridTemplateColumns = style.gridTemplateColumns;
              clonedNode.style.gridGap = style.gridGap;
              if (style.columnGap) clonedNode.style.columnGap = style.columnGap;
              if (style.rowGap) clonedNode.style.rowGap = style.rowGap;

              // Clear complex filters to avoid rendering blank frames
              clonedNode.style.filter = 'none';
              clonedNode.style.backdropFilter = 'none';
              clonedNode.style.boxShadow = 'none';

              if (['H1', 'H2', 'H3', 'H4'].includes(clonedNode.tagName)) {
                clonedNode.style.color = '#000000';
              }

              const origChildren = originalNode.children;
              const clonedChildren = clonedNode.children;
              for (let i = 0; i < origChildren.length; i++) {
                if (origChildren[i] && clonedChildren[i]) {
                  copyStyles(origChildren[i] as HTMLElement, clonedChildren[i] as HTMLElement);
                }
              }
            };

            // Run copy from the original visible element to the cloned layout element
            copyStyles(element, container);

            // Re-apply special responsive dimensions for print
            container.style.backgroundColor = '#ffffff';
            container.style.color = '#111111';
            container.style.margin = '0';
            container.style.padding = '40px';
            container.style.width = '800px';

            container.querySelectorAll('button').forEach(btn => btn.remove());
          }
        }
      });
      
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      let heightLeft = pdfHeight;
      let position = 0;
      const pageHeight = pdf.internal.pageSize.getHeight();

      pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, pdfHeight, undefined, 'FAST');
      heightLeft -= pageHeight;

      while (heightLeft > 0) {
        position = heightLeft - pdfHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'JPEG', 0, position, pdfWidth, pdfHeight, undefined, 'FAST');
        heightLeft -= pageHeight;
      }

      pdf.save(`Reporte_Protocolo_IA_${Date.now()}.pdf`);
    } catch (error) {
      console.error("PDF generation error:", error);
      alert("Error al generar el PDF. El navegador tiene problemas para procesar los colores.");
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
        "flex h-screen flex-col items-center justify-center p-6 text-center transition-colors duration-500 bg-editorial-bg"
      )}>
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-[90%] sm:w-full bg-editorial-highlight p-6 sm:p-10 rounded-none shadow-[0_35px_60px_-15px_rgba(0,0,0,0.3)] border border-editorial-border"
        >
          <div className="mb-8 flex justify-center">
            <div className="p-4 sm:p-5 bg-editorial-accent rounded-none shadow-lg shadow-editorial-accent/20">
              <BrainCircuit className="h-8 w-8 sm:h-12 sm:w-12 text-white" />
            </div>
          </div>
          <h1 className="text-2xl sm:text-4xl font-serif italic text-editorial-accent mb-3 tracking-tight">AI Strategy Analyst</h1>
          <p className="text-editorial-muted mb-8 sm:mb-10 leading-relaxed uppercase text-[8px] sm:text-[10px] tracking-[0.2em] font-bold">
            Business Process Architecture & Automation
          </p>
          <button 
            onClick={handleLogin}
            className="w-full flex items-center justify-center gap-4 bg-editorial-accent text-white px-6 py-5 font-montserrat font-bold uppercase tracking-[0.3em] text-[10px] hover:bg-black transition-all shadow-xl active:scale-[0.98]"
          >
            <img src="https://www.google.com/favicon.ico" className="w-5 h-5 grayscale invert" alt="Google" />
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
    <div className="flex h-screen bg-editorial-bg overflow-hidden font-sans text-editorial-text transition-colors duration-500 relative">
      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-editorial-highlight border-b border-editorial-border flex items-center justify-between px-4 z-50 shadow-md">
        <button onClick={() => setIsSidebarOpen(true)} className="p-2">
          <Menu className="h-6 w-6 text-editorial-accent" />
        </button>
        <h1 className="text-sm font-serif italic text-editorial-accent">AI Strategy Analyst</h1>
        <button onClick={startNewChat} className="p-2 bg-editorial-accent text-white">
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {/* Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="md:hidden fixed inset-0 bg-black/50 z-[55]" 
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed md:relative w-80 h-full flex-shrink-0 bg-editorial-highlight border-r border-editorial-border flex flex-col transition-all duration-300 shadow-2xl z-[60] md:z-40",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      )}>
        <div className="p-6 border-b border-editorial-border flex items-center justify-between bg-editorial-highlight">
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <BrainCircuit className="h-6 w-6 text-editorial-red" />
              <h1 className="text-xl font-serif italic text-editorial-accent">AI Strategy Analyst</h1>
            </div>
          </div>
          <button 
            onClick={() => { startNewChat(); setIsSidebarOpen(false); }}
            className="p-2 bg-editorial-accent text-white hover:bg-black transition-all rounded-none"
            title="Nueva Entrevista"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button className="md:hidden p-2" onClick={() => setIsSidebarOpen(false)}>
            <X className="h-5 w-5 text-editorial-muted" />
          </button>
        </div>

        {/* Main Navigation */}
        <div className="p-4 flex flex-col gap-1 border-b border-editorial-border bg-editorial-bg/30">
          <button 
            onClick={() => { setCurrentScreen('interviews'); setIsSidebarOpen(false); }}
            className={cn(
              "flex items-center gap-3 px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em] transition-all",
              currentScreen === 'interviews' 
                ? "bg-editorial-accent text-white shadow-lg" 
                : "text-editorial-muted hover:bg-white"
            )}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Entrevistas Activas
          </button>
          <button 
            onClick={() => { setCurrentScreen('repository'); setIsSidebarOpen(false); }}
            className={cn(
              "flex items-center gap-3 px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em] transition-all",
              currentScreen === 'repository' 
                ? "bg-editorial-accent text-white shadow-lg" 
                : "text-editorial-muted hover:bg-white"
            )}
          >
            <History className="h-3.5 w-3.5" />
            Repositorio de Casos
          </button>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {currentScreen === 'interviews' ? (
            <div className="p-6">
              <div className="flex items-center justify-between mb-4 border-b border-black/10 pb-2">
                <h3 className="text-[10px] font-bold text-editorial-muted dark:text-dark-muted uppercase tracking-[0.15em] flex items-center gap-2">
                  Sesiones Abiertas
                </h3>
                {selectedChats.length > 0 && (
                  <button 
                    onClick={deleteSelected}
                    className="text-[9px] font-black text-editorial-red flex items-center gap-1 hover:underline"
                  >
                    <Trash2 className="h-2.5 w-2.5" /> Borrar ({selectedChats.length})
                  </button>
                )}
              </div>
              <div className="space-y-2">
                {chats.filter(c => c.status === 'open').length === 0 ? (
                  <p className="text-[10px] text-editorial-muted italic opacity-50">No hay entrevistas activas.</p>
                ) : (
                  chats.filter(c => c.status === 'open').map(chat => (
                    <div
                      key={chat.id}
                      onClick={(e) => { 
                        const target = e.target as HTMLElement;
                        if (!target.closest('input[type="checkbox"]') && !target.closest('.delete-btn')) {
                          setActiveChat(chat); setView('chat'); setActiveReport(null); 
                        }
                      }}
                      className={cn(
                        "w-full text-left p-4 transition-all border-l-2 text-sm cursor-pointer group flex justify-between items-start",
                        activeChat?.id === chat.id 
                          ? "bg-editorial-highlight border-editorial-red font-semibold text-editorial-accent" 
                          : "border-transparent text-editorial-muted hover:bg-editorial-bg hover:text-editorial-text"
                      )}
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <input 
                          type="checkbox"
                          checked={selectedChats.includes(chat.id)}
                          onChange={(e) => toggleChatSelection(e, chat.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="w-3.5 h-3.5 accent-editorial-red cursor-pointer"
                        />
                        <div className="flex-1 min-w-0 pr-2">
                          <p className="font-black truncate text-[11px] uppercase tracking-tight text-editorial-accent">
                            {chat.role || "Candidato a IA"}
                          </p>
                          <div className="text-[9px] uppercase tracking-tighter italic opacity-60 flex items-center gap-1.5 mt-1 text-editorial-muted">
                            <div className={cn("w-1 h-1 rounded-full", activeChat?.id === chat.id ? "bg-editorial-red" : "bg-editorial-muted")} /> 
                            {chat.id.substring(0, 8)} • {chat.model.includes('flash') ? 'FLASH' : 'PRO'}
                          </div>
                        </div>
                      </div>
                      <button 
                        onClick={(e) => deleteChat(e, chat.id)}
                        className="p-1 text-editorial-muted hover:text-editorial-red opacity-0 group-hover:opacity-100 transition-all delete-btn"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))
                )}
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
      <main className="flex-1 flex flex-col relative overflow-hidden bg-editorial-bg transition-colors duration-500 pt-16 md:pt-0">
        {/* Header */}
        <header className="h-16 border-b border-editorial-border flex items-center justify-between px-4 md:px-8 bg-editorial-highlight backdrop-blur-sm sticky top-0 z-30 transition-all font-sans shadow-md">
          <div className="flex items-center gap-4">
          <h2 className="text-[9px] md:text-[11px] font-black text-black uppercase tracking-[0.2em] flex items-center gap-2 md:gap-3">
              {view === 'chat' ? (
                <>
                  <div className="w-2.5 h-2.5 bg-editorial-red rounded-none animate-pulse" />
                  CONSULTORÍA ESTRATÉGICA IA
                </>
              ) : (
                <>
                  <div className="w-2.5 h-2.5 bg-editorial-navy rounded-none" />
                  REPOSITORIO DE SOLUCIONES
                </>
              )}
            </h2>
          </div>

          <div className="flex items-center gap-2 md:gap-8">
            {view === 'chat' && activeChat && (
              <div className="hidden sm:flex items-center gap-2 px-2 md:px-4 py-1.5 bg-editorial-bg border border-editorial-border">
                <span className="text-[8px] md:text-[10px] uppercase tracking-[0.15em] text-editorial-muted font-bold">Motor IA:</span>
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
                    OFFICIAL DOCUMENT // AI STRATEGY ANALYST v1.0
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
                      <span>AI Strategy Analyst // Sector: {activeReport.sector}</span>
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
                    <h2 className="text-5xl font-serif italic text-black">Archivo Maestro de Implementación IA</h2>
                    <p className="text-xs font-black uppercase tracking-[0.4em] text-editorial-muted">Repositorio centralizado de estrategias y requerimientos de automatización</p>
                    
                    <div className="flex gap-8 mt-8 border-b border-editorial-border">
                      <button 
                        onClick={() => { setRepoTab('open'); setSelectedReports([]); }}
                        className={cn(
                          "pb-4 text-[11px] font-black uppercase tracking-[0.3em] transition-all relative",
                          repoTab === 'open' 
                            ? "text-editorial-red" 
                            : "text-editorial-muted hover:text-black"
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
                            ? "text-editorial-teal" 
                            : "text-editorial-muted hover:text-black"
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
                            ? "text-editorial-accent" 
                            : "text-editorial-muted hover:text-black"
                        )}
                      >
                        Entrevistas ({chats.filter(c => c.status === 'open').length})
                        {repoTab === 'ongoing' && <motion.div layoutId="repoTab" className="absolute bottom-0 left-0 w-full h-1 bg-editorial-accent" />}
                      </button>
                    </div>

                    <div className="flex items-center justify-between mt-6">
                      <div className="relative flex-1 max-w-lg">
                        <input 
                          type="text"
                          placeholder="BUSCAR POR CARGO, PROCESO O PALABRA CLAVE..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="w-full bg-editorial-bg border border-editorial-border px-10 py-4 text-[10px] font-black uppercase tracking-widest focus:outline-none focus:border-editorial-accent transition-all text-black"
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
                              className="flex items-center gap-2 px-6 py-3 bg-editorial-red text-black text-[10px] font-black uppercase tracking-[0.2em] hover:bg-black hover:text-white transition-all shadow-lg"
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
                        <div className="col-span-full flex flex-col items-center justify-center p-24 border-2 border-dashed border-editorial-border bg-white/50">
                           <MessageSquare className="h-16 w-16 mb-4 text-editorial-muted opacity-20" />
                           <p className="text-[10px] font-black uppercase tracking-[0.3em] text-editorial-muted">No hay entrevistas en curso en este momento</p>
                        </div>
                      ) : (
                        chats.filter(c => c.status === 'open').map(chat => (
                          <motion.div 
                            whileHover={{ y: -8, scale: 1.02 }}
                            key={chat.id}
                            className={cn(
                              "bg-editorial-highlight p-8 border-t-4 border-t-editorial-red border border-editorial-border shadow-[0_20px_25px_-5px_rgba(0,0,0,0.1),0_8px_10px_-6px_rgba(0,0,0,0.1)] group transition-all cursor-pointer relative flex flex-col h-full",
                              selectedChats.includes(chat.id) && "ring-2 ring-editorial-red border-editorial-red"
                            )}
                            onClick={(e) => {
                              if (!(e.target as HTMLElement).closest('input[type="checkbox"]') && !(e.target as HTMLElement).closest('button')) {
                                setActiveChat(chat); setView('chat'); setCurrentScreen('interviews'); 
                              }
                            }}
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
                                   onClick={(e) => e.stopPropagation()}
                                   className="w-4 h-4 accent-editorial-red cursor-pointer"
                                 />
                                 <button 
                                   onClick={(e) => deleteChat(e, chat.id)}
                                   className="p-1 px-1.5 text-editorial-muted hover:text-editorial-red transition-colors"
                                 >
                                   <Trash2 className="h-3.5 w-3.5" />
                                 </button>
                                 <span className="text-[9px] font-black text-editorial-red uppercase tracking-widest bg-editorial-red/5 px-2 py-1">EN PROCESO</span>
                               </div>
                            </div>
                            
                            <h4 className="text-2xl font-serif italic text-black mb-4 leading-tight line-clamp-2">{chat.role || "Candidato a Solución IA"}</h4>
                            <p className="text-[11px] text-editorial-muted uppercase font-bold tracking-widest mb-6">
                              Sesión activa con el modelo {chat.model.includes('flash') ? 'FAST-IA' : 'PRO-IA'}
                            </p>
                            
                            <div className="mt-auto pt-6 border-t border-editorial-border flex items-center justify-between">
                              <p className="text-[9px] text-editorial-muted uppercase font-black tracking-widest">{chat.createdAt?.toDate().toLocaleDateString()}</p>
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
                      <div className="flex flex-col items-center justify-center p-24 border-2 border-dashed border-editorial-border bg-white/50">
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
                              "bg-editorial-highlight p-8 border-t-4 border border-editorial-border shadow-[0_20px_25px_-5px_rgba(0,0,0,0.1),0_8px_10px_-6px_rgba(0,0,0,0.1)] group transition-all cursor-pointer relative flex flex-col h-full",
                              report.status === 'closed' ? "border-t-editorial-teal" : "border-t-editorial-red",
                              selectedReports.includes(report.id) && (report.status === 'closed' ? "ring-2 ring-editorial-teal border-editorial-teal" : "ring-2 ring-editorial-red border-editorial-red")
                            )}
                            onClick={(e) => { 
                              if (!(e.target as HTMLElement).closest('input[type="checkbox"]') && !(e.target as HTMLElement).closest('button')) {
                                setActiveReport(report); setView('report'); 
                              }
                            }}
                          >
                            <div className="flex justify-between items-start mb-6">
                               <FileText className={cn("h-6 w-6 transition-colors", report.status === 'closed' ? "text-editorial-teal" : "text-black group-hover:text-editorial-red")} />
                               <div className="flex items-center gap-3">
                                 <input 
                                   type="checkbox"
                                   checked={selectedReports.includes(report.id)}
                                   onChange={(e) => toggleReportSelection(e, report.id)}
                                   onClick={(e) => e.stopPropagation()}
                                   className={cn(
                                     "w-4 h-4 cursor-pointer",
                                     report.status === 'closed' ? "accent-editorial-teal" : "accent-editorial-red"
                                   )}
                                 />
                                 <button 
                                   onClick={(e) => deleteReport(e, report.id)}
                                   className="p-1 px-1.5 text-editorial-muted hover:text-editorial-red transition-colors"
                                 >
                                   <Trash2 className="h-3.5 w-3.5" />
                                 </button>
                                 <span className="text-[9px] font-black text-editorial-muted uppercase tracking-widest bg-editorial-bg px-2 py-1">#{report.id.substring(0, 8)}</span>
                               </div>
                            </div>
                            
                            <div className="mb-2 flex items-center justify-between">
                              <span className="text-[9px] font-black text-editorial-red uppercase tracking-widest">{report.sector}</span>
                              <span className={cn(
                                "text-[8px] font-bold uppercase tracking-widest px-2 py-0.5",
                                report.status === 'closed' ? "bg-editorial-teal text-black" : "bg-editorial-red/10 text-editorial-red"
                              )}>
                                {report.status === 'closed' ? 'Implementado' : 'Abierto'}
                              </span>
                            </div>
                            <h4 className="text-2xl font-serif italic text-black mb-4 leading-tight group-hover:text-editorial-red transition-colors line-clamp-2">{report.role}</h4>
                            <p className="text-[11px] text-editorial-muted uppercase font-bold tracking-widest mb-6 leading-relaxed line-clamp-3">
                              {report.content.resumenEjecutivo}
                            </p>
                            
                            <div className="mt-auto pt-6 border-t border-editorial-border flex items-center justify-between">
                              <p className="text-[9px] text-editorial-muted uppercase font-black tracking-widest">{report.createdAt?.toDate().toLocaleDateString()}</p>
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
                    <div className="flex space-x-12 bg-[#FEF9E7] backdrop-blur-md px-12 py-4 border-b-4 border-editorial-red rounded-none shadow-xl pointer-events-auto">
                      {[
                        { label: 'Rol', color: 'bg-editorial-red' },
                        { label: 'Mapeo', color: 'bg-editorial-navy' },
                        { label: 'Dolores', color: 'bg-editorial-accent' },
                        { label: 'Entregas', color: 'bg-teal-700' }
                      ].map((fase, i) => {
                         const isActive = activeChat.messages.length > (i * 2 + 1);
                         return (
                          <div key={fase.label} className={cn("flex flex-col items-center gap-1.5", !isActive && "opacity-50")}>
                            <div className={cn("w-1.5 h-1.5 rounded-full mb-1", isActive ? fase.color : "bg-gray-400")} />
                            <span className={cn("text-[8px] font-bold uppercase tracking-[0.3em]", isActive ? "text-black" : "text-gray-600")}>Fase {i+1}</span>
                            <span className={cn(
                              "text-[10px] font-black uppercase tracking-widest", 
                              isActive ? "text-black border-b-2 border-editorial-accent pb-0.5" : "text-gray-900"
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
                            msg.role === 'user' ? "text-right text-editorial-navy font-black" : "text-left text-editorial-red font-black"
                          )}>
                            {msg.role === 'user' ? (user?.displayName || 'USUARIO') : 'ARQUITECTO SENIOR'}
                          </p>
                          <div className={cn(
                            "p-4 md:p-8 shadow-xl border text-[12px] md:text-[13px] leading-[1.6] md:leading-[1.8] tracking-wide transition-all font-montserrat whitespace-pre-wrap",
                            msg.role === 'user' 
                              ? "bg-[#FEF9E7] text-black border-editorial-border/30 rounded-none shadow-[0_10px_15px_-3px_rgba(0,0,0,0.1),0_4px_6px_-2px_rgba(0,0,0,0.05)]" 
                              : "bg-[#E5D3B3] text-black border-editorial-border/30 rounded-none shadow-[0_10px_15px_-3px_rgba(0,0,0,0.1),0_4px_6px_-2px_rgba(0,0,0,0.05)]"
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
                  <div className="h-full flex flex-col items-center justify-center text-editorial-muted p-8 text-center bg-editorial-bg transition-colors duration-300">
                    <div className="h-40 w-px bg-editorial-accent mb-10 opacity-30"></div>
                    <h3 className="text-3xl font-serif italic text-editorial-accent mb-4">Mesa de Trabajo Digital</h3>
                    <p className="max-w-sm mb-12 text-[10px] uppercase tracking-[0.4em] leading-loose font-bold opacity-70">
                      INICIE UNA SESIÓN DE CONSULTORÍA ESTRATÉGICA PARA EL LEVANTAMIENTO DE ARQUITECTURA DE PROCESOS.
                    </p>
                    <button 
                      onClick={startNewChat}
                      className="bg-editorial-red text-white px-8 md:px-14 py-4 text-[10px] font-bold uppercase tracking-[0.4em] hover:bg-editorial-highlight hover:text-editorial-red border-editorial-red transition-all active:scale-[0.98] shadow-2xl"
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
          <div className="p-4 md:p-8 bg-editorial-highlight border-t-2 border-editorial-border sticky bottom-0 z-30 shadow-[0_-10px_60px_rgba(0,0,0,0.1)] transition-colors duration-500">
            <div className="max-w-3xl mx-auto flex flex-col gap-4">
              <div className="relative flex items-end gap-4">
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
                  className="flex-1 bg-editorial-bg border-2 border-editorial-text/20 px-4 md:px-8 py-3 md:py-5 text-[14px] md:text-[15px] font-montserrat tracking-normal focus:outline-none focus:ring-2 focus:ring-editorial-accent text-black transition-all outline-none placeholder:text-gray-600 shadow-[0_4px_10px_-2px_rgba(0,0,0,0.1)] resize-none custom-scrollbar min-h-[60px] md:min-h-[80px]"
                />
                <button 
                  onClick={sendMessage}
                  disabled={!input.trim() || isSending}
                  className={cn(
                    "px-6 md:px-10 h-full self-stretch flex items-center justify-center transition-all active:scale-[0.98] uppercase tracking-[0.4em] text-[12px] font-black font-montserrat shadow-[0_4px_15px_-3px_rgba(220,38,38,0.2)]",
                    !input.trim() || isSending 
                      ? "bg-editorial-highlight text-editorial-muted cursor-not-allowed border-2 border-editorial-border" 
                      : "bg-red-50 text-editorial-red border-2 border-editorial-red hover:bg-editorial-red hover:text-white"
                  )}
                >
                  {isSending ? <Loader2 className="h-6 w-6 animate-spin" /> : "ENVIAR"}
                </button>
              </div>
              
              <div className="flex flex-col sm:flex-row justify-between items-center gap-6 pt-5 border-t border-black/5 mt-2">
                 <button 
                  onClick={() => finalizeReport(activeChat.id, activeChat.messages)}
                  className="px-4 py-1.5 bg-[#A52A2A] text-white hover:bg-red-600 hover:border-red-600 transition-all text-[10px] font-black uppercase tracking-[0.25em] shadow-md hover:shadow-[0_4px_15px_-4px_rgba(220,38,38,0.5)] active:scale-95 border-2 border-[#A52A2A] rounded-none"
                 >
                   FINALIZAR Y GENERAR INFORME
                 </button>
                 <div className="text-[9px] text-editorial-muted font-black uppercase tracking-[0.4em] italic opacity-60 flex items-center gap-2">
                    <div className="w-2 h-2 bg-editorial-red rounded-none" />
                    BPA ENGINE // AI STRATEGY ANALYST v1.2
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
