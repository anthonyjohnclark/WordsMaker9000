// app/components/Loader.tsx
const Loader = () => {
  return (
    <div className="flex items-center justify-center space-x-2 h-full">
      <div
        className="w-2 h-2 rounded-full animate-bounce"
        style={{ background: "var(--accent)" }}
      ></div>
      <div
        className="w-2 h-2 rounded-full animate-bounce delay-200"
        style={{ background: "var(--accent)" }}
      ></div>
      <div
        className="w-2 h-2 rounded-full animate-bounce delay-400"
        style={{ background: "var(--accent)" }}
      ></div>
    </div>
  );
};

export default Loader;
