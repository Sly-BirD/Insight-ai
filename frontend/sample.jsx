import React, { useState, createContext, useContext } from 'react';

const API_BASE_URL = 'http://localhost:8000';

const AppContext = createContext(null);

const AppProvider = ({ children }) => {
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [queryResult, setQueryResult] = useState(null);
  const [queryHistory, setQueryHistory] = useState([]);
  const [auditLog, setAuditLog] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeSection, setActiveSection] = useState('dashboard');
  const [toasts, setToasts] = useState([]);
  const [darkMode, setDarkMode] = useState(false);
  const [compareDocuments, setCompareDocuments] = useState([]);

  const showToast = (message, type = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  };

  const toggleDarkMode = () => setDarkMode(prev => !prev);

  const addToHistory = (query, result) => {
    const historyItem = { id: Date.now(), query, result, timestamp: new Date().toISOString() };
    setQueryHistory(prev => [historyItem, ...prev]);
  };

  const addAuditEntry = (action, details) => {
    const auditEntry = {
      id: Date.now(),
      action,
      details,
      timestamp: new Date().toISOString(),
      user: 'User'
    };
    setAuditLog(prev => [auditEntry, ...prev]);
  };

  return (
    <AppContext.Provider value={{
      uploadedFiles, setUploadedFiles, queryResult, setQueryResult,
      queryHistory, addToHistory, isLoading, setIsLoading,
      activeSection, setActiveSection, showToast, darkMode, toggleDarkMode,
      auditLog, addAuditEntry, compareDocuments, setCompareDocuments
    }}>
      {children}
      <ToastContainer toasts={toasts} />
    </AppContext.Provider>
  );
};

const useAppContext = () => useContext(AppContext);

const ToastContainer = ({ toasts }) => (
  <div className="fixed top-4 right-4 z-50 space-y-2">
    {toasts.map(toast => (
      <div key={toast.id} className={`px-4 py-3 rounded-lg shadow-lg text-white ${toast.type === 'success' ? 'bg-green-500' : 'bg-red-500'}`}>
        {toast.message}
      </div>
    ))}
  </div>
);

const apiService = {
  ingestFiles: async (files) => {
    const formData = new FormData();
    files.forEach(file => formData.append('files', file));
    const response = await fetch(`${API_BASE_URL}/ingest`, { method: 'POST', body: formData });
    if (!response.ok) throw new Error('Failed to ingest files');
    return response.json();
  },
  query: async (queryText) => {
    const response = await fetch(`${API_BASE_URL}/query?q=${encodeURIComponent(queryText)}`);
    if (!response.ok) throw new Error('Query failed');
    return response.json();
  }
};

const UploadIcon = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>;
const SearchIcon = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>;
const ClockIcon = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
const DashboardIcon = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>;
const AuditIcon = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>;
const CompareIcon = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>;
const XIcon = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>;
const CheckCircleIcon = () => <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
const XCircleIcon = () => <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
const DocumentIcon = () => <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>;
const SunIcon = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>;
const MoonIcon = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg>;

