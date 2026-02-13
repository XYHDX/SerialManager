import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import SearchSerial from './components/SearchSerial';
import AddSerial from './components/AddSerial';
import UploadReceipts from './components/UploadReceipts';
import DataManagement from './components/DataManagement';
import './index.css';

function App() {
  const [serials, setSerials] = useState([]);
  const [activeTab, setActiveTab] = useState('search');

  // Load serials from API on mount and when changed
  const fetchSerials = async () => {
    try {
      const res = await fetch('/api/serials');
      if (res.ok) {
        const data = await res.json();
        setSerials(data);
      }
    } catch (err) {
      console.error('Failed to load serials:', err);
    }
  };

  useEffect(() => {
    fetchSerials();
  }, []);

  const addSerials = (newSerialsList) => {
    // Determine unique locally for immediate feedback
    const uniqueNew = newSerialsList.filter(s => !serials.includes(s));
    const duplicates = newSerialsList.length - uniqueNew.length;

    if (uniqueNew.length > 0) {
      setSerials(prev => [...prev, ...uniqueNew]);
      // Note: Data persistence for manual entry is currently client-side only 
      // until a reload fetches fresh data, unless we add a POST endpoint for manual entry.
      // But for this task scope, let's assume the user uses Import/OCR primarily.
    }

    return {
      added: uniqueNew.length,
      duplicates: duplicates,
      total: serials.length + uniqueNew.length
    };
  };

  const checkSerial = (query) => {
    return serials.includes(query);
  };

  return (
    <div className="container fade-in">
      <Header />

      <div className="tabs">
        <button
          className={`tab ${activeTab === 'search' ? 'active' : ''}`}
          onClick={() => setActiveTab('search')}
        >
          Search Database
        </button>
        <button
          className={`tab ${activeTab === 'add' ? 'active' : ''}`}
          onClick={() => setActiveTab('add')}
        >
          Add New Entry
        </button>
        <button
          className={`tab ${activeTab === 'upload' ? 'active' : ''}`}
          onClick={() => setActiveTab('upload')}
        >
          Upload Receipts
        </button>
        <button
          className={`tab ${activeTab === 'data' ? 'active' : ''}`}
          onClick={() => setActiveTab('data')}
        >
          Manage Data
        </button>
      </div>

      <main>
        {activeTab === 'search' && (
          <SearchSerial onCheck={checkSerial} serials={serials} />
        )}
        {activeTab === 'add' && (
          <AddSerial onAddBatch={addSerials} />
        )}
        {activeTab === 'upload' && (
          <UploadReceipts onUploadComplete={fetchSerials} />
        )}
        {activeTab === 'data' && (
          <DataManagement onDataChanged={fetchSerials} />
        )}
      </main>

      <footer className="serial-count">
        Total Records: {serials.length}
      </footer>
    </div>
  );
}

export default App;
