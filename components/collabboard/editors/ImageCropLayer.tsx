"use client";

import React, { useState, useRef, useEffect } from 'react';
import ReactCrop, { centerCrop, makeAspectCrop, Crop, PixelCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import {
    X,
    RotateCcw,
    RotateCw,
    Check,
    Maximize,
    Minimize
} from 'lucide-react';

interface ImageCropLayerProps {
    imageUrl: string;
    onSave: (croppedDataUrl: string) => void;
    onCancel: () => void;
}

export default function ImageCropLayer({
    imageUrl,
    onSave,
    onCancel
}: ImageCropLayerProps) {
    const [crop, setCrop] = useState<Crop>();
    const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
    const [rotation, setRotation] = useState(0);
    const [aspect, setAspect] = useState<number | undefined>(undefined);
    const imgRef = useRef<HTMLImageElement>(null);

    // Initial centering of crop
    const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
        const { width, height } = e.currentTarget;
        const initialCrop = centerCrop(
            makeAspectCrop(
                {
                    unit: '%',
                    width: 90,
                },
                aspect || 1,
                width,
                height
            ),
            width,
            height
        );
        setCrop(initialCrop);
    };

    const handleSave = async () => {
        if (!imgRef.current) return;

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const image = imgRef.current;
        const rotateRad = (rotation * Math.PI) / 180;

        // Bounding box for rotation
        const rotWidth = Math.abs(Math.cos(rotateRad) * image.naturalWidth) + Math.abs(Math.sin(rotateRad) * image.naturalHeight);
        const rotHeight = Math.abs(Math.sin(rotateRad) * image.naturalWidth) + Math.abs(Math.cos(rotateRad) * image.naturalHeight);

        if (completedCrop) {
            const scaleX = image.naturalWidth / image.width;
            const scaleY = image.naturalHeight / image.height;

            canvas.width = completedCrop.width * scaleX;
            canvas.height = completedCrop.height * scaleY;

            ctx.translate(canvas.width / 2, canvas.height / 2);
            ctx.rotate(rotateRad);
            ctx.translate(-canvas.width / 2, -canvas.height / 2);

            ctx.drawImage(
                image,
                completedCrop.x * scaleX,
                completedCrop.y * scaleY,
                completedCrop.width * scaleX,
                completedCrop.height * scaleY,
                0,
                0,
                canvas.width,
                canvas.height
            );
        } else {
            canvas.width = rotWidth;
            canvas.height = rotHeight;

            ctx.translate(canvas.width / 2, canvas.height / 2);
            ctx.rotate(rotateRad);
            ctx.translate(-image.naturalWidth / 2, -image.naturalHeight / 2);

            ctx.drawImage(image, 0, 0);
        }

        onSave(canvas.toDataURL('image/png'));
    };

    return (
        <div className="fixed inset-0 bg-black/90 z-[200] flex flex-col items-center justify-center backdrop-blur-md transition-all animate-in fade-in duration-300">
            {/* Header / Cancel Button */}
            <div className="absolute top-6 right-6 z-[210]">
                <button
                    onClick={onCancel}
                    className="p-2.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all border border-white/20 shadow-xl"
                >
                    <X className="w-6 h-6" />
                </button>
            </div>

            {/* Cropping Area */}
            <div className="relative max-w-[90vw] max-h-[75vh] flex items-center justify-center">
                <ReactCrop
                    crop={crop}
                    onChange={(c) => setCrop(c)}
                    onComplete={(c) => setCompletedCrop(c)}
                    aspect={aspect}
                    className="shadow-2xl rounded-lg overflow-hidden ring-1 ring-white/10"
                >
                    <img
                        ref={imgRef}
                        src={imageUrl}
                        crossOrigin="anonymous"
                        alt="Crop preview"
                        style={{ transform: `rotate(${rotation}deg)`, transition: 'transform 0.3s ease' }}
                        className="max-h-[70vh] object-contain"
                        onLoad={onImageLoad}
                    />
                </ReactCrop>
            </div>

            {/* Floating Toolbar */}
            <div className="fixed bottom-12 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-white/10 backdrop-blur-xl border border-white/20 p-4 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] animate-in slide-in-from-bottom-5 duration-500">
                <div className="flex items-center gap-2 border-r border-white/10 pr-4">
                    <button
                        onClick={() => setRotation(prev => (prev - 90) % 360)}
                        className="p-2.5 rounded-2xl hover:bg-white/10 text-white transition-all"
                        title="Rotate Left"
                    >
                        <RotateCcw className="w-5 h-5" />
                    </button>
                    <button
                        onClick={() => setRotation(prev => (prev + 90) % 360)}
                        className="p-2.5 rounded-2xl hover:bg-white/10 text-white transition-all"
                        title="Rotate Right"
                    >
                        <RotateCw className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex items-center gap-2 border-r border-white/10 pr-4">
                    {[
                        { label: 'Free', val: undefined },
                        { label: '1:1', val: 1 },
                        { label: '16:9', val: 16 / 9 },
                        { label: '4:3', val: 4 / 3 }
                    ].map((opt) => (
                        <button
                            key={opt.label}
                            onClick={() => setAspect(opt.val)}
                            className={`px-4 py-1.5 text-xs font-semibold rounded-xl transition-all ${aspect === opt.val ? 'bg-purple-600 text-white shadow-lg' : 'text-white/60 hover:bg-white/10 hover:text-white'}`}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>

                <div className="flex items-center gap-3 pl-2">
                    <button
                        onClick={onCancel}
                        className="px-6 py-2 text-sm font-bold text-white/70 hover:text-white transition-all"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white px-8 py-2.5 rounded-2xl font-bold shadow-xl transition-all active:scale-95"
                    >
                        <Check className="w-4 h-4" />
                        Apply
                    </button>
                </div>
            </div>
        </div>
    );
}
