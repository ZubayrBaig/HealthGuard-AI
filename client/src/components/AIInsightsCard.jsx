import { Sparkles, AlertTriangle, Clock, CheckCircle2, RefreshCw } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const LIKELIHOOD_STYLES = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-green-100 text-green-700',
};

const CONFIDENCE_STYLES = {
  high: 'bg-green-100 text-green-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-gray-100 text-gray-500',
};

export default function AIInsightsCard({ aiPrediction, loading, analyzedAt, onRefresh, cached }) {
  const predictions = aiPrediction?.predictions || [];
  const recommendations = aiPrediction?.recommendations || [];
  const confidence = aiPrediction?.confidence || 'low';
  const hasMeaningfulData = predictions.length > 0 || (recommendations.length > 0 && recommendations[0] !== 'Unable to generate AI predictions at this time.');

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-purple-100 text-purple-600">
            <Sparkles className="h-4 w-4" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900">AI Health Insights</h3>
        </div>
        {!loading && hasMeaningfulData && (
          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${CONFIDENCE_STYLES[confidence]}`}>
            {confidence} confidence
          </span>
        )}
      </div>

      {/* Loading state — shimmer animation */}
      {loading && (
        <div className="space-y-3">
          <div className="h-4 rounded animate-shimmer w-3/4" />
          <div className="h-4 rounded animate-shimmer w-full" />
          <div className="h-4 rounded animate-shimmer w-2/3" />
          <p className="text-xs text-gray-400 mt-3 text-center">AI is analyzing your health data...</p>
        </div>
      )}

      {/* Unavailable state */}
      {!loading && !hasMeaningfulData && (
        <p className="text-sm text-gray-400 text-center py-6">
          AI analysis is currently unavailable. The rule-based risk score above is still active.
        </p>
      )}

      {/* Content */}
      {!loading && hasMeaningfulData && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Predictions */}
            {predictions.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-gray-500 mb-3">Potential Risks</h4>
                <div className="space-y-2.5">
                  {predictions.map((pred, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2.5 p-3 rounded-lg bg-gray-50"
                    >
                      <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-700 leading-snug">{pred.risk}</p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                            <Clock className="h-3 w-3" />
                            {pred.timeframe}
                          </span>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${LIKELIHOOD_STYLES[pred.likelihood] || LIKELIHOOD_STYLES.low}`}>
                            {pred.likelihood}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recommendations */}
            {recommendations.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-gray-500 mb-3">Recommendations</h4>
                <div className="space-y-2 border-l-2 border-blue-200 pl-3">
                  {recommendations.map((rec, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-blue-400 mt-0.5 flex-shrink-0" />
                      <p className="text-sm text-gray-700 leading-snug">{rec}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer — last analyzed + refresh */}
          <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
            <span className="text-xs text-gray-400">
              {analyzedAt
                ? `Last analyzed ${formatDistanceToNow(new Date(analyzedAt), { addSuffix: true })}`
                : 'Recently analyzed'}
            </span>
            {onRefresh && (
              <button
                onClick={onRefresh}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Refresh Analysis
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
