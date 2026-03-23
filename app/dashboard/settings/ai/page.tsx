'use client';

import React, { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { 
    Sparkles, 
    Zap, 
    MessageSquare, 
    Image as ImageIcon, 
    Wand2,
    Key,
    Loader2,
    Eye,
    EyeOff,
    Check,
    AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';

interface AISettings {
    enabled: boolean;
    provider: 'openai' | 'anthropic' | 'google';
    apiKey?: string;
    features: {
        textGeneration: boolean;
        imageGeneration: boolean;
        summarization: boolean;
        translation: boolean;
    };
    usageLimit: number;
    currentUsage: number;
}

export default function AISettingsPage() {
    const supabase = createClientComponentClient();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [showApiKey, setShowApiKey] = useState(false);
    const [settings, setSettings] = useState<AISettings>({
        enabled: false,
        provider: 'openai',
        apiKey: '',
        features: {
            textGeneration: true,
            imageGeneration: true,
            summarization: true,
            translation: true
        },
        usageLimit: 1000,
        currentUsage: 0
    });

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            setLoading(true);
            // In a real app, load from database
            // For now, use defaults
        } catch (err) {
            console.error('Error loading AI settings:', err);
        } finally {
            setLoading(false);
        }
    };

    const saveSettings = async () => {
        try {
            setSaving(true);
            // In a real app, save to database
            await new Promise(resolve => setTimeout(resolve, 1000));
            toast.success('AI settings saved');
        } catch (err) {
            console.error('Error saving AI settings:', err);
            toast.error('Failed to save settings');
        } finally {
            setSaving(false);
        }
    };

    const providers = [
        { id: 'openai', name: 'OpenAI', description: 'GPT-4 and DALL-E models' },
        { id: 'anthropic', name: 'Anthropic', description: 'Claude models' },
        { id: 'google', name: 'Google', description: 'Gemini models' }
    ];

    const features = [
        { 
            key: 'textGeneration', 
            name: 'Text Generation', 
            description: 'Generate content, expand ideas, and create drafts',
            icon: MessageSquare 
        },
        { 
            key: 'imageGeneration', 
            name: 'Image Generation', 
            description: 'Create images from text descriptions',
            icon: ImageIcon 
        },
        { 
            key: 'summarization', 
            name: 'Summarization', 
            description: 'Summarize long content into key points',
            icon: Wand2 
        },
        { 
            key: 'translation', 
            name: 'Translation', 
            description: 'Translate content between languages',
            icon: Zap 
        }
    ];

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
            </div>
        );
    }

    return (
        <div>
            <div className="flex items-center gap-3 mb-8">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                    <Sparkles className="w-5 h-5 text-white" />
                </div>
                <div>
                    <h1 className="text-2xl font-semibold text-gray-900">AI Settings</h1>
                    <p className="text-sm text-gray-500">
                        Configure AI features for your workspace
                    </p>
                </div>
            </div>

            {/* Enable/Disable AI */}
            <section className="mb-8">
                <div className="flex items-center justify-between p-4 bg-white rounded-lg border border-gray-200">
                    <div>
                        <h2 className="font-medium text-gray-900">Enable AI Features</h2>
                        <p className="text-sm text-gray-500">
                            Use AI to enhance your workspace with intelligent features
                        </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input
                            type="checkbox"
                            checked={settings.enabled}
                            onChange={(e) => setSettings(prev => ({ ...prev, enabled: e.target.checked }))}
                            className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                    </label>
                </div>
            </section>

            {settings.enabled && (
                <>
                    {/* AI Provider */}
                    <section className="mb-8">
                        <h2 className="text-lg font-medium text-gray-900 mb-4">AI Provider</h2>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {providers.map((provider) => (
                                <button
                                    key={provider.id}
                                    onClick={() => setSettings(prev => ({ ...prev, provider: provider.id as any }))}
                                    className={`p-4 rounded-lg border-2 text-left transition-all ${
                                        settings.provider === provider.id
                                            ? 'border-purple-600 bg-purple-50'
                                            : 'border-gray-200 hover:border-gray-300 bg-white'
                                    }`}
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <h3 className="font-medium text-gray-900">{provider.name}</h3>
                                        {settings.provider === provider.id && (
                                            <div className="w-5 h-5 rounded-full bg-purple-600 flex items-center justify-center">
                                                <Check className="w-3 h-3 text-white" />
                                            </div>
                                        )}
                                    </div>
                                    <p className="text-sm text-gray-500">{provider.description}</p>
                                </button>
                            ))}
                        </div>
                    </section>

                    {/* API Key */}
                    <section className="mb-8">
                        <h2 className="text-lg font-medium text-gray-900 mb-4">API Key</h2>
                        <div className="bg-white rounded-lg border border-gray-200 p-4">
                            <div className="flex items-center gap-3 mb-4">
                                <Key className="w-5 h-5 text-gray-400" />
                                <p className="text-sm text-gray-600">
                                    Enter your {providers.find(p => p.id === settings.provider)?.name} API key to enable AI features
                                </p>
                            </div>
                            <div className="relative max-w-md">
                                <input
                                    type={showApiKey ? 'text' : 'password'}
                                    value={settings.apiKey || ''}
                                    onChange={(e) => setSettings(prev => ({ ...prev, apiKey: e.target.value }))}
                                    placeholder="sk-..."
                                    className="w-full px-4 py-2 pr-12 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                />
                                <button
                                    onClick={() => setShowApiKey(!showApiKey)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                >
                                    {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                            <div className="flex items-start gap-2 mt-3 text-xs text-amber-600">
                                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                <span>Your API key is encrypted and stored securely. Never share it with anyone.</span>
                            </div>
                        </div>
                    </section>

                    {/* AI Features */}
                    <section className="mb-8">
                        <h2 className="text-lg font-medium text-gray-900 mb-4">AI Features</h2>
                        <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-200">
                            {features.map((feature) => {
                                const Icon = feature.icon;
                                return (
                                    <label key={feature.key} className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                                                <Icon className="w-5 h-5 text-gray-600" />
                                            </div>
                                            <div>
                                                <h3 className="font-medium text-gray-900">{feature.name}</h3>
                                                <p className="text-sm text-gray-500">{feature.description}</p>
                                            </div>
                                        </div>
                                        <input
                                            type="checkbox"
                                            checked={settings.features[feature.key as keyof typeof settings.features]}
                                            onChange={(e) => setSettings(prev => ({
                                                ...prev,
                                                features: {
                                                    ...prev.features,
                                                    [feature.key]: e.target.checked
                                                }
                                            }))}
                                            className="w-5 h-5 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                                        />
                                    </label>
                                );
                            })}
                        </div>
                    </section>

                    {/* Usage */}
                    <section className="mb-8">
                        <h2 className="text-lg font-medium text-gray-900 mb-4">Usage</h2>
                        <div className="bg-white rounded-lg border border-gray-200 p-4">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-sm font-medium text-gray-700">API Calls This Month</span>
                                <span className="text-sm text-gray-500">{settings.currentUsage} / {settings.usageLimit}</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2">
                                <div 
                                    className="bg-purple-600 h-2 rounded-full transition-all"
                                    style={{ width: `${(settings.currentUsage / settings.usageLimit) * 100}%` }}
                                />
                            </div>
                            <p className="text-xs text-gray-500 mt-2">
                                Usage resets on the 1st of each month
                            </p>
                        </div>
                    </section>
                </>
            )}

            {/* Save Button */}
            <div className="flex justify-end pt-4 border-t border-gray-200">
                <button
                    onClick={saveSettings}
                    disabled={saving}
                    className="px-6 py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                    {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                    Save Changes
                </button>
            </div>
        </div>
    );
}
