import { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { GitCompare } from 'lucide-react';

export const Compare = () => {
  const { uploadedFiles, darkMode } = useAppContext();
  const [selectedDoc1, setSelectedDoc1] = useState('');
  const [selectedDoc2, setSelectedDoc2] = useState('');
  const [comparisonResult, setComparisonResult] = useState<any>(null);

  const handleCompare = () => {
    if (!selectedDoc1 || !selectedDoc2) {
      return;
    }

    const doc1 = uploadedFiles.find(f => f.id === selectedDoc1);
    const doc2 = uploadedFiles.find(f => f.id === selectedDoc2);

    setComparisonResult({
      doc1: doc1?.name,
      doc2: doc2?.name,
      differences: [
        { section: 'Coverage Amount', doc1Value: '$50,000', doc2Value: '$100,000', status: 'different' },
        { section: 'Deductible', doc1Value: '$500', doc2Value: '$500', status: 'same' },
        { section: 'Premium', doc1Value: '$200/month', doc2Value: '$350/month', status: 'different' },
        { section: 'Coverage Type', doc1Value: 'Basic', doc2Value: 'Comprehensive', status: 'different' },
      ],
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className={`text-2xl font-semibold mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
          Compare Documents
        </h2>
        <p className={darkMode ? 'text-gray-400' : 'text-gray-600'}>
          Compare two documents side by side
        </p>
      </div>

      <div
        className={`rounded-lg border p-6 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}
      >
        <div className="grid grid-cols-2 gap-6">
          <div>
            <label
              className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}
            >
              Document 1
            </label>
            <select
              value={selectedDoc1}
              onChange={e => setSelectedDoc1(e.target.value)}
              className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'
              }`}
            >
              <option value="">Select a document</option>
              {uploadedFiles.map(file => (
                <option key={file.id} value={file.id}>
                  {file.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}
            >
              Document 2
            </label>
            <select
              value={selectedDoc2}
              onChange={e => setSelectedDoc2(e.target.value)}
              className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'border-gray-300'
              }`}
            >
              <option value="">Select a document</option>
              {uploadedFiles.map(file => (
                <option key={file.id} value={file.id}>
                  {file.name}
                </option>
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
        <div
          className={`rounded-lg border p-6 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}
        >
          <h3 className={`text-lg font-semibold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            Comparison: {comparisonResult.doc1} vs {comparisonResult.doc2}
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className={`border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                <tr>
                  <th
                    className={`px-4 py-3 text-left text-sm font-medium ${
                      darkMode ? 'text-gray-300' : 'text-gray-700'
                    }`}
                  >
                    Section
                  </th>
                  <th
                    className={`px-4 py-3 text-left text-sm font-medium ${
                      darkMode ? 'text-gray-300' : 'text-gray-700'
                    }`}
                  >
                    Document 1
                  </th>
                  <th
                    className={`px-4 py-3 text-left text-sm font-medium ${
                      darkMode ? 'text-gray-300' : 'text-gray-700'
                    }`}
                  >
                    Document 2
                  </th>
                  <th
                    className={`px-4 py-3 text-left text-sm font-medium ${
                      darkMode ? 'text-gray-300' : 'text-gray-700'
                    }`}
                  >
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className={`divide-y ${darkMode ? 'divide-gray-700' : 'divide-gray-200'}`}>
                {comparisonResult.differences.map((diff: any, idx: number) => (
                  <tr key={idx} className={darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-50'}>
                    <td
                      className={`px-4 py-4 text-sm font-medium ${
                        darkMode ? 'text-white' : 'text-gray-900'
                      }`}
                    >
                      {diff.section}
                    </td>
                    <td className={`px-4 py-4 text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      {diff.doc1Value}
                    </td>
                    <td className={`px-4 py-4 text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      {diff.doc2Value}
                    </td>
                    <td className="px-4 py-4 text-sm">
                      <span
                        className={`px-2 py-1 rounded text-xs font-medium ${
                          diff.status === 'same'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}
                      >
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
        <div
          className={`text-center py-12 rounded-lg border ${
            darkMode ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'
          }`}
        >
          <GitCompare className={`w-12 h-12 mx-auto mb-4 ${darkMode ? 'text-gray-600' : 'text-gray-400'}`} />
          <p className={`mt-4 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>No documents to compare</p>
          <p className={`text-sm mt-2 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
            Upload at least 2 documents to use comparison
          </p>
        </div>
      )}
    </div>
  );
};

export default Compare;
