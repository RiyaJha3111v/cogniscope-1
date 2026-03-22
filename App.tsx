import React, { useState, useRef, useEffect, Component, ErrorInfo, ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Brain, 
  Send, 
  AlertTriangle, 
  CheckCircle2, 
  Info, 
  TrendingUp, 
  Zap,
  ArrowRight,
  RefreshCcw,
  ShieldAlert,
  MessageSquare,
  Activity,
  History,
  User,
  LogOut,
  LogIn,
  Eye,
  EyeOff,
  Clock,
  Layers,
  LayoutGrid,
  ChevronRight,
  ChevronLeft,
  X,
  Target,
  Sparkles,
  Scale,
  Mic,
  MicOff,
  Wind,
  LayoutDashboard,
  Bookmark,
  ListTodo,
  Trash2,
  Save,
  CheckCircle
} from 'lucide-react';
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer, 
  Tooltip as RechartsTooltip,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  LineChart,
  Line,
  XAxis,
  YAxis
} from 'recharts';
import { cn } from './lib/utils';
import { AnalysisResponse, Thought, UserProfile } from './types';
import { analyzeDecision } from './services/geminiService';
import { auth, db } from './firebase';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  onAuthStateChanged,
  User as FirebaseUser
} from 'firebase/auth';
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  Timestamp,
  serverTimestamp,
  updateDoc,
  setDoc,
  getDoc,
  doc,
  deleteDoc,
  getDocFromServer
} from 'firebase/firestore';

