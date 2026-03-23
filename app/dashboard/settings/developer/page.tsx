'use client';

import React from 'react';
import { ExternalLink, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export default function DeveloperPage() {
    return (
        <div>
            {/* Header */}
            <div className="mb-6">
                <h1 className="text-2xl font-semibold text-gray-900">Developer</h1>
            </div>

            {/* API Access Notice */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-6 flex items-center justify-between">
                <div>
                    <div className="font-semibold text-amber-800">API only available for paid accounts</div>
                    <div className="text-sm text-amber-700 mt-1">
                        Please upgrade to our Gold or Platinum tiers to access this feature.
                    </div>
                </div>
                <Link
                    href="/dashboard/settings/billing"
                    className="px-6 py-2 bg-orange-500 text-white rounded-lg font-medium hover:bg-orange-600 transition-colors"
                >
                    Upgrade
                </Link>
            </div>

            {/* Resources Section */}
            <div className="mb-2">
                <h2 className="text-sm font-semibold text-gray-900">Resources</h2>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden divide-y divide-gray-100">
                {/* API Documentation */}
                <a 
                    href="https://docs.example.com/api" 
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                >
                    <span className="font-medium text-purple-600">API documentation</span>
                    <ExternalLink className="w-4 h-4 text-gray-400" />
                </a>

                {/* Discord */}
                <a 
                    href="https://discord.gg/example" 
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                >
                    <span className="font-medium text-purple-600">Connect on Discord</span>
                    <ExternalLink className="w-4 h-4 text-gray-400" />
                </a>
            </div>

            {/* API Features Info */}
            <div className="mt-8 p-6 bg-gray-50 border border-gray-200 rounded-xl">
                <h3 className="font-semibold text-gray-900 mb-4">What you can do with the API</h3>
                <ul className="space-y-3">
                    <li className="flex items-start gap-3">
                        <ArrowRight className="w-5 h-5 text-purple-500 flex-shrink-0 mt-0.5" />
                        <div>
                            <div className="font-medium text-gray-800">Create & manage scenes programmatically</div>
                            <div className="text-sm text-gray-500">Automate scene creation from your applications</div>
                        </div>
                    </li>
                    <li className="flex items-start gap-3">
                        <ArrowRight className="w-5 h-5 text-purple-500 flex-shrink-0 mt-0.5" />
                        <div>
                            <div className="font-medium text-gray-800">Embed scenes in custom applications</div>
                            <div className="text-sm text-gray-500">Integrate collaborative canvases into your products</div>
                        </div>
                    </li>
                    <li className="flex items-start gap-3">
                        <ArrowRight className="w-5 h-5 text-purple-500 flex-shrink-0 mt-0.5" />
                        <div>
                            <div className="font-medium text-gray-800">Sync data with external systems</div>
                            <div className="text-sm text-gray-500">Connect to your existing workflow tools</div>
                        </div>
                    </li>
                    <li className="flex items-start gap-3">
                        <ArrowRight className="w-5 h-5 text-purple-500 flex-shrink-0 mt-0.5" />
                        <div>
                            <div className="font-medium text-gray-800">Webhooks for real-time updates</div>
                            <div className="text-sm text-gray-500">Get notified when changes happen in your workspace</div>
                        </div>
                    </li>
                </ul>
            </div>
        </div>
    );
}
