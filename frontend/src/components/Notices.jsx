/** Yellow info box listing messages from the server (e.g. items removed for stock reasons). */
export default function Notices({ notices }) {
  if (!notices?.length) return null
  return (
    <div role="status" className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
      <ul className="list-disc space-y-1 pl-5">
        {notices.map((notice) => (
          <li key={notice}>{notice}</li>
        ))}
      </ul>
    </div>
  )
}
