export default function StubPage({ params }: { params: { module: string } }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center">
      <h1 className="text-xl font-semibold text-text-primary capitalize">{params.module}</h1>
      <p className="text-text-muted mt-2">Bu modül yakında aktif olacak.</p>
    </div>
  );
}
