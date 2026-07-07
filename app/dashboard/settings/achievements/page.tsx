'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Loader2, Trophy, Star } from 'lucide-react';
import { createUserAchievementsRepository } from '@/lib/infra/achievements/userAchievementsRepository';
import { getCurrentUserId } from '@/lib/infra/supabase/currentUser';

interface Belt {
    id: string;
    name: string;
    color: string;
    bgColor: string;
    borderColor: string;
    points: number;
    icon: string;
}

const BELTS: Belt[] = [
    { id: 'yellow', name: 'Yellow', color: '#eab308', bgColor: 'bg-yellow-100', borderColor: 'border-yellow-300', points: 1000, icon: '🥋' },
    { id: 'green', name: 'Green', color: '#22c55e', bgColor: 'bg-green-100', borderColor: 'border-green-300', points: 5000, icon: '🥋' },
    { id: 'blue', name: 'Blue', color: '#3b82f6', bgColor: 'bg-blue-100', borderColor: 'border-blue-300', points: 15000, icon: '🥋' },
    { id: 'red', name: 'Red', color: '#ef4444', bgColor: 'bg-red-100', borderColor: 'border-red-300', points: 50000, icon: '🥋' },
    { id: 'black', name: 'Black', color: '#1f2937', bgColor: 'bg-gray-800', borderColor: 'border-gray-600', points: 100000, icon: '🥋' },
];

