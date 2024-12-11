// app/components/Loader.tsx
const Loader = () => {
  return (
    <div className="flex items-center justify-center space-x-2 h-full">
      <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></div>
      <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce delay-200"></div>
      <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce delay-400"></div>
    </div>
  );
};

export default Loader;
