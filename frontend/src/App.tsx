import { AppProvider, useAppContext } from './context/AppContext';
import { HomePage } from './components/HomePage';
import { Header, Sidebar } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { Upload } from './components/Upload';
import { Query } from './components/Query';
import { Audit } from './components/Audit';
import { Compare } from './components/Compare';

const MainContent = () => {
  const { activeSection, darkMode } = useAppContext();

  if (activeSection === 'home') {
    return <HomePage />;
  }

  return (
    <main className={`flex-1 p-8 overflow-y-auto ${darkMode ? 'bg-gray-900' : 'bg-gray-50'}`}>
      <div className="max-w-4xl mx-auto">
        {activeSection === 'dashboard' && <Dashboard />}
        {activeSection === 'upload' && <Upload />}
        {activeSection === 'query' && <Query />}
        {activeSection === 'audit' && <Audit />}
        {activeSection === 'compare' && <Compare />}
      </div>
    </main>
  );
};

const AppContent = () => {
  const { activeSection } = useAppContext();

  if (activeSection === 'home') {
    return <MainContent />;
  }

  return (
    <div className="h-screen flex flex-col">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <MainContent />
      </div>
    </div>
  );
};

function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}

export default App;
