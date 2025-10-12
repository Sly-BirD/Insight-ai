import { useAppContext } from '../context/AppContext';

export const Dashboard = () => {
  const { uploadedFiles, queryHistory, darkMode } = useAppContext();

  const totalQueries = queryHistory.length;
  const approvedQueries = queryHistory.filter(h => {
    const decision = h.result?.decision?.toLowerCase();
    return decision === 'approve' || decision === 'approved';
  }).length;

  const monthlyData = Array.from({ length: 12 }, (_, i) => ({
    month: new Date(2025, i).toLocaleString('default', { month: 'short' }),
    queries: Math.floor(Math.random() * 10),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h2 className={`text-2xl font-semibold mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
          Dashboard
        </h2>
        <p className={darkMode ? 'text-gray-400' : 'text-gray-600'}>
          Overview of your document analysis activities
        </p>
      </div>

      <div
        className={`rounded-lg border p-6 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}
      >
        <h3 className={`text-lg font-semibold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
          At a Glance
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <div className={`p-4 rounded-lg ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
            <p className={`text-sm mb-2 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Documents</p>
            <p className={`text-3xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              {uploadedFiles.length}
            </p>
          </div>
          <div className={`p-4 rounded-lg ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}>
            <p className={`text-sm mb-2 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>Queries</p>
            <p className={`text-3xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              {totalQueries}
            </p>
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

      <div
        className={`rounded-lg border p-6 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}
      >
        <h3 className={`text-lg font-semibold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
          Recent Activity
        </h3>
        <div className="space-y-3">
          {queryHistory.length > 0 ? (
            queryHistory.slice(0, 5).map(item => {
              const decision = item.result?.decision?.toLowerCase();
              const isApproved = decision === 'approve' || decision === 'approved';
              return (
                <div
                  key={item.id}
                  className={`p-3 rounded-lg ${darkMode ? 'bg-gray-700' : 'bg-gray-50'}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p
                        className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}
                      >
                        {item.query}
                      </p>
                      <p className={`text-xs mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        {new Date(item.timestamp).toLocaleString()}
                      </p>
                    </div>
                    <span
                      className={`px-2 py-1 rounded text-xs font-medium ${
                        isApproved ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {isApproved ? 'Approved' : 'Rejected'}
                    </span>
                  </div>
                </div>
              );
            })
          ) : (
            <p className={`text-center py-8 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              No activity yet
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
