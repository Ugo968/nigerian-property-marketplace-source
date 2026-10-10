export default function Loading() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-6">
        {/* Your logo with a subtle pulse animation */}
        <div className="animate-pulse">
          <img
            src="/logo.png"
            alt="Shelty"
            className="h-16 w-auto"
          />
        </div>

        {/* Loading spinner */}
        <div className="flex items-center gap-2">
          <div className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:-0.3s]"></div>
          <div className="h-2 w-2 animate-bounce rounded-full bg-primary [animation-delay:-0.15s]"></div>
          <div className="h-2 w-2 animate-bounce rounded-full bg-primary"></div>
        </div>

        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}