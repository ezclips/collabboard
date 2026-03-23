import PostCardContent from '@/components/collabboard/PostCardContent';

export function GridLayoutRenderer({ padlets }: any) {
  return (
    <div className="p-6">
      <h2 className="text-xl font-bold mb-4">Grid Layout</h2>
      <div className="grid grid-cols-3 gap-4">
        {padlets.map((padlet: any) => (
          <div key={padlet.id} className="bg-white p-4 rounded border">
            <PostCardContent padlet={padlet} />
          </div>
        ))}
      </div>
    </div>
  );
}
