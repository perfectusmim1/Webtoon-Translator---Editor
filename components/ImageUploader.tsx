import React, { useRef, useState } from 'react';
import { Upload, Image as ImageIcon, ArrowRight } from 'lucide-react';
import { UploadedImage } from '../types';

interface ImageUploaderProps {
  onImageReady: (img: UploadedImage) => void;
}

const ImageUploader: React.FC<ImageUploaderProps> = ({ onImageReady }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFile = (file: File) => {
    if (!file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        onImageReady({
          id: Date.now().toString(),
          url: e.target?.result as string,
          width: img.width,
          height: img.height,
          file: file
        });
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  return (
    <div className="max-w-3xl w-full mx-auto p-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="text-center mb-10">
        <h2 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-blue-400 via-cyan-400 to-teal-300 bg-clip-text text-transparent mb-4 pb-1">
            Webtoon & Manga Translator
        </h2>
        <p className="text-zinc-400 text-lg max-w-xl mx-auto">
            Upload your page, let AI scan it, and read in your language instantly.
        </p>
      </div>

      <div className="bg-zinc-900/50 backdrop-blur-sm border border-zinc-800 rounded-2xl p-1 shadow-2xl mb-12">
        <div className="bg-zinc-900 rounded-xl overflow-hidden">
            {/* Drop Zone */}
            <div 
                className={`relative h-64 border-2 border-dashed rounded-xl m-4 flex flex-col items-center justify-center transition-all cursor-pointer group
                    ${isDragging ? 'border-blue-500 bg-blue-500/10' : 'border-zinc-700 hover:border-blue-500/50 hover:bg-zinc-800/50'}`}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
            >
                <input 
                    type="file" 
                    ref={fileInputRef} 
                    className="hidden" 
                    accept="image/*"
                    onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                />
                
                <div className="w-16 h-16 bg-zinc-800 group-hover:bg-zinc-700 rounded-full flex items-center justify-center mb-4 shadow-inner transition-colors">
                    <Upload className={`text-zinc-400 group-hover:text-blue-400 transition-colors ${isDragging ? 'text-blue-400' : ''}`} size={32} />
                </div>
                <p className="text-zinc-300 font-medium text-lg">Click to upload or drag & drop</p>
                <p className="text-zinc-500 text-sm mt-2">Supports PNG, JPG, WEBP</p>
            </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <FeatureCard 
            icon={<ImageIcon className="text-blue-400" />}
            title="Smart OCR"
            desc="Detects speech bubbles automatically using Gemini Vision."
        />
        <FeatureCard 
            icon={<Upload className="text-cyan-400" />}
            title="In-Painting"
            desc="Overlays clean colored bubbles matching the original style."
        />
        <FeatureCard 
            icon={<ArrowRight className="text-teal-400" />}
            title="Manual Control"
            desc="Draw specific boxes to re-translate tricky areas."
        />
      </div>
    </div>
  );
};

const FeatureCard = ({ icon, title, desc }: { icon: React.ReactNode, title: string, desc: string }) => (
    <div className="bg-zinc-900/30 border border-zinc-800/50 p-5 rounded-xl hover:bg-zinc-900/60 transition-colors">
        <div className="mb-3 bg-zinc-900/50 w-fit p-2 rounded-lg">{icon}</div>
        <h3 className="text-zinc-200 font-semibold mb-1">{title}</h3>
        <p className="text-zinc-500 text-sm leading-relaxed">{desc}</p>
    </div>
);

export default ImageUploader;