export default function AchievementsPage() {
    const repository = useMemo(() => createUserAchievementsRepository(), []);
    const [loading, setLoading] = useState(true);
    const [currentPoints, setCurrentPoints] = useState(0);
    const [currentBeltIndex, setCurrentBeltIndex] = useState(-1);

    useEffect(() => {
        loadAchievements();
    }, []);

    const loadAchievements = async () => {
        try {
            setLoading(true);
            const userIdResult = await getCurrentUserId();
            if (!userIdResult.ok) throw userIdResult.error;
            if (!userIdResult.value) return;

            // Try to load achievements from database
            const achievementsResult = await repository.load(userIdResult.value);
            if (achievementsResult.ok && achievementsResult.value) {
                setCurrentPoints(achievementsResult.value.points);
            }

            // Calculate current belt
            const beltIndex = BELTS.findIndex(belt => currentPoints < belt.points) - 1;
            setCurrentBeltIndex(beltIndex);
        } catch (err) {
            console.error('Error loading achievements:', err);
        } finally {
            setLoading(false);
        }
    };

    const getNextBelt = () => {
        if (currentBeltIndex < BELTS.length - 1) {
            return BELTS[currentBeltIndex + 1];
        }
        return null;
    };

    const getProgressToNextBelt = () => {
        const nextBelt = getNextBelt();
        if (!nextBelt) return 100;
        
        const previousPoints = currentBeltIndex >= 0 ? BELTS[currentBeltIndex].points : 0;
        const pointsNeeded = nextBelt.points - previousPoints;
        const pointsEarned = currentPoints - previousPoints;
        
        return Math.min(100, Math.max(0, (pointsEarned / pointsNeeded) * 100));
    };

    const getBeltStatus = (beltIndex: number) => {
        if (beltIndex < currentBeltIndex + 1) return 'earned';
        if (beltIndex === currentBeltIndex + 1) return 'pursuing';
        return 'aspiring';
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
            </div>
        );
    }

    const nextBelt = getNextBelt();
    const pointsToNextBelt = nextBelt ? nextBelt.points - currentPoints : 0;

    return (
        <div>
            {/* Header */}
            <div className="mb-6">
                <h1 className="text-2xl font-semibold text-gray-900">Achievements</h1>
            </div>

            {/* Current Belt Section */}
            <div className="mb-8">
                <h2 className="text-sm font-medium text-gray-600 mb-4">Current belt</h2>
                <div className="relative bg-gradient-to-r from-gray-100 to-gray-50 rounded-xl overflow-hidden h-48">
                    {/* Background Pattern */}
                    <div className="absolute inset-0 opacity-10">
                        <div className="grid grid-cols-12 gap-4 p-4">
                            {Array.from({ length: 36 }).map((_, i) => (
                                <div key={i} className="w-8 h-8 rounded-full bg-gray-400" />
                            ))}
                        </div>
                    </div>
                    
                    {/* Content */}
                    <div className="absolute inset-0 flex items-center justify-center">
                        {currentBeltIndex >= 0 ? (
                            <div className="text-center">
                                <div 
                                    className="w-16 h-16 rounded-lg mx-auto mb-3 flex items-center justify-center text-3xl"
                                    style={{ backgroundColor: BELTS[currentBeltIndex].color }}
                                >
                                    <Trophy className="w-8 h-8 text-white" />
                                </div>
                                <p className="text-lg font-semibold text-gray-800">
                                    {BELTS[currentBeltIndex].name} Belt
                                </p>
                            </div>
                        ) : (
                            <p className="text-gray-600">
                                Earn your first belt by{' '}
                                <a href="/dashboard" className="text-purple-600 underline">creating a scene</a>
                                {' '}and sharing it with others.
                            </p>
                        )}
                    </div>
                </div>
            </div>

            {/* Progress Section */}
            <div className="mb-8">
                <h2 className="text-sm font-medium text-gray-600 mb-4">2026 belt progress</h2>
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                    {/* Progress Message */}
                    <div className="mb-6">
                        {currentBeltIndex < 0 ? (
                            <>
                                <h3 className="text-lg font-semibold text-gray-900">
                                    You don't have a belt yet, but your journey is about to begin.
                                </h3>
                                <p className="text-gray-500 mt-1">
                                    You are {pointsToNextBelt.toLocaleString()} creativity and collaboration points away from the next rank - {nextBelt?.name} Belt
                                </p>
                            </>
                        ) : currentBeltIndex === BELTS.length - 1 ? (
                            <>
                                <h3 className="text-lg font-semibold text-gray-900">
                                    🎉 Congratulations! You've achieved the highest rank!
                                </h3>
                                <p className="text-gray-500 mt-1">
                                    You are a Black Belt master with {currentPoints.toLocaleString()} points
                                </p>
                            </>
                        ) : (
                            <>
                                <h3 className="text-lg font-semibold text-gray-900">
                                    Keep going! You're making great progress.
                                </h3>
                                <p className="text-gray-500 mt-1">
                                    You are {pointsToNextBelt.toLocaleString()} creativity and collaboration points away from the next rank - {nextBelt?.name} Belt
                                </p>
                            </>
                        )}
                    </div>

                    {/* Belt Progress Cards */}
                    <div className="grid grid-cols-5 gap-4">
                        {BELTS.map((belt, index) => {
                            const status = getBeltStatus(index);
                            const isPursuing = status === 'pursuing';
                            
                            return (
                                <div
                                    key={belt.id}
                                    className={`rounded-xl p-4 text-center border-2 transition-all ${
                                        isPursuing
                                            ? `${belt.bgColor} ${belt.borderColor}`
                                            : status === 'earned'
                                            ? 'bg-gray-50 border-gray-200'
                                            : 'bg-white border-gray-100'
                                    }`}
                                >
                                    {/* Belt Icon */}
                                    <div className="flex justify-center mb-2">
                                        <div 
                                            className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                                                status === 'earned' ? 'opacity-100' : 'opacity-60'
                                            }`}
                                            style={{ 
                                                backgroundColor: status === 'aspiring' ? '#e5e7eb' : belt.color,
                                                color: belt.id === 'black' ? '#fff' : belt.color === '#eab308' ? '#713f12' : '#fff'
                                            }}
                                        >
                                            <Trophy className={`w-5 h-5 ${
                                                status === 'aspiring' ? 'text-gray-400' : 'text-white'
                                            }`} />
                                        </div>
                                    </div>
                                    
                                    {/* Belt Name */}
                                    <p className={`font-semibold ${
                                        isPursuing ? 'text-gray-900' : 'text-gray-600'
                                    }`}>
                                        {belt.name}
                                    </p>
                                    
                                    {/* Status */}
                                    <div className="flex items-center justify-center gap-1 mt-1">
                                        {status === 'pursuing' && (
                                            <>
                                                <span className="text-xs">▲</span>
                                                <span className="text-xs text-gray-600">Pursuing</span>
                                            </>
                                        )}
                                        {status === 'earned' && (
                                            <>
                                                <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                                                <span className="text-xs text-gray-600">Earned</span>
                                            </>
                                        )}
                                        {status === 'aspiring' && (
                                            <>
                                                <div className="w-2 h-2 rounded-full bg-gray-300" />
                                                <span className="text-xs text-gray-400">Aspiring</span>
                                            </>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Points Info */}
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                <h3 className="font-medium text-purple-800 mb-2">How to earn points</h3>
                <ul className="text-sm text-purple-700 space-y-1 list-disc list-inside">
                    <li>Create new scenes (+100 points)</li>
                    <li>Share scenes with others (+50 points)</li>
                    <li>Receive reactions on your posts (+10 points)</li>
                    <li>Collaborate with team members (+25 points)</li>
                    <li>Complete your profile (+50 points)</li>
                </ul>
            </div>
        </div>
    );
}
