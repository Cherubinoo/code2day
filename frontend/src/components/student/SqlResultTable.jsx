import React from 'react';

const SqlResultTable = ({ data }) => {
  if (!data || !data.columns || !data.rows) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-slate-400 bg-slate-900/50 rounded-xl border border-slate-800">
        <div className="w-12 h-12 mb-3 bg-slate-800 rounded-full flex items-center justify-center">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
          </svg>
        </div>
        <p className="text-sm font-medium">No results to display</p>
        <p className="text-xs mt-1">Execute a query to see the data</p>
      </div>
    );
  }

  return (
    <div className="w-full overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
      <div className="overflow-x-auto custom-scrollbar">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-800/50 border-b border-slate-700">
              {data.columns.map((col, idx) => (
                <th 
                  key={idx} 
                  className="px-4 py-3 text-xs font-semibold text-slate-300 uppercase tracking-wider"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {data.rows.length === 0 ? (
              <tr>
                <td 
                  colSpan={data.columns.length} 
                  className="px-4 py-8 text-center text-slate-500 text-sm italic"
                >
                  Empty result set
                </td>
              </tr>
            ) : (
              data.rows.map((row, rowIdx) => (
                <tr 
                  key={rowIdx} 
                  className="hover:bg-white/5 transition-colors group"
                >
                  {row.map((val, colIdx) => (
                    <td 
                      key={colIdx} 
                      className="px-4 py-2.5 text-sm text-slate-300 font-mono whitespace-nowrap"
                    >
                      {val === null || val === "" ? (
                        <span className="text-slate-600 italic">null</span>
                      ) : (
                        val
                      )}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-2 bg-slate-800/30 border-t border-slate-800 flex justify-between items-center">
        <span className="text-xs font-medium text-slate-400">
          {data.count} {data.count === 1 ? 'row' : 'rows'} returned
        </span>
        <div className="flex gap-2">
          {/* Optional: Add export buttons here later */}
        </div>
      </div>
    </div>
  );
};

export default SqlResultTable;
