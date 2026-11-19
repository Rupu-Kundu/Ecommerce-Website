export default function Loader({ label = 'Loading...' }) {
  return (
    <div role="status" className="flex flex-col items-center justify-center gap-3 py-16 text-slate-500">
      <span className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-brand-600" />
      <span className="text-sm">{label}</span>
    </div>
  )
}
