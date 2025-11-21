import React, { useState } from 'react';
import { UploadedImage } from './types';
import ImageUploader from './components/ImageUploader';
import MangaEditor from './components/MangaEditor';

function App() {
  const [currentImage, setCurrentImage] = useState<UploadedImage | null>(null);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 selection:bg-blue-500/30">
        {!currentImage ? (
            <div className="min-h-screen flex flex-col relative overflow-hidden">
                {/* Background Gradients */}
                <div className="absolute inset-0 pointer-events-none">
                    <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-900/20 rounded-full blur-[120px]" />
                    <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-cyan-900/20 rounded-full blur-[120px]" />
                </div>
                
                <main className="flex-1 flex flex-col items-center justify-center w-full p-4 z-10">
                    <ImageUploader onImageReady={setCurrentImage} />
                </main>
                
                <footer className="w-full py-6 text-center text-zinc-600 text-xs z-10">
                    Powered by Google Gemini 2.5 Flash
                </footer>
            </div>
        ) : (
            <MangaEditor 
                image={currentImage} 
                onBack={() => setCurrentImage(null)} 
            />
        )}
    </div>
  );
}

export default App;