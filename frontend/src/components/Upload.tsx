import { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { X, FileText } from 'lucide-react';

export const Upload = () => {
  const { uploadedFiles, setUploadedFiles, isLoading, setIsLoading, showToast, darkMode, addAuditEntry } = useAppContext();
  const [filePreviews, setFilePreviews] = useState<any[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const addFiles = (files: File[]) => {
    const validTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
    ];
    const validFiles = files.filter(file => validTypes.includes(file.type));
    const newFiles = validFiles.map(file => ({
      file,
      id: Math.random().toString(36).substr(2, 9),
      name: file.name,
      size: file.size,
    }));
    setFilePreviews([...filePreviews, ...newFiles]);
  };

  const handleIngest = async () => {
    if (filePreviews.length === 0) {
      showToast('Please select files to upload', 'error');
      return;
    }
    setIsLoading(true);
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1500));
      setUploadedFiles([...uploadedFiles, ...filePreviews]);
      addAuditEntry('File Upload', `Uploaded ${filePreviews.length} file(s)`);
      setFilePreviews([]);
      showToast('Files uploaded successfully!');
    } catch (error) {
      showToast('Failed to upload files', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className={`text-2xl font-semibold mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
          Upload Documents
        </h2>
        <p className={darkMode ? 'text-gray-400' : 'text-gray-600'}>
          Upload documents for analysis
        </p>
      </div>

      <div
        onDragOver={e => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={e => {
          e.preventDefault();
          setIsDragging(false);
        }}
        onDrop={e => {
          e.preventDefault();
          setIsDragging(false);
          addFiles(Array.from(e.dataTransfer.files));
        }}
        onClick={() => document.getElementById('fileInput')?.click()}
        className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors ${
          isDragging
            ? 'border-blue-500 bg-blue-50'
            : darkMode
            ? 'border-gray-600 hover:border-gray-500 bg-gray-800'
            : 'border-gray-300 hover:border-gray-400'
        }`}
      >
        <input
          id="fileInput"
          type="file"
          multiple
          accept=".pdf,.docx,.txt"
          onChange={e => addFiles(Array.from(e.target.files || []))}
          className="hidden"
        />
        <FileText className={`w-12 h-12 mx-auto mb-4 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`} />
        <p className={`font-medium mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
          {isDragging ? 'Drop files here' : 'Drag and drop files here'}
        </p>
        <p className="text-sm text-gray-500">or click to browse (PDF, DOCX, TXT)</p>
      </div>

      {filePreviews.length > 0 && (
        <div
          className={`rounded-lg border p-4 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}
        >
          <h3 className={`font-medium mb-3 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            Selected Files
          </h3>
          <div className="space-y-2">
            {filePreviews.map(file => (
              <div
                key={file.id}
                className={`flex items-center justify-between p-3 rounded-lg ${
                  darkMode ? 'bg-gray-700' : 'bg-gray-50'
                }`}
              >
                <div className="flex-1">
                  <p className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                    {file.name}
                  </p>
                  <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    {(file.size / 1024).toFixed(2)} KB
                  </p>
                </div>
                <button
                  onClick={e => {
                    e.stopPropagation();
                    setFilePreviews(filePreviews.filter(f => f.id !== file.id));
                  }}
                  className={darkMode ? 'text-gray-400 hover:text-red-400' : 'text-gray-400 hover:text-red-500'}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={handleIngest}
        disabled={isLoading || filePreviews.length === 0}
        className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
      >
        {isLoading ? 'Uploading...' : 'Upload Files'}
      </button>
    </div>
  );
};