// --- Types & Error Handling ---

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div id="error-boundary-fallback" className="min-h-screen bg-black flex items-center justify-center p-6 text-center">
          <div className="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-3xl p-8 shadow-2xl">
            <ShieldAlert className="w-16 h-16 text-red-500 mx-auto mb-6" />
            <h1 className="text-2xl font-bold mb-4">Something went wrong</h1>
            <p className="text-zinc-400 mb-8">
              {this.state.error?.message.startsWith('{') 
                ? "A database error occurred. Please check your permissions." 
                : "An unexpected error occurred. Please try refreshing the page."}
            </p>
            <button 
              id="refresh-page-button"
              onClick={() => window.location.reload()}
              className="w-full py-3 bg-emerald-500 text-black font-bold rounded-xl hover:bg-emerald-400 transition-all"
            >
              Refresh Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const COLORS = {
  logical: '#10b981', // emerald-500
  emotional: '#3b82f6', // blue-500
  irrational: '#f59e0b', // amber-500
  catastrophic: '#ef4444', // red-500
};

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResponse | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [history, setHistory] = useState<(AnalysisResponse & { id: string, createdAt: any })[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [realityCheckMode, setRealityCheckMode] = useState(true);
  const [showHistory, setShowHistory] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [activeTab, setActiveTab] = useState<'thoughts' | 'comparison' | 'timeline' | 'solutions' | 'tasks'>('thoughts');
  const [activeView, setActiveView] = useState<'analyzer' | 'dashboard'>('analyzer');
  const [showBreathing, setShowBreathing] = useState(false);
  const [breathingTimer, setBreathingTimer] = useState(60);
  const [isRecording, setIsRecording] = useState(false);
  const [evidenceLocker, setEvidenceLocker] = useState<{ id: string, text: string, bias: string }[]>([]);
  const [actionSteps, setActionSteps] = useState<{ id: string, text: string, status: 'pending' | 'completed' | 'resolved', reminderAt?: any }[]>([]);
  const [whatIf, setWhatIf] = useState('');
  const [isSimulatingWhatIf, setIsSimulatingWhatIf] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration. ");
        }
      }
    }
    testConnection();
  }, []);

  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if(error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration. ");
        }
      }
    }
    testConnection();
  }, []);

  useEffect(() => {
    const hasSeenOnboarding = localStorage.getItem('cogniscope_onboarding');
    if (!hasSeenOnboarding) {
      setShowOnboarding(true);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setHistory([]);
      return;
    }

    const q = query(
      collection(db, 'analyses'),
      where('uid', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as any;
      setHistory(docs);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'analyses');
    });

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!user) {
      setUserProfile(null);
      return;
    }

    const profileRef = doc(db, 'userProfiles', user.uid);
    const unsub = onSnapshot(profileRef, (snapshot) => {
      if (snapshot.exists()) {
        setUserProfile(snapshot.data() as UserProfile);
      } else {
        const initialProfile: UserProfile = {
          uid: user.uid,
          commonBiases: [],
          averageOverthinkingScore: 0,
          clarityWins: 0,
          totalAnalyses: 0,
          biasCorrectionStrategies: []
        };
        setDoc(profileRef, initialProfile).catch(err => handleFirestoreError(err, OperationType.WRITE, 'userProfiles'));
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'userProfiles');
    });

    return () => unsub();
  }, [user]);

  useEffect(() => {
    if (!user) {
      setEvidenceLocker([]);
      setActionSteps([]);
      return;
    }

    const evidenceQ = query(collection(db, 'evidenceLocker'), where('uid', '==', user.uid), orderBy('createdAt', 'desc'));
    const stepsQ = query(collection(db, 'actionSteps'), where('uid', '==', user.uid), orderBy('createdAt', 'desc'));

    const unsubEvidence = onSnapshot(evidenceQ, (snapshot) => {
      setEvidenceLocker(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'evidenceLocker');
    });

    const unsubSteps = onSnapshot(stepsQ, (snapshot) => {
      setActionSteps(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'actionSteps');
    });

    return () => {
      unsubEvidence();
      unsubSteps();
    };
  }, [user]);

  useEffect(() => {
    let timer: any;
    if (showBreathing && breathingTimer > 0) {
      timer = setInterval(() => setBreathingTimer(prev => prev - 1), 1000);
    } else if (breathingTimer === 0) {
      setShowBreathing(false);
      setBreathingTimer(60);
      resultsRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    return () => clearInterval(timer);
  }, [showBreathing, breathingTimer]);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (err) {
      console.error(err);
    }
  };

  const handleLogout = () => signOut(auth);

  const onboardingSteps = [
    {
      title: "Welcome to CogniScope",
      description: "Your AI-powered cognitive mirror. We help you visualize, classify, and analyze overthinking patterns to regain mental clarity.",
      icon: <Brain className="w-12 h-12 text-emerald-500" />,
    },
    {
      title: "Reality Check Mode",
      description: "Our engine flags unrealistic fears and provides evidence-based counter-arguments to ground your thinking in reality.",
      icon: <Eye className="w-12 h-12 text-blue-500" />,
    },
    {
      title: "Overthinking Score",
      description: "Track your cognitive load in real-time. See how much of your thinking is driven by logic versus irrational anxiety.",
      icon: <Activity className="w-12 h-12 text-amber-500" />,
    },
    {
      title: "Personalization Engine",
      description: "CogniScope learns from your past decisions to identify recurring biases and provide increasingly tailored advice and growth strategies.",
      icon: <Zap className="w-12 h-12 text-emerald-400" />,
    },
    {
      title: "Ready to Start?",
      description: "Type a decision or a thought that's been on your mind, and let's break it down together. Your journey to clarity starts here.",
      icon: <Sparkles className="w-12 h-12 text-purple-500" />,
    },
  ];

  const handleCompleteOnboarding = () => {
    localStorage.setItem('cogniscope_onboarding', 'true');
    setShowOnboarding(false);
  };

  const handleAnalyze = async (e?: React.FormEvent, customWhatIf?: string) => {
    e?.preventDefault();
    if (!input.trim() || loading) return;

    setLoading(true);
    setError(null);
    try {
      const recentHistory = history.slice(0, 5);
      const data = await analyzeDecision(input, recentHistory, customWhatIf || whatIf, userProfile || undefined);
      setResult(data);
      
      if (user) {
        try {
          const analysisRef = await addDoc(collection(db, 'analyses'), {
            ...data,
            uid: user.uid,
            createdAt: serverTimestamp()
          });

          // Update UserProfile with new insights
          const profileRef = doc(db, 'userProfiles', user.uid);
          const newTotal = (userProfile?.totalAnalyses || 0) + 1;
          const newAvg = ((userProfile?.averageOverthinkingScore || 0) * (userProfile?.totalAnalyses || 0) + data.overthinkingScore) / newTotal;
          
          const updatedProfile: Partial<UserProfile> = {
            commonBiases: Array.from(new Set([...(userProfile?.commonBiases || []), ...(data.recurringBiases || [])])),
            averageOverthinkingScore: newAvg,
            lastAnalyzedAt: serverTimestamp(),
            totalAnalyses: newTotal,
            biasCorrectionStrategies: data.biasCorrectionStrategies || userProfile?.biasCorrectionStrategies || []
          };
          
          await updateDoc(profileRef, updatedProfile);
        } catch (dbErr) {
          handleFirestoreError(dbErr, OperationType.WRITE, 'analyses/userProfiles');
        }
      }

      if (data.overthinkingScore > 0.8 && !customWhatIf) {
        setShowBreathing(true);
      } else {
        setTimeout(() => {
          resultsRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      }
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('{')) throw err;
      setError('Something went wrong. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
      setIsSimulatingWhatIf(false);
    }
  };

  const startRecording = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError("Speech recognition is not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => setIsRecording(true);
    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results)
        .map((result: any) => result[0])
        .map((result: any) => result.transcript)
        .join('');
      setInput(transcript);
    };
    recognition.onerror = (event: any) => {
      console.error(event.error);
      setIsRecording(false);
    };
    recognition.onend = () => setIsRecording(false);

    recognition.start();
    recognitionRef.current = recognition;
  };

  const stopRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsRecording(false);
  };

  const saveToLocker = async (text: string, bias: string) => {
    if (!user) return;
    try {
      await addDoc(collection(db, 'evidenceLocker'), {
        uid: user.uid,
        text,
        bias,
        createdAt: serverTimestamp()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'evidenceLocker');
    }
  };

  const saveActionStep = async (text: string) => {
    if (!user) return;
    try {
      await addDoc(collection(db, 'actionSteps'), {
        uid: user.uid,
        text,
        status: 'pending',
        createdAt: serverTimestamp()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'actionSteps');
    }
  };

  const updateActionStepStatus = async (id: string, status: 'pending' | 'completed' | 'resolved') => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'actionSteps', id), {
        status
      });

      if (status === 'completed' || status === 'resolved') {
        try {
          const profileRef = doc(db, 'userProfiles', user.uid);
          await updateDoc(profileRef, {
            clarityWins: (userProfile?.clarityWins || 0) + 1
          });
        } catch (dbErr) {
          handleFirestoreError(dbErr, OperationType.UPDATE, 'userProfiles');
        }
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'actionSteps');
    }
  };

  const setActionStepReminder = async (id: string, date: Date) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'actionSteps', id), {
        reminderAt: Timestamp.fromDate(date)
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'actionSteps');
    }
  };

  const getThoughtIcon = (type: Thought['type']) => {
    switch (type) {
      case 'logical': return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
      case 'emotional': return <MessageSquare className="w-4 h-4 text-blue-500" />;
      case 'irrational': return <AlertTriangle className="w-4 h-4 text-amber-500" />;
      case 'catastrophic': return <ShieldAlert className="w-4 h-4 text-red-500" />;
    }
  };

  const chartData = result ? [
    { name: 'Logical', value: result.thoughts.filter(t => t.type === 'logical').length, color: COLORS.logical },
    { name: 'Emotional', value: result.thoughts.filter(t => t.type === 'emotional').length, color: COLORS.emotional },
    { name: 'Irrational', value: result.thoughts.filter(t => t.type === 'irrational').length, color: COLORS.irrational },
    { name: 'Catastrophic', value: result.thoughts.filter(t => t.type === 'catastrophic').length, color: COLORS.catastrophic },
  ].filter(d => d.value > 0) : [];

  const radarData = result ? [
    { subject: 'Logic', A: result.thoughts.filter(t => t.type === 'logical').length * 20, fullMark: 100 },
    { subject: 'Emotion', A: result.thoughts.filter(t => t.type === 'emotional').length * 20, fullMark: 100 },
    { subject: 'Anxiety', A: result.thoughts.filter(t => t.type === 'irrational').length * 20, fullMark: 100 },
    { subject: 'Fear', A: result.thoughts.filter(t => t.type === 'catastrophic').length * 20, fullMark: 100 },
    { subject: 'Balance', A: result.balancedPerspectives.length * 25, fullMark: 100 },
  ] : [];

  const historyChartData = history.slice().reverse().map(h => ({
    date: h.createdAt instanceof Timestamp ? h.createdAt.toDate().toLocaleDateString() : '',
    score: h.overthinkingScore * 100
  }));

  const biasTrendData = history.slice().reverse().map(h => {
    const counts: any = {};
    h.thoughts.forEach(t => {
      if (t.bias) {
        counts[t.bias] = (counts[t.bias] || 0) + 1;
      }
    });
    return {
      date: h.createdAt instanceof Timestamp ? h.createdAt.toDate().toLocaleDateString() : '',
      ...counts
    };
  });

  const allBiases = Array.from(new Set(history.flatMap(h => h.thoughts.map(t => t.bias).filter(Boolean))));

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-zinc-100 font-sans selection:bg-emerald-500/30">
      {/* Background Atmosphere */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-emerald-500/5 blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-blue-500/5 blur-[120px]" />
      </div>

      {/* Navigation */}
      <nav id="main-nav" className="relative z-20 flex items-center justify-between px-6 py-4 border-b border-zinc-900/50 backdrop-blur-md">
        <div className="flex items-center gap-2 font-bold text-xl tracking-tight">
          <Brain className="w-6 h-6 text-emerald-500" />
          CogniScope
        </div>
        <div className="flex items-center gap-4">
          {user ? (
            <div className="flex items-center gap-4">
              <button 
                onClick={() => setActiveView(activeView === 'analyzer' ? 'dashboard' : 'analyzer')}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                  activeView === 'dashboard' ? "bg-emerald-500/10 text-emerald-400" : "text-zinc-400 hover:text-white"
                )}
              >
                <LayoutDashboard className="w-4 h-4" />
                Dashboard
              </button>
              <button 
                onClick={() => setShowHistory(!showHistory)}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                  showHistory ? "bg-emerald-500/10 text-emerald-400" : "text-zinc-400 hover:text-white"
                )}
              >
                <History className="w-4 h-4" />
                History
              </button>
              <div className="flex items-center gap-2 pl-4 border-l border-zinc-800">
                <img src={user.photoURL || ''} className="w-8 h-8 rounded-full border border-zinc-700" alt="" />
                <button onClick={handleLogout} className="text-zinc-500 hover:text-white transition-colors">
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <button 
              onClick={handleLogin}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white text-black font-semibold hover:bg-zinc-200 transition-colors"
            >
              <LogIn className="w-4 h-4" />
              Sign In
            </button>
          )}
        </div>
      </nav>

      <main className="relative z-10 max-w-5xl mx-auto px-6 py-12 lg:py-20">
        {/* Onboarding Overlay */}
        <AnimatePresence>
          {showOnboarding && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-md"
            >
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="max-w-lg w-full bg-zinc-900 border border-zinc-800 rounded-3xl p-8 shadow-2xl relative overflow-hidden"
              >
                <div className="absolute top-0 left-0 w-full h-1 bg-zinc-800">
                  <motion.div 
                    className="h-full bg-emerald-500"
                    initial={{ width: 0 }}
                    animate={{ width: `${((onboardingStep + 1) / onboardingSteps.length) * 100}%` }}
                  />
                </div>
                
                <button 
                  onClick={handleCompleteOnboarding}
                  className="absolute top-4 right-4 p-2 text-zinc-500 hover:text-white transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>

                <div className="flex flex-col items-center text-center py-8">
                  <motion.div
                    key={onboardingStep}
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="mb-8"
                  >
                    {onboardingSteps[onboardingStep].icon}
                  </motion.div>
                  
                  <motion.h2 
                    key={`title-${onboardingStep}`}
                    initial={{ y: 10, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="text-2xl font-bold mb-4"
                  >
                    {onboardingSteps[onboardingStep].title}
                  </motion.h2>
                  
                  <motion.p 
                    key={`desc-${onboardingStep}`}
                    initial={{ y: 10, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="text-zinc-400 leading-relaxed mb-12"
                  >
                    {onboardingSteps[onboardingStep].description}
                  </motion.p>

                  <div className="flex items-center justify-between w-full mt-auto gap-4">
                    <button 
                      onClick={handleCompleteOnboarding}
                      className="text-sm font-medium text-zinc-500 hover:text-white transition-colors"
                    >
                      Skip
                    </button>

                    <div className="flex gap-1.5 flex-1 justify-center">
                      {onboardingSteps.map((_, i) => (
                        <div 
                          key={i}
                          className={cn(
                            "w-1.5 h-1.5 rounded-full transition-all",
                            i === onboardingStep ? "bg-emerald-500 w-4" : "bg-zinc-800"
                          )}
                        />
                      ))}
                    </div>

                    <div className="flex gap-2">
                      <button 
                        onClick={() => setOnboardingStep(Math.max(0, onboardingStep - 1))}
                        disabled={onboardingStep === 0}
                        className={cn(
                          "p-3 rounded-xl border border-zinc-800 transition-colors",
                          onboardingStep === 0 ? "opacity-0 pointer-events-none" : "hover:bg-zinc-800"
                        )}
                      >
                        <ChevronLeft className="w-5 h-5" />
                      </button>
                      
                      <button 
                        onClick={() => {
                          if (onboardingStep < onboardingSteps.length - 1) {
                            setOnboardingStep(onboardingStep + 1);
                          } else {
                            handleCompleteOnboarding();
                          }
                        }}
                        className="px-6 py-3 rounded-xl bg-emerald-500 text-black font-bold hover:bg-emerald-400 transition-all active:scale-95 flex items-center gap-2"
                      >
                        {onboardingStep === onboardingSteps.length - 1 ? "Get Started" : "Next"}
                        {onboardingStep === onboardingSteps.length - 1 ? <CheckCircle2 className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showBreathing && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-black/90 backdrop-blur-xl"
            >
              <div className="text-center space-y-12">
                <div className="relative">
                  <motion.div 
                    animate={{ scale: [1, 1.5, 1] }}
                    transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                    className="w-48 h-48 rounded-full bg-emerald-500/20 border-2 border-emerald-500/50 flex items-center justify-center"
                  >
                    <Wind className="w-12 h-12 text-emerald-500" />
                  </motion.div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-4xl font-bold text-white">{breathingTimer}s</span>
                  </div>
                </div>
                <div className="space-y-4">
                  <h2 className="text-3xl font-bold text-white">Calm Before the Storm</h2>
                  <p className="text-zinc-400 max-w-md mx-auto">
                    Your overthinking score is high. Let's take a moment to breathe before reviewing the analysis.
                  </p>
                  <motion.div 
                    animate={{ opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 4, repeat: Infinity }}
                    className="text-emerald-400 font-bold text-xl uppercase tracking-widest"
                  >
                    {breathingTimer % 8 < 4 ? "Inhale..." : "Exhale..."}
                  </motion.div>
                </div>
                <button 
                  onClick={() => setShowBreathing(false)}
                  className="text-zinc-500 hover:text-white text-sm underline"
                >
                  Skip Exercise
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {activeView === 'dashboard' ? (
            <motion.div
              id="dashboard-view"
              key="dashboard"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-12"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-3xl font-bold">Progress Dashboard</h2>
                <button onClick={() => setActiveView('analyzer')} className="text-zinc-400 hover:text-white">Back to Analyzer</button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="p-6 rounded-2xl bg-zinc-900/50 border border-zinc-800">
                  <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-4">Clarity Wins</h3>
                  <div className="flex items-center gap-4">
                    <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                      <Target className="w-6 h-6 text-emerald-500" />
                    </div>
                    <div>
                      <div className="text-3xl font-bold text-white">{userProfile?.clarityWins || 0}</div>
                      <div className="text-xs text-zinc-500">Action Steps Completed</div>
                    </div>
                  </div>
                </div>
                <div className="p-6 rounded-2xl bg-zinc-900/50 border border-zinc-800">
                  <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-4">Evidence Locker</h3>
                  <div className="flex items-center gap-4">
                    <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
                      <Bookmark className="w-6 h-6 text-blue-500" />
                    </div>
                    <div>
                      <div className="text-3xl font-bold text-white">{evidenceLocker.length}</div>
                      <div className="text-xs text-zinc-500">Saved Reality Checks</div>
                    </div>
                  </div>
                </div>
                <div className="p-6 rounded-2xl bg-zinc-900/50 border border-zinc-800">
                  <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-4">Avg. Clarity</h3>
                  <div className="flex items-center gap-4">
                    <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/20">
                      <Activity className="w-6 h-6 text-purple-500" />
                    </div>
                    <div>
                      <div className="text-3xl font-bold text-white">
                        {userProfile ? (100 - (userProfile.averageOverthinkingScore * 100)).toFixed(0) : 0}%
                      </div>
                      <div className="text-xs text-zinc-500">Decision Confidence</div>
                    </div>
                  </div>
                </div>
              </div>

              {userProfile && userProfile.commonBiases.length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="p-8 rounded-3xl bg-zinc-900/50 border border-zinc-800">
                    <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-6 flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-amber-500" />
                      Recurring Cognitive Biases
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {userProfile.commonBiases.map((bias, i) => (
                        <span key={i} className="px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-medium">
                          {bias}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="p-8 rounded-3xl bg-zinc-900/50 border border-zinc-800">
                    <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-6 flex items-center gap-2">
                      <Zap className="w-4 h-4 text-emerald-500" />
                      Personalized Growth Strategies
                    </h3>
                    <ul className="space-y-3">
                      {userProfile.biasCorrectionStrategies?.slice(0, 3).map((strategy, i) => (
                        <li key={i} className="flex items-start gap-3 text-sm text-zinc-300">
                          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 flex-shrink-0" />
                          {strategy}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="p-8 rounded-3xl bg-zinc-900/50 border border-zinc-800 h-[400px]">
                  <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-8">Overthinking Trend</h3>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={historyChartData}>
                      <XAxis dataKey="date" stroke="#3f3f46" fontSize={10} />
                      <YAxis stroke="#3f3f46" fontSize={10} />
                      <RechartsTooltip 
                        contentStyle={{ backgroundColor: '#09090b', border: '1px solid #27272a', borderRadius: '12px' }}
                      />
                      <Line type="monotone" dataKey="score" stroke="#10b981" strokeWidth={3} dot={{ fill: '#10b981', r: 4 }} activeDot={{ r: 6 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div className="p-8 rounded-3xl bg-zinc-900/50 border border-zinc-800 h-[400px]">
                  <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-8">Bias Frequency Trends</h3>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={biasTrendData}>
                      <XAxis dataKey="date" stroke="#3f3f46" fontSize={10} />
                      <YAxis stroke="#3f3f46" fontSize={10} />
                      <RechartsTooltip 
                        contentStyle={{ backgroundColor: '#09090b', border: '1px solid #27272a', borderRadius: '12px' }}
                        itemStyle={{ fontSize: '12px' }}
                      />
                      {allBiases.map((bias, i) => (
                        <Line 
                          key={bias} 
                          type="monotone" 
                          dataKey={bias} 
                          stroke={[`#10b981`, `#3b82f6`, `#f59e0b`, `#ef4444`, `#8b5cf6`, `#ec4899`][i % 6]} 
                          strokeWidth={2}
                          dot={{ r: 4 }}
                          activeDot={{ r: 6 }}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </motion.div>
          ) : showHistory ? (
            <motion.div 
              key="history"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-12"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-3xl font-bold">Your Overthinking History</h2>
                <button onClick={() => setShowHistory(false)} className="text-zinc-400 hover:text-white">Back to Analyzer</button>
              </div>

              {historyChartData.length > 1 && (
                <div className="p-6 rounded-2xl bg-zinc-900/50 border border-zinc-800 h-[300px]">
                  <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-6">Overthinking Trends</h3>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={historyChartData}>
                      <XAxis dataKey="date" stroke="#52525b" fontSize={10} />
                      <YAxis stroke="#52525b" fontSize={10} />
                      <RechartsTooltip 
                        contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px' }}
                      />
                      <Line type="monotone" dataKey="score" stroke="#10b981" strokeWidth={2} dot={{ fill: '#10b981' }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {history.map((h) => (
                  <button 
                    key={h.id}
                    onClick={() => {
                      setResult(h);
                      setShowHistory(false);
                    }}
                    className="p-6 rounded-2xl bg-zinc-900/30 border border-zinc-800 hover:border-emerald-500/50 text-left transition-all group"
                  >
                    <div className="flex justify-between items-start mb-4">
                      <span className="text-xs text-zinc-500">
                        {h.createdAt instanceof Timestamp ? h.createdAt.toDate().toLocaleDateString() : 'Just now'}
                      </span>
                      <span className={cn(
                        "text-[10px] font-bold uppercase px-2 py-0.5 rounded",
                        h.overthinkingScore > 0.7 ? "bg-red-500/10 text-red-400" : "bg-emerald-500/10 text-emerald-400"
                      )}>
                        {h.overthinkingLevel}
                      </span>
                    </div>
                    <h4 className="font-semibold text-zinc-200 line-clamp-2 group-hover:text-white transition-colors">{h.decision}</h4>
                  </button>
                ))}
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="analyzer"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
            >
              {/* Header */}
              <header className="mb-16 text-center">
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium mb-6"
                >
                  <Zap className="w-3 h-3" />
                  PERSONALIZED COGNITIVE ENGINE
                </motion.div>
                <motion.h1 
                  className="text-5xl lg:text-7xl font-bold tracking-tight mb-6 bg-clip-text text-transparent bg-gradient-to-b from-white to-zinc-500"
                >
                  CogniScope
                </motion.h1>
                <motion.p className="text-lg text-zinc-400 max-w-2xl mx-auto">
                  Visualize the architecture of your overthinking. Map out logical pathways, 
                  detect cognitive distortions, and regain clarity.
                </motion.p>
              </header>

              {/* Input Section */}
              <section id="analyzer-input-section" className="max-w-2xl mx-auto mb-24">
                <form id="analyzer-form" onSubmit={handleAnalyze} className="relative group">
                  <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500/20 to-blue-500/20 rounded-2xl blur opacity-25 group-hover:opacity-50 transition duration-1000 group-hover:duration-200" />
                  <div className="relative flex flex-col gap-4 p-2 bg-zinc-900/50 border border-zinc-800 rounded-2xl backdrop-blur-xl">
                    <textarea
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder="What are you overthinking about?"
                      className="w-full bg-transparent border-none focus:ring-0 text-lg p-4 min-h-[120px] resize-none placeholder:text-zinc-600"
                    />
                    <div className="flex items-center justify-between px-4 pb-2">
                      <div className="flex items-center gap-4">
                        <button 
                          type="button"
                          onClick={() => setRealityCheckMode(!realityCheckMode)}
                          className={cn(
                            "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
                            realityCheckMode ? "bg-emerald-500 text-black" : "bg-zinc-800 text-zinc-500"
                          )}
                        >
                          {realityCheckMode ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                          Reality Check Mode
                        </button>
                        <button 
                          type="button"
                          onClick={isRecording ? stopRecording : startRecording}
                          className={cn(
                            "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
                            isRecording ? "bg-red-500 text-white animate-pulse" : "bg-zinc-800 text-zinc-500 hover:text-white"
                          )}
                        >
                          {isRecording ? <MicOff className="w-3 h-3" /> : <Mic className="w-3 h-3" />}
                          {isRecording ? "Stop Recording" : "Voice to Thought"}
                        </button>
                      </div>
                      <button
                        type="submit"
                        disabled={loading || !input.trim()}
                        className={cn(
                          "flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold transition-all duration-200",
                          loading || !input.trim() 
                            ? "bg-zinc-800 text-zinc-500 cursor-not-allowed" 
                            : "bg-emerald-500 text-black hover:bg-emerald-400 active:scale-95"
                        )}
                      >
                        {loading ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <><ArrowRight className="w-4 h-4" /></>}
                      </button>
                    </div>
                  </div>
                </form>
                {!user && (
                  <p className="mt-4 text-center text-zinc-500 text-xs">
                    Sign in to save your history and enable personalization.
                  </p>
                )}
              </section>

              {/* Results */}
              <AnimatePresence>
                {result && (
                  <motion.div 
                    id="analysis-results"
                    ref={resultsRef}
                    initial={{ opacity: 0, y: 40 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-12"
                  >
                    {/* Personalization Alert */}
                    {result.recurringBiases && result.recurringBiases.length > 0 && (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="relative p-6 rounded-3xl overflow-hidden group"
                      >
                        <div className="absolute inset-0 bg-gradient-to-r from-amber-500/20 to-emerald-500/20 blur-xl opacity-50 group-hover:opacity-70 transition-opacity" />
                        <div className="relative flex flex-col md:flex-row items-center gap-6 p-6 rounded-2xl bg-zinc-900/80 border border-amber-500/30 backdrop-blur-xl">
                          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20">
                            <ShieldAlert className="w-8 h-8 text-amber-500" />
                          </div>
                          <div className="flex-1 text-center md:text-left">
                            <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2 justify-center md:justify-start">
                              <Sparkles className="w-4 h-4 text-emerald-400" />
                              Personalized Insight Detected
                            </h3>
                            <p className="text-sm text-zinc-400 leading-relaxed">
                              Based on your history, we've detected recurring patterns of 
                              <span className="text-amber-400 font-bold mx-1">
                                {result.recurringBiases.join(', ')}
                              </span>. 
                              Check the sidebar for specific strategies to counter these biases.
                            </p>
                          </div>
                          <button 
                            onClick={() => setActiveTab('solutions')}
                            className="px-6 py-2.5 rounded-xl bg-amber-500 text-black font-bold text-sm hover:bg-amber-400 transition-colors shadow-lg shadow-amber-500/20"
                          >
                            View Strategies
                          </button>
                        </div>
                      </motion.div>
                    )}

                    {/* Top Stats */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="p-6 rounded-2xl bg-zinc-900/50 border border-zinc-800 backdrop-blur-sm">
                        <div className="flex items-center gap-3 text-zinc-400 text-sm mb-4 uppercase tracking-wider font-semibold">
                          <Activity className="w-4 h-4 text-emerald-500" />
                          Overthinking Score
                        </div>
                        <div className="flex items-end gap-3">
                          <span className="text-5xl font-bold text-white">
                            {(result.overthinkingScore * 100).toFixed(0)}%
                          </span>
                          <span className={cn(
                            "text-sm font-medium px-2 py-0.5 rounded-full mb-2",
                            result.overthinkingScore > 0.7 ? "bg-red-500/10 text-red-400" :
                            result.overthinkingScore > 0.4 ? "bg-amber-500/10 text-amber-400" :
                            "bg-emerald-500/10 text-emerald-400"
                          )}>
                            {result.overthinkingLevel}
                          </span>
                        </div>
                        <div className="mt-4 h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${result.overthinkingScore * 100}%` }}
                            className={cn(
                              "h-full rounded-full",
                              result.overthinkingScore > 0.7 ? "bg-red-500" :
                              result.overthinkingScore > 0.4 ? "bg-amber-500" :
                              "bg-emerald-500"
                            )}
                          />
                        </div>
                      </div>

                      <div className="md:col-span-2 p-6 rounded-2xl bg-zinc-900/50 border border-zinc-800 backdrop-blur-sm flex flex-col md:flex-row items-center gap-8">
                        <div className="w-full h-[180px]">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie
                                data={chartData}
                                innerRadius={60}
                                outerRadius={80}
                                paddingAngle={5}
                                dataKey="value"
                              >
                                {chartData.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                              </Pie>
                              <RechartsTooltip 
                                contentStyle={{ backgroundColor: '#18181b', border: '1px solid #27272a', borderRadius: '8px' }}
                                itemStyle={{ color: '#fff' }}
                              />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="w-full space-y-3">
                          <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Thought Distribution</h3>
                          <div className="grid grid-cols-2 gap-4">
                            {chartData.map((item) => (
                              <div key={item.name} className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                                <span className="text-sm text-zinc-300">{item.name}</span>
                                <span className="text-xs text-zinc-500 ml-auto">{item.value}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Tabs */}
                    <div className="flex items-center gap-2 p-1 bg-zinc-900/50 border border-zinc-800 rounded-2xl w-fit mb-8">
                      <button 
                        onClick={() => setActiveTab('thoughts')}
                        className={cn(
                          "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all",
                          activeTab === 'thoughts' ? "bg-emerald-500 text-black" : "text-zinc-500 hover:text-zinc-300"
                        )}
                      >
                        <Brain className="w-4 h-4" />
                        Thought Stream
                      </button>
                      <button 
                        onClick={() => setActiveTab('comparison')}
                        className={cn(
                          "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all",
                          activeTab === 'comparison' ? "bg-emerald-500 text-black" : "text-zinc-500 hover:text-zinc-300"
                        )}
                      >
                        <Layers className="w-4 h-4" />
                        Comparison Mode
                      </button>
                      <button 
                        onClick={() => setActiveTab('timeline')}
                        className={cn(
                          "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all",
                          activeTab === 'timeline' ? "bg-emerald-500 text-black" : "text-zinc-500 hover:text-zinc-300"
                        )}
                      >
                        <Clock className="w-4 h-4" />
                        Time Simulation
                      </button>
                      <button 
                        onClick={() => setActiveTab('solutions')}
                        className={cn(
                          "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all",
                          activeTab === 'solutions' ? "bg-emerald-500 text-black" : "text-zinc-500 hover:text-zinc-300"
                        )}
                      >
                        <Zap className="w-4 h-4" />
                        Solution Engine
                      </button>
                      <button 
                        onClick={() => setActiveTab('tasks')}
                        className={cn(
                          "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all",
                          activeTab === 'tasks' ? "bg-emerald-500 text-black" : "text-zinc-500 hover:text-zinc-300"
                        )}
                      >
                        <ListTodo className="w-4 h-4" />
                        Task List
                      </button>
                    </div>

                    {/* Main Content Grid */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                      {/* Thought Stream */}
                      <div className="lg:col-span-2">
                        <AnimatePresence mode="wait">
                          {activeTab === 'thoughts' && (
                            <motion.div
                              key="thoughts-tab"
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -10 }}
                              className="space-y-6"
                            >
                              <h2 className="text-2xl font-bold flex items-center gap-3">
                                <Brain className="w-6 h-6 text-emerald-500" />
                                Simulated Thought Stream
                              </h2>
                              <div className="space-y-4">
                                {result.thoughts.map((thought, idx) => (
                                  <motion.div
                                    key={idx}
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: idx * 0.05 }}
                                    className="group p-5 rounded-2xl bg-zinc-900/30 border border-zinc-800 hover:border-zinc-700 transition-all duration-300"
                                  >
                                    <div className="flex items-start gap-4">
                                      <div className="mt-1 p-2 rounded-lg bg-zinc-800/50">
                                        {getThoughtIcon(thought.type)}
                                      </div>
                                      <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-2">
                                          <span className={cn(
                                            "text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded",
                                            thought.type === 'logical' ? "text-emerald-400 bg-emerald-400/10" :
                                            thought.type === 'emotional' ? "text-blue-400 bg-blue-400/10" :
                                            thought.type === 'irrational' ? "text-amber-400 bg-amber-400/10" :
                                            "text-red-400 bg-red-400/10"
                                          )}>
                                            {thought.type}
                                          </span>
                                          {thought.bias && (
                                            <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded text-zinc-400 bg-zinc-400/10">
                                              {thought.bias}
                                            </span>
                                          )}
                                        </div>
                                        <p className="text-zinc-200 leading-relaxed">{thought.text}</p>
                                        
                                        {realityCheckMode && (thought.realityCheck || thought.detailedRealityCheck) && (
                                          <motion.div 
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: 'auto' }}
                                            className="mt-4 p-5 rounded-2xl bg-emerald-500/5 border border-emerald-500/10 space-y-4"
                                          >
                                            <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold uppercase tracking-wider">
                                              <Scale className="w-3 h-3" />
                                              Enhanced Reality Check
                                            </div>
                                            
                                            {thought.detailedRealityCheck ? (
                                              <div className="grid grid-cols-1 gap-4">
                                                <div className="space-y-1">
                                                  <span className="text-[10px] text-zinc-500 uppercase font-bold">The Distortion</span>
                                                  <p className="text-sm text-zinc-300 leading-relaxed">{thought.detailedRealityCheck.breakdown}</p>
                                                </div>
                                                <div className="space-y-1">
                                                  <span className="text-[10px] text-emerald-500/70 uppercase font-bold">Evidence-Based Reasoning</span>
                                                  <p className="text-sm text-zinc-300 leading-relaxed">{thought.detailedRealityCheck.evidence}</p>
                                                </div>
                                                <div className="space-y-1">
                                                  <span className="text-[10px] text-blue-500/70 uppercase font-bold">Balanced Alternative</span>
                                                  <p className="text-sm text-zinc-300 leading-relaxed italic">"{thought.detailedRealityCheck.alternative}"</p>
                                                </div>
                                                <div className="pt-2">
                                                  <button 
                                                    type="button"
                                                    onClick={() => saveToLocker(thought.detailedRealityCheck!.evidence, thought.bias!)}
                                                    className="flex items-center gap-2 text-[10px] text-zinc-500 hover:text-emerald-400 transition-colors uppercase font-bold"
                                                  >
                                                    <Bookmark className="w-3 h-3" />
                                                    Save Evidence to Locker
                                                  </button>
                                                </div>
                                              </div>
                                            ) : (
                                              <p className="text-sm text-zinc-300 italic leading-relaxed">
                                                {thought.realityCheck}
                                              </p>
                                            )}
                                          </motion.div>
                                        )}

                                        {thought.biasExplanation && (
                                          <div className="mt-4 p-3 rounded-xl bg-zinc-800/30 border border-zinc-700/50 text-sm text-zinc-400 flex items-start gap-3">
                                            <Info className="w-4 h-4 mt-0.5 flex-shrink-0 text-zinc-500" />
                                            {thought.biasExplanation}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </motion.div>
                                ))}
                              </div>
                            </motion.div>
                          )}

                          {activeTab === 'comparison' && result.comparisonMode && (
                            <motion.div
                              key="comparison-tab"
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -10 }}
                              className="space-y-8"
                            >
                              <div className="flex items-center justify-between">
                                <h2 className="text-2xl font-bold flex items-center gap-3">
                                  <Layers className="w-6 h-6 text-emerald-500" />
                                  Comparison Mode
                                </h2>
                                <div className="text-xs text-zinc-500 italic">
                                  Visualizing the impact of different mindsets
                                </div>
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {[
                                  { key: 'logical', icon: <CheckCircle2 className="w-5 h-5 text-emerald-500" />, color: 'emerald', label: 'Logical Pathway' },
                                  { key: 'emotional', icon: <MessageSquare className="w-5 h-5 text-blue-500" />, color: 'blue', label: 'Emotional Lens' },
                                  { key: 'highOverthinking', icon: <ShieldAlert className="w-5 h-5 text-red-500" />, color: 'red', label: 'Anxiety Spiral' },
                                  { key: 'balanced', icon: <Scale className="w-5 h-5 text-purple-500" />, color: 'purple', label: 'Balanced View' }
                                ].map((scenario) => {
                                  const data = (result.comparisonMode as any)[scenario.key];
                                  return (
                                    <div key={scenario.key} className={cn(
                                      "relative p-8 rounded-[2rem] border transition-all duration-500 group overflow-hidden",
                                      scenario.color === 'emerald' ? "bg-emerald-500/5 border-emerald-500/10 hover:border-emerald-500/30" :
                                      scenario.color === 'blue' ? "bg-blue-500/5 border-blue-500/10 hover:border-blue-500/30" :
                                      scenario.color === 'red' ? "bg-red-500/5 border-red-500/10 hover:border-red-500/30" :
                                      "bg-purple-500/5 border-purple-500/10 hover:border-purple-500/30"
                                    )}>
                                      <div className={cn(
                                        "absolute top-0 right-0 w-32 h-32 blur-3xl opacity-10 transition-opacity group-hover:opacity-20",
                                        scenario.color === 'emerald' ? "bg-emerald-500" :
                                        scenario.color === 'blue' ? "bg-blue-500" :
                                        scenario.color === 'red' ? "bg-red-500" :
                                        "bg-purple-500"
                                      )} />
                                      
                                      <div className="relative">
                                        <div className="flex items-center justify-between mb-6">
                                          <div className="flex items-center gap-3">
                                            <div className={cn(
                                              "p-2 rounded-xl",
                                              scenario.color === 'emerald' ? "bg-emerald-500/10" :
                                              scenario.color === 'blue' ? "bg-blue-500/10" :
                                              scenario.color === 'red' ? "bg-red-500/10" :
                                              "bg-purple-500/10"
                                            )}>
                                              {scenario.icon}
                                            </div>
                                            <div>
                                              <span className="text-[10px] text-zinc-500 uppercase font-bold block tracking-widest">{scenario.label}</span>
                                              <h3 className="font-bold text-xl text-white">{data.title}</h3>
                                            </div>
                                          </div>
                                          {data.primaryEmotionOrBias && (
                                            <div className={cn(
                                              "px-3 py-1 rounded-full text-[10px] font-bold uppercase border",
                                              scenario.color === 'emerald' ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" :
                                              scenario.color === 'blue' ? "bg-blue-500/10 border-blue-500/20 text-blue-400" :
                                              scenario.color === 'red' ? "bg-red-500/10 border-red-500/20 text-red-400" :
                                              "bg-purple-500/10 border-purple-500/20 text-purple-400"
                                            )}>
                                              {data.primaryEmotionOrBias}
                                            </div>
                                          )}
                                        </div>

                                        <p className="text-sm text-zinc-400 mb-8 leading-relaxed italic">"{data.description}"</p>
                                        
                                        <div className="space-y-4 mb-8">
                                          <span className="text-[10px] text-zinc-500 uppercase font-bold block tracking-widest">Internal Monologue</span>
                                          {data.thoughts.map((t: string, i: number) => (
                                            <div key={i} className="flex gap-3 text-sm text-zinc-300 bg-black/20 p-3 rounded-xl border border-white/5">
                                              <div className={cn(
                                                "w-1 h-1 rounded-full mt-2 flex-shrink-0",
                                                scenario.color === 'emerald' ? "bg-emerald-500" :
                                                scenario.color === 'blue' ? "bg-blue-500" :
                                                scenario.color === 'red' ? "bg-red-500" :
                                                "bg-purple-500"
                                              )} />
                                              {t}
                                            </div>
                                          ))}
                                        </div>

                                        <div className={cn(
                                          "pt-6 border-t",
                                          scenario.color === 'emerald' ? "border-emerald-500/10" :
                                          scenario.color === 'blue' ? "border-blue-500/10" :
                                          scenario.color === 'red' ? "border-red-500/10" :
                                          "border-purple-500/10"
                                        )}>
                                          <span className="text-[10px] text-zinc-500 uppercase font-bold block mb-2 tracking-widest">Projected Outcome</span>
                                          <p className="text-sm font-semibold text-zinc-200 leading-relaxed">{data.outcome}</p>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </motion.div>
                          )}

                          {activeTab === 'timeline' && result.timeSimulation && (
                            <motion.div
                              key="timeline-tab"
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -10 }}
                              className="space-y-8"
                            >
                              <div className="flex items-center justify-between">
                                <h2 className="text-2xl font-bold flex items-center gap-3">
                                  <Clock className="w-6 h-6 text-emerald-500" />
                                  Time Simulation
                                </h2>
                                <div className="flex items-center gap-3">
                                  <input 
                                    type="text"
                                    placeholder="Simulate a 'what if' question..."
                                    value={whatIf}
                                    onChange={(e) => setWhatIf(e.target.value)}
                                    className="px-4 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-sm focus:outline-none focus:border-emerald-500/50 w-64"
                                  />
                                  <button
                                    onClick={() => {
                                      setIsSimulatingWhatIf(true);
                                      handleAnalyze(undefined, whatIf);
                                    }}
                                    disabled={loading || !whatIf.trim()}
                                    className="px-6 py-2 rounded-xl bg-emerald-500 text-black text-sm font-bold hover:bg-emerald-400 transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2"
                                  >
                                    {isSimulatingWhatIf ? <RefreshCcw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                                    {isSimulatingWhatIf ? 'Simulating...' : 'Simulate'}
                                  </button>
                                </div>
                              </div>

                              {result.timeSimulation.whatIfImpact && (
                                <motion.div 
                                  initial={{ opacity: 0, scale: 0.95 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  className="p-8 rounded-[2rem] bg-emerald-500/5 border border-emerald-500/20 relative overflow-hidden group"
                                >
                                  <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity">
                                    <Sparkles className="w-16 h-16 text-emerald-500" />
                                  </div>
                                  <div className="relative">
                                    <div className="flex items-center gap-2 mb-4">
                                      <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                                        <Bookmark className="w-4 h-4 text-emerald-400" />
                                      </div>
                                      <span className="text-[10px] text-emerald-400 uppercase font-bold tracking-widest">What If Analysis</span>
                                    </div>
                                    <h3 className="text-xl font-bold text-white mb-4 italic leading-tight">
                                      "{result.whatIfQuestion || whatIf}"
                                    </h3>
                                    <div className="p-6 rounded-2xl bg-black/20 border border-white/5 backdrop-blur-sm">
                                      <p className="text-zinc-300 leading-relaxed text-lg">
                                        {result.timeSimulation.whatIfImpact}
                                      </p>
                                    </div>
                                  </div>
                                </motion.div>
                              )}

                              <div className="relative space-y-12 pl-8 border-l border-zinc-800">
                                {[
                                  { label: '1 Month', text: result.timeSimulation.oneMonth, icon: <Activity className="w-4 h-4" /> },
                                  { label: '1 Year', text: result.timeSimulation.oneYear, icon: <TrendingUp className="w-4 h-4" /> },
                                  { label: '5 Years', text: result.timeSimulation.fiveYears, icon: <Target className="w-4 h-4" /> }
                                ].map((step, i) => (
                                  <div key={i} className="relative">
                                    <div className="absolute -left-[41px] top-0 w-6 h-6 rounded-full bg-zinc-900 border-2 border-emerald-500 flex items-center justify-center">
                                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                    </div>
                                    <div className="space-y-2">
                                      <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm uppercase tracking-wider">
                                        {step.icon}
                                        {step.label}
                                      </div>
                                      <div className="p-6 rounded-3xl bg-zinc-900/50 border border-zinc-800 text-zinc-300 leading-relaxed">
                                        {step.text}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </motion.div>
                          )}

                          {activeTab === 'solutions' && (
                            <motion.div
                              key="solutions-tab"
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -10 }}
                              className="space-y-8"
                            >
                              <div className="flex items-center justify-between">
                                <h2 className="text-2xl font-bold flex items-center gap-3">
                                  <Zap className="w-6 h-6 text-emerald-500" />
                                  Solution Engine
                                </h2>
                                <div className="text-xs text-zinc-500 italic">
                                  Focusing on irrational and catastrophic thoughts
                                </div>
                              </div>

                              <div className="grid grid-cols-1 gap-6">
                                {result.thoughts.filter(t => t.type === 'irrational' || t.type === 'catastrophic').length === 0 ? (
                                  <div className="p-12 text-center rounded-3xl bg-emerald-500/5 border border-emerald-500/10">
                                    <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
                                    <h3 className="text-xl font-bold text-white mb-2">No Problematic Thoughts Detected</h3>
                                    <p className="text-zinc-400">Your current thought process seems balanced and logical.</p>
                                  </div>
                                ) : (
                                  result.thoughts
                                    .filter(t => t.type === 'irrational' || t.type === 'catastrophic')
                                    .map((thought, idx) => (
                                      <motion.div
                                        key={idx}
                                        initial={{ opacity: 0, scale: 0.95 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        transition={{ delay: idx * 0.1 }}
                                        className="relative group overflow-hidden"
                                      >
                                        <div className="absolute -inset-0.5 bg-gradient-to-r from-red-500/20 to-amber-500/20 rounded-3xl blur opacity-20 group-hover:opacity-40 transition duration-500" />
                                        <div className="relative p-8 rounded-3xl bg-zinc-900/80 border border-zinc-800 backdrop-blur-xl space-y-6">
                                          <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                              {getThoughtIcon(thought.type)}
                                              <span className={cn(
                                                "text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded",
                                                thought.type === 'irrational' ? "text-amber-400 bg-amber-400/10" : "text-red-400 bg-red-400/10"
                                              )}>
                                                {thought.type}
                                              </span>
                                            </div>
                                            {thought.bias && (
                                              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-800 border border-zinc-700 text-[10px] font-bold text-zinc-400 uppercase">
                                                <AlertTriangle className="w-3 h-3 text-amber-500" />
                                                {thought.bias}
                                              </div>
                                            )}
                                          </div>

                                          <div className="space-y-4">
                                            <div className="space-y-2">
                                              <div className="flex items-center gap-2 text-xs font-bold text-red-400 uppercase tracking-wider">
                                                <X className="w-3 h-3" />
                                                Original Thought
                                              </div>
                                              <p className="text-lg text-zinc-200 font-medium leading-relaxed">
                                                {thought.text}
                                              </p>
                                            </div>

                                            {thought.biasExplanation && (
                                              <div className="p-4 rounded-2xl bg-zinc-800/50 border border-zinc-700/50 space-y-2">
                                                <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                                                  <Brain className="w-3 h-3" />
                                                  Bias Explanation
                                                </div>
                                                <p className="text-sm text-zinc-400 leading-relaxed">
                                                  {thought.biasExplanation}
                                                </p>
                                              </div>
                                            )}

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-zinc-800">
                                              <div className="p-5 rounded-2xl bg-emerald-500/5 border border-emerald-500/10 space-y-2">
                                                <div className="flex items-center gap-2 text-[10px] font-bold text-emerald-400 uppercase tracking-wider">
                                                  <CheckCircle2 className="w-3 h-3" />
                                                  Better Thought
                                                </div>
                                                <p className="text-sm text-zinc-200 font-medium leading-relaxed">
                                                  {thought.betterThought || "Focus on what you can control right now."}
                                                </p>
                                              </div>
                                              <div className="p-5 rounded-2xl bg-blue-500/5 border border-blue-500/10 space-y-2">
                                                <div className="flex items-center justify-between">
                                                  <div className="flex items-center gap-2 text-[10px] font-bold text-blue-400 uppercase tracking-wider">
                                                    <Target className="w-3 h-3" />
                                                    Action Step
                                                  </div>
                                                  <button 
                                                    onClick={() => saveActionStep(thought.actionStep || "Take a deep breath.")}
                                                    className="text-[10px] text-zinc-500 hover:text-blue-400 font-bold uppercase"
                                                  >
                                                    Add to Tasks
                                                  </button>
                                                </div>
                                                <p className="text-sm text-zinc-200 font-medium leading-relaxed">
                                                  {thought.actionStep || "Take a deep breath and list your next three small tasks."}
                                                </p>
                                              </div>
                                            </div>
                                          </div>
                                        </div>
                                      </motion.div>
                                    ))
                                )}
                              </div>
                            </motion.div>
                          )}
                          {activeTab === 'tasks' && (
                            <motion.div
                              key="tasks-tab"
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -10 }}
                              className="space-y-8"
                            >
                              <div className="flex items-center justify-between">
                                <h2 className="text-2xl font-bold flex items-center gap-3">
                                  <ListTodo className="w-6 h-6 text-emerald-500" />
                                  Actionable Task List
                                </h2>
                                <div className="text-xs text-zinc-500 italic">
                                  Closing the loop on overthinking
                                </div>
                              </div>

                              <div className="space-y-4">
                                  {actionSteps.length === 0 ? (
                                    <div className="p-12 text-center rounded-3xl bg-zinc-900/30 border border-zinc-800">
                                      <p className="text-zinc-500">No tasks saved yet. Add them from the Solution Engine.</p>
                                    </div>
                                  ) : (
                                    <div className="grid grid-cols-1 gap-4">
                                      {actionSteps.map((step) => (
                                        <div key={step.id} className="flex items-center gap-4 p-4 rounded-2xl bg-zinc-900/50 border border-zinc-800 group transition-all hover:border-zinc-700">
                                          <div className="flex items-center gap-2">
                                            <button 
                                              onClick={() => updateActionStepStatus(step.id, step.status === 'completed' ? 'pending' : 'completed')}
                                              className={cn(
                                                "w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all",
                                                step.status === 'completed' ? "bg-emerald-500 border-emerald-500" : "border-zinc-700 hover:border-emerald-500/50"
                                              )}
                                              title="Mark as Completed"
                                            >
                                              {step.status === 'completed' && <CheckCircle2 className="w-4 h-4 text-black" />}
                                            </button>
                                            <button 
                                              onClick={() => updateActionStepStatus(step.id, step.status === 'resolved' ? 'pending' : 'resolved')}
                                              className={cn(
                                                "w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all",
                                                step.status === 'resolved' ? "bg-blue-500 border-blue-500" : "border-zinc-700 hover:border-blue-500/50"
                                              )}
                                              title="Mark as Resolved (No longer overthinking)"
                                            >
                                              {step.status === 'resolved' && <Zap className="w-4 h-4 text-black" />}
                                            </button>
                                          </div>
                                          
                                          <div className="flex-1 min-w-0">
                                            <span className={cn(
                                              "block text-sm transition-all truncate",
                                              step.status === 'completed' ? "text-zinc-600 line-through" : 
                                              step.status === 'resolved' ? "text-blue-400 italic" : "text-zinc-200"
                                            )}>
                                              {step.text}
                                            </span>
                                            {step.reminderAt && (
                                              <div className="flex items-center gap-1.5 mt-1 text-[10px] text-zinc-500">
                                                <Clock className="w-3 h-3" />
                                                Reminder: {step.reminderAt.toDate().toLocaleString()}
                                              </div>
                                            )}
                                          </div>

                                          <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <input 
                                              type="datetime-local"
                                              className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-[10px] text-zinc-300 focus:outline-none"
                                              onChange={(e) => {
                                                if (e.target.value) {
                                                  setActionStepReminder(step.id, new Date(e.target.value));
                                                }
                                              }}
                                            />
                                            <button 
                                              onClick={async () => {
                                                if (!user) return;
                                                try {
                                                  await deleteDoc(doc(db, 'actionSteps', step.id));
                                                } catch (err) {
                                                  console.error(err);
                                                }
                                              }}
                                              className="p-2 text-zinc-500 hover:text-red-400 transition-colors"
                                            >
                                              <Trash2 className="w-4 h-4" />
                                            </button>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      {/* Sidebar Analysis */}
                      <div className="space-y-8">
                        {/* Evidence Locker Sidebar */}
                        {evidenceLocker.length > 0 && (
                          <div className="p-6 rounded-2xl bg-blue-500/5 border border-blue-500/20">
                            <h3 className="text-sm font-semibold text-blue-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                              <Bookmark className="w-4 h-4" />
                              Evidence Locker
                            </h3>
                            <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-zinc-800">
                              {evidenceLocker.map((evidence) => (
                                <div key={evidence.id} className="p-3 rounded-xl bg-black/20 border border-white/5 space-y-2">
                                  <span className="text-[10px] text-zinc-500 font-bold uppercase">{evidence.bias}</span>
                                  <p className="text-xs text-zinc-400 leading-relaxed italic">"{evidence.text}"</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Radar Chart */}
                        <div className="p-6 rounded-2xl bg-zinc-900/50 border border-zinc-800">
                          <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-6">Cognitive Profile</h3>
                          <div className="h-[250px]">
                            <ResponsiveContainer width="100%" height="100%">
                              <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
                                <PolarGrid stroke="#27272a" />
                                <PolarAngleAxis dataKey="subject" tick={{ fill: '#71717a', fontSize: 10 }} />
                                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                                <Radar
                                  name="Profile"
                                  dataKey="A"
                                  stroke="#10b981"
                                  fill="#10b981"
                                  fillOpacity={0.2}
                                />
                              </RadarChart>
                            </ResponsiveContainer>
                          </div>
                        </div>

                        {/* Recurring Biases */}
                        {result.recurringBiases && result.recurringBiases.length > 0 && (
                          <div className="p-6 rounded-2xl bg-amber-500/5 border border-amber-500/20">
                            <h3 className="text-sm font-semibold text-amber-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                              <ShieldAlert className="w-4 h-4" />
                              Recurring Patterns
                            </h3>
                            <div className="flex flex-wrap gap-2 mb-6">
                              {result.recurringBiases.map((bias, idx) => (
                                <span key={idx} className="px-2 py-1 rounded-lg bg-amber-500/10 text-amber-400 text-[10px] font-bold uppercase tracking-wider border border-amber-500/20">
                                  {bias}
                                </span>
                              ))}
                            </div>
                            
                            {result.biasCorrectionStrategies && (
                              <div className="space-y-4">
                                <span className="text-[10px] text-zinc-500 uppercase font-bold block mb-2">Correction Strategies</span>
                                {result.biasCorrectionStrategies.map((strategy, idx) => (
                                  <div key={idx} className="flex gap-3 text-xs text-zinc-400 leading-relaxed">
                                    <div className="w-1 h-1 rounded-full bg-amber-500 mt-1.5 flex-shrink-0" />
                                    {strategy}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Balanced Perspectives */}
                        <div className="p-6 rounded-2xl bg-emerald-500/5 border border-emerald-500/20">
                          <h3 className="text-sm font-semibold text-emerald-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                            <TrendingUp className="w-4 h-4" />
                            Balanced Perspectives
                          </h3>
                          <ul className="space-y-4">
                            {result.balancedPerspectives.map((p, idx) => (
                              <li key={idx} className="text-sm text-zinc-300 leading-relaxed flex gap-3">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 flex-shrink-0" />
                                {p}
                              </li>
                            ))}
                          </ul>
                        </div>

                        {/* Advice */}
                        <div className="p-6 rounded-2xl bg-blue-500/5 border border-blue-500/20">
                          <h3 className="text-sm font-semibold text-blue-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                            <Zap className="w-4 h-4" />
                            Core Insight
                          </h3>
                          <p className="text-sm text-zinc-300 leading-relaxed italic">
                            "{result.advice}"
                          </p>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="max-w-5xl mx-auto px-6 py-12 text-center text-zinc-600 text-xs border-t border-zinc-900/50">
        <p>© 2026 CogniScope AI. Designed for cognitive reflection and decision mapping.</p>
        <p className="mt-2">Not a substitute for professional mental health advice.</p>
      </footer>
    </div>
  );
}
