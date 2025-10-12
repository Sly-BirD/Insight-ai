import { createContext, useContext, useState, ReactNode } from 'react';

interface UploadedFile {
  file: File;
  id: string;
  name: string;
  size: number;
}

interface QueryResult {
  decision?: string;
  justification?: string | string[];
  clauses?: string[];
}

interface QueryHistoryItem {
  id: number;
  query: string;
  result: QueryResult;
  timestamp: string;
}

interface AuditEntry {
  id: number;
  action: string;
  details: string;
  timestamp: string;
  user: string;
}

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error';
}

interface AppContextType {
  uploadedFiles: UploadedFile[];
  setUploadedFiles: (files: UploadedFile[]) => void;
  queryResult: QueryResult | null;
  setQueryResult: (result: QueryResult | null) => void;
  queryHistory: QueryHistoryItem[];
  addToHistory: (query: string, result: QueryResult) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  activeSection: string;
  setActiveSection: (section: string) => void;
  showToast: (message: string, type?: 'success' | 'error') => void;
  darkMode: boolean;
  toggleDarkMode: () => void;
  auditLog: AuditEntry[];
  addAuditEntry: (action: string, details: string) => void;
}

const AppContext = createContext<AppContextType | null>(null);

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [queryResult, setQueryResult] = useState<QueryResult | null>(null);
  const [queryHistory, setQueryHistory] = useState<QueryHistoryItem[]>([]);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeSection, setActiveSection] = useState('home');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [darkMode, setDarkMode] = useState(false);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  };

  const toggleDarkMode = () => setDarkMode(prev => !prev);

  const addToHistory = (query: string, result: QueryResult) => {
    const historyItem: QueryHistoryItem = {
      id: Date.now(),
      query,
      result,
      timestamp: new Date().toISOString()
    };
    setQueryHistory(prev => [historyItem, ...prev]);
  };

  const addAuditEntry = (action: string, details: string) => {
    const auditEntry: AuditEntry = {
      id: Date.now(),
      action,
      details,
      timestamp: new Date().toISOString(),
      user: 'User'
    };
    setAuditLog(prev => [auditEntry, ...prev]);
  };

  return (
    <AppContext.Provider
      value={{
        uploadedFiles,
        setUploadedFiles,
        queryResult,
        setQueryResult,
        queryHistory,
        addToHistory,
        isLoading,
        setIsLoading,
        activeSection,
        setActiveSection,
        showToast,
        darkMode,
        toggleDarkMode,
        auditLog,
        addAuditEntry,
      }}
    >
      {children}
      <ToastContainer toasts={toasts} />
    </AppContext.Provider>
  );
};

const ToastContainer = ({ toasts }: { toasts: Toast[] }) => (
  <div className="fixed top-4 right-4 z-50 space-y-2">
    {toasts.map(toast => (
      <div
        key={toast.id}
        className={`px-4 py-3 rounded-lg shadow-lg text-white ${
          toast.type === 'success' ? 'bg-green-500' : 'bg-red-500'
        }`}
      >
        {toast.message}
      </div>
    ))}
  </div>
);

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within AppProvider');
  }
  return context;
};
