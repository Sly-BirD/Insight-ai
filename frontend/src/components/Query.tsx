import { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { CheckCircle, XCircle } from 'lucide-react';

export const Query = () => {
  const { setQueryResult, isLoading, setIsLoading, showToast, darkMode, addToHistory, addAuditEntry, queryResult } = useAppContext();
  const [queryText, setQueryText] = useState('');

  const handleSubmit = async () => {
    if (!queryText.trim()) {
      showToast('Please enter a query', 'error');
      return;
    }
    setIsLoading(true);
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 2000));
      const mockResult = {
        decision: Math.random() > 0.5 ? 'approved' : 'rejected',
        justification: [
          'Based on policy section 3.2, the requested coverage is applicable',
          'The claim amount falls within the policy limits',
          'All required documentation has been provided',
        ],
        clauses: [
          'Section 3.2: Coverage for medical procedures and treatments',
          'Section 5.1: Maximum coverage limit of $100,000 per year',
        ],
      };
      setQueryResult(mockResult);
      addToHistory(queryText, mockResult);
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
        <h2 className={`text-2xl font-semibold mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
          Query Documents
        </h2>
        <p className={darkMode ? 'text-gray-400' : 'text-gray-600'}>
          Ask questions about your uploaded documents
        </p>
      </div>
      <div className="space-y-4">
        <div>
          <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
            Enter your query
          </label>
          <textarea
            value={queryText}
            onChange={e => setQueryText(e.target.value)}
            placeholder="E.g., Does this policy cover surgery expenses?"
            rows={4}
            className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
              darkMode
                ? 'bg-gray-800 border-gray-600 text-white placeholder-gray-500'
                : 'border-gray-300'
            }`}
          />
        </div>
        <button
          onClick={handleSubmit}
          disabled={isLoading}
          className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Processing...' : 'Submit Query'}
        </button>
      </div>

      {queryResult && (
        <div className="space-y-6 mt-8">
          <h2 className={`text-2xl font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            Query Results
          </h2>
          <div
            className={`rounded-lg border p-6 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}
          >
            <div className="flex items-start space-x-4">
              <div
                className={
                  queryResult.decision?.toLowerCase().includes('approve')
                    ? 'text-green-500'
                    : 'text-red-500'
                }
              >
                {queryResult.decision?.toLowerCase().includes('approve') ? (
                  <CheckCircle className="w-8 h-8" />
                ) : (
                  <XCircle className="w-8 h-8" />
                )}
              </div>
              <div className="flex-1">
                <div className="flex items-center space-x-3 mb-2">
                  <h3 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                    Decision
                  </h3>
                  <span
                    className={`px-3 py-1 rounded-full text-sm font-medium ${
                      queryResult.decision?.toLowerCase().includes('approve')
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {queryResult.decision?.toLowerCase().includes('approve')
                      ? 'Approved'
                      : 'Rejected'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {queryResult.justification && (
            <div
              className={`rounded-lg border p-6 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}
            >
              <h3 className={`text-lg font-semibold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                Justification
              </h3>
              <div className="space-y-2">
                {Array.isArray(queryResult.justification) ? (
                  <ul className="list-disc list-inside space-y-2">
                    {queryResult.justification.map((item, idx) => (
                      <li key={idx} className={darkMode ? 'text-gray-300' : 'text-gray-700'}>
                        {item}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={darkMode ? 'text-gray-300' : 'text-gray-700'}>
                    {queryResult.justification}
                  </p>
                )}
              </div>
            </div>
          )}

          {queryResult.clauses && queryResult.clauses.length > 0 && (
            <div
              className={`rounded-lg border p-6 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}
            >
              <h3 className={`text-lg font-semibold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                Referenced Clauses
              </h3>
              <div className="space-y-3">
                {queryResult.clauses.map((clause, idx) => (
                  <div
                    key={idx}
                    className={`border-l-4 p-4 rounded ${
                      darkMode
                        ? 'bg-yellow-900 border-yellow-600 text-gray-200'
                        : 'bg-yellow-50 border-yellow-400 text-gray-800'
                    }`}
                  >
                    <p>{clause}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