const Header = () => {
  const { darkMode, toggleDarkMode } = useAppContext();
  return (
    <header className={`border-b px-6 py-4 flex items-center justify-between sticky top-0 z-40 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
      <div className="flex items-center space-x-3">
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
          <span className="text-white font-bold text-lg">I</span>
        </div>
        <h1 className={`text-xl font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>InsightAI</h1>
      </div>
      <div className="flex items-center space-x-3">
        <button onClick={toggleDarkMode} className={`p-2 rounded-lg transition-colors ${darkMode ? 'bg-gray-700 text-yellow-400 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
          {darkMode ? <SunIcon /> : <MoonIcon />}
        </button>
        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`}>
          <span className={`text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>U</span>
        </div>
      </div>
    </header>
  );
};

const Sidebar = () => {
  const { activeSection, setActiveSection, darkMode } = useAppContext();
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: DashboardIcon },
    { id: 'upload', label: 'Upload', icon: UploadIcon },
    { id: 'query', label: 'Query', icon: SearchIcon },
    { id: 'audit', label: 'Audit', icon: AuditIcon },
    { id: 'compare', label: 'Compare', icon: CompareIcon }
  ];
  
  return (
    <aside className={`w-64 border-r p-4 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
      <nav className="space-y-2">
        {navItems.map(item => {
          const Icon = item.icon;
          return (
            <button key={item.id} onClick={() => setActiveSection(item.id)} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${activeSection === item.id ? (darkMode ? 'bg-blue-900 text-blue-300' : 'bg-blue-50 text-blue-600') : (darkMode ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-50')}`}>
              <Icon />
              <span className="font-medium">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
};

const DashboardSection = () => {
  const { uploadedFiles, queryHistory, darkMode } = useAppContext();
  const totalQueries = queryHistory.length;
  const approvedQueries = queryHistory.filter(h => {
    const decision = h.result?.decision?.toLowerCase();
    return decision === 'approve' || decision === 'approved';
  }).length;
  
  const monthlyData = Array.from({ length: 12 }, (_, i) => ({
    month: new Date(2025, i).toLocaleString('default', { month: 'short' }),
    queries: Math.floor(Math.random() * 10)
  }));
  
  return (
    <div className="space-y-6">
      <div>
        <h2 className={`text-2xl font-semibold mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Dashboard</h2>
        <p className={darkMode ? 'text-gray-400' : 'text-gray-600'}>Overview of your document analysis activities</p>
      </div>

      <div className={`rounded-lg border p-6 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
        <h3 className={`text-lg font-semibold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>At a Glance</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className={`p-4 rounded-lg ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
            <p className={`text-sm mb-2 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Documents</p>
            <p className={`text-3xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{uploadedFiles.length}</p>
          </div>
          <div className={`p-4 rounded-lg ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
            <p className={`text-sm mb-2 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Queries</p>
            <p className={`text-3xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{totalQueries}</p>
          </div>
          <div className={`p-4 rounded-lg ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
            <p className={`text-sm mb-2 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Approved</p>
            <p className="text-3xl font-bold text-green-500">{approvedQueries}</p>
          </div>
          <div className={`p-4 rounded-lg ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
            <p className={`text-sm mb-2 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Rejected</p>
            <p className="text-3xl font-bold text-red-500">{totalQueries - approvedQueries}</p>
          </div>
        </div>
      </div>

      <div className={`rounded-lg border p-6 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
        <h3 className={`text-lg font-semibold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Recent Activity</h3>
        <div className="space-y-3">
          {queryHistory.length > 0 ? queryHistory.slice(0, 5).map(item => {
            const decision = item.result?.decision?.toLowerCase();
            const isApproved = decision === 'approve' || decision === 'approved';
            return (
              <div key={item.id} className={`p-3 rounded-lg ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>{item.query}</p>
                    <p className={`text-xs mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{new Date(item.timestamp).toLocaleString()}</p>
                  </div>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${isApproved ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {isApproved ? 'Approved' : 'Rejected'}
                  </span>
                </div>
              </div>
            );
          }) : (
            <p className={`text-center py-8 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>No activity yet</p>
          )}
        </div>
      </div>

      <div className={`rounded-lg border p-6 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
        <h3 className={`text-lg font-semibold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Query Activity</h3>
        <div className="relative h-64">
          <div className="absolute inset-0 flex items-end justify-between px-4">
            {monthlyData.map((data, idx) => (
              <div key={idx} className="flex flex-col items-center flex-1">
                <div className="w-full mx-1 bg-blue-500 rounded-t hover:bg-blue-600" style={{ height: `${(data.queries / 10) * 100}%`, minHeight: '4px' }} />
                <span className={`text-xs mt-2 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>{data.month}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const UploadSection = () => {
  const { uploadedFiles, setUploadedFiles, isLoading, setIsLoading, showToast, darkMode, addAuditEntry } = useAppContext();
  const [filePreviews, setFilePreviews] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  
  const addFiles = (files) => {
    const validTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'];
    const validFiles = files.filter(file => validTypes.includes(file.type));
    const newFiles = validFiles.map(file => ({ file, id: Math.random().toString(36).substr(2, 9), name: file.name, size: file.size }));
    setFilePreviews([...filePreviews, ...newFiles]);
  };
  
  const handleIngest = async () => {
    if (filePreviews.length === 0) {
      showToast('Please select files to upload', 'error');
      return;
    }
    setIsLoading(true);
    try {
      await apiService.ingestFiles(filePreviews.map(f => f.file));
      setUploadedFiles([...uploadedFiles, ...filePreviews]);
      addAuditEntry('File Upload', `Uploaded ${filePreviews.length} file(s)`);
      setFilePreviews([]);
      showToast('Files ingested successfully!');
    } catch (error) {
      showToast('Failed to ingest files', 'error');
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <div className="space-y-6">
      <div>
        <h2 className={`text-2xl font-semibold mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Upload Documents</h2>
        <p className={darkMode ? 'text-gray-400' : 'text-gray-600'}>Upload insurance policy documents for analysis</p>
      </div>
      
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
        onDrop={(e) => { e.preventDefault(); setIsDragging(false); addFiles(Array.from(e.dataTransfer.files)); }}
        onClick={() => document.getElementById('fileInput').click()}
        className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors ${isDragging ? 'border-blue-500 bg-blue-50' : darkMode ? 'border-gray-600 hover:border-gray-500 bg-gray-800' : 'border-gray-300 hover:border-gray-400'}`}
      >
        <input id="fileInput" type="file" multiple accept=".pdf,.docx,.txt" onChange={(e) => addFiles(Array.from(e.target.files))} className="hidden" />
        <DocumentIcon className={`mx-auto mb-4 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`} />
        <p className={`font-medium mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{isDragging ? 'Drop files here' : 'Drag and drop files here'}</p>
        <p className="text-sm text-gray-500">or click to browse (PDF, DOCX, TXT)</p>
      </div>
      
      {filePreviews.length > 0 && (
        <div className={`rounded-lg border p-4 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
          <h3 className={`font-medium mb-3 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Selected Files</h3>
          <div className="space-y-2">
            {filePreviews.map(file => (
              <div key={file.id} className={`flex items-center justify-between p-3 rounded-lg ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
                <div className="flex-1">
                  <p className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>{file.name}</p>
                  <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{(file.size / 1024).toFixed(2)} KB</p>
                </div>
                <button onClick={(e) => { e.stopPropagation(); setFilePreviews(filePreviews.filter(f => f.id !== file.id)); }} className={darkMode ? 'text-gray-400 hover:text-red-400' : 'text-gray-400 hover:text-red-500'}>
                  <XIcon />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
      
      <button onClick={handleIngest} disabled={isLoading || filePreviews.length === 0} className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors">
        {isLoading ? 'Ingesting...' : 'Ingest Files'}
      </button>
    </div>
  );
};

const QuerySection = () => {
  const { setQueryResult, isLoading, setIsLoading, showToast, darkMode, addToHistory, addAuditEntry } = useAppContext();
  const [queryText, setQueryText] = useState('');
  
  const handleSubmit = async () => {
    if (!queryText.trim()) {
      showToast('Please enter a query', 'error');
      return;
    }
    setIsLoading(true);
    try {
      const result = await apiService.query(queryText);
      const parsedResponse = typeof result.response === 'string' ? JSON.parse(result.response) : result.response;
      setQueryResult(parsedResponse);
      addToHistory(queryText, parsedResponse);
      addAuditEntry('Query Executed', `Query: "${queryText}"`);
      showToast('Query completed successfully!');
    } catch (error) {
      showToast('Query failed', 'error');
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <div className="space-y-6">
      <div>
        <h2 className={`text-2xl font-semibold mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Query Documents</h2>
        <p className={darkMode ? 'text-gray-400' : 'text-gray-600'}>Ask questions about your uploaded insurance policies</p>
      </div>
      <div className="space-y-4">
        <div>
          <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Enter your query</label>
          <textarea value={queryText} onChange={(e) => setQueryText(e.target.value)} placeholder="E.g., Does this policy cover surgery expenses?" rows={4} className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 ${darkMode ? 'bg-gray-800 border-gray-600 text-white placeholder-gray-500' : 'border-gray-300'}`} />
        </div>
        <button onClick={handleSubmit} disabled={isLoading} className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed">
          {isLoading ? 'Processing...' : 'Submit Query'}
        </button>
      </div>
    </div>
  );
};

const ResultsSection = () => {
  const { queryResult, darkMode } = useAppContext();
  
  if (!queryResult) return null;
  
  const decision = queryResult.decision?.toLowerCase();
  const isApproved = decision === 'approve' || decision === 'approved';
  
  return (
    <div className="space-y-6 mt-8">
      <h2 className={`text-2xl font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Query Results</h2>
      <div className={`rounded-lg border p-6 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
        <div className="flex items-start space-x-4">
          <div className={isApproved ? 'text-green-500' : 'text-red-500'}>
            {isApproved ? <CheckCircleIcon /> : <XCircleIcon />}
          </div>
          <div className="flex-1">
            <div className="flex items-center space-x-3 mb-2">
              <h3 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>Decision</h3>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${isApproved ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                {isApproved ? 'Approved' : 'Rejected'}
              </span>
            </div>
          </div>
        </div>
      </div>
      {queryResult.justification && (
        <div className={`rounded-lg border p-6 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
          <h3 className={`text-lg font-semibold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Justification</h3>
          <div className="space-y-2">
            {Array.isArray(queryResult.justification) ? (
              <ul className="list-disc list-inside space-y-2">
                {queryResult.justification.map((item, idx) => (
                  <li key={idx} className={darkMode ? 'text-gray-300' : 'text-gray-700'}>{item}</li>
                ))}
              </ul>
            ) : (
              <p className={darkMode ? 'text-gray-300' : 'text-gray-700'}>{queryResult.justification}</p>
            )}
          </div>
        </div>
      )}
      {queryResult.clauses && queryResult.clauses.length > 0 && (
        <div className={`rounded-lg border p-6 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
          <h3 className={`text-lg font-semibold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Referenced Clauses</h3>
          <div className="space-y-3">
            {queryResult.clauses.map((clause, idx) => (
              <div key={idx} className={`border-l-4 p-4 rounded ${darkMode ? 'bg-yellow-900 border-yellow-600 text-gray-200' : 'bg-yellow-50 border-yellow-400 text-gray-800'}`}>
                <p>{clause}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const AuditSection = () => {
  const { auditLog, darkMode } = useAppContext();
  
  return (
    <div className="space-y-6">
      <div>
        <h2 className={`text-2xl font-semibold mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Audit Log</h2>
        <p className={darkMode ? 'text-gray-400' : 'text-gray-600'}>Track all system activities and changes</p>
      </div>
      
      {auditLog.length > 0 ? (
        <div className={`rounded-lg border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className={`border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                <tr>
                  <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Timestamp</th>
                  <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>User</th>
                  <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Action</th>
                  <th className={`px-6 py-3 text-left text-xs font-medium uppercase tracking-wider ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {auditLog.map(entry => (
                  <tr key={entry.id} className={darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-50'}>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm ${darkMode ? 'text-gray-300' : 'text-gray-900'}`}>
                      {new Date(entry.timestamp).toLocaleString()}
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm ${darkMode ? 'text-gray-300' : 'text-gray-900'}`}>
                      {entry.user}
                    </td>
                    <td className={`px-6 py-4 whitespace-nowrap text-sm ${darkMode ? 'text-gray-300' : 'text-gray-900'}`}>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        entry.action === 'File Upload' ? 'bg-blue-100 text-blue-800' :
                        entry.action === 'Query Executed' ? 'bg-green-100 text-green-800' :
                        'bg-purple-100 text-purple-800'
                      }`}>
                        {entry.action}
                      </span>
                    </td>
                    <td className={`px-6 py-4 text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      {entry.details}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className={`text-center py-12 rounded-lg border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
          <AuditIcon />
          <p className={`mt-4 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>No audit entries yet</p>
          <p className={`text-sm mt-2 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>Activity logs will appear here</p>
        </div>
      )}
    </div>
  );
};

const CompareSection = () => {
  const { uploadedFiles, compareDocuments, setCompareDocuments, darkMode } = useAppContext();
  const [selectedDoc1, setSelectedDoc1] = useState('');
  const [selectedDoc2, setSelectedDoc2] = useState('');
  const [comparisonResult, setComparisonResult] = useState(null);
  
  const handleCompare = () => {
    if (!selectedDoc1 || !selectedDoc2) {
      return;
    }
    
    const doc1 = uploadedFiles.find(f => f.id === selectedDoc1);
    const doc2 = uploadedFiles.find(f => f.id === selectedDoc2);
    
    setComparisonResult({
      doc1: doc1.name,
      doc2: doc2.name,
      differences: [
        { section: 'Coverage Amount', doc1Value: '$50,000', doc2Value: '$100,000', status: 'different' },
        { section: 'Deductible', doc1Value: '$500', doc2Value: '$500', status: 'same' },
        { section: 'Premium', doc1Value: '$200/month', doc2Value: '$350/month', status: 'different' },
        { section: 'Coverage Type', doc1Value: 'Basic', doc2Value: 'Comprehensive', status: 'different' }
      ]
    });
  };
  
  return (
    <div className="space-y-6">
      <div>
        <h2 className={`text-2xl font-semibold mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Compare Documents</h2>
        <p className={darkMode ? 'text-gray-400' : 'text-gray-600'}>Compare two insurance policy documents side by side</p>
      </div>
      
      <div className={`rounded-lg border p-6 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              Document 1
            </label>
            <select
              value={selectedDoc1}
              onChange={(e) => setSelectedDoc1(e.target.value)}
              className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'
              }`}
            >
              <option value="">Select a document</option>
              {uploadedFiles.map(file => (
                <option key={file.id} value={file.id}>{file.name}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              Document 2
            </label>
            <select
              value={selectedDoc2}
              onChange={(e) => setSelectedDoc2(e.target.value)}
              className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'
              }`}
            >
              <option value="">Select a document</option>
              {uploadedFiles.map(file => (
                <option key={file.id} value={file.id}>{file.name}</option>
              ))}
            </select>
          </div>
        </div>
        
        <button
          onClick={handleCompare}
          disabled={!selectedDoc1 || !selectedDoc2}
          className="w-full mt-6 bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          Compare Documents
        </button>
      </div>
      
      {comparisonResult && (
        <div className={`rounded-lg border p-6 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
          <h3 className={`text-lg font-semibold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            Comparison: {comparisonResult.doc1} vs {comparisonResult.doc2}
          </h3>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className={`border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                <tr>
                  <th className={`px-4 py-3 text-left text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Section</th>
                  <th className={`px-4 py-3 text-left text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Document 1</th>
                  <th className={`px-4 py-3 text-left text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Document 2</th>
                  <th className={`px-4 py-3 text-left text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Status</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${darkMode ? 'divide-gray-700' : 'divide-gray-200'}`}>
                {comparisonResult.differences.map((diff, idx) => (
                  <tr key={idx} className={darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-50'}>
                    <td className={`px-4 py-4 text-sm font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                      {diff.section}
                    </td>
                    <td className={`px-4 py-4 text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      {diff.doc1Value}
                    </td>
                    <td className={`px-4 py-4 text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      {diff.doc2Value}
                    </td>
                    <td className="px-4 py-4 text-sm">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        diff.status === 'same' 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {diff.status === 'same' ? 'Match' : 'Different'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      
      {uploadedFiles.length === 0 && (
        <div className={`text-center py-12 rounded-lg border ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
          <CompareIcon />
          <p className={`mt-4 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>No documents to compare</p>
          <p className={`text-sm mt-2 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>Upload at least 2 documents to use comparison</p>
        </div>
      )}
    </div>
  );
};

const MainContent = () => {
  const { activeSection, queryResult, darkMode } = useAppContext();
  
  return (
    <main className={`flex-1 p-8 overflow-y-auto ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
      <div className="max-w-4xl mx-auto">
        {activeSection === 'dashboard' && <DashboardSection />}
        {activeSection === 'upload' && <UploadSection />}
        {activeSection === 'query' && (
          <>
            <QuerySection />
            {queryResult && <ResultsSection />}
          </>
        )}
        {activeSection === 'audit' && <AuditSection />}
        {activeSection === 'compare' && <CompareSection />}
      </div>
    </main>
  );
};

function App() {
  return (
    <AppProvider>
      <div className="h-screen flex flex-col">
        <Header />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          <MainContent />
        </div>
      </div>
    </AppProvider>
  );
}

export default App;