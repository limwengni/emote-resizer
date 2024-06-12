import React from 'react';
import './output.css';
import Header from './components/Header';
import PlatformSelector from './components/PlatformSelector';
import FileUploader from './components/FileUploader';

function App() {
  return (
    <div className="min-h-screen bg-zinc-800">
      <Header />
      <main className="container mx-auto px-72">
        <FileUploader />
      </main>
    </div>
  );
}

export default App;
