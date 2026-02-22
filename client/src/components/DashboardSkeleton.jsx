export default function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="animate-pulse">
        <div className="h-7 w-36 bg-gray-200 rounded" />
        <div className="h-4 w-52 bg-gray-200 rounded mt-2" />
      </div>

      {/* Top row: 5 stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl p-5 border border-gray-200">
            <div className="animate-pulse space-y-3">
              <div className="flex items-center justify-between">
                <div className="h-4 w-20 bg-gray-200 rounded" />
                <div className="h-8 w-8 bg-gray-200 rounded-lg" />
              </div>
              <div className="h-8 w-24 bg-gray-200 rounded" />
              <div className="h-3 w-16 bg-gray-200 rounded" />
            </div>
          </div>
        ))}
      </div>

      {/* Middle row: gauge + chart */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-2 bg-white rounded-xl p-6 border border-gray-200">
          <div className="animate-pulse">
            <div className="h-5 w-32 bg-gray-200 rounded mb-6" />
            <div className="h-48 w-48 bg-gray-200 rounded-full mx-auto" />
            <div className="mt-6 space-y-3">
              <div className="h-4 w-full bg-gray-200 rounded" />
              <div className="h-4 w-4/5 bg-gray-200 rounded" />
              <div className="h-4 w-3/5 bg-gray-200 rounded" />
            </div>
          </div>
        </div>
        <div className="lg:col-span-3 bg-white rounded-xl p-6 border border-gray-200">
          <div className="animate-pulse">
            <div className="flex items-center justify-between mb-4">
              <div className="h-5 w-28 bg-gray-200 rounded" />
              <div className="h-8 w-24 bg-gray-200 rounded" />
            </div>
            <div className="h-72 bg-gray-200 rounded" />
          </div>
        </div>
      </div>

      {/* Bottom row: alerts */}
      <div className="bg-white rounded-xl p-6 border border-gray-200">
        <div className="animate-pulse">
          <div className="h-5 w-28 bg-gray-200 rounded mb-4" />
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-6 w-16 bg-gray-200 rounded-full" />
                <div className="h-4 w-full bg-gray-200 rounded" />
                <div className="h-4 w-24 bg-gray-200 rounded flex-shrink-0" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
