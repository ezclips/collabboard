"use client";

import React from 'react';
import { ArrowLeft, Calculator, FunctionSquare } from 'lucide-react';
import Link from 'next/link';

export default function FormulaHelpPage() {
    const formulas = [
        {
            name: 'SUM',
            syntax: '=SUM(value1, value2, ...)',
            description: 'Calculates the sum of a list of values or cells.',
            example: '=SUM(A1, B1) or =SUM(10, 20)',
            result: '30'
        },
        {
            name: 'AVERAGE',
            syntax: '=AVERAGE(value1, value2, ...)',
            description: 'Calculates the average (arithmetic mean) of a list of values.',
            example: '=AVERAGE(A1, B1) where A1=10, B1=20',
            result: '15'
        },
        {
            name: 'MIN',
            syntax: '=MIN(value1, value2, ...)',
            description: 'Returns the minimum value in a list of arguments.',
            example: '=MIN(10, 20, 5)',
            result: '5'
        },
        {
            name: 'MAX',
            syntax: '=MAX(value1, value2, ...)',
            description: 'Returns the maximum value in a list of arguments.',
            example: '=MAX(10, 20, 5)',
            result: '20'
        },
        {
            name: 'COUNT',
            syntax: '=COUNT(value1, value2, ...)',
            description: 'Counts the number of cells that contain numbers.',
            example: '=COUNT(A1, B1, C1)',
            result: '3'
        },
        {
            name: 'IF',
            syntax: '=IF(condition, value_if_true, value_if_false)',
            description: 'Returns one value if a condition is true and another value if it\'s false.',
            example: '=IF(A1>10, "Yes", "No")',
            result: '"Yes" (if A1 is 11)'
        }
    ];

    return (
        <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto">
                {/* Header */}
                <div className="mb-8 flex items-center gap-4">
                    <Link
                        href="/"
                        className="p-2 rounded-full hover:bg-gray-200 transition-colors text-gray-600"
                        title="Back to Dashboard"
                    >
                        <ArrowLeft className="w-6 h-6" />
                    </Link>
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                            <FunctionSquare className="w-8 h-8 text-blue-600" />
                            Table Formulas
                        </h1>
                        <p className="mt-2 text-gray-600">
                            Reference guide for using formulas in your tables.
                        </p>
                    </div>
                </div>

                {/* Formula List */}
                <div className="space-y-6">
                    {formulas.map((formula) => (
                        <div key={formula.name} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow duration-200">
                            <div className="bg-gray-50/50 px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                                <h3 className="text-lg font-semibold text-blue-700 font-mono">
                                    {formula.name}
                                </h3>
                                <code className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                                    {formula.syntax}
                                </code>
                            </div>
                            <div className="p-6">
                                <p className="text-gray-700 mb-4">
                                    {formula.description}
                                </p>
                                <div className="bg-blue-50/30 rounded-lg p-4 border border-blue-100/50">
                                    <h4 className="text-xs font-semibold text-blue-800 uppercase tracking-wider mb-2 flex items-center gap-2">
                                        <Calculator className="w-3 h-3" />
                                        Example
                                    </h4>
                                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 font-mono text-sm">
                                        <span className="text-gray-800">{formula.example}</span>
                                        <span className="hidden sm:inline text-gray-400">→</span>
                                        <span className="text-green-600 font-bold">{formula.result}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Footer Tip */}
                <div className="mt-12 text-center text-sm text-gray-500">
                    <p>
                        Formulas are case-insensitive. You can type <code className="bg-gray-100 px-1 py-0.5 rounded text-gray-700">=sum()</code> or <code className="bg-gray-100 px-1 py-0.5 rounded text-gray-700">=SUM()</code>.
                    </p>
                </div>
            </div>
        </div>
    );
}
