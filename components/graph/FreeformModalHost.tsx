import React, { useReducer, useEffect } from 'react';
import { modalReducer, initialModalState, ModalAction } from '../../lib/graph/modalStateMachine';
import { toast } from 'sonner';

export const FreeformModalContext = React.createContext<React.Dispatch<ModalAction>>(() => { });

interface Props {
    children?: React.ReactNode;
}

export function FreeformModalHost({ children }: Props) {
    const [state, dispatch] = useReducer(modalReducer, initialModalState);

    // Hard reject toast if an unsupported action or invalid payload was pushed
    useEffect(() => {
        if (state.error) {
            toast.error(`Graph UI Error: ${state.error}`, { id: 'graph-modal-error' });
        }
    }, [state.error]);

    return (
        <FreeformModalContext.Provider value={dispatch}>
            {children}

            {/* Determinisic explicit modals */}
            {state.activeModal === 'EDGE_SETTINGS' && (
                <div className="fixed inset-0 z-[6000] flex items-center justify-center pointer-events-auto bg-black/10">
                    <div className="bg-white p-6 shadow-2xl rounded-xl border border-gray-200 min-w-[300px]">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="font-semibold text-gray-800">Edge Settings</h2>
                            <button
                                className="text-gray-400 hover:text-gray-600"
                                onClick={() => dispatch({ type: 'CLOSE_ALL' })}
                            >
                                ✕
                            </button>
                        </div>
                        <p className="text-sm text-gray-500 mb-6">
                            Edge ID: <span className="font-mono">{state.payload?.edgeId}</span>
                        </p>
                        <div className="flex justify-end">
                            <button
                                className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 transition"
                                onClick={() => dispatch({ type: 'CLOSE_ALL' })}
                            >
                                Done
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {state.activeModal === 'GRAPH_SETTINGS' && (
                <div className="fixed inset-0 z-[6000] flex items-center justify-center pointer-events-auto bg-black/10">
                    <div className="bg-white p-6 shadow-2xl rounded-xl border border-gray-200 min-w-[300px] pointer-events-auto">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="font-semibold text-gray-800">Graph Configuration</h2>
                            <button
                                className="text-gray-400 hover:text-gray-600"
                                onClick={() => dispatch({ type: 'CLOSE_ALL' })}
                            >
                                ✕
                            </button>
                        </div>
                        <p className="text-sm text-gray-500 mb-6">Adjust layout physics and snap settings.</p>
                        <div className="flex justify-end">
                            <button
                                className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 transition"
                                onClick={() => dispatch({ type: 'CLOSE_ALL' })}
                            >
                                Save & Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </FreeformModalContext.Provider>
    );
}